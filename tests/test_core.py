"""Unit tests for the parts that must be exactly right: indicators, the labels, the rules, the score and
the paper broker's daily exit rules. Run with:  python -m unittest discover tests  (or: pytest)"""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd

from backend import config, indicators, labels, rules, score
from backend.market import clean
from backend.portfolio import PaperBroker, check_day


def bars_from(closes, spread=0.01, volume=1000):
    closes = np.asarray(closes, dtype=float)
    return pd.DataFrame({"date": pd.bdate_range("2020-01-01", periods=len(closes)), "open": closes,
                         "high": closes * (1 + spread), "low": closes * (1 - spread), "close": closes,
                         "volume": np.full(len(closes), volume, dtype=float)})


class Indicators(unittest.TestCase):
    def test_rsi_is_100_when_price_only_rises(self):
        rsi = indicators.rsi(pd.Series(np.arange(1.0, 40.0)), 14)
        self.assertAlmostEqual(rsi.iloc[-1], 100.0)

    def test_rsi_is_low_after_a_fall(self):
        rsi = indicators.rsi(pd.Series(np.r_[np.arange(1.0, 30.0), np.arange(29.0, 20.0, -1)]), 2)
        self.assertLess(rsi.iloc[-1], 10)

    def test_atr_of_a_steady_range(self):
        bars = bars_from(np.full(60, 100.0), spread=0.01)
        atr = indicators.atr(bars["high"], bars["low"], bars["close"], 14)
        self.assertAlmostEqual(atr.iloc[-1], 2.0, places=6)          # high 101 - low 99

    def test_no_look_ahead(self):
        """A row's indicators must not change when later days are added."""
        rng = np.random.default_rng(0)
        bars = bars_from(100 * np.exp(np.cumsum(rng.normal(0, 0.01, 400))))
        full = indicators.stock_indicators(bars)
        cut = indicators.stock_indicators(bars.iloc[:300])
        pd.testing.assert_series_equal(full["rsi_14"].iloc[:300], cut["rsi_14"], check_names=False)
        pd.testing.assert_series_equal(full["dist_sma200"].iloc[:300], cut["dist_sma200"], check_names=False)

    def test_breakout_needs_a_new_high_and_volume(self):
        closes = np.r_[np.full(80, 100.0), 110.0]
        bars = bars_from(closes)
        bars.loc[80, "volume"] = 5000
        out = indicators.stock_indicators(bars)
        self.assertTrue(out["is_breakout"].iloc[-1])
        bars.loc[80, "volume"] = 1000                                # same high, normal volume
        self.assertFalse(indicators.stock_indicators(bars)["is_breakout"].iloc[-1])


class Labels(unittest.TestCase):
    def run_trade(self, opens, highs, lows, closes, target=0.10, stop=0.05):
        a = lambda x: np.asarray(x, dtype=float)
        return labels.resolve(a(opens), a(highs), a(lows), a(closes), 0, target, stop)

    def test_target_hit(self):
        day, price, outcome = self.run_trade([100, 101, 105], [101, 104, 111], [99, 100, 104], [100, 103, 110])
        self.assertEqual((day, outcome), (2, "target"))
        self.assertAlmostEqual(price, 110.0)

    def test_a_day_touching_both_barriers_is_a_stop(self):
        day, price, outcome = self.run_trade([100, 100], [101, 112], [99, 94], [100, 100])
        self.assertEqual((day, outcome), (1, "stop"))
        self.assertAlmostEqual(price, 95.0)

    def test_gap_through_the_stop_fills_at_the_open(self):
        day, price, outcome = self.run_trade([100, 90], [101, 91], [99, 88], [100, 89])
        self.assertEqual((day, outcome, price), (1, "stop", 90.0))

    def test_time_limit(self):
        n = config.HOLD_DAYS + 5
        day, price, outcome = self.run_trade([100] * n, [101] * n, [99] * n, [100.5] * n)
        self.assertEqual((day, outcome), (config.HOLD_DAYS - 1, "time"))

    def test_open_when_data_runs_out(self):
        self.assertEqual(self.run_trade([100] * 3, [101] * 3, [99] * 3, [100] * 3)[2], "open")

    def test_net_return_pays_costs_both_ways(self):
        self.assertAlmostEqual(labels.net_return(100, 100), (1 - config.COST) / (1 + config.COST) - 1)

    def test_expected_return_grows_with_probability(self):
        low, high = labels.expected_return(np.array([0.1, 0.4]), np.array([0.1, 0.1]), np.array([0.05, 0.05]), 0.5)
        self.assertLess(low, high)


