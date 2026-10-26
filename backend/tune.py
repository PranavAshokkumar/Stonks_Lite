"""How the profit levers in config.py were chosen: walk-forward evaluation on the training years only.

    python -m backend.tune          (a few minutes; writes artifacts/trials.csv)

Every variant trades a 10-slot account from 2014 to 2021 with backtest.simulate. Ideas are labelled with
the variant's exits; trades still running at the end of 2021 are dropped. Where the model is used, each
year's ideas are scored by a model fitted only on ideas that finished before that year (model.walk_forward_cv,
with the pipeline's choice of classifier), Platt-calibrated on the earlier years' out-of-fold scores, with
payoffs measured on the earlier years. 2022 and the 2023+ test years are never traded here.

The procedure, fixed before the first run:
1. Exits, one rule at a time, judged on that rule's own account with every idea in it on the candidate
   exits (no model, idle cash, no regime filter).
2. With the chosen exits (labels and model retrained to match): Model picks (the +0.5% expected-return
   filter), Model ranked by p_win, Model ranked by expected return, All rule ideas.
3. The regime filter on the stage 2 winner: off, half size, skip.
4. Idle cash on the stage 3 winner: idle, a liquid fund at CASH_RATE, the NIFTY.
Each stage keeps the variant with the highest Sharpe, but today's setting (the first row of the stage)
stays unless the best beats it by at least MARGIN. Every variant run is a row of artifacts/trials.csv.
"""

from __future__ import annotations

import pandas as pd
from sklearn.linear_model import LogisticRegression

from backend import backtest, config, labels, model, pipeline, rules

MARGIN = 0.05
TODAY = (config.TARGET_ATR, config.STOP_ATR, config.HOLD_DAYS)
EXIT_CHOICES = {                   # (target ATRs or None, stop ATRs, max days); the first is today's
    "momentum": [TODAY, (None, 3.0, 40), (None, 3.0, 60)],
    "breakout": [TODAY, (None, 3.0, 40), (None, 3.0, 60)],
    "pullback": [TODAY, (2.0, 2.0, 5), (None, 2.0, 5)],
}
COLUMNS = ["cagr", "sharpe", "max_drawdown", "trades", "avg_exposure"]

PRICES, INDEX, PANEL, _ = pipeline.build_history()
START, END = pd.Timestamp(f"{config.CV_YEARS[0]}-01-01"), pd.Timestamp(config.TRAIN_END)
DAY_ROWS = PANEL[PANEL["date"].isin(rules.scan_dates(PANEL)) & (PANEL["date"] <= END)]
CLOSES = PANEL[PANEL["date"] <= END].pivot(index="date", columns="symbol", values="close").sort_index().ffill()
TRIALS = []


def fmt(exits) -> str:
    target, stop, days = exits
    return f"{'none' if target is None else f'{target:g}'}/{stop:g}/{days}"


def settings() -> str:
    """The levers now in config, in one line."""
    exits = config.RULE_EXITS or {"all": TODAY}
    shown = (f"all {fmt(next(iter(exits.values())))}" if len(set(exits.values())) == 1
             else ", ".join(f"{rule} {fmt(e)}" for rule, e in exits.items()))
    return f"exits {shown}; regime {config.REGIME or 'off'}; cash {config.CASH_SWEEP or 'idle'}"


def labelled(rule_exits) -> pd.DataFrame:
    """The training years' ideas labelled with these exits (None: today's), minus trades running past 2021."""
    config.RULE_EXITS = rule_exits
    ideas = labels.label_ideas(rules.find_ideas(DAY_ROWS), PRICES)
    return ideas[ideas["exit_date"] <= END]


def scored(ideas: pd.DataFrame) -> pd.DataFrame:
    """The 2014-2021 ideas with out-of-fold p_win and expected return."""
    runs = {name: model.walk_forward_cv(ideas, lambda name=name: model.candidates()[name]) for name in model.candidates()}
    name = max(runs, key=lambda n: runs[n]["mean"])
    print(f"    out-of-fold scores from {name} (walk-forward AUC {runs[name]['mean']:.3f})", flush=True)
    out = ideas.loc[runs[name]["index"]].assign(raw=runs[name]["raw"])
    parts = []
    for year in config.CV_YEARS:
        start = pd.Timestamp(f"{year}-01-01")
        now, before = out[out["date"].dt.year == year], out[out["exit_date"] < start]
        p = now["raw"].to_numpy()
        if len(before):
            platt = LogisticRegression(C=1e6, max_iter=1000).fit(model._logit(before["raw"]), before["win"].astype(int))
            p = platt.predict_proba(model._logit(p))[:, 1]
        gain, loss = model.payoffs(ideas[ideas["exit_date"] < start])
        rule = now["exit_rule"]
        parts.append(now.assign(p_win=p, expected_return=labels.expected_return(
            p, now["target"].to_numpy(), now["stop"].to_numpy(), rule.map(loss).to_numpy(), rule.map(gain).to_numpy())))
    return pd.concat(parts)


