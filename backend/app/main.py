import asyncio
import importlib.util
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field
from . import db
from .config import DATA, SOURCE_LANGUAGES, settings, translation_ready
from .pipeline import process, speak, write_subtitles
from .preferences import Preferences, public_preferences, persist_preferences
from .auth import router as auth_router, current_user, admin_user

executor = ThreadPoolExecutor(max_workers=1)
lock = threading.Lock()

@asynccontextmanager
async def lifespan(app):
    global executor
    executor = ThreadPoolExecutor(max_workers=1)
    db.init()
    yield
    executor.shutdown(wait=True)

app = FastAPI(title='AI Video Translator', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(','), allow_credentials=True, allow_methods=['GET', 'POST', 'PUT'], allow_headers=['*'])
from .billing import router as billing_router
app.include_router(auth_router)
app.include_router(billing_router)

@app.middleware('http')
async def protect_origin(request, call_next):
    origin = request.headers.get('origin')
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} and origin and origin not in settings.cors_origins.split(','):
        return JSONResponse(status_code=403, content={'detail': 'Nguồn gửi yêu cầu không được phép.'})
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response

@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Validation responses must not echo submitted API credentials.
    return JSONResponse(status_code=422, content={'detail': [{'loc': list(error['loc']), 'msg': error['msg'], 'type': error['type']} for error in exc.errors()]})

class Segment(BaseModel):
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    text: str = Field(min_length=1, max_length=5000)
    original: str = Field(default='', max_length=10000)

class Edit(BaseModel):
    segments: list[Segment] = Field(min_length=1, max_length=10000)
    voice: Literal['male', 'female']

class Preview(BaseModel):
    voice: Literal['male', 'female']
    text: str = Field(default='Xin chào! Đây là giọng đọc tiếng Việt của AI Video Translator.', min_length=1, max_length=500)


def job_or_404(id, user):
    job = db.get(id)
    if not job or job['owner_id'] != user['id']:
        raise HTTPException(404, 'Không tìm thấy video.')
    return job


def public(job):
    folder = DATA / job['id']
    job['has_output'] = (folder / 'output.mp4').exists()
    job['has_source'] = (folder / 'source').exists()
    job['has_subtitles'] = (folder / 'subtitles.srt').exists()
    job['output_current'] = bool(job['output_current'])
    job['segment_count'] = len(job['segments'])
    job.pop('source_kind', None)
    job.pop('source_url', None)
    return job

@app.get('/api/health')
def health():
    return {'ffmpeg': bool(shutil.which(settings.ffmpeg_bin)), 'whisper': importlib.util.find_spec('faster_whisper') is not None, 'translation': translation_ready(), 'tts': importlib.util.find_spec('edge_tts') is not None, 'tts_requires_internet': True, 'max_upload_mb': settings.max_upload_mb, 'max_duration_seconds': settings.max_duration_seconds}

@app.get('/api/settings')
def preferences(user=Depends(current_user)):
    return public_preferences()

@app.put('/api/settings')
def save_preferences(body: Preferences, user=Depends(admin_user)):
    with lock:
        if any(job['status'] in {'queued', 'processing'} for job in db.get()):
            raise HTTPException(409, 'Chờ video đang xử lý hoàn tất trước khi đổi cấu hình.')
        return persist_preferences(body)

@app.get('/api/jobs')
def jobs(user=Depends(current_user)):
    records = []
    for job in db.get(owner_id=user['id']):
        item = public(job)
        item.pop('segments')
        records.append(item)
    return records

@app.get('/api/jobs/{id}')
def job(id: str, user=Depends(current_user)):
    return public(job_or_404(id, user))