class BrokerMatchesLabels(unittest.TestCase):
    """The paper broker checks one day at a time; the labels walk the whole trade. They must agree."""

    def test_same_exits_on_random_paths(self):
        rng = np.random.default_rng(1)
        for _ in range(300):
            n = 30
            closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.02, n)))
            opens = closes * np.exp(rng.normal(0, 0.01, n))
            highs = np.maximum(opens, closes) * (1 + rng.uniform(0, 0.02, n))
            lows = np.minimum(opens, closes) * (1 - rng.uniform(0, 0.02, n))
            target, stop = 0.08, 0.04
            exit_at, price, outcome = labels.resolve(opens, highs, lows, closes, 0, target, stop)
            entry = opens[0]
            for day in range(n):
                bar = {"open": opens[day], "high": highs[day], "low": lows[day], "close": closes[day]}
                ended = check_day(bar, entry * (1 - stop), entry * (1 + target), first_day=day == 0, days_held=day + 1)
                if ended:
                    self.assertEqual(day, exit_at)
                    self.assertAlmostEqual(ended[0], price)
                    self.assertEqual(ended[1], outcome)
                    break


class FakeMarket:
    """Just what PaperBroker asks of backend.market.Market, for a few made-up stocks."""
    cash_return = {}

    def __init__(self, prices):
        self.bars = {s: b.assign(day=b["date"].dt.strftime("%Y-%m-%d")).set_index("day") for s, b in prices.items()}
        self.days = list(next(iter(self.bars.values())).index)
        self.latest = self.days[-1]

    def snap(self, day):
        return day

    def trading_days_between(self, start, end):
        return [d for d in self.days if start < d <= end]

    def bar(self, symbol, day):
        return self.bars[symbol].loc[day].to_dict()

    def close_on(self, symbol, day):
        return float(self.bars[symbol].loc[:day, "close"].iloc[-1])


class RuleExitsMatchBroker(unittest.TestCase):
    """With per-rule exits on, each idea's own target, stop and time limit must reach the labels and the
    paper broker alike, including a trade with no target and a 5-day limit."""

    def test_labels_and_paper_broker_agree(self):
        exits = {"momentum": (None, 3.0, 40), "breakout": (None, 3.0, 60), "pullback": (2.0, 2.0, 5)}
        rng = np.random.default_rng(3)
        seen = set()
        with mock.patch.object(config, "RULE_EXITS", exits), tempfile.TemporaryDirectory() as tmp:
            for path in range(15):
                prices = {}
                for symbol in "ABC":
                    closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.012, 90)))
                    opens = closes * np.exp(rng.normal(0, 0.005, 90))
                    prices[symbol] = pd.DataFrame({"date": pd.bdate_range("2020-01-01", periods=90), "open": opens,
                                                   "high": np.maximum(opens, closes) * (1 + rng.uniform(0, 0.01, 90)),
                                                   "low": np.minimum(opens, closes) * (1 - rng.uniform(0, 0.01, 90)),
                                                   "close": closes})
                rows = pd.DataFrame({"symbol": list("ABC"), "date": pd.Timestamp("2020-01-01"), "usable": True,
                                     "atr_pct": 0.02, "is_momentum": [True, False, False],
                                     "is_breakout": [True, True, False], "is_pullback": [False, False, True]})
                ideas = labels.label_ideas(rules.find_ideas(rows), prices)
                market = FakeMarket(prices)
                broker = PaperBroker(market, Path(tmp) / f"{path}.db")
                broker.set_clock("2020-01-01")
                for idea in ideas.itertuples():          # as the API sends it: cleaned, no target is None
                    broker.place_order(idea.symbol, 1, clean({"target_pct": idea.target, "stop_pct": idea.stop,
                                                              "hold_days": idea.hold_days}))
                broker.set_clock(market.latest)
                closed = {t["symbol"]: t for t in broker.state()["closed"]}
                for idea in ideas.itertuples():
                    trade = closed[idea.symbol]
                    self.assertEqual((trade["exit_date"], trade["exit_reason"]),
                                     (idea.exit_date.strftime("%Y-%m-%d"), idea.outcome))
                    self.assertAlmostEqual(trade["exit_price"], idea.exit_price)
                    self.assertEqual(trade["days_held"], idea.days_held)
                    seen.add((idea.exit_rule, idea.outcome, idea.days_held if idea.outcome == "time" else None))
        self.assertTrue({("momentum", "time", 40), ("breakout", "time", 60), ("pullback", "time", 5),
                         ("pullback", "target", None), ("momentum", "stop", None)} <= seen, seen)
        self.assertNotIn("target", {outcome for rule, outcome, _ in seen if rule != "pullback"})


