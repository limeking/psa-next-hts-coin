# backend/app/modules/coinlab/routers/coinlab.py

from fastapi import APIRouter, Body, Request, Query, BackgroundTasks, HTTPException
from fastapi.responses import Response, JSONResponse
import json
import os
import re
import uuid
from typing import List, Dict, Any
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
import math
import tempfile, shutil
import concurrent.futures
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

DATA_ROOT = Path("/data")

WATCHLIST_FILE = DATA_DIR / "watchlist.json"
WATCHLISTS_DIR = DATA_DIR / "watchlists" # 여러개 이름 저장용
WATCHLISTS_DIR.mkdir(parents=True, exist_ok=True)

SAFE_NAME = re.compile(r"^[A-Za-z0-9가-힣 _\-\(\)%]{1,64}$")



def _validate_watchlist_name(name: str | None):
    if name and not SAFE_NAME.match(name):
        # JSONResponse로 해도 되지만, FastAPI는 예외가 더 간결
        raise HTTPException(status_code=400, detail="invalid name")


def _get_volume_change_rate(df):
    cols = {c.lower(): c for c in df.columns}
    vcol = cols.get("volume") or cols.get("acc_trade_volume_24h") or cols.get("acc_trade_volume") or cols.get("vol")
    if not vcol or len(df) < 2:
        return None
    try:
        prev_volume = float(df.iloc[-2][vcol])
        now_volume  = float(df.iloc[-1][vcol])
        if prev_volume and prev_volume != 0:
            vcr = (now_volume - prev_volume) / prev_volume * 100.0
            return None if math.isnan(vcr) else round(vcr, 2)
    except Exception:
        pass
    return None


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


