from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[1] / '.env'
SOURCE_LANGUAGES = {'auto', 'en', 'ja', 'ko', 'zh', 'fr', 'de', 'es', 'ru', 'th', 'id', 'vi'}
TOOLS_DIR = Path(__file__).resolve().parents[1] / '.tools'

def default_tool(name):
    local = TOOLS_DIR / name
    return str(local) if local.is_file() else name

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra='ignore')
    translation_base_url: str = 'https://api.openai.com/v1'
    translation_api_key: str = ''
    translation_model: str = 'gpt-4o-mini'
    translation_allow_no_key: bool = False
    whisper_model: str = 'base'
    max_upload_mb: int = 1024
    max_duration_seconds: int = 3600
    data_dir: str = str(Path(__file__).resolve().parents[1] / 'data')
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'
    tts_male_voice: str = 'vi-VN-NamMinhNeural'
    tts_female_voice: str = 'vi-VN-HoaiMyNeural'
    default_voice: str = 'female'
    default_source_language: str = 'auto'
    ffmpeg_bin: str = default_tool('ffmpeg')
    ffprobe_bin: str = default_tool('ffprobe')
    session_secure_cookie: bool = False
    session_days: int = 7
    payos_client_id: str = ""
    payos_api_key: str = ""
    payos_checksum_key: str = ""
    billing_frontend_url: str = "http://localhost:5173"
    pro_price_vnd: int = 49999
    pro_days: int = 30

settings = Settings()
DATA = Path(settings.data_dir).resolve()
DATA.mkdir(parents=True, exist_ok=True)

def translation_ready():
    return bool(settings.translation_api_key or settings.translation_allow_no_key)
