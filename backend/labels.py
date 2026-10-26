"""Did a trade idea win? The triple-barrier label (Lopez de Prado, 2018, ch. 3).

A trade enters at the next day's open. It wins if the price reaches the target before the stop, within
its time limit (20 trading days unless config.RULE_EXITS sets each rule's own exits). A trade with no
target wins if it ends with a profit after costs. Three rules keep the label honest on daily bars:

- Nobody can trade at a close they have only just seen, so entry is the next open.
- If one day's range touches both the stop and the target, we can't tell which came first from a daily
  bar, so it counts as a stop (the pessimistic choice).
- If the price gaps through a barrier overnight, the trade exits at that day's open, not at the barrier.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend import config


def resolve(o, h, l, c, entry_at: int, target: float, stop: float, entry_price: float = None,
            hold_days: int = config.HOLD_DAYS):
    """Walk forward through numpy arrays of open/high/low/close from index `entry_at` until the trade
    ends. `target` and `stop` are fractions of the entry price (0.08 = 8%).

    Returns (exit_index, exit_price, outcome) where outcome is 'target', 'stop', 'time', or 'open' when
    the data ran out before the trade finished."""
    entry = o[entry_at] if entry_price is None else entry_price
    up, down = entry * (1 + target), entry * (1 - stop)
    last = min(entry_at + hold_days - 1, len(o) - 1)
    for day in range(entry_at, last + 1):
        if day > entry_at and o[day] <= down:
            return day, o[day], "stop"                  # gapped down through the stop
        if day > entry_at and o[day] >= up:
            return day, o[day], "target"                # gapped up through the target
        if l[day] <= down:                              # checked first: a day touching both is a stop
            return day, down, "stop"
        if h[day] >= up:
            return day, up, "target"
    finished = last == entry_at + hold_days - 1
    return last, c[last], "time" if finished else "open"


def net_return(entry: float, exit: float) -> float:
    """The return after paying costs on the way in and on the way out."""
    return exit * (1 - config.COST) / (entry * (1 + config.COST)) - 1


def label_ideas(ideas: pd.DataFrame, prices: dict) -> pd.DataFrame:
    """Add the outcome of every idea (signal after the close of `date`, entry at the next open)."""
    columns = ["entry_date", "entry_price", "exit_date", "exit_price", "outcome", "win", "net_return", "days_held"]
    rows = {}
    for symbol, group in ideas.groupby("symbol"):
        bars = prices[symbol]
        dates = bars["date"].to_numpy()
        o, h, l, c = (bars[k].to_numpy(dtype=float) for k in ("open", "high", "low", "close"))
        entry_ats = np.searchsorted(dates, group["date"].to_numpy(), side="right")
        for idx, entry_at, target, stop, hold in zip(group.index, entry_ats, group["target"], group["stop"],
                                                     group["hold_days"]):
            if entry_at >= len(o):
                rows[idx] = [pd.NaT, np.nan, pd.NaT, np.nan, "pending", False, np.nan, 0]
                continue
            exit_at, price, outcome = resolve(o, h, l, c, int(entry_at), target, stop, hold_days=int(hold))
            ret = net_return(o[entry_at], price)
            won = outcome == "target" if np.isfinite(target) else ret > 0
            rows[idx] = [dates[entry_at], o[entry_at], dates[exit_at], price, outcome, won, ret,
                         int(exit_at - entry_at + 1)]
    labels = pd.DataFrame.from_dict(rows, orient="index", columns=columns)
    return ideas.join(labels)


def expected_return(p_win, target, stop, loss_in_stops, gain_in_stops=np.nan):
    """Expected net return of a trade: with chance p it wins, reaching its target or, with no target,
    gaining what an average winner gained in the training years (`gain_in_stops` times its stop);
    otherwise it ends the way an average non-winning trade ended in the training years, which is
    `loss_in_stops` times its stop (some hit the full stop, others end on time with a smaller loss or
    even a gain)."""
    hit = (1 + target) * (1 - config.COST) / (1 + config.COST) - 1
    win = np.where(np.isfinite(target), hit, gain_in_stops * stop - 2 * config.COST)
    return p_win * win + (1 - p_win) * (-loss_in_stops * stop - 2 * config.COST)