def log(stage, name, stats: dict, chosen=False) -> dict:
    row = {"stage": stage, "name": name, "settings": settings() if stage != "ref" else "",
           **{k: stats.get(k) for k in COLUMNS}, "chosen": chosen}
    TRIALS.append(row)
    print(f"  [{stage}] {name:44s} CAGR {row['cagr']:+.1%}  Sharpe {row['sharpe']:.2f}  "
          f"max fall {row['max_drawdown']:.1%}   {row['settings']}", flush=True)
    return row


def trial(stage, name, ideas: pd.DataFrame, rank_by=None) -> dict:
    """One variant: a 10-slot account trading `ideas` from 2014 to 2021, with the levers now in config."""
    ideas = ideas[ideas["date"] >= START]
    out = backtest.simulate(ideas, CLOSES, rank_by, cash_return=backtest.cash_returns(INDEX, CLOSES.index))
    return log(stage, name, backtest.summary(out["curve"]["equity"], out["trades"], out["curve"]["exposure"]))


def pick(rows: list) -> int:
    """The row with the best Sharpe if it beats the first (today's setting) by MARGIN, else the first."""
    best = max(range(len(rows)), key=lambda i: rows[i]["sharpe"])
    best = best if rows[best]["sharpe"] >= rows[0]["sharpe"] + MARGIN else 0
    rows[best]["chosen"] = True
    return best


def main() -> None:
    print("Reference: the NIFTY and today's settings, 2014-2021", flush=True)
    nifty = INDEX.set_index("date")["close"]
    nifty = nifty[(nifty.index >= START) & (nifty.index <= END)]
    log("ref", "NIFTY 50 buy and hold", backtest.summary(100 * nifty / nifty.iloc[0]))
    today = scored(labelled(None))
    trial(0, "Model picks, today's settings", *backtest.strategies(today)["Model picks"])

    print("Stage 1: exits, one rule at a time (target ATRs / stop ATRs / max days)", flush=True)
    chosen = {}
    for rule, choices in EXIT_CHOICES.items():
        rows = []
        for exits in choices:
            ideas = labelled({r: exits for r in config.RULES})
            rows.append(trial(1, f"{rule.title()} only, exits {fmt(exits)}", ideas[ideas[f"is_{rule}"]]))
        chosen[rule] = choices[pick(rows)]

    print("Stage 2: filter or rank by the model", flush=True)
    ideas = scored(labelled(None if all(e == TODAY for e in chosen.values()) else chosen))
    variants = [("Model picks", None), ("Model ranked", "p_win"), ("Model ranked", "expected_return"),
                ("All rule ideas", None)]
    rows = []
    for strategy, ranked in variants:
        config.MODEL_RANKED = ranked
        rows.append(trial(2, strategy + (f" by {ranked}" if ranked else ""), *backtest.strategies(ideas)[strategy]))
    strategy, _ = variants[pick(rows)]
    config.MODEL_RANKED = "p_win" if rows[1]["sharpe"] >= rows[2]["sharpe"] else "expected_return"
    incumbent = rows[[r["chosen"] for r in rows].index(True)]

    for stage, lever, options in ((3, "REGIME", ("half", "skip")), (4, "CASH_SWEEP", ("liquid", "nifty"))):
        print(f"Stage {stage}: {lever} on {strategy}", flush=True)
        rows = [incumbent]
        for option in options:
            setattr(config, lever, option)
            rows.append(trial(stage, f"{strategy}, {lever.lower()} {option}", *backtest.strategies(ideas)[strategy]))
        best = pick(rows)
        setattr(config, lever, ((None,) + options)[best])
        incumbent = rows[best]

    config.ARTIFACTS_DIR.mkdir(exist_ok=True)
    pd.DataFrame(TRIALS).to_csv(config.ARTIFACTS_DIR / "trials.csv", index=False, float_format="%.4f")
    print(f"\n{sum(r['stage'] != 'ref' for r in TRIALS)} variants run; written to artifacts/trials.csv")
    print("Frozen settings for config.py:")
    for lever in ("RULE_EXITS", "MODEL_RANKED", "REGIME", "CASH_SWEEP"):
        print(f"    {lever} = {getattr(config, lever)!r}")
    print(f"    (strategy kept: {strategy})")


if __name__ == "__main__":
    main()
