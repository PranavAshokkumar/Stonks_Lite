"""The machine-learning part: how likely is each rule idea to hit its target before its stop?

Steps (each one is a function below):

1. Split the ideas by time, never at random: train on 2006-2021, validate on 2022, test on 2023
   onwards. Training ideas whose trade was still running at the end of 2021 are dropped ("purged"), so
   no training label peeks into the later periods.
2. Compare three classifiers with walk-forward cross-validation on the training years: for each year
   from 2014 to 2021, fit on the years before it and score that year. The best mean ROC-AUC wins.
3. Calibrate the winner with Platt scaling (a one-feature logistic regression on its score), fitted on
   every prediction it made on data it hadn't seen: the walk-forward years and 2022. Then "30%" means
   about 30 out of 100 such trades really won (Platt, 1999; Niculescu-Mizil and Caruana, 2005).
4. Test once on 2023 onwards, and turn each probability into an expected return per trade.
"""

from __future__ import annotations

from typing import Dict

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score, roc_curve
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from backend import config
from backend.labels import expected_return

FEATURES = {
    "ret_5": "Return, last week",
    "ret_21": "Return, last month",
    "ret_63": "Return, last 3 months",
    "ret_252": "Return, last year",
    "momentum_12_1": "12-month momentum (skip 1 month)",
    "dist_sma20": "Distance from 20-day average",
    "dist_sma50": "Distance from 50-day average",
    "dist_sma200": "Distance from 200-day average",
    "dist_52w_high": "Distance from 52-week high",
    "rsi_14": "RSI (14 days)",
    "rsi_2": "RSI (2 days)",
    "atr_pct": "Volatility (ATR %)",
    "relative_volume": "Volume vs last 20 days",
    "volume_z": "Volume z-score (63 days)",
    "volume_20_126": "Volume trend (20 vs 126 days)",
    "breadth": "Market breadth (% of stocks above 200-DMA)",
    "universe_ret_21": "Typical stock's return, last month",
    "nifty_above_200": "NIFTY above its 200-DMA",
    "nifty_ret_21": "NIFTY return, last month",
    "is_momentum": "Rule: momentum",
    "is_breakout": "Rule: breakout",
    "is_pullback": "Rule: pullback",
}
FEATURE_NAMES = list(FEATURES)


def candidates() -> Dict[str, object]:
    """The models compared. Small and regularised on purpose: market data is noisy, and a big model
    mostly learns the noise."""
    return {
        "Logistic Regression": make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                                             LogisticRegression(C=0.3, max_iter=3000)),
        "Random Forest": make_pipeline(SimpleImputer(strategy="median"),
                                       RandomForestClassifier(n_estimators=200, max_depth=6, min_samples_leaf=50,
                                                              n_jobs=-1, random_state=config.RANDOM_STATE)),
        "Gradient Boosting": HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200,
                                                            min_samples_leaf=50, l2_regularization=1.0,
                                                            random_state=config.RANDOM_STATE),
    }


def features(frame: pd.DataFrame) -> pd.DataFrame:
    return frame[FEATURE_NAMES].astype(float)


def split(ideas: pd.DataFrame):
    """Train, validation and test sets by time, with purging at each boundary."""
    done = ideas[ideas["outcome"].isin(["target", "stop", "time"])]
    train_end, valid_end = pd.Timestamp(config.TRAIN_END), pd.Timestamp(config.VALID_END)
    train = done[done["exit_date"] <= train_end]
    valid = done[(done["date"] > train_end) & (done["exit_date"] <= valid_end)]
    test = done[done["date"] > valid_end]
    return train, valid, test


def walk_forward_cv(train: pd.DataFrame, make) -> Dict[str, object]:
    """For each year in config.CV_YEARS: fit on ideas that finished before the year began, score the
    ideas signalled in that year. Returns the ROC-AUC per year, their mean and spread, and every
    out-of-sample prediction with its idea's index (used later to calibrate, and by tune.py)."""
    scores, raw, won, index = {}, [], [], []
    for year in config.CV_YEARS:
        start, end = pd.Timestamp(f"{year}-01-01"), pd.Timestamp(f"{year}-12-31")
        fit_on = train[train["exit_date"] < start]
        score_on = train[(train["date"] >= start) & (train["date"] <= end)]
        if score_on["win"].nunique() < 2:
            continue
        model = make()
        model.fit(features(fit_on), fit_on["win"].astype(int))
        predicted = model.predict_proba(features(score_on))[:, 1]
        scores[year] = float(roc_auc_score(score_on["win"].astype(int), predicted))
        raw.append(predicted)
        won.append(score_on["win"].astype(int).to_numpy())
        index.append(score_on.index.to_numpy())
    values = np.array(list(scores.values()))
    return {"by_year": scores, "mean": float(values.mean()), "std": float(values.std()),
            "raw": np.concatenate(raw), "won": np.concatenate(won), "index": np.concatenate(index)}


