"""Everything the web app asks about, loaded once at startup: prices, indicators, scores, rule ideas and
the trained model's view of each idea.

Every question is asked "as of" a date, and only data up to that date is used, so the app can replay
any day in history without peeking at what came next.
"""

from __future__ import annotations

import json
import math

import joblib
import numpy as np
import pandas as pd

from backend import backtest, config, data, pipeline, rules, score


def _clean(value):
    """A value JSON can hold: NaN and infinity become null, numpy numbers become Python numbers."""
    if isinstance(value, (np.floating, float)):
        return None if not math.isfinite(value) else round(float(value), 6)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    return value


def clean(obj):
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    return _clean(obj)


class Market:
    def __init__(self):
        artifacts = config.ARTIFACTS_DIR
        if not (artifacts / "model.joblib").exists():
            raise SystemExit("No trained model found. Run `python -m backend.pipeline` first.")
        try:
            self.model = joblib.load(artifacts / "model.joblib")
        except Exception as error:          # usually a different scikit-learn version from the one that saved it
            raise SystemExit(f"Couldn't load the saved model ({error}). Retrain it with `python -m backend.pipeline`.")
        self.metrics = json.loads((artifacts / "metrics.json").read_text())
        self.backtest = json.loads((artifacts / "backtest.json").read_text())
        # For the Backtest page's before-and-after: the original settings' test-year run, and every lever
        # setting tried on 2006-2021 (backend/tune.py).
        if (artifacts / "backtest_before.json").exists():
            self.backtest["before"] = json.loads((artifacts / "backtest_before.json").read_text())
        if (artifacts / "trials.csv").exists():
            self.backtest["trials"] = clean(pd.read_csv(artifacts / "trials.csv", dtype={"stage": str}).to_dict("records"))

        self.prices, self.index, panel, ideas = pipeline.build_history()
        self.universe = data.load_universe().set_index("symbol")
        ideas["p_win"] = self.model.p_win(ideas)
        ideas["expected_return"] = self.model.expected_return(ideas)
        self.ideas = ideas
        self.panel = panel.set_index("date").sort_index()
        self.days = [d.strftime("%Y-%m-%d") for d in self.panel.index.unique()]
        self.day_number = {d: i for i, d in enumerate(self.days)}
        self.first, self.latest = self.days[0 + config.WARM_UP_DAYS], self.days[-1]
        self.bars = {s: b.assign(day=b["date"].dt.strftime("%Y-%m-%d")).set_index("day") for s, b in self.prices.items()}
        self.nifty = self.index.assign(day=self.index["date"].dt.strftime("%Y-%m-%d")).set_index("day")
        self.cash_return = dict(zip(self.days, backtest.cash_returns(self.index, pd.to_datetime(self.days))))

    # ------------------------------------------------------------------ the calendar
    def snap(self, day: str) -> str:
        """The last trading day on or before `day`, inside the range the app can show."""
        i = int(np.searchsorted(self.days, str(day)[:10], side="right")) - 1
        return self.days[max(i, self.day_number.get(self.first, 0))]

    def shift(self, day: str, n: int) -> str:
        i = self.day_number[self.snap(day)]
        return self.days[min(max(i + n, self.day_number[self.first]), len(self.days) - 1)]

    def trading_days_between(self, start: str, end: str):
        """Trading days after `start`, up to and including `end`."""
        return [d for d in self.days if start < d <= end]

    # ------------------------------------------------------------------ prices
    def bar(self, symbol: str, day: str):
        bars = self.bars[symbol]
        return bars.loc[day].to_dict() if day in bars.index else None

    def close_on(self, symbol: str, day: str) -> float:
        bars = self.bars[symbol]
        known = bars.loc[:day]
        return float(known["close"].iloc[-1]) if len(known) else float("nan")

    def name(self, symbol: str) -> str:
        return self.universe.at[symbol, "name"] if symbol in self.universe.index else symbol

    def rows_on(self, day: str) -> pd.DataFrame:
        rows = self.panel.loc[pd.Timestamp(day)]
        return rows if isinstance(rows, pd.DataFrame) else rows.to_frame().T

    # ------------------------------------------------------------------ the pages
    def period_of(self, day: str):
        """Which part of the model's history a date falls in: the model learnt from 'train' and was
        calibrated on 'valid'; only 'test' and later are an honest out-of-sample replay."""
        return "train" if day <= config.TRAIN_END else "valid" if day <= config.VALID_END else "test"

    def status(self, as_of: str) -> dict:
        rows = self.rows_on(as_of)
        nifty = self.nifty.loc[:as_of]
        close, previous = float(nifty["close"].iloc[-1]), float(nifty["close"].iloc[-2])
        sma200 = float(nifty["close"].iloc[-200:].mean())
        ideas = self.ideas_on(as_of)
        return clean({
            "as_of": as_of, "first": self.first, "latest": self.latest, "period": self.period_of(as_of),
            "nifty": {"close": close, "change": close / previous - 1, "sma200": sma200, "above_sma200": close >= sma200},
            "breadth": float(rows["above_sma200"].mean()),
            "ideas": len(ideas), "picks": sum(1 for i in ideas if i["pick"]),
            "bullish": int((rows["band"] == "bullish").sum()), "bearish": int((rows["band"] == "bearish").sum()),
            "model": {"name": self.metrics["chosen"], "test_auc": self.metrics["test"]["roc_auc"],
                      "trained_at": self.metrics.get("trained_at"), "train_end": config.TRAIN_END,
                      "valid_end": config.VALID_END},
            "settings": {"min_expected_return": config.MIN_EXPECTED_RETURN, "hold_days": config.HOLD_DAYS,
                         "slots": config.SLOTS, "cost": config.COST},
        })

    def ideas_on(self, as_of: str, slot_size: float = None) -> list:
        """The evening's rule ideas, best expected return first. No outcome is included: on the evening
        of `as_of`, nobody knows yet how they end."""
        today = self.ideas[self.ideas["date"] == pd.Timestamp(as_of)].sort_values("expected_return", ascending=False)
        out = []
        for row in today.itertuples():
            r = row._asdict()
            close = r["close"]
            out.append({
                "symbol": r["symbol"], "name": self.name(r["symbol"]), "sector": self.universe.at[r["symbol"], "sector"],
                "rules": list(r["rules"]), "rule": r["rule"], "reason": rules.reason(pd.Series(r)),
                "close": close, "target_pct": r["target"], "stop_pct": r["stop"], "hold_days": r["hold_days"],
                "target_price": close * (1 + r["target"]), "stop_price": close * (1 - r["stop"]),
                "p_win": r["p_win"], "expected_return": r["expected_return"],
                "pick": bool(r["expected_return"] >= config.MIN_EXPECTED_RETURN),
                "score": r["score"], "band": r["band"], "rsi_14": r["rsi_14"], "atr_pct": r["atr_pct"],
                "relative_volume": r["relative_volume"],
                "suggested_qty": int(slot_size * backtest.position_size(r["nifty_above_200"]) // close)
                                 if slot_size and close > 0 else None,
            })
        return clean(out)

    def stocks_on(self, as_of: str) -> list:
        rows = self.rows_on(as_of).reset_index()
        previous = self.rows_on(self.shift(as_of, -1)).set_index("symbol")["close"]
        flagged = {i["symbol"]: i["rules"] for i in self.ideas_on(as_of)}
        out = []
        for r in rows.to_dict("records"):
            symbol = r["symbol"]
            out.append({
                "symbol": symbol, "name": self.name(symbol), "sector": self.universe.at[symbol, "sector"],
                "close": r["close"], "change": r["close"] / previous.get(symbol, np.nan) - 1,
                "ret_21": np.expm1(r["ret_21"]), "ret_252": np.expm1(r["ret_252"]),
                "rsi_14": r["rsi_14"], "dist_sma200": r["dist_sma200"], "atr_pct": r["atr_pct"],
                "score": r["score"], "band": r["band"],
                "parts": {name: r[f"part_{name}"] for name in score.PART_NAMES},
                "rules": flagged.get(symbol, []),
            })
        return clean(sorted(out, key=lambda s: -(s["score"] if s["score"] == s["score"] else -1)))

    def stock_detail(self, symbol: str, as_of: str, days: int = 365) -> dict:
        if symbol not in self.bars:
            raise KeyError(symbol)
        history = self.panel[self.panel["symbol"] == symbol].loc[:pd.Timestamp(as_of)].reset_index()
        shown = history.tail(days)
        latest = shown.iloc[-1]
        start = shown["date"].iloc[0]
        events = [e for e in score.trend_events(history) if e["date"] >= start.strftime("%Y-%m-%d")]

        mine = self.ideas[(self.ideas["symbol"] == symbol) & (self.ideas["date"] <= pd.Timestamp(as_of))]
        # Ideas on consecutive days are mostly the same idea repeated; show the first day of each run.
        new_run = mine["date"].map(lambda d: self.day_number[d.strftime("%Y-%m-%d")]).diff().fillna(99) > 1
        runs = mine[new_run | (mine["rule"] != mine["rule"].shift())].tail(12).iloc[::-1]
        past = []
        for r in runs.itertuples():
            known = pd.notna(r.exit_date) and r.exit_date <= pd.Timestamp(as_of)
            past.append({"date": r.date, "rule": r.rule, "p_win": r.p_win, "expected_return": r.expected_return,
                         "outcome": r.outcome if known else "running", "net_return": r.net_return if known else None,
                         "exit_date": r.exit_date if known else None, "period": self.period_of(r.date.strftime("%Y-%m-%d"))})
        done = mine[mine["exit_date"] <= pd.Timestamp(as_of)]
        return clean({
            "symbol": symbol, "name": self.name(symbol), "sector": self.universe.at[symbol, "sector"], "as_of": as_of,
            "latest": {
                "close": latest["close"], "score": latest["score"], "band": latest["band"],
                "parts": {name: latest[f"part_{name}"] for name in score.PART_NAMES},
                "rsi_14": latest["rsi_14"], "atr_pct": latest["atr_pct"], "dist_sma200": latest["dist_sma200"],
                "dist_52w_high": latest["dist_52w_high"], "ret_21": np.expm1(latest["ret_21"]),
                "ret_252": np.expm1(latest["ret_252"]), "relative_volume": latest["relative_volume"],
                "sma50": latest["sma50"], "sma200": latest["sma200"],
            },
            "series": [{"date": r["date"], "open": r["open"], "high": r["high"], "low": r["low"], "close": r["close"],
                        "volume": r["volume"], "sma50": r["sma50"], "sma200": r["sma200"], "rsi_14": r["rsi_14"],
                        "score": r["score"], "idea": bool(r["is_momentum"] or r["is_breakout"] or r["is_pullback"])}
                       for r in shown.to_dict("records")],
            "events": events,
            "idea_today": next((i for i in self.ideas_on(as_of) if i["symbol"] == symbol), None),
            "past_ideas": past,
            "track_record": {"ideas": int(len(done)), "win_rate": float(done["win"].mean()) if len(done) else None,
                             "avg_return": float(done["net_return"].mean()) if len(done) else None},
            "default_barriers": {"target_pct": config.TARGET_ATR * latest["atr_pct"],
                                 "stop_pct": min(config.STOP_ATR * latest["atr_pct"], 0.9)},
        })
