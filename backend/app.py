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

load_dotenv()
SECRET_KEY   = os.getenv("SECRET_KEY", "dev-secret")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001")
ADMIN_EMAILS = [e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "aariz123awais@gmail.com").split(",")]
ALLOWED_ORIGINS = list({FRONTEND_URL, "http://localhost:3001"})

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
    socketio.emit("user_availability", {"user_id": uid, "available": available, "user": user_dict(user)}, broadcast=True)
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
    db = get_db()
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
    exp_dt = None
    if expires:
        exp_dt = (datetime.datetime.utcnow() + datetime.timedelta(minutes=int(expires))).isoformat()
    db = get_db()
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
    emit("call_incoming",{"from":uid,"call_id":call_id,"offer":data.get("offer"),
         "call_type":data.get("call_type","audio"),"caller_name":caller["name"],"caller_color":caller["avatar_color"]},
         to=f"user_{to}")

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
    }, broadcast=True)
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

if __name__ == "__main__":
    port  = int(os.getenv("PORT",5001))
    debug = os.getenv("FLASK_ENV","development") != "production"
    socketio.run(app, debug=debug, port=port, host="0.0.0.0")
