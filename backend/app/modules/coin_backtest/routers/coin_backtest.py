from fastapi import APIRouter, Query, Body
from fastapi.responses import JSONResponse
import pandas as pd
import os
import glob
import time
import requests
import math

router = APIRouter(prefix="/coin_backtest")

DATA_DIR = "/data"

# ==== NaN/inf/None 값 JSON 안전 변환 함수 (공통 사용) ====
def clean_json(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return 0.0
    if isinstance(v, dict):
        return {k: clean_json(val) for k, val in v.items()}
    if isinstance(v, list):
        return [clean_json(i) for i in v]
    return v

@router.get("/data/list")
def list_coin_data():
    files = glob.glob(f"{DATA_DIR}/*.csv")
    result = []
    total_size = 0
    for file in files:
        stat = os.stat(file)
        parts = os.path.basename(file).replace('.csv','').split('_')
        if len(parts) >= 3:
            market = '_'.join(parts[:-1])
            interval = parts[-1]
        else:
            market, interval = parts[0], parts[1] if len(parts) > 1 else 'unknown'
        market = market.upper()
        interval = interval.lower()
        # 행 개수 구하기 (헤더 제외)
        try:
            with open(file, "r", encoding="utf-8") as f:
                row_count = sum(1 for _ in f) - 1
        except Exception:
            row_count = 0
        size_mb = stat.st_size / 1024 / 1024
        total_size += size_mb
        result.append({
            "filename": os.path.basename(file),
            "market": market,
            "interval": interval,
            "size_mb": round(size_mb, 2),
            "row_count": row_count,
            "last_modified": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_mtime))
        })
    return JSONResponse(content={"data": result, "total_size_mb": round(total_size,2)})

@router.post("/data/download")
def download_coin_data(
    market: str = Query(...), 
    interval: str = Query(...), 
    count: int = Query(200)
):
    from automation.download_bithumb_data import fetch_bithumb_candles
    try:
        fetch_bithumb_candles(market=market, chart_intervals=interval, count=count, output_dir=DATA_DIR)
        return {"status": "ok", "msg": f"{market} {interval} 데이터 다운로드 완료"}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

@router.post("/data/delete")
def delete_coin_data(filename: str = Query(...)):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
        return {"status": "ok", "msg": f"{filename} 삭제"}
    else:
        return {"status": "error", "msg": "파일 없음"}

@router.get("/bithumb/krw-tickers")
def get_krw_tickers():
    url = "https://api.bithumb.com/public/ticker/ALL_KRW"
    r = requests.get(url, timeout=10)
    data = r.json()
    tickers = [k for k in data["data"].keys() if k != "date"]
    return JSONResponse(content={"tickers": [t + "_KRW" for t in tickers]})

# ---- interval 교집합용 심볼 추출 ----
def get_available_symbols(intervals):
    symbol_sets = []
    for interval in intervals:
        files = glob.glob(os.path.join(DATA_DIR, f"*_{interval}.csv"))
        symbols = set(os.path.basename(f).replace(f"_{interval}.csv", "") for f in files)
        symbol_sets.append(symbols)
    return set.intersection(*symbol_sets) if symbol_sets else set()




def compute_signal_state(signal_series):
    state = 0
    state_list = []
    for v in signal_series:
        if v == 1:
            state = 1
        elif v == -1:
            state = 0
        state_list.append(state)
    return state_list

