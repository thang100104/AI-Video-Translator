"""Isolated API for browser tests; never uses the user database."""
import os
from pathlib import Path
import shutil
import sys
import tempfile
import uvicorn


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    data = tempfile.mkdtemp(prefix='ai-translator-browser-tests-')
    os.environ['DATA_DIR'] = data
    os.environ['CORS_ORIGINS'] = 'http://127.0.0.1:5174'
    os.environ['TRANSLATION_API_KEY'] = ''
    os.environ['TRANSLATION_ALLOW_NO_KEY'] = 'false'
    for key in ('PAYOS_CLIENT_ID','PAYOS_API_KEY','PAYOS_CHECKSUM_KEY'):
        os.environ[key] = ''
    try:
        uvicorn.run('app.main:app', host='127.0.0.1', port=8001, access_log=False)
    finally:
        shutil.rmtree(data, ignore_errors=True)


if __name__ == '__main__':
    main()
