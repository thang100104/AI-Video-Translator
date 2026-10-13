import importlib
import os
import tempfile
from unittest.mock import patch

from conftest import signed_in_client
from fastapi.testclient import TestClient
from app.main import app
from app import db
from app.config import DATA
from app.pipeline import stamp, tempo_filters, write_subtitles


def test_upload_validation_and_lifecycle():
    with signed_in_client() as client, patch('app.main.executor.submit') as submit:
        assert client.get('/api/health').status_code == 200
        assert client.post('/api/jobs', files={'file': ('bad.exe', b'x')}).status_code == 400
        assert client.post('/api/jobs', files={'file': ('empty.mp4', b'')}).status_code == 400
        response = client.post('/api/jobs', files={'file': ('clip.mp4', b'test fixture')}, data={'voice': 'female'})
        assert response.status_code == 202
        id = response.json()['id']
        assert submit.call_count == 1
        assert client.get(f'/api/jobs/{id}').json()['status'] == 'queued'
        assert client.post(f'/api/jobs/{id}/retry').status_code == 409
        assert client.get(f'/api/jobs/{id}/files/video').status_code == 404
        db.update(id, status='error', duration=10)
        data = {'voice': 'male', 'segments': [{'start': 0, 'end': 2, 'text': 'Xin chào', 'original': 'Hello'}]}
        assert client.put(f'/api/jobs/{id}/subtitles', json=data).status_code == 200
        assert 'Xin chào' in client.get(f'/api/jobs/{id}/files/srt').text
        assert client.get(f'/api/jobs/{id}/files/txt').text == 'Xin chào'
        data['segments'].append({'start': 1, 'end': 3, 'text': 'Trùng thời gian'})
        assert client.put(f'/api/jobs/{id}/subtitles', json=data).status_code == 400
        assert client.post(f'/api/jobs/{id}/export').status_code == 202
        assert client.post(f'/api/jobs/{id}/export').status_code == 409
        assert client.get('/api/jobs/not-found').status_code == 404


def test_subtitle_timing():
    assert stamp(3661.125) == '01:01:01,125'
    assert stamp(59.9999) == '00:01:00,000'
    assert tempo_filters(8) == 'atempo=2,atempo=2,atempo=2.000000'


def test_missing_translation_configuration():
    from app.pipeline import translate
    import pytest
    with patch('app.pipeline.translation_ready', return_value=False):
        with pytest.raises(ValueError, match='Chưa cấu hình'):
            translate([{'original': 'Hello'}])


def test_pipeline_records_error():
    from app.pipeline import process
    with signed_in_client() as client, patch('app.main.executor.submit'), patch('app.pipeline.shutil.which', return_value=None):
        id = client.post('/api/jobs', files={'file': ('sample.webm', b'fixture')}).json()['id']
        process(id)
        job = client.get(f'/api/jobs/{id}').json()
        assert job['status'] == 'error'
        assert 'FFmpeg' in job['error']


def test_translation_response_validation():
    from app.pipeline import translate
    import httpx
    import pytest
    response = httpx.Response(200, json={'choices': [{'message': {'content': '{"translations":["Xin chào"]}'}}]})
    segments = [{'original': 'Hello', 'text': ''}]
    with patch('app.pipeline.translation_ready', return_value=True), patch('httpx.Client.post', return_value=response):
        translate(segments)
        assert segments[0]['text'] == 'Xin chào'
    response = httpx.Response(200, json={'choices': [{'message': {'content': '{"translations":[]}'}}]})
    with patch('app.pipeline.translation_ready', return_value=True), patch('httpx.Client.post', return_value=response):
        with pytest.raises(RuntimeError, match='JSON'):
            translate(segments)


def test_source_language_is_saved_and_invalid_languages_rejected():
    with signed_in_client() as client, patch('app.main.executor.submit'):
        response = client.post('/api/jobs', files={'file': ('english.mp4', b'fixture')}, data={'source_language': 'en', 'target_language': 'vi'})
        assert response.status_code == 202
        assert response.json()['source_language'] == 'en'
        assert client.get('/api/jobs').json()[0]['segment_count'] == 0
        assert 'segments' not in client.get('/api/jobs').json()[0]
        assert client.post('/api/jobs', files={'file': ('bad.mp4', b'fixture')}, data={'source_language': 'invalid'}).status_code == 400
        assert client.post('/api/jobs', files={'file': ('bad.mp4', b'fixture')}, data={'target_language': 'en'}).status_code == 422


def test_settings_persistence_secret_redaction_and_busy_protection(tmp_path):
    from app.config import settings
    from app.preferences import public_preferences
    snapshot = settings.model_dump()
    env = tmp_path / '.env'
    try:
        with signed_in_client() as client, patch('app.preferences.ENV_FILE', env), patch('app.main.executor.submit'):
            body = {**public_preferences(), 'translation_api_key': 'test-private-key', 'translation_model': 'example-model'}
            response = client.put('/api/settings', json=body)
            assert response.status_code == 200
            assert response.json()['translation_key_configured'] is True
            assert 'test-private-key' not in response.text
            assert 'translation_api_key' not in client.get('/api/settings').json()
            assert 'test-private-key' in env.read_text()
            body['translation_api_key'] = None
            assert client.put('/api/settings', json=body).status_code == 200
            assert settings.translation_api_key == 'test-private-key'
            invalid = {**body, 'translation_api_key': 'secret\nshould-not-echo'}
            response = client.put('/api/settings', json=invalid)
            assert response.status_code == 422
            assert 'should-not-echo' not in response.text
            assert client.put('/api/settings', json={**body, 'translation_base_url': 'http://remote.example/v1'}).status_code == 422
            body['clear_translation_key'] = True
            assert client.put('/api/settings', json=body).json()['translation_key_configured'] is False
            client.post('/api/jobs', files={'file': ('queued.mp4', b'fixture')})
            assert client.put('/api/settings', json=body).status_code == 409
    finally:
        for key, value in snapshot.items():
            setattr(settings, key, value)


def test_recognition_uses_selected_language_and_tracks_real_progress():
    from types import SimpleNamespace
    from app.pipeline import process
    recognizer = SimpleNamespace(transcribe=lambda *args, **kwargs: ([SimpleNamespace(start=0, end=2, text='Xin chào')], SimpleNamespace(language='vi')))
    with signed_in_client() as client, patch('app.main.executor.submit'):
        id = client.post('/api/jobs', files={'file': ('local.mp4', b'fixture')}, data={'source_language': 'vi'}).json()['id']
        with patch('app.pipeline.shutil.which', return_value='/bin/ffmpeg'), patch('app.pipeline.importlib.util.find_spec', return_value=True), patch('app.pipeline.probe', return_value=3), patch('app.pipeline.run'), patch('app.pipeline.whisper', return_value=recognizer), patch.object(recognizer, 'transcribe', wraps=recognizer.transcribe) as transcribe, patch('app.pipeline.render') as render:
            process(id)
            assert transcribe.call_args.kwargs['language'] == 'vi'
            assert render.call_args.args[2][0]['text'] == 'Xin chào'
        job = client.get(f'/api/jobs/{id}').json()
        assert job['status'] == 'done'
        assert job['progress'] == 100
        assert job['phase'] == 'done'
        assert job['rendered_at']
        assert job['output_current']
        response = client.put(f'/api/jobs/{id}/subtitles', json={'voice':'male','segments':job['segments']})
        assert response.status_code == 200
        assert response.json()['output_current'] is False
