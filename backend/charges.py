"""Brokerage and taxes on an NSE equity delivery trade, at the rates in force on its date.

The same dated statutory schedules as the full app (TARGET20, backend/models/transaction_costs.py, where each rate's
source is cited), from 18 July 2022, which covers the test years. As a share of the trade's value:

    Securities Transaction Tax (STT)   0.1% on the buy and on the sell
    NSE transaction charge             0.00345%, 0.00325% from 1 Apr 2023, 0.00322% from 1 Apr 2024, 0.00297% from 1 Oct 2024
    SEBI turnover fee                  Rs 10 a crore (0.0001%)
    Stamp duty                         0.015% on the buy
    GST                                18% of brokerage, the transaction charge and SEBI's fee
    Brokerage                          config.BROKERAGE_PER_ORDER rupees an order (0: a discount broker's delivery trades)

The backtest itself still charges a flat config.COST each way; these say what that covered. Check a broker's contract
note before relying on them for real money.
"""

from __future__ import annotations

import datetime as dt

from backend import config

NSE_CHARGE = ((dt.date(2022, 7, 18), 0.0000345), (dt.date(2023, 4, 1), 0.0000325),
              (dt.date(2024, 4, 1), 0.0000322), (dt.date(2024, 10, 1), 0.0000297))
STT, SEBI_FEE, STAMP_ON_BUY, GST = 0.001, 0.000001, 0.00015, 0.18
FIELDS = ("brokerage", "stt", "exchange", "sebi", "stamp", "gst")


def charges(side: str, value: float, on) -> dict:
    """Each charge, in rupees, on a `side` ("buy" or "sell") trade of `value` rupees on date `on`. A date before
    the earliest schedule held is refused rather than charged at later rates."""
    on = on.date() if hasattr(on, "date") else on
    known = [rate for start, rate in NSE_CHARGE if start <= on]
    if not known:
        raise ValueError(f"No charge schedule is held for {on}; the earliest starts {NSE_CHARGE[0][0]}.")
    brokerage, exchange, sebi = config.BROKERAGE_PER_ORDER, known[-1] * value, SEBI_FEE * value
    return {"brokerage": brokerage, "stt": STT * value, "exchange": exchange, "sebi": sebi,
            "stamp": STAMP_ON_BUY * value if side == "buy" else 0.0, "gst": GST * (brokerage + exchange + sebi)}


def account_charges(fills, scale: float) -> dict:
    """Everything an account paid on its `fills` [(date, "buy"/"sell", value)], with values multiplied by `scale`
    (the backtest's account starts at 100). `charged` is what the backtest deducted (config.COST each way) and
    `allowance` what that left over the itemised charges: room for slippage."""
    paid = dict.fromkeys(FIELDS, 0.0)
    turnover = {"buy": 0.0, "sell": 0.0}
    for day, side, value in fills:
        for name, amount in charges(side, value * scale, day).items():
            paid[name] += amount
        turnover[side] += value * scale
    charged = config.COST * (turnover["buy"] + turnover["sell"])
    return {**{name: round(amount, 2) for name, amount in paid.items()}, "orders": len(fills),
            "bought": round(turnover["buy"], 2), "sold": round(turnover["sell"], 2), "charged": round(charged, 2),
            "allowance": round(charged - sum(paid.values()), 2)}
