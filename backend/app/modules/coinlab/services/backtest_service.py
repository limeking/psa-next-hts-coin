# backend/services/backtest_service.py
from typing import Dict, Any, List, Tuple
from pathlib import Path
import json, os, time
import pandas as pd
from datetime import datetime, timedelta
from .backtest_engine import backtest_single, ExitConfig
from .strategy_manager import resolve_signals_for_combo

DATA_DIR = Path("/data")
WATCHLISTS_DIR = DATA_DIR / "watchlists"

def _list_parquets(symbol: str, interval: str) -> List[Path]:
    base = DATA_DIR / symbol / interval
    if not base.exists(): return []
    return sorted(base.glob("*.parquet"))

def _load_candles(symbol: str, interval: str, start_ts: int = 0) -> pd.DataFrame:
    files = _list_parquets(symbol, interval)
    if not files:
        return pd.DataFrame(columns=["time","open","high","low","close","volume"])
    dfs = []
    for p in files:
        try:
            df = pd.read_parquet(p)
            # ── PATCH: 'timestamp'도 허용하고, time이 datetime/ms여도 epoch-sec로 정규화 ──
            if "time" not in df:
                if "timestamp" in df:
                    ts = df["timestamp"]
                    # 1) datetime 타입
                    if pd.api.types.is_datetime64_any_dtype(ts):
                        ts_ns = ts.astype("int64", copy=False)
                        df["time"] = (ts_ns // 1_000_000_000).astype("int64", copy=False)
                    # 숫자 타입 (us/ms/s 추정)
                    elif pd.api.types.is_numeric_dtype(ts):
                        ts_num = ts.astype("int64", copy=False)
                        if ts_num.max() > 10**14:         # us → s
                            df["time"] = (ts_num // 1_000_000).astype("int64", copy=False)
                        elif ts_num.max() > 10**12:       # ms → s
                            df["time"] = (ts_num // 1_000).astype("int64", copy=False)
                        else:                              # s
                            df["time"] = ts_num.astype("int64", copy=False)
                    # 3) 문자열 등 → 파싱
                    else:
                        parsed = pd.to_datetime(ts, errors="coerce", utc=True)
                        # tz-aware → tz-naive 로 바꾼 뒤 int 변환
                        if pd.api.types.is_datetime64tz_dtype(parsed.dtype):
                            parsed = parsed.dt.tz_convert(None)

                        df["time"] = (parsed.astype("int64", copy=False) // 1_000_000_000).astype("int64", copy=False)
                else:
                    continue
            else:
                # time이 datetime이면 epoch-sec로 정규화
                if pd.api.types.is_datetime64_any_dtype(df["time"]):
                    t = df["time"]
                    if pd.api.types.is_datetime64tz_dtype(t.dtype):
                        t = t.dt.tz_convert(None)
                    df["time"] = (t.astype("int64", copy=False) // 1_000_000_000).astype("int64", copy=False)

                        # 필수 컬럼 보정: volume 명칭 통일
            if "volume" not in df and "vol" in df:
                df = df.rename(columns={"vol": "volume"})
            if "volume" not in df and "Volume" in df:
                df = df.rename(columns={"Volume": "volume"})
            # 필수 컬럼 체크 후 정렬
            required = ["time","open","high","low","close","volume"]
            if not all(col in df.columns for col in required):
                continue
            dfs.append(df[required])

        except Exception:
            continue
    if not dfs:
        return pd.DataFrame(columns=["time","open","high","low","close","volume"])
    df = pd.concat(dfs, ignore_index=True).dropna().drop_duplicates(subset=["time"]).sort_values("time")
    if start_ts:
        df = df[df["time"] >= start_ts]
    return df.reset_index(drop=True)

def _period_key_to_start_ts(period_key: str | None, now_ts: int | None = None) -> int:
    now_ts = now_ts or int(time.time())
    k = str(period_key or "12m").strip().lower()   # ← 비문자/None도 문자열로 캐스팅
    if k == "all":
        return 0
    try:
        if k.endswith("m"):   # months
            m = int(k[:-1])
            days = m * 30
        elif k.endswith("d"):
            days = int(k[:-1])
        elif k.endswith("y"):
            days = int(k[:-1]) * 365
        else:
            days = 365
    except:
        days = 365
    return now_ts - days*24*3600

def _resolve_symbols(scope: str, watchlist_name: str | None, client_symbols: List[str] | None) -> List[str]:
    if scope == "watchlist":
        if not watchlist_name:
            return client_symbols or []
        p = WATCHLISTS_DIR / f"{watchlist_name}.json"
        if p.exists():
            try:
                data = json.loads(p.read_text("utf-8"))
                syms = [str(s) for s in data.get("symbols", []) if s]
                return list(dict.fromkeys(syms))
            except Exception:
                return client_symbols or []
        return client_symbols or []
    else:
        # "all" 및 그 외 → 전체종목
        p = DATA_DIR / "krw_symbols.json"
        if p.exists():
            try:
                syms = json.loads(p.read_text("utf-8"))
                return list(dict.fromkeys([str(s) for s in syms if s]))
            except Exception:
                return []
        return []

def run_scenario_service(payload: Dict[str, Any]) -> Dict[str, Any]:
    limit_trades = payload.get("limitTrades", 200)
    try:
        limit_trades = int(limit_trades)
    except:
        limit_trades = 200

    scope = (payload.get("scope") or "").lower()  # "ALL"/"WATCHLIST" → "all"/"watchlist"
    watchlist_name = payload.get("watchlistName")
    client_symbols = payload.get("symbols") or []
    steps = payload.get("steps") or []

    symbols = _resolve_symbols(scope, watchlist_name, client_symbols)

    results = []
    total_trades = 0

    for step in steps:
        tf = step.get("tf","1d")
        combo = step.get("comboName") or "MA20_breakout"
        period_key = step.get("periodKey") or "12m"
        exit_cfg_raw = (step.get("exit") or {})
        exit_cfg = ExitConfig(
            use_opposite = bool(exit_cfg_raw.get("useOppositeSignal", True)),
            stop_loss_pct = exit_cfg_raw.get("stopLossPct", 3.0),
            take_profit_pct = exit_cfg_raw.get("takeProfitPct", 7.0),
            time_limit_bars = (
                None if (exit_cfg_raw.get("useTimeLimit") is False) 
                else exit_cfg_raw.get("timeLimitBars", 20)
            ),
            trailing_pct = exit_cfg_raw.get("trailingPct", None),
            fee_bps = float(exit_cfg_raw.get("feeBps", 10)),
            slippage_bps = float(exit_cfg_raw.get("slippageBps", 5)),
        )

        start_ts = _period_key_to_start_ts(period_key)

        step_runs = []
        for sym in symbols:
            df = _load_candles(sym, tf, start_ts)
            if len(df) < 50:
                continue
            entry, opp_exit = resolve_signals_for_combo(df, combo)
            r = backtest_single(df, entry, opp_exit, exit_cfg, fill_next_bar=True)
            step_runs.append({
                "symbol": sym,
                "tf": tf,
                "trades": (r["trades"] if limit_trades == 0 else r["trades"][:limit_trades]),
                "stats": r["stats"]
            })
            total_trades += r["stats"]["trades"]

        results.append({
            "tf": tf,
            "combo": combo,
            "periodKey": period_key,
            "exit": exit_cfg_raw,
            "runs": step_runs
        })

    return {
        "ok": True,
        "used_symbols": symbols,
        "steps": results,
        "summary": {
            "symbols": len(symbols),
            "totalTrades": total_trades
        }
    }