# ==== 멀티타임프레임 MTF 백테스트 (단일 종목) ====
@router.post("/backtest/mtf")
def run_mtf_backtest(
    market: str = Body(...),
    multi_strategies: list = Body(...),
    slippage: float = Body(0.001),
    fee: float = Body(0.0005),
    use_trailing_stop: bool = Body(False),
    trailing_trigger: float = Body(0.03),
    trailing_gap: float = Body(0.01),
    use_take_profit: bool = Body(False),
    take_profit_pct: float = Body(0.03),
    use_stop_loss: bool = Body(False),
    stop_loss_pct: float = Body(0.03),
    show_all: bool = Body(False),
    allow_multi_position: bool = Body(False),
    split_order_count: int = Body(1),
):
    # 1. 전략별 데이터 준비
    dfs = {}
    signals = {}
    for strat in multi_strategies:
        interval = strat['interval']
        strategy = strat['strategy']
        params = strat['params']
        filename = f"{market}_{interval}.csv"
        filepath = os.path.join(DATA_DIR, filename)
        if not os.path.exists(filepath):
            return {"error": f"데이터 없음: {filename}. 먼저 데이터를 다운로드해주세요."}
        
        df = pd.read_csv(filepath)
        if df.empty:
            return {"error": f"빈 데이터 파일: {filename}"}
        
        # 필수 컬럼 확인
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            return {"error": f"필수 컬럼 누락: {missing_columns} in {filename}"}
        
        df['timestamp'] = pd.to_datetime(df['timestamp']) 
        df = df.sort_values('timestamp').reset_index(drop=True)
        
        # 거래량 필터
        use_volume_filter = params.get('use_volume_filter', False)
        volume_threshold = params.get('volume_threshold', 0.0)
        df['prev_volume'] = df['volume'].shift(1)
        df['volume_increase'] = (df['volume'] - df['prev_volume']) / (df['prev_volume'] + 1e-9)

        if strategy == 'sma_cross':
            short = params.get('short', 5)
            long = params.get('long', 20)
            df['short_ma'] = df['close'].rolling(window=short).mean()
            df['long_ma'] = df['close'].rolling(window=long).mean()
            df['prev_short_ma'] = df['short_ma'].shift(1)
            df['prev_long_ma'] = df['long_ma'].shift(1)
            df['signal'] = 0
            df.loc[(df['prev_short_ma'] <= df['prev_long_ma']) & (df['short_ma'] > df['long_ma']), 'signal'] = 1
            df.loc[(df['prev_short_ma'] >= df['prev_long_ma']) & (df['short_ma'] < df['long_ma']), 'signal'] = -1
        elif strategy == 'rsi':
            period = params.get('period', 14)
            threshold = params.get('threshold', 30)
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            rs = gain / (loss + 1e-10)
            df['rsi'] = 100 - (100 / (1 + rs))
            df['signal'] = 0
            df.loc[df['rsi'] < threshold, 'signal'] = 1
            df.loc[df['rsi'] > 70, 'signal'] = -1
        else:
            return {"error": f"지원하지 않는 전략: {strategy}"}
        
        if use_volume_filter and volume_threshold > 0:
            df.loc[(df['signal'] == 1) & (df['volume_increase'] < volume_threshold), 'signal'] = 0
        
        df['state'] = compute_signal_state(df['signal'])
        dfs[interval] = df
        signals[interval] = df.set_index('timestamp')['signal']

    # 2. 신호 AND 교집합
    df_merge = None
    for interval, sig in signals.items():
        sig = sig[sig.index.notnull()]
        sig.name = f"signal_{interval}"
        if df_merge is None:
            df_merge = sig.to_frame()
        else:
            df_merge = df_merge.join(sig, how='outer').fillna(0)

    # 3. 매수시점: 모든 전략이 동시에 1인 타이밍
    if df_merge is None or df_merge.empty:
        buy_points = []
    elif len(df_merge.columns) == 1:
        buy_points = df_merge[df_merge.iloc[:, 0] == 1].index.tolist()
    elif len(df_merge.columns) == 2:
        buy_points = df_merge[(df_merge.iloc[:, 0] == 1) & (df_merge.iloc[:, 1] == 1)].index.tolist()
    else:
        cond = (df_merge.iloc[:, 0] == 1)
        for i in range(1, len(df_merge.columns)):
            cond = cond & (df_merge.iloc[:, i] == 1)
        buy_points = df_merge[cond].index.tolist()
    
    main_interval = multi_strategies[-1]['interval']
    df_main = dfs[main_interval].set_index('timestamp')

    trades = []
    last_buy_price = None
    highest_price = None
    in_position = False
    active_positions = []   # 중복포지션/분할매수용

    # 전략별 활성화 상태 추적
    strategy_states = {}
    strategy_dfs = {}  # 미리 인덱스 설정된 DataFrame들
    
    # DataFrame들을 미리 인덱스 설정
    for interval, df in dfs.items():
        strategy_dfs[interval] = df.set_index('timestamp')
        strategy_states[interval] = {
            'active': False,
            'activation_time': None
        }

    for ts in df_main.index:
        try:   
            row = df_main.loc[ts]
            strategy_intervals = list(dfs.keys())
            
            # --- 최적화된 계단식 다중전략 진입 논리 ---
            # 각 전략의 신호를 한 번에 확인
            current_signals = {}
            for interval in strategy_intervals:
                df = strategy_dfs[interval]
                if ts in df.index:
                    current_signals[interval] = df.loc[ts, "signal"]
                else:
                    current_signals[interval] = 0
            
            # 전략 상태 업데이트 (변경된 경우만)
            for i, interval in enumerate(strategy_intervals):
                signal_val = current_signals[interval]
                
                if signal_val == 1 and not strategy_states[interval]['active']:
                    strategy_states[interval]['active'] = True
                    strategy_states[interval]['activation_time'] = ts
                
                elif signal_val == -1 and strategy_states[interval]['active']:
                    strategy_states[interval]['active'] = False
                    strategy_states[interval]['activation_time'] = None
            
            # 매수 조건 확인 (모든 전략 활성화 + 마지막 전략 신호)
            all_strategies_active = all(states['active'] for states in strategy_states.values())
            last_signal_val = current_signals[strategy_intervals[-1]]
            
            if all_strategies_active and last_signal_val == 1:
                if allow_multi_position and not in_position:
                    for n in range(split_order_count):
                        price = row['open'] * (1 + slippage + fee)
                        trades.append({
                            "date": ts,
                            "price": round(price, 4),
                            "action": "buy",
                            "reason": f"다중전략 매수 {n+1}/{split_order_count}"
                        })
                        active_positions.append({"buy_price": price, "open_ts": ts})
                elif not allow_multi_position and not in_position:
                    price = row['open'] * (1 + slippage + fee)
                    trades.append({
                        "date": ts,
                        "price": round(price, 4),
                        "action": "buy",
                        "reason": "다중전략 매수"
                    })
                    last_buy_price = price
                    highest_price = price
                    in_position = True

            # --- 매도 로직 (포지션이 있을 때) ---
            if in_position and not allow_multi_position and last_buy_price:
                # 익절
                if use_take_profit and row['high'] >= last_buy_price * (1 + take_profit_pct):
                    sell_price = last_buy_price * (1 + take_profit_pct) * (1 - slippage - fee)
                    trades.append({
                        "date": ts,
                        "price": round(sell_price, 4),
                        "action": "sell",
                        "reason": f"익절 {int(take_profit_pct*100)}%"
                    })
                    last_buy_price = None
                    highest_price = None
                    in_position = False
                    continue
                # 손절
                if use_stop_loss and row['low'] <= last_buy_price * (1 - stop_loss_pct):
                    sell_price = last_buy_price * (1 - stop_loss_pct) * (1 - slippage - fee)
                    trades.append({
                        "date": ts,
                        "price": round(sell_price, 4),
                        "action": "sell",
                        "reason": f"손절 {int(stop_loss_pct*100)}%"
                    })
                    last_buy_price = None
                    highest_price = None
                    in_position = False
                    continue
                # 트레일링스탑 로직
                if use_trailing_stop and highest_price:
                    if row['high'] > highest_price:
                        highest_price = row['high']
                    if highest_price >= last_buy_price * (1 + trailing_trigger):
                        stop_line = highest_price * (1 - trailing_gap)
                        if row['low'] <= stop_line:
                            sell_price = stop_line * (1 - slippage - fee)
                            trades.append({
                                "date": ts,
                                "price": round(sell_price, 4),
                                "action": "sell",
                                "reason": f"트레일스탑 {round(trailing_gap*100,2)}%"
                            })
                            last_buy_price = None
                            highest_price = None
                            in_position = False
                            continue
                # 신호-1
                if int(row.get('signal', 0)) == -1:
                    sell_price = row['open'] * (1 - slippage - fee)
                    trades.append({
                        "date": ts,
                        "price": round(sell_price, 4),
                        "action": "sell",
                        "reason": "신호: 매도"
                    })
                    last_buy_price = None
                    highest_price = None
                    in_position = False
                    continue

            # === 중복포지션/분할매수 청산 (중복포지션 ON)
            if allow_multi_position and active_positions:
                new_positions = []
                for pos in active_positions:
                    # 익절
                    if use_take_profit and row['high'] >= pos['buy_price'] * (1 + take_profit_pct):
                        sell_price = pos['buy_price'] * (1 + take_profit_pct) * (1 - slippage - fee)
                        trades.append({
                            "date": ts,
                            "price": round(sell_price, 4),
                            "action": "sell",
                            "reason": f"익절 {int(take_profit_pct*100)}% (분할/중복)"
                        })
                        continue
                    # 손절
                    if use_stop_loss and row['low'] <= pos['buy_price'] * (1 - stop_loss_pct):
                        sell_price = pos['buy_price'] * (1 - stop_loss_pct) * (1 - slippage - fee)
                        trades.append({
                            "date": ts,
                            "price": round(sell_price, 4),
                            "action": "sell",
                            "reason": f"손절 {int(stop_loss_pct*100)}% (분할/중복)"
                        })
                        continue
                    # 중복포지션 트레일링스탑
                    if use_trailing_stop:
                        if 'highest_price' not in pos:
                            pos['highest_price'] = pos['buy_price']
                        if row['high'] > pos['highest_price']:
                            pos['highest_price'] = row['high']
                        if pos['highest_price'] >= pos['buy_price'] * (1 + trailing_trigger):
                            stop_line = pos['highest_price'] * (1 - trailing_gap)
                            if row['low'] <= stop_line:
                                sell_price = stop_line * (1 - slippage - fee)
                                trades.append({
                                    "date": ts,
                                    "price": round(sell_price, 4),
                                    "action": "sell",
                                    "reason": f"트레일스탑 {round(trailing_gap*100,2)}% (분할/중복)"
                                })
                                continue
                    # 신호-1 (마지막 전략의 신호 사용)
                    if last_signal_val == -1:
                        sell_price = row['open'] * (1 - slippage - fee)
                        trades.append({
                            "date": ts,
                            "price": round(sell_price, 4),
                            "action": "sell",
                            "reason": "신호: 매도 (분할/중복)"
                        })
                        continue
                    # 미청산 포지션 유지
                    new_positions.append(pos)
                active_positions = new_positions

        except Exception as e:
            print(f"[ERROR at {ts}] {e}")
            continue

    profit = 1.0
    for i in range(1, len(trades), 2):
        profit *= trades[i]['price'] / trades[i-1]['price']

    # 5. 전략별 차트 데이터 준비(원래 코드 그대로)
    result = {
        "trades": trades,
        "final_profit": profit,
        "profit_percent": round((profit-1)*100, 2),
        "per_interval": {}
    }
    for interval, df_ in dfs.items():
        reset_df = df_.reset_index() if "timestamp" in df_.index.names else df_
        candles = [
            {
                "time": row["timestamp"],
                "open": row["open"],
                "high": row["high"],
                "low": row["low"],
                "close": row["close"],
                "volume": row["volume"],
                "signal": row["signal"],
                "state": row["state"],
            }
            for _, row in reset_df.iterrows()
        ]
        ma_lines = [
            {
                "time": row["timestamp"],
                "short_ma": row.get("short_ma", 0),
                "long_ma": row.get("long_ma", 0),
                "signal": row["signal"],
            }
            for _, row in reset_df.iterrows()
        ]
        result["per_interval"][interval] = {
            "candles": candles,
            "ma_lines": ma_lines
        }
    
    result["trades_by_interval"] = {}
    for i, (interval, df_) in enumerate(dfs.items()):
        trades_i = []
        is_last = (i == len(dfs)-1)
        in_position = False
        last_buy = None
        for idx, row in df_.iterrows():
            trade_obj = {
                "date": row['timestamp'],
                "price": row['open'],
                "state": int(row.get('state', 0)),
            }
            # 신호 action
            if not is_last and row['signal'] == 1:
                trade_obj["action"] = "signal"
                trade_obj["reason"] = f"{interval} 매수신호"
                trades_i.append(trade_obj)
            # 마지막 전략: buy/sell 체결
            if is_last:
                if row['signal'] == 1 and not in_position:
                    trade_obj["action"] = "buy"
                    trade_obj["reason"] = f"{interval} 매수"
                    trades_i.append(trade_obj)
                    last_buy = row['open']
                    in_position = True
                elif row['signal'] == -1 and in_position:
                    trade_obj["action"] = "sell"
                    trade_obj["reason"] = f"{interval} 매도"
                    trades_i.append(trade_obj)
                    in_position = False
                    last_buy = None
        result["trades_by_interval"][interval] = trades_i
    
    intervals = list(dfs.keys())
    if intervals:
        result["trades_by_interval"][intervals[-1]] = trades

    tradeCount = 0
    buy_stack = []
    for t in trades:
        if t["action"] == "buy":
            buy_stack.append(t)
        elif t["action"] == "sell" and buy_stack:
            buy_stack.pop(0)
            tradeCount += 1
    
    result["tradeCount"] = tradeCount

    return clean_json(result)

