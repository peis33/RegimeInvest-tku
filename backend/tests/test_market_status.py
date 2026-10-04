import unittest
from datetime import date, timedelta
from unittest.mock import patch

from app.market_status import (
    build_market_display,
    calculate_adx,
    classify_market_level,
)


def price_points(closes, start=date(2026, 1, 1)):
    return [
        {
            "date": (start + timedelta(days=index)).isoformat(),
            "high": close + 1,
            "low": close - 1,
            "close": close,
        }
        for index, close in enumerate(closes)
    ]


class AdxTests(unittest.TestCase):
    def test_wilder_seed_and_recursive_smoothing(self):
        # For period=2: seeded DX=0, next DX=200/3, first ADX=100/3.
        # The next bar has equal +DI/-DI (DX=0), so ADX becomes 50/3.
        points = price_points([10, 11, 10, 12, 11])
        self.assertAlmostEqual(calculate_adx(points[:4], period=2)["adx"], 100 / 3)
        indicators = calculate_adx(points, period=2)
        self.assertAlmostEqual(indicators["adx"], 50 / 3)
        self.assertAlmostEqual(indicators["plus_di"], 250 / 9)
        self.assertAlmostEqual(indicators["minus_di"], 250 / 9)

    def test_first_adx_requires_28_bars(self):
        points = price_points(range(100, 128))
        self.assertIsNone(calculate_adx(points[:-1]))
        self.assertAlmostEqual(calculate_adx(points)["adx"], 100)

    def test_flat_market_has_zero_strength(self):
        result = calculate_adx(price_points([100] * 40))
        self.assertEqual(result, {"adx": 0, "plus_di": 0, "minus_di": 0})

    def test_invalid_latest_bar_does_not_reuse_an_old_adx(self):
        for value in (None, float("nan"), float("inf"), 0):
            with self.subTest(value=value):
                points = price_points(range(100, 140))
                points[-1]["low"] = value
                self.assertIsNone(calculate_adx(points))


class MarketLevelTests(unittest.TestCase):
    def test_all_levels_and_threshold_boundaries(self):
        for regime in ("Bull", "Bear"):
            plus_di, minus_di = (30, 10) if regime == "Bull" else (10, 30)
            for adx, expected in (
                (0, "small"), (24.999, "small"), (25, "normal"),
                (39.999, "normal"), (40, "strong"), (100, "strong"),
            ):
                with self.subTest(regime=regime, adx=adx):
                    self.assertEqual(
                        classify_market_level(regime, {
                            "adx": adx, "plus_di": plus_di, "minus_di": minus_di,
                        }),
                        f"{expected}_{regime.lower()}",
                    )
        self.assertEqual(classify_market_level("Sideways", {"adx": 100}), "sideways")

    def test_conflicting_direction_is_not_promoted(self):
        self.assertEqual(classify_market_level("Bull", {
            "adx": 80, "plus_di": 10, "minus_di": 30,
        }), "small_bull")
        self.assertEqual(classify_market_level("Bear", {
            "adx": 80, "plus_di": 30, "minus_di": 10,
        }), "small_bear")

    def test_missing_strength_is_not_classified_as_small(self):
        self.assertIsNone(classify_market_level("Bull", None))
        self.assertIsNone(classify_market_level("Bear", None))


class MarketDisplayTests(unittest.TestCase):
    def test_prices_after_the_observed_date_are_excluded(self):
        points = price_points(range(100, 160))
        market = {"observed_regime": "Bull", "timing_as_of": points[39]["date"]}
        expected = build_market_display(market, points[:40])
        self.assertEqual(build_market_display(market, points), expected)
        self.assertEqual(expected["level"], "strong_bull")
        self.assertEqual(expected["label"], "大牛市")
        self.assertEqual(expected["as_of"], market["timing_as_of"])

    def test_unsorted_points_and_duplicates_do_not_double_count_days(self):
        points = price_points(range(100, 140))
        market = {"observed_regime": "Bull", "timing_as_of": points[-1]["date"]}
        self.assertEqual(
            build_market_display(market, list(reversed(points)) + points),
            build_market_display(market, points),
        )

    def test_missing_as_of_price_or_date_leaves_strength_unknown(self):
        points = price_points(range(100, 140))
        for as_of in ("", "invalid", "2026-03-01"):
            with self.subTest(as_of=as_of):
                result = build_market_display({
                    "observed_regime": "Bull", "timing_as_of": as_of,
                }, points)
                self.assertIsNone(result["level"])
                self.assertIsNone(result["adx"])
                self.assertEqual(result["label"], "牛市")

    def test_forecast_cannot_replace_observed_regime(self):
        points = price_points(range(140, 100, -1))
        market = {
            "observed_regime": "Bear", "timing_as_of": points[-1]["date"],
            "predicted_regime": "Bull", "prob_Bull": 0.99,
        }
        self.assertEqual(build_market_display(market, points)["level"], "strong_bear")
        del market["observed_regime"]
        self.assertIsNone(build_market_display(market, points)["level"])

    def test_display_labels_cover_all_seven_states(self):
        points = price_points(range(100, 140))
        for regime in ("Bull", "Bear", "Sideways"):
            for adx, prefix in ((20, "小"), (30, "普通"), (45, "大")):
                with self.subTest(regime=regime, adx=adx):
                    with patch("app.market_status.calculate_adx", return_value={
                        "adx": adx,
                        "plus_di": 30 if regime == "Bull" else 10,
                        "minus_di": 10 if regime == "Bull" else 30,
                    }):
                        result = build_market_display({
                            "observed_regime": regime, "timing_as_of": points[-1]["date"],
                        }, points)
                    label = "盤整" if regime == "Sideways" else prefix + ("牛市" if regime == "Bull" else "熊市")
                    self.assertEqual(result["label"], label)


if __name__ == "__main__":
    unittest.main()
