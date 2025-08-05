# backend/app/modules/coinlab/routers/coin_data.py
import requests
from pathlib import Path
import os
import pandas as pd
import time

BASE_DIR = "/data"


INTERVAL_CONFIG = {
    "1d": {"target_count": 1825},    # 5년(365*5)
    "1h": {"target_count": 8760},    # 1년(24*365)
    "15m": {"target_count": 35040},  # 1년(24*4*365)
    "5m": {"target_count": 105120},  # 1년(24*12*365)
}


ALLOWED_INTERVALS = {"1d", "1h", "15m", "5m", "30m", "10m", "3m", "1m"}

def normalize_bithumb_interval(interval):
    """
    빗썸이 지원하는 interval만 허용 (소문자, 공백/오타 방지)
    """
    i = str(interval).lower().strip()
    if i not in ALLOWED_INTERVALS:
        raise ValueError(f"지원하지 않는 interval입니다: {interval}")
    return i


def normalize_bithumb_symbol(symbol):
    """
    빗썸 공식 심볼명으로 자동 보정 (ex: btc, BTC-KRW, BTC_KRW 등 → BTC_KRW)
    """
    s = str(symbol).upper().replace("-", "_")
    if not s.endswith("_KRW"):
        if s.endswith("KRW"):
            s = s.replace("KRW", "_KRW")
        else:
            s = s + "_KRW"
    return s


def is_valid_parquet(file_path):
    try:
        if not file_path.exists() or file_path.stat().st_size < 100:  # 최소 크기 체크
            return False
        df = pd.read_parquet(file_path)
        # "timestamp" 컬럼 있고, 1행 이상일 때만 정상으로 간주
        if df.shape[0] == 0 or "timestamp" not in df.columns:
            return False
        return True
    except Exception:
        return False

def get_coin_data_list(interval: str = "1d", year: str = "2024"):
    interval = normalize_bithumb_interval(interval)
    symbols = []
    base = Path(BASE_DIR)
    if not base.exists():
        return symbols
    for symbol in os.listdir(base):
        file_path = base / symbol / interval / f"{year}.parquet"
        if is_valid_parquet(file_path):
            symbols.append(symbol)
    return symbols

def download_coin_data(symbol: str, interval: str = "1d", year: str = "2024"):
    symbol = normalize_bithumb_symbol(symbol)
    interval = normalize_bithumb_interval(interval)
    file_path = Path(BASE_DIR) / symbol / interval / f"{year}.parquet"
    if not file_path.exists():
        return None
    return file_path


def update_coin_data(symbol: str, interval: str, year: str):
    symbol = normalize_bithumb_symbol(symbol)
    interval = normalize_bithumb_interval(interval)
    df = fetch_ohlcv_bithumb(symbol, interval, year)
    file_path = Path(BASE_DIR) / symbol / interval / f"{year}.parquet"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if df is not None and len(df) > 0:
        df.to_parquet(file_path, index=False)
        print(f"[{symbol}][{interval}][{year}] parquet 저장 완료 ({len(df)} rows)")
        return True
    else:
        print(f"[{symbol}][{interval}][{year}] parquet 저장 실패 (데이터 없음)")
        return False



def fetch_ohlcv_bithumb(symbol, interval, year):
    symbol = normalize_bithumb_symbol(symbol)
    interval = normalize_bithumb_interval(interval)
    # [핵심] "1d" → "24h"로 변환해서 API에 보냄!
    interval_for_api = "24h" if interval == "1d" else interval
    # 슬라이딩 방식으로 최대 개수까지 누적 수집
    config = INTERVAL_CONFIG.get(interval, INTERVAL_CONFIG["1d"])
    target_count = config["target_count"]
    url = f"https://api.bithumb.com/public/candlestick/{symbol}/{interval_for_api}"
    all_data = []
    seen = set()
    n_try = 0
    last_ts = None
    while len(all_data) < target_count and n_try < 100:
        r = requests.get(url, timeout=10)
        data = r.json().get("data", [])
        if not data or not isinstance(data, list):
            break
        data = sorted(data, key=lambda row: int(row[0]))
        new_rows = []
        for row in data:
            ts = int(row[0])
            if ts not in seen:
                seen.add(ts)
                new_rows.append(row)
        if not new_rows:
            break
        df_tmp = pd.DataFrame(new_rows)
        df_tmp[0] = pd.to_datetime(df_tmp[0], unit="ms")
        df_tmp = df_tmp[df_tmp[0].dt.year == int(year)]
        if len(df_tmp) == 0:
            break
        # 컬럼명을 timestamp로 변경
        df_tmp = df_tmp.rename(columns={0: "timestamp"})
        for row in df_tmp.values:
            all_data.append(list(row))
        # 슬라이딩이 필요하다면 여기에 last_ts 사용
        last_ts = int(df_tmp["timestamp"].iloc[0].timestamp() * 1000)
        n_try += 1
        time.sleep(0.3)
    if not all_data:
        return None
    # 아래부터는 기존 코드와 동일
    if len(all_data[0]) == 7:
        columns = ["timestamp", "open", "close", "high", "low", "volume", "value"]
    elif len(all_data[0]) == 6:
        columns = ["timestamp", "open", "close", "high", "low", "volume"]
    else:
        print(f"[fetch_ohlcv_bithumb] Warning: unexpected column count {len(all_data[0])}")
        return None
    df = pd.DataFrame(all_data, columns=columns)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df["open"] = df["open"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)
    df["close"] = df["close"].astype(float)
    df["volume"] = df["volume"].astype(float)
    if "value" in df.columns:
        df["value"] = df["value"].astype(float)
    df["symbol"] = symbol
    df = df[df["timestamp"].dt.year == int(year)]
    main_cols = ["timestamp", "open", "high", "low", "close", "volume", "symbol"]
    if "value" in df.columns:
        main_cols.insert(6, "value")
    df = df[[col for col in main_cols if col in df.columns]]
    return df




def save_and_merge(symbol, interval, year, new_df):
    symbol = normalize_bithumb_symbol(symbol)
    interval = normalize_bithumb_interval(interval)
    file_path = Path("/data") / symbol / interval / f"{year}.parquet"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    # 기존 parquet가 있다면 불러오기
    if file_path.exists():
        old_df = pd.read_parquet(file_path)
        merged = pd.concat([old_df, new_df])
        merged = merged.drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
    else:
        merged = new_df
    merged.to_parquet(file_path, index=False)


def download_all_data(symbol):
    from datetime import datetime
    now = datetime.now()
    years_5 = [str(now.year - i) for i in range(5)]
    years_1 = [str(now.year)]

    # 일봉(1d) 5년치
    for year in years_5:
        update_coin_data(symbol, "1d", year)

    # 1시간, 15분, 5분 1년치
    for interval in ["1h", "15m", "5m"]:
        for year in years_1:
            update_coin_data(symbol, interval, year)

if __name__ == "__main__":
    symbols = ["BTC_KRW", "ETH_KRW", "XRP_KRW"]  # 원하는 코인들
    for symbol in symbols:
        download_all_data(symbol)


