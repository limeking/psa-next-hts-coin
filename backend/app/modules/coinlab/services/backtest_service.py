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

# ── 상태 게이팅: 1단계 entry로 '열고', opp_exit 또는 time_limit로 '닫는' 레짐 마스크 생성
def _build_state_mask(entry_sr, opp_exit_sr=None, time_limit_bars=None):
    # entry_sr, opp_exit_sr: 0/1 Series (df.index와 길이 동일)
    import numpy as np
    idx = entry_sr.index
    entry = entry_sr.fillna(0).astype(int).to_numpy()
    oppx = None if opp_exit_sr is None else opp_exit_sr.fillna(0).astype(int).to_numpy()
    tl = int(time_limit_bars) if time_limit_bars else None

    open_flag = False
    start_i = -1
    out = np.zeros(len(entry), dtype=bool)

    for i in range(len(entry)):
        if entry[i] > 0:
            open_flag = True
            start_i = i
        if open_flag:
            out[i] = True
            # 닫는 조건: 반대신호 or 시간제한
            if oppx is not None and oppx[i] > 0:
                open_flag = False
                start_i = -1
            elif tl is not None and start_i >= 0 and (i - start_i + 1) >= tl:
                open_flag = False
                start_i = -1
    return pd.Series(out, index=idx)


def _list_parquets(symbol: str, interval: str) -> List[Path]:
    base = DATA_DIR / symbol / interval
    if not base.exists(): return []
    return sorted(base.glob("*.parquet"))