class Rules(unittest.TestCase):
    @mock.patch.object(config, "RULE_EXITS", None)          # the global barriers; per-rule exits are tested above
    def test_find_ideas_sets_barriers_from_volatility(self):
        rows = pd.DataFrame({"symbol": ["A", "B"], "usable": [True, True], "atr_pct": [0.02, 0.02],
                             "is_momentum": [True, False], "is_breakout": [False, False], "is_pullback": [True, False]})
        ideas = rules.find_ideas(rows)
        self.assertEqual(list(ideas["symbol"]), ["A"])
        self.assertEqual(ideas["rules"].iloc[0], ["momentum", "pullback"])
        self.assertAlmostEqual(ideas["target"].iloc[0], config.TARGET_ATR * 0.02)
        self.assertAlmostEqual(ideas["stop"].iloc[0], config.STOP_ATR * 0.02)


class Score(unittest.TestCase):
    def test_score_is_between_0_and_10(self):
        rng = np.random.default_rng(2)
        n = 500
        panel = pd.DataFrame({"dist_sma200": rng.normal(0, 0.3, n), "momentum_rank": rng.uniform(size=n),
                              "ret_126_rank": rng.uniform(size=n), "ret_126": rng.normal(0, 0.3, n),
                              "nifty_ret_126": rng.normal(0, 0.1, n), "dist_52w_high": -rng.uniform(0, 0.6, n),
                              "volume_20_126": rng.uniform(0, 4, n)})
        scored = score.add_scores(panel)
        self.assertTrue(scored["score"].between(0, 10).all())

    def test_bands(self):
        self.assertEqual(score.band(3.9), "bearish")
        self.assertEqual(score.band(4.0), "neutral")
        self.assertEqual(score.band(7.0), "bullish")

    def test_trend_events_need_7_to_start_and_under_5_to_end(self):
        history = pd.DataFrame({"date": pd.bdate_range("2024-01-01", periods=6), "score": [6.0, 7.2, 6.0, 5.1, 4.9, 7.5]})
        events = score.trend_events(history)
        self.assertEqual([e["event"] for e in events], ["start", "end", "start"])


class Charges(unittest.TestCase):
    def test_delivery_charges_on_a_one_lakh_trade(self):
        from backend.charges import account_charges, charges
        buy = charges("buy", 100_000, pd.Timestamp("2024-11-01"))
        self.assertAlmostEqual(buy["stt"], 100.0)                  # 0.1%
        self.assertAlmostEqual(buy["exchange"], 2.97)              # 0.00297% from 1 Oct 2024
        self.assertAlmostEqual(buy["stamp"], 15.0)                 # 0.015%, buyer only
        self.assertAlmostEqual(buy["gst"], 0.18 * (2.97 + 0.10))   # on the exchange charge and SEBI's fee
        self.assertEqual(charges("sell", 100_000, pd.Timestamp("2024-11-01"))["stamp"], 0.0)
        self.assertAlmostEqual(charges("buy", 100_000, pd.Timestamp("2023-06-01"))["exchange"], 3.25)
        with self.assertRaises(ValueError):
            charges("buy", 100_000, pd.Timestamp("2021-01-01"))
        paid = account_charges([(pd.Timestamp("2024-11-01"), "buy", 1.0), (pd.Timestamp("2024-11-20"), "sell", 1.0)], 100_000)
        itemised = sum(paid[k] for k in ("brokerage", "stt", "exchange", "sebi", "stamp", "gst"))
        self.assertAlmostEqual(paid["charged"], config.COST * 200_000)
        self.assertAlmostEqual(paid["allowance"], paid["charged"] - itemised, places=1)


class IndexFalls(unittest.TestCase):
    def test_falls_run_from_a_high_to_the_lowest_close_before_the_next_high(self):
        from backend.backtest import falls
        days = pd.bdate_range("2024-01-01", periods=9)
        index = pd.Series([100, 110, 99, 95, 105, 112, 108, 101, 104], index=days, dtype=float)
        found = falls(index, deeper_than=0.07)
        # 110 -> 95 (-13.6%) ends at the new high 112; 112 -> 101 (-9.8%) is still open when the data ends.
        self.assertEqual([(a, b) for a, b, _ in found], [(days[1], days[3]), (days[5], days[7])])
        self.assertAlmostEqual(found[0][2], 95 / 110 - 1)
        self.assertEqual(falls(index, deeper_than=0.2), [])


if __name__ == "__main__":
    unittest.main()
