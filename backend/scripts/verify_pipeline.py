"""Opt-in real TTS/Whisper/FFmpeg check; isolated from the user's history.
Run from backend: .venv/bin/python scripts/verify_pipeline.py
Downloads the selected Whisper model if not cached. Does not call translation API.
"""
import asyncio
import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['DATA_DIR'] = tempfile.mkdtemp(prefix='ai-video-translator-verification-')
from app import db
from app.config import DATA
from app.pipeline import media_info, process, run, speak


def main():
    db.init()
    speech = DATA / 'input-speech.mp3'
    asyncio.run(speak('Xin chào. Đây là video kiểm tra hệ thống. Trí tuệ nhân tạo giúp tạo phụ đề và giọng đọc tiếng Việt.', 'female', speech))
    id = uuid.uuid4().hex
    folder = DATA / id
    folder.mkdir()
    run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=0x11182b:s=640x360:r=24','-i',str(speech),'-c:v','libx264','-c:a','aac','-shortest','-pix_fmt','yuv420p','-f','mp4',str(folder / 'source')], timeout=120)
    db.create({'id':id,'name':'KIEM-TRA-THAT-video-tieng-Viet.mp4','created':datetime.now(timezone.utc).isoformat(),'status':'queued','progress':0,'stage':'Kiểm thử riêng','error':None,'voice':'female','language':None,'duration':None,'segments':[],'source_language':'vi'})
    process(id)
    job = db.get(id)
    if job['status'] != 'done':
        raise RuntimeError(job['error'])
    for filename in ('output.mp4','subtitles.srt','translation.txt'):
        assert (folder / filename).stat().st_size > 0, filename
    assert job['segments'] and all(s['text'] for s in job['segments'])
    assert {stream['codec_type'] for stream in media_info(folder / 'output.mp4')['streams']} >= {'video','audio'}
    print(json.dumps({'status':job['status'],'language':job['language'],'duration':job['duration'],'segment_count':len(job['segments']),'output_bytes':(folder / 'output.mp4').stat().st_size,'artifact_dir':str(folder),'translation_api_called':False}, ensure_ascii=False))

if __name__ == '__main__':
    main()