@router.post("/condition_search_run")
async def condition_search_run(request: Request):
    """
    body 예시:
    {
      "combos": [...],      # 조건조합 (ConditionComboBuilder 포맷)
      "interval": "1d"
    }
    """
    body = await request.json()
    combos = body.get("combos", [])
    interval = body.get("interval", "1d")
    realtime = bool(body.get("realtime", False))
    symbols_filter = body.get("symbols", None) 
    # --- add: orderbook depth 옵션 (기본 5) ---
    try:
        _d = int(body.get("orderbook_depth", 5))
    except Exception:
        _d = 5
    orderbook_depth = _d if _d in (5, 10, 20, 30) else 5
    if isinstance(symbols_filter, list):
        symbols_filter = set([str(s) for s in symbols_filter])

    base_dir = "/data"
    result = []
    if not os.path.exists(base_dir):
        return {"coins": []}

    if realtime:
        # 1) 심볼 목록 확보
        symbols_path = "/data/krw_symbols.json"
        if os.path.exists(symbols_path):
            with open(symbols_path, "r", encoding="utf-8") as f:
                symbols = json.load(f)
        else:
            symbols = []

        # 2) Ticker ALL_KRW 한 번 호출 (등락률/거래대금)
        try:
            tkr = requests.get("https://api.bithumb.com/public/ticker/ALL_KRW", timeout=3).json().get("data", {})
        except Exception:
            tkr = {}
        
        # 관심종목이 오면 그걸로 제한
        if symbols_filter:
            symbols = [s for s in symbols if s in symbols_filter]

        if not symbols:
            symbols = [s + "_KRW" for s in tkr.keys() if s and s != "date"]
        if symbols_filter:
            symbols = [s for s in symbols if s in symbols_filter]
        
        # ALL_KRW 로 채운 뒤에도 필터 재적용
        
        if symbols_filter:
            symbols = [s for s in symbols if s in symbols_filter]

        def build_item(sym: str):
            base = {"symbol": sym}
            key = sym.replace("_KRW", "")
            tv = tkr.get(key, {}) if isinstance(tkr.get(key, {}), dict) else {}
            # 등락률(%)
            try:
                base["return"] = float(tv.get("fluctate_rate_24H", None))
            except Exception:
                base["return"] = None
            # 거래대금(원)
            try:
                base["volume"] = float(tv.get("acc_trade_value_24H", None))
            except Exception:
                base["volume"] = None
            try:
                base["close"] = float(tv.get("closing_price", None))
            except Exception:
                base["close"] = None
            # 호가창 합계/비율
            ob = _fetch_orderbook_totals(sym, depth=orderbook_depth, timeout=1.5)
            base.update(ob)
            return base if match_combo(base, combos) else None

        result = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            futures = [ex.submit(build_item, s) for s in symbols]
            for fut in concurrent.futures.as_completed(futures):
                item = fut.result()
                if item:
                    result.append(item)

        # 기본 정렬: 등락률 내림차순 (기존 규칙 유지)
        result.sort(key=lambda x: (x.get("return") is None, x.get("return", 0)), reverse=True)
        return {"coins": result}

    for symbol in os.listdir(base_dir):
        if symbols_filter and symbol not in symbols_filter:
            continue
        interval_dir = os.path.join(base_dir, symbol, interval)
        if not os.path.isdir(interval_dir):
            continue

        # 연도별 parquet 중 최신 파일 찾기 (파일명 정렬 기준)
        parquet_files = sorted(
            [f for f in os.listdir(interval_dir) if f.endswith(".parquet") and f[:-8].isdigit()],
            reverse=True
        )
        if not parquet_files:
            continue
        latest_file = parquet_files[0]  # 예: "2024.parquet"

        fpath = os.path.join(interval_dir, latest_file)
        try:
            df = pd.read_parquet(fpath)
            last_row = df.iloc[-1].to_dict()
            last_row["symbol"] = symbol

            # 1. return 값이 있으면 강제로 float 변환(문자열 등 안전 처리)
            if "return" in last_row:
                try:
                    last_row["return"] = float(last_row["return"])
                    if math.isnan(last_row["return"]):
                        last_row["return"] = None
                except Exception:
                    last_row["return"] = None

            # 2. 등락률(return) 자동 계산 보정 (없거나 None일 때만)
            if "return" not in last_row or last_row["return"] is None:
                if len(df) >= 2 and "close" in df.columns:
                    prev_close = df.iloc[-2]["close"]
                    now_close = df.iloc[-1]["close"]
                    try:
                        if prev_close and now_close and prev_close != 0:
                            val = (now_close - prev_close) / prev_close * 100
                            if math.isnan(val):
                                last_row["return"] = None
                            else:
                                last_row["return"] = round(float(val), 2)
                        else:
                            last_row["return"] = None
                    except Exception:
                        last_row["return"] = None
                else:
                    last_row["return"] = None
            # ⬆️
            # 3. 전일대비 거래량 증감률(%) 계산: ((금일 - 정일) / 전일) * 100
            try:
                cols = {c.lower(): c for c in df.columns}
                vcol = cols.get("volume") or cols.get("acc_trade_volume_24h") or cols.get("acc_trade_volume") or cols.get("vol")
                if vcol and len(df) >= 2:
                    prev_volume = float(df.iloc[-2][vcol])
                    now_volume  = float(df.iloc[-1][vcol])
                    if prev_volume and prev_volume != 0:
                        vcr = (now_volume - prev_volume) / prev_volume * 100.0
                        last_row["volume_change_rate"] = _get_volume_change_rate(df)
                    else:
                        last_row["volume_change_rate"] = _get_volume_change_rate(df)
                else:
                    last_row["volume_change_rate"] = _get_volume_change_rate(df)
            except Exception:
                last_row["volume_change_rate"] = _get_volume_change_rate(df)
        except Exception:
            continue
        if match_combo(last_row, combos):
            result.append(last_row)
    return {"coins": result}