def _load_candles(symbol: str, interval: str, start_ts: int = 0, end_ts: int | None = None) -> pd.DataFrame:
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
                            parsed = parsed.dt.tz_convert('UTC').dt.tz_localize(None)

                        df["time"] = (parsed.astype("int64", copy=False) // 1_000_000_000).astype("int64", copy=False)
                else:
                    continue
            else:
                # time이 datetime이면 epoch-sec로 정규화
                if pd.api.types.is_datetime64_any_dtype(df["time"]):
                    t = df["time"]
                    if pd.api.types.is_datetime64tz_dtype(t.dtype):
                        t = t.dt.tz_convert('UTC').dt.tz_localize(None)
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
    if end_ts:
        df = df[df["time"] <= end_ts]
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


# === Walk-Forward, Metrics, EoT helpers (add near other helpers) ===
def _split_folds_by_time(first_ts: int, last_ts: int, folds: int, scheme: str = "rolling"):
    """[(train_start, train_end, test_start, test_end), ...] 반환. 지금은 간단히 test 구간만 사용."""
    if folds < 2: folds = 2
    span = last_ts - first_ts
    step = span // folds
    out = []
    for k in range(folds):
        test_start = first_ts + step * k
        test_end   = first_ts + step * (k+1) if k < folds-1 else last_ts
        out.append((None, None, test_start, test_end))
    return out

def _calc_metrics_from_trades(trades: list, first_ts: int, last_ts: int) -> dict:
    import math
    if not trades:
        return dict(
            trades=0, wins=0,
            winRate=0.0, expectancy=0.0,
            pf=0.0, profitFactor=0.0,  # ← 별칭도 함께
            avgWinPct=0.0, avgLossPct=0.0,
            mdd=0.0, cagr=0.0
        )

    pnls = []
    for t in trades:
        v = (
            t.get("pnl")
            or t.get("pnl_amount")
            or t.get("pnlPct")
            or t.get("pnl_pct")
            or 0.0
        )
        try: pnls.append(float(v))
        except: pnls.append(0.0)

    total = len(pnls)
    wins  = sum(1 for x in pnls if x > 0)
    losses= sum(1 for x in pnls if x < 0)
    sum_pos = sum(x for x in pnls if x > 0)
    sum_neg = -sum(x for x in pnls if x < 0)
    pf = (sum_pos / sum_neg) if sum_neg > 0 else (999.0 if sum_pos > 0 else 0.0)
    win_rate = (wins / total) if total else 0.0
    expectancy = (sum(pnls) / total) if total else 0.0

    # 평균 익절/손절(%) — pnls가 % 단위라고 가정
    pos_list = [x for x in pnls if x > 0]
    neg_list = [-x for x in pnls if x < 0]
    avg_win_pct  = (sum(pos_list)/len(pos_list)) if pos_list else 0.0
    avg_loss_pct = (sum(neg_list)/len(neg_list)) if neg_list else 0.0

        # --- MDD: (기존 유지) 단순 누적합 에퀴티로 최대낙폭 계산 ---
    eq_add = []
    c = 0.0
    for x in pnls:
        c += x
        eq_add.append(c)
    peak, mdd = -1e18, 0.0
    for v in eq_add:
        if v > peak: peak = v
        dd = peak - v
        if dd > mdd: mdd = dd

    # --- CAGR: 복리(곱)기준으로 계산 + 안전 가드 ---
    # 복리 에퀴티: 초기 1.0에서 시작해 (1 + pnl%)를 계속 곱함
    equity = 1.0
    for x in pnls:
        equity *= (1.0 + float(x))
        # equity가 0보다 작아질 수 있음(이론상). 그럴 땐 바로 종료
        if equity <= 0:
            equity = 0.0
            break

    years = max((last_ts - first_ts) / (365*24*3600), 1e-9)

    if equity <= 0.0:
        # 복리 기준 최종자산이 0 이하면 CAGR을 -100%로 고정
        cagr = -1.0
    else:
        # equity = 최종자산(초기 1.0 기준); CAGR = equity^(1/years) - 1
        cagr = (equity ** (1.0 / years)) - 1.0

    cagr = float(cagr)
    if not math.isfinite(cagr):
        cagr = -1.0  # 혹시 모를 NaN/inf도 방지

    # 깔끔하게 반올림해서 반환
    return dict(
        trades=total,
        wins=wins,
        winRate=round(win_rate, 4),
        expectancy=round(expectancy, 4),
        pf=round(pf, 3),
        profitFactor=round(pf, 3),
        avgWinPct=round(avg_win_pct, 2) if 'avg_win_pct' in locals() else 0.0,
        avgLossPct=round(avg_loss_pct, 2) if 'avg_loss_pct' in locals() else 0.0,
        mdd=round(mdd, 3),
        cagr=round(cagr, 4),
    )


def _tag_eot(trades: list, last_ts: int):
    """exit_time이 마지막 봉이면 reason='EOT' 부여(없을 때만)."""
    for t in trades or []:
        try:
            rt = t.get("reason")
            et = (
                t.get("exit_time")
                or t.get("exitTs")
                or t.get("exitTime")   # ← 이 줄 추가
                or None
            )
            if (not rt) and et and int(et) == int(last_ts):
                t["reason"] = "EOT"
        except:
            continue
    return trades


def run_scenario_service(payload: Dict[str, Any]) -> Dict[str, Any]:
    # 새 옵션 (기본값)
    wf = payload.get("walkForward") or {}      # 예: {"folds": 4, "scheme": "rolling"}
    folds = int(wf.get("folds", 0) or 0)
    scheme = str(wf.get("scheme") or "rolling")

    profiles = payload.get("costProfiles") or []  # 예: [{"name":"base","fee_bps":10,"slippage_bps":5}, ...]
    if not profiles:
        profiles = [{"name":"base","fee_bps":10.0,"slippage_bps":5.0}]  # 기존 기본값(엔진 전달값)과 동일
    include_eot = bool(payload.get("includeEoTInStats", True))

    group_by = str(payload.get("groupBy") or "").lower()  # "theme" 등

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

    # 체이닝 모드: 기본은 병렬(parallel), 요청에서 "chainMode": "gated" 이면 바(봉) AND 게이팅
    chain_mode = str((payload.get("chainMode") or "parallel")).strip().lower()

    # 이벤트-AND용 누적(이전 답변에서 쓰던 것 유지)
    gating_prev_masks: Dict[str, pd.Series] = {}

    # 상태 게이팅용: 1단계 레짐 마스크(심볼별, 'time'을 인덱스로 보관)
    state_masks_by_symbol: Dict[str, Dict[int, pd.Series]] = {}
    last_index = len(steps) - 1


    results = []
    total_trades = 0

    for step_index, step in enumerate(steps):
        tf = step.get("tf","1d")
        combo = step.get("comboName") or "MA20_breakout"
        period_key = step.get("periodKey") or "12m"
        exit_cfg_raw = (step.get("exit") or {})
        exit_cfg = ExitConfig(
            use_opposite = bool(exit_cfg_raw.get("useOppositeSignal", False)),
            stop_loss_pct = (exit_cfg_raw.get("stopLossPct") if exit_cfg_raw.get("useStopLoss") else None),
            take_profit_pct = (exit_cfg_raw.get("takeProfitPct") if exit_cfg_raw.get("useTakeProfit") else None),
            time_limit_bars = (exit_cfg_raw.get("timeLimitBars") if exit_cfg_raw.get("useTimeLimit") else None),
            trailing_pct = (exit_cfg_raw.get("trailingPct") if exit_cfg_raw.get("useTrailingStop") else None),
            fee_bps = 10.0,
            slippage_bps = 5.0
        )

        start_ts = _period_key_to_start_ts(period_key)

        step_runs = []
        for sym in symbols:
            df = _load_candles(sym, tf, start_ts)
            if len(df) < 50:
                continue

             # 엔트리/반대신호 생성 (콤보별)
            entry, opp_exit = resolve_signals_for_combo(df, combo)
            entry = entry.reindex(df.index).fillna(0).astype(int)
            
            if opp_exit is not None:
                opp_exit = opp_exit.reindex(df.index).fillna(0).astype(int)

            # gated 모드 초기 시드: 0단계 엔트리를 기준으로 누적 AND 시작
            if chain_mode == "gated" and step_index == 0:
                gating_prev_masks[sym] = (entry > 0)


            if chain_mode == "state" and step_index < last_index:
                # ① 레짐 마스크 생성 (반대신호 옵션이 OFF면 opp_exit_sr=None)
                regime_mask_local = _build_state_mask(
                    entry_sr=entry,
                    opp_exit_sr=(opp_exit if exit_cfg.use_opposite else None),
                    time_limit_bars=exit_cfg.time_limit_bars
                )

                # ② 멀티 TF 정렬을 위해 'time'(epoch-sec)을 인덱스로 갖는 Series로 변환
                regime_mask_time = pd.Series(
                    regime_mask_local.astype(bool).to_numpy(),
                    index=df["time"].astype("int64")
                )

                # ③ 심볼별 단계 dict에 저장
                d = state_masks_by_symbol.get(sym) or {}
                d[step_index] = regime_mask_time
                state_masks_by_symbol[sym] = d

                # ④ 레짐 단계는 매매 금지 → 이 단계의 entry는 0
                entry = (entry * 0).astype(int)

            if chain_mode == "state" and step_index == last_index:
                prev_masks = (state_masks_by_symbol.get(sym) or {})
                if not prev_masks:
                    entry = (entry * 0).astype(int)
                else:
                    t = df["time"].astype("int64")
                    combined = None
                    for mask in (prev_masks[k] for k in sorted(prev_masks.keys())):
                        aligned = mask.reindex(t, method="ffill").fillna(False).to_numpy()
                        combined = aligned if combined is None else (combined & aligned)
                    entry = pd.Series(((entry > 0).to_numpy() & combined).astype(int), index=df.index)

            # ── (B) 이벤트-AND 게이팅: 이전 단계 엔트리와 AND
            if chain_mode == "gated" and step_index > 0:
                prev_mask = gating_prev_masks.get(sym)
                if prev_mask is not None:
                    entry = ((entry > 0) & (prev_mask.astype(bool))).astype(int)
                # 누적 갱신(이번 단계 엔트리도 다음 단계 기준이 됨)
                cur_entry_mask = (entry > 0)
                gating_prev_masks[sym] = (gating_prev_masks[sym] & cur_entry_mask) if sym in gating_prev_masks else cur_entry_mask
            # 실제 백테스트 실행 (엔진 그대로)
            # === 비용 시나리오 × 워크포워드 ===
            # 폴드 경계 계산
            first_ts = int(df["time"].iloc[0]); last_ts = int(df["time"].iloc[-1])
            folds_plan = _split_folds_by_time(first_ts, last_ts, folds, scheme) if folds > 0 else [(None,None,first_ts,last_ts)]

            sym_out = {"symbol": sym, "tf": tf, "profiles": []}
            for prof in profiles:
                prof_name = str(prof.get("name") or "base")
                fee_bps = float(prof.get("fee_bps") or 10.0)
                slp_bps = float(prof.get("slippage_bps") or 5.0)
                prof_steps = []
                prof_total_trades = 0

                for (_ts, _te, test_start, test_end) in folds_plan:
                    dff = df[(df["time"] >= test_start) & (df["time"] <= test_end)].reset_index(drop=True)
                    if len(dff) < 50:
                        prof_steps.append({"fold": [test_start, test_end], "trades": [], "stats": {}})
                        continue

                    # 엔진 호출: 비용 시나리오를 ExitConfig에 주입
                    exit_cfg_local = ExitConfig(
                        use_opposite = exit_cfg.use_opposite,
                        stop_loss_pct = exit_cfg.stop_loss_pct,
                        take_profit_pct = exit_cfg.take_profit_pct,
                        time_limit_bars = exit_cfg.time_limit_bars,
                        trailing_pct = exit_cfg.trailing_pct,
                        fee_bps = fee_bps,
                        slippage_bps = slp_bps,
                    )
                    r = backtest_single(dff, entry.reindex(dff.index).fillna(0).astype(int), opp_exit.reindex(dff.index).fillna(0).astype(int) if opp_exit is not None else None, exit_cfg_local, fill_next_bar=True)

                    # EoT 라벨링(원본에 없을 수 있음)
                    trades = _tag_eot(r.get("trades") or [], int(dff["time"].iloc[-1]))
                    # includeEoTInStats가 False면 EOT 제외 후 지표 계산
                    trades_for_stats = [t for t in trades if include_eot or (t.get("reason") != "EOT")]
                    metrics = _calc_metrics_from_trades(trades_for_stats, int(dff["time"].iloc[0]), int(dff["time"].iloc[-1]))

                    prof_steps.append({
                        "fold": [test_start, test_end],
                        "trades": trades,
                        "stats": {**(r.get("stats") or {}), **metrics}
                    })
                    prof_total_trades += metrics["trades"]

                sym_out["profiles"].append({"name": prof_name, "runs": prof_steps, "totalTrades": prof_total_trades})

            step_runs.append(sym_out)
            # total_trades는 대표 프로파일(base) 합계로 누적
            base_prof = next((p for p in sym_out["profiles"] if p["name"]=="base"), sym_out["profiles"][0])
            total_trades += base_prof["totalTrades"]

        # 단계 결과는 '심볼 루프'가 끝난 후 한 번만 추가
        results.append({
            "tf": tf,
            "combo": combo,
            "periodKey": period_key,
            "exit": exit_cfg_raw,
            "runs": step_runs,   # [{ symbol, tf, profiles:[{name, runs:[{fold, trades, stats}], totalTrades}] }]
        })

    resp = {
        "ok": True,
        "used_symbols": symbols,
        "steps": results,
        "summary": {
            "symbols": len(symbols),
            "totalTrades": total_trades,
            "chainMode": chain_mode,
        }
    }

    # 집합 분석 (예: theme)
    if group_by == "theme":
        # 예시: /data/coin_theme_mapping.json 사용 (형식: { "BTC_KRW": ["AI","Layer1"], ... })
        themap_path = DATA_DIR / "coin_theme_mapping.json"
        groups = {}
        the_map = {}
        try:
            if themap_path.exists():
                the_map = json.loads(themap_path.read_text("utf-8"))
        except:
            the_map = {}
        # base 프로파일만 집계(원하면 전 프로파일 확장 가능)
        for st in results:
            for symrow in st["runs"]:
                sym = symrow["symbol"]
                base_prof = next((p for p in symrow["profiles"] if p["name"]=="base"), symrow["profiles"][0])
                # 폴드별 stats 평균 집계
                pf_vals = [r["stats"].get("pf", 0.0) for r in base_prof["runs"] if r.get("stats")]
                wr_vals = [r["stats"].get("winRate", 0.0) for r in base_prof["runs"] if r.get("stats")]
                mdd_vals= [r["stats"].get("mdd", 0.0) for r in base_prof["runs"] if r.get("stats")]
                agg = {
                    "pf": (sum(pf_vals)/len(pf_vals)) if pf_vals else 0.0,
                    "winRate": (sum(wr_vals)/len(wr_vals)) if wr_vals else 0.0,
                    "mdd": (sum(mdd_vals)/len(mdd_vals)) if mdd_vals else 0.0,
                }
                themes = the_map.get(sym, ["(unclassified)"])
                for th in themes:
                    if th not in groups: groups[th] = {"count":0, "symbols":[], "avg": {"pf":0.0,"winRate":0.0,"mdd":0.0}}
                    g = groups[th]
                    g["count"] += 1
                    g["symbols"].append(sym)
                    # 러닝 평균
                    n = g["count"]
                    g["avg"]["pf"]      = g["avg"]["pf"]      + (agg["pf"] - g["avg"]["pf"])/n
                    g["avg"]["winRate"] = g["avg"]["winRate"] + (agg["winRate"] - g["avg"]["winRate"])/n
                    g["avg"]["mdd"]     = g["avg"]["mdd"]     + (agg["mdd"] - g["avg"]["mdd"])/n
        resp["groups"] = {"theme": groups}

    resp["profilesMeta"] = [p["name"] for p in profiles]
    return resp