def _logit(p) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p)).reshape(-1, 1)


class Calibrated:
    """A fitted classifier plus the Platt map from its raw scores to honest probabilities."""

    def __init__(self, name, estimator, calibrator, gain_in_stops, loss_in_stops):
        self.name, self.estimator, self.calibrator = name, estimator, calibrator
        self.gain_in_stops, self.loss_in_stops = gain_in_stops, loss_in_stops

    def raw(self, frame: pd.DataFrame) -> np.ndarray:
        return self.estimator.predict_proba(features(frame))[:, 1]

    def p_win(self, frame: pd.DataFrame) -> np.ndarray:
        return self.calibrator.predict_proba(_logit(self.raw(frame)))[:, 1] if len(frame) else np.array([])

    def expected_return(self, frame: pd.DataFrame) -> np.ndarray:
        rule = frame["exit_rule"]
        return expected_return(self.p_win(frame), frame["target"].to_numpy(), frame["stop"].to_numpy(),
                               rule.map(self.loss_in_stops).to_numpy(), rule.map(self.gain_in_stops).to_numpy())


def payoffs(train: pd.DataFrame):
    """How trades end on average, in units of their stop, for each set of exits (`exit_rule`): a
    winner's gain (used for trades with no target) and a non-winner's loss (1.0 would mean every non-win
    lost the full stop). Measured on the training years only."""
    in_stops = (train["net_return"] + 2 * config.COST) / train["stop"]
    won = train["win"].astype(bool)
    gain = in_stops[won].groupby(train["exit_rule"][won]).mean()
    loss = -in_stops[~won].groupby(train["exit_rule"][~won]).mean()
    return {k: float(v) for k, v in gain.items()}, {k: float(v) for k, v in loss.items()}


def calibration_table(p: np.ndarray, won: np.ndarray, bins: int = 8):
    """Ideas grouped by predicted probability: what was promised against what happened."""
    frame = pd.DataFrame({"p": p, "won": won})
    frame["bin"] = pd.qcut(frame["p"].rank(method="first"), bins, labels=False)
    table = frame.groupby("bin").agg(predicted=("p", "mean"), actual=("won", "mean"), count=("won", "size"))
    return [{k: (float(v) if k != "count" else int(v)) for k, v in row.items()} for row in table.to_dict("records")]


def quintile_table(test: pd.DataFrame, p: np.ndarray):
    """Test ideas in five equal groups from least to most confident: does a higher score really mean
    more wins and better returns?"""
    frame = test.assign(p=p)
    frame["group"] = pd.qcut(frame["p"].rank(method="first"), 5, labels=["Lowest 20%", "2nd", "3rd", "4th", "Highest 20%"])
    table = frame.groupby("group", observed=True).agg(p=("p", "mean"), win_rate=("win", "mean"),
                                                      avg_return=("net_return", "mean"), count=("win", "size"))
    return [{"group": str(g), **{k: float(v) for k, v in row.items()}} for g, row in table.iterrows()]


