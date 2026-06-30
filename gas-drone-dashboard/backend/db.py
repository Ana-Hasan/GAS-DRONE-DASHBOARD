import sqlite3
from contextlib import contextmanager

from config import DATA_DIR, DB_PATH


SCHEMA = """
CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reading_count INTEGER NOT NULL,
    avg_concentration REAL NOT NULL,
    max_concentration REAL NOT NULL,
    predicted_gas TEXT NOT NULL,
    confidence REAL NOT NULL,
    risk_level TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    mq135 REAL NOT NULL,
    mq2 REAL NOT NULL,
    mq7 REAL NOT NULL,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    concentration REAL NOT NULL,
    risk_level TEXT NOT NULL,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_readings_mission_time
ON readings (mission_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_readings_time
ON readings (timestamp);
"""


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def rows_to_dicts(rows):
    return [dict(row) for row in rows]
