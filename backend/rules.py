"""The three swing-trade rules that propose ideas, and the plain-English reason for each idea.

The rules only *propose*. Whether an idea is worth taking is the model's job (model.py). This split,
rules propose and a model judges, is called meta-labeling (Lopez de Prado, 2018).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend import config

FLAGS = {"momentum": "is_momentum", "breakout": "is_breakout", "pullback": "is_pullback"}


def exits(rule: str) -> tuple:
    """(target in ATRs or None, stop in ATRs, max trading days) for ideas whose exits follow `rule`."""
    return config.RULE_EXITS[rule] if config.RULE_EXITS else (config.TARGET_ATR, config.STOP_ATR, config.HOLD_DAYS)


def find_ideas(day_rows: pd.DataFrame) -> pd.DataFrame:
    """The rows of the panel that at least one rule proposes, with each idea's target and stop (as
    fractions of the entry price; no target is infinity), time limit, and the list of rules that fired."""
    fired = day_rows[list(FLAGS.values())].fillna(False).astype(bool)
    ideas = day_rows[fired.any(axis=1) & day_rows["usable"] & (day_rows["atr_pct"] > 0)].copy()
    ideas["rules"] = [[rule for rule, flag in FLAGS.items() if row[flag]] for _, row in ideas.iterrows()]
    ideas["rule"] = ideas["rules"].map(lambda rules: " + ".join(rules))
    ideas["exit_rule"] = ideas["rules"].map(lambda rules: rules[0]) if config.RULE_EXITS else "all"
    plan = pd.DataFrame(ideas["exit_rule"].map(exits).tolist(), index=ideas.index, columns=["t", "s", "h"])
    ideas["target"] = plan["t"].astype(float).fillna(np.inf) * ideas["atr_pct"]
    ideas["stop"] = (plan["s"] * ideas["atr_pct"]).clip(upper=0.9)
    ideas["hold_days"] = plan["h"].astype(int)
    return ideas


def scan_dates(panel: pd.DataFrame) -> pd.DatetimeIndex:
    """The days the rules are run on history: every 5th trading day after a year of warm-up."""
    days = pd.DatetimeIndex(sorted(panel["date"].unique()))
    return days[config.WARM_UP_DAYS::config.SCAN_EVERY]


def reason(row: pd.Series) -> str:
    """Why the rule(s) proposed this stock, in words a non-trader can follow."""
    parts = []
    if row.get("is_momentum"):
        parts.append(f"One of the strongest stocks over the past year: up {np.expm1(row['momentum_12_1']):.0%}, "
                     f"#{int(row['momentum_place'])} of {int(row['stocks_that_day'])} by 12-month return")
    if row.get("is_breakout"):
        parts.append(f"Closed at a {config.BREAKOUT_DAYS}-day high on {row['relative_volume']:.1f}x its usual volume")
    if row.get("is_pullback"):
        parts.append(f"Short dip in an uptrend: 2-day RSI is {row['rsi_2']:.0f} while the price is "
                     f"{row['dist_sma200']:.0%} above its 200-day average")
    return ". ".join(parts) + "."