def match_combo(item, combos: list[dict]):
    """
    combos: [{ key, op, value, ... }]
    item: { symbol, open, high, ... }
    ConditionComboBuilder.js의 포맷에 맞춰 해석
    """
    for cond in combos:
        k, op, v = cond["key"], cond["op"], cond["value"]
        if k.startswith("ma_"):  # 이평선계산 등 추가
            continue
        vi = item.get(k)
        # None, 빈값, NaN 방지
        if vi is None or v is None or str(vi).strip() == "" or str(v).strip() == "":
            return False
        # 수치형 연산은 float 변환 예외 처리
        if op in {">", "<", ">=", "<="}:
            try:
                vi_f = float(vi)
                v_f = float(v)
            except Exception:
                return False
            if op == ">" and not (vi_f > v_f): return False
            if op == "<" and not (vi_f < v_f): return False
            if op == ">=" and not (vi_f >= v_f): return False
            if op == "<=" and not (vi_f <= v_f): return False
        elif op == "=":
            if str(vi) != str(v): return False
        # 필요시 기타 연산 추가
    return True


def _to_float(x):
    try:
        return float(x)
    except Exception:
        return 0.0

def _fetch_orderbook_totals(symbol: str, *, depth: int = 5, timeout: float = 1.5) -> dict:
    """
    빗썸 호가창에서 총매수/총매도 잔량 합계, 잔량비, 최우선 잔량(매수/매도) 반환
    depth: 5/10/20/30 중 하나
    """
    depth = depth if depth in (5, 10, 20, 30) else 5
    url = f"https://api.bithumb.com/public/orderbook/{symbol}?count={depth}"
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        data = (r.json() or {}).get("data") or {}
        bids = data.get("bids") or []
        asks = data.get("asks") or []

        # 총 잔량(빗썸이 제공하면 그 값, 없으면 합산)
        total_bid = _to_float(data.get("total_bid_size") or 0.0) or sum(_to_float(b.get("quantity")) for b in bids)
        total_ask = _to_float(data.get("total_ask_size") or 0.0) or sum(_to_float(a.get("quantity")) for a in asks)

        # 최우선 잔량: 가격 기준으로 매수는 최댓값, 매도는 최솟값에서 quantity 사용
        best_bid = max(bids, key=lambda b: _to_float(b.get("price")), default=None)
        best_ask = min(asks, key=lambda a: _to_float(a.get("price")), default=None)
        best_bid_size = _to_float(best_bid.get("quantity")) if best_bid else None
        best_ask_size = _to_float(best_ask.get("quantity")) if best_ask else None

        return {
            "total_bid_size": total_bid,
            "total_ask_size": total_ask,
            "best_bid_size": best_bid_size,
            "best_ask_size": best_ask_size,
            "orderbook_ratio": (total_bid / total_ask) if total_ask else None,
            "orderbook_depth": depth,
        }
    except Exception:
        # TODO: logger.exception("orderbook fetch failed")
        return {
            "total_bid_size": None,
            "total_ask_size": None,
            "best_bid_size": None,
            "best_ask_size": None,
            "orderbook_ratio": None,
            "orderbook_depth": depth,
        }


def _latest_parquet_path(symbol: str, interval: str) -> Path:
  """
  /data/{SYMBOL}/{interval}/{year}.parquet 중 가장 최신 year 파일 반환
  """
  base = DATA_ROOT / symbol / interval
  if not base.exists():
    raise FileNotFoundError(f"No data dir: {base}")
  files = sorted(base.glob("*.parquet"))
  if not files:
    raise FileNotFoundError(f"No parquet files in: {base}")
  # 파일명이 2024.parquet, 2025.parquet 형태라고 가정 → 최신 연도 선택
  # 정렬되어 있으니 마지막이 최신
  return files[-1]

