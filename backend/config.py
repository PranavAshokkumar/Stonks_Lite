"""Every tunable number in one place, so the report can quote them and a change is easy to find."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PRICES_DIR = DATA_DIR / "prices"
ARTIFACTS_DIR = ROOT / "artifacts"
DB_PATH = ROOT / "paper_trading.db"

# --- The three swing rules (kept from the original app's swing rules) --------------------------
MOMENTUM_TOP = 0.10        # momentum: top 10% of the day's stocks by 12-month return (skipping the last month)
BREAKOUT_DAYS = 55         # breakout: close at a 55-day high ...
BREAKOUT_VOLUME = 1.5      # ... on at least 1.5x the previous 20 days' average volume
PULLBACK_RSI2 = 10.0       # pullback: 2-day RSI under 10 while the stock is above its 200-day average
RULES = ("momentum", "breakout", "pullback")

# --- What a trade is (the "triple barrier": target, stop, time limit) --------------------------
TARGET_ATR = 4.0           # target = entry + 4 x ATR
STOP_ATR = 2.0             # stop   = entry - 2 x ATR
HOLD_DAYS = 20             # sell at the close of the 20th trading day if neither was hit
COST = 0.0015              # brokerage + taxes + slippage, per side (0.15%)
BROKERAGE_PER_ORDER = 0.0  # rupees an order, for the itemised charges (charges.py): 0 is a discount broker's delivery

# --- Building the training data ---------------------------------------------------------------
WARM_UP_DAYS = 252         # a year of history before the first idea, so every indicator exists
SCAN_EVERY = 1             # the rules run every trading evening, on history too

# --- Time-based split: the model never sees the future it is tested on ----------------------
TRAIN_END = "2021-12-31"   # train on ideas from 2006 to 2021 (walk-forward CV picks the model)
VALID_END = "2022-12-31"   # 2022: calibrate the chosen model's probabilities
                           # 2023 onwards: the untouched test period
CV_YEARS = list(range(2014, 2022))   # walk-forward folds: train on the years before, validate on one year
RANDOM_STATE = 42

# A "model pick" is an idea whose expected return after costs is at least this much.
MIN_EXPECTED_RETURN = 0.005

# --- Profit levers. None everywhere is the original behaviour. The values below were chosen by
# backend/tune.py on 2014-2021 (18 variants, artifacts/trials.csv) and frozen before the test years were run.
# Per-rule exits: rule -> (target in ATRs, or None for no target; stop in ATRs; max trading days). An idea
# that several rules propose follows the first of them in RULES order. A trade with a target wins if it
# reaches it; one with no target wins if it ends with a profit. None: every rule uses the barriers above.
RULE_EXITS = {"momentum": (None, 3.0, 60), "breakout": (None, 3.0, 60), "pullback": (4.0, 2.0, 20)}
# A "Model ranked" strategy: every idea into free slots, best first by this column ("p_win" or
# "expected_return"). None: not run.
MODEL_RANKED = "expected_return"
# New positions when the NIFTY closed under its 200-day average on the signal day: "half" size, or
# "skip" them. None: the regime is ignored.
REGIME = "half"
# Uninvested cash: "liquid" earns CASH_RATE a year (a liquid fund), "nifty" tracks the NIFTY 50.
# None: it earns nothing. (A liquid fund added 0.04 Sharpe in tuning, under the 0.05 bar, so it stays off.)
CASH_SWEEP = None
CASH_RATE = 0.06

# --- The 0-10 trend score (transparent, no training) ----------------------------------------
SCORE_WEIGHTS = {"trend": 0.30, "momentum": 0.25, "relative_strength": 0.20, "quality": 0.15, "participation": 0.10}
BEARISH_BELOW = 4.0
BULLISH_FROM = 7.0
TREND_START = 7.0          # a Trend Start: the score reaches 7 while not in a trend
TREND_END = 5.0            # a Trend End: the score falls under 5 while in a trend

# --- Paper trading -------------------------------------------------------------------------
STARTING_CASH = 1_000_000.0   # Rs 10 lakh
SLOTS = 10                    # default position size: a tenth of the account
