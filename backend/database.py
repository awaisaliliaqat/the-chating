import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), 'social.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            name                TEXT    NOT NULL,
            email               TEXT    NOT NULL UNIQUE,
            username            TEXT    UNIQUE,
            password            TEXT    NOT NULL,
            phone               TEXT    NOT NULL DEFAULT '',
            bio                 TEXT    NOT NULL DEFAULT '',
            bio_link            TEXT    NOT NULL DEFAULT '',
            status_text         TEXT    NOT NULL DEFAULT '',
            status_emoji        TEXT    NOT NULL DEFAULT '',
            avatar_color        TEXT    NOT NULL DEFAULT '#6366f1',
            avatar_b64          TEXT,
            is_online           INTEGER NOT NULL DEFAULT 0,
            is_verified         INTEGER NOT NULL DEFAULT 0,
            available_for_calls INTEGER NOT NULL DEFAULT 0,
            is_banned           INTEGER NOT NULL DEFAULT 0,
            ban_reason          TEXT,
            banned_at           DATETIME,
            twofa_secret        TEXT,
            twofa_enabled       INTEGER NOT NULL DEFAULT 0,
            app_lock_pin        TEXT,
            last_seen_privacy   TEXT    NOT NULL DEFAULT 'everyone',
            last_seen           DATETIME,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
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
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id       INTEGER NOT NULL,
            receiver_id     INTEGER NOT NULL,
            content         TEXT    NOT NULL DEFAULT '',
            msg_type        TEXT    NOT NULL DEFAULT 'text',
            file_b64        TEXT,
            file_name       TEXT,
            file_size       INTEGER,
            reply_to_id     INTEGER,
            forward_from_id INTEGER,
            is_read         INTEGER NOT NULL DEFAULT 0,
            is_pinned       INTEGER NOT NULL DEFAULT 0,
            is_starred      INTEGER NOT NULL DEFAULT 0,
            view_once       INTEGER NOT NULL DEFAULT 0,
            view_once_seen  INTEGER NOT NULL DEFAULT 0,
            scheduled_at    DATETIME,
            edited_at       DATETIME,
            deleted_at      DATETIME,
            expires_at      DATETIME,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS message_reactions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            emoji      TEXT    NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
            UNIQUE(message_id, user_id, emoji)
        );

        CREATE TABLE IF NOT EXISTS conversation_settings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            peer_id     INTEGER NOT NULL,
            is_pinned   INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0,
            is_muted    INTEGER NOT NULL DEFAULT 0,
            wallpaper   TEXT    NOT NULL DEFAULT '',
            ringtone    TEXT    NOT NULL DEFAULT '',
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, peer_id)
        );

        CREATE TABLE IF NOT EXISTS polls (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            creator_id INTEGER NOT NULL,
            chat_id    INTEGER,
            group_id   INTEGER,
            question   TEXT    NOT NULL,
            options    TEXT    NOT NULL,
            is_multi   INTEGER NOT NULL DEFAULT 0,
            is_closed  INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS poll_votes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id    INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            option_idx INTEGER NOT NULL,
            voted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(poll_id, user_id, option_idx)
        );

        CREATE TABLE IF NOT EXISTS reports (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id INTEGER NOT NULL,
            reported_id INTEGER NOT NULL,
            reason      TEXT    NOT NULL,
            message_id  INTEGER,
            status      TEXT    NOT NULL DEFAULT 'pending',
            resolved_at DATETIME,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_warnings (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            admin_id   INTEGER NOT NULL,
            reason     TEXT    NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS group_invites (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id   INTEGER NOT NULL,
            code       TEXT    NOT NULL UNIQUE,
            created_by INTEGER NOT NULL,
            max_uses   INTEGER DEFAULT 0,
            use_count  INTEGER NOT NULL DEFAULT 0,
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scheduled_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id   INTEGER NOT NULL,
            receiver_id INTEGER,
            group_id    INTEGER,
            content     TEXT    NOT NULL,
            msg_type    TEXT    NOT NULL DEFAULT 'text',
            send_at     DATETIME NOT NULL,
            sent        INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS login_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            ip         TEXT    NOT NULL DEFAULT '',
            user_agent TEXT    NOT NULL DEFAULT '',
            city       TEXT    NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

        CREATE TABLE IF NOT EXISTS groups (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT    NOT NULL,
            description  TEXT    NOT NULL DEFAULT '',
            avatar_color TEXT    NOT NULL DEFAULT '#6366f1',
            avatar_b64   TEXT,
            is_announce  INTEGER NOT NULL DEFAULT 0,
            owner_id     INTEGER NOT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS group_members (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id  INTEGER NOT NULL,
            user_id   INTEGER NOT NULL,
            role      TEXT    NOT NULL DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
            UNIQUE(group_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS group_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id    INTEGER NOT NULL,
            sender_id   INTEGER NOT NULL,
            content     TEXT    NOT NULL DEFAULT '',
            msg_type    TEXT    NOT NULL DEFAULT 'text',
            file_b64    TEXT,
            file_name   TEXT,
            reply_to_id INTEGER,
            forward_from_id INTEGER,
            is_pinned   INTEGER NOT NULL DEFAULT 0,
            edited_at   DATETIME,
            deleted_at  DATETIME,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id)  REFERENCES groups(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id)  ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS group_reactions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            emoji      TEXT    NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES group_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(message_id, user_id, emoji)
        );

        CREATE TABLE IF NOT EXISTS stories (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            content    TEXT    NOT NULL DEFAULT '',
            bg_color   TEXT    NOT NULL DEFAULT '#6366f1',
            type       TEXT    NOT NULL DEFAULT 'text',
            file_b64   TEXT,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS story_views (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id  INTEGER NOT NULL,
            viewer_id INTEGER NOT NULL,
            viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (story_id)  REFERENCES stories(id) ON DELETE CASCADE,
            FOREIGN KEY (viewer_id) REFERENCES users(id)   ON DELETE CASCADE,
            UNIQUE(story_id, viewer_id)
        );

        CREATE TABLE IF NOT EXISTS blocks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker_id INTEGER NOT NULL,
            blocked_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(blocker_id, blocked_id)
        );

        CREATE TABLE IF NOT EXISTS rooms (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT    NOT NULL,
            description  TEXT    NOT NULL DEFAULT '',
            category     TEXT    NOT NULL DEFAULT 'General',
            avatar_color TEXT    NOT NULL DEFAULT '#6366f1',
            owner_id     INTEGER NOT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS room_members (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id   INTEGER NOT NULL,
            user_id   INTEGER NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(room_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS room_messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id    INTEGER NOT NULL,
            sender_id  INTEGER NOT NULL,
            content    TEXT    NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id)   REFERENCES rooms(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            endpoint   TEXT    NOT NULL,
            p256dh     TEXT    NOT NULL,
            auth       TEXT    NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, endpoint)
        );

        CREATE TABLE IF NOT EXISTS flagged_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id  INTEGER,
            sender_id   INTEGER NOT NULL,
            content     TEXT    NOT NULL,
            bad_words   TEXT    NOT NULL,
            chat_type   TEXT    NOT NULL DEFAULT 'dm',
            is_reviewed INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        );
    ''')

    # Migrations for existing databases — each in try/except
    migrations = [
        "ALTER TABLE users ADD COLUMN username TEXT",
        "ALTER TABLE users ADD COLUMN avatar_b64 TEXT",
        "ALTER TABLE users ADD COLUMN available_for_calls INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN ban_reason TEXT",
        "ALTER TABLE users ADD COLUMN banned_at DATETIME",
        "ALTER TABLE users ADD COLUMN status_text TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN status_emoji TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN bio_link TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN twofa_secret TEXT",
        "ALTER TABLE users ADD COLUMN twofa_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN app_lock_pin TEXT",
        "ALTER TABLE users ADD COLUMN last_seen_privacy TEXT NOT NULL DEFAULT 'everyone'",
        "ALTER TABLE messages ADD COLUMN msg_type TEXT NOT NULL DEFAULT 'text'",
        "ALTER TABLE messages ADD COLUMN file_b64 TEXT",
        "ALTER TABLE messages ADD COLUMN file_name TEXT",
        "ALTER TABLE messages ADD COLUMN file_size INTEGER",
        "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER",
        "ALTER TABLE messages ADD COLUMN forward_from_id INTEGER",
        "ALTER TABLE messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE messages ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE messages ADD COLUMN view_once INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE messages ADD COLUMN view_once_seen INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE messages ADD COLUMN scheduled_at DATETIME",
        "ALTER TABLE messages ADD COLUMN edited_at DATETIME",
        "ALTER TABLE messages ADD COLUMN deleted_at DATETIME",
        "ALTER TABLE messages ADD COLUMN expires_at DATETIME",
        "ALTER TABLE groups ADD COLUMN is_announce INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE groups ADD COLUMN avatar_b64 TEXT",
        "ALTER TABLE group_messages ADD COLUMN forward_from_id INTEGER",
        "ALTER TABLE group_messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
    ]
    for sql in migrations:
        try: conn.execute(sql)
        except Exception: pass

    conn.commit()
    conn.close()
