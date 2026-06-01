import eventlet
eventlet.monkey_patch()

import os, datetime, json, random
import bcrypt, jwt
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from dotenv import load_dotenv
from database import get_db, init_db
from bad_words import check_bad_words

# ── Web Push ──────────────────────────────────────────────────────────────────
# VAPID keys for Web Push Notifications
# Public key is safe to expose; private key stays on server as vapid_private.pem
VAPID_EMAIL   = os.getenv("VAPID_EMAIL", "mailto:aariz123awais@gmail.com")
VAPID_PRIVATE = os.path.join(os.path.dirname(__file__), "vapid_private.pem")

def _get_vapid_public():
    """Read public key from private key file so it's always accurate."""
    try:
        from py_vapid import Vapid
        import base64
        v = Vapid.from_file(VAPID_PRIVATE)
        pub_bytes = v.public_key.public_bytes(
            __import__('cryptography.hazmat.primitives.serialization',
                       fromlist=['Encoding','PublicFormat']).Encoding.X962,
            __import__('cryptography.hazmat.primitives.serialization',
                       fromlist=['Encoding','PublicFormat']).PublicFormat.UncompressedPoint
        )
        return base64.urlsafe_b64encode(pub_bytes).rstrip(b'=').decode()
    except Exception as e:
        # Fallback to env variable
        return os.getenv("VAPID_PUBLIC", "")

VAPID_PUBLIC = _get_vapid_public()

def send_push_to_user(user_id, title, body, data=None):
    """Send a web push notification to all devices of a user."""
    try:
        from pywebpush import webpush, WebPushException
        db = get_db()
        subs = db.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?",
            (user_id,)
        ).fetchall()
        db.close()
        payload = json.dumps({"title": title, "body": body, "data": data or {}})
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE,
                    vapid_claims={"sub": VAPID_EMAIL},
                )
            except Exception:
                pass
    except Exception:
        pass

load_dotenv()
SECRET_KEY   = os.getenv("SECRET_KEY", "dev-secret")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001")
ADMIN_EMAILS = [e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "aariz123awais@gmail.com").split(",")]
_extra_origins = [o.strip() for o in os.getenv("EXTRA_ORIGINS", "").split(",") if o.strip()]
ALLOWED_ORIGINS = list({FRONTEND_URL, "http://localhost:3001",
                         "http://47.129.200.84", "https://47.129.200.84"} | set(_extra_origins))

app = Flask(__name__)
app.config["SECRET_KEY"] = SECRET_KEY
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS,
                    async_mode="eventlet", logger=False, engineio_logger=False)

socket_users = {}   # sid  -> user_id
user_sockets  = {}  # uid  -> {sids}

AVATAR_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#06b6d4"]
ROOM_COLORS   = ["#6366f1","#ec4899","#10b981","#3b82f6","#f59e0b","#8b5cf6"]

init_db()

# ── Helpers ───────────────────────────────────────────────────────────────────

def make_token(uid):
    return jwt.encode({
        "user_id": uid,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7),
    }, SECRET_KEY, algorithm="HS256")

def get_uid():
    auth = request.headers.get("Authorization","")
    if not auth.startswith("Bearer "): return None
    try: return jwt.decode(auth[7:], SECRET_KEY, algorithms=["HS256"])["user_id"]
    except: return None

def require_auth():
    uid = get_uid()
    if not uid: return None, (jsonify({"message":"Unauthorized"}),401)
    return uid, None

def user_dict(row):
    return {
        "id":                  row["id"],
        "name":                row["name"],
        "email":               row["email"],
        "username":            row["username"],
        "phone":               row["phone"],
        "bio":                 row["bio"],
        "avatar_color":        row["avatar_color"],
        "avatar_b64":          row["avatar_b64"],
        "is_online":           bool(row["is_online"]),
        "available_for_calls": bool(row["available_for_calls"]),
        "is_banned":           bool(row["is_banned"]),
        "ban_reason":          row["ban_reason"],
        "banned_at":           row["banned_at"],
        "last_seen":           row["last_seen"],
        "created_at":          row["created_at"],
    }

def msg_dict(row, reactions=None):
    d = dict(row)
    d["reactions"] = reactions or []
    return d

def get_reactions(db, message_id, table="message_reactions"):
    rows = db.execute(
        f"SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids FROM {table} WHERE message_id=? GROUP BY emoji",
        (message_id,)
    ).fetchall()
    return [{"emoji": r["emoji"], "count": r["count"],
             "user_ids": [int(x) for x in r["user_ids"].split(",")]} for r in rows]

def notify_admins(event, data):
    """Emit a socket event to all connected admin users."""
    db = get_db()
    admin_users = db.execute("SELECT id FROM users WHERE email IN ({})".format(
        ",".join("?" * len(ADMIN_EMAILS))
    ), ADMIN_EMAILS).fetchall()
    db.close()
    for a in admin_users:
        if a["id"] in user_sockets:
            for sid in user_sockets[a["id"]]:
                socketio.emit(event, data, to=sid)

def flag_message(db, message_id, sender_id, content, bad_words_found, chat_type="dm"):
    """Save a flagged message and alert all admins in real-time."""
    bad_str = ", ".join(bad_words_found)
    db.execute(
        "INSERT INTO flagged_messages (message_id, sender_id, content, bad_words, chat_type) VALUES (?,?,?,?,?)",
        (message_id, sender_id, content, bad_str, chat_type)
    )
    db.commit()
    # Get sender info
    sender = db.execute("SELECT * FROM users WHERE id=?", (sender_id,)).fetchone()
    flag_id = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    # Real-time alert to admins
    notify_admins("bad_word_alert", {
        "flag_id":    flag_id,
        "message_id": message_id,
        "sender_id":  sender_id,
        "sender_name": sender["name"] if sender else "Unknown",
        "sender_email": sender["email"] if sender else "",
        "sender_color": sender["avatar_color"] if sender else "#6366f1",
        "content":    content,
        "bad_words":  bad_words_found,
        "chat_type":  chat_type,
        "created_at": datetime.datetime.utcnow().isoformat(),
    })

def socket_auth(auth_data):
    token = (auth_data or {}).get("token") or request.args.get("token","")
    try: return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])["user_id"]
    except: return None

def _annotate_friendship(db, uid, rows):
    result = []
    for r in rows:
        fs = db.execute(
            "SELECT id,status,requester_id FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)",
            (uid, r["id"], r["id"], uid)
        ).fetchone()
        bl = db.execute("SELECT id FROM blocks WHERE blocker_id=? AND blocked_id=?", (uid, r["id"])).fetchone()
        u = user_dict(r)
        u["is_online"]         = r["id"] in user_sockets
        u["friendship_id"]     = fs["id"]                    if fs else None
        u["friendship_status"] = fs["status"]                if fs else None
        u["friendship_mine"]   = (fs["requester_id"]==uid)   if fs else None
        u["is_blocked"]        = bl is not None
        result.append(u)
    return result

# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route("/api/signup", methods=["POST"])
def signup():
    d     = request.json or {}
    name  = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    pwd   = d.get("password") or ""
    phone = (d.get("phone") or "").strip()
    if not name or not email or not pwd:
        return jsonify({"message":"Name, email and password required."}),400
    hashed = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()
    color  = random.choice(AVATAR_COLORS)
    db = get_db()
    try:
        db.execute("INSERT INTO users (name,email,password,phone,avatar_color) VALUES (?,?,?,?,?)",
                   (name,email,hashed,phone,color))
        db.commit()
        uid = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
        db.close()
        return jsonify({"token": make_token(uid), "message":"Account created!"}),201
    except:
        db.close()
        return jsonify({"message":"Email already in use."}),409

@app.route("/api/login", methods=["POST"])
def login():
    d     = request.json or {}
    email = (d.get("email") or "").strip().lower()
    pwd   = d.get("password") or ""
    db    = get_db()
    user  = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    db.close()
    if not user or not bcrypt.checkpw(pwd.encode(), user["password"].encode()):
        return jsonify({"message":"Invalid credentials."}),401
    if user["is_banned"]:
        reason = user["ban_reason"] or "No reason provided."
        return jsonify({"message": f"Your account has been banned. Reason: {reason}"}),403
    # Record login history
    try:
        ip = request.headers.get("X-Real-IP") or request.remote_addr or ""
        ua = request.headers.get("User-Agent","")[:200]
        db2 = get_db()
        db2.execute("INSERT INTO login_history (user_id,ip,user_agent) VALUES (?,?,?)",(user["id"],ip,ua))
        db2.commit(); db2.close()
    except Exception: pass
    return jsonify({"token": make_token(user["id"]), "message":"Logged in!"}),200

@app.route("/api/me", methods=["GET"])
def me():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    unread   = db.execute("SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND is_read=0 AND deleted_at IS NULL",(uid,)).fetchone()["c"]
    friends  = db.execute("SELECT COUNT(*) as c FROM friendships WHERE (requester_id=? OR addressee_id=?) AND status='accepted'",(uid,uid)).fetchone()["c"]
    pending  = db.execute("SELECT COUNT(*) as c FROM friendships WHERE addressee_id=? AND status='pending'",(uid,)).fetchone()["c"]
    db.close()
    if not user: return jsonify({"message":"Not found"}),404
    d = user_dict(user)
    d.update(unread_count=unread, friends_count=friends, pending_requests=pending)
    return jsonify(d),200

# ── Profile ───────────────────────────────────────────────────────────────────

@app.route("/api/profile", methods=["PUT"])
def update_profile():
    uid, err = require_auth()
    if err: return err
    d  = request.json or {}
    db = get_db()
    username = (d.get("username") or "").strip().lower() or None
    db.execute("UPDATE users SET name=?,phone=?,bio=?,username=?,avatar_b64=? WHERE id=?",
               (d.get("name",""), d.get("phone",""), d.get("bio",""),
                username, d.get("avatar_b64"), uid))
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    db.close()
    return jsonify(user_dict(user)),200

@app.route("/api/password", methods=["PUT"])
def change_password():
    uid, err = require_auth()
    if err: return err
    d  = request.json or {}
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not bcrypt.checkpw((d.get("current") or "").encode(), user["password"].encode()):
        db.close(); return jsonify({"message":"Current password incorrect."}),400
    hashed = bcrypt.hashpw((d.get("new") or "").encode(), bcrypt.gensalt()).decode()
    db.execute("UPDATE users SET password=? WHERE id=?", (hashed,uid))
    db.commit(); db.close()
    return jsonify({"message":"Password updated."}),200

# ── Users / Search ────────────────────────────────────────────────────────────

@app.route("/api/users/search", methods=["GET"])
def search_users():
    uid, err = require_auth()
    if err: return err
    q = (request.args.get("q") or "").strip()
    if len(q) < 2: return jsonify([]),200
    db   = get_db()
    rows = db.execute(
        "SELECT * FROM users WHERE id!=? AND (name LIKE ? OR email LIKE ? OR username LIKE ?) LIMIT 30",
        (uid, f"%{q}%", f"%{q}%", f"%{q}%")
    ).fetchall()
    result = _annotate_friendship(db, uid, rows)
    db.close()
    return jsonify(result),200

@app.route("/api/users/suggested", methods=["GET"])
def suggested_users():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute("SELECT * FROM users WHERE id!=? ORDER BY is_online DESC, name ASC LIMIT 50",(uid,)).fetchall()
    result = _annotate_friendship(db, uid, rows)
    db.close()
    return jsonify(result),200

# ── Friends ───────────────────────────────────────────────────────────────────

@app.route("/api/friends", methods=["GET"])
def get_friends():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute('''
        SELECT u.*, f.id as f_id FROM friendships f
        JOIN users u ON (CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END = u.id)
        WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status='accepted' ORDER BY u.name ASC
    ''',(uid,uid,uid)).fetchall()
    db.close()
    result = [{ **user_dict(r), "is_online": r["id"] in user_sockets } for r in rows]
    return jsonify(result),200

@app.route("/api/friends/requests", methods=["GET"])
def friend_requests():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    inc = db.execute('SELECT u.*, f.id as f_id FROM friendships f JOIN users u ON f.requester_id=u.id WHERE f.addressee_id=? AND f.status=\'pending\' ORDER BY f.created_at DESC',(uid,)).fetchall()
    out = db.execute('SELECT u.*, f.id as f_id FROM friendships f JOIN users u ON f.addressee_id=u.id WHERE f.requester_id=? AND f.status=\'pending\' ORDER BY f.created_at DESC',(uid,)).fetchall()
    db.close()
    return jsonify({"incoming":[{**user_dict(r),"f_id":r["f_id"]} for r in inc],
                    "outgoing":[{**user_dict(r),"f_id":r["f_id"]} for r in out]}),200

@app.route("/api/friends/request/<int:tid>", methods=["POST"])
def send_request(tid):
    uid, err = require_auth()
    if err: return err
    if uid==tid: return jsonify({"message":"Cannot add yourself."}),400
    db = get_db()
    try:
        db.execute("INSERT INTO friendships (requester_id,addressee_id,status) VALUES (?,?,'pending')",(uid,tid))
        db.commit()
        me  = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
        fid = db.execute("SELECT id FROM friendships WHERE requester_id=? AND addressee_id=?",(uid,tid)).fetchone()["id"]
        db.close()
        if tid in user_sockets:
            socketio.emit("friend_request",{**user_dict(me),"f_id":fid},to=f"user_{tid}")
        return jsonify({"message":"Friend request sent!"}),201
    except:
        db.close(); return jsonify({"message":"Request already sent."}),409

