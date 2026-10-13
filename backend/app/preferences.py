"""Local configuration API. Secrets never appear in response payloads."""
from typing import Literal
from urllib.parse import urlsplit
from dotenv import set_key
from fastapi import HTTPException
from pydantic import BaseModel, Field, SecretStr, field_validator
from .config import ENV_FILE, SOURCE_LANGUAGES, settings
from .pipeline import whisper


class Preferences(BaseModel):
    translation_base_url: str = Field(min_length=1, max_length=500)
    translation_model: str = Field(min_length=1, max_length=150)
    translation_api_key: SecretStr | None = None
    clear_translation_key: bool = False
    translation_allow_no_key: bool = False
    whisper_model: Literal['tiny', 'base', 'small', 'medium', 'large-v3'] = 'base'
    default_voice: Literal['male', 'female'] = 'female'
    default_source_language: str = 'auto'
    max_upload_mb: int = Field(default=1024, ge=1, le=2000)
    max_duration_seconds: int = Field(default=3600, ge=1, le=7200)

    @field_validator('translation_base_url')
    @classmethod
    def check_url(cls, value):
        value = value.strip().rstrip('/')
        parsed = urlsplit(value)
        if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Địa chỉ API không hợp lệ.')
        if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in {'localhost', '127.0.0.1', '::1'}):
            raise ValueError('Dùng HTTPS cho API; HTTP chỉ cho phép địa chỉ localhost.')
        return value

    @field_validator('default_source_language')
    @classmethod
    def check_language(cls, value):
        if value not in SOURCE_LANGUAGES:
            raise ValueError('Ngôn ngữ gốc không được hỗ trợ.')
        return value

    @field_validator('translation_model')
    @classmethod
    def check_model(cls, value):
        if not value.strip() or '\n' in value or '\r' in value:
            raise ValueError('Tên model không hợp lệ.')
        return value.strip()

    @field_validator('translation_api_key')
    @classmethod
    def check_key(cls, value):
        if value and any(c in value.get_secret_value() for c in ('\n', '\r', '\x00')):
            raise ValueError('API key không hợp lệ.')
        return value


def public_preferences():
    fields = ('translation_base_url', 'translation_model', 'translation_allow_no_key', 'whisper_model',
              'default_voice', 'default_source_language', 'max_upload_mb', 'max_duration_seconds')
    return {**{field: getattr(settings, field) for field in fields}, 'translation_key_configured': bool(settings.translation_api_key)}


def persist_preferences(body):
    updates = body.model_dump(exclude={'translation_api_key', 'clear_translation_key'})
    supplied_key = body.translation_api_key.get_secret_value().strip() if body.translation_api_key else ''
    if body.clear_translation_key and supplied_key:
        raise HTTPException(400, 'Không thể vừa xóa vừa nhập API key mới.')
    if body.clear_translation_key:
        updates['translation_api_key'] = ''
    elif supplied_key:
        updates['translation_api_key'] = supplied_key
    # dotenv handles quoting. The ignored file remains private on this machine.
    try:
        ENV_FILE.touch(mode=0o600, exist_ok=True)
        ENV_FILE.chmod(0o600)
        original = ENV_FILE.read_text(encoding='utf-8')
        try:
            for key, value in updates.items():
                set_key(str(ENV_FILE), key.upper(), str(value).lower() if isinstance(value, bool) else str(value))
        except Exception:
            ENV_FILE.write_text(original, encoding='utf-8')
            raise
    except OSError:
        raise HTTPException(500, 'Không lưu được backend/.env. Kiểm tra quyền ghi thư mục.')
    model_changed = updates['whisper_model'] != settings.whisper_model
    for key, value in updates.items():
        setattr(settings, key, value)
    if model_changed:
        whisper.cache_clear()
    return public_preferences()