@app.post('/api/jobs', status_code=202)
async def upload(file: UploadFile = File(...), voice: Literal['male', 'female'] = Form('female'), source_language: str = Form('auto'), target_language: Literal['vi'] = Form('vi'), user=Depends(current_user)):
    if source_language not in SOURCE_LANGUAGES:
        await file.close()
        raise HTTPException(400, 'Ngôn ngữ gốc không được hỗ trợ.')
    suffix = (file.filename or '').rsplit('.', 1)[-1].lower()
    if suffix not in {'mp4', 'mov', 'webm'}:
        await file.close()
        raise HTTPException(400, 'Chỉ hỗ trợ MP4, MOV và WebM.')
    id = uuid.uuid4().hex
    folder = DATA / id
    folder.mkdir()
    size = 0
    try:
        with (folder / 'source').open('wb') as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > user['max_upload_mb'] * 1024 * 1024:
                    raise HTTPException(413, f"Video vượt giới hạn {user['max_upload_mb']} MB.")
                target.write(chunk)
        if not size:
            raise HTTPException(400, 'Tệp video rỗng.')
        record = {'id': id, 'name': (file.filename or 'Video')[:255], 'created': datetime.now(timezone.utc).isoformat(), 'status': 'queued', 'progress': 0, 'stage': 'Đang chờ xử lý', 'error': None, 'voice': voice, 'language': None, 'duration': None, 'segments': [], 'source_language': source_language, 'target_language': target_language, 'phase': 'upload', 'output_current': False, 'rendered_at': None}
        record['owner_id'] = user['id']
        with lock:
            db.create(record)
            executor.submit(process, id)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    finally:
        await file.close()
    return public(record)

@app.put('/api/jobs/{id}/subtitles')
def edit(id: str, body: Edit, user=Depends(current_user)):
    with lock:
        job = job_or_404(id, user)
        if job['status'] in {'queued', 'processing'}:
            raise HTTPException(409, 'Video đang được xử lý.')
        previous = 0
        for s in body.segments:
            if not s.text.strip() or s.end <= s.start or s.start < previous or s.end > (job['duration'] or 0) + 0.05:
                raise HTTPException(400, 'Thời gian phụ đề phải tăng dần, không chồng lấn và nằm trong video.')
            previous = s.end
        values = [s.model_dump() for s in body.segments]
        db.update(id, segments=values, voice=body.voice, status='edited', stage='Đã sửa • cần xuất lại', error=None, output_current=0)
        write_subtitles(DATA / id, values)
    return public(db.get(id))

@app.post('/api/jobs/{id}/retry', status_code=202)
def retry(id: str, user=Depends(current_user)):
    with lock:
        job = job_or_404(id, user)
        if job['status'] in {'queued', 'processing'}:
            raise HTTPException(409, 'Video đang được xử lý.')
        db.update(id, status='queued', progress=0, error=None, stage='Đang chờ xử lý lại', phase='upload', output_current=0)
        executor.submit(process, id)
    return public(db.get(id))

@app.post('/api/jobs/{id}/export', status_code=202)
def export(id: str, user=Depends(current_user)):
    with lock:
        job = job_or_404(id, user)
        if job['status'] in {'queued', 'processing'}:
            raise HTTPException(409, 'Video đang được xử lý.')
        if not job['segments'] or not all(s['text'].strip() for s in job['segments']):
            raise HTTPException(400, 'Cần phụ đề tiếng Việt trước khi xuất.')
        db.update(id, status='queued', progress=0, error=None, stage='Đang chờ xuất', phase='tts', output_current=0)
        executor.submit(process, id, True)
    return public(db.get(id))

@app.post('/api/voices/preview')
async def preview(body: Preview, user=Depends(current_user)):
    path = DATA / f'preview-{uuid.uuid4().hex}.mp3'
    try:
        await speak(body.text, body.voice, path)
    except Exception:
        path.unlink(missing_ok=True)
        raise HTTPException(502, 'Không kết nối được dịch vụ TTS. Kiểm tra Internet hoặc thử lại.')
    from starlette.background import BackgroundTask
    return FileResponse(path, media_type='audio/mpeg', background=BackgroundTask(path.unlink, missing_ok=True))

@app.get('/api/jobs/{id}/files/{kind}')
def download(id: str, kind: Literal['source', 'video', 'srt', 'txt'], attachment: bool = False, user=Depends(current_user)):
    job = job_or_404(id, user)
    name, mime = {'source': ('source', 'video/' + ('quicktime' if job['name'].lower().endswith('.mov') else 'webm' if job['name'].lower().endswith('.webm') else 'mp4')), 'video': ('output.mp4', 'video/mp4'), 'srt': ('subtitles.srt', 'application/x-subrip'), 'txt': ('translation.txt', 'text/plain; charset=utf-8')}[kind]
    path = DATA / id / name
    if not path.exists():
        raise HTTPException(404, 'Tệp chưa được tạo.')
    return FileResponse(path, media_type=mime, filename=(job['name'] if kind == 'source' else name) if attachment or kind in {'srt', 'txt'} else None)
