"""Paper trading: a pretend account that follows the same rules as the labels and the backtest.

- An order placed on the evening of day D buys at the open of the next trading day (like the research).
- The stop and target keep their distance from the actual fill price.
- Each day after that, the trade is checked against the day's bar: a gap through a barrier fills at the
  open, a day touching both barriers is a stop, and it is sold at the close of its last day (the 20th,
  or its rule's own limit when config.RULE_EXITS is set).
- With config.CASH_SWEEP on, cash left after the morning's buys earns the day's liquid-fund rate (or the
  NIFTY's change). It is kept as its own line, `cash_earned`, and never counted in a trade's P&L.

The app has a clock (the "as-of" date). Moving it forward replays the days in between, one at a time,
so trades fill and close exactly as they would have. Moving it backwards resets the account, because
the future can't be un-known.

Everything is stored in SQLite (paper_trading.db), so the account survives a restart.
"""

from __future__ import annotations

import math
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pandas as pd

from backend import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cash REAL NOT NULL,
    starting_cash REAL NOT NULL,
    started_on TEXT
);
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    qty INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'open', 'closed', 'cancelled')),
    placed_on TEXT NOT NULL,
    rule TEXT,
    p_win REAL,
    expected_return REAL,
    target_pct REAL NOT NULL,
    stop_pct REAL NOT NULL,
    entry_date TEXT, entry_price REAL, target_price REAL, stop_price REAL,
    exit_date TEXT, exit_price REAL, exit_reason TEXT, days_held INTEGER DEFAULT 0,
    net_return REAL, pnl REAL, note TEXT
);
CREATE TABLE IF NOT EXISTS equity (date TEXT PRIMARY KEY, value REAL NOT NULL, cash REAL NOT NULL);
"""


class PaperBroker:
    def __init__(self, market, path: Path = config.DB_PATH):
        self.market = market
        self.path = str(path)
        with self._db() as db:
            db.executescript(SCHEMA)
            for table, column in (("account", "swept REAL NOT NULL DEFAULT 0"), ("trades", "hold_days INTEGER")):
                if column.split()[0] not in [r["name"] for r in db.execute(f"PRAGMA table_info({table})")]:
                    db.execute(f"ALTER TABLE {table} ADD COLUMN {column}")      # a database from before the levers
            if db.execute("SELECT COUNT(*) FROM account").fetchone()[0] == 0:
                db.execute("INSERT INTO account (id, cash, starting_cash) VALUES (1, ?, ?)",
                           (config.STARTING_CASH, config.STARTING_CASH))
            if self._setting(db, "as_of") is None:
                self._set(db, "as_of", market.latest)
                self._set(db, "follow_latest", "1")
        # After new prices are loaded, a clock that was on the latest day moves on to the new latest day
        # (filling any orders that were waiting for the next open).
        with self._db() as db:
            follow = self._setting(db, "follow_latest") == "1"
        if follow and self.as_of < market.latest:
            self.set_clock(market.latest)
        elif self.as_of > market.latest:
            self.set_clock(market.latest)

    # ------------------------------------------------------------------ storage helpers
    @contextmanager
    def _db(self):
        """A connection that commits on success, rolls back on error, and always closes."""
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def _setting(db, key):
        row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None

    @staticmethod
    def _set(db, key, value):
        db.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                   (key, value))

    # ------------------------------------------------------------------ the clock
    @property
    def as_of(self) -> str:
        with self._db() as db:
            return self._setting(db, "as_of")

    def set_clock(self, new_date: str) -> dict:
        """Move the as-of date. Forward replays every day in between; backward resets the account."""
        new_date = self.market.snap(new_date)
        current = self.as_of
        with self._db() as db:
            self._set(db, "follow_latest", "1" if new_date == self.market.latest else "0")
            if new_date < current:
                self._reset(db)
                self._set(db, "as_of", new_date)
                return {"as_of": new_date, "reset": True}
            for day in self.market.trading_days_between(current, new_date):
                self._replay_day(db, day)
            self._set(db, "as_of", new_date)
        return {"as_of": new_date, "reset": False}

    def step(self, days: int) -> dict:
        return self.set_clock(self.market.shift(self.as_of, days))

    # ------------------------------------------------------------------ orders
    def place_order(self, symbol: str, qty: int, idea: dict) -> dict:
        """A buy at the next open. `idea` gives the target (None: no target) and stop as fractions, the
        time limit and, if the stock has a rule idea today, its rule, probability and expected return."""
        qty = int(qty)
        if qty <= 0:
            raise ValueError("Quantity must be at least 1.")
        as_of = self.as_of
        price = self.market.close_on(symbol, as_of)
        with self._db() as db:
            cash = db.execute("SELECT cash FROM account").fetchone()["cash"]
            reserved = sum(r["qty"] * self.market.close_on(r["symbol"], as_of)
                           for r in db.execute("SELECT symbol, qty FROM trades WHERE status = 'pending'"))
            needed = qty * price * (1 + config.COST)
            if needed > cash - reserved + 1e-6:
                raise ValueError(f"Not enough cash: this needs about Rs {needed:,.0f}, "
                                 f"and Rs {max(cash - reserved, 0):,.0f} is free.")
            if db.execute("SELECT COUNT(*) FROM trades WHERE symbol = ? AND status IN ('pending', 'open')",
                          (symbol,)).fetchone()[0]:
                raise ValueError(f"You already hold or have an order for {symbol}.")
            if db.execute("SELECT started_on FROM account").fetchone()["started_on"] is None:
                db.execute("UPDATE account SET started_on = ?", (as_of,))
                db.execute("INSERT OR REPLACE INTO equity (date, value, cash) VALUES (?, ?, ?)", (as_of, cash, cash))
            target = idea.get("target_pct")
            cursor = db.execute(
                "INSERT INTO trades (symbol, qty, status, placed_on, rule, p_win, expected_return, target_pct, stop_pct, "
                "hold_days) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)",
                (symbol, qty, as_of, idea.get("rule"), idea.get("p_win"), idea.get("expected_return"),
                 math.inf if target is None else float(target), float(idea["stop_pct"]),
                 int(idea.get("hold_days") or config.HOLD_DAYS)))
            return {"id": cursor.lastrowid, "status": "pending"}

    def close(self, trade_id: int) -> dict:
        """Sell an open position at today's close, or cancel an order that hasn't filled yet."""
        as_of = self.as_of
        with self._db() as db:
            trade = db.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()
            if trade is None:
                raise ValueError("No such trade.")
            if trade["status"] == "pending":
                db.execute("UPDATE trades SET status = 'cancelled' WHERE id = ?", (trade_id,))
                return {"id": trade_id, "status": "cancelled"}
            if trade["status"] != "open":
                raise ValueError("That trade is already closed.")
            self._exit(db, trade, as_of, self.market.close_on(trade["symbol"], as_of), "manual")
            return {"id": trade_id, "status": "closed"}

    def reset(self) -> None:
        with self._db() as db:
            self._reset(db)

    def _reset(self, db) -> None:
        db.execute("DELETE FROM trades")
        db.execute("DELETE FROM equity")
        db.execute("UPDATE account SET cash = starting_cash, started_on = NULL, swept = 0")

    # ------------------------------------------------------------------ the daily replay
    def _replay_day(self, db, day: str) -> None:
        """One trading day: fill yesterday's orders at today's open, credit the idle cash's return, then
        check every open trade against today's bar, then record the account's value at the close."""
        for trade in db.execute("SELECT * FROM trades WHERE status = 'pending' AND placed_on < ?", (day,)).fetchall():
            bar = self.market.bar(trade["symbol"], day)
            if bar is None:
                continue                                   # no trading in this stock today: try tomorrow
            cash = db.execute("SELECT cash FROM account").fetchone()["cash"]
            qty = min(trade["qty"], math.floor(cash / (bar["open"] * (1 + config.COST))))
            if qty <= 0:
                db.execute("UPDATE trades SET status = 'cancelled', note = 'not enough cash at the open' WHERE id = ?",
                           (trade["id"],))
                continue
            entry = bar["open"]
            db.execute("UPDATE account SET cash = cash - ?", (qty * entry * (1 + config.COST),))
            db.execute("UPDATE trades SET status = 'open', qty = ?, entry_date = ?, entry_price = ?, target_price = ?, "
                       "stop_price = ?, days_held = 0 WHERE id = ?",
                       (qty, day, entry, entry * (1 + trade["target_pct"]), entry * (1 - trade["stop_pct"]), trade["id"]))

        started = db.execute("SELECT started_on FROM account").fetchone()["started_on"]
        rate = self.market.cash_return.get(day, 0.0)
        if started and rate:
            db.execute("UPDATE account SET swept = swept + cash * ?, cash = cash * (1 + ?)", (rate, rate))

        for trade in db.execute("SELECT * FROM trades WHERE status = 'open'").fetchall():
            bar = self.market.bar(trade["symbol"], day)
            if bar is None:
                continue
            days_held = trade["days_held"] + 1
            db.execute("UPDATE trades SET days_held = ? WHERE id = ?", (days_held, trade["id"]))
            ended = check_day(bar, trade["stop_price"], trade["target_price"], first_day=(day == trade["entry_date"]),
                             days_held=days_held, hold_days=trade["hold_days"] or config.HOLD_DAYS)
            if ended:
                price, reason = ended
                self._exit(db, dict(trade, days_held=days_held), day, price, reason)

        cash = db.execute("SELECT cash FROM account").fetchone()["cash"]
        invested = sum(r["qty"] * self.market.close_on(r["symbol"], day)
                       for r in db.execute("SELECT symbol, qty FROM trades WHERE status = 'open'"))
        if started:
            db.execute("INSERT OR REPLACE INTO equity (date, value, cash) VALUES (?, ?, ?)", (day, cash + invested, cash))

    @staticmethod
    def _exit(db, trade, day, price, reason) -> None:
        proceeds = trade["qty"] * price * (1 - config.COST)
        cost = trade["qty"] * trade["entry_price"] * (1 + config.COST)
        db.execute("UPDATE account SET cash = cash + ?", (proceeds,))
        db.execute("UPDATE trades SET status = 'closed', exit_date = ?, exit_price = ?, exit_reason = ?, "
                   "net_return = ?, pnl = ?, days_held = ? WHERE id = ?",
                   (day, price, reason, proceeds / cost - 1, proceeds - cost, trade["days_held"], trade["id"]))

    # ------------------------------------------------------------------ reading the account
    def state(self) -> dict:
        as_of = self.as_of
        with self._db() as db:
            account = dict(db.execute("SELECT * FROM account").fetchone())
            trades = [dict(r) for r in db.execute("SELECT * FROM trades ORDER BY id DESC")]
            equity = [dict(r) for r in db.execute("SELECT * FROM equity ORDER BY date")]
        positions = []
        for t in trades:
            if t["status"] in ("open", "pending"):
                close = self.market.close_on(t["symbol"], as_of)
                t["name"] = self.market.name(t["symbol"])
                t["last_price"] = close
                if t["status"] == "open":
                    t["value"] = t["qty"] * close
                    t["unrealised_pnl"] = t["qty"] * (close - t["entry_price"])
                    t["unrealised_return"] = close / t["entry_price"] - 1
                    t["days_left"] = (t["hold_days"] or config.HOLD_DAYS) - t["days_held"]
                positions.append(t)
        invested = sum(p.get("value", 0) for p in positions)
        closed = [t for t in trades if t["status"] in ("closed", "cancelled")]
        done = [t for t in closed if t["status"] == "closed"]
        value = account["cash"] + invested
        return {
            "as_of": as_of, "cash": account["cash"], "invested": invested, "value": value,
            "starting_cash": account["starting_cash"], "started_on": account["started_on"],
            "pnl": value - account["starting_cash"], "return": value / account["starting_cash"] - 1,
            "cash_earned": account["swept"], "cash_sweep": config.CASH_SWEEP,
            "positions": positions, "closed": closed,
            "stats": {"closed": len(done), "wins": sum(1 for t in done if t["pnl"] > 0),
                      "realised_pnl": sum(t["pnl"] for t in done)},
            "equity": equity,
            "slot_size": value / config.SLOTS,
        }


def check_day(bar: dict, stop: float, target: float, first_day: bool, days_held: int,
              hold_days: int = config.HOLD_DAYS):
    """The same exit rules as labels.resolve, for one day's bar. Returns (price, reason) or None."""
    if not first_day and bar["open"] <= stop:
        return bar["open"], "stop"
    if not first_day and bar["open"] >= target:
        return bar["open"], "target"
    if bar["low"] <= stop:
        return stop, "stop"
    if bar["high"] >= target:
        return target, "target"
    if days_held >= hold_days:
        return bar["close"], "time"
    return None
