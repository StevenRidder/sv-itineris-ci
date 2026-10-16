import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        (self.directory / "assets").mkdir(exist_ok=True)
        with self.connection() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
            INSERT OR IGNORE INTO meta VALUES('schema',1),('library_revision',0);
            CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL,
              kind TEXT NOT NULL, revision INTEGER NOT NULL, sha TEXT NOT NULL, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS source_versions(id TEXT, revision INTEGER, payload TEXT NOT NULL, PRIMARY KEY(id,revision));
            CREATE VIRTUAL TABLE IF NOT EXISTS source_search USING fts5(id UNINDEXED,title,body);
            CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL, original_path TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS scenarios(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS scenario_versions(id TEXT, revision INTEGER, payload TEXT NOT NULL, PRIMARY KEY(id,revision));
            CREATE TABLE IF NOT EXISTS places(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, base_id TEXT NOT NULL, base_revision INTEGER NOT NULL,
              library_revision INTEGER NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS saves(key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, scenario_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, thread_id TEXT, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL,
              role TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.directory / "planner.sqlite3", timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def scenarios(self):
        with self.connection() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT payload FROM scenarios ORDER BY id")]

    def scenario(self, scenario_id, db=None):
        if db is None:
            with self.connection() as conn:
                return self.scenario(scenario_id, conn)
        row = db.execute("SELECT payload FROM scenarios WHERE id=?", (scenario_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def library_revision(self, db):
        return db.execute("SELECT value FROM meta WHERE key='library_revision'").fetchone()[0]

    def write_scenario(self, db, scenario):
        data = scenario.model_dump(mode="json")
        db.execute("INSERT OR REPLACE INTO scenarios VALUES(?,?,?)", (scenario.id, scenario.revision, canonical(data)))
        db.execute("INSERT INTO scenario_versions VALUES(?,?,?)", (scenario.id, scenario.revision, canonical(data)))
