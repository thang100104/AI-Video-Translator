import hashlib
import hmac
import re
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, SecretStr, field_validator
from . import db
from .config import settings

router = APIRouter(prefix='/api/auth', tags=['Accounts'])
COOKIE = 'avt_session'
ITERATIONS = 600_000


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), ITERATIONS).hex()
    return f'pbkdf2_sha256${ITERATIONS}${salt}${digest}'


def verify_password(password, stored):
    algorithm, iterations, salt, expected = stored.split('$')
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), int(iterations)).hex()
    return algorithm == 'pbkdf2_sha256' and hmac.compare_digest(digest, expected)

DUMMY_HASH = hash_password(secrets.token_hex(16))


def public_user(user):
    result = {key: user[key] for key in ('id', 'name', 'email', 'role', 'created')}
    until = user['pro_until'] if 'pro_until' in user.keys() else 0
    owner = user['role'] == 'admin'
    pro = owner or until > time.time()
    return {**result, 'plan': 'pro' if pro else 'free', 'pro_until': until or None,
            'plan_source': 'workspace_owner' if owner else 'payment' if pro else 'free',
            'max_upload_mb': min(settings.max_upload_mb, 1024 if pro else 500)}


def digest_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, 'Bạn cần đăng nhập để sử dụng ứng dụng.')
    with db.connection() as c:
        user = c.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?', (digest_token(token), time.time())).fetchone()
    if not user:
        raise HTTPException(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    return public_user(user)


def admin_user(user=Depends(current_user)):
    if user['role'] != 'admin':
        raise HTTPException(403, 'Chỉ quản trị viên được thay đổi cấu hình dịch vụ AI.')
    return user


def rate_limit(request, scope, limit, window, email=''):
    ip = request.client.host if request.client else 'unknown'
    key = hashlib.sha256(f'{scope}:{ip}:{email}'.encode()).hexdigest()
    now = time.time()
    with db.connection() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute('DELETE FROM auth_limits WHERE reset_at<=?', (now,))
        row = c.execute('SELECT * FROM auth_limits WHERE key=?', (key,)).fetchone()
        if row and row['count'] >= limit:
            raise HTTPException(429, 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.', headers={'Retry-After': str(max(1, int(row['reset_at'] - now)))})
        c.execute('INSERT INTO auth_limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+1', (key, 1, now + window))


def create_session(user, response, request):
    previous = request.cookies.get(COOKIE)
    token = secrets.token_urlsafe(32)
    lifetime = max(1, min(settings.session_days, 30)) * 86400
    with db.connection() as c:
        c.execute('DELETE FROM sessions WHERE expires<=?', (time.time(),))
        if previous:
            c.execute('DELETE FROM sessions WHERE token_hash=?', (digest_token(previous),))
        c.execute('INSERT INTO sessions VALUES (?,?,?)', (digest_token(token), user['id'], time.time() + lifetime))
    response.set_cookie(COOKIE, token, max_age=lifetime, httponly=True, secure=settings.session_secure_cookie, samesite='strict', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return public_user(user)


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator('email')
    @classmethod
    def email_valid(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Email không hợp lệ.')
        return value


class Register(Login):
    name: str = Field(min_length=2, max_length=80)
    password: SecretStr = Field(min_length=10, max_length=128)

    @field_validator('name')
    @classmethod
    def name_valid(cls, value):
        value = value.strip()
        if len(value) < 2 or any(ord(char) < 32 for char in value):
            raise ValueError('Tên phải có ít nhất 2 ký tự hợp lệ.')
        return value


@router.post('/register', status_code=201)
def register(body: Register, request: Request, response: Response):
    rate_limit(request, 'register', 10, 3600)
    password_hash = hash_password(body.password.get_secret_value())
    user = {'id': uuid.uuid4().hex, 'name': body.name, 'email': body.email, 'created': datetime.now(timezone.utc).isoformat()}
    try:
        with db.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            first = c.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 0
            user['role'] = 'admin' if first else 'user'
            c.execute('INSERT INTO users (id,name,email,password_hash,role,created) VALUES (?,?,?,?,?,?)', (user['id'], user['name'], user['email'], password_hash, user['role'], user['created']))
            if first:
                c.execute('UPDATE jobs SET owner_id=? WHERE owner_id IS NULL', (user['id'],))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.')
    return create_session(user, response, request)


@router.post('/login')
def login(body: Login, request: Request, response: Response):
    rate_limit(request, 'login-ip', 60, 3600)
    rate_limit(request, 'login-email', 10, 900, body.email)
    with db.connection() as c:
        user = c.execute('SELECT * FROM users WHERE email=?', (body.email,)).fetchone()
    valid = verify_password(body.password.get_secret_value(), user['password_hash'] if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, 'Email hoặc mật khẩu chưa đúng.')
    return create_session(user, response, request)


@router.get('/me')
def me(response: Response, user=Depends(current_user)):
    response.headers['Cache-Control'] = 'no-store'
    return user


@router.post('/logout', status_code=204)
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        with db.connection() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?', (digest_token(token),))
    response.delete_cookie(COOKIE, path='/', secure=settings.session_secure_cookie, httponly=True, samesite='strict')
    response.headers['Cache-Control'] = 'no-store'
