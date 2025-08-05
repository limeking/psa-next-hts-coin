# backend/app/modules/coinlab/routers/coinlab.py

from fastapi import APIRouter, Body, Request, Query, BackgroundTasks
from fastapi.responses import Response   
import json
import os
import uuid
from typing import List
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
import tempfile, shutil
from ..schemas.schemas import MarketOption, BulkRequest
from ..services.utils import save_options, load_options
from .coin_data import get_coin_data_list, download_coin_data, update_coin_data
from ..services.coin_data_service import delete_coin_data, bulk_delete, bulk_update, bulk_download

router = APIRouter(prefix="/coinlab")

DATA_DIR = Path(__file__).parent.parent / "data"

DATA_FILE = DATA_DIR / "condition_searches.json"
CONDITION_LIST_FILE = DATA_DIR / "condition_list.json"

base_dir = "/data"
if not os.path.exists(base_dir):
    os.makedirs(base_dir, exist_ok=True)

#  시장상태 옵션 저장
@router.get("/market/options")
def get_market_options():
    return load_options()

@router.post("/market/options")
def post_market_options(option: MarketOption):
    save_options(option.dict())
    return {"ok": True}

# 빗썸 public API에서 최근 BTC/KRW 체결가 배열 가져오기 (최신→과거 30개)
@router.get("/price/btc_krw")
def get_btc_krw_prices(count: int = 200):  # 기본값을 넉넉하게!
    """
    빗썸 public API에서 최근 BTC/KRW 체결가 배열 가져오기
    count: 1~200 (기본 200)
    """
    url = f"https://api.bithumb.com/public/transaction_history/BTC_KRW?count={count}"
    try:
        resp = requests.get(url, timeout=5)
        data = resp.json()
        prices = [float(row["price"]) for row in data["data"]]
        prices.reverse()  # 과거→최신 순서
        return {"prices": prices}
    except Exception as e:
        return {"prices": [], "error": str(e)}


# 공포-탐욕 지수(Fear & Greed Index)를 외부 API에서 조회하여 반환하는 엔드포인트
@router.get("/fear_greed_index")
def get_fear_greed_index():
    """
    외부 서비스(https://api.alternative.me/fng/)에서 최신 공포-탐욕 지수(Fear & Greed Index)를 조회하여 반환합니다.
    반환값:
        - value: 현재 지수 값 (정수)
        - classification: 지수에 대한 분류(예: "Extreme Fear", "Greed" 등)
        - error: (예외 발생 시) 에러 메시지
    """
    try:
        resp = requests.get("https://api.alternative.me/fng/?limit=1", timeout=5)
        data = resp.json()
        value = int(data['data'][0]['value'])
        classification = data['data'][0]['value_classification']
        return {
            "value": value,
            "classification": classification
        }
    except Exception as e:
        return {
            "value": None,
            "classification": None,
            "error": str(e)
        }


