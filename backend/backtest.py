"""Backtest: would a small paper account have made money following each strategy in the test years?

The account starts with 100 (think Rs 10 lakh) split into 10 slots. Every evening's ideas are taken
into free slots, bought at the next open with a tenth of the account, and sold exactly as the label
says (target, stop or time limit). Costs are paid both ways. One position per stock at a time.
config.REGIME can halve or skip new positions in a falling market, and config.CASH_SWEEP lets idle cash
earn a liquid fund's rate or the NIFTY's return (counted in the account, never in any trade's return).

Only the test period is simulated (2023 onwards), which the model never saw while training.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend import config
from backend.charges import account_charges


def position_size(nifty_above_200) -> float:
    """A new position's size in slots: config.REGIME halves or skips it when the NIFTY closed under its
    200-day average on the signal day."""
    if config.REGIME is None or nifty_above_200:
        return 1.0
    return {"half": 0.5, "skip": 0.0}[config.REGIME]


def cash_returns(nifty: pd.DataFrame, days) -> pd.Series:
    """What a rupee of uninvested cash earns on each of `days` (config.CASH_SWEEP): a liquid fund's
    CASH_RATE a year spread over 252 trading days, the NIFTY's daily change, or nothing."""
    days = pd.DatetimeIndex(days)
    if config.CASH_SWEEP == "nifty":
        return nifty.set_index("date")["close"].reindex(days, method="ffill").pct_change().fillna(0.0)
    daily = (1 + config.CASH_RATE) ** (1 / 252) - 1 if config.CASH_SWEEP == "liquid" else 0.0
    return pd.Series(daily, index=days)


def simulate(ideas: pd.DataFrame, closes: pd.DataFrame, rank_by: str = None, seed: int = 7,
             cash_return: pd.Series = None) -> dict:
    """Run one strategy. `ideas` are its labelled ideas, `closes` a date x symbol table of closes. Ideas
    are ranked by `rank_by` (highest first) when a day has more ideas than free slots, otherwise in a
    fixed random order, so a rules-only strategy isn't secretly ranked by anything. Cash left after the
    day's buys earns that day's `cash_return` (see cash_returns)."""
    rng = np.random.default_rng(seed)
    ideas = ideas.assign(order=ideas[rank_by] if rank_by else rng.random(len(ideas)))
    by_entry = {day: group.sort_values("order", ascending=False) for day, group in ideas.groupby("entry_date")}
    days = closes.index[closes.index >= ideas["entry_date"].min()]

    cash, equity_before, held, taken, curve, earned, exits, fills = 100.0, 100.0, {}, [], [], 0.0, [], []
    for day in days:
        for idea in by_entry.get(day, pd.DataFrame()).itertuples():
            if len(held) >= config.SLOTS or idea.symbol in held:
                continue
            size = position_size(idea.nifty_above_200)
            if size == 0:
                continue
            spend = min(size * equity_before / config.SLOTS, cash)
            if spend <= 1e-9:
                break
            shares = spend / (idea.entry_price * (1 + config.COST))
            cash -= spend
            held[idea.symbol] = (shares, idea)
            fills.append((day, "buy", shares * idea.entry_price))
        if cash_return is not None:
            interest = cash * cash_return.get(day, 0.0)
            cash += interest
            earned += interest
        for symbol, (shares, idea) in list(held.items()):
            if idea.exit_date == day:
                cash += shares * idea.exit_price * (1 - config.COST)
                taken.append(idea.net_return)
                exits.append((day, symbol, idea.outcome, idea.net_return))
                fills.append((day, "sell", shares * idea.exit_price))
                del held[symbol]
        invested = sum(shares * closes.at[day, symbol] for symbol, (shares, _) in held.items())
        equity_before = cash + invested
        curve.append((day, equity_before, invested / equity_before))

    frame = pd.DataFrame(curve, columns=["date", "equity", "exposure"]).set_index("date")
    return {"curve": frame, "trades": np.array(taken), "cash_earned": earned, "exits": exits, "fills": fills}


def summary(curve: pd.Series, trades=None, exposure=None) -> dict:
    daily = curve.pct_change().dropna()
    years = (curve.index[-1] - curve.index[0]).days / 365.25
    out = {
        "total_return": float(curve.iloc[-1] / curve.iloc[0] - 1),
        "cagr": float((curve.iloc[-1] / curve.iloc[0]) ** (1 / years) - 1),
        "max_drawdown": float((curve / curve.cummax() - 1).min()),
        "sharpe": float(daily.mean() / daily.std() * np.sqrt(252)) if daily.std() > 0 else 0.0,
        "volatility": float(daily.std() * np.sqrt(252)),
    }
    if trades is not None:
        out.update(trades=int(len(trades)), win_rate=float((trades > 0).mean()) if len(trades) else None,
                   avg_trade=float(trades.mean()) if len(trades) else None)
    if exposure is not None:
        out["avg_exposure"] = float(exposure.mean())
    return out


def strategies(ideas: pd.DataFrame) -> dict:
    """Each strategy's ideas and the column it ranks them by (None: a fixed random order)."""
    out = {
        "Model picks": (ideas[ideas["expected_return"] >= config.MIN_EXPECTED_RETURN], "expected_return"),
        "Model ranked": (ideas, config.MODEL_RANKED),
        "All rule ideas": (ideas, None),
        "Momentum only": (ideas[ideas["is_momentum"]], None),
        "Breakout only": (ideas[ideas["is_breakout"]], None),
        "Pullback only": (ideas[ideas["is_pullback"]], None),
    }
    if not config.MODEL_RANKED:
        del out["Model ranked"]
    return out


