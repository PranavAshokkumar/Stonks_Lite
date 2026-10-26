"""Loading the CSV dataset: 50 large NSE stocks and the NIFTY 50 index, daily bars.

The prices are split- and bonus-adjusted (exported from the original app's Upstox store), so a 1:2
split never shows up as a fake 50% crash.
"""

from __future__ import annotations

from typing import Dict

import pandas as pd

from backend import config


def load_universe() -> pd.DataFrame:
    """symbol, name, sector, isin for every stock in the dataset."""
    return pd.read_csv(config.DATA_DIR / "stocks.csv")


def load_prices() -> Dict[str, pd.DataFrame]:
    """Each stock's daily bars (date, open, high, low, close, volume), oldest first."""
    prices = {}
    for symbol in load_universe()["symbol"]:
        path = config.PRICES_DIR / f"{symbol}.csv"
        if not path.exists():
            continue
        frame = pd.read_csv(path, parse_dates=["date"])
        frame = frame.dropna(subset=["open", "high", "low", "close"]).drop_duplicates("date")
        prices[symbol] = frame.sort_values("date").reset_index(drop=True)
    return prices


def load_index() -> pd.DataFrame:
    """NIFTY 50 daily bars (date, open, high, low, close), oldest first."""
    frame = pd.read_csv(config.DATA_DIR / "nifty50.csv", parse_dates=["date"])
    return frame.drop_duplicates("date").sort_values("date").reset_index(drop=True)
