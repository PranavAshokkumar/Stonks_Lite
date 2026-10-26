# Stonks Lite: a machine-learning swing-trade scout for NSE stocks

Every evening, Stonks Lite scans 50 large NSE stocks for three classic swing-trading setups
(momentum, breakout and pullback). A machine-learning model estimates each idea's chance of winning
(reaching its target before its stop or, for a rule with no target, ending in profit). You can test any
idea with a paper (pretend-money) account. A "replay clock" lets you go back to any evening since 2006
and watch your paper trades play out day by day.

**Headline result.** Over the test years (3 Jan 2023 to 13 Oct 2026), the *Model picks* paper account made
**+52.4% (+11.8% a year)**, against **+26.9% (+6.5% a year)** for buying and holding the NIFTY 50. Its Sharpe
ratio is also higher (0.85 against 0.57), but its worst fall is deeper (−20.1% against −15.8%). Every setting
was chosen on 2006–2021 only. The test years had been looked at before, though, so treat this as optimistic
([details](#results-test-years-20232026)).

It is a smaller, web-based version of **TARGET20 / Stonks**, a macOS (SwiftUI) app with a large Python
backend. The core idea is kept (rules propose trades, a calibrated model judges them, everything is
tested honestly on paper); the rest is removed (see [What changed from TARGET20](#what-changed-from-target20)).

**Stack:** Python (pandas, scikit-learn, Flask, SQLite) for the data, the model and the REST API, and
React (Vite) for the web frontend. The charts are hand-written SVG, with no chart library.

---

## Run it

You need Python 3.10+ and, for the frontend, Node.js 20+.

```bash
cd stonks-lite

# 1. Python packages
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. (Optional) retrain the model. A trained model is already in artifacts/; this takes about a minute
python -m backend.pipeline

# 3. Start the API server (http://127.0.0.1:5050)
python -m backend.app
```

Then, in a second terminal, the React app:

```bash
cd stonks-lite/frontend
npm install
npm run dev                          # open http://localhost:5173
```

`npm run dev` sends every `/api` request to the Flask server, so both must be running.

**Without Node.js:** `frontend/dist/` holds a pre-built copy of the web page, which the Flask server
serves itself. Start the server and open http://127.0.0.1:5050. Run `npm run build` after changing
the React code to rebuild it.

**Tests:** `python -m unittest discover tests -v` (or `pytest`). There are 22 tests. They check the
indicators, the trade labels and the rules, show that the paper broker and the labels agree on 300
random price paths (and, with per-rule exits on, that the real paper broker closes every trade where its
label says), and call every API endpoint.

**Re-choosing the profit levers (optional):** `python -m backend.tune` re-runs the walk-forward
evaluation on 2006–2021 that chose them and rewrites `artifacts/trials.csv` (see [Profit levers](#profit-levers)).

**Newer prices (optional, needs internet):** `pip install yfinance`, then `python -m backend.update_data`,
then restart the server. Retraining is optional. This updater was written without internet access, so
it has not been run against Yahoo yet; check its output the first time.

---

## The pages

| Page | What it shows |
|---|---|
| **Home** (`#/`) | The landing page: what Stonks Lite is for, its live research record, the Stonks apps for Mac and Android, and Lite (free) against Pro (₹1,000 a month) pricing. Its images are in `frontend/public/landing/`; the Pro sign-up link is `PRO_SIGNUP_URL` in `src/pages/Landing.jsx`. |
| **Ideas** | The evening's rule ideas as trade tickets: why the rule fired, the stop/now/target price ladder, the model's chance, the expected return, and a box to buy on paper. Model picks are marked with a yellow star. |
| **Stocks** | All 50 stocks with price changes, RSI and the 0–10 trend score; sort, search, filter by sector. |
| **Stock detail** | Price with 50/200-day averages and Trend Start/End markers, trend score and RSI over time, what makes up the score, and the stock's past ideas with their outcomes. |
| **Paper account** | Cash, holdings, orders waiting for the next open, closed trades and the account's value over time. |
| **Model** | The ML pipeline step by step, the model comparison, win rate by confidence group, the calibration chart, the ROC curve and feature importance. |
| **Backtest** | Each strategy's paper account over the test years, against the NIFTY 50. It leads with what ₹10 lakh (the paper account's starting cash) in the model's picks became against the NIFTY, after charges, and a chart that shades each of the NIFTY's falls of 7% or more, with how much of the account was invested and where positions were sold at their stop underneath. A card per rise and fall shows where the lead came from (`legs`, `picks_exits` and `curves.picks_invested` in `backtest.json`, from `backtest.run`). The brokerage and taxes card itemises what the account paid at NSE's delivery rates on each trade's date (STT, NSE transaction charge, SEBI fee, stamp duty, GST, brokerage; `charges` per strategy, from `backend/charges.py`) against the flat 0.15% each way the backtest charges; the difference is shown as a slippage allowance. |
| **How it works** | A plain-language explanation and a glossary. |

The **clock bar** under the menu sets the evening the whole app looks at. Moving it forward replays
the days in between (orders fill at the next open, and trades hit their target, their stop or their time limit).
Moving it back resets the paper account. No page ever shows data from after the clock's date.

---

## How it works

```
data/*.csv ─► indicators ─► 3 rules ─► triple-barrier labels ─► model (P(win)) ─► expected return
 (prices)     (features)    (ideas)    (did it win?)            + calibration       │
                  │                                                                 ├─► Ideas page, paper trading
                  └─► 0–10 trend score (no training)                                └─► backtest
```

1. **Data.** Daily open/high/low/close/volume for 50 large NSE companies and the NIFTY 50 index,
   January 2005 to 16 October 2026 (`data/`). The prices are split- and bonus-adjusted and were
   exported from the original app's store.
2. **Features** (`backend/indicators.py`): returns over 1 week to 1 year, 12-month momentum,
   distance from the 20/50/200-day averages and the 52-week high, RSI(14), RSI(2), ATR, volume measures,
   market breadth and the NIFTY's trend. Each row uses that day and earlier only (there is a test for this).
3. **Rules** (`backend/rules.py`):
   - *Momentum*: in the top 10% of the day's stocks by 12-month return (skipping the last month).
   - *Breakout*: closes at a 55-day high on at least 1.5× the previous 20 days' volume.
   - *Pullback*: 2-day RSI under 10 while above the 200-day average.
4. **Labels** (`backend/labels.py`): the triple-barrier method. Buy at the next open, then exit by each
   rule's own barriers (`config.RULE_EXITS`): momentum and breakout have no target, a 3 × ATR stop and
   a 60-trading-day limit; pullback keeps a +4 × ATR target, a −2 × ATR stop and 20 days. An idea several
   rules propose follows the first of momentum, breakout, pullback. A trade with a target *wins* if it
   reaches it; one with no target wins if it ends with a profit after costs. A day touching both barriers
   counts as a stop, and a gap through a barrier fills at the open. Costs are 0.15% each way.
5. **Model** (`backend/model.py`):
   - Time-based split, never random: train 2006–2021 (33,173 ideas), validate 2022 (1,811), test
     2023–2026 (8,311). Ideas whose trade crossed a boundary are dropped from the earlier set ("purging").
   - Three classifiers compared by walk-forward cross-validation (fit on the years before, score the
     next, for 2014–2021). The random forest won.
   - Platt scaling on the 18,843 out-of-sample predictions makes the probabilities honest.
   - Expected return = P(win) × a winner's gain + (1 − P(win)) × the typical loss of a non-winning trade,
     after costs. A winner's gain is the target, or for a trade with no target the average winner's gain
     (about 2 × its stop); the typical non-winner loses 0.92 × its stop for momentum, 0.94 for breakout and
     0.33 for pullback. All measured on the training years, per rule. An idea with ≥ +0.5% is a *model pick*.
6. **Trend score** (`backend/score.py`): 30% trend, 25% momentum, 20% relative strength, 15% nearness to
   the 52-week high and 10% volume, each scaled 0–1, summed and multiplied by 10. No training is
   involved. 7 or more is bullish; a Trend Start is the score reaching 7, a Trend End falling under 5.
7. **Backtest** (`backend/backtest.py`): each strategy runs a 10-slot paper account over the test years
   with the same entry, exit and cost rules. New positions are half size when the NIFTY closed under its
   200-day average on the signal day (`config.REGIME`).
8. **Paper trading** (`backend/portfolio.py`): SQLite-backed, replayed one day at a time with the same
   exit rules as the labels, each trade keeping its rule's own exits. The Ideas page's suggested quantity
   is halved in the same falling-market condition.

## Profit levers

Four switches in `backend/config.py`. Set to `None`, each gives back the original behaviour exactly (checked
on the training years: identical labels, expected-return inputs and account curves).

| Switch | What it does | Chosen |
|---|---|---|
| `RULE_EXITS` | Each rule's own target (or none), stop and time limit, used by the labels, the expected return, the backtest and the paper account | momentum and breakout: no target, 3 × ATR stop, 60 days; pullback: 4 × / 2 × ATR, 20 days |
| `MODEL_RANKED` | Adds a *Model ranked* strategy: every idea into free slots, best `p_win` or `expected_return` first | `expected_return` |
| `REGIME` | When the NIFTY is under its 200-day average, `half` the size of new positions or `skip` them | `half` |
| `CASH_SWEEP` | Idle cash earns a liquid fund's `CASH_RATE` (6%) or tracks the NIFTY, in the backtest and as its own `cash_earned` line in the paper account, never in a trade's P&L | off |

**How they were chosen** (`python -m backend.tune`, written to `artifacts/trials.csv`). Only 2006–2021 was
used. Every variant ran a 10-slot account over 2014–2021. Where the model was involved, each year's ideas
were scored by a model fitted only on ideas that finished before that year (`model.walk_forward_cv`),
calibrated and given payoffs from earlier years only. The procedure was fixed before the first run. First,
exits, one rule at a time, on that rule's own account. Then filter or rank with the model. Then the regime
filter, then idle cash. Each stage kept the best Sharpe, but today's setting stayed unless beaten by at
least 0.05. That margin is why the liquid fund (+0.04 Sharpe) is off. The pullback rule kept its old exits:
the 5-day versions suggested by the trade-level diagnostic lost money once a 10-slot account paid costs on
twice as many trades.

All 18 variants (✓ = kept at its stage; exits are target ATRs / stop ATRs / max days; M, B, P = momentum,
breakout, pullback):

| # | Stage | Variant | Settings | CAGR | Sharpe | Max fall |
|---|---|---|---|---|---|---|
|  | ref | NIFTY 50 buy and hold |  | +13.5% | 0.84 | −38.4% |
| 1 | 0 | Model picks, today's settings | exits all 4/2/20; regime off; cash idle | +7.8% | 0.54 | −24.9% |
| 2 | 1 | Momentum only, exits 4/2/20 | exits all 4/2/20 | +8.0% | 0.62 | −27.6% |
| 3 | 1 | Momentum only, exits none/3/40 | exits all none/3/40 | +16.0% | 1.01 | −30.0% |
| 4 | 1 | **Momentum only, exits none/3/60** ✓ | exits all none/3/60 | +17.8% | 1.08 | −30.5% |
| 5 | 1 | Breakout only, exits 4/2/20 | exits all 4/2/20 | +6.3% | 0.58 | −19.7% |
| 6 | 1 | Breakout only, exits none/3/40 | exits all none/3/40 | +7.7% | 0.60 | −25.4% |
| 7 | 1 | **Breakout only, exits none/3/60** ✓ | exits all none/3/60 | +10.0% | 0.73 | −23.3% |
| 8 | 1 | **Pullback only, exits 4/2/20** ✓ | exits all 4/2/20 | +7.6% | 0.59 | −26.1% |
| 9 | 1 | Pullback only, exits 2/2/5 | exits all 2/2/5 | −2.1% | −0.12 | −38.5% |
| 10 | 1 | Pullback only, exits none/2/5 | exits all none/2/5 | −3.3% | −0.22 | −43.5% |
| 11 | 2 | **Model picks** ✓ | exits M,B none/3/60, P 4/2/20; regime off; cash idle | +26.9% | 1.37 | −35.4% |
| 12 | 2 | Model ranked by p_win | same | +23.1% | 1.22 | −33.6% |
| 13 | 2 | Model ranked by expected_return | same | +24.9% | 1.26 | −35.9% |
| 14 | 2 | All rule ideas | same | +19.6% | 1.10 | −34.6% |
| 15 | 3 | **Model picks, regime half** ✓ | exits as above; regime half; cash idle | +25.4% | 1.45 | −24.9% |
| 16 | 3 | Model picks, regime skip | exits as above; regime skip; cash idle | +21.1% | 1.26 | −23.2% |
| 17 | 4 | Model picks, cash liquid fund 6% | exits as above; regime half; cash liquid | +26.3% | 1.49 | −24.8% |
| 18 | 4 | Model picks, cash tracks NIFTY | exits as above; regime half; cash nifty | +27.7% | 1.35 | −38.8% |

Stage 1 rows ran with no model, no regime filter and idle cash.

Before this, a one-off diagnostic on the same training years looked at 36 trade-level exit variants
and 17 account variants (idle cash, slot counts, ranking), and split each rule's trades by market regime.
That makes 71 looks at 2006–2021 in all.

## Results (test years 2023–2026)

**Read this first: the test years have been viewed before.** The original settings were run on 2023–2026
(the "before" column below), and the levers were looked for *because* those results were poor. The
levers were then chosen on 2006–2021 only, frozen, and `python -m backend.pipeline` was run once on the
test years. These are no longer fully untouched out-of-sample numbers: what was searched for was shaped
by having seen the test years. Treat the "after" column as optimistic.

| Model (new labels) | Walk-forward AUC 2014–21 | 2022 AUC | Test AUC |
|---|---|---|---|
| Logistic Regression | 0.617 ± 0.022 | 0.612 | 0.664 |
| **Random Forest** (chosen) | 0.627 ± 0.023 | 0.619 | **0.660** |
| Gradient Boosting | 0.617 ± 0.032 | 0.625 | 0.649 |

The label changed (for momentum and breakout, "ended with a profit within 60 days" instead of "hit +4 × ATR
before −2 × ATR within 20"), so these AUCs can't be compared with the old ones (0.545 walk-forward, 0.590 test
for logistic regression). Part of the higher AUC is not skill. The label now means different things for
different rules: a pullback still has to reach its target, while momentum and breakout only need a profit.
So the rule flags alone separate many winners from losers, and the most important feature is `is_momentum`.
Market breadth and the typical stock's last month come after it.

- Test ideas sorted by the model's chance into five groups won **17.8%, 25.5%, 41.4%, 49.0% and 51.0%**
  of the time, and the average return per trade rose from +0.13% to +4.02% (before: 13.3% to 27.5%, −0.07% to +0.48%).
- Brier score 0.2177, against 0.2341 for always predicting the average (before: 0.1568 against 0.1586).
- The +0.5% expected-return filter is now loose: it passes 7,277 of 8,311 test ideas (before: 1,696 of 8,359).
  The difference between Model picks and All rule ideas below comes mostly from which ideas fill the slots first.
- Backtest, 3 Jan 2023 to 13 Oct 2026, ₹10 lakh start, 10 slots, 0.15% each way for brokerage, taxes and slippage (itemised on the Backtest page):

| Strategy | Before: total | per year | worst fall | Sharpe | After: total | per year | worst fall | Sharpe |
|---|---|---|---|---|---|---|---|---|
| NIFTY 50 (buy and hold) | +26.9% | +6.5% | −15.8% | 0.57 | +26.9% | +6.5% | −15.8% | 0.57 |
| **Model picks** | +0.9% | +0.2% | −18.4% | 0.07 | **+52.4%** | **+11.8%** | −20.1% | **0.85** |
| Model ranked (new) | | | | | +50.9% | +11.5% | −22.5% | 0.83 |
| All rule ideas | −1.5% | −0.4% | −28.3% | 0.05 | +25.7% | +6.2% | −23.9% | 0.53 |
| Momentum only | +17.6% | +4.4% | −21.8% | 0.42 | +34.6% | +8.2% | −21.2% | 0.65 |
| Breakout only | −2.0% | −0.5% | −26.0% | 0.00 | +31.5% | +7.5% | −14.5% | 0.70 |
| Pullback only | −19.5% | −5.6% | −26.3% | −0.41 | +8.6% | +2.2% | −17.8% | 0.25 |

Model picks after: 257 trades, 47% won, +2.07% per trade, 83% invested on average (before: 356 trades, 43%,
+0.07%, 44% invested).

**Conclusion.** With the levers chosen on 2006–2021, Model picks went from flat to +11.8% a year on the
test years, ahead of the NIFTY's +6.5% (Sharpe 0.85 against 0.57), with a deeper worst fall (−20.1%
against −15.8%). Most of the gain comes from letting momentum and breakout trades run: no target, a
wider stop, 60 days. The shrink from the tuning window (Sharpe 1.45 there, 0.85 here) is a reminder that
18 variants chosen on one history overfit some. Survivorship bias (below) favours exactly these wide-stop,
long-hold exits, and the test years were seen before the levers were searched for. So read this as "the
swing rules may have an edge once trades are allowed to run", not as a proven one. A fair check would be
new data from after October 2026, or a universe that includes the stocks that fell out of the index.

---

## Project layout

```
stonks-lite/
├── backend/
│   ├── config.py          every tunable number (rules, barriers, split dates, costs)
│   ├── data.py            loads the CSVs
│   ├── indicators.py      feature engineering, per stock and across stocks
│   ├── rules.py           the three rules and the plain-English reason for each idea
│   ├── labels.py          triple-barrier labels and expected return
│   ├── score.py           the 0–10 trend score and Trend Start/End events
│   ├── model.py           split, walk-forward CV, calibration, evaluation
│   ├── backtest.py        paper-account simulation of each strategy
│   ├── charges.py         brokerage and taxes on a delivery trade, at NSE's rates on its date
│   ├── pipeline.py        runs all of it and writes artifacts/  (python -m backend.pipeline)
│   ├── tune.py            walk-forward choice of the profit levers on 2006–2021 (python -m backend.tune)
│   ├── market.py          everything the API asks, "as of" a date
│   ├── portfolio.py       paper trading on SQLite, with the replay clock
│   ├── app.py             Flask REST API                          (python -m backend.app)
│   └── update_data.py     optional price update from Yahoo Finance
├── artifacts/             model.joblib, metrics.json, backtest.json (the pipeline); trials.csv (tune.py);
│                          backtest_before.json (the original settings' test-year run, kept for comparison)
├── data/                  stocks.csv, nifty50.csv, prices/<SYMBOL>.csv
├── frontend/              React + Vite app (src/pages, src/components, src/lib.js, src/styles.css)
└── tests/                 unit and API tests
```

### REST API

| Method and path | Returns |
|---|---|
| `GET /api/status` | The clock's date, the NIFTY's trend, counts, model info |
| `GET /api/ideas` | The evening's ideas with chance, expected return, stop and target |
| `GET /api/stocks` | All 50 stocks with indicators and trend score |
| `GET /api/stocks/<symbol>?days=365` | One stock's history, score parts, events and past ideas |
| `GET /api/model`, `GET /api/backtest` | The training and backtest reports |
| `GET /api/portfolio` | The paper account |
| `POST /api/portfolio/orders` `{symbol, qty}` | A paper buy at the next open |
| `POST /api/portfolio/<id>/close` | Sell at today's close, or cancel a waiting order |
| `POST /api/portfolio/reset` | Back to ₹10,00,000 cash |
| `POST /api/clock` `{date}` / `{step}` / `{latest: true}` | Move the replay clock |
| `POST /api/waitlist` `{email, platform, source}` | Join the Pro waitlist (`platform` is mac, android or both; `source` is the spot in Lite that sent them). Kept in `paper_trading.db`; list it with `sqlite3 paper_trading.db "SELECT * FROM waitlist"` |

---

## What changed from TARGET20

| TARGET20 (original) | Stonks Lite |
|---|---|
| macOS SwiftUI app (10 pages) | React web app (6 pages) |
| FastAPI backend with WebSocket streams | Flask REST API |
| Every NSE stock via the Upstox broker API, live quotes, minute bars | 50 large caps, daily bars from CSV files |
| Swing rules v1–v4 with LightGBM meta-labeling and isotonic calibration | The same three rules and labels; scikit-learn models with walk-forward CV and Platt calibration |
| Research gate: CPCV, deflated Sharpe, permutation null, trial ledger | One time split, walk-forward validation, an untouched test period |
| Trend score v4 (technical 60% + fundamental checklist 40%, cap tiers) | The technical part only |
| Paper broker with minute fills, OPG orders, kill switch, rate caps | Next-open fills on daily bars, stop/target/time-limit exits per rule |
| **Removed:** MARL/PPO/IQN reinforcement-learning agents, Black-Litterman and convex portfolio optimisers, the F&O (futures and options) system, FinBERT news sentiment, fundamentals and AMFI cap tiers, the v3 monthly momentum book, launchd scheduling | (none of these) |

## Known limitations

- **Survivorship bias:** the 50 stocks are today's large companies, so the history leaves out companies
  that shrank or failed. This flatters every backtest (the original project documents the same problem). It
  flatters the chosen exits most: a wide stop, no target and a 60-day hold ride out dips in stocks we already
  know recovered and grew, while the stocks whose dips kept going (and later left the index) aren't in the data.
- **Many looks at the same history:** 18 lever variants (the table above) plus 53 in an earlier
  diagnostic, all on 2006–2021, and the 2023–2026 test years were viewed once before the levers and once
  after. No correction for this many trials (such as a deflated Sharpe ratio) has been made.
- The Sharpe ratio here doesn't subtract a risk-free rate, so a cash sweep into a liquid fund raises it
  without any extra skill.
- Daily bars can't show whether the stop or the target came first on a day that touched both; such days
  count as a stop.
- Costs are a flat 0.15% each way. Real costs depend on the broker and the order size.
- Paper orders fill at the next open on daily data; there is no intraday simulation.
- This is coursework, not investment advice. No real order is ever placed.

## References

- M. López de Prado, *Advances in Financial Machine Learning* (2018): triple-barrier labels (ch. 3),
  meta-labeling (§3.6), purging (ch. 7).
- N. Jegadeesh and S. Titman, "Returns to buying winners and selling losers" (1993): momentum.
- J. Platt, "Probabilistic outputs for support vector machines" (1999); A. Niculescu-Mizil and R. Caruana,
  "Predicting good probabilities with supervised learning" (ICML 2005): calibration.
- J. W. Wilder, *New Concepts in Technical Trading Systems* (1978): RSI and ATR.