@router.get("/candles")
def get_candles(
    symbol: str = Query(..., description="예: BTC_KRW"),
    interval: str = Query(..., regex="^(1d|1h|15m|5m)$"),
    limit: int = Query(500, ge=50, le=5000),
) -> Dict[str, Any]:
  """
  최신 parquet 1개에서 tail(limit)만 읽어 캔들 반환
  - time: epoch seconds (int)
  - open, high, low, close, volume: float
  """
  try:
    p = _latest_parquet_path(symbol, interval)
  except FileNotFoundError as e:
    raise HTTPException(status_code=404, detail=str(e))

  try:
    df = pd.read_parquet(p)
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to read parquet: {e}")

  # 컬럼 정규화: time/open/high/low/close/volume
  cols = {c.lower(): c for c in df.columns}
  # 허용 가능한 키 탐색
  tcol = cols.get("time") or cols.get("timestamp") or "time"
  ocol = cols.get("open") or "open"
  hcol = cols.get("high") or "high"
  lcol = cols.get("low") or "low"
  ccol = cols.get("close") or "close"
  vcol = cols.get("volume") or cols.get("vol") or "volume"

  # 시간 처리
  t = pd.to_datetime(df[tcol], utc=True, errors="coerce")
  if t.isna().all():
    raise HTTPException(status_code=500, detail="Invalid time column")

  # tail(limit) + 필요한 컬럼만
  sdf = pd.DataFrame({
    "time": (t.astype("int64") // 10**9),  # to epoch seconds (FutureWarning 제거)
    "open": pd.to_numeric(df[ocol], errors="coerce"),
    "high": pd.to_numeric(df[hcol], errors="coerce"),
    "low":  pd.to_numeric(df[lcol], errors="coerce"),
    "close":pd.to_numeric(df[ccol], errors="coerce"),
    "volume": pd.to_numeric(df[vcol], errors="coerce") if vcol in df.columns else 0.0,
  }).dropna().tail(limit)

  candles: List[Dict[str, Any]] = sdf.to_dict(orient="records")
  if not candles:
    raise HTTPException(status_code=404, detail="No candle rows")

  return {
    "symbol": symbol,
    "interval": interval,
    "count": len(candles),
    "candles": candles,
  }


# 기존 get_watchlist 교체
@router.get("/watchlist")
def get_watchlist(name: str | None = Query(None)):
    _validate_watchlist_name(name)
    if name:
        path = WATCHLISTS_DIR / f"{name}.json"
        if not path.exists():
            return {"symbols": []}
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {"symbols": data.get("symbols", [])}
        except Exception:
            return {"symbols": []}
    # 기본(공용)
    if not WATCHLIST_FILE.exists():
        return {"symbols": []}
    try:
        with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {"symbols": data.get("symbols", [])}
    except Exception:
        return {"symbols": []}

# 기존 post_watchlist 교체
@router.post("/watchlist")
def post_watchlist(payload: dict = Body(...), name: str | None = Query(None)):
    _validate_watchlist_name(name)
    symbols = [str(s) for s in payload.get("symbols", []) if s]
    symbols = list(dict.fromkeys(symbols))  # 중복 제거
    if name:
        path = WATCHLISTS_DIR / f"{name}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"symbols": symbols}, f, ensure_ascii=False, indent=2)
        return {"ok": True, "name": name, "count": len(symbols)}
    WATCHLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(WATCHLIST_FILE, "w", encoding="utf-8") as f:
        json.dump({"symbols": symbols}, f, ensure_ascii=False, indent=2)
    return {"ok": True, "count": len(symbols)}


@router.get("/watchlist_names")
def get_watchlist_names():
    names = []
    if WATCHLISTS_DIR.exists():
        for p in WATCHLISTS_DIR.glob("*.json"):
            names.append(p.stem)


    return {"names": sorted(names)}



@router.delete("/watchlist")
def delete_watchlist(name: str = Query(..., description="삭제할 관심종목 이름")):
    _validate_watchlist_name(name)
    path = WATCHLISTS_DIR / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="watchlist not found")
    try:
        path.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"delete failed: {e}")
    return {"ok": True, "deleted": name}
