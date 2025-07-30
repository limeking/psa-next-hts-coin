import pandas as pd

def generate_ma_signal(df, short=5, long=20):
    """
    이동평균(MA) 교차 전략
    - short: 단기 이동평균 기간
    - long: 장기 이동평균 기간
    """
    df = df.copy()
    df['ma_short'] = df['close'].rolling(short).mean()
    df['ma_long'] = df['close'].rolling(long).mean()
    df['signal'] = 0
    df.loc[df['ma_short'] > df['ma_long'], 'signal'] = 1
    df.loc[df['ma_short'] < df['ma_long'], 'signal'] = -1
    return df[['timestamp', 'close', 'signal']]