def train_and_evaluate(ideas: pd.DataFrame):
    """The whole ML procedure. Returns the calibrated model and a metrics dict for the web page."""
    train, valid, test = split(ideas)
    y_train = train["win"].astype(int)

    comparison = []
    for name, model in candidates().items():
        cv = walk_forward_cv(train, lambda: candidates()[name])
        fitted = model.fit(features(train), y_train)
        test_auc = roc_auc_score(test["win"].astype(int), fitted.predict_proba(features(test))[:, 1])
        valid_auc = roc_auc_score(valid["win"].astype(int), fitted.predict_proba(features(valid))[:, 1])
        comparison.append({"name": name, "cv_auc": cv["mean"], "cv_std": cv["std"], "cv_by_year": cv["by_year"],
                           "valid_auc": float(valid_auc), "test_auc": float(test_auc), "estimator": fitted,
                           "oof": (cv["raw"], cv["won"])})
        print(f"  {name:20s} walk-forward CV AUC {cv['mean']:.3f} ± {cv['std']:.3f}   "
              f"2022 AUC {valid_auc:.3f}   test AUC {test_auc:.3f}", flush=True)
    best = max(comparison, key=lambda row: row["cv_auc"])          # chosen on the training years only

    # Platt scaling on everything the chosen model predicted out of sample: the walk-forward years and 2022.
    oof_raw, oof_won = best["oof"]
    calib_raw = np.concatenate([oof_raw, best["estimator"].predict_proba(features(valid))[:, 1]])
    calib_won = np.concatenate([oof_won, valid["win"].astype(int).to_numpy()])
    calibrator = LogisticRegression(C=1e6, max_iter=1000).fit(_logit(calib_raw), calib_won)
    model = Calibrated(best["name"], best["estimator"], calibrator, *payoffs(train))

    y_test = test["win"].astype(int).to_numpy()
    p_test = model.p_win(test)
    ev_test = model.expected_return(test)
    picked = ev_test >= config.MIN_EXPECTED_RETURN
    base_rate = float(y_train.mean())
    fpr, tpr, _ = roc_curve(y_test, model.raw(test))
    keep = np.unique(np.linspace(0, len(fpr) - 1, 60).astype(int))

    importance = permutation_importance(best["estimator"], features(test), y_test, scoring="roc_auc",
                                        n_repeats=5, random_state=config.RANDOM_STATE, n_jobs=-1)
    ranked = sorted(zip(FEATURE_NAMES, importance.importances_mean, importance.importances_std), key=lambda r: -r[1])

    def group(mask):
        part = test[mask]
        return {"count": int(len(part)), "win_rate": float(part["win"].mean()) if len(part) else None,
                "avg_return": float(part["net_return"].mean()) if len(part) else None}

    metrics = {
        "chosen": best["name"],
        "comparison": [{k: v for k, v in row.items() if k not in ("estimator", "oof")} for row in comparison],
        "calibration_set": int(len(calib_won)),
        "dataset": {
            "ideas": int(len(ideas)), "stocks": int(ideas["symbol"].nunique()),
            "first_idea": ideas["date"].min().strftime("%Y-%m-%d"), "last_idea": ideas["date"].max().strftime("%Y-%m-%d"),
            "train": {"count": int(len(train)), "from": train["date"].min().strftime("%Y-%m-%d"), "to": config.TRAIN_END,
                      "win_rate": base_rate},
            "valid": {"count": int(len(valid)), "from": valid["date"].min().strftime("%Y-%m-%d"), "to": config.VALID_END,
                      "win_rate": float(valid["win"].mean())},
            "test": {"count": int(len(test)), "from": test["date"].min().strftime("%Y-%m-%d"),
                     "to": test["date"].max().strftime("%Y-%m-%d"), "win_rate": float(y_test.mean())},
            "outcomes": {k: int(v) for k, v in ideas["outcome"].value_counts().items()},
        },
        "features": [{"name": n, "label": FEATURES[n]} for n in FEATURE_NAMES],
        "test": {
            "roc_auc": float(roc_auc_score(y_test, model.raw(test))),
            "brier": float(brier_score_loss(y_test, p_test)),
            "brier_base_rate": float(brier_score_loss(y_test, np.full(len(y_test), base_rate))),
            "base_rate": float(y_test.mean()),
            "mean_predicted": float(p_test.mean()),
            "roc_curve": [{"fpr": float(fpr[i]), "tpr": float(tpr[i])} for i in keep],
            "calibration": calibration_table(p_test, y_test),
            "quintiles": quintile_table(test, p_test),
            "picks": group(picked), "skipped": group(~picked), "all": group(np.ones(len(test), bool)),
            "confusion": {"picked_won": int((picked & (y_test == 1)).sum()), "picked_lost": int((picked & (y_test == 0)).sum()),
                          "skipped_won": int((~picked & (y_test == 1)).sum()), "skipped_lost": int((~picked & (y_test == 0)).sum())},
        },
        "importance": [{"name": n, "label": FEATURES[n], "value": float(m), "std": float(s)} for n, m, s in ranked],
        "settings": {"min_expected_return": config.MIN_EXPECTED_RETURN, "target_atr": config.TARGET_ATR,
                     "stop_atr": config.STOP_ATR, "hold_days": config.HOLD_DAYS, "cost": config.COST,
                     "rule_exits": config.RULE_EXITS, "gain_in_stops": model.gain_in_stops,
                     "loss_in_stops": model.loss_in_stops, "train_end": config.TRAIN_END, "valid_end": config.VALID_END},
    }
    return model, metrics
