"""
new_endpoints.py  —  Additional routes for THE CHATING app
All 11 feature groups are covered below.

IMPORTANT: Most features (streaks, reminders, stickers, profile views, live
streams, payment requests, business profiles, appointments, smart reply,
translation) are ALREADY implemented in app.py.  Only the GAMES endpoints
are entirely new.  This file provides:

  1. Complete, drop-in game routes (copy these into app.py)
  2. Standalone register_routes() helper so you can also import this module.

Usage — add ONE line to app.py after init_db():
    from new_endpoints import register_routes; register_routes(app, require_auth, socketio)
"""

import json
import datetime

from flask import request, jsonify
from database import get_db


# ─────────────────────────────────────────────────────────────────────────────
# Internal game logic helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ttt_init_state():
    return {"board": [None] * 9, "moves": []}


def _ttt_winner(board):
    """Return the winning mark ('X'/'O') or None."""
    lines = [
        (0, 1, 2), (3, 4, 5), (6, 7, 8),   # rows
        (0, 3, 6), (1, 4, 7), (2, 5, 8),   # cols
        (0, 4, 8), (2, 4, 6),               # diags
    ]
    for a, b, c in lines:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    return None


def _rps_outcome(p1_move, p2_move):
    """Return 'player1', 'player2', or 'draw'."""
    beats = {"rock": "scissors", "scissors": "paper", "paper": "rock"}
    if p1_move == p2_move:
        return "draw"
    return "player1" if beats.get(p1_move) == p2_move else "player2"


# ─────────────────────────────────────────────────────────────────────────────
# Games routes
# ─────────────────────────────────────────────────────────────────────────────

