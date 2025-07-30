import pandas as pd

def generate_rsi_signal(df, period=14):
    """
    RSI(상대강도지수) 전략
    - period: RSI 기간
    """
    df = df.copy()
    delta = df['close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    df['rsi'] = 100 - (100 / (1 + rs))
    df['signal'] = 0
    df.loc[df['rsi'] < 30, 'signal'] = 1      # 과매도 구간에서 매수
    df.loc[df['rsi'] > 70, 'signal'] = -1     # 과매수 구간에서 매도
    return df[['timestamp', 'close', 'signal']]