def falls(index: pd.Series, deeper_than: float = 0.07) -> list:
    """The index's falls of more than `deeper_than` from a high, as (high day, low day, fall): each runs from
    a closing high to the lowest close before the next new high (or the end of the data)."""
    out, high_day, high = [], index.index[0], index.iloc[0]
    low_day, low = high_day, high
    for day, value in index.items():
        if value > high:
            if low / high - 1 <= -deeper_than:
                out.append((high_day, low_day, low / high - 1))
            high_day, high, low_day, low = day, value, day, value
        elif value < low:
            low_day, low = day, value
    if low / high - 1 <= -deeper_than:
        out.append((high_day, low_day, low / high - 1))
    return out


def run(test_ideas: pd.DataFrame, closes: pd.DataFrame, nifty: pd.DataFrame) -> dict:
    """Every strategy over the test period, plus the NIFTY 50 to compare with. For Model picks it also keeps
    when the account was invested and every sale, and lines each of the NIFTY's falls up against what the
    account did over the same days."""
    results, curves = [], {}
    cash_return = cash_returns(nifty, closes.index)
    for name, (ideas, rank_by) in strategies(test_ideas).items():
        out = simulate(ideas, closes, rank_by, cash_return=cash_return)
        curve = out["curve"]["equity"]
        curves[name] = curve
        results.append({"name": name, **summary(curve, out["trades"], out["curve"]["exposure"]),
                        "cash_earned": out["cash_earned"],
                        "charges": account_charges(out["fills"], config.STARTING_CASH / 100)})
        if name == "Model picks":
            picks = out

    start = min(curve.index[0] for curve in curves.values())
    full = nifty.set_index("date")["close"]
    below_200 = full < full.rolling(200).mean()
    index = full[full.index >= start]
    curves["NIFTY 50"] = 100 * index / index.iloc[0]
    results.append({"name": "NIFTY 50", **summary(curves["NIFTY 50"])})

    # The test years cut into legs at the NIFTY's falls: each fall, and the rise between one fall and the next
    # (rises shorter than two weeks are left out). Each leg says what the NIFTY and the account did.
    equity, exposure = picks["curve"]["equity"], picks["curve"]["exposure"]
    sold = pd.DataFrame(picks["exits"], columns=["date", "symbol", "outcome", "net_return"])
    legs, last = [], index.index[0]

    def leg(kind, a, b):
        window = sold[(sold["date"] > a) & (sold["date"] <= b)]
        return {"kind": kind, "from": a.strftime("%Y-%m-%d"), "to": b.strftime("%Y-%m-%d"),
                "nifty": float(index.asof(b) / index.asof(a) - 1), "picks": float(equity.asof(b) / equity.asof(a) - 1),
                "invested_start": float(exposure.asof(a)), "invested_end": float(exposure.asof(b)),
                "invested_avg": float(exposure[a:b].mean()), "sold": int(len(window)),
                "stopped": int((window["outcome"] == "stop").sum()), "under_200": float(below_200[a:b].mean())}

    for high_day, low_day, _ in falls(index):
        if len(index[last:high_day]) > 10:
            legs.append(leg("rise", last, high_day))
        legs.append(leg("fall", high_day, low_day))
        last = low_day
    if len(index[last:]) > 10:
        legs.append(leg("rise", last, index.index[-1]))

    weekly = pd.DataFrame(curves).ffill().iloc[::5]
    return {
        "capital": config.STARTING_CASH,     # curves start at 100; the pages show them on this account
        "legs": legs,
        "picks_exits": [{"date": d.strftime("%Y-%m-%d"), "symbol": s, "outcome": o, "return": round(float(r), 4)}
                        for d, s, o, r in picks["exits"]],
        "period": {"from": start.strftime("%Y-%m-%d"), "to": weekly.index[-1].strftime("%Y-%m-%d")},
        "slots": config.SLOTS, "cost": config.COST,
        "levers": {"rule_exits": config.RULE_EXITS, "model_ranked": config.MODEL_RANKED, "regime": config.REGIME,
                   "cash_sweep": config.CASH_SWEEP, "cash_rate": config.CASH_RATE},
        "results": results,
        "curves": {"dates": [d.strftime("%Y-%m-%d") for d in weekly.index],
                   "series": {name: [round(float(v), 2) for v in weekly[name]] for name in weekly.columns},
                   "picks_invested": [round(float(v), 3) for v in exposure.reindex(weekly.index).ffill().fillna(0)],
                   "nifty_under_200": [bool(v) for v in below_200.reindex(weekly.index).ffill()]},
    }


def rule_table(ideas: pd.DataFrame) -> list:
    """Trade-level results of each rule in each period, every idea counted (no account, no slots)."""
    done = ideas[ideas["outcome"].isin(["target", "stop", "time"])]
    rows = []
    for period in ("train", "valid", "test"):
        part = done[done["period"] == period]
        for rule in ("all",) + config.RULES:
            chosen = part if rule == "all" else part[part[f"is_{rule}"]]
            rows.append({"period": period, "rule": rule, "count": int(len(chosen)),
                         "win_rate": float(chosen["win"].mean()), "avg_return": float(chosen["net_return"].mean()),
                         "target": float((chosen["outcome"] == "target").mean()),
                         "stop": float((chosen["outcome"] == "stop").mean()),
                         "time": float((chosen["outcome"] == "time").mean())})
    return rows