@app.route("/api/friends/<int:fid>/accept", methods=["POST"])
def accept_request(fid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    f  = db.execute("SELECT * FROM friendships WHERE id=? AND addressee_id=?",(fid,uid)).fetchone()
    if not f: db.close(); return jsonify({"message":"Not found."}),404
    db.execute("UPDATE friendships SET status='accepted' WHERE id=?",(fid,))
    db.commit()
    me  = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    rid = f["requester_id"]
    db.close()
    if rid in user_sockets:
        socketio.emit("friend_accepted",user_dict(me),to=f"user_{rid}")
    return jsonify({"message":"Accepted!"}),200

@app.route("/api/friends/<int:fid>/decline", methods=["POST"])
def decline_request(fid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM friendships WHERE id=? AND addressee_id=?",(fid,uid))
    db.commit(); db.close()
    return jsonify({"message":"Declined."}),200

@app.route("/api/friends/<int:tid>/remove", methods=["DELETE"])
def remove_friend(tid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM friendships WHERE ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) AND status='accepted'",(uid,tid,tid,uid))
    db.commit(); db.close()
    return jsonify({"message":"Removed."}),200

@app.route("/api/friends/<int:tid>/cancel", methods=["DELETE"])
def cancel_request(tid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM friendships WHERE requester_id=? AND addressee_id=? AND status='pending'",(uid,tid))
    db.commit(); db.close()
    return jsonify({"message":"Cancelled."}),200

# ── Call Directory ───────────────────────────────────────────────────────────

@app.route("/api/users/available", methods=["GET"])
def available_users():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute(
        "SELECT * FROM users WHERE available_for_calls=1 AND id!=? ORDER BY name ASC",
        (uid,)
    ).fetchall()
    result = []
    for r in rows:
        u = user_dict(r)
        u["is_online"] = r["id"] in user_sockets
        result.append(u)
    db.close()
    return jsonify(result), 200

@app.route("/api/users/availability", methods=["PUT"])
def set_availability():
    uid, err = require_auth()
    if err: return err
    available = bool((request.json or {}).get("available", False))
    db = get_db()
    db.execute("UPDATE users SET available_for_calls=? WHERE id=?", (int(available), uid))
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    db.close()
    # Broadcast to everyone
    socketio.emit("user_availability", {"user_id": uid, "available": available, "user": user_dict(user)})
    return jsonify({"available": available}), 200

# ── Blocking ──────────────────────────────────────────────────────────────────

@app.route("/api/users/<int:tid>/block", methods=["POST"])
def block_user(tid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    try:
        db.execute("INSERT INTO blocks (blocker_id,blocked_id) VALUES (?,?)",(uid,tid))
        db.commit()
    except: pass
    db.close()
    return jsonify({"message":"Blocked."}),200

@app.route("/api/users/<int:tid>/block", methods=["DELETE"])
def unblock_user(tid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?",(uid,tid))
    db.commit(); db.close()
    return jsonify({"message":"Unblocked."}),200

@app.route("/api/blocks", methods=["GET"])
def get_blocks():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute("SELECT u.* FROM blocks b JOIN users u ON b.blocked_id=u.id WHERE b.blocker_id=?",(uid,)).fetchall()
    db.close()
    return jsonify([user_dict(r) for r in rows]),200

# ── Messages ──────────────────────────────────────────────────────────────────

def _build_message(db, row):
    d = dict(row)
    d["reactions"] = get_reactions(db, row["id"])
    if row["reply_to_id"]:
        rep = db.execute("SELECT id,content,sender_id,msg_type FROM messages WHERE id=?",(row["reply_to_id"],)).fetchone()
        d["reply_to"] = dict(rep) if rep else None
    else:
        d["reply_to"] = None
    return d

@app.route("/api/messages/conversations", methods=["GET"])
def conversations():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute('''
        SELECT m.*, u.name AS peer_name, u.avatar_color AS peer_color, u.avatar_b64 AS peer_avatar,
               (SELECT COUNT(*) FROM messages m2 WHERE m2.sender_id=u.id AND m2.receiver_id=? AND m2.is_read=0 AND m2.deleted_at IS NULL) AS unread
        FROM messages m
        JOIN users u ON (CASE WHEN m.sender_id=? THEN m.receiver_id ELSE m.sender_id END = u.id)
        WHERE m.id IN (
            SELECT MAX(id) FROM messages
            WHERE (sender_id=? OR receiver_id=?) AND deleted_at IS NULL
            GROUP BY CASE WHEN sender_id < receiver_id THEN sender_id||'_'||receiver_id ELSE receiver_id||'_'||sender_id END
        )
        ORDER BY m.created_at DESC
    ''',(uid,uid,uid,uid)).fetchall()
    result = []
    for r in rows:
        peer_id = r["receiver_id"] if r["sender_id"]==uid else r["sender_id"]
        result.append({
            "peer_id":    peer_id,
            "peer_name":  r["peer_name"],
            "peer_color": r["peer_color"],
            "peer_avatar": r["peer_avatar"],
            "peer_online": peer_id in user_sockets,
            "content":    r["content"] if not r["deleted_at"] else "🗑 Message deleted",
            "msg_type":   r["msg_type"],
            "sender_id":  r["sender_id"],
            "created_at": r["created_at"],
            "unread":     r["unread"],
        })
    db.close()
    return jsonify(result),200

@app.route("/api/messages/<int:peer_id>", methods=["GET"])
def get_messages(peer_id):
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute('''
        SELECT * FROM messages
        WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
        ORDER BY created_at ASC LIMIT 200
    ''',(uid,peer_id,peer_id,uid)).fetchall()
    db.execute("UPDATE messages SET is_read=1 WHERE sender_id=? AND receiver_id=? AND is_read=0",(peer_id,uid))
    db.commit()
    result = [_build_message(db, r) for r in rows]
    db.close()
    # Notify sender their messages were read
    if peer_id in user_sockets:
        socketio.emit("messages_read",{"by": uid},to=f"user_{peer_id}")
    return jsonify(result),200

@app.route("/api/messages/search", methods=["GET"])
def search_messages():
    uid, err = require_auth()
    if err: return err
    q = (request.args.get("q") or "").strip()
    if len(q) < 2: return jsonify([]),200
    db   = get_db()
    rows = db.execute('''
        SELECT m.*, u.name AS sender_name FROM messages m
        JOIN users u ON m.sender_id=u.id
        WHERE (m.sender_id=? OR m.receiver_id=?) AND m.content LIKE ? AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT 30
    ''',(uid,uid,f"%{q}%")).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/messages/<int:mid>", methods=["PUT"])
def edit_message(mid):
    uid, err = require_auth()
    if err: return err
    d  = request.json or {}
    db = get_db()
    m  = db.execute("SELECT * FROM messages WHERE id=? AND sender_id=?",(mid,uid)).fetchone()
    if not m: db.close(); return jsonify({"message":"Not found"}),404
    now = datetime.datetime.utcnow().isoformat()
    db.execute("UPDATE messages SET content=?,edited_at=? WHERE id=?",(d.get("content",""),now,mid))
    db.commit()
    updated = _build_message(db, db.execute("SELECT * FROM messages WHERE id=?",(mid,)).fetchone())
    db.close()
    peer_id = m["receiver_id"] if m["sender_id"]==uid else m["sender_id"]
    socketio.emit("message_edited",updated,to=f"user_{peer_id}")
    socketio.emit("message_edited",updated,to=f"user_{uid}")
    return jsonify(updated),200

@app.route("/api/messages/<int:mid>", methods=["DELETE"])
def delete_message(mid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    m  = db.execute("SELECT * FROM messages WHERE id=? AND sender_id=?",(mid,uid)).fetchone()
    if not m: db.close(); return jsonify({"message":"Not found"}),404
    now = datetime.datetime.utcnow().isoformat()
    db.execute("UPDATE messages SET deleted_at=?,content='' WHERE id=?",(now,mid))
    db.commit(); db.close()
    peer_id = m["receiver_id"] if m["sender_id"]==uid else m["sender_id"]
    socketio.emit("message_deleted",{"id":mid},to=f"user_{peer_id}")
    socketio.emit("message_deleted",{"id":mid},to=f"user_{uid}")
    return jsonify({"message":"Deleted."}),200

@app.route("/api/messages/<int:mid>/pin", methods=["PUT"])
def pin_message(mid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    m  = db.execute("SELECT * FROM messages WHERE id=?",(mid,)).fetchone()
    if not m: db.close(); return jsonify({"message":"Not found"}),404
    new_val = 0 if m["is_pinned"] else 1
    db.execute("UPDATE messages SET is_pinned=? WHERE id=?",(new_val,mid))
    db.commit(); db.close()
    peer_id = m["receiver_id"] if m["sender_id"]==uid else m["sender_id"]
    socketio.emit("message_pinned",{"id":mid,"is_pinned":bool(new_val)},to=f"user_{peer_id}")
    socketio.emit("message_pinned",{"id":mid,"is_pinned":bool(new_val)},to=f"user_{uid}")
    return jsonify({"is_pinned":bool(new_val)}),200

@app.route("/api/messages/<int:mid>/react", methods=["POST"])
def react_message(mid):
    uid, err = require_auth()
    if err: return err
    emoji = (request.json or {}).get("emoji","")
    if not emoji: return jsonify({"message":"Emoji required"}),400
    db  = get_db()
    m   = db.execute("SELECT * FROM messages WHERE id=?",(mid,)).fetchone()
    if not m: db.close(); return jsonify({"message":"Not found"}),404
    existing = db.execute("SELECT id FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?",(mid,uid,emoji)).fetchone()
    if existing:
        db.execute("DELETE FROM message_reactions WHERE id=?",(existing["id"],))
        action = "removed"
    else:
        db.execute("INSERT INTO message_reactions (message_id,user_id,emoji) VALUES (?,?,?)",(mid,uid,emoji))
        action = "added"
    db.commit()
    reactions = get_reactions(db, mid)
    db.close()
    peer_id = m["receiver_id"] if m["sender_id"]==uid else m["sender_id"]
    payload = {"message_id":mid,"reactions":reactions,"action":action}
    socketio.emit("message_reaction",payload,to=f"user_{peer_id}")
    socketio.emit("message_reaction",payload,to=f"user_{uid}")
    return jsonify({"reactions":reactions}),200

# ── Groups ────────────────────────────────────────────────────────────────────

@app.route("/api/groups", methods=["GET"])
def get_groups():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute('''
        SELECT g.*, COUNT(gm2.user_id) as member_count,
               (SELECT content FROM group_messages WHERE group_id=g.id ORDER BY created_at DESC LIMIT 1) as last_msg,
               (SELECT created_at FROM group_messages WHERE group_id=g.id ORDER BY created_at DESC LIMIT 1) as last_msg_at
        FROM groups g
        JOIN group_members gm ON g.id=gm.group_id AND gm.user_id=?
        JOIN group_members gm2 ON g.id=gm2.group_id
        GROUP BY g.id ORDER BY last_msg_at DESC NULLS LAST
    ''',(uid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/groups", methods=["POST"])
def create_group():
    uid, err = require_auth()
    if err: return err
    d    = request.json or {}
    name = (d.get("name") or "").strip()
    if not name: return jsonify({"message":"Name required."}),400
    color = random.choice(ROOM_COLORS)
    db = get_db()
    db.execute("INSERT INTO groups (name,description,avatar_color,owner_id) VALUES (?,?,?,?)",
               (name, d.get("description",""), color, uid))
    db.commit()
    gid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    db.execute("INSERT INTO group_members (group_id,user_id,role) VALUES (?,?,'admin')",(gid,uid))
    # Auto-add platform admins as admin to every group
    for admin_email in ADMIN_EMAILS:
        admin_user = db.execute("SELECT id FROM users WHERE email=?", (admin_email,)).fetchone()
        if admin_user and admin_user["id"] != uid:
            try:
                db.execute("INSERT INTO group_members (group_id,user_id,role) VALUES (?,?,'admin')",
                           (gid, admin_user["id"]))
            except: pass
    # Add initial members
    for mid2 in (d.get("members") or []):
        try:
            db.execute("INSERT INTO group_members (group_id,user_id) VALUES (?,?)",(gid,mid2))
        except: pass
    db.commit()
    group = db.execute("SELECT * FROM groups WHERE id=?",(gid,)).fetchone()
    db.close()
    return jsonify(dict(group)),201

@app.route("/api/groups/<int:gid>", methods=["GET"])
def get_group(gid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    mem = db.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",(gid,uid)).fetchone()
    if not mem: db.close(); return jsonify({"message":"Not a member"}),403
    group = db.execute("SELECT * FROM groups WHERE id=?",(gid,)).fetchone()
    members = db.execute('''
        SELECT u.*, gm.role FROM group_members gm JOIN users u ON gm.user_id=u.id WHERE gm.group_id=?
    ''',(gid,)).fetchall()
    db.close()
    return jsonify({**dict(group),"members":[{**user_dict(r),"role":r["role"],"is_online":r["id"] in user_sockets} for r in members]}),200

@app.route("/api/groups/<int:gid>", methods=["PUT"])
def update_group(gid):
    uid, err = require_auth()
    if err: return err
    d  = request.json or {}
    db = get_db()
    g  = db.execute("SELECT * FROM groups WHERE id=? AND owner_id=?",(gid,uid)).fetchone()
    if not g: db.close(); return jsonify({"message":"Not authorized"}),403
    db.execute("UPDATE groups SET name=?,description=? WHERE id=?",(d.get("name",g["name"]),d.get("description",g["description"]),gid))
    db.commit(); db.close()
    return jsonify({"message":"Updated."}),200

@app.route("/api/groups/<int:gid>", methods=["DELETE"])
def delete_group(gid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    g  = db.execute("SELECT * FROM groups WHERE id=? AND owner_id=?",(gid,uid)).fetchone()
    if not g: db.close(); return jsonify({"message":"Not authorized"}),403
    db.execute("DELETE FROM groups WHERE id=?",(gid,))
    db.commit(); db.close()
    socketio.emit("group_deleted",{"group_id":gid},to=f"group_{gid}")
    return jsonify({"message":"Deleted."}),200

@app.route("/api/groups/<int:gid>/members", methods=["POST"])
def add_group_member(gid):
    uid, err = require_auth()
    if err: return err
    target = (request.json or {}).get("user_id")
    db = get_db()
    try:
        db.execute("INSERT INTO group_members (group_id,user_id) VALUES (?,?)",(gid,target))
        db.commit()
        user = db.execute("SELECT * FROM users WHERE id=?",(target,)).fetchone()
        db.close()
        socketio.emit("group_member_added",{**user_dict(user),"group_id":gid},to=f"group_{gid}")
        socketio.emit("group_added",{"group_id":gid},to=f"user_{target}")
        return jsonify({"message":"Member added."}),201
    except:
        db.close(); return jsonify({"message":"Already a member."}),409

@app.route("/api/groups/<int:gid>/members/<int:mid2>", methods=["DELETE"])
def remove_group_member(gid,mid2):
    uid, err = require_auth()
    if err: return err
    # Platform admins cannot be removed from any group
    db = get_db()
    target = db.execute("SELECT email FROM users WHERE id=?", (mid2,)).fetchone()
    if target and target["email"].lower() in ADMIN_EMAILS:
        db.close()
        return jsonify({"message": "Cannot remove platform admin from group."}), 403
    db.execute("DELETE FROM group_members WHERE group_id=? AND user_id=?",(gid,mid2))
    db.commit(); db.close()
    socketio.emit("group_member_removed",{"user_id":mid2,"group_id":gid},to=f"group_{gid}")
    return jsonify({"message":"Removed."}),200

@app.route("/api/groups/<int:gid>/messages", methods=["GET"])
def group_messages(gid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    mem = db.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",(gid,uid)).fetchone()
    if not mem: db.close(); return jsonify({"message":"Not a member"}),403
    rows = db.execute("SELECT gm.*, u.name AS sender_name, u.avatar_color AS sender_color, u.avatar_b64 AS sender_avatar FROM group_messages gm JOIN users u ON gm.sender_id=u.id WHERE gm.group_id=? ORDER BY gm.created_at ASC LIMIT 200",(gid,)).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["reactions"] = get_reactions(db, r["id"], "group_reactions")
        result.append(d)
    db.close()
    return jsonify(result),200

# ── Stories ───────────────────────────────────────────────────────────────────

@app.route("/api/stories/feed", methods=["GET"])
def stories_feed():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    now  = datetime.datetime.utcnow().isoformat()
    rows = db.execute('''
        SELECT s.*, u.name AS user_name, u.avatar_color AS user_color, u.avatar_b64 AS user_avatar,
               EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id=s.id AND sv.viewer_id=?) AS viewed
        FROM stories s
        JOIN users u ON s.user_id=u.id
        WHERE s.expires_at > ? AND (
            s.user_id=? OR
            s.user_id IN (
                SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END
                FROM friendships WHERE (requester_id=? OR addressee_id=?) AND status='accepted'
            )
        )
        ORDER BY s.created_at DESC
    ''',(uid,now,uid,uid,uid,uid)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/stories", methods=["POST"])
def post_story():
    uid, err = require_auth()
    if err: return err
    d       = request.json or {}
    content = (d.get("content") or "").strip()
    expires = (datetime.datetime.utcnow() + datetime.timedelta(hours=24)).isoformat()
    db = get_db()
    db.execute("INSERT INTO stories (user_id,content,bg_color,type,file_b64,expires_at) VALUES (?,?,?,?,?,?)",
               (uid,content,d.get("bg_color","#6366f1"),d.get("type","text"),d.get("file_b64"),expires))
    db.commit()
    sid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    story = db.execute("SELECT * FROM stories WHERE id=?",(sid,)).fetchone()
    db.close()
    return jsonify(dict(story)),201

@app.route("/api/stories/<int:sid>/view", methods=["POST"])
def view_story(sid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    try:
        db.execute("INSERT INTO story_views (story_id,viewer_id) VALUES (?,?)",(sid,uid))
        db.commit()
    except: pass
    db.close()
    return jsonify({"message":"Viewed."}),200

@app.route("/api/stories/<int:sid>", methods=["DELETE"])
def delete_story(sid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM stories WHERE id=? AND user_id=?",(sid,uid))
    db.commit(); db.close()
    return jsonify({"message":"Deleted."}),200

# ── Contacts ──────────────────────────────────────────────────────────────────

@app.route("/api/contacts", methods=["GET"])
def get_contacts():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute("SELECT * FROM contacts WHERE user_id=? ORDER BY name ASC",(uid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/contacts", methods=["POST"])
def add_contact():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    if not (d.get("name") or "").strip(): return jsonify({"message":"Name required."}),400
    db = get_db()
    db.execute("INSERT INTO contacts (user_id,name,phone,email,notes) VALUES (?,?,?,?,?)",
               (uid,d["name"].strip(),d.get("phone",""),d.get("email",""),d.get("notes","")))
    db.commit()
    cid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    row = db.execute("SELECT * FROM contacts WHERE id=?",(cid,)).fetchone()
    db.close()
    return jsonify(dict(row)),201

@app.route("/api/contacts/<int:cid>", methods=["PUT"])
def update_contact(cid):
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    db.execute("UPDATE contacts SET name=?,phone=?,email=?,notes=? WHERE id=? AND user_id=?",
               (d.get("name",""),d.get("phone",""),d.get("email",""),d.get("notes",""),cid,uid))
    db.commit()
    row = db.execute("SELECT * FROM contacts WHERE id=?",(cid,)).fetchone()
    db.close()
    return jsonify(dict(row)),200

@app.route("/api/contacts/<int:cid>", methods=["DELETE"])
def delete_contact(cid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM contacts WHERE id=? AND user_id=?",(cid,uid))
    db.commit(); db.close()
    return jsonify({"message":"Deleted."}),200

# ── Rooms ─────────────────────────────────────────────────────────────────────

@app.route("/api/rooms", methods=["GET"])
def get_rooms():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute('''
        SELECT r.*, COUNT(DISTINCT rm.user_id) as member_count,
               EXISTS(SELECT 1 FROM room_members WHERE room_id=r.id AND user_id=?) as is_member
        FROM rooms r LEFT JOIN room_members rm ON r.id=rm.room_id
        GROUP BY r.id ORDER BY r.created_at DESC
    ''',(uid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/rooms", methods=["POST"])
def create_room():
    uid, err = require_auth()
    if err: return err
    d    = request.json or {}
    name = (d.get("name") or "").strip()
    if not name: return jsonify({"message":"Name required."}),400
    color = random.choice(ROOM_COLORS)
    db = get_db()
    db.execute("INSERT INTO rooms (name,description,category,avatar_color,owner_id) VALUES (?,?,?,?,?)",
               (name,d.get("description",""),d.get("category","General"),color,uid))
    db.commit()
    rid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    db.execute("INSERT INTO room_members (room_id,user_id) VALUES (?,?)",(rid,uid))
    db.commit()
    room = db.execute("SELECT * FROM rooms WHERE id=?",(rid,)).fetchone()
    db.close()
    return jsonify(dict(room)),201

@app.route("/api/rooms/<int:rid>/join", methods=["POST"])
def join_room_route(rid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    try:
        db.execute("INSERT INTO room_members (room_id,user_id) VALUES (?,?)",(rid,uid))
        db.commit()
    except: pass
    db.close()
    join_room(f"room_{rid}")
    return jsonify({"message":"Joined."}),200

@app.route("/api/rooms/<int:rid>/leave", methods=["DELETE"])
def leave_room_route(rid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM room_members WHERE room_id=? AND user_id=?",(rid,uid))
    db.commit(); db.close()
    leave_room(f"room_{rid}")
    return jsonify({"message":"Left."}),200

@app.route("/api/rooms/<int:rid>/messages", methods=["GET"])
def room_messages_get(rid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT rm.*, u.name AS sender_name, u.avatar_color AS sender_color, u.avatar_b64 AS sender_avatar
        FROM room_messages rm JOIN users u ON rm.sender_id=u.id
        WHERE rm.room_id=? ORDER BY rm.created_at ASC LIMIT 200
    ''',(rid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

# ── Call History ──────────────────────────────────────────────────────────────

@app.route("/api/calls", methods=["GET"])
def get_calls():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    rows = db.execute('''
        SELECT c.*, a.name AS caller_name, a.avatar_color AS caller_color, a.avatar_b64 AS caller_avatar,
               b.name AS receiver_name, b.avatar_color AS receiver_color, b.avatar_b64 AS receiver_avatar
        FROM calls c JOIN users a ON c.caller_id=a.id JOIN users b ON c.receiver_id=b.id
        WHERE c.caller_id=? OR c.receiver_id=? ORDER BY c.created_at DESC LIMIT 50
    ''',(uid,uid)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

# ── SocketIO ──────────────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect(auth):
    uid = socket_auth(auth)
    if not uid: return False
    sid = request.sid
    socket_users[sid] = uid
    if uid not in user_sockets: user_sockets[uid] = set()
    user_sockets[uid].add(sid)
    join_room(f"user_{uid}")
    # Rejoin group rooms
    db = get_db()
    groups = db.execute("SELECT group_id FROM group_members WHERE user_id=?",(uid,)).fetchall()
    rooms  = db.execute("SELECT room_id FROM room_members WHERE user_id=?",(uid,)).fetchall()
    db.execute("UPDATE users SET is_online=1 WHERE id=?",(uid,))
    db.commit(); db.close()
    for g in groups: join_room(f"group_{g['group_id']}")
    for r in rooms:  join_room(f"room_{r['room_id']}")
    emit("user_online",{"user_id":uid},broadcast=True,include_self=False)

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    uid = socket_users.pop(sid,None)
    if uid and uid in user_sockets:
        user_sockets[uid].discard(sid)
        if not user_sockets[uid]:
            del user_sockets[uid]
            now = datetime.datetime.utcnow().isoformat()
            db = get_db()
            db.execute("UPDATE users SET is_online=0, last_seen=?, available_for_calls=0 WHERE id=?",(now,uid))
            db.commit(); db.close()
            emit("user_offline",      {"user_id":uid},broadcast=True,include_self=False)
            emit("user_availability", {"user_id":uid,"available":False},broadcast=True,include_self=False)

@socketio.on("send_message")
def on_send_message(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to      = data.get("to")
    content = (data.get("content") or "").strip()
    mtype   = data.get("msg_type","text")
    file_b64 = data.get("file_b64")
    file_name = data.get("file_name")
    reply_to = data.get("reply_to_id")
    expires  = data.get("expires_in")  # minutes
    if not to or (not content and not file_b64): return
    db = get_db()
    # Validate receiver exists
    if not db.execute("SELECT id FROM users WHERE id=?", (to,)).fetchone():
        db.close(); return
    exp_dt = None
    if expires:
        try:
            exp_dt = (datetime.datetime.utcnow() + datetime.timedelta(minutes=int(expires))).isoformat()
        except (ValueError, TypeError):
            pass
    db.execute("INSERT INTO messages (sender_id,receiver_id,content,msg_type,file_b64,file_name,reply_to_id,expires_at) VALUES (?,?,?,?,?,?,?,?)",
               (uid,to,content,mtype,file_b64,file_name,reply_to,exp_dt))
    db.commit()
    mid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    row = db.execute("SELECT * FROM messages WHERE id=?",(mid,)).fetchone()
    msg = _build_message(db, row)
    # ── Bad word detection ──
    if content and mtype == "text":
        found = check_bad_words(content)
        if found:
            flag_message(db, mid, uid, content, found, "dm")

    # ── Check achievements ──
    check_message_achievements(db, uid)

    # ── Push notification if receiver is offline ──
    if to not in user_sockets:
        sender = db.execute("SELECT name, avatar_color FROM users WHERE id=?",(uid,)).fetchone()
        sender_name = sender["name"] if sender else "Someone"
        notif_body = content if content else ("📷 Image" if mtype=="image" else "🎤 Voice message" if mtype=="audio" else "📎 File")
        send_push_to_user(
            to,
            title=f"💬 {sender_name}",
            body=notif_body[:100],
            data={"type":"new_message","sender_id":uid,"sender_name":sender_name,"chat_url":f"/messages/{uid}"}
        )

    db.close()
    emit("new_message",msg,to=f"user_{to}")
    emit("new_message",msg,to=f"user_{uid}")

@socketio.on("send_group_message")
def on_group_message(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    gid     = data.get("group_id")
    content = (data.get("content") or "").strip()
    mtype   = data.get("msg_type","text")
    file_b64 = data.get("file_b64")
    file_name = data.get("file_name")
    if not gid or (not content and not file_b64): return
    db = get_db()
    mem = db.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",(gid,uid)).fetchone()
    if not mem: db.close(); return
    sender = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    db.execute("INSERT INTO group_messages (group_id,sender_id,content,msg_type,file_b64,file_name) VALUES (?,?,?,?,?,?)",
               (gid,uid,content,mtype,file_b64,file_name))
    db.commit()
    mid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    db.close()
    msg = {"id":mid,"group_id":gid,"sender_id":uid,"content":content,"msg_type":mtype,
           "file_b64":file_b64,"file_name":file_name,"created_at":datetime.datetime.utcnow().isoformat(),
           "sender_name":sender["name"],"sender_color":sender["avatar_color"],"sender_avatar":sender["avatar_b64"]}
    if content and mtype == "text":
        found = check_bad_words(content)
        if found:
            flag_message(db, mid, uid, content, found, "group")

    # Push notifications to offline group members
    db2 = get_db()
    group = db2.execute("SELECT name FROM groups WHERE id=?",(gid,)).fetchone()
    group_name = group["name"] if group else "Group"
    members = db2.execute("SELECT user_id FROM group_members WHERE group_id=? AND user_id!=?",(gid,uid)).fetchall()
    db2.close()
    for m in members:
        mid2 = m["user_id"]
        if mid2 not in user_sockets:
            notif_body = content if content else ("📷 Image" if mtype=="image" else "📎 File")
            send_push_to_user(
                mid2,
                title=f"💬 {sender['name']} in {group_name}",
                body=notif_body[:100],
                data={"type":"group_message","group_id":gid,"chat_url":f"/groups/{gid}"}
            )

    emit("group_message",msg,to=f"group_{gid}")

@socketio.on("send_room_message")
def on_room_message(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    rid     = data.get("room_id")
    content = (data.get("content") or "").strip()
    if not rid or not content: return
    db = get_db()
    mem = db.execute("SELECT id FROM room_members WHERE room_id=? AND user_id=?",(rid,uid)).fetchone()
    if not mem: db.close(); return
    sender = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    db.execute("INSERT INTO room_messages (room_id,sender_id,content) VALUES (?,?,?)",(rid,uid,content))
    db.commit()
    mid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    db.close()
    msg = {"id":mid,"room_id":rid,"sender_id":uid,"content":content,
           "created_at":datetime.datetime.utcnow().isoformat(),
           "sender_name":sender["name"],"sender_color":sender["avatar_color"],"sender_avatar":sender["avatar_b64"]}
    if content:
        found = check_bad_words(content)
        if found:
            flag_message(db, mid, uid, content, found, "room")
    emit("room_message",msg,to=f"room_{rid}")

@socketio.on("typing")
def on_typing(data):
    uid = socket_users.get(request.sid)
    if uid and data.get("to"): emit("typing",{"from":uid},to=f"user_{data['to']}")

@socketio.on("stop_typing")
def on_stop_typing(data):
    uid = socket_users.get(request.sid)
    if uid and data.get("to"): emit("stop_typing",{"from":uid},to=f"user_{data['to']}")

@socketio.on("group_typing")
def on_group_typing(data):
    uid = socket_users.get(request.sid)
    if uid and data.get("group_id"):
        emit("group_typing",{"from":uid,"name":data.get("name","")},to=f"group_{data['group_id']}")

# ── WebRTC Signaling ──────────────────────────────────────────────────────────

@socketio.on("call_offer")
def on_call_offer(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to = data.get("to")
    db = get_db()
    caller = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    db.execute("INSERT INTO calls (caller_id,receiver_id,status,call_type) VALUES (?,?,'initiated',?)",
               (uid,to,data.get("call_type","audio")))
    db.commit()
    call_id = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    db.close()
    call_payload = {
        "from":uid,"call_id":call_id,"offer":data.get("offer"),
        "call_type":data.get("call_type","audio"),
        "caller_name":caller["name"],"caller_color":caller["avatar_color"]
    }
    emit("call_incoming", call_payload, to=f"user_{to}")

    # Receiver is offline — send push notification so phone rings
    if to not in user_sockets:
        call_type_label = "📹 Video call" if data.get("call_type") == "video" else "📞 Audio call"
        send_push_to_user(
            to,
            title=f"📞 {caller['name']} is calling you",
            body=f"{call_type_label} — open THE CHATING to answer",
            data={"type":"incoming_call","caller_id":uid,"caller_name":caller["name"],
                  "call_type":data.get("call_type","audio"),"call_id":call_id}
        )
        # Also mark call as missed after 30s if still not answered
        db = get_db()
        db.execute("UPDATE calls SET status='missed' WHERE id=? AND status='initiated'",(call_id,))
        db.commit(); db.close()

@socketio.on("call_answer")
def on_call_answer(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to=data.get("to"); call_id=data.get("call_id")
    db=get_db(); db.execute("UPDATE calls SET status='answered' WHERE id=?",(call_id,)); db.commit(); db.close()
    emit("call_answered",{"from":uid,"answer":data.get("answer"),"call_id":call_id},to=f"user_{to}")

@socketio.on("call_decline")
def on_call_decline(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to=data.get("to"); call_id=data.get("call_id")
    db=get_db(); db.execute("UPDATE calls SET status='declined' WHERE id=?",(call_id,)); db.commit(); db.close()
    emit("call_declined",{"from":uid},to=f"user_{to}")

@socketio.on("call_end")
def on_call_end(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to=data.get("to"); call_id=data.get("call_id"); duration=data.get("duration",0)
    db=get_db(); db.execute("UPDATE calls SET status='ended',duration=? WHERE id=?",(duration,call_id)); db.commit(); db.close()
    emit("call_ended",{"from":uid},to=f"user_{to}")

@socketio.on("ice_candidate")
def on_ice_candidate(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to=data.get("to")
    if to: emit("ice_candidate",{"from":uid,"candidate":data.get("candidate")},to=f"user_{to}")

# ── WebSocket Media Relay (audio/video through server) ────────────────────────

@socketio.on("call_ws_audio")
def on_ws_audio(data):
    """Relay raw PCM audio chunk to the other participant."""
    uid = socket_users.get(request.sid)
    if not uid: return
    to = data.get("to")
    if to:
        emit("call_ws_audio", {
            "from": uid,
            "pcm16": data.get("pcm16"),
            "sampleRate": data.get("sampleRate", 16000),
        }, to=f"user_{to}")

@socketio.on("call_ws_video")
def on_ws_video(data):
    """Relay JPEG video frame to the other participant."""
    uid = socket_users.get(request.sid)
    if not uid: return
    to = data.get("to")
    if to:
        emit("call_ws_video", {
            "from": uid,
            "frame": data.get("frame"),
        }, to=f"user_{to}")

# ── Push Notifications ───────────────────────────────────────────────────────

@app.route("/api/push/vapid-key", methods=["GET"])
def push_vapid_key():
    return jsonify({"publicKey": VAPID_PUBLIC}), 200

@app.route("/api/push/subscribe", methods=["POST"])
def push_subscribe():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    endpoint = d.get("endpoint")
    p256dh   = (d.get("keys") or {}).get("p256dh")
    auth     = (d.get("keys") or {}).get("auth")
    if not endpoint or not p256dh or not auth:
        return jsonify({"message": "Invalid subscription."}), 400
    db = get_db()
    try:
        db.execute(
            "INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)",
            (uid, endpoint, p256dh, auth)
        )
        db.commit()
    except Exception:
        pass
    db.close()
    return jsonify({"message": "Subscribed."}), 201

@app.route("/api/push/unsubscribe", methods=["DELETE"])
def push_unsubscribe():
    uid, err = require_auth()
    if err: return err
    endpoint = (request.json or {}).get("endpoint")
    db = get_db()
    db.execute("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", (uid, endpoint))
    db.commit(); db.close()
    return jsonify({"message": "Unsubscribed."}), 200

# ── Admin (owner-only) ────────────────────────────────────────────────────────

def require_admin():
    """Returns (uid, None) only if the authenticated user is an admin."""
    uid, err = require_auth()
    if err: return None, err
    db   = get_db()
    user = db.execute("SELECT email FROM users WHERE id=?", (uid,)).fetchone()
    db.close()
    if not user or user["email"].lower() not in ADMIN_EMAILS:
        return None, (jsonify({"message": "Forbidden"}), 403)
    return uid, None

@app.route("/api/admin/stats", methods=["GET"])
def admin_stats():
    uid, err = require_admin()
    if err: return err
    db  = get_db()
    now = datetime.datetime.utcnow()

    total_users    = db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    online_now     = db.execute("SELECT COUNT(*) as c FROM users WHERE is_online=1").fetchone()["c"]
    total_messages = db.execute("SELECT COUNT(*) as c FROM messages WHERE deleted_at IS NULL").fetchone()["c"]
    total_groups   = db.execute("SELECT COUNT(*) as c FROM groups").fetchone()["c"]
    total_rooms    = db.execute("SELECT COUNT(*) as c FROM rooms").fetchone()["c"]
    total_stories  = db.execute("SELECT COUNT(*) as c FROM stories WHERE expires_at > ?",(now.isoformat(),)).fetchone()["c"]

    today_start = now.replace(hour=0,minute=0,second=0,microsecond=0).isoformat()
    week_start  = (now - datetime.timedelta(days=7)).isoformat()

    signups_today = db.execute("SELECT COUNT(*) as c FROM users WHERE created_at >= ?", (today_start,)).fetchone()["c"]
    signups_week  = db.execute("SELECT COUNT(*) as c FROM users WHERE created_at >= ?", (week_start,)).fetchone()["c"]
    msgs_today    = db.execute("SELECT COUNT(*) as c FROM messages WHERE created_at >= ? AND deleted_at IS NULL",(today_start,)).fetchone()["c"]

    # Signups by day for last 14 days
    signups_chart = []
    for i in range(13, -1, -1):
        day_start = (now - datetime.timedelta(days=i)).replace(hour=0,minute=0,second=0).isoformat()
        day_end   = (now - datetime.timedelta(days=i-1)).replace(hour=0,minute=0,second=0).isoformat() if i > 0 else now.isoformat()
        count = db.execute("SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at < ?",(day_start,day_end)).fetchone()["c"]
        label = (now - datetime.timedelta(days=i)).strftime("%b %d")
        signups_chart.append({"day": label, "count": count})

    db.close()
    return jsonify({
        "total_users":    total_users,
        "online_now":     online_now,
        "total_messages": total_messages,
        "total_groups":   total_groups,
        "total_rooms":    total_rooms,
        "total_stories":  total_stories,
        "signups_today":  signups_today,
        "signups_week":   signups_week,
        "msgs_today":     msgs_today,
        "signups_chart":  signups_chart,
    }), 200

@app.route("/api/admin/users", methods=["GET"])
def admin_users():
    uid, err = require_admin()
    if err: return err
    search = (request.args.get("q") or "").strip()
    sort   = request.args.get("sort", "created_at")
    order  = "DESC" if request.args.get("order","desc")=="desc" else "ASC"
    page   = max(1, int(request.args.get("page",1)))
    limit  = 20
    offset = (page-1) * limit

    allowed_sorts = {"created_at","name","email","last_seen","is_online"}
    if sort not in allowed_sorts: sort = "created_at"

    db = get_db()
    where = ""
    params = []
    if search:
        where = "WHERE name LIKE ? OR email LIKE ? OR username LIKE ?"
        params = [f"%{search}%", f"%{search}%", f"%{search}%"]

    total = db.execute(f"SELECT COUNT(*) as c FROM users {where}", params).fetchone()["c"]
    rows  = db.execute(
        f"SELECT * FROM users {where} ORDER BY {sort} {order} LIMIT ? OFFSET ?",
        params + [limit, offset]
    ).fetchall()

    result = []
    for r in rows:
        friends_count  = db.execute("SELECT COUNT(*) as c FROM friendships WHERE (requester_id=? OR addressee_id=?) AND status='accepted'",(r["id"],r["id"])).fetchone()["c"]
        messages_count = db.execute("SELECT COUNT(*) as c FROM messages WHERE sender_id=? AND deleted_at IS NULL",(r["id"],)).fetchone()["c"]
        u = user_dict(r)
        u["friends_count"]  = friends_count
        u["messages_count"] = messages_count
        u["is_online_live"]  = r["id"] in user_sockets
        result.append(u)

    db.close()
    return jsonify({"users": result, "total": total, "page": page, "pages": (total+limit-1)//limit}), 200

@app.route("/api/admin/users/<int:target_id>", methods=["DELETE"])
def admin_delete_user(target_id):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    user = db.execute("SELECT email FROM users WHERE id=?", (target_id,)).fetchone()
    if user and user["email"].lower() in ADMIN_EMAILS:
        db.close(); return jsonify({"message":"Cannot delete admin account."}), 400
    db.execute("DELETE FROM users WHERE id=?", (target_id,))
    db.commit(); db.close()
    # Force disconnect if online
    if target_id in user_sockets:
        for sid in list(user_sockets[target_id]):
            socketio.emit("force_logout", {"reason": "Your account has been deleted."}, to=sid)
    return jsonify({"message": "User deleted."}), 200

@app.route("/api/admin/users/<int:target_id>/ban", methods=["POST"])
def admin_ban_user(target_id):
    uid, err = require_admin()
    if err: return err
    d = request.json or {}
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (target_id,)).fetchone()
    if not user: db.close(); return jsonify({"message":"Not found"}), 404
    if user["email"].lower() in ADMIN_EMAILS:
        db.close(); return jsonify({"message":"Cannot ban admin."}), 400
    now = datetime.datetime.utcnow().isoformat()
    reason = (d.get("reason") or "").strip() or "Banned by admin."
    db.execute("UPDATE users SET is_banned=1, ban_reason=?, banned_at=? WHERE id=?", (reason, now, target_id))
    db.commit(); db.close()
    # Force disconnect
    if target_id in user_sockets:
        for sid in list(user_sockets[target_id]):
            socketio.emit("force_logout", {"reason": f"You have been banned. Reason: {reason}"}, to=sid)
    return jsonify({"message": "User banned.", "ban_reason": reason}), 200

@app.route("/api/admin/users/<int:target_id>/unban", methods=["POST"])
def admin_unban_user(target_id):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("UPDATE users SET is_banned=0, ban_reason=NULL, banned_at=NULL WHERE id=?", (target_id,))
    db.commit(); db.close()
    return jsonify({"message": "User unbanned."}), 200

@app.route("/api/admin/users/<int:target_id>/kick", methods=["POST"])
def admin_kick_user(target_id):
    uid, err = require_admin()
    if err: return err
    if target_id in user_sockets:
        for sid in list(user_sockets[target_id]):
            socketio.emit("force_logout", {"reason": "You have been disconnected by an admin."}, to=sid)
        return jsonify({"message": "User kicked.", "was_online": True}), 200
    return jsonify({"message": "User is not online.", "was_online": False}), 200

@app.route("/api/admin/users/<int:target_id>/details", methods=["GET"])
def admin_user_details(target_id):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (target_id,)).fetchone()
    if not user: db.close(); return jsonify({"message":"Not found"}), 404
    friends_count  = db.execute("SELECT COUNT(*) as c FROM friendships WHERE (requester_id=? OR addressee_id=?) AND status='accepted'",(target_id,target_id)).fetchone()["c"]
    msgs_sent      = db.execute("SELECT COUNT(*) as c FROM messages WHERE sender_id=? AND deleted_at IS NULL",(target_id,)).fetchone()["c"]
    msgs_received  = db.execute("SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND deleted_at IS NULL",(target_id,)).fetchone()["c"]
    groups_count   = db.execute("SELECT COUNT(*) as c FROM group_members WHERE user_id=?",(target_id,)).fetchone()["c"]
    rooms_count    = db.execute("SELECT COUNT(*) as c FROM room_members WHERE user_id=?",(target_id,)).fetchone()["c"]
    stories_count  = db.execute("SELECT COUNT(*) as c FROM stories WHERE user_id=?",(target_id,)).fetchone()["c"]
    recent_msgs    = db.execute('''
        SELECT m.content, m.created_at, m.msg_type, u.name as peer_name
        FROM messages m JOIN users u ON (CASE WHEN m.sender_id=? THEN m.receiver_id ELSE m.sender_id END = u.id)
        WHERE (m.sender_id=? OR m.receiver_id=?) AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT 10
    ''',(target_id,target_id,target_id)).fetchall()
    db.close()
    d = user_dict(user)
    d.update({
        "friends_count":  friends_count,
        "msgs_sent":      msgs_sent,
        "msgs_received":  msgs_received,
        "groups_count":   groups_count,
        "rooms_count":    rooms_count,
        "stories_count":  stories_count,
        "is_online_live": target_id in user_sockets,
        "recent_msgs":    [dict(r) for r in recent_msgs],
    })
    return jsonify(d), 200

@app.route("/api/admin/broadcast", methods=["POST"])
def admin_broadcast():
    uid, err = require_admin()
    if err: return err
    d = request.json or {}
    message = (d.get("message") or "").strip()
    if not message: return jsonify({"message":"Message required."}), 400
    db = get_db()
    admin = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    db.close()
    socketio.emit("broadcast", {
        "message": message,
        "from": admin["name"],
        "timestamp": datetime.datetime.utcnow().isoformat()
    })
    return jsonify({"message": f"Broadcast sent to all {len(user_sockets)} online users."}), 200

@app.route("/api/admin/messages", methods=["GET"])
def admin_messages():
    uid, err = require_admin()
    if err: return err
    page  = max(1, int(request.args.get("page", 1)))
    limit = 30
    offset = (page-1) * limit
    q = (request.args.get("q") or "").strip()
    db = get_db()
    where = "WHERE m.deleted_at IS NULL"
    params = []
    if q:
        where += " AND m.content LIKE ?"
        params.append(f"%{q}%")
    total = db.execute(f"SELECT COUNT(*) as c FROM messages m {where}", params).fetchone()["c"]
    rows  = db.execute(f'''
        SELECT m.*, s.name as sender_name, s.avatar_color as sender_color,
               r.name as receiver_name, r.avatar_color as receiver_color
        FROM messages m
        JOIN users s ON m.sender_id=s.id
        JOIN users r ON m.receiver_id=r.id
        {where}
        ORDER BY m.created_at DESC LIMIT ? OFFSET ?
    ''', params + [limit, offset]).fetchall()
    db.close()
    return jsonify({"messages":[dict(r) for r in rows], "total":total, "page":page, "pages":(total+limit-1)//limit}), 200

@app.route("/api/admin/messages/<int:mid>", methods=["DELETE"])
def admin_delete_message(mid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    m  = db.execute("SELECT * FROM messages WHERE id=?", (mid,)).fetchone()
    if not m: db.close(); return jsonify({"message":"Not found"}), 404
    now = datetime.datetime.utcnow().isoformat()
    db.execute("UPDATE messages SET deleted_at=?, content='' WHERE id=?", (now, mid))
    db.commit(); db.close()
    socketio.emit("message_deleted", {"id": mid}, to=f"user_{m['sender_id']}")
    socketio.emit("message_deleted", {"id": mid}, to=f"user_{m['receiver_id']}")
    return jsonify({"message":"Deleted."}), 200

@app.route("/api/admin/flagged", methods=["GET"])
def admin_flagged():
    uid, err = require_admin()
    if err: return err
    page   = max(1, int(request.args.get("page",1)))
    limit  = 30
    offset = (page-1)*limit
    only_unreviewed = request.args.get("unreviewed","0") == "1"
    db = get_db()
    where = "WHERE f.is_reviewed=0" if only_unreviewed else ""
    total = db.execute(f"SELECT COUNT(*) as c FROM flagged_messages f {where}").fetchone()["c"]
    rows  = db.execute(f'''
        SELECT f.*, u.name as sender_name, u.email as sender_email,
               u.avatar_color as sender_color, u.avatar_b64 as sender_avatar,
               u.is_banned as sender_banned
        FROM flagged_messages f
        JOIN users u ON f.sender_id=u.id
        {where}
        ORDER BY f.created_at DESC LIMIT ? OFFSET ?
    ''', (limit, offset)).fetchall()
    db.close()
    return jsonify({"flags":[dict(r) for r in rows],"total":total,"page":page,"pages":(total+limit-1)//limit}), 200

@app.route("/api/admin/flagged/<int:fid>/review", methods=["POST"])
def admin_review_flag(fid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("UPDATE flagged_messages SET is_reviewed=1 WHERE id=?", (fid,))
    db.commit(); db.close()
    return jsonify({"message":"Marked as reviewed."}), 200

@app.route("/api/admin/flagged/<int:fid>/review", methods=["DELETE"])
def admin_unreview_flag(fid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("UPDATE flagged_messages SET is_reviewed=0 WHERE id=?", (fid,))
    db.commit(); db.close()
    return jsonify({"message":"Unmarked."}), 200

@app.route("/api/admin/online", methods=["GET"])
def admin_online():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    online_ids = list(user_sockets.keys())
    if not online_ids:
        db.close(); return jsonify([]), 200
    placeholders = ','.join('?' * len(online_ids))
    rows = db.execute(f"SELECT * FROM users WHERE id IN ({placeholders})", online_ids).fetchall()
    db.close()
    return jsonify([user_dict(r) for r in rows]), 200

# ── Starred Messages ─────────────────────────────────────────────────────────

@app.route("/api/messages/<int:mid>/star", methods=["PUT"])
def star_message(mid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    m = db.execute("SELECT * FROM messages WHERE id=? AND (sender_id=? OR receiver_id=?)",(mid,uid,uid)).fetchone()
    if not m: db.close(); return jsonify({"message":"Not found"}),404
    new_val = 0 if m["is_starred"] else 1
    db.execute("UPDATE messages SET is_starred=? WHERE id=?",(new_val,mid))
    db.commit(); db.close()
    return jsonify({"is_starred":bool(new_val)}),200

@app.route("/api/messages/starred", methods=["GET"])
def get_starred():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT m.*, u.name as sender_name FROM messages m
        JOIN users u ON m.sender_id=u.id
        WHERE (m.sender_id=? OR m.receiver_id=?) AND m.is_starred=1 AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT 100
    ''',(uid,uid)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

# ── Pinned / Archived Conversations ──────────────────────────────────────────

def _get_or_create_conv_settings(db, user_id, peer_id):
    s = db.execute("SELECT * FROM conversation_settings WHERE user_id=? AND peer_id=?",(user_id,peer_id)).fetchone()
    if not s:
        db.execute("INSERT OR IGNORE INTO conversation_settings (user_id,peer_id) VALUES (?,?)",(user_id,peer_id))
        db.commit()
        s = db.execute("SELECT * FROM conversation_settings WHERE user_id=? AND peer_id=?",(user_id,peer_id)).fetchone()
    return s

@app.route("/api/conversations/<int:peer_id>/pin", methods=["PUT"])
def pin_conversation(peer_id):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    s = _get_or_create_conv_settings(db, uid, peer_id)
    new_val = 0 if s["is_pinned"] else 1
    db.execute("UPDATE conversation_settings SET is_pinned=? WHERE user_id=? AND peer_id=?",(new_val,uid,peer_id))
    db.commit(); db.close()
    return jsonify({"is_pinned":bool(new_val)}),200

@app.route("/api/conversations/<int:peer_id>/archive", methods=["PUT"])
def archive_conversation(peer_id):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    s = _get_or_create_conv_settings(db, uid, peer_id)
    new_val = 0 if s["is_archived"] else 1
    db.execute("UPDATE conversation_settings SET is_archived=? WHERE user_id=? AND peer_id=?",(new_val,uid,peer_id))
    db.commit(); db.close()
    return jsonify({"is_archived":bool(new_val)}),200

@app.route("/api/conversations/<int:peer_id>/mute", methods=["PUT"])
def mute_conversation(peer_id):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    s = _get_or_create_conv_settings(db, uid, peer_id)
    new_val = 0 if s["is_muted"] else 1
    db.execute("UPDATE conversation_settings SET is_muted=? WHERE user_id=? AND peer_id=?",(new_val,uid,peer_id))
    db.commit(); db.close()
    return jsonify({"is_muted":bool(new_val)}),200

@app.route("/api/conversations/<int:peer_id>/wallpaper", methods=["PUT"])
def set_wallpaper(peer_id):
    uid, err = require_auth()
    if err: return err
    wallpaper = (request.json or {}).get("wallpaper","")
    db = get_db()
    _get_or_create_conv_settings(db, uid, peer_id)
    db.execute("UPDATE conversation_settings SET wallpaper=? WHERE user_id=? AND peer_id=?",(wallpaper,uid,peer_id))
    db.commit(); db.close()
    return jsonify({"message":"Wallpaper updated."}),200

# ── Message Forwarding ────────────────────────────────────────────────────────

@app.route("/api/messages/<int:mid>/forward", methods=["POST"])
def forward_message(mid):
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    targets = d.get("to",[])   # list of user_ids or group_ids
    target_type = d.get("type","dm")  # "dm" or "group"
    db = get_db()
    orig = db.execute("SELECT * FROM messages WHERE id=?",(mid,)).fetchone()
    if not orig: db.close(); return jsonify({"message":"Not found"}),404
    now = datetime.datetime.utcnow().isoformat()
    count = 0
    for t in targets:
        if target_type == "dm":
            db.execute("INSERT INTO messages (sender_id,receiver_id,content,msg_type,file_b64,file_name,forward_from_id,created_at) VALUES (?,?,?,?,?,?,?,?)",
                       (uid,t,orig["content"],orig["msg_type"],orig["file_b64"],orig["file_name"],mid,now))
            mid2 = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
            msg = dict(db.execute("SELECT * FROM messages WHERE id=?",(mid2,)).fetchone())
            emit_safe = lambda: socketio.emit("new_message",msg,to=f"user_{t}")
        else:
            db.execute("INSERT INTO group_messages (group_id,sender_id,content,msg_type,file_b64,file_name,forward_from_id,created_at) VALUES (?,?,?,?,?,?,?,?)",
                       (t,uid,orig["content"],orig["msg_type"],orig["file_b64"],orig["file_name"],mid,now))
        count += 1
    db.commit(); db.close()
    return jsonify({"message":f"Forwarded to {count} chats."}),200

# ── Polls ─────────────────────────────────────────────────────────────────────

@app.route("/api/polls", methods=["POST"])
def create_poll():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    question = (d.get("question") or "").strip()
    options  = d.get("options",[])
    if not question or len(options) < 2:
        return jsonify({"message":"Question and at least 2 options required."}),400
    db = get_db()
    db.execute("INSERT INTO polls (creator_id,chat_id,group_id,question,options,is_multi) VALUES (?,?,?,?,?,?)",
               (uid, d.get("chat_id"), d.get("group_id"), question, json.dumps(options), int(d.get("is_multi",0))))
    db.commit()
    pid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    poll = dict(db.execute("SELECT * FROM polls WHERE id=?",(pid,)).fetchone())
    poll["options"] = json.loads(poll["options"])
    poll["votes"]   = {}
    db.close()
    return jsonify(poll),201

@app.route("/api/polls/<int:pid>", methods=["GET"])
def get_poll(pid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    poll = db.execute("SELECT * FROM polls WHERE id=?",(pid,)).fetchone()
    if not poll: db.close(); return jsonify({"message":"Not found"}),404
    votes = db.execute("SELECT option_idx, COUNT(*) as c, GROUP_CONCAT(user_id) as uids FROM poll_votes WHERE poll_id=? GROUP BY option_idx",(pid,)).fetchall()
    my_votes = [v["option_idx"] for v in db.execute("SELECT option_idx FROM poll_votes WHERE poll_id=? AND user_id=?",(pid,uid)).fetchall()]
    db.close()
    d = dict(poll)
    d["options"] = json.loads(d["options"])
    d["vote_counts"] = {v["option_idx"]: v["c"] for v in votes}
    d["my_votes"] = my_votes
    d["total_votes"] = sum(d["vote_counts"].values())
    return jsonify(d),200

@app.route("/api/polls/<int:pid>/vote", methods=["POST"])
def vote_poll(pid):
    uid, err = require_auth()
    if err: return err
    option = (request.json or {}).get("option_idx")
    if option is None: return jsonify({"message":"option_idx required"}),400
    db = get_db()
    poll = db.execute("SELECT * FROM polls WHERE id=?",(pid,)).fetchone()
    if not poll or poll["is_closed"]: db.close(); return jsonify({"message":"Poll closed."}),400
    try:
        db.execute("INSERT INTO poll_votes (poll_id,user_id,option_idx) VALUES (?,?,?)",(pid,uid,option))
        db.commit()
    except:
        db.execute("DELETE FROM poll_votes WHERE poll_id=? AND user_id=? AND option_idx=?",(pid,uid,option))
        db.commit()
    db.close()
    return get_poll(pid)

# ── User Status ───────────────────────────────────────────────────────────────

@app.route("/api/users/status", methods=["PUT"])
def set_status():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    db.execute("UPDATE users SET status_text=?,status_emoji=? WHERE id=?",
               (d.get("text","")[:50], d.get("emoji",""), uid))
    db.commit(); db.close()
    return jsonify({"message":"Status updated."}),200

# ── User Reports ──────────────────────────────────────────────────────────────

@app.route("/api/users/<int:tid>/report", methods=["POST"])
def report_user(tid):
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    reason = (d.get("reason") or "").strip()
    if not reason: return jsonify({"message":"Reason required."}),400
    db = get_db()
    db.execute("INSERT INTO reports (reporter_id,reported_id,reason,message_id) VALUES (?,?,?,?)",
               (uid, tid, reason, d.get("message_id")))
    db.commit()
    # Notify admins
    rep = db.execute("SELECT * FROM users WHERE id=?",(tid,)).fetchone()
    reporter = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    db.close()
    notify_admins("user_reported", {"reporter":user_dict(reporter),"reported":user_dict(rep),"reason":reason})
    return jsonify({"message":"Report submitted. Admin will review it."}),201

# ── Group Invite Links ────────────────────────────────────────────────────────

@app.route("/api/groups/<int:gid>/invite", methods=["POST"])
def create_invite(gid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    mem = db.execute("SELECT role FROM group_members WHERE group_id=? AND user_id=?",(gid,uid)).fetchone()
    if not mem: db.close(); return jsonify({"message":"Not a member."}),403
    d = request.json or {}
    import secrets
    code = secrets.token_urlsafe(8)
    expires = None
    if d.get("expires_hours"):
        expires = (datetime.datetime.utcnow() + datetime.timedelta(hours=int(d["expires_hours"]))).isoformat()
    db.execute("INSERT INTO group_invites (group_id,code,created_by,max_uses,expires_at) VALUES (?,?,?,?,?)",
               (gid, code, uid, d.get("max_uses",0), expires))
    db.commit(); db.close()
    invite_url = f"https://the-chating.trading-ai.bot/join/{code}"
    return jsonify({"code":code,"url":invite_url}),201

@app.route("/api/groups/join/<code>", methods=["POST"])
def join_via_invite(code):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    invite = db.execute("SELECT * FROM group_invites WHERE code=?",(code,)).fetchone()
    if not invite: db.close(); return jsonify({"message":"Invalid invite link."}),404
    now = datetime.datetime.utcnow().isoformat()
    if invite["expires_at"] and invite["expires_at"] < now:
        db.close(); return jsonify({"message":"Invite link expired."}),410
    if invite["max_uses"] and invite["use_count"] >= invite["max_uses"]:
        db.close(); return jsonify({"message":"Invite link used up."}),410
    gid = invite["group_id"]
    try:
        db.execute("INSERT INTO group_members (group_id,user_id) VALUES (?,?)",(gid,uid))
        db.execute("UPDATE group_invites SET use_count=use_count+1 WHERE code=?",(code,))
        db.commit()
    except: pass
    group = db.execute("SELECT * FROM groups WHERE id=?",(gid,)).fetchone()
    db.close()
    return jsonify({"message":"Joined!","group":dict(group)}),200

# ── Verified Badge ────────────────────────────────────────────────────────────

@app.route("/api/admin/users/<int:tid>/verify", methods=["POST"])
def toggle_verified(tid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    user = db.execute("SELECT is_verified FROM users WHERE id=?",(tid,)).fetchone()
    if not user: db.close(); return jsonify({"message":"Not found"}),404
    new_val = 0 if user["is_verified"] else 1
    db.execute("UPDATE users SET is_verified=? WHERE id=?",(new_val,tid))
    db.commit(); db.close()
    return jsonify({"is_verified":bool(new_val)}),200

# ── User Warnings ─────────────────────────────────────────────────────────────

@app.route("/api/admin/users/<int:tid>/warn", methods=["POST"])
def warn_user(tid):
    uid, err = require_admin()
    if err: return err
    reason = (request.json or {}).get("reason","No reason given.")
    db = get_db()
    db.execute("INSERT INTO user_warnings (user_id,admin_id,reason) VALUES (?,?,?)",(tid,uid,reason))
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id=?",(tid,)).fetchone()
    db.close()
    # Notify the user via socket
    if tid in user_sockets:
        socketio.emit("warning_received",{"reason":reason},to=f"user_{tid}")
    return jsonify({"message":"Warning sent."}),200

@app.route("/api/admin/users/<int:tid>/warnings", methods=["GET"])
def get_warnings(tid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT w.*, a.name as admin_name FROM user_warnings w JOIN users a ON w.admin_id=a.id WHERE w.user_id=? ORDER BY w.created_at DESC",(tid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/admin/reports", methods=["GET"])
def admin_reports():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT r.*, a.name as reporter_name, b.name as reported_name, b.email as reported_email, b.avatar_color as reported_color
        FROM reports r JOIN users a ON r.reporter_id=a.id JOIN users b ON r.reported_id=b.id
        ORDER BY r.created_at DESC LIMIT 100
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/admin/reports/<int:rid>/resolve", methods=["POST"])
def resolve_report(rid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("UPDATE reports SET status='resolved', resolved_at=? WHERE id=?",(datetime.datetime.utcnow().isoformat(),rid))
    db.commit(); db.close()
    return jsonify({"message":"Resolved."}),200

# ── 2FA ───────────────────────────────────────────────────────────────────────

@app.route("/api/2fa/setup", methods=["GET"])
def twofa_setup():
    uid, err = require_auth()
    if err: return err
    try:
        import pyotp
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
        secret = user["twofa_secret"] or pyotp.random_base32()
        if not user["twofa_secret"]:
            db.execute("UPDATE users SET twofa_secret=? WHERE id=?",(secret,uid))
            db.commit()
        uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user["email"],issuer_name="THE CHATING")
        db.close()
        return jsonify({"secret":secret,"uri":uri}),200
    except ImportError:
        return jsonify({"message":"2FA not available (pyotp not installed)"}),501

@app.route("/api/2fa/enable", methods=["POST"])
def twofa_enable():
    uid, err = require_auth()
    if err: return err
    try:
        import pyotp
        code = (request.json or {}).get("code","")
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
        if not user["twofa_secret"]: db.close(); return jsonify({"message":"Run setup first."}),400
        totp = pyotp.TOTP(user["twofa_secret"])
        if not totp.verify(code): db.close(); return jsonify({"message":"Invalid code."}),400
        db.execute("UPDATE users SET twofa_enabled=1 WHERE id=?",(uid,))
        db.commit(); db.close()
        return jsonify({"message":"2FA enabled!"}),200
    except ImportError:
        return jsonify({"message":"2FA not available"}),501

@app.route("/api/2fa/disable", methods=["POST"])
def twofa_disable():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("UPDATE users SET twofa_enabled=0, twofa_secret=NULL WHERE id=?",(uid,))
    db.commit(); db.close()
    return jsonify({"message":"2FA disabled."}),200

# ── Login History ─────────────────────────────────────────────────────────────

@app.route("/api/login-history", methods=["GET"])
def login_history():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT * FROM login_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20",(uid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

# ── Privacy Settings ──────────────────────────────────────────────────────────

@app.route("/api/users/privacy", methods=["PUT"])
def update_privacy():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    privacy = d.get("last_seen_privacy","everyone")
    if privacy not in ("everyone","friends","nobody"): privacy = "everyone"
    db.execute("UPDATE users SET last_seen_privacy=? WHERE id=?",(privacy,uid))
    db.commit(); db.close()
    return jsonify({"message":"Privacy updated."}),200

# ── App Lock ──────────────────────────────────────────────────────────────────

@app.route("/api/users/app-lock", methods=["PUT"])
def set_app_lock():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    pin = d.get("pin")  # None = remove lock
    db = get_db()
    if pin:
        hashed = bcrypt.hashpw(str(pin).encode(), bcrypt.gensalt()).decode()
        db.execute("UPDATE users SET app_lock_pin=? WHERE id=?",(hashed,uid))
    else:
        db.execute("UPDATE users SET app_lock_pin=NULL WHERE id=?",(uid,))
    db.commit(); db.close()
    return jsonify({"message":"App lock updated."}),200

@app.route("/api/users/app-lock/verify", methods=["POST"])
def verify_app_lock():
    uid, err = require_auth()
    if err: return err
    pin = str((request.json or {}).get("pin",""))
    db = get_db()
    user = db.execute("SELECT app_lock_pin FROM users WHERE id=?",(uid,)).fetchone()
    db.close()
    if not user["app_lock_pin"]: return jsonify({"valid":True}),200
    valid = bcrypt.checkpw(pin.encode(), user["app_lock_pin"].encode())
    return jsonify({"valid":valid}),200

# ── Announcement Groups ───────────────────────────────────────────────────────

@app.route("/api/groups/<int:gid>/announce", methods=["PUT"])
def toggle_announce(gid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    g = db.execute("SELECT * FROM groups WHERE id=? AND owner_id=?",(gid,uid)).fetchone()
    if not g: db.close(); return jsonify({"message":"Not authorized"}),403
    new_val = 0 if g["is_announce"] else 1
    db.execute("UPDATE groups SET is_announce=? WHERE id=?",(new_val,gid))
    db.commit(); db.close()
    socketio.emit("group_updated",{"group_id":gid,"is_announce":bool(new_val)},to=f"group_{gid}")
    return jsonify({"is_announce":bool(new_val)}),200

# ── Scheduled Messages ────────────────────────────────────────────────────────

@app.route("/api/messages/scheduled", methods=["POST"])
def schedule_message():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    send_at = d.get("send_at")
    content = (d.get("content") or "").strip()
    if not send_at or not content: return jsonify({"message":"content and send_at required"}),400
    db = get_db()
    db.execute("INSERT INTO scheduled_messages (sender_id,receiver_id,group_id,content,msg_type,send_at) VALUES (?,?,?,?,?,?)",
               (uid, d.get("receiver_id"), d.get("group_id"), content, d.get("msg_type","text"), send_at))
    db.commit()
    mid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    row = dict(db.execute("SELECT * FROM scheduled_messages WHERE id=?",(mid,)).fetchone())
    db.close()
    return jsonify(row),201

@app.route("/api/messages/scheduled", methods=["GET"])
def get_scheduled():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT * FROM scheduled_messages WHERE sender_id=? AND sent=0 ORDER BY send_at ASC",(uid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/messages/scheduled/<int:sid>", methods=["DELETE"])
def cancel_scheduled(sid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM scheduled_messages WHERE id=? AND sender_id=?",(sid,uid))
    db.commit(); db.close()
    return jsonify({"message":"Cancelled."}),200

# ── GIF Search (Tenor) ────────────────────────────────────────────────────────

@app.route("/api/gif/search", methods=["GET"])
def gif_search():
    uid, err = require_auth()
    if err: return err
    import requests as req
    q = request.args.get("q","funny")
    limit = min(int(request.args.get("limit",20)),50)
    api_key = os.getenv("TENOR_API_KEY","LIVDSRZULELA")  # default free key
    try:
        r = req.get(f"https://tenor.googleapis.com/v2/search?q={q}&key={api_key}&limit={limit}&media_filter=gif")
        data = r.json()
        gifs = [{"id":g["id"],"url":g["media_formats"]["gif"]["url"],"preview":g["media_formats"]["tinygif"]["url"],"title":g.get("title","")} for g in data.get("results",[])]
        return jsonify(gifs),200
    except Exception as e:
        return jsonify({"message":str(e),"gifs":[]}),200

# ── QR Code ───────────────────────────────────────────────────────────────────

@app.route("/api/users/<int:tid>/qr", methods=["GET"])
def user_qr(tid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    user = db.execute("SELECT username,email,name FROM users WHERE id=?",(tid,)).fetchone()
    db.close()
    if not user: return jsonify({"message":"Not found"}),404
    identifier = user["username"] or user["email"]
    qr_data = f"https://the-chating.trading-ai.bot/profile/{tid}"
    qr_url  = f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={qr_data}&bgcolor=0d0f1a&color=6366f1"
    return jsonify({"qr_url":qr_url,"profile_url":qr_data}),200

# ── Announcement to admin route (already handled in notify_admins) ─────────────────────────────────────────────────────

@app.route("/api/admin/analytics/detailed", methods=["GET"])
def admin_analytics():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    now = datetime.datetime.utcnow()
    days = int(request.args.get("days",30))

    # Signups per day
    signups_chart = []
    for i in range(days-1,-1,-1):
        day_start = (now - datetime.timedelta(days=i)).replace(hour=0,minute=0,second=0).isoformat()
        day_end   = (now - datetime.timedelta(days=i-1)).replace(hour=0,minute=0,second=0).isoformat() if i > 0 else now.isoformat()
        count = db.execute("SELECT COUNT(*) as c FROM users WHERE created_at>=? AND created_at<?", (day_start,day_end)).fetchone()["c"]
        msgs  = db.execute("SELECT COUNT(*) as c FROM messages WHERE created_at>=? AND created_at<?", (day_start,day_end)).fetchone()["c"]
        signups_chart.append({"day":(now-datetime.timedelta(days=i)).strftime("%b %d"),"signups":count,"messages":msgs})

    # Top users by messages
    top_users = db.execute('''
        SELECT u.name, u.email, u.avatar_color, COUNT(*) as msg_count
        FROM messages m JOIN users u ON m.sender_id=u.id
        WHERE m.deleted_at IS NULL GROUP BY m.sender_id ORDER BY msg_count DESC LIMIT 10
    ''').fetchall()

    # Top groups
    top_groups = db.execute('''
        SELECT g.name, g.avatar_color, COUNT(*) as msg_count, COUNT(DISTINCT gm.user_id) as members
        FROM group_messages gm JOIN groups g ON gm.group_id=g.id
        WHERE gm.deleted_at IS NULL GROUP BY gm.group_id ORDER BY msg_count DESC LIMIT 5
    ''').fetchall()

    total_banned = db.execute("SELECT COUNT(*) as c FROM users WHERE is_banned=1").fetchone()["c"]
    total_reports = db.execute("SELECT COUNT(*) as c FROM reports WHERE status='pending'").fetchone()["c"]
    total_polls   = db.execute("SELECT COUNT(*) as c FROM polls").fetchone()["c"]

    db.close()
    return jsonify({
        "chart":signups_chart,
        "top_users":[dict(r) for r in top_users],
        "top_groups":[dict(r) for r in top_groups],
        "total_banned":total_banned,
        "pending_reports":total_reports,
        "total_polls":total_polls,
    }),200

# ── Socket: warning received ──────────────────────────────────────────────────

@socketio.on("join_invite")
def on_join_invite(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    code = data.get("code","")
    # Join via socket call handled via HTTP endpoint

# ── Achievements helper ───────────────────────────────────────────────────────

def award_achievement(db, user_id, key):
    """Award an achievement if not already earned."""
    try:
        db.execute("INSERT OR IGNORE INTO user_achievements (user_id,achievement_key) VALUES (?,?)",(user_id,key))
        db.commit()
        ach = db.execute("SELECT * FROM achievements WHERE key=?",(key,)).fetchone()
        if ach and user_id in user_sockets:
            socketio.emit("achievement_earned",{"key":key,"name":ach["name"],"icon":ach["icon"],"description":ach["description"]},to=f"user_{user_id}")
    except Exception:
        pass

def check_message_achievements(db, user_id):
    count = db.execute("SELECT COUNT(*) as c FROM messages WHERE sender_id=?",(user_id,)).fetchone()["c"]
    if count == 1:  award_achievement(db, user_id, "first_message")
    if count == 10: award_achievement(db, user_id, "messages_10")
    if count == 100:award_achievement(db, user_id, "messages_100")
    if count == 500:award_achievement(db, user_id, "messages_500")
    # Night owl / early bird
    h = datetime.datetime.utcnow().hour
    if h >= 0 and h < 4:  award_achievement(db, user_id, "night_owl")
    if h >= 4 and h < 6:  award_achievement(db, user_id, "early_bird")

# ── Posts / Feed ──────────────────────────────────────────────────────────────

@app.route("/api/feed", methods=["GET"])
def get_feed():
    uid, err = require_auth()
    if err: return err
    page  = max(1, int(request.args.get("page",1)))
    limit = 20
    offset = (page-1)*limit
    db = get_db()
    rows = db.execute('''
        SELECT p.*, u.name as user_name, u.avatar_color as user_color, u.avatar_b64 as user_avatar,
               u.is_verified as user_verified,
               (SELECT COUNT(*) FROM post_likes WHERE post_id=p.id) as like_count,
               (SELECT COUNT(*) FROM post_comments WHERE post_id=p.id) as comment_count,
               EXISTS(SELECT 1 FROM post_likes WHERE post_id=p.id AND user_id=?) as liked_by_me
        FROM posts p
        JOIN users u ON p.user_id=u.id
        WHERE p.user_id=? OR p.user_id IN (
            SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END
            FROM friendships WHERE (requester_id=? OR addressee_id=?) AND status="accepted"
        )
        ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    ''',(uid,uid,uid,uid,uid,limit,offset)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/posts", methods=["POST"])
def create_post():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    content = (d.get("content") or "").strip()
    image   = d.get("image_b64")
    bg      = d.get("bg_color","")
    if not content and not image: return jsonify({"message":"Content required."}),400
    db = get_db()
    db.execute("INSERT INTO posts (user_id,content,image_b64,bg_color) VALUES (?,?,?,?)",(uid,content,image,bg))
    db.commit()
    pid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    award_achievement(db, uid, "first_post")
    post = db.execute("SELECT p.*, u.name as user_name, u.avatar_color as user_color FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=?",(pid,)).fetchone()
    db.close()
    return jsonify(dict(post)),201

@app.route("/api/posts/<int:pid>/like", methods=["POST"])
def like_post(pid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    existing = db.execute("SELECT id FROM post_likes WHERE post_id=? AND user_id=?",(pid,uid)).fetchone()
    if existing:
        db.execute("DELETE FROM post_likes WHERE id=?",(existing["id"],))
        liked = False
    else:
        db.execute("INSERT INTO post_likes (post_id,user_id) VALUES (?,?)",(pid,uid))
        liked = True
    db.commit()
    count = db.execute("SELECT COUNT(*) as c FROM post_likes WHERE post_id=?",(pid,)).fetchone()["c"]
    db.close()
    return jsonify({"liked":liked,"count":count}),200

@app.route("/api/posts/<int:pid>/comments", methods=["GET"])
def get_comments(pid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT c.*,u.name as user_name,u.avatar_color as user_color FROM post_comments c JOIN users u ON c.user_id=u.id WHERE c.post_id=? ORDER BY c.created_at ASC",(pid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/posts/<int:pid>/comments", methods=["POST"])
def add_comment(pid):
    uid, err = require_auth()
    if err: return err
    content = (request.json or {}).get("content","").strip()
    if not content: return jsonify({"message":"Content required."}),400
    db = get_db()
    db.execute("INSERT INTO post_comments (post_id,user_id,content) VALUES (?,?,?)",(pid,uid,content))
    db.commit()
    cid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    comment = db.execute("SELECT c.*,u.name as user_name,u.avatar_color as user_color FROM post_comments c JOIN users u ON c.user_id=u.id WHERE c.id=?",(cid,)).fetchone()
    db.close()
    return jsonify(dict(comment)),201

@app.route("/api/posts/<int:pid>", methods=["DELETE"])
def delete_post(pid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM posts WHERE id=? AND user_id=?",(pid,uid))
    db.commit(); db.close()
    return jsonify({"message":"Deleted."}),200

# ── Achievements ──────────────────────────────────────────────────────────────

@app.route("/api/achievements", methods=["GET"])
def get_achievements():
    uid, err = require_auth()
    if err: return err
    target = int(request.args.get("user_id", uid))
    db = get_db()
    all_ach = db.execute("SELECT * FROM achievements").fetchall()
    earned  = db.execute("SELECT achievement_key,earned_at FROM user_achievements WHERE user_id=?",(target,)).fetchall()
    earned_set = {e["achievement_key"]: e["earned_at"] for e in earned}
    result = []
    for a in all_ach:
        d = dict(a)
        d["earned"]    = a["key"] in earned_set
        d["earned_at"] = earned_set.get(a["key"])
        result.append(d)
    db.close()
    return jsonify(result),200

# ── Birthday ──────────────────────────────────────────────────────────────────

@app.route("/api/users/birthday", methods=["PUT"])
def set_birthday():
    uid, err = require_auth()
    if err: return err
    bday = (request.json or {}).get("birthday")  # YYYY-MM-DD
    db = get_db()
    db.execute("UPDATE users SET birthday=? WHERE id=?",(bday,uid))
    db.commit(); db.close()
    return jsonify({"message":"Birthday saved."}),200

@app.route("/api/birthdays/today", methods=["GET"])
def birthdays_today():
    uid, err = require_auth()
    if err: return err
    today = datetime.datetime.utcnow().strftime("-%m-%d")
    db = get_db()
    rows = db.execute('''
        SELECT u.* FROM users u
        JOIN friendships f ON (f.requester_id=? OR f.addressee_id=?) AND f.status="accepted"
        AND (CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END = u.id)
        WHERE u.birthday LIKE ?
    ''',(uid,uid,uid,f"%{today}")).fetchall()
    db.close()
    return jsonify([user_dict(r) for r in rows]),200

# ── Music Status ──────────────────────────────────────────────────────────────

@app.route("/api/users/music", methods=["PUT"])
def set_music():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    db.execute("UPDATE users SET music_status=?,music_artist=? WHERE id=?",
               (d.get("song","")[:80], d.get("artist","")[:60], uid))
    db.commit()
    db.close()
    return jsonify({"message":"Music updated."}),200

# ── Bookmarks ─────────────────────────────────────────────────────────────────

@app.route("/api/bookmarks", methods=["GET"])
def get_bookmarks():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT b.*, m.content as msg_content, m.msg_type,
               u.name as sender_name, u.avatar_color as sender_color
        FROM bookmarks b
        LEFT JOIN messages m ON b.message_id=m.id
        LEFT JOIN users u ON m.sender_id=u.id
        WHERE b.user_id=? ORDER BY b.created_at DESC
    ''',(uid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/bookmarks", methods=["POST"])
def add_bookmark():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    db.execute("INSERT INTO bookmarks (user_id,message_id,post_id,note) VALUES (?,?,?,?)",
               (uid, d.get("message_id"), d.get("post_id"), d.get("note","")))
    db.commit(); db.close()
    return jsonify({"message":"Bookmarked!"}),201

@app.route("/api/bookmarks/<int:bid>", methods=["DELETE"])
def del_bookmark(bid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM bookmarks WHERE id=? AND user_id=?",(bid,uid))
    db.commit(); db.close()
    return jsonify({"message":"Removed."}),200

# ── Events ────────────────────────────────────────────────────────────────────

@app.route("/api/events", methods=["GET"])
def get_events():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT e.*, u.name as creator_name, u.avatar_color as creator_color,
               (SELECT COUNT(*) FROM event_attendees WHERE event_id=e.id AND status="going") as going_count,
               EXISTS(SELECT 1 FROM event_attendees WHERE event_id=e.id AND user_id=?) as attending
        FROM events e JOIN users u ON e.creator_id=u.id
        WHERE e.starts_at >= datetime("now","-1 day")
        AND (e.creator_id=? OR e.creator_id IN (
            SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END
            FROM friendships WHERE (requester_id=? OR addressee_id=?) AND status="accepted"
        ))
        ORDER BY e.starts_at ASC LIMIT 30
    ''',(uid,uid,uid,uid,uid)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/events", methods=["POST"])
def create_event():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    title = (d.get("title") or "").strip()
    if not title or not d.get("starts_at"): return jsonify({"message":"Title and start time required."}),400
    db = get_db()
    db.execute("INSERT INTO events (creator_id,group_id,title,description,location,starts_at,ends_at) VALUES (?,?,?,?,?,?,?)",
               (uid,d.get("group_id"),title,d.get("description",""),d.get("location",""),d.get("starts_at"),d.get("ends_at")))
    db.commit()
    eid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    award_achievement(db, uid, "event_creator")
    db.execute("INSERT INTO event_attendees (event_id,user_id,status) VALUES (?,?,'going')",(eid,uid))
    db.commit()
    event = dict(db.execute("SELECT * FROM events WHERE id=?",(eid,)).fetchone())
    db.close()
    return jsonify(event),201

@app.route("/api/events/<int:eid>/attend", methods=["POST"])
def attend_event(eid):
    uid, err = require_auth()
    if err: return err
    status = (request.json or {}).get("status","going")
    db = get_db()
    db.execute("INSERT OR REPLACE INTO event_attendees (event_id,user_id,status) VALUES (?,?,?)",(eid,uid,status))
    db.commit(); db.close()
    return jsonify({"message":"Updated!"}),200

# ── Group Notes & Todos ───────────────────────────────────────────────────────

@app.route("/api/groups/<int:gid>/notes", methods=["GET","PUT"])
def group_notes(gid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    if request.method == "GET":
        note = db.execute("SELECT * FROM group_notes WHERE group_id=?",(gid,)).fetchone()
        db.close()
        return jsonify(dict(note) if note else {"group_id":gid,"content":""}),200
    content = (request.json or {}).get("content","")
    now = datetime.datetime.utcnow().isoformat()
    db.execute("INSERT OR REPLACE INTO group_notes (group_id,content,updated_by,updated_at) VALUES (?,?,?,?)",(gid,content,uid,now))
    db.commit(); db.close()
    socketio.emit("group_notes_updated",{"group_id":gid,"content":content},to=f"group_{gid}")
    return jsonify({"message":"Saved."}),200

@app.route("/api/groups/<int:gid>/todos", methods=["GET","POST"])
def group_todos(gid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    if request.method == "GET":
        rows = db.execute("SELECT t.*,u.name as creator_name FROM group_todos t JOIN users u ON t.creator_id=u.id WHERE t.group_id=? ORDER BY t.done ASC, t.created_at DESC",(gid,)).fetchall()
        db.close()
        return jsonify([dict(r) for r in rows]),200
    text = (request.json or {}).get("text","").strip()
    if not text: return jsonify({"message":"Text required."}),400
    db.execute("INSERT INTO group_todos (group_id,creator_id,text) VALUES (?,?,?)",(gid,uid,text))
    db.commit()
    tid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    todo = dict(db.execute("SELECT * FROM group_todos WHERE id=?",(tid,)).fetchone())
    db.close()
    socketio.emit("group_todo_added",{**todo,"group_id":gid},to=f"group_{gid}")
    return jsonify(todo),201

@app.route("/api/groups/<int:gid>/todos/<int:tid>", methods=["PUT","DELETE"])
def group_todo(gid,tid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    if request.method == "DELETE":
        db.execute("DELETE FROM group_todos WHERE id=? AND group_id=?",(tid,gid))
        db.commit(); db.close()
        socketio.emit("group_todo_removed",{"id":tid,"group_id":gid},to=f"group_{gid}")
        return jsonify({"message":"Removed."}),200
    done = int((request.json or {}).get("done",0))
    db.execute("UPDATE group_todos SET done=?,done_by=? WHERE id=?",(done,uid if done else None,tid))
    db.commit()
    todo = dict(db.execute("SELECT * FROM group_todos WHERE id=?",(tid,)).fetchone())
    db.close()
    socketio.emit("group_todo_updated",{**todo,"group_id":gid},to=f"group_{gid}")
    return jsonify(todo),200

# ── Broadcast Lists ───────────────────────────────────────────────────────────

@app.route("/api/broadcasts", methods=["GET","POST"])
def broadcast_lists():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    if request.method == "GET":
        rows = db.execute("SELECT b.*, COUNT(bm.user_id) as member_count FROM broadcast_lists b LEFT JOIN broadcast_members bm ON b.id=bm.list_id WHERE b.owner_id=? GROUP BY b.id",(uid,)).fetchall()
        db.close()
        return jsonify([dict(r) for r in rows]),200
    name = (request.json or {}).get("name","").strip()
    if not name: return jsonify({"message":"Name required."}),400
    db.execute("INSERT INTO broadcast_lists (owner_id,name) VALUES (?,?)",(uid,name))
    db.commit()
    lid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    db.close()
    return jsonify({"id":lid,"name":name}),201

@app.route("/api/broadcasts/<int:lid>/send", methods=["POST"])
def send_broadcast_msg(lid):
    uid, err = require_auth()
    if err: return err
    content = (request.json or {}).get("content","").strip()
    if not content: return jsonify({"message":"Content required."}),400
    db = get_db()
    bl = db.execute("SELECT * FROM broadcast_lists WHERE id=? AND owner_id=?",(lid,uid)).fetchone()
    if not bl: db.close(); return jsonify({"message":"Not found."}),404
    members = db.execute("SELECT user_id FROM broadcast_members WHERE list_id=?",(lid,)).fetchall()
    now = datetime.datetime.utcnow().isoformat()
    count = 0
    sender = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    for m in members:
        mid2 = m["user_id"]
        db.execute("INSERT INTO messages (sender_id,receiver_id,content,created_at) VALUES (?,?,?,?)",(uid,mid2,content,now))
        db.commit()
        msg_id = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
        msg = dict(db.execute("SELECT * FROM messages WHERE id=?",(msg_id,)).fetchone())
        msg["reactions"] = []; msg["reply_to"] = None
        socketio.emit("new_message",msg,to=f"user_{mid2}")
        count += 1
        if mid2 not in user_sockets:
            send_push_to_user(mid2, f"📢 {sender['name']}", content[:80], {"type":"new_message","sender_id":uid})
    db.close()
    return jsonify({"message":f"Sent to {count} people."}),200

# ── Virtual Gifts ─────────────────────────────────────────────────────────────

GIFT_TYPES = {
    "rose":    {"name":"Rose",       "emoji":"🌹", "animation":"float"},
    "heart":   {"name":"Heart",      "emoji":"❤️",  "animation":"pulse"},
    "cake":    {"name":"Birthday Cake","emoji":"🎂","animation":"bounce"},
    "trophy":  {"name":"Trophy",     "emoji":"🏆",  "animation":"spin"},
    "star":    {"name":"Gold Star",  "emoji":"⭐",  "animation":"twinkle"},
    "diamond": {"name":"Diamond",    "emoji":"💎",  "animation":"sparkle"},
    "hug":     {"name":"Virtual Hug","emoji":"🤗",  "animation":"pulse"},
    "confetti":{"name":"Confetti",   "emoji":"🎊",  "animation":"burst"},
}

@app.route("/api/gifts", methods=["POST"])
def send_gift():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    to       = d.get("to")
    gtype    = d.get("gift_type","heart")
    message  = (d.get("message") or "").strip()[:100]
    if not to or gtype not in GIFT_TYPES: return jsonify({"message":"Invalid."}),400
    db = get_db()
    sender = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    db.execute("INSERT INTO virtual_gifts (sender_id,receiver_id,gift_type,message) VALUES (?,?,?,?)",(uid,to,gtype,message))
    db.commit(); db.close()
    gift_info = GIFT_TYPES[gtype]
    payload = {"from":uid,"sender_name":sender["name"],"gift_type":gtype,
               "emoji":gift_info["emoji"],"name":gift_info["name"],
               "animation":gift_info["animation"],"message":message}
    socketio.emit("gift_received",payload,to=f"user_{to}")
    award_achievement(db, uid, "gift_sender")
    return jsonify({"message":"Gift sent! 🎁"}),200

# ── Live Location ─────────────────────────────────────────────────────────────

@app.route("/api/location/share", methods=["POST"])
def share_location():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    lat  = d.get("lat")
    lng  = d.get("lng")
    to   = d.get("to")
    mins = int(d.get("minutes", 15))
    if lat is None or lng is None: return jsonify({"message":"lat/lng required."}),400
    expires = (datetime.datetime.utcnow() + datetime.timedelta(minutes=mins)).isoformat()
    db = get_db()
    sender = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    db.execute("INSERT INTO location_shares (sender_id,receiver_id,lat,lng,expires_at) VALUES (?,?,?,?,?)",(uid,to,lat,lng,expires))
    db.commit(); db.close()
    payload = {"from":uid,"sender_name":sender["name"],"lat":lat,"lng":lng,"expires_at":expires,"minutes":mins}
    if to: socketio.emit("location_shared",payload,to=f"user_{to}")
    return jsonify({"message":"Location shared!","expires_at":expires}),200

# ── Chat Statistics ───────────────────────────────────────────────────────────

@app.route("/api/messages/stats/mine", methods=["GET"])
def my_stats():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    total_sent = db.execute("SELECT COUNT(*) as c FROM messages WHERE sender_id=? AND deleted_at IS NULL",(uid,)).fetchone()["c"]
    total_recv = db.execute("SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND deleted_at IS NULL",(uid,)).fetchone()["c"]
    top_friends = db.execute('''
        SELECT CASE WHEN sender_id=? THEN receiver_id ELSE sender_id END as friend_id,
               COUNT(*) as msg_count, u.name as friend_name, u.avatar_color
        FROM messages m JOIN users u ON (CASE WHEN sender_id=? THEN receiver_id ELSE sender_id END = u.id)
        WHERE (sender_id=? OR receiver_id=?) AND deleted_at IS NULL
        GROUP BY friend_id ORDER BY msg_count DESC LIMIT 5
    ''',(uid,uid,uid,uid)).fetchall()
    busiest_hour = db.execute('''
        SELECT strftime("%H",created_at) as hour, COUNT(*) as c
        FROM messages WHERE sender_id=? AND deleted_at IS NULL
        GROUP BY hour ORDER BY c DESC LIMIT 1
    ''',(uid,)).fetchone()
    db.close()
    return jsonify({
        "total_sent":   total_sent,
        "total_received": total_recv,
        "top_friends":  [dict(r) for r in top_friends],
        "busiest_hour": busiest_hour["hour"] if busiest_hour else None,
    }),200

# ── Emergency SOS ─────────────────────────────────────────────────────────────

@app.route("/api/sos/contacts", methods=["GET","POST","DELETE"])
def sos_contacts():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    if request.method == "GET":
        rows = db.execute("SELECT u.* FROM sos_contacts s JOIN users u ON s.contact_id=u.id WHERE s.user_id=?",(uid,)).fetchall()
        db.close()
        return jsonify([user_dict(r) for r in rows]),200
    if request.method == "POST":
        cid = (request.json or {}).get("contact_id")
        try:
            db.execute("INSERT INTO sos_contacts (user_id,contact_id) VALUES (?,?)",(uid,cid))
            db.commit()
        except: pass
        db.close()
        return jsonify({"message":"SOS contact added."}),201
    cid = (request.json or {}).get("contact_id")
    db.execute("DELETE FROM sos_contacts WHERE user_id=? AND contact_id=?",(uid,cid))
    db.commit(); db.close()
    return jsonify({"message":"Removed."}),200

@app.route("/api/sos/send", methods=["POST"])
def send_sos():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    lat = d.get("lat"); lng = d.get("lng")
    db = get_db()
    me = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    contacts = db.execute("SELECT contact_id FROM sos_contacts WHERE user_id=?",(uid,)).fetchall()
    now = datetime.datetime.utcnow().isoformat()
    map_url = f"https://maps.google.com/maps?q={lat},{lng}" if lat and lng else "Location not available"
    sos_msg = f"🚨 SOS from {me['name']}!\nI need help! My location: {map_url}"
    sent = 0
    for c in contacts:
        cid = c["contact_id"]
        db.execute("INSERT INTO messages (sender_id,receiver_id,content) VALUES (?,?,?)",(uid,cid,sos_msg))
        db.commit()
        msg_id = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
        msg = dict(db.execute("SELECT * FROM messages WHERE id=?",(msg_id,)).fetchone())
        msg["reactions"]=[]; msg["reply_to"]=None
        socketio.emit("new_message",msg,to=f"user_{cid}")
        socketio.emit("sos_alert",{"from":uid,"name":me["name"],"lat":lat,"lng":lng,"map_url":map_url},to=f"user_{cid}")
        send_push_to_user(cid, f"🚨 SOS from {me['name']}!", "They need help! Tap to see location.", {"type":"sos","lat":lat,"lng":lng})
        sent += 1
    db.close()
    return jsonify({"message":f"SOS sent to {sent} contacts!"}),200

# ── Voice Rooms ───────────────────────────────────────────────────────────────

voice_room_members = {}  # room_id -> {user_id: {name, color, muted}}

@app.route("/api/voice-rooms", methods=["GET","POST"])
def voice_rooms():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    if request.method == "GET":
        rows = db.execute("SELECT r.*, u.name as host_name, u.avatar_color as host_color FROM voice_rooms r JOIN users u ON r.host_id=u.id WHERE r.is_public=1 ORDER BY r.created_at DESC LIMIT 20").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["live_count"] = len(voice_room_members.get(r["id"], {}))
            result.append(d)
        db.close()
        return jsonify(result),200
    name = (request.json or {}).get("name","").strip()
    if not name: return jsonify({"message":"Name required."}),400
    db.execute("INSERT INTO voice_rooms (name,host_id,is_public) VALUES (?,?,?)",(name,uid,1))
    db.commit()
    rid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    award_achievement(db, uid, "voice_room")
    db.close()
    return jsonify({"id":rid,"name":name}),201

@socketio.on("join_voice_room")
def on_join_vr(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    rid = data.get("room_id")
    if not rid: return
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone()
    db.close()
    if rid not in voice_room_members: voice_room_members[rid] = {}
    voice_room_members[rid][uid] = {"name":user["name"],"color":user["avatar_color"],"muted":False}
    join_room(f"vr_{rid}")
    emit("voice_room_update",{"room_id":rid,"members":list(voice_room_members[rid].values())},to=f"vr_{rid}")

@socketio.on("leave_voice_room")
def on_leave_vr(data):
    uid = socket_users.get(request.sid)
    rid = data.get("room_id")
    if uid and rid and rid in voice_room_members:
        voice_room_members[rid].pop(uid,None)
        leave_room(f"vr_{rid}")
        emit("voice_room_update",{"room_id":rid,"members":list(voice_room_members[rid].values())},to=f"vr_{rid}")

@socketio.on("voice_room_audio")
def on_vr_audio(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    rid = data.get("room_id")
    # Relay audio to all others in the room
    emit("voice_room_audio",{"from":uid,"pcm16":data.get("pcm16"),"sampleRate":data.get("sampleRate",16000)},to=f"vr_{rid}",include_self=False)

# ── Friend Suggestions ────────────────────────────────────────────────────────

@app.route("/api/users/suggestions", methods=["GET"])
def friend_suggestions():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    # People with mutual friends
    rows = db.execute('''
        SELECT u.*, COUNT(*) as mutual_count FROM users u
        JOIN friendships f1 ON (f1.requester_id=u.id OR f1.addressee_id=u.id) AND f1.status="accepted"
        JOIN friendships f2 ON (
            (f2.requester_id=? OR f2.addressee_id=?) AND f2.status="accepted"
            AND (CASE WHEN f1.requester_id=u.id THEN f1.addressee_id ELSE f1.requester_id END) IN
            (CASE WHEN f2.requester_id=? THEN f2.addressee_id ELSE f2.requester_id END)
        )
        WHERE u.id != ?
        AND u.id NOT IN (SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END FROM friendships WHERE (requester_id=? OR addressee_id=?))
        GROUP BY u.id ORDER BY mutual_count DESC LIMIT 10
    ''',(uid,uid,uid,uid,uid,uid,uid)).fetchall()
    result = _annotate_friendship(db, uid, rows)
    db.close()
    for i,r in enumerate(result):
        if i < len(rows): r["mutual_count"] = rows[i]["mutual_count"]
    return jsonify(result),200

# ── Admin Extended Powers ────────────────────────────────────────────────────

# ─ User Actions ─
@app.route("/api/admin/users/<int:tid>/silence", methods=["POST"])
def silence_user(tid):
    uid, err = require_admin();
    if err: return err
    hours = int((request.json or {}).get("hours", 24))
    until = (datetime.datetime.utcnow() + datetime.timedelta(hours=hours)).isoformat()
    db = get_db()
    db.execute("UPDATE users SET ban_reason=? WHERE id=?", (f"SILENCED_UNTIL:{until}", tid))
    db.commit(); db.close()
    if tid in user_sockets:
        socketio.emit("force_logout", {"reason": f"You have been silenced for {hours} hours."}, to=f"user_{tid}")
    return jsonify({"message": f"User silenced for {hours} hours.", "until": until}), 200

@app.route("/api/admin/users/<int:tid>/reset-password", methods=["POST"])
def admin_reset_password(tid):
    uid, err = require_admin()
    if err: return err
    new_pwd = (request.json or {}).get("password", "Reset123!")
    hashed = bcrypt.hashpw(new_pwd.encode(), bcrypt.gensalt()).decode()
    db = get_db()
    db.execute("UPDATE users SET password=? WHERE id=?", (hashed, tid))
    db.commit(); db.close()
    return jsonify({"message": "Password reset.", "new_password": new_pwd}), 200

@app.route("/api/admin/users/<int:tid>/dm", methods=["POST"])
def admin_dm_user(tid):
    uid, err = require_admin()
    if err: return err
    content = (request.json or {}).get("message","").strip()
    if not content: return jsonify({"message":"Content required."}),400
    db = get_db()
    now = datetime.datetime.utcnow().isoformat()
    db.execute("INSERT INTO messages (sender_id,receiver_id,content,created_at) VALUES (?,?,?,?)",(uid,tid,f"[ADMIN] {content}",now))
    db.commit()
    mid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    msg = dict(db.execute("SELECT * FROM messages WHERE id=?",(mid,)).fetchone())
    msg["reactions"]=[]; msg["reply_to"]=None
    db.close()
    socketio.emit("new_message",msg,to=f"user_{tid}")
    return jsonify({"message":"DM sent."}),200

@app.route("/api/admin/users/<int:tid>/give-achievement", methods=["POST"])
def give_achievement(tid):
    uid, err = require_admin()
    if err: return err
    key = (request.json or {}).get("key","")
    db = get_db()
    award_achievement(db, tid, key)
    db.close()
    return jsonify({"message":f"Achievement '{key}' given."}),200

@app.route("/api/admin/users/<int:tid>/friends", methods=["GET"])
def admin_user_friends(tid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT u.* FROM friendships f
        JOIN users u ON (CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END = u.id)
        WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status="accepted"
    ''',(tid,tid,tid)).fetchall()
    db.close()
    return jsonify([user_dict(r) for r in rows]),200

@app.route("/api/admin/users/<int:tid>/groups", methods=["GET"])
def admin_user_groups(tid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT g.* FROM groups g JOIN group_members gm ON g.id=gm.group_id WHERE gm.user_id=?",(tid,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

# ─ Content Management ─
@app.route("/api/admin/content/posts", methods=["GET"])
def admin_posts():
    uid, err = require_admin()
    if err: return err
    page  = max(1,int(request.args.get("page",1))); limit=20; offset=(page-1)*limit
    db = get_db()
    rows = db.execute('''
        SELECT p.*, u.name as user_name, u.email as user_email,
               (SELECT COUNT(*) FROM post_likes WHERE post_id=p.id) as like_count,
               (SELECT COUNT(*) FROM post_comments WHERE post_id=p.id) as comment_count
        FROM posts p JOIN users u ON p.user_id=u.id
        ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    ''',(limit,offset)).fetchall()
    total = db.execute("SELECT COUNT(*) as c FROM posts").fetchone()["c"]
    db.close()
    return jsonify({"posts":[dict(r) for r in rows],"total":total}),200

@app.route("/api/admin/content/posts/<int:pid>", methods=["DELETE"])
def admin_delete_post(pid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM posts WHERE id=?",(pid,))
    db.commit(); db.close()
    return jsonify({"message":"Post deleted."}),200

@app.route("/api/admin/content/groups", methods=["GET"])
def admin_groups():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT g.*, u.name as owner_name, COUNT(gm.user_id) as member_count
        FROM groups g JOIN users u ON g.owner_id=u.id
        LEFT JOIN group_members gm ON g.id=gm.group_id
        GROUP BY g.id ORDER BY g.created_at DESC
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/admin/content/groups/<int:gid>", methods=["DELETE"])
def admin_delete_group(gid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM groups WHERE id=?",(gid,))
    db.commit(); db.close()
    socketio.emit("group_deleted",{"group_id":gid},to=f"group_{gid}")
    return jsonify({"message":"Group deleted."}),200

@app.route("/api/admin/content/rooms", methods=["GET"])
def admin_rooms():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT r.*, u.name as owner_name, COUNT(rm.user_id) as member_count
        FROM rooms r JOIN users u ON r.owner_id=u.id
        LEFT JOIN room_members rm ON r.id=rm.room_id
        GROUP BY r.id ORDER BY r.created_at DESC
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/admin/content/rooms/<int:rid>", methods=["DELETE"])
def admin_delete_room(rid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM rooms WHERE id=?",(rid,))
    db.commit(); db.close()
    return jsonify({"message":"Room deleted."}),200

@app.route("/api/admin/content/stories", methods=["GET"])
def admin_stories():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT s.*,u.name as user_name,u.email as user_email FROM stories s JOIN users u ON s.user_id=u.id ORDER BY s.created_at DESC LIMIT 50").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/admin/content/stories/<int:sid>", methods=["DELETE"])
def admin_delete_story(sid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM stories WHERE id=?",(sid,))
    db.commit(); db.close()
    return jsonify({"message":"Story deleted."}),200

# ─ System Settings ─
_system_settings = {
    "app_name":           "THE CHATING",
    "allow_registration": True,
    "allow_calls":        True,
    "allow_groups":       True,
    "allow_stories":      True,
    "allow_rooms":        True,
    "allow_gifs":         True,
    "allow_file_sharing": True,
    "allow_voice_msgs":   True,
    "max_message_length": 4000,
    "max_group_members":  500,
    "auto_ban_threshold": 5,
    "welcome_message":    "Welcome to THE CHATING! 🎉",
}

@app.route("/api/admin/system/settings", methods=["GET","PUT"])
def system_settings():
    uid, err = require_admin()
    if err: return err
    if request.method == "GET":
        return jsonify(_system_settings),200
    updates = request.json or {}
    _system_settings.update({k:v for k,v in updates.items() if k in _system_settings})
    return jsonify(_system_settings),200

@app.route("/api/admin/system/bad-words", methods=["GET","PUT"])
def admin_bad_words():
    uid, err = require_admin()
    if err: return err
    try:
        import importlib, bad_words as bw
        if request.method == "GET":
            return jsonify({"words": bw.BAD_WORDS, "count": len(bw.BAD_WORDS)}),200
        d = request.json or {}
        action = d.get("action")
        word   = (d.get("word") or "").strip().lower()
        if action=="add" and word and word not in bw.BAD_WORDS:
            bw.BAD_WORDS.append(word)
            return jsonify({"message":f"'{word}' added.","count":len(bw.BAD_WORDS)}),200
        if action=="remove" and word in bw.BAD_WORDS:
            bw.BAD_WORDS.remove(word)
            return jsonify({"message":f"'{word}' removed.","count":len(bw.BAD_WORDS)}),200
        return jsonify({"message":"No change."}),200
    except Exception as e:
        return jsonify({"message":str(e)}),500

@app.route("/api/admin/system/health", methods=["GET"])
def system_health():
    uid, err = require_admin()
    if err: return err
    import shutil, time
    disk = shutil.disk_usage("/")
    db = get_db()
    db_size = os.path.getsize(os.path.join(os.path.dirname(__file__),'social.db')) if os.path.exists(os.path.join(os.path.dirname(__file__),'social.db')) else 0
    total_msgs = db.execute("SELECT COUNT(*) as c FROM messages").fetchone()["c"]
    db.close()
    return jsonify({
        "status":          "healthy",
        "online_sockets":  len(socket_users),
        "online_users":    len(user_sockets),
        "disk_total_gb":   round(disk.total/1e9,1),
        "disk_used_gb":    round(disk.used/1e9,1),
        "disk_free_gb":    round(disk.free/1e9,1),
        "disk_pct":        round(disk.used/disk.total*100,1),
        "db_size_mb":      round(db_size/1e6,2),
        "total_messages":  total_msgs,
        "uptime_since":    "running",
    }),200

# ─ Bulk Actions ─
@app.route("/api/admin/bulk/ban", methods=["POST"])
def bulk_ban():
    uid, err = require_admin()
    if err: return err
    d = request.json or {}
    ids    = d.get("user_ids", [])
    reason = d.get("reason","Bulk ban by admin.")
    now    = datetime.datetime.utcnow().isoformat()
    db = get_db()
    count = 0
    for tid in ids:
        user = db.execute("SELECT email FROM users WHERE id=?",(tid,)).fetchone()
        if user and user["email"].lower() not in ADMIN_EMAILS:
            db.execute("UPDATE users SET is_banned=1,ban_reason=?,banned_at=? WHERE id=?",(reason,now,tid))
            if tid in user_sockets:
                socketio.emit("force_logout",{"reason":f"Banned: {reason}"},to=f"user_{tid}")
            count += 1
    db.commit(); db.close()
    return jsonify({"message":f"Banned {count} users."}),200

@app.route("/api/admin/bulk/delete-messages", methods=["POST"])
def bulk_delete_messages():
    uid, err = require_admin()
    if err: return err
    ids = (request.json or {}).get("message_ids",[])
    now = datetime.datetime.utcnow().isoformat()
    db = get_db()
    for mid in ids:
        db.execute("UPDATE messages SET deleted_at=?,content='' WHERE id=?",(now,mid))
    db.commit(); db.close()
    return jsonify({"message":f"Deleted {len(ids)} messages."}),200

# ─ Export ─
@app.route("/api/admin/export/users-csv", methods=["GET"])
def export_users_csv():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    users = db.execute("SELECT id,name,email,username,phone,is_banned,is_verified,created_at,last_seen FROM users ORDER BY id").fetchall()
    db.close()
    lines = ["id,name,email,username,phone,is_banned,is_verified,created_at,last_seen"]
    for u in users:
        lines.append(f'{u["id"]},"{u["name"]}",{u["email"]},{u["username"] or ""},{u["phone"] or ""},{u["is_banned"]},{u["is_verified"]},{u["created_at"] or ""},{u["last_seen"] or ""}')
    csv_data = "\n".join(lines)
    return Response(csv_data, mimetype="text/csv",
                    headers={"Content-Disposition":"attachment; filename=users.csv"}),200

@app.route("/api/admin/export/full-backup", methods=["GET"])
def admin_full_backup():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    data = {
        "exported_at": datetime.datetime.utcnow().isoformat(),
        "users":    [dict(r) for r in db.execute("SELECT id,name,email,username,phone,bio,avatar_color,is_verified,is_banned,created_at FROM users").fetchall()],
        "groups":   [dict(r) for r in db.execute("SELECT * FROM groups").fetchall()],
        "rooms":    [dict(r) for r in db.execute("SELECT * FROM rooms").fetchall()],
        "reports":  [dict(r) for r in db.execute("SELECT * FROM reports").fetchall()],
        "warnings": [dict(r) for r in db.execute("SELECT * FROM user_warnings").fetchall()],
    }
    db.close()
    return Response(json.dumps(data,indent=2),mimetype="application/json",
                    headers={"Content-Disposition":"attachment; filename=full_backup.json"}),200

# ─ Scheduled Messages ─
@app.route("/api/admin/scheduled", methods=["GET"])
def admin_scheduled():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT s.*,u.name as sender_name FROM scheduled_messages s JOIN users u ON s.sender_id=u.id WHERE s.sent=0 ORDER BY s.send_at ASC LIMIT 50").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

@app.route("/api/admin/scheduled/<int:sid>", methods=["DELETE"])
def admin_cancel_scheduled(sid):
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM scheduled_messages WHERE id=?",(sid,))
    db.commit(); db.close()
    return jsonify({"message":"Cancelled."}),200

# ─ Bans list ─
@app.route("/api/admin/bans", methods=["GET"])
def admin_bans():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute("SELECT * FROM users WHERE is_banned=1 ORDER BY banned_at DESC").fetchall()
    db.close()
    return jsonify([user_dict(r) for r in rows]),200

# ─ All warnings ─
@app.route("/api/admin/warnings", methods=["GET"])
def admin_all_warnings():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT w.*,u.name as user_name,u.email as user_email,a.name as admin_name
        FROM user_warnings w JOIN users u ON w.user_id=u.id JOIN users a ON w.admin_id=a.id
        ORDER BY w.created_at DESC LIMIT 100
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]),200

# ─ Flagged clear all ─
@app.route("/api/admin/flagged/clear-all", methods=["POST"])
def clear_all_flagged():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    db.execute("UPDATE flagged_messages SET is_reviewed=1")
    db.commit(); db.close()
    return jsonify({"message":"All flagged messages marked as reviewed."}),200

# ─ Suspicious activity ─
@app.route("/api/admin/suspicious", methods=["GET"])
def suspicious_activity():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    # Users who sent many messages in last hour
    one_hour_ago = (datetime.datetime.utcnow() - datetime.timedelta(hours=1)).isoformat()
    rows = db.execute('''
        SELECT u.*, COUNT(m.id) as msg_count_1h
        FROM messages m JOIN users u ON m.sender_id=u.id
        WHERE m.created_at >= ? AND m.deleted_at IS NULL
        GROUP BY m.sender_id HAVING msg_count_1h > 20
        ORDER BY msg_count_1h DESC LIMIT 20
    ''',(one_hour_ago,)).fetchall()
    db.close()
    return jsonify([{**user_dict(r),"msg_count_1h":r["msg_count_1h"]} for r in rows]),200

# ── More Admin Features ───────────────────────────────────────────────────────

# Admin Activity Log (in-memory, last 200 actions)
admin_log = []

def log_admin_action(admin_id, action, details=""):
    admin_log.append({
        "admin_id": admin_id,
        "action":   action,
        "details":  details,
        "at":       datetime.datetime.utcnow().isoformat(),
    })
    if len(admin_log) > 200:
        admin_log.pop(0)

@app.route("/api/admin/activity-log", methods=["GET"])
def admin_activity_log():
    uid, err = require_admin()
    if err: return err
    return jsonify(list(reversed(admin_log[-50:]))), 200

# ── Announcement System ───────────────────────────────────────────────────────
_announcements = []

@app.route("/api/admin/announcements", methods=["GET","POST","DELETE"])
def announcements():
    uid, err = require_admin()
    if err: return err
    if request.method == "GET":
        return jsonify(_announcements), 200
    if request.method == "POST":
        d = request.json or {}
        ann = {
            "id":        len(_announcements)+1,
            "title":     d.get("title",""),
            "message":   d.get("message",""),
            "type":      d.get("type","info"),  # info/warning/success/error
            "created_at": datetime.datetime.utcnow().isoformat(),
            "active":    True,
        }
        _announcements.append(ann)
        # Push to all online users
        socketio.emit("announcement", ann)
        log_admin_action(uid, "ANNOUNCEMENT", f"Created: {ann['title']}")
        return jsonify(ann), 201
    ann_id = (request.json or {}).get("id")
    for a in _announcements:
        if a["id"] == ann_id: a["active"] = False
    return jsonify({"message":"Deactivated."}), 200

@app.route("/api/announcements/active", methods=["GET"])
def active_announcements():
    return jsonify([a for a in _announcements if a.get("active")]), 200

# ── Maintenance Mode ──────────────────────────────────────────────────────────
_maintenance = {"enabled": False, "message": "App is under maintenance. Back soon!"}

@app.route("/api/admin/maintenance", methods=["GET","PUT"])
def maintenance_mode():
    uid, err = require_admin()
    if err: return err
    if request.method == "GET":
        return jsonify(_maintenance), 200
    d = request.json or {}
    _maintenance["enabled"] = bool(d.get("enabled", False))
    _maintenance["message"]  = d.get("message", _maintenance["message"])
    if _maintenance["enabled"]:
        socketio.emit("maintenance_mode", {"message": _maintenance["message"]})
        log_admin_action(uid, "MAINTENANCE", "Enabled maintenance mode")
    return jsonify(_maintenance), 200

@app.route("/api/maintenance-status", methods=["GET"])
def maintenance_status():
    return jsonify(_maintenance), 200

# ── IP Block List ─────────────────────────────────────────────────────────────
_blocked_ips = set()

@app.route("/api/admin/ip-blocks", methods=["GET","POST","DELETE"])
def ip_blocks():
    uid, err = require_admin()
    if err: return err
    if request.method == "GET":
        return jsonify({"blocked_ips": list(_blocked_ips)}), 200
    ip = (request.json or {}).get("ip","").strip()
    if not ip: return jsonify({"message":"IP required."}), 400
    if request.method == "POST":
        _blocked_ips.add(ip)
        log_admin_action(uid, "IP_BLOCK", f"Blocked IP: {ip}")
        return jsonify({"message":f"IP {ip} blocked."}), 200
    _blocked_ips.discard(ip)
    return jsonify({"message":f"IP {ip} unblocked."}), 200

# ── Achievement Leaderboard ───────────────────────────────────────────────────
@app.route("/api/admin/leaderboard/achievements", methods=["GET"])
def achievement_leaderboard():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT u.id, u.name, u.email, u.avatar_color, u.is_verified,
               COUNT(ua.achievement_key) as achievement_count
        FROM users u LEFT JOIN user_achievements ua ON u.id=ua.user_id
        GROUP BY u.id ORDER BY achievement_count DESC LIMIT 20
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200

@app.route("/api/admin/leaderboard/messages", methods=["GET"])
def message_leaderboard():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT u.id, u.name, u.email, u.avatar_color,
               COUNT(m.id) as msg_count
        FROM users u LEFT JOIN messages m ON u.id=m.sender_id AND m.deleted_at IS NULL
        GROUP BY u.id ORDER BY msg_count DESC LIMIT 20
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200

# ── Call Analytics ────────────────────────────────────────────────────────────
@app.route("/api/admin/analytics/calls", methods=["GET"])
def call_analytics():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    total  = db.execute("SELECT COUNT(*) as c FROM calls").fetchone()["c"]
    answered = db.execute("SELECT COUNT(*) as c FROM calls WHERE status='answered'").fetchone()["c"]
    missed = db.execute("SELECT COUNT(*) as c FROM calls WHERE status='missed'").fetchone()["c"]
    avg_dur = db.execute("SELECT AVG(duration) as a FROM calls WHERE status='answered' AND duration>0").fetchone()["a"]
    audio  = db.execute("SELECT COUNT(*) as c FROM calls WHERE call_type='audio'").fetchone()["c"]
    video  = db.execute("SELECT COUNT(*) as c FROM calls WHERE call_type='video'").fetchone()["c"]
    # Calls per day last 7 days
    days = []
    now = datetime.datetime.utcnow()
    for i in range(6,-1,-1):
        ds = (now - datetime.timedelta(days=i)).replace(hour=0,minute=0,second=0).isoformat()
        de = (now - datetime.timedelta(days=i-1)).replace(hour=0,minute=0,second=0).isoformat() if i > 0 else now.isoformat()
        c = db.execute("SELECT COUNT(*) as c FROM calls WHERE created_at>=? AND created_at<?", (ds,de)).fetchone()["c"]
        days.append({"day":(now-datetime.timedelta(days=i)).strftime("%a"), "count":c})
    db.close()
    return jsonify({
        "total": total, "answered": answered, "missed": missed,
        "avg_duration_sec": round(avg_dur or 0, 1),
        "audio_calls": audio, "video_calls": video,
        "days": days,
    }), 200

# ── Block Relationships ───────────────────────────────────────────────────────
@app.route("/api/admin/blocks", methods=["GET"])
def admin_blocks():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT b.*, a.name as blocker_name, c.name as blocked_name
        FROM blocks b JOIN users a ON b.blocker_id=a.id JOIN users c ON b.blocked_id=c.id
        ORDER BY b.created_at DESC LIMIT 100
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200

# ── Gift History ──────────────────────────────────────────────────────────────
@app.route("/api/admin/gifts", methods=["GET"])
def admin_gifts():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT g.*, a.name as sender_name, b.name as receiver_name
        FROM virtual_gifts g JOIN users a ON g.sender_id=a.id JOIN users b ON g.receiver_id=b.id
        ORDER BY g.created_at DESC LIMIT 100
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200

# ── Top Posts ─────────────────────────────────────────────────────────────────
@app.route("/api/admin/top-posts", methods=["GET"])
def admin_top_posts():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT p.*, u.name as user_name,
               COUNT(pl.id) as like_count,
               (SELECT COUNT(*) FROM post_comments WHERE post_id=p.id) as comment_count
        FROM posts p JOIN users u ON p.user_id=u.id
        LEFT JOIN post_likes pl ON p.id=pl.post_id
        GROUP BY p.id ORDER BY like_count DESC LIMIT 20
    ''').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200

# ── User Tags ─────────────────────────────────────────────────────────────────
_user_tags = {}  # user_id -> [tags]

@app.route("/api/admin/users/<int:tid>/tags", methods=["GET","POST","DELETE"])
def user_tags(tid):
    uid, err = require_admin()
    if err: return err
    if request.method == "GET":
        return jsonify({"tags": _user_tags.get(tid, [])}), 200
    tag = (request.json or {}).get("tag","").strip()
    if not tag: return jsonify({"message":"Tag required."}), 400
    if request.method == "POST":
        if tid not in _user_tags: _user_tags[tid] = []
        if tag not in _user_tags[tid]: _user_tags[tid].append(tag)
        return jsonify({"tags": _user_tags[tid]}), 200
    if tid in _user_tags and tag in _user_tags[tid]: _user_tags[tid].remove(tag)
    return jsonify({"tags": _user_tags.get(tid,[])}), 200

# ── Platform Statistics (extended) ───────────────────────────────────────────
@app.route("/api/admin/platform-stats", methods=["GET"])
def platform_stats():
    uid, err = require_admin()
    if err: return err
    db = get_db()
    now = datetime.datetime.utcnow()
    day_ago   = (now - datetime.timedelta(days=1)).isoformat()
    week_ago  = (now - datetime.timedelta(days=7)).isoformat()
    month_ago = (now - datetime.timedelta(days=30)).isoformat()

    result = {
        "users": {
            "total":          db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"],
            "active_today":   db.execute("SELECT COUNT(*) as c FROM messages WHERE sender_id IN (SELECT DISTINCT sender_id FROM messages WHERE created_at>=?)",(day_ago,)).fetchone()["c"],
            "active_week":    db.execute("SELECT COUNT(DISTINCT sender_id) as c FROM messages WHERE created_at>=?",(week_ago,)).fetchone()["c"],
            "banned":         db.execute("SELECT COUNT(*) as c FROM users WHERE is_banned=1").fetchone()["c"],
            "verified":       db.execute("SELECT COUNT(*) as c FROM users WHERE is_verified=1").fetchone()["c"],
        },
        "messages": {
            "total":         db.execute("SELECT COUNT(*) as c FROM messages WHERE deleted_at IS NULL").fetchone()["c"],
            "today":         db.execute("SELECT COUNT(*) as c FROM messages WHERE created_at>=? AND deleted_at IS NULL",(day_ago,)).fetchone()["c"],
            "this_week":     db.execute("SELECT COUNT(*) as c FROM messages WHERE created_at>=? AND deleted_at IS NULL",(week_ago,)).fetchone()["c"],
        },
        "groups":    {"total": db.execute("SELECT COUNT(*) as c FROM groups").fetchone()["c"]},
        "rooms":     {"total": db.execute("SELECT COUNT(*) as c FROM rooms").fetchone()["c"]},
        "posts":     {"total": db.execute("SELECT COUNT(*) as c FROM posts").fetchone()["c"]},
        "calls":     {"total": db.execute("SELECT COUNT(*) as c FROM calls").fetchone()["c"]},
        "stories":   {"total": db.execute("SELECT COUNT(*) as c FROM stories").fetchone()["c"]},
        "events":    {"total": db.execute("SELECT COUNT(*) as c FROM events").fetchone()["c"]},
        "reports":   {
            "total":    db.execute("SELECT COUNT(*) as c FROM reports").fetchone()["c"],
            "pending":  db.execute("SELECT COUNT(*) as c FROM reports WHERE status='pending'").fetchone()["c"],
        },
        "flagged":   {
            "total":    db.execute("SELECT COUNT(*) as c FROM flagged_messages").fetchone()["c"],
            "unreviewed": db.execute("SELECT COUNT(*) as c FROM flagged_messages WHERE is_reviewed=0").fetchone()["c"],
        },
    }
    db.close()
    return jsonify(result), 200

# ── Force Logout All Sessions ─────────────────────────────────────────────────
@app.route("/api/admin/users/<int:tid>/logout-all", methods=["POST"])
def logout_all_sessions(tid):
    uid, err = require_admin()
    if err: return err
    if tid in user_sockets:
        for sid in list(user_sockets[tid]):
            socketio.emit("force_logout", {"reason": "All sessions were logged out by admin."}, to=sid)
        user_sockets.pop(tid, None)
    log_admin_action(uid, "LOGOUT_ALL", f"Force-logged out user {tid}")
    return jsonify({"message": "All sessions terminated."}), 200

# ── Custom Badge (assign achievement manually from admin) ─────────────────────
@app.route("/api/admin/achievements/create", methods=["POST"])
def create_achievement():
    uid, err = require_admin()
    if err: return err
    d = request.json or {}
    key  = (d.get("key") or "").strip()
    name = (d.get("name") or "").strip()
    desc = (d.get("description") or "").strip()
    icon = d.get("icon","🏅")
    if not key or not name: return jsonify({"message":"key and name required."}), 400
    db = get_db()
    try:
        db.execute("INSERT OR IGNORE INTO achievements (key,name,description,icon) VALUES (?,?,?,?)",(key,name,desc,icon))
        db.commit()
    except Exception: pass
    db.close()
    return jsonify({"message":f"Achievement '{name}' created."}), 201

if __name__ == "__main__":
    port  = int(os.getenv("PORT",5001))
    debug = os.getenv("FLASK_ENV","development") != "production"
    socketio.run(app, debug=debug, port=port, host="0.0.0.0")
