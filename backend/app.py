"""The REST API (Flask). Start it with:

    python -m backend.app

It listens on http://127.0.0.1:5050. In development the React app (frontend/, `npm run dev`) calls it
through Vite's proxy; after `npm run build`, this server also serves the built web page itself.
"""

from __future__ import annotations

import os
import re
import sqlite3
from contextlib import closing

from flask import Flask, jsonify, request, send_from_directory

from backend import config
from backend.market import Market, clean
from backend.portfolio import PaperBroker

DIST = config.ROOT / "frontend" / "dist"
# The Pro waitlist lives beside the paper account in its database; resetting the account leaves it alone.
WAITLIST = """CREATE TABLE IF NOT EXISTS waitlist (
    email TEXT PRIMARY KEY, platform TEXT NOT NULL, source TEXT, joined_on TEXT NOT NULL)"""
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PLATFORMS = ("mac", "android", "both")


def create_app(market: Market = None, db_path=None) -> Flask:
    app = Flask(__name__, static_folder=None)
    market = market or Market()
    broker = PaperBroker(market, db_path or config.DB_PATH)
    with closing(sqlite3.connect(broker.path)) as db, db:
        db.execute(WAITLIST)

    def slot_size():
        return broker.state()["slot_size"]

    @app.errorhandler(ValueError)
    def bad_request(error):
        return jsonify({"error": str(error)}), 400

    @app.errorhandler(KeyError)
    def not_found(error):
        return jsonify({"error": f"Unknown: {error}"}), 404

    # ------------------------------------------------------------------ market
    @app.get("/api/status")
    def status():
        return jsonify(market.status(broker.as_of))

    @app.get("/api/ideas")
    def ideas():
        return jsonify({"as_of": broker.as_of, "ideas": market.ideas_on(broker.as_of, slot_size())})

    @app.get("/api/stocks")
    def stocks():
        return jsonify({"as_of": broker.as_of, "stocks": market.stocks_on(broker.as_of)})

    @app.get("/api/stocks/<symbol>")
    def stock(symbol):
        days = int(request.args.get("days", 365))
        return jsonify(market.stock_detail(symbol.upper(), broker.as_of, days))

    # ------------------------------------------------------------------ the model and the backtest
    @app.get("/api/model")
    def model():
        return jsonify(market.metrics)

    @app.get("/api/backtest")
    def backtest():
        return jsonify(market.backtest)

    # ------------------------------------------------------------------ the clock
    @app.post("/api/clock")
    def clock():
        body = request.get_json(force=True, silent=True) or {}
        if body.get("latest"):
            return jsonify(broker.set_clock(market.latest))
        if "step" in body:
            return jsonify(broker.step(int(body["step"])))
        if "date" in body:
            return jsonify(broker.set_clock(str(body["date"])))
        raise ValueError("Send {date}, {step} or {latest: true}.")

    # ------------------------------------------------------------------ paper trading
    @app.get("/api/portfolio")
    def portfolio():
        return jsonify(clean(broker.state()))

    @app.post("/api/portfolio/orders")
    def place_order():
        body = request.get_json(force=True, silent=True) or {}
        symbol = str(body.get("symbol", "")).upper()
        if symbol not in market.bars:
            raise ValueError(f"Unknown stock {symbol!r}.")
        as_of = broker.as_of
        idea = next((i for i in market.ideas_on(as_of) if i["symbol"] == symbol), None)
        if idea is None:                     # no rule idea today: use the standard barriers
            idea = market.stock_detail(symbol, as_of, days=5)["default_barriers"]
        return jsonify(broker.place_order(symbol, int(body.get("qty", 0)), idea)), 201

    @app.post("/api/portfolio/<int:trade_id>/close")
    def close(trade_id):
        return jsonify(broker.close(trade_id))

    @app.post("/api/portfolio/reset")
    def reset():
        broker.reset()
        return jsonify({"ok": True})

    # ------------------------------------------------------------------ the Pro waitlist
    @app.post("/api/waitlist")
    def join_waitlist():
        body = request.get_json(force=True, silent=True) or {}
        email = str(body.get("email", "")).strip().lower()
        platform = str(body.get("platform", ""))
        if len(email) > 254 or not EMAIL.fullmatch(email):
            raise ValueError("That doesn't look like an email address.")
        if platform not in PLATFORMS:
            raise ValueError("Choose Mac, Android or both.")
        source = str(body.get("source") or "")[:40] or None      # the page that sent them, e.g. "search"
        with closing(sqlite3.connect(broker.path)) as db, db:     # joining twice updates the platform, keeps the source
            db.execute("INSERT INTO waitlist VALUES (?, ?, ?, date('now')) "
                       "ON CONFLICT (email) DO UPDATE SET platform = excluded.platform", (email, platform, source))
        return jsonify({"ok": True}), 201

    # ------------------------------------------------------------------ the built web page
    @app.get("/")
    @app.get("/<path:path>")
    def web(path="index.html"):
        if path.startswith("api/"):
            return jsonify({"error": "Not found"}), 404
        if not DIST.exists():
            return ("The web page isn't built yet. In frontend/, run `npm install` then `npm run dev` "
                    "(and open http://localhost:5173), or `npm run build` to serve it from here."), 200
        target = DIST / path
        return send_from_directory(DIST, path if target.is_file() else "index.html")

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print("Loading data and the model (a few seconds) ...", flush=True)
    create_app().run(host="127.0.0.1", port=port, debug=False)
