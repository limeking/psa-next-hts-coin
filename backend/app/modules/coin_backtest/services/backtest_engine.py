import pandas as pd

def run_backtest(df, signal_col='signal', fee_rate=0.001, max_position=1):
    """
    신호(DataFrame)와 체결/잔고 시뮬레이션 실행
    - df: 캔들 데이터와 signal 컬럼 포함
    - signal_col: 사용할 신호 컬럼명
    """
    position = 0
    entry_price = 0
    trades = []
    equity = 1.0  # 시작 자본 1.0 (= 100%)
    for i, row in df.iterrows():
        signal = row[signal_col]
        price = row['close']
        # 매수
        if signal == 1 and position < max_position:
            position += 1
            entry_price = price
            trades.append({'side': 'buy', 'price': price, 'timestamp': row['timestamp']})
        # 매도
        elif signal == -1 and position > 0:
            pnl = (price - entry_price) / entry_price - fee_rate*2
            equity *= (1 + pnl)
            trades.append({'side': 'sell', 'price': price, 'timestamp': row['timestamp'], 'pnl': pnl, 'equity': equity})
            position -= 1
    return trades, equity
