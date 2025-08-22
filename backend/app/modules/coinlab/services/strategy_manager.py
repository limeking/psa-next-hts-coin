# backend/services/strategy_manager.py
import pandas as pd
import numpy as np
# === [ADD] 공통 유틸 ===
from dataclasses import dataclass
from typing import Callable, Dict, Any, Optional, Tuple

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

def _to_bool_int(sr: pd.Series) -> pd.Series:
    return sr.fillna(False).astype(int)

def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()

def _vol_series(df: pd.DataFrame) -> pd.Series:
    return pd.to_numeric(df.get("volume"), errors="coerce")

def _apply_optional_filters(entry_bool: pd.Series, df: pd.DataFrame, params: Dict[str, Any]) -> pd.Series:
    """전략 엔트리에 공통 거래량 기반 필터를 적용"""
    vol = _vol_series(df)
    out = entry_bool.copy()

    # 1) 절대 거래량 최소값
    if "min_volume" in params:
        out = out & (vol >= float(params["min_volume"]))

    # 2) 거래량 이동평균 배수 필터 (예: vol >= k * SMA(vol, n))
    if "volume_sma_n" in params and "volume_sma_mult" in params:
        n = int(params["volume_sma_n"]); k = float(params["volume_sma_mult"])
        vma = vol.rolling(n, min_periods=n).mean()
        out = out & (vol >= (vma * k))

    # 3) 거래량 증감률 필터 (전봉 대비 %)
    if "min_volume_change_pct" in params:
        chg = (vol / vol.shift(1) - 1.0) * 100.0
        out = out & (chg >= float(params["min_volume_change_pct"]))

    return out

# === [ADD] 전략 함수들 ===
def _strat_ma_cross(df: pd.DataFrame, p: Dict[str, Any]) -> Tuple[pd.Series, Optional[pd.Series]]:
    """이동평균선 골든/데드 크로스"""
    close = pd.to_numeric(df["close"], errors="coerce")
    fast = int(p.get("fast", 5))
    slow = int(p.get("slow", 20))
    direction = str(p.get("direction", "up")).lower()  # "up"|"golden"|"down"|"dead"

    ma_f = close.rolling(fast, min_periods=fast).mean()
    ma_s = close.rolling(slow, min_periods=slow).mean()

    up   = (ma_f > ma_s) & (ma_f.shift(1) <= ma_s.shift(1))
    down = (ma_f < ma_s) & (ma_f.shift(1) >= ma_s.shift(1))

    if direction in ("down", "dead"):
        entry = down
        opp   = up
    else:
        entry = up
        opp   = down

    return _to_bool_int(entry), _to_bool_int(opp)

def _strat_rsi_bands(df: pd.DataFrame, p: Dict[str, Any]) -> Tuple[pd.Series, Optional[pd.Series]]:
    """RSI 30/70 밴드 크로스"""
    close = pd.to_numeric(df["close"], errors="coerce")
    n    = int(p.get("length", 14))
    low  = float(p.get("low", 30))
    high = float(p.get("high", 70))
    rsi  = _rsi(close, n)

    entry = (rsi > low) & (rsi.shift(1) <= low)     # 저밴드 상향 돌파
    opp   = (rsi < high) & (rsi.shift(1) >= high)   # 고밴드 하향 돌파
    return _to_bool_int(entry), _to_bool_int(opp)

def _strat_macd_cross(df: pd.DataFrame, p: Dict[str, Any]) -> Tuple[pd.Series, Optional[pd.Series]]:
    """MACD 라인-시그널 크로스"""
    close  = pd.to_numeric(df["close"], errors="coerce")
    fast   = int(p.get("fast", 12))
    slow   = int(p.get("slow", 26))
    signal = int(p.get("signal", 9))

    ema_fast = _ema(close, fast)
    ema_slow = _ema(close, slow)
    macd     = ema_fast - ema_slow
    sig      = _ema(macd, signal)

    up   = (macd > sig) & (macd.shift(1) <= sig.shift(1))
    down = (macd < sig) & (macd.shift(1) >= sig.shift(1))
    return _to_bool_int(up), _to_bool_int(down)

def _strat_ma_breakout(df: pd.DataFrame, p: Dict[str, Any]) -> Tuple[pd.Series, Optional[pd.Series]]:
    """MA n선 돌파 (디폴트 대체전략: MA20 돌파/이탈)"""
    close = pd.to_numeric(df["close"], errors="coerce")
    n = int(p.get("length", 20))
    ma = close.rolling(n, min_periods=n).mean()
    up   = (close > ma) & (close.shift(1) <= ma.shift(1))
    down = (close < ma) & (close.shift(1) >= ma.shift(1))
    return _to_bool_int(up), _to_bool_int(down)

