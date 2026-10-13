import json
import sqlite3
from .config import DATA

PATH = DATA / 'jobs.sqlite3'

def connection():
    conn = sqlite3.connect(PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    return conn

def init():
    with connection() as c:
        c.execute('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL, created TEXT NOT NULL)')
        user_columns = {row['name'] for row in c.execute('PRAGMA table_info(users)')}
        if 'pro_until' not in user_columns:
            c.execute('ALTER TABLE users ADD COLUMN pro_until REAL NOT NULL DEFAULT 0')
        c.execute("CREATE TABLE IF NOT EXISTS payments (code INTEGER PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL, days INTEGER NOT NULL, status TEXT NOT NULL, created REAL NOT NULL, checkout_url TEXT, link_id TEXT, paid_at REAL, last_check REAL NOT NULL DEFAULT 0)")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS payments_pending ON payments(owner_id) WHERE status IN ('creating','PENDING')")
        c.execute('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires REAL NOT NULL)')
        c.execute('CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at REAL NOT NULL)')
        c.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, name TEXT, created TEXT, status TEXT, progress INTEGER, stage TEXT, error TEXT, voice TEXT, language TEXT, duration REAL, segments TEXT)')
        columns = {row['name'] for row in c.execute('PRAGMA table_info(jobs)')}
        for name, definition in {
            'source_language': "TEXT NOT NULL DEFAULT 'auto'",
            'target_language': "TEXT NOT NULL DEFAULT 'vi'",
            'phase': "TEXT NOT NULL DEFAULT 'upload'",
            'output_current': 'INTEGER NOT NULL DEFAULT 0',
            'rendered_at': 'TEXT',
            'owner_id': 'TEXT REFERENCES users(id)',
        }.items():
            if name not in columns:
                c.execute(f'ALTER TABLE jobs ADD COLUMN {name} {definition}')
                if name == 'output_current':
                    c.execute("UPDATE jobs SET output_current=1 WHERE status='done'")
                if name == 'phase':
                    c.execute("UPDATE jobs SET phase='done' WHERE status='done'")
        c.execute("UPDATE jobs SET status='error', error='Tiến trình bị gián đoạn khi máy chủ khởi động lại. Hãy thử lại.', stage='Bị gián đoạn' WHERE status IN ('queued','processing')")
        c.execute('CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(owner_id)')

def create(job):
    with connection() as c:
        record = {'source_language': 'auto', 'target_language': 'vi', 'phase': 'upload', 'output_current': 0, 'rendered_at': None, **job, 'segments': json.dumps(job['segments'])}
        columns = ','.join(record)
        placeholders = ','.join(f':{key}' for key in record)
        c.execute(f'INSERT INTO jobs ({columns}) VALUES ({placeholders})', record)

def update(id, **values):
    if 'segments' in values:
        values['segments'] = json.dumps(values['segments'], ensure_ascii=False)
    with connection() as c:
        c.execute('UPDATE jobs SET ' + ','.join(f'{key}=?' for key in values) + ' WHERE id=?', [*values.values(), id])

def get(id=None, owner_id=None):
    with connection() as c:
        if id:
            rows = c.execute('SELECT * FROM jobs WHERE id=?', (id,)).fetchall()
        elif owner_id is not None:
            rows = c.execute('SELECT * FROM jobs WHERE owner_id=? ORDER BY created DESC', (owner_id,)).fetchall()
        else:
            rows = c.execute('SELECT * FROM jobs ORDER BY created DESC').fetchall()
    result = [{**dict(r), 'segments': json.loads(r['segments'])} for r in rows]
    return (result[0] if result else None) if id else result
