# backend/app/modules/coinlab/routers/coinlab.py

from fastapi import APIRouter, Body
import json
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
from ..schemas import MarketOption
from ..services.utils import save_options, load_options

router = APIRouter(prefix="/coinlab")

DATA_DIR = Path(__file__).parent.parent / "data"

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