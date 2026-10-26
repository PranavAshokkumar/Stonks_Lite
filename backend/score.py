"""The 0-10 trend score: a transparent, hand-weighted summary of a stock's technical health.

No model and no training: five parts, each scaled 0 to 1, then a weighted sum times 10. The weights
are judgement, written down before looking at any result (config.SCORE_WEIGHTS).

- trend               close vs its 200-day average: 10% below is 0, on it 0.5, 10% above 1
- momentum            12-month return (skipping the last month), as a rank among the 50 stocks
- relative_strength   half its 6-month return rank, half its 6-month return vs the NIFTY 50
- quality             nearness to its 52-week high: 25% below is 0, at the high 1
- participation       last 20 days' volume vs the last 126 days': twice as much is 1
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend import config

PART_NAMES = list(config.SCORE_WEIGHTS)


def score_parts(panel: pd.DataFrame) -> pd.DataFrame:
    unit = lambda values: values.clip(0.0, 1.0)
    parts = pd.DataFrame(index=panel.index)
    parts["trend"] = unit(0.5 + panel["dist_sma200"] / 0.20)
    parts["momentum"] = panel["momentum_rank"]
    parts["relative_strength"] = 0.5 * panel["ret_126_rank"] + 0.5 * unit(0.5 + (panel["ret_126"] - panel["nifty_ret_126"]) / 0.40)
    parts["quality"] = unit(1.0 + panel["dist_52w_high"] / 0.25)
    parts["participation"] = unit(panel["volume_20_126"] / 2.0)
    return parts


def add_scores(panel: pd.DataFrame) -> pd.DataFrame:
    """Add each part, the 0-10 `score` and its `band` to the panel."""
    parts = score_parts(panel)
    total = sum(weight * parts[name] for name, weight in config.SCORE_WEIGHTS.items())
    panel = panel.copy()
    for name in PART_NAMES:
        panel[f"part_{name}"] = parts[name]
    panel["score"] = (10 * total).round(1)
    panel["band"] = panel["score"].map(band)
    return panel


def band(score: float):
    if score is None or not np.isfinite(score):
        return None
    return "bearish" if score < config.BEARISH_BELOW else "bullish" if score >= config.BULLISH_FROM else "neutral"


def trend_events(history: pd.DataFrame) -> list:
    """Trend Starts and Trend Ends for one stock (rows with date and score, oldest first). A trend
    starts the first day the score reaches 7 and ends the first day after that it falls under 5; a
    score between 5 and 7 changes nothing, so the stock doesn't flip in and out every other day."""
    events, in_trend = [], False
    for row in history[["date", "score"]].dropna().itertuples():
        if not in_trend and row.score >= config.TREND_START:
            in_trend = True
            events.append({"date": row.date.strftime("%Y-%m-%d"), "event": "start", "score": float(row.score)})
        elif in_trend and row.score < config.TREND_END:
            in_trend = False
            events.append({"date": row.date.strftime("%Y-%m-%d"), "event": "end", "score": float(row.score)})
    return events