def _strat_volume_spike(df: pd.DataFrame, p: Dict[str, Any]) -> Tuple[pd.Series, Optional[pd.Series]]:
    """거래량 스파이크 (vol >= k * SMA(vol, n))"""
    vol = _vol_series(df)
    n   = int(p.get("n", 20))
    k   = float(p.get("mult", 2.0))
    vma = vol.rolling(n, min_periods=n).mean()
    entry = vol >= (vma * k)
    # 반대 신호는 보통 사용하지 않음(필요시 v < vma)
    opp   = vol < vma
    return _to_bool_int(entry), _to_bool_int(opp)

# === [ADD] 전략 스펙/레지스트리 ===
@dataclass
class StrategySpec:
    code: str
    func: Callable[[pd.DataFrame, Dict[str, Any]], Tuple[pd.Series, Optional[pd.Series]]]
    defaults: Dict[str, Any]
    desc: str = ""

STRATEGY_REGISTRY: Dict[str, StrategySpec] = {
    "MA_CROSS": StrategySpec(
        code="MA_CROSS",
        func=_strat_ma_cross,
        defaults={"fast": 5, "slow": 20, "direction": "up"},
        desc="이평선 골든/데드 크로스"
    ),
    "RSI_BANDS": StrategySpec(
        code="RSI_BANDS",
        func=_strat_rsi_bands,
        defaults={"length": 14, "low": 30, "high": 70},
        desc="RSI 밴드(30/70) 크로스"
    ),
    "MACD_CROSS": StrategySpec(
        code="MACD_CROSS",
        func=_strat_macd_cross,
        defaults={"fast": 12, "slow": 26, "signal": 9},
        desc="MACD 라인-시그널 크로스"
    ),
    "MA_BREAKOUT": StrategySpec(
        code="MA_BREAKOUT",
        func=_strat_ma_breakout,
        defaults={"length": 20},
        desc="MA n선 돌파/이탈"
    ),
    "VOLUME_SPIKE": StrategySpec(
        code="VOLUME_SPIKE",
        func=_strat_volume_spike,
        defaults={"n": 20, "mult": 2.0},
        desc="거래량 스파이크"
    ),
}

# 과거 코드 호환용 별칭 (프론트/저장된 콤보와의 호환)
ALIASES: Dict[str, Tuple[str, Dict[str, Any]]] = {
    "MA5_20_cross": ("MA_CROSS", {"fast": 5, "slow": 20, "direction": "up"}),
    "RSI_30_70":   ("RSI_BANDS", {"length": 14, "low": 30, "high": 70}),
    "MA20_breakout": ("MA_BREAKOUT", {"length": 20}),
}

def list_strategies() -> Dict[str, Dict[str, Any]]:
    """프론트에 노출 가능한 전략 메타(기본값/설명)"""
    return {k: {"defaults": v.defaults, "desc": v.desc} for k, v in STRATEGY_REGISTRY.items()}

# === [REPLACE] 기존 resolve_signals_for_combo → 파라미터 지원 버전 ===
def resolve_signals_for_combo(df: pd.DataFrame, combo_name: str, params: Optional[Dict[str, Any]] = None):
    """
    반환: (entry_series[int 0/1], opp_exit_series[int 0/1] | None)
    - params에 거래량 필터(min_volume, volume_sma_n+volume_sma_mult, min_volume_change_pct) 등 전달 가능
    """
    # 1) 패턴류(컵핸들 등)를 먼저 체크 (기존 함수 재사용)
    e, x = _pattern_entry(df, combo_name)
    if e is not None:
        entry_bool = e.astype(bool) if e.dtype != bool else e
        entry_bool = _apply_optional_filters(entry_bool, df, params or {})
        return _to_bool_int(entry_bool), (_to_bool_int(x) if x is not None else None)

    # 2) 별칭 → 정규 전략 코드로 변환
    code = str(combo_name or "")
    base_params: Dict[str, Any] = {}
    if code in ALIASES:
        code, base_params = ALIASES[code]

    # 3) 정규 전략 레지스트리 조회
    spec = STRATEGY_REGISTRY.get(code)
    if not spec:
        # 미지정/미지원 코드는 MA_BREAKOUT(20)로 폴백
        spec = STRATEGY_REGISTRY["MA_BREAKOUT"]

    # 4) 파라미터 병합(기본값 ← 별칭기본 ← 호출파라미터)
    merged = {**spec.defaults, **base_params, **(params or {})}

    # 5) 전략 실행
    entry, opp = spec.func(df, merged)

    # 6) 공통 거래량 필터 적용
    entry_bool = entry.astype(bool)
    entry_bool = _apply_optional_filters(entry_bool, df, merged)

    return _to_bool_int(entry_bool), (opp if opp is None else _to_bool_int(opp))
