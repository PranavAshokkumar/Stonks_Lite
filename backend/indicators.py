"""Feature engineering: technical indicators for every stock on every day.

Every value on a row uses that day's close and earlier days only (no look-ahead), so a row is exactly
what a trader could have known after that day's close.
"""

from __future__ import annotations

from typing import Dict

import numpy as np
import pandas as pd

from backend import config


def rsi(close: pd.Series, days: int) -> pd.Series:
    """Wilder's Relative Strength Index, 0-100."""
    change = close.diff()
    gain = change.clip(lower=0).ewm(alpha=1 / days, adjust=False, min_periods=days).mean()
    loss = (-change.clip(upper=0)).ewm(alpha=1 / days, adjust=False, min_periods=days).mean()
    value = 100 - 100 / (1 + gain / loss)
    return value.where(loss > 0, 100.0).where(gain.notna())


def atr(high: pd.Series, low: pd.Series, close: pd.Series, days: int = 14) -> pd.Series:
    """Wilder's Average True Range, in rupees."""
    previous = close.shift(1)
    true_range = pd.concat([high - low, (high - previous).abs(), (low - previous).abs()], axis=1).max(axis=1)
    return true_range.ewm(alpha=1 / days, adjust=False, min_periods=days).mean()


def stock_indicators(bars: pd.DataFrame) -> pd.DataFrame:
    """One stock's indicators, one row per trading day."""
    close, high, low, volume = (bars[c].astype(float) for c in ("close", "high", "low", "volume"))
    log_close = np.log(close)
    out = pd.DataFrame({"date": bars["date"], "open": bars["open"], "high": high, "low": low,
                        "close": close, "volume": volume})

    for days in (5, 21, 63, 126, 252):                      # past returns (log)
        out[f"ret_{days}"] = log_close - log_close.shift(days)
    out["momentum_12_1"] = log_close.shift(21) - log_close.shift(252)   # 12-month return, skipping the last month

    for days in (20, 50, 200):                              # distance from moving averages
        sma = close.rolling(days).mean()
        out[f"sma{days}"] = sma
        out[f"dist_sma{days}"] = close / sma - 1
    out["dist_52w_high"] = close / close.rolling(252, min_periods=200).max() - 1

    out["rsi_14"] = rsi(close, 14)
    out["rsi_2"] = rsi(close, 2)
    out["atr_pct"] = atr(high, low, close, 14) / close     # daily volatility as a share of price

    earlier_volume = volume.shift(1).rolling(20).mean()
    out["relative_volume"] = volume / earlier_volume
    out["volume_z"] = (volume - volume.rolling(63).mean()) / volume.rolling(63).std()
    out["volume_20_126"] = volume.rolling(20).mean() / volume.rolling(126).mean()

    out["above_sma200"] = close > out["sma200"]
    out["is_breakout"] = (close >= close.rolling(config.BREAKOUT_DAYS).max()) & (volume >= config.BREAKOUT_VOLUME * earlier_volume)
    out["is_pullback"] = (out["rsi_2"] < config.PULLBACK_RSI2) & out["above_sma200"]
    out["usable"] = (volume > 0) & out["sma200"].notna() & out["atr_pct"].notna() & out["momentum_12_1"].notna()
    return out


def market_indicators(index: pd.DataFrame) -> pd.DataFrame:
    """The NIFTY 50's regime: is it above its 200-day average, and its recent returns."""
    close = index["close"].astype(float)
    log_close = np.log(close)
    return pd.DataFrame({
        "date": index["date"],
        "nifty_close": close,
        "nifty_sma200": close.rolling(200).mean(),
        "nifty_above_200": close >= close.rolling(200).mean(),
        "nifty_ret_21": log_close - log_close.shift(21),
        "nifty_ret_126": log_close - log_close.shift(126),
    })


def build_panel(prices: Dict[str, pd.DataFrame], index: pd.DataFrame) -> pd.DataFrame:
    """Every stock on every day in one table, with the cross-sectional features that compare a stock
    with the other stocks on the same day, and the market's regime."""
    frames = [stock_indicators(bars).assign(symbol=symbol) for symbol, bars in prices.items() if len(bars)]
    panel = pd.concat(frames, ignore_index=True)
    panel = panel.merge(market_indicators(index), on="date", how="left")

    usable = panel[panel["usable"]]
    by_day = usable.groupby("date")
    panel.loc[usable.index, "momentum_rank"] = by_day["momentum_12_1"].rank(pct=True)
    panel.loc[usable.index, "ret_126_rank"] = by_day["ret_126"].rank(pct=True)
    panel.loc[usable.index, "momentum_place"] = by_day["momentum_12_1"].rank(ascending=False, method="min")
    panel["stocks_that_day"] = panel["date"].map(by_day.size())
    panel["breadth"] = panel["date"].map(by_day["above_sma200"].mean())          # share of stocks above their 200-DMA
    panel["universe_ret_21"] = panel["date"].map(by_day["ret_21"].median())      # how the typical stock did this month
    panel["is_momentum"] = panel["usable"] & (panel["momentum_rank"] > 1 - config.MOMENTUM_TOP)
    panel["is_breakout"] = panel["usable"] & panel["is_breakout"]
    panel["is_pullback"] = panel["usable"] & panel["is_pullback"]
    return panel.sort_values(["date", "symbol"]).reset_index(drop=True)
