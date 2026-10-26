"""Optional: bring the price files up to date from Yahoo Finance (needs internet and `pip install yfinance`).

    python -m backend.update_data

For each stock it downloads the days after the last one in its CSV, plus the last 10 days again as an
overlap check. If Yahoo's prices for those overlap days differ from ours by more than 2%, the company
has had a split or bonus since our file was made, and Yahoo has re-adjusted its whole history. Joining
the two would plant a fake crash in the data, so that stock's whole file is replaced by Yahoo's history
instead. Restart the server afterwards; retraining (`python -m backend.pipeline`) is optional.
"""

from __future__ import annotations

import sys

import pandas as pd

from backend import config, data

OVERLAP_DAYS = 10
TOLERANCE = 0.02
COLUMNS = ["date", "open", "high", "low", "close", "volume"]


def _download(ticker: str, start) -> pd.DataFrame:
    import yfinance as yf

    frame = yf.download(ticker, start=pd.Timestamp(start).strftime("%Y-%m-%d"), auto_adjust=False,
                        progress=False, actions=False)
    if frame is None or frame.empty:
        return pd.DataFrame(columns=COLUMNS)
    if isinstance(frame.columns, pd.MultiIndex):           # newer yfinance: (field, ticker) columns
        frame.columns = frame.columns.get_level_values(0)
    frame = frame.rename(columns=str.lower).reset_index().rename(columns={"Date": "date", "index": "date"})
    frame["date"] = pd.to_datetime(frame["date"]).dt.tz_localize(None).dt.normalize()
    if "volume" not in frame:
        frame["volume"] = 0
    frame = frame[COLUMNS].dropna(subset=["open", "high", "low", "close"])
    return frame[(frame[["open", "high", "low", "close"]] > 0).all(axis=1)]


def _merge(path, ticker: str) -> str:
    old = pd.read_csv(path, parse_dates=["date"])
    overlap_from = old["date"].iloc[-OVERLAP_DAYS] if len(old) > OVERLAP_DAYS else old["date"].iloc[0]
    new = _download(ticker, overlap_from)
    if new.empty:
        return "no new data"
    both = old.merge(new, on="date", suffixes=("_old", "_new"))
    if len(both) and ((both["close_new"] / both["close_old"] - 1).abs() > TOLERANCE).any():
        full = _download(ticker, old["date"].iloc[0])
        _write(full, path)
        return f"re-adjusted by Yahoo (split or bonus?): whole history replaced, {len(full)} days"
    added = new[new["date"] > old["date"].max()]
    _write(pd.concat([old, added], ignore_index=True), path)
    return f"+{len(added)} days"


def _write(frame: pd.DataFrame, path) -> None:
    out = frame.sort_values("date").drop_duplicates("date").copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    for column in ("open", "high", "low", "close"):
        out[column] = out[column].astype(float).round(2)
    out["volume"] = out["volume"].fillna(0).astype("int64")
    out[COLUMNS].to_csv(path, index=False)


def main() -> None:
    try:
        import yfinance  # noqa: F401
    except ImportError:
        sys.exit("This needs yfinance: pip install yfinance")
    for symbol in data.load_universe()["symbol"]:
        try:
            print(f"{symbol:12s} {_merge(config.PRICES_DIR / f'{symbol}.csv', symbol + '.NS')}", flush=True)
        except Exception as error:                          # one stock failing shouldn't stop the rest
            print(f"{symbol:12s} failed: {error}", flush=True)
    print(f"{'NIFTY 50':12s} {_merge(config.DATA_DIR / 'nifty50.csv', '^NSEI')}")
    print("Done. Restart the server to see the new days.")


if __name__ == "__main__":
    main()
