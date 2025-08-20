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
    combo_name(조합명) 매핑:
    - "MA5_20_cross": MA5↗MA20 골든크로스 진입 / MA5↘MA20 데드크로스 반대신호
    - "MA20_breakout": 종가가 SMA20 상향돌파 → 진입, 하향돌파 → 반대신호 (기존)
    - "RSI_30_70": RSI 30 상향돌파 → 진입, RSI 70 하향돌파 → 반대신호 (기존)
    """
    close = df["close"]
    name = str(combo_name or "")   # ← 밑줄 경고 피하려면 이렇게 새 변수에 담아 사용

    if name == "RSI_30_70":
        rsi = _rsi(close, 14)
        entry = ((rsi > 30) & (rsi.shift(1) <= 30)).astype(int)
        exit_opp = ((rsi < 70) & (rsi.shift(1) >= 70)).astype(int)
        return entry, exit_opp

    if name == "MA5_20_cross":     # ✅ 새로 추가
        ma5 = _sma(close, 5)
        ma20 = _sma(close, 20)
        # 골든크로스(오늘 위 / 어제 아래 또는 같음)
        entry = ((ma5 > ma20) & (ma5.shift(1) <= ma20.shift(1))).astype(int)
        # 데드크로스(오늘 아래 / 어제 위 또는 같음)
        exit_opp = ((ma5 < ma20) & (ma5.shift(1) >= ma20.shift(1))).astype(int)
        return entry, exit_opp

    # default: MA20_breakout (기존 로직 유지)
    ma = _sma(close, 20)
    entry = ((close > ma) & (close.shift(1) <= ma.shift(1))).astype(int)
    exit_opp = ((close < ma) & (close.shift(1) >= ma.shift(1))).astype(int)
    return entry, exit_opp
