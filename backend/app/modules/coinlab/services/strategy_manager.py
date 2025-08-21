# backend/services/strategy_manager.py
import pandas as pd
import numpy as np

def _sma(s: pd.Series, n=20):
    return s.rolling(n, min_periods=n).mean()

def _rsi(close: pd.Series, n=14):
    delta = close.diff()
    up = delta.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    down = (-delta).clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    rs = up / down.replace(0, 1e-12)
    return 100 - (100/(1+rs))

def _linreg_slope(y: pd.Series, n: int = 20) -> pd.Series:
    x = np.arange(n)
    def slope(win):
        if win.isna().any(): return np.nan
        return np.polyfit(x, win.values, 1)[0]
    return y.rolling(n, min_periods=n).apply(lambda w: slope(w), raw=False)

# ---- 패턴들 ----
def _detect_pullback_breakout_core(df: pd.DataFrame,
                                   ma=20, lookback_swing=20,
                                   pullback_pct_min=0.02, pullback_pct_max=0.08,
                                   vol_ma=20, vol_ratio_min=1.2,
                                   confirm_on="close") -> pd.Series:
    close = pd.to_numeric(df["close"], errors="coerce")
    high  = pd.to_numeric(df["high"],  errors="coerce")
    low   = pd.to_numeric(df["low"],   errors="coerce")
    vol   = pd.to_numeric(df.get("volume", pd.Series(index=df.index, dtype=float)), errors="coerce")
    swing_high = high.rolling(lookback_swing, min_periods=lookback_swing).max()
    pullback_depth = (swing_high - low) / swing_high.replace(0, np.nan)
    pulled = pullback_depth.between(pullback_pct_min, pullback_pct_max)
    vol_ok = vol > (vol.rolling(vol_ma, min_periods=1).mean() * vol_ratio_min)
    ref = close if confirm_on == "close" else high
    breakout = ref > swing_high.shift(1)
    recent_pulled = pulled.rolling(lookback_swing, min_periods=1).max() > 0
    entry = (recent_pulled & breakout & vol_ok).astype(int)
    return entry

def _detect_cup_handle_core(df: pd.DataFrame,
                            cup_min_len=30, cup_max_len=180,
                            cup_depth_min=0.15, cup_depth_max=0.35,
                            handle_max_frac=0.33, handle_max_len=20,
                            rim_tol=0.04) -> pd.Series:
    close = pd.to_numeric(df["close"], errors="coerce")
    high  = pd.to_numeric(df["high"],  errors="coerce")
    low   = pd.to_numeric(df["low"],   errors="coerce")

    N = min(len(df), max(cup_min_len*3, 240))
    c = close.tail(N)
    h = high.tail(N); l = low.tail(N)

    trough_idx = l.idxmin()
    left_window  = c.iloc[: max(cup_min_len//3, 10)]
    right_window = c.iloc[-max(cup_min_len//3, 10):]
    left_rim  = left_window.max()
    right_rim = right_window.max()
    rim_ok = abs(left_rim - right_rim) / max(left_rim, right_rim) <= rim_tol

    cup_depth = (max(left_rim, right_rim) - c.loc[trough_idx]) / max(left_rim, right_rim)
    depth_ok = (cup_depth >= cup_depth_min) and (cup_depth <= cup_depth_max)

    handle_zone = c.tail(min(handle_max_len, len(c)))
    handle_drawdown = (right_rim - handle_zone.min()) / right_rim if right_rim else 0.0
    handle_ok = handle_drawdown <= (cup_depth * handle_max_frac)

    breakout = (close > right_rim) & (close.shift(1) <= right_rim)
    entry = (rim_ok and depth_ok and handle_ok) & breakout
    return entry.astype(int)

def _detect_lower_highs_reversal_core(df: pd.DataFrame, reg_lookback=20, ma=20) -> pd.Series:
    close = pd.to_numeric(df["close"], errors="coerce")
    high  = pd.to_numeric(df["high"],  errors="coerce")
    roll = high.rolling(5, min_periods=5).max()
    peaks = roll[(roll == roll.rolling(3, center=True).max())].dropna().tail(3).values
    lh_ok = len(peaks) == 3 and (peaks[0] > peaks[1] > peaks[2])
    slope = _linreg_slope(close, n=reg_lookback)
    downtrend = slope < 0
    ma20 = _sma(close, ma)
    cross_up = (close > ma20) & (close.shift(1) <= ma20.shift(1))
    entry = (downtrend & cross_up)
    if lh_ok:
        entry = entry | cross_up
    return entry.astype(int)

def _pattern_entry(df: pd.DataFrame, name: str):
    name = (name or "").lower()
    if name in ("pattern_pullback_breakout", "pullback_breakout"):
        return _detect_pullback_breakout_core(df), None
    if name in ("pattern_cup_handle", "cup_handle"):
        return _detect_cup_handle_core(df), None
    if name in ("pattern_lh_reversal", "lower_highs_reversal"):
        return _detect_lower_highs_reversal_core(df), None
    return None, None

def resolve_signals_for_combo(df: pd.DataFrame, combo_name: str):
    e, x = _pattern_entry(df, combo_name)
    if e is not None:
        return e, x
    close = df["close"]
    name = str(combo_name or "")
    if name == "RSI_30_70":
        rsi = _rsi(close, 14)
        entry = ((rsi > 30) & (rsi.shift(1) <= 30)).astype(int)
        exit_opp = ((rsi < 70) & (rsi.shift(1) >= 70)).astype(int)
        return entry, exit_opp
    if name == "MA5_20_cross":
        ma5 = _sma(close, 5)
        ma20 = _sma(close, 20)
        entry = ((ma5 > ma20) & (ma5.shift(1) <= ma20.shift(1))).astype(int)
        exit_opp = ((ma5 < ma20) & (ma5.shift(1) >= ma20.shift(1))).astype(int)
        return entry, exit_opp
    ma = _sma(close, 20)  # default: MA20_breakout
    entry = ((close > ma) & (close.shift(1) <= ma.shift(1))).astype(int)
    exit_opp = ((close < ma) & (close.shift(1) >= ma.shift(1))).astype(int)
    return entry, exit_opp
