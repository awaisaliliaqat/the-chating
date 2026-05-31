import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'social.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT    NOT NULL,
            email        TEXT    NOT NULL UNIQUE,
            password     TEXT    NOT NULL,
            phone        TEXT    NOT NULL DEFAULT '',
            bio          TEXT    NOT NULL DEFAULT '',
            avatar_color TEXT    NOT NULL DEFAULT '#6366f1',
            is_online    INTEGER NOT NULL DEFAULT 0,
            last_seen    DATETIME,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS friendships (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id INTEGER NOT NULL,
            addressee_id INTEGER NOT NULL,
            status       TEXT    NOT NULL DEFAULT 'pending',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(requester_id, addressee_id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id   INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content     TEXT    NOT NULL,
            is_read     INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            name       TEXT    NOT NULL,
            phone      TEXT    NOT NULL DEFAULT '',
            email      TEXT    NOT NULL DEFAULT '',
            notes      TEXT    NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS calls (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            caller_id   INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            status      TEXT    NOT NULL DEFAULT 'missed',
            call_type   TEXT    NOT NULL DEFAULT 'audio',
            duration    INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (caller_id)   REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        );
    ''')
    conn.commit()
    conn.close()
