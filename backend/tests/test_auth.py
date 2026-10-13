import time
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app import db
from app.auth import COOKIE, digest_token

PASSWORD = 'Test strong password 123!'

def registration(email='first@example.test', name='First User'):
    return {'name': name, 'email': email, 'password': PASSWORD}


def test_registration_login_logout_and_secret_storage():
    with TestClient(app) as client:
        assert client.get('/api/jobs').status_code == 401
        assert client.get('/api/settings').status_code == 401
        assert client.post('/api/voices/preview', json={'voice':'male'}).status_code == 401
        result = client.post('/api/auth/register', json=registration('  First@Example.test '))
        assert result.status_code == 201
        assert result.json()['email'] == 'first@example.test'
        assert result.json()['role'] == 'admin'
        assert PASSWORD not in result.text and 'password_hash' not in result.text
        assert 'HttpOnly' in result.headers['set-cookie'] and 'SameSite=strict' in result.headers['set-cookie']
        with db.connection() as c:
            row = c.execute('SELECT * FROM users').fetchone()
            assert row['password_hash'].startswith('pbkdf2_sha256$600000$')
            assert PASSWORD not in row['password_hash']
            assert c.execute('SELECT token_hash FROM sessions').fetchone()[0] != client.cookies[COOKIE]
        token = client.cookies[COOKIE]
        assert client.get('/api/auth/me').status_code == 200
        assert client.post('/api/auth/logout').status_code == 204
        assert client.get('/api/auth/me').status_code == 401
        client.cookies.set(COOKIE, token)
        assert client.get('/api/jobs').status_code == 401
        client.cookies.clear()
        assert client.post('/api/auth/login', json={'email':'first@example.test','password':'wrong password'}).status_code == 401
        assert client.post('/api/auth/login', json={'email':'FIRST@example.test','password':PASSWORD}).status_code == 200
        assert client.get('/api/jobs').status_code == 200
        assert client.post('/api/auth/register', json=registration()).status_code == 409


def test_account_isolation_including_files_and_mutations():
    with TestClient(app) as client, patch('app.main.executor.submit'):
        first = client.post('/api/auth/register', json=registration()).json()
        job = client.post('/api/jobs', files={'file':('private.mp4',b'private-video-bytes')}).json()
        id = job['id']
        assert job['owner_id'] == first['id']
        assert client.get(f'/api/jobs/{id}/files/source').content == b'private-video-bytes'
        client.post('/api/auth/logout')
        other = client.post('/api/auth/register', json=registration('other@example.test','Other User'))
        assert other.status_code == 201 and other.json()['role'] == 'user'
        assert client.get('/api/jobs').json() == []
        assert client.get(f'/api/jobs/{id}').status_code == 404
        assert client.get(f'/api/jobs/{id}/files/source').status_code == 404
        for endpoint in ('retry','export'):
            assert client.post(f'/api/jobs/{id}/{endpoint}').status_code == 404
        assert client.put(f'/api/jobs/{id}/subtitles',json={'voice':'female','segments':[{'start':0,'end':1,'text':'Xin chào'}]}).status_code == 404
        from app.preferences import public_preferences
        assert client.put('/api/settings',json=public_preferences()).status_code == 403


def test_validation_expiration_rate_limits_and_origin():
    with TestClient(app) as client:
        weak={**registration(),'password':'abc12'}
        response=client.post('/api/auth/register',json=weak)
        assert response.status_code == 422 and 'abc12' not in response.text
        assert client.post('/api/auth/register',json={**registration(),'email':'invalid'}).status_code == 422
        assert client.post('/api/auth/register',json=registration(),headers={'Origin':'https://evil.example'}).status_code == 403
        assert client.post('/api/auth/register',json=registration()).status_code == 201
        with db.connection() as c:
            c.execute('UPDATE sessions SET expires=?',(time.time()-1,))
        assert client.get('/api/auth/me').status_code == 401
        for _ in range(10):
            assert client.post('/api/auth/login',json={'email':'unknown@example.test','password':PASSWORD}).status_code == 401
        assert client.post('/api/auth/login',json={'email':'unknown@example.test','password':PASSWORD}).status_code == 429


def test_first_account_claims_only_unowned_legacy_jobs():
    db.create({'id':'legacy-test','name':'old.mp4','created':'2026-01-01','status':'error','progress':0,'stage':'Old','error':None,'voice':'female','language':None,'duration':None,'segments':[]})
    with TestClient(app) as client:
        user=client.post('/api/auth/register',json=registration()).json()
        assert client.get('/api/jobs').json()[0]['id'] == 'legacy-test'
        assert db.get('legacy-test')['owner_id'] == user['id']
