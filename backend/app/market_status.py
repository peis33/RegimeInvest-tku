"""App display levels derived from the observed regime and causal ADX(14)."""

import math
from datetime import date


ADX_PERIOD = 14
NORMAL_ADX = 25.0
STRONG_ADX = 40.0
REGIME_LABELS = {"Bull": "牛市", "Bear": "熊市", "Sideways": "盤整"}


def calculate_adx(points, period=ADX_PERIOD):
    """Return the latest Wilder-smoothed ADX and directional indicators.

    The first ADX needs `period` movements plus `period` DX values, hence
    at least 2 * period price bars. Missing/invalid bars reset the warm-up.
    """
    if period < 2:
        raise ValueError("ADX period must be at least 2")

    bars = []
    for point in points:
        try:
            high, low, close = (float(point[key]) for key in ("high", "low", "close"))
        except (KeyError, TypeError, ValueError):
            bars = []
            continue
        if (
            not all(math.isfinite(value) for value in (high, low, close))
            or not 0 < low <= close <= high
        ):
            bars = []
            continue
        bars.append((high, low, close))

    if len(bars) < 2 * period:
        return None

    movements = []
    for previous, current in zip(bars, bars[1:]):
        high, low, _ = current
        previous_high, previous_low, previous_close = previous
        up = high - previous_high
        down = previous_low - low
        movements.append((
            max(high - low, abs(high - previous_close), abs(low - previous_close)),
            up if up > 0 and up > down else 0.0,
            down if down > 0 and down > up else 0.0,
        ))

    smoothed = [sum(movement[i] for movement in movements[:period]) for i in range(3)]
    dx_values = []
    adx = None
    plus_di = minus_di = 0.0
    for index in range(period - 1, len(movements)):
        if index >= period:
            smoothed = [
                value - value / period + movement
                for value, movement in zip(smoothed, movements[index])
            ]
        true_range, plus_dm, minus_dm = smoothed
        plus_di = 100 * plus_dm / true_range if true_range else 0.0
        minus_di = 100 * minus_dm / true_range if true_range else 0.0
        total_di = plus_di + minus_di
        dx = 100 * abs(plus_di - minus_di) / total_di if total_di else 0.0
        if adx is None:
            dx_values.append(dx)
            if len(dx_values) == period:
                adx = sum(dx_values) / period
        else:
            adx = (adx * (period - 1) + dx) / period

    return {"adx": adx, "plus_di": plus_di, "minus_di": minus_di}


def classify_market_level(regime, indicators):
    if regime == "Sideways":
        return "sideways"
    if regime not in ("Bull", "Bear") or indicators is None:
        return None

    direction_matches = (
        indicators["plus_di"] > indicators["minus_di"]
        if regime == "Bull"
        else indicators["minus_di"] > indicators["plus_di"]
    )
    adx = indicators["adx"]
    strength = (
        "strong" if direction_matches and adx >= STRONG_ADX
        else "normal" if direction_matches and adx >= NORMAL_ADX
        else "small"
    )
    return f"{strength}_{regime.lower()}"


def build_market_display(market, points=()):
    """Use only prices on/before the observed HMM state's trading date.

    Forecast probabilities are deliberately not inputs to strength grading.
    With unavailable observations/prices, keep the base label and no level.
    """
    regime = market.get("observed_regime")
    regime = regime if regime in REGIME_LABELS else None
    result = {
        "regime": regime,
        "level": "sideways" if regime == "Sideways" else None,
        "label": REGIME_LABELS.get(regime),
        "adx": None,
        "plus_di": None,
        "minus_di": None,
        "as_of": None,
        "direction_matches": None,
    }
    if regime is None:
        return result

    try:
        as_of = date.fromisoformat(str(market.get("timing_as_of", "")))
    except ValueError:
        return result

    dated_points = {}
    for point in points:
        try:
            point_date = date.fromisoformat(str(point.get("date", "")))
        except ValueError:
            continue
        if point_date <= as_of:
            dated_points[point_date] = point
    if not dated_points or max(dated_points) != as_of:
        return result

    indicators = calculate_adx([dated_points[day] for day in sorted(dated_points)])
    if indicators is None:
        return result

    level = classify_market_level(regime, indicators)
    if regime in ("Bull", "Bear"):
        prefix = {"strong": "大", "normal": "普通", "small": "小"}[level.split("_")[0]]
        result["label"] = prefix + REGIME_LABELS[regime]
        result["direction_matches"] = (
            indicators["plus_di"] > indicators["minus_di"]
            if regime == "Bull"
            else indicators["minus_di"] > indicators["plus_di"]
        )
    result.update(indicators, level=level, as_of=as_of.isoformat())
    return result
