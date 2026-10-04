import unittest
from datetime import date, timedelta
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

# Import the API without opening the notification database or starting workers.
with patch("app.price_alerts.install_alerts"):
    from app import main


def raw_quotes():
    rows = []
    for symbol, name, initial_price in (
        ("Y9999", "加權指數", 10000),
        ("2330", "台積電", 200),
    ):
        for index in range(40):
            close = initial_price + index
            row = dict.fromkeys(main.INTERFACE_CHART_REQUIRED_COLUMNS, "0")
            row.update({
                "證券代碼": f"{symbol} {name}",
                "年月日": (date(2026, 8, 10) + timedelta(days=index)).isoformat(),
                "TSE 產業別": "24",
                "上市別": "TSE",
                "開盤價(元)": str(close),
                "最高價(元)": str(close + 1),
                "最低價(元)": str(close - 1),
                "收盤價(元)": f"{close:,}",
                "股價漲跌(元)": "1",
                "成交量(千股)": "1,234",
                "成交值(千元)": "5,678",
            })
            rows.append(row)
    return pd.DataFrame(rows)


class SharedMarketSourceTests(unittest.TestCase):
    def setUp(self):
        self.raw = raw_quotes()
        self.market = {"observed_regime": "Bull", "timing_as_of": "2026-09-18"}
        self.cache_patch = patch.object(main, "_interface_chart_frame_cache", None)
        self.signature_patch = patch.object(main, "csv_file_signature", return_value=(1, 1))
        self.reader_patch = patch.object(main.pd, "read_csv", return_value=self.raw)
        self.cache_patch.start()
        self.signature = self.signature_patch.start()
        self.reader = self.reader_patch.start()
        self.addCleanup(self.cache_patch.stop)
        self.addCleanup(self.signature_patch.stop)
        self.addCleanup(self.reader_patch.stop)
        # Do not enter the lifespan: these GET requests must not launch workers.
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def test_home_and_index_detail_have_identical_quotes(self):
        snapshot = main.latest_market_snapshot()
        response = self.client.get("/api/stocks/Y9999/detail")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(snapshot, response.json()["data"])
        self.assertEqual(snapshot["source"], "介面圖表全部資料.csv")
        self.assertEqual(snapshot["date"], "2026-09-18")
        self.assertEqual(snapshot["close"], 10039)

    def test_index_and_stock_details_use_the_same_file(self):
        for symbol, expected_close in (("Y9999", 10039), ("2330", 239)):
            with self.subTest(symbol=symbol):
                response = self.client.get(f"/api/stocks/{symbol}/detail")
                self.assertEqual(response.status_code, 200)
                detail = response.json()["data"]
                self.assertEqual(detail["source"], main.INTERFACE_CHART_FILE.name)
                self.assertEqual(detail["date"], "2026-09-18")
                self.assertEqual(detail["close"], expected_close)
                self.assertEqual(detail["volume"], 1234)

    def test_index_and_stock_charts_match_their_detail(self):
        for symbol in ("Y9999", "2330"):
            with self.subTest(symbol=symbol):
                detail = self.client.get(f"/api/stocks/{symbol}/detail").json()["data"]
                response = self.client.get(f"/api/stocks/{symbol}/charts")
                self.assertEqual(response.status_code, 200)
                charts = response.json()["data"]
                self.assertEqual(charts["source"], detail["source"])
                self.assertEqual(charts["lookback"], 40)
                self.assertEqual(charts["points"][-1]["date"], detail["date"])
                for field in ("open", "high", "low", "close", "change", "volume"):
                    self.assertEqual(charts["points"][-1][field], detail[field])

    def test_all_consumers_share_one_cached_read(self):
        main.latest_market_snapshot()
        main.latest_stock_detail("Y9999")
        main.latest_stock_detail("2330")
        main.latest_stock_charts("Y9999")
        main.latest_stock_charts("2330")
        display = main.latest_market_display(self.market)
        self.reader.assert_called_once_with(
            main.INTERFACE_CHART_FILE,
            encoding=main.INTERFACE_CHART_ENCODING,
            dtype={"證券代碼": str},
            thousands=",",
        )
        self.assertEqual(display["level"], "strong_bull")
        self.assertEqual(display["as_of"], "2026-09-18")

    def test_strength_ignores_stock_rows_and_future_index_prices(self):
        expected = main.latest_market_display(self.market)
        future = self.raw.iloc[39].copy()
        future["年月日"] = "2026-09-19"
        future["最高價(元)"] = "102"
        future["最低價(元)"] = "98"
        future["收盤價(元)"] = "100"
        self.reader.return_value = pd.concat(
            [self.raw, pd.DataFrame([future])], ignore_index=True,
        )
        self.signature.return_value = (2, 1)
        self.assertEqual(main.latest_market_display(self.market), expected)
        self.assertAlmostEqual(expected["adx"], 100)

    def test_updated_file_invalidates_the_shared_cache(self):
        main.latest_market_snapshot()
        self.assertEqual(self.reader.call_count, 1)
        self.reader.return_value = self.raw.assign(**{"收盤價(元)": "10,040"})
        self.signature.return_value = (2, 1)
        self.assertEqual(main.latest_market_snapshot()["close"], 10040)
        self.assertEqual(self.reader.call_count, 2)
        main.latest_stock_detail("2330")
        self.assertEqual(self.reader.call_count, 2)

    def test_missing_file_preserves_home_fallback_and_api_errors(self):
        self.signature.side_effect = FileNotFoundError("missing shared quotes")
        self.assertIsNone(main.latest_market_snapshot())
        self.assertIsNone(main.latest_market_display(self.market)["level"])
        for symbol in ("Y9999", "2330"):
            for endpoint in ("detail", "charts"):
                with self.subTest(symbol=symbol, endpoint=endpoint):
                    response = self.client.get(f"/api/stocks/{symbol}/{endpoint}")
                    self.assertEqual(response.status_code, 404)

    def test_invalid_shared_columns_preserve_safe_fallback(self):
        self.reader.return_value = self.raw.drop(columns=["最高價(元)"])
        self.assertIsNone(main.latest_market_snapshot())
        self.assertIsNone(main.latest_market_display(self.market)["level"])
        for symbol in ("Y9999", "2330"):
            response = self.client.get(f"/api/stocks/{symbol}/detail")
            self.assertEqual(response.status_code, 500)
            self.assertIn("介面圖表全部資料.csv", response.json()["detail"])

    def test_model_input_sources_remain_separate(self):
        with patch.dict(main.os.environ, {
            "MODEL1_DATA_SOURCE": "csv",
            "HISTORY_CSV_PATH": "加權指數2014-2025.csv",
            "MODEL1_2026_CSV": "加權指數2026.csv",
        }):
            self.assertEqual(
                [path.name for path in main.model1_csv_source_files()],
                ["加權指數2014-2025.csv", "加權指數2026.csv"],
            )


if __name__ == "__main__":
    unittest.main()
