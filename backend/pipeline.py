"""The end-to-end pipeline. Run it once to (re)train:

    python -m backend.pipeline

It loads the CSVs, computes the indicators and trend scores, runs the three rules on every trading day
in history, labels every idea with how it ended, trains and tests the model, backtests the strategies,
and writes the results to artifacts/ (model.joblib, metrics.json, backtest.json).
"""

from __future__ import annotations

import json
import time

import joblib
import numpy as np
import pandas as pd

from backend import backtest, config, data, indicators, labels, model, rules, score


def build_history():
    """Everything the model and the app need, from the CSV files: the panel (every stock, every day,
    with indicators and scores) and every rule idea in history with its outcome."""
    prices = data.load_prices()
    index = data.load_index()
    panel = score.add_scores(indicators.build_panel(prices, index))
    ideas = rules.find_ideas(panel[panel["date"].isin(rules.scan_dates(panel))])
    ideas = labels.label_ideas(ideas, prices)
    train_end, valid_end = pd.Timestamp(config.TRAIN_END), pd.Timestamp(config.VALID_END)
    ideas["period"] = np.where(ideas["date"] <= train_end, "train", np.where(ideas["date"] <= valid_end, "valid", "test"))
    return prices, index, panel, ideas


def main() -> None:
    started = time.time()
    config.ARTIFACTS_DIR.mkdir(exist_ok=True)
    print("1/4 Loading prices, computing indicators, finding and labelling ideas ...", flush=True)
    prices, index, panel, ideas = build_history()
    print(f"    {len(ideas):,} ideas from {ideas['date'].min().date()} to {ideas['date'].max().date()} "
          f"({ideas['symbol'].nunique()} stocks)", flush=True)

    print("2/4 Training and testing the models ...", flush=True)
    fitted, metrics = model.train_and_evaluate(ideas)
    print(f"    chosen: {metrics['chosen']}, test ROC-AUC {metrics['test']['roc_auc']:.3f}", flush=True)

    print("3/4 Backtesting on the test period ...", flush=True)
    ideas["p_win"] = fitted.p_win(ideas)
    ideas["expected_return"] = fitted.expected_return(ideas)
    closes = panel.pivot(index="date", columns="symbol", values="close").sort_index().ffill()
    test_ideas = ideas[(ideas["period"] == "test") & ideas["outcome"].isin(["target", "stop", "time", "open"])]
    results = backtest.run(test_ideas, closes, index)
    results["rules"] = backtest.rule_table(ideas)
    for row in results["results"]:
        print(f"    {row['name']:16s} total {row['total_return']:+.1%}  max drawdown {row['max_drawdown']:.1%}", flush=True)

    print("4/4 Saving artifacts ...", flush=True)
    joblib.dump(fitted, config.ARTIFACTS_DIR / "model.joblib")
    metrics["trained_at"] = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")
    metrics["data_until"] = panel["date"].max().strftime("%Y-%m-%d")
    (config.ARTIFACTS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=1))
    (config.ARTIFACTS_DIR / "backtest.json").write_text(json.dumps(results, indent=1))
    print(f"Done in {time.time() - started:.0f}s. Artifacts are in {config.ARTIFACTS_DIR}", flush=True)


if __name__ == "__main__":
    main()