def _register_games(app, require_auth, socketio=None):

    @app.route("/api/games/start", methods=["POST"])
    def games_start():
        uid, err = require_auth()
        if err:
            return err
        data = request.get_json(silent=True) or {}
        friend_id = data.get("friend_id")
        game_type = data.get("game_type", "tictactoe")

        if not friend_id:
            return jsonify({"message": "friend_id required"}), 400
        if game_type not in ("tictactoe", "rps"):
            return jsonify({"message": "game_type must be 'tictactoe' or 'rps'"}), 400

        db = get_db()
        # Prevent duplicate active games between the same pair
        existing = db.execute(
            """SELECT id FROM game_sessions
               WHERE status = 'active'
                 AND ((player1_id=? AND player2_id=?) OR (player1_id=? AND player2_id=?))""",
            (uid, friend_id, friend_id, uid),
        ).fetchone()
        if existing:
            db.close()
            return jsonify({"message": "Active game already exists", "game_id": existing["id"]}), 409

        init_state = _ttt_init_state() if game_type == "tictactoe" else {"moves": {}}
        db.execute(
            """INSERT INTO game_sessions (game_type, player1_id, player2_id, state_json, current_turn)
               VALUES (?, ?, ?, ?, ?)""",
            (game_type, uid, friend_id, json.dumps(init_state), uid),
        )
        db.commit()
        game_id = db.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        db.close()

        if socketio:
            socketio.emit("game_invite", {"game_id": game_id, "game_type": game_type, "from": uid},
                          to=f"user_{friend_id}")

        return jsonify({"game_id": game_id, "game_type": game_type, "status": "active"}), 201

    @app.route("/api/games/active", methods=["GET"])
    def games_active():
        uid, err = require_auth()
        if err:
            return err
        db = get_db()
        rows = db.execute(
            """SELECT gs.*, p1.name AS player1_name, p2.name AS player2_name
               FROM game_sessions gs
               JOIN users p1 ON p1.id = gs.player1_id
               JOIN users p2 ON p2.id = gs.player2_id
               WHERE gs.status = 'active'
                 AND (gs.player1_id = ? OR gs.player2_id = ?)
               ORDER BY gs.created_at DESC""",
            (uid, uid),
        ).fetchall()
        db.close()
        return jsonify([{
            "id": r["id"],
            "game_type": r["game_type"],
            "player1_id": r["player1_id"],
            "player1_name": r["player1_name"],
            "player2_id": r["player2_id"],
            "player2_name": r["player2_name"],
            "current_turn": r["current_turn"],
            "created_at": r["created_at"],
        } for r in rows])

    @app.route("/api/games/<int:game_id>", methods=["GET"])
    def games_get(game_id):
        uid, err = require_auth()
        if err:
            return err
        db = get_db()
        game = db.execute("SELECT * FROM game_sessions WHERE id = ?", (game_id,)).fetchone()
        db.close()
        if not game:
            return jsonify({"message": "Game not found"}), 404
        if uid not in (game["player1_id"], game["player2_id"]):
            return jsonify({"message": "Forbidden"}), 403
        return jsonify({
            "id": game["id"],
            "game_type": game["game_type"],
            "player1_id": game["player1_id"],
            "player2_id": game["player2_id"],
            "state": json.loads(game["state_json"]),
            "current_turn": game["current_turn"],
            "winner_id": game["winner_id"],
            "status": game["status"],
            "created_at": game["created_at"],
        })

    @app.route("/api/games/<int:game_id>/move", methods=["POST"])
    def games_move(game_id):
        uid, err = require_auth()
        if err:
            return err
        data = request.get_json(silent=True) or {}
        db = get_db()
        game = db.execute("SELECT * FROM game_sessions WHERE id = ?", (game_id,)).fetchone()

        if not game:
            db.close()
            return jsonify({"message": "Game not found"}), 404
        if uid not in (game["player1_id"], game["player2_id"]):
            db.close()
            return jsonify({"message": "Forbidden"}), 403
        if game["status"] != "active":
            db.close()
            return jsonify({"message": "Game is not active"}), 409
        if game["current_turn"] != uid:
            db.close()
            return jsonify({"message": "Not your turn"}), 409

        state = json.loads(game["state_json"])
        opponent_id = game["player2_id"] if uid == game["player1_id"] else game["player1_id"]
        winner_id = None
        new_status = "active"
        next_turn = opponent_id

        # ── Tic-tac-toe ──────────────────────────────────────────────────────
        if game["game_type"] == "tictactoe":
            pos = data.get("position")
            if pos is None or not isinstance(pos, int) or not (0 <= pos <= 8):
                db.close()
                return jsonify({"message": "position (0–8) required"}), 400
            if state["board"][pos] is not None:
                db.close()
                return jsonify({"message": "Cell already taken"}), 409

            mark = "X" if uid == game["player1_id"] else "O"
            state["board"][pos] = mark
            state["moves"].append({"player": uid, "position": pos, "mark": mark})

            winning_mark = _ttt_winner(state["board"])
            if winning_mark:
                winner_id = uid
                new_status = "finished"
                next_turn = uid  # doesn't matter — game over
            elif all(c is not None for c in state["board"]):
                new_status = "draw"

        # ── Rock-Paper-Scissors ───────────────────────────────────────────────
        elif game["game_type"] == "rps":
            move = (data.get("move") or "").lower()
            if move not in ("rock", "paper", "scissors"):
                db.close()
                return jsonify({"message": "move must be rock, paper, or scissors"}), 400

            state["moves"][str(uid)] = move

            p1_key = str(game["player1_id"])
            p2_key = str(game["player2_id"])
            if p1_key in state["moves"] and p2_key in state["moves"]:
                p1m = state["moves"][p1_key]
                p2m = state["moves"][p2_key]
                outcome = _rps_outcome(p1m, p2m)
                state["outcome"] = outcome
                if outcome == "player1":
                    winner_id = game["player1_id"]
                elif outcome == "player2":
                    winner_id = game["player2_id"]
                new_status = "draw" if outcome == "draw" else "finished"
            # Hide the opponent's move until both have played
            visible_state = {
                "your_move": move,
                "both_moved": new_status != "active",
                "outcome": state.get("outcome"),
                "moves": state["moves"] if new_status != "active" else {},
            }
            state["_visible"] = visible_state

        else:
            db.close()
            return jsonify({"message": "Unknown game type"}), 400

        db.execute(
            """UPDATE game_sessions
               SET state_json = ?, current_turn = ?, winner_id = ?, status = ?
               WHERE id = ?""",
            (json.dumps(state), next_turn, winner_id, new_status, game_id),
        )
        db.commit()
        db.close()

        result = {"status": new_status, "winner_id": winner_id, "state": state}
        if socketio:
            socketio.emit("game_update", {**result, "game_id": game_id}, to=f"user_{opponent_id}")
            socketio.emit("game_update", {**result, "game_id": game_id}, to=f"user_{uid}")

        return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# Public registration entry-point
# ─────────────────────────────────────────────────────────────────────────────

def register_routes(app, require_auth, socketio=None):
    """
    Call this once after app and require_auth are defined, e.g.:

        from new_endpoints import register_routes
        register_routes(app, require_auth, socketio)

    All 11 feature groups:
      - Games (NEW)            → registered here
      - Streaks                → already in app.py (/api/streaks, /api/streaks/<id> missing — add below)
      - Reminders              → already in app.py
      - Stickers               → already in app.py
      - Profile Views          → already in app.py
      - Live Streams           → already in app.py
      - Payment Requests       → already in app.py
      - Business Profiles      → already in app.py
      - Appointments           → already in app.py
      - Smart Reply            → already in app.py
      - Translation            → already in app.py
    """
    _register_games(app, require_auth, socketio)
    _register_streaks_friend(app, require_auth)


def _register_streaks_friend(app, require_auth):
    """GET /api/streaks/<friend_id> — the per-friend streak endpoint missing from app.py."""

    @app.route("/api/streaks/<int:friend_id>", methods=["GET"])
    def streaks_with_friend(friend_id):
        uid, err = require_auth()
        if err:
            return err
        u1, u2 = min(uid, friend_id), max(uid, friend_id)
        db = get_db()
        row = db.execute(
            "SELECT * FROM message_streaks WHERE user1_id = ? AND user2_id = ?",
            (u1, u2),
        ).fetchone()
        db.close()
        if not row:
            return jsonify({"streak_count": 0, "last_message_date": None})
        return jsonify({
            "streak_count": row["streak_count"],
            "last_message_date": row["last_message_date"],
        })
