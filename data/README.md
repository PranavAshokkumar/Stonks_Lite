# The dataset

- `stocks.csv`: the 50 stocks (symbol, company name, sector, ISIN).
- `prices/<SYMBOL>.csv`: daily bars per stock (`date, open, high, low, close, volume`), Jan 2005 to
  16 Oct 2026 where the stock was listed (HDFCLIFE and SBILIFE from their 2017 listings; NESTLEIND's
  stored history starts in Aug 2023).
- `nifty50.csv`: the NIFTY 50 index, daily (`date, open, high, low, close`).

Prices are adjusted for splits and bonus issues (not dividends), so a 1:2 split never appears as a 50%
crash. They were exported from the original TARGET20 app's Upstox store, with duplicate dates removed.
Large one-day moves that remain are real events: the March 2020 crash, the January 2023 Adani sell-off,
the June 2024 election result.

`python -m backend.update_data` extends these files from Yahoo Finance (needs `yfinance` and internet).
