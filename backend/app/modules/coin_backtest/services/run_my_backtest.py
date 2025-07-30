import pandas as pd
from .strategies.strategy_ma import generate_ma_signal
from .strategies.strategy_rsi import generate_rsi_signal
from .backtest_engine import run_backtest

def run_multi_strategy(df):
    # 전략별 신호 생성
    ma_signals = generate_ma_signal(df)
    rsi_signals = generate_rsi_signal(df)
    # 신호 합치기 (예: 두 전략이 모두 매수면 매수, 둘 중 하나라도 매도면 매도)
    df = df.copy()
    df['ma_signal'] = ma_signals['signal']
    df['rsi_signal'] = rsi_signals['signal']
    df['signal'] = df['ma_signal'] + df['rsi_signal']
    df['signal'] = df['signal'].clip(-1, 1)  # 합쳐도 -1~1로 정규화
    trades, equity = run_backtest(df, signal_col='signal')
    return trades, equity

# 테스트 코드 (데이터 준비)
if __name__ == '__main__':
    # 임의로 가상 데이터 불러오기
    df = pd.read_csv('my_sample_ohlcv.csv')   # [timestamp, open, high, low, close, volume]
    trades, equity = run_multi_strategy(df)
    print('최종 수익률:', equity)
    print('체결내역:', trades)
