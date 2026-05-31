import eventlet
eventlet.monkey_patch()

import os
import datetime
import json
import random

import bcrypt
import jwt
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from dotenv import load_dotenv
from database import get_db, init_db

load_dotenv()
SECRET_KEY   = os.getenv("SECRET_KEY", "dev-secret")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001")

# Allow both production URL and localhost for dev
ALLOWED_ORIGINS = list({FRONTEND_URL, "http://localhost:3001"})

app = Flask(__name__)
app.config["SECRET_KEY"] = SECRET_KEY
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS,
                    async_mode="eventlet", logger=False, engineio_logger=False)

# socket_id -> user_id, user_id -> {socket_ids}
socket_users = {}
user_sockets  = {}

AVATAR_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#06b6d4"]

init_db()

# ── Helpers ───────────────────────────────────────────────────────────────────

def make_token(user_id):
    return jwt.encode({
        "user_id": user_id,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7),
    }, SECRET_KEY, algorithm="HS256")

def get_uid():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "): return None
    try:
        return jwt.decode(auth[7:], SECRET_KEY, algorithms=["HS256"])["user_id"]
    except Exception:
        return None

def require_auth():
    uid = get_uid()
    if not uid:
        return None, (jsonify({"message": "Unauthorized"}), 401)
    return uid, None

def user_dict(row):
    return {
        "id":           row["id"],
        "name":         row["name"],
        "email":        row["email"],
        "phone":        row["phone"],
        "bio":          row["bio"],
        "avatar_color": row["avatar_color"],
        "is_online":    bool(row["is_online"]),
        "last_seen":    row["last_seen"],
        "created_at":   row["created_at"],
    }

def socket_auth(auth_data):
    token = (auth_data or {}).get("token") or request.args.get("token", "")
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])["user_id"]
    except Exception:
        return None

# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route("/api/signup", methods=["POST"])
def signup():
    d     = request.json or {}
    name  = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    pwd   = d.get("password") or ""
    phone = (d.get("phone") or "").strip()
    if not name or not email or not pwd:
        return jsonify({"message": "Name, email and password are required."}), 400
    hashed = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()
    color  = random.choice(AVATAR_COLORS)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (name,email,password,phone,avatar_color) VALUES (?,?,?,?,?)",
            (name, email, hashed, phone, color))
        db.commit()
        uid = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
        db.close()
        return jsonify({"token": make_token(uid), "message": "Account created!"}), 201
    except Exception:
        db.close()
        return jsonify({"message": "Email already in use."}), 409

@app.route("/api/login", methods=["POST"])
def login():
    d     = request.json or {}
    email = (d.get("email") or "").strip().lower()
    pwd   = d.get("password") or ""
    db    = get_db()
    user  = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    db.close()
    if not user or not bcrypt.checkpw(pwd.encode(), user["password"].encode()):
        return jsonify({"message": "Invalid credentials."}), 401
    return jsonify({"token": make_token(user["id"]), "message": "Logged in!"}), 200

@app.route("/api/me", methods=["GET"])
def me():
    uid, err = require_auth()
    if err: return err
    db   = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    unread = db.execute(
        "SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND is_read=0", (uid,)
    ).fetchone()["c"]
    friends = db.execute(
        "SELECT COUNT(*) as c FROM friendships WHERE (requester_id=? OR addressee_id=?) AND status='accepted'",
        (uid, uid)
    ).fetchone()["c"]
    pending = db.execute(
        "SELECT COUNT(*) as c FROM friendships WHERE addressee_id=? AND status='pending'", (uid,)
    ).fetchone()["c"]
    db.close()
    if not user: return jsonify({"message": "Not found"}), 404
    d = user_dict(user)
    d["unread_count"]  = unread
    d["friends_count"] = friends
    d["pending_requests"] = pending
    return jsonify(d), 200

# ── Profile ───────────────────────────────────────────────────────────────────

@app.route("/api/profile", methods=["PUT"])
def update_profile():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    db.execute("UPDATE users SET name=?,phone=?,bio=? WHERE id=?",
               (d.get("name",""), d.get("phone",""), d.get("bio",""), uid))
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    db.close()
    return jsonify(user_dict(user)), 200

@app.route("/api/password", methods=["PUT"])
def change_password():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not bcrypt.checkpw((d.get("current") or "").encode(), user["password"].encode()):
        db.close()
        return jsonify({"message": "Current password incorrect."}), 400
    hashed = bcrypt.hashpw((d.get("new") or "").encode(), bcrypt.gensalt()).decode()
    db.execute("UPDATE users SET password=? WHERE id=?", (hashed, uid))
    db.commit()
    db.close()
    return jsonify({"message": "Password updated."}), 200