@router.get("/theme_ranking")
def get_theme_ranking(top_n: int = 20):
    """
    빗썸 시세 API와 내부 테마 매핑 파일을 활용하여
    각 코인 테마별 24시간 평균 상승률, 거래대금 합계, 코인 개수를 집계하고
    평균 상승률 기준 상위 top_n개의 테마 랭킹을 반환합니다.

    Args:
        top_n (int): 반환할 상위 테마 개수 (기본 5)

    Returns:
        dict: {
            "theme_ranking": [
                {
                    "theme": 테마명,
                    "mean_return": 24시간 평균 상승률(%),
                    "sum_volume": 24시간 거래대금 합계,
                    "count": 테마 내 코인 개수
                },
                ...
            ]
        }
    """
    # 1. 테마 매핑파일 불러오기
    with open(DATA_DIR / "coin_theme_mapping.json") as f:
        theme_map = json.load(f)
    # 2. 빗썸 시세API 불러오기
    r = requests.get('https://api.bithumb.com/public/ticker/ALL_KRW')
    data = r.json()['data']
    # 3. DataFrame 변환

    tickers = []
    for symbol, v in data.items():
        if not isinstance(v, dict): continue
        tickers.append({
            'symbol': symbol,  # 또는 symbol + "_KRW" 필요시
            'fluctate_rate_24H': float(v.get('fluctate_rate_24H', 0)),
            'acc_trade_value_24H': float(v.get('acc_trade_value_24H', 0))
        })
    df = pd.DataFrame(tickers)
    print("시세 DF symbol:", df['symbol'].tolist())
    theme_stats = []
    for theme, coins in theme_map.items():
        coins_raw = [c.replace("_KRW", "") for c in coins]  # 혹은 반대 변환(아래 참고)
        theme_df = df[df['symbol'].isin(coins_raw)]
        # (print로 매칭 상태 확인!)
        print(f"[{theme}] 매핑코인: {coins}")
        print(f"[{theme}] 변환코인: {coins_raw}")
        print(f"[{theme}] 시세DF코인: {theme_df['symbol'].tolist()}")
        if len(theme_df) == 0: continue
        mean_return = theme_df['fluctate_rate_24H'].mean()
        sum_volume = theme_df['acc_trade_value_24H'].sum()
        theme_stats.append({
            'theme': theme,
            'mean_return': round(mean_return, 2),
            'sum_volume': int(sum_volume),
            'count': int(len(theme_df))
        })
    # 5. 랭킹 정렬 및 반환 (상승률 기준)
    result = sorted(theme_stats, key=lambda x: x['mean_return'], reverse=True)[:top_n]
    return {
        "theme_ranking": result,
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


@router.get("/theme_mapping")
def get_theme_mapping():
    # 테마 매핑 파일을 읽어서 반환
    with open(DATA_DIR / "coin_theme_mapping.json") as f:
        return json.load(f)

@router.post("/theme_mapping")
def update_theme_mapping(data: dict = Body(...)):
    # 테마 매핑 파일을 새 데이터로 덮어쓰기
    with open(DATA_DIR / "coin_theme_mapping.json", "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "updated"}


@router.get("/condition_search")
def get_condition_search():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

@router.post("/condition_search")
async def save_condition_search(request: Request):
    data = await request.json()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}

@router.get("/condition_list")
def get_condition_list():
    if not os.path.exists(CONDITION_LIST_FILE):
        return []
    with open(CONDITION_LIST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

@router.post("/condition_list")
async def save_condition_list(request: Request):
    data = await request.json()
    with open(CONDITION_LIST_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}



@router.post("/save_krw_symbols")
def save_krw_symbols():
    url = "https://api.bithumb.com/public/ticker/ALL_KRW"
    resp = requests.get(url)
    data = resp.json()
    if data["status"] != "0000":
        return {"error": "Bithumb API 오류"}, 500
    symbols = [symbol+"_KRW" for symbol in data["data"].keys() if symbol != "date"]
    save_path = "/data/krw_symbols.json"
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(symbols, f, ensure_ascii=False, indent=2)
    return {"result": "ok", "count": len(symbols)}

@router.get("/krw_symbols")
def get_krw_symbols():
    save_path = "/data/krw_symbols.json"
    if not os.path.exists(save_path):
        return {"symbols": []}
    with open(save_path, "r", encoding="utf-8") as f:
        symbols = json.load(f)
    return {"symbols": symbols}


# [코인데이터 상태 리스트]
@router.get("/coin_data_list")
def coin_data_list(interval: str = "1d", year: str = "2024"):
    symbols = get_coin_data_list(interval, year)
    return {"symbols": symbols}

# [코인데이터 다운로드]
@router.get("/coin_data_download")
def coin_data_download(symbol: str = Query(...), interval: str = "1d", year: str = "2024"):
    file_path = download_coin_data(symbol, interval, year)
    if not file_path:
        return Response(content="파일 없음", status_code=404)
    return Response(
        content=file_path.read_bytes(),
        headers={
            "Content-Disposition": f'attachment; filename="{symbol}_{interval}_{year}.parquet"'
        },
        media_type="application/octet-stream"
    )

# [코인데이터 업데이트]
@router.post("/coin_data_update")
def coin_data_update(symbol: str = Query(...), interval: str = Query(...), year: str = Query(...)):
    from .coin_data import update_coin_data
    try:
        result = update_coin_data(symbol, interval, year)
        if result is True:
            return {"result": True}
        else:
            return {"result": False, "reason": "NoDataFromAPI"}
    except Exception as e:
        return {"result": False, "reason": str(e)}


# [단일 삭제 API]
@router.delete("/coin_data_delete")
def coin_data_delete(symbol: str = Query(...), interval: str = "1d", year: str = "2024"):
    ok = delete_coin_data(symbol, interval, year)
    return {"result": "ok" if ok else "not_found"}

# [일괄 삭제 API, 비동기]
@router.post("/bulk_delete")
def bulk_delete_api(
    req: BulkRequest,
    background_tasks: BackgroundTasks
):
    status_id = str(uuid.uuid4())
    background_tasks.add_task(
        bulk_delete, req.symbols, req.interval, req.year, status_id
    )
    return {"status": "started", "status_id": status_id}

# [진행상황 조회]
@router.get("/bulk_status")
def get_bulk_status(status_id: str):
    status_file = f"/data/operation_status/{status_id}.json"
    import json
    if not os.path.exists(status_file):
        return {"status": "not_found"}
    with open(status_file, "r", encoding="utf-8") as f:
        return json.load(f)



# --- 일괄 업데이트 (프론트 bulk만 사용!) ---
@router.post("/bulk_update")
def bulk_update_api(
    req: BulkRequest,
    background_tasks: BackgroundTasks
):
    status_id = str(uuid.uuid4())
    # req에서 꺼내서 bulk_update에 넘김
    background_tasks.add_task(
        bulk_update, req.symbols, req.interval, req.year, status_id
    )
    return {"status": "started", "status_id": status_id}

# --- 일괄 다운로드 (프론트 bulk만 사용!) ---
@router.post("/bulk_download")
def bulk_download_api(
    req: BulkRequest,
    background_tasks: BackgroundTasks
):
    status_id = str(uuid.uuid4())
    background_tasks.add_task(
        bulk_download, req.symbols, req.interval, req.year, status_id
    )
    return {"status": "started", "status_id": status_id}

# --- 진행상황(진행률) 상태 조회 ---
@router.get("/bulk_status")
def get_bulk_status(status_id: str):
    status_file = f"/data/operation_status/{status_id}.json"
    if not os.path.exists(status_file):
        return {"status": "not_found"}
    with open(status_file, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/coin_data_merged_save")
def coin_data_merged_save(symbol: str = Query(...)):
    intervals = ["1d", "1h", "15m", "5m"]
    now = datetime.now()
    this_year = now.year
    years_dict = {
        "1d": [str(this_year - i) for i in range(5)],
        "1h": [str(this_year)],
        "15m": [str(this_year)],
        "5m": [str(this_year)]
    }
    dfs = []
    from .coin_data import update_coin_data
    for interval in intervals:
        for year in years_dict[interval]:
            fpath = Path(f"/data/{symbol}/{interval}/{year}.parquet")
            if not fpath.exists():
                try:
                    update_coin_data(symbol, interval, year)
                except Exception as e:
                    print(f"[autocreate error] {symbol} {interval} {year} | {e}")
            if fpath.exists():
                try:
                    df = pd.read_parquet(fpath)
                    df["interval"] = interval
                    df["year"] = year
                    dfs.append(df)
                except Exception as e:
                    print(f"[parquet read error] {fpath} | {e}")
    if not dfs:
        return {"result": "fail", "msg": "파일 없음"}
    df_all = pd.concat(dfs, ignore_index=True)
    output_path = Path("/data") / f"{symbol}_ALL.parquet"
    df_all.to_parquet(output_path, index=False)
    return {"result": "ok", "path": str(output_path)}


@router.get("/coin_data_total_size")
def coin_data_total_size():
    from pathlib import Path
    import os
    base = Path("/data")
    total_bytes = 0
    for dirpath, dirnames, filenames in os.walk(base):
        for fname in filenames:
            if fname.endswith(".parquet"):
                total_bytes += (Path(dirpath) / fname).stat().st_size
    # 자동 단위 변환
    for unit in ['B','KB','MB','GB','TB']:
        if total_bytes < 1024:
            break
        total_bytes /= 1024
    return {"total_size": round(total_bytes, 2), "unit": unit}


@router.delete("/coin_data_delete_all")
def coin_data_delete_all(symbol: str = Query(...)):
    from ..services.coin_data_service import delete_coin_all_data
    ok = delete_coin_all_data(symbol)
    return {"result": "ok" if ok else "not_found"}
   

@router.get("/coin_data_state")
def coin_data_state():
    """
    전체 심볼 × interval × year별 데이터 존재 여부를 한 번에 내려줌
    {
      "BTC_KRW": { "1d": {"2021": true, ...}, "1h": {"2025": true, ...}, ... },
      ...
    }
    """
    import os
    from pathlib import Path
    BASE_DIR = "/data"
    result = {}
    if not os.path.exists(BASE_DIR):
        return result
    for symbol in os.listdir(BASE_DIR):
        symbol_dir = Path(BASE_DIR) / symbol
        if not symbol_dir.is_dir():
            continue
        result[symbol] = {}
        for interval in os.listdir(symbol_dir):
            interval_dir = symbol_dir / interval
            if not interval_dir.is_dir():
                continue
            result[symbol][interval] = {}
            for f in os.listdir(interval_dir):
                if f.endswith(".parquet") and f[:-8].isdigit():
                    year = f[:-8]
                    result[symbol][interval][year] = True
    return result