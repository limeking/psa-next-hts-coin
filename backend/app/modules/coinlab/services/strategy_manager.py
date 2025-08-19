# [단일/다중 전략 불러오기, 실행, 등록 등 전략 관리 함수 자리]
# backend/services/strategy_manager.py (기존 파일 하단에 추가)
import pandas as pd

def _sma(s, n=20):
    return s.rolling(n, min_periods=n).mean()

def _rsi(close: pd.Series, n=14):
    delta = close.diff()
    up = delta.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    down = (-delta).clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    rs = up / down.replace(0, 1e-12)
    return 100 - (100/(1+rs))

def resolve_signals_for_combo(df: pd.DataFrame, combo_name: str):
    """
    combo_name(조합명)을 간단히 두 가지로 매핑:
    - "MA20_breakout": 종가가 SMA20 상향돌파 → 진입, 하향돌파 → 반대신호
    - "RSI_30_70": RSI 30 상향돌파 → 진입, RSI 70 하향돌파 → 반대신호
    """
    close = df["close"]
    if not isinstance(combo_name, str):
        combo_name = ""

    if combo_name == "RSI_30_70":
        rsi = _rsi(close, 14)
        entry = ((rsi > 30) & (rsi.shift(1) <= 30)).astype(int)
        exit_opp = ((rsi < 70) & (rsi.shift(1) >= 70)).astype(int)
        return entry, exit_opp

    # default: MA20
    ma = _sma(close, 20)
    entry = ((close > ma) & (close.shift(1) <= ma.shift(1))).astype(int)
    exit_opp = ((close < ma) & (close.shift(1) >= ma.shift(1))).astype(int)
    return entry, exit_opp