# ── Users / Search ────────────────────────────────────────────────────────────

@app.route("/api/users/search", methods=["GET"])
def search_users():
    uid, err = require_auth()
    if err: return err
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify([]), 200
    db   = get_db()
    rows = db.execute(
        "SELECT * FROM users WHERE id!=? AND (name LIKE ? OR email LIKE ?) LIMIT 30",
        (uid, f"%{q}%", f"%{q}%")
    ).fetchall()
    result = _annotate_friendship(db, uid, rows)
    db.close()
    return jsonify(result), 200

@app.route("/api/users/suggested", methods=["GET"])
def suggested_users():
    """Return all users not yet friends (or pending), sorted online first."""
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute(
        "SELECT * FROM users WHERE id!=? ORDER BY is_online DESC, name ASC LIMIT 50",
        (uid,)
    ).fetchall()
    result = _annotate_friendship(db, uid, rows)
    db.close()
    return jsonify(result), 200

def _annotate_friendship(db, uid, rows):
    result = []
    for r in rows:
        fs = db.execute(
            "SELECT id,status,requester_id FROM friendships "
            "WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)",
            (uid, r["id"], r["id"], uid)
        ).fetchone()
        u = user_dict(r)
        u["is_online"]         = r["id"] in user_sockets
        u["friendship_id"]     = fs["id"]                        if fs else None
        u["friendship_status"] = fs["status"]                    if fs else None
        u["friendship_mine"]   = (fs["requester_id"] == uid)     if fs else None
        result.append(u)
    return result

# ── Friends ───────────────────────────────────────────────────────────────────

@app.route("/api/friends", methods=["GET"])
def get_friends():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT u.*, f.id as f_id
        FROM friendships f
        JOIN users u ON (
            CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END = u.id
        )
        WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status='accepted'
        ORDER BY u.name ASC
    ''', (uid, uid, uid)).fetchall()
    db.close()
    result = []
    for r in rows:
        u = user_dict(r)
        u["is_online"] = r["id"] in user_sockets
        result.append(u)
    return jsonify(result), 200

@app.route("/api/friends/requests", methods=["GET"])
def friend_requests():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    incoming = db.execute('''
        SELECT u.*, f.id as f_id FROM friendships f
        JOIN users u ON f.requester_id=u.id
        WHERE f.addressee_id=? AND f.status='pending'
        ORDER BY f.created_at DESC
    ''', (uid,)).fetchall()
    outgoing = db.execute('''
        SELECT u.*, f.id as f_id FROM friendships f
        JOIN users u ON f.addressee_id=u.id
        WHERE f.requester_id=? AND f.status='pending'
        ORDER BY f.created_at DESC
    ''', (uid,)).fetchall()
    db.close()
    return jsonify({
        "incoming": [{**user_dict(r), "f_id": r["f_id"]} for r in incoming],
        "outgoing": [{**user_dict(r), "f_id": r["f_id"]} for r in outgoing],
    }), 200

@app.route("/api/friends/request/<int:target_id>", methods=["POST"])
def send_request(target_id):
    uid, err = require_auth()
    if err: return err
    if uid == target_id:
        return jsonify({"message": "Cannot add yourself."}), 400
    db = get_db()
    try:
        db.execute(
            "INSERT INTO friendships (requester_id,addressee_id,status) VALUES (?,?,'pending')",
            (uid, target_id))
        db.commit()
        me = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        fid = db.execute("SELECT id FROM friendships WHERE requester_id=? AND addressee_id=?", (uid, target_id)).fetchone()["id"]
        db.close()
        if target_id in user_sockets:
            payload = {**user_dict(me), "f_id": fid}
            socketio.emit("friend_request", payload, to=f"user_{target_id}")
        return jsonify({"message": "Friend request sent!"}), 201
    except Exception:
        db.close()
        return jsonify({"message": "Request already sent."}), 409

@app.route("/api/friends/<int:fid>/accept", methods=["POST"])
def accept_request(fid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    f = db.execute("SELECT * FROM friendships WHERE id=? AND addressee_id=?", (fid, uid)).fetchone()
    if not f:
        db.close(); return jsonify({"message": "Not found."}), 404
    db.execute("UPDATE friendships SET status='accepted' WHERE id=?", (fid,))
    db.commit()
    me = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    rid = f["requester_id"]
    db.close()
    if rid in user_sockets:
        socketio.emit("friend_accepted", user_dict(me), to=f"user_{rid}")
    return jsonify({"message": "Friend request accepted!"}), 200

@app.route("/api/friends/<int:fid>/decline", methods=["POST"])
def decline_request(fid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM friendships WHERE id=? AND addressee_id=?", (fid, uid))
    db.commit(); db.close()
    return jsonify({"message": "Request declined."}), 200

@app.route("/api/friends/<int:target_id>/remove", methods=["DELETE"])
def remove_friend(target_id):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute(
        "DELETE FROM friendships WHERE "
        "((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) "
        "AND status='accepted'",
        (uid, target_id, target_id, uid))
    db.commit(); db.close()
    return jsonify({"message": "Friend removed."}), 200

@app.route("/api/friends/<int:target_id>/cancel", methods=["DELETE"])
def cancel_request(target_id):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute(
        "DELETE FROM friendships WHERE requester_id=? AND addressee_id=? AND status='pending'",
        (uid, target_id))
    db.commit(); db.close()
    return jsonify({"message": "Request cancelled."}), 200

# ── Messages ──────────────────────────────────────────────────────────────────

@app.route("/api/messages/conversations", methods=["GET"])
def conversations():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT m.*,
               u.name        AS peer_name,
               u.avatar_color AS peer_color,
               u.is_online   AS peer_online,
               (SELECT COUNT(*) FROM messages m2
                WHERE m2.sender_id=u.id AND m2.receiver_id=? AND m2.is_read=0) AS unread
        FROM messages m
        JOIN users u ON (CASE WHEN m.sender_id=? THEN m.receiver_id ELSE m.sender_id END = u.id)
        WHERE m.id IN (
            SELECT MAX(id) FROM messages
            WHERE sender_id=? OR receiver_id=?
            GROUP BY CASE WHEN sender_id < receiver_id
                          THEN sender_id || '_' || receiver_id
                          ELSE receiver_id || '_' || sender_id END
        )
        ORDER BY m.created_at DESC
    ''', (uid, uid, uid, uid)).fetchall()
    result = []
    for r in rows:
        peer_id = r["receiver_id"] if r["sender_id"] == uid else r["sender_id"]
        result.append({
            "peer_id":    peer_id,
            "peer_name":  r["peer_name"],
            "peer_color": r["peer_color"],
            "peer_online": (peer_id in user_sockets),
            "content":    r["content"],
            "sender_id":  r["sender_id"],
            "created_at": r["created_at"],
            "unread":     r["unread"],
        })
    db.close()
    return jsonify(result), 200

