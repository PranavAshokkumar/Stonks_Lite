"""API tests: every endpoint answers, and a replayed paper trade fills and closes. They need the trained
artifacts (python -m backend.pipeline) and take a few seconds to load the data."""

import os
import tempfile
import unittest

from backend import config

HAVE_MODEL = (config.ARTIFACTS_DIR / "model.joblib").exists()


@unittest.skipUnless(HAVE_MODEL, "run `python -m backend.pipeline` first")
class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.app import create_app

        cls.db = tempfile.mktemp(suffix=".db")
        cls.client = create_app(db_path=cls.db).test_client()

    @classmethod
    def tearDownClass(cls):
        os.remove(cls.db)

    def test_read_endpoints(self):
        for path in ("/api/status", "/api/ideas", "/api/stocks", "/api/stocks/TCS", "/api/model", "/api/backtest", "/api/portfolio"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)
        self.assertEqual(self.client.get("/api/stocks/NOPE").status_code, 404)

    def test_no_future_data_in_a_replay(self):
        self.client.post("/api/clock", json={"date": "2023-06-01"})
        detail = self.client.get("/api/stocks/INFY").get_json()
        self.assertLessEqual(detail["series"][-1]["date"], "2023-06-01")
        self.assertTrue(all(i["outcome"] == "running" or i["exit_date"] <= "2023-06-01" for i in detail["past_ideas"]))

    def test_a_paper_trade_fills_at_the_next_open_and_closes(self):
        self.client.post("/api/portfolio/reset")
        self.client.post("/api/clock", json={"date": "2024-03-01"})
        made = self.client.post("/api/portfolio/orders", json={"symbol": "INFY", "qty": 10})
        self.assertEqual(made.status_code, 201)
        self.client.post("/api/clock", json={"step": 1})
        position = self.client.get("/api/portfolio").get_json()["positions"][0]
        self.assertEqual(position["status"], "open")
        self.assertGreater(position["entry_date"], "2024-03-01")
        self.client.post("/api/clock", json={"step": config.HOLD_DAYS + 2})
        state = self.client.get("/api/portfolio").get_json()
        self.assertEqual(state["positions"], [])
        self.assertIn(state["closed"][0]["exit_reason"], ("target", "stop", "time"))

    def test_bad_orders_are_refused(self):
        self.client.post("/api/clock", json={"date": "2024-03-01"})
        self.assertEqual(self.client.post("/api/portfolio/orders", json={"symbol": "TCS", "qty": 10_000_000}).status_code, 400)
        self.assertEqual(self.client.post("/api/portfolio/orders", json={"symbol": "TCS", "qty": 0}).status_code, 400)

    def test_the_waitlist_takes_an_email_once_and_refuses_junk(self):
        import sqlite3

        join = lambda **body: self.client.post("/api/waitlist", json=body).status_code
        self.assertEqual(join(email="Asha@Example.in ", platform="mac", source="search"), 201)
        self.assertEqual(join(email="asha@example.in", platform="both", source="dock"), 201)
        self.assertEqual(join(email="not-an-email", platform="mac"), 400)
        self.assertEqual(join(email="asha@example.in", platform="windows"), 400)
        with sqlite3.connect(self.db) as db:
            rows = db.execute("SELECT email, platform, source FROM waitlist").fetchall()
        self.assertEqual(rows, [("asha@example.in", "both", "search")])
        self.client.post("/api/portfolio/reset")
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM waitlist").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
