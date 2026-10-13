import os
import tempfile
from contextlib import contextmanager
import pytest

os.environ['DATA_DIR'] = tempfile.mkdtemp(prefix='ai-translator-auth-tests-')
from fastapi.testclient import TestClient
from app.main import app
from app import db


@pytest.fixture(autouse=True)
def isolated_database():
    db.init()
    with db.connection() as c:
        for table in ('payments', 'sessions', 'jobs', 'users', 'auth_limits'):
            c.execute(f'DELETE FROM {table}')
    yield


@contextmanager
def signed_in_client():
    with TestClient(app) as client:
        response = client.post('/api/auth/register', json={'name': 'Test Admin', 'email': 'admin@example.test', 'password': 'Test password 123!'})
        assert response.status_code == 201
        yield client