@app.route("/api/messages/<int:peer_id>", methods=["GET"])
def get_messages(peer_id):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT * FROM messages
        WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
        ORDER BY created_at ASC LIMIT 200
    ''', (uid, peer_id, peer_id, uid)).fetchall()
    db.execute(
        "UPDATE messages SET is_read=1 WHERE sender_id=? AND receiver_id=? AND is_read=0",
        (peer_id, uid))
    db.commit(); db.close()
    return jsonify([dict(r) for r in rows]), 200

# ── Contacts ──────────────────────────────────────────────────────────────────

@app.route("/api/contacts", methods=["GET"])
def get_contacts():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute(
        "SELECT * FROM contacts WHERE user_id=? ORDER BY name ASC", (uid,)
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200

@app.route("/api/contacts", methods=["POST"])
def add_contact():
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    if not (d.get("name") or "").strip():
        return jsonify({"message": "Name required."}), 400
    db = get_db()
    db.execute(
        "INSERT INTO contacts (user_id,name,phone,email,notes) VALUES (?,?,?,?,?)",
        (uid, d["name"].strip(), d.get("phone",""), d.get("email",""), d.get("notes","")))
    db.commit()
    cid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    row = db.execute("SELECT * FROM contacts WHERE id=?", (cid,)).fetchone()
    db.close()
    return jsonify(dict(row)), 201

@app.route("/api/contacts/<int:cid>", methods=["PUT"])
def update_contact(cid):
    uid, err = require_auth()
    if err: return err
    d = request.json or {}
    db = get_db()
    db.execute(
        "UPDATE contacts SET name=?,phone=?,email=?,notes=? WHERE id=? AND user_id=?",
        (d.get("name",""), d.get("phone",""), d.get("email",""), d.get("notes",""), cid, uid))
    db.commit()
    row = db.execute("SELECT * FROM contacts WHERE id=?", (cid,)).fetchone()
    db.close()
    return jsonify(dict(row)), 200

@app.route("/api/contacts/<int:cid>", methods=["DELETE"])
def delete_contact(cid):
    uid, err = require_auth()
    if err: return err
    db = get_db()
    db.execute("DELETE FROM contacts WHERE id=? AND user_id=?", (cid, uid))
    db.commit(); db.close()
    return jsonify({"message": "Deleted."}), 200

# ── Call History ──────────────────────────────────────────────────────────────

@app.route("/api/calls", methods=["GET"])
def get_calls():
    uid, err = require_auth()
    if err: return err
    db = get_db()
    rows = db.execute('''
        SELECT c.*,
               a.name as caller_name, a.avatar_color as caller_color,
               b.name as receiver_name, b.avatar_color as receiver_color
        FROM calls c
        JOIN users a ON c.caller_id   = a.id
        JOIN users b ON c.receiver_id = b.id
        WHERE c.caller_id=? OR c.receiver_id=?
        ORDER BY c.created_at DESC LIMIT 50
    ''', (uid, uid)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200

# ── SocketIO ──────────────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect(auth):
    uid = socket_auth(auth)
    if not uid:
        return False
    sid = request.sid
    socket_users[sid] = uid
    if uid not in user_sockets:
        user_sockets[uid] = set()
    user_sockets[uid].add(sid)
    join_room(f"user_{uid}")
    db = get_db()
    db.execute("UPDATE users SET is_online=1 WHERE id=?", (uid,))
    db.commit(); db.close()
    emit("user_online", {"user_id": uid}, broadcast=True, include_self=False)

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    uid = socket_users.pop(sid, None)
    if uid and uid in user_sockets:
        user_sockets[uid].discard(sid)
        if not user_sockets[uid]:
            del user_sockets[uid]
            now = datetime.datetime.utcnow().isoformat()
            db = get_db()
            db.execute("UPDATE users SET is_online=0, last_seen=? WHERE id=?", (now, uid))
            db.commit(); db.close()
            emit("user_offline", {"user_id": uid}, broadcast=True, include_self=False)

@socketio.on("send_message")
def on_send_message(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to      = data.get("to")
    content = (data.get("content") or "").strip()
    if not to or not content: return
    db = get_db()
    db.execute("INSERT INTO messages (sender_id,receiver_id,content) VALUES (?,?,?)",
               (uid, to, content))
    db.commit()
    mid = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    msg = dict(db.execute("SELECT * FROM messages WHERE id=?", (mid,)).fetchone())
    db.close()
    emit("new_message", msg, to=f"user_{to}")
    emit("new_message", msg, to=f"user_{uid}")

@socketio.on("typing")
def on_typing(data):
    uid = socket_users.get(request.sid)
    if uid and data.get("to"):
        emit("typing", {"from": uid}, to=f"user_{data['to']}")

@socketio.on("stop_typing")
def on_stop_typing(data):
    uid = socket_users.get(request.sid)
    if uid and data.get("to"):
        emit("stop_typing", {"from": uid}, to=f"user_{data['to']}")

# ── WebRTC Signaling ──────────────────────────────────────────────────────────

@socketio.on("call_offer")
def on_call_offer(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to = data.get("to")
    db = get_db()
    caller = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    db.execute("INSERT INTO calls (caller_id,receiver_id,status,call_type) VALUES (?,?,'initiated',?)",
               (uid, to, data.get("call_type","audio")))
    db.commit()
    call_id = db.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    db.close()
    emit("call_incoming", {
        "from":        uid,
        "call_id":     call_id,
        "offer":       data.get("offer"),
        "call_type":   data.get("call_type","audio"),
        "caller_name": caller["name"],
        "caller_color": caller["avatar_color"],
    }, to=f"user_{to}")

@socketio.on("call_answer")
def on_call_answer(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to      = data.get("to")
    call_id = data.get("call_id")
    db = get_db()
    db.execute("UPDATE calls SET status='answered' WHERE id=?", (call_id,))
    db.commit(); db.close()
    emit("call_answered", {"from": uid, "answer": data.get("answer"), "call_id": call_id},
         to=f"user_{to}")

@socketio.on("call_decline")
def on_call_decline(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to      = data.get("to")
    call_id = data.get("call_id")
    db = get_db()
    db.execute("UPDATE calls SET status='declined' WHERE id=?", (call_id,))
    db.commit(); db.close()
    emit("call_declined", {"from": uid}, to=f"user_{to}")

@socketio.on("call_end")
def on_call_end(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to       = data.get("to")
    call_id  = data.get("call_id")
    duration = data.get("duration", 0)
    db = get_db()
    db.execute("UPDATE calls SET status='ended', duration=? WHERE id=?", (duration, call_id))
    db.commit(); db.close()
    emit("call_ended", {"from": uid}, to=f"user_{to}")

@socketio.on("ice_candidate")
def on_ice_candidate(data):
    uid = socket_users.get(request.sid)
    if not uid: return
    to = data.get("to")
    if to:
        emit("ice_candidate", {"from": uid, "candidate": data.get("candidate")},
             to=f"user_{to}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    debug = os.getenv("FLASK_ENV", "development") != "production"
    socketio.run(app, debug=debug, port=port, host="0.0.0.0")