# ==== 전체 종목 MTF 백테스트 ====
@router.post("/backtest/multi_mtf")
def run_multi_mtf_backtest(
    multi_strategies: list = Body(...),
    slippage: float = Body(0.001),
    fee: float = Body(0.0005),
    use_trailing_stop: bool = Body(False),
    trailing_trigger: float = Body(0.03),
    trailing_gap: float = Body(0.01),
    use_take_profit: bool = Body(False),
    take_profit_pct: float = Body(0.03),
    use_stop_loss: bool = Body(False),
    stop_loss_pct: float = Body(0.03),
    show_all: bool = Body(False),
    allow_multi_position: bool = Body(False),       # 추가!
    split_order_count: int = Body(1),               # 추가!
):
    intervals = [strat["interval"] for strat in multi_strategies]
    available_symbols = get_available_symbols(intervals)
    result_list = []
    
    for symbol in sorted(available_symbols):
        try:
            res = run_mtf_backtest(
                market=symbol,
                multi_strategies=multi_strategies,
                slippage=slippage,
                fee=fee,
                use_trailing_stop=use_trailing_stop,
                trailing_trigger=trailing_trigger,
                trailing_gap=trailing_gap,
                use_take_profit=use_take_profit,
                take_profit_pct=take_profit_pct,
                use_stop_loss=use_stop_loss,
                stop_loss_pct=stop_loss_pct,
                show_all=False,
                allow_multi_position=allow_multi_position,
                split_order_count=split_order_count,
            )
            
            if isinstance(res, dict) and "error" in res:
                result_list.append({
                    "market": symbol,
                    "return_pct": 0.0,
                    "tradeCount": 0,
                    "errorMsg": res["error"]
                })
                continue
            
            # ⭐️ 백엔드에서 계산된 tradeCount 사용 ⭐️
            tradeCount = res.get("tradeCount", 0)
            return_pct = res.get("profit_percent", 0.0)

            result_list.append({
                "market": symbol,
                "return_pct": return_pct,
                "tradeCount": tradeCount,
                "errorMsg": ""
            })
            
        except Exception as e:
            result_list.append({
                "market": symbol,
                "return_pct": 0.0,
                "tradeCount": 0,
                "errorMsg": str(e)
            })
            continue
    
    return clean_json(result_list)