import requests
import pandas as pd
import time
import os

def fetch_bithumb_candles(
    market='BTC_KRW',
    chart_intervals='24h',  # '1m', '3m', '5m', '10m', '30m', '1h', '6h', '12h', '24h'
    count=200,
    output_dir='/data'
):
    url = f'https://api.bithumb.com/public/candlestick/{market}/{chart_intervals}'
    resp = requests.get(url)
    data = resp.json()
    if data['status'] != '0000':
        raise Exception('Bithumb API error:', data)
    # 데이터 변환
    candles = data['data'][-count:]
    df = pd.DataFrame(candles, columns=[
        'timestamp', 'open', 'close', 'high', 'low', 'volume'
    ])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df = df.sort_values('timestamp')
    # 보통 OHLCV 표준 순서로 맞춰 저장 (open, high, low, close, volume)
    df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
    # 파일 저장
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    filename = f"{output_dir}/{market.lower()}_{chart_intervals}.csv"
    df.to_csv(filename, index=False)
    print(f"저장 완료: {filename}")

if __name__ == "__main__":
    fetch_bithumb_candles(
        market='BTC_KRW',
        chart_intervals='24h',
        count=200,             # 최대 200개 (빗썸 API 제한)
        output_dir='/data'  # 또는 '/data' (도커 환경)
    )
