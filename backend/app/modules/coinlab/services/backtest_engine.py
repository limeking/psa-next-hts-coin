# backend/services/backtest_engine.py
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import math
import pandas as pd

@dataclass
class ExitConfig:
    use_opposite: bool = True
    stop_loss_pct: Optional[float] = 3.0     # % (e.g., 3 -> 3%)
    take_profit_pct: Optional[float] = 7.0
    time_limit_bars: Optional[int] = 20
    trailing_pct: Optional[float] = None     # e.g., 5.0
    fee_bps: float = 10.0                    # round-trip bps (0.1% = 10bps)
    slippage_bps: float = 5.0                # per fill bps

def _pct(a, b):
    if b == 0: return 0.0
    return (a/b - 1.0) * 100.0

def backtest_single(
    df: pd.DataFrame,
    entry_sig: pd.Series,
    opp_exit_sig: Optional[pd.Series],
    exit_cfg: ExitConfig,
    fill_next_bar=True
) -> Dict[str, Any]:
    """
    룩어헤드 금지: 시그널 바 다음 바의 시가로 체결(가능하면).
    df: columns = [time, open, high, low, close, volume] (time=epoch sec)
    entry_sig, opp_exit_sig: bool/int Series(1/0)
    """
    df = df.reset_index(drop=True)
    entry_sig = entry_sig.reindex(df.index).fillna(0).astype(int)
    opp_exit_sig = opp_exit_sig.reindex(df.index).fillna(0).astype(int) if opp_exit_sig is not None else pd.Series(0, index=df.index)

    pos = None
    trades: List[Dict[str, Any]] = []

    fee = exit_cfg.fee_bps / 10000.0     # bps->rate
    slip = exit_cfg.slippage_bps / 10000.0

    for i in range(len(df)):
        o,h,l,c,t = df.loc[i, ["open","high","low","close","time"]]
        # 1) 진입
        if pos is None and entry_sig.iloc[i] == 1:
            j = i+1 if fill_next_bar else i
            if j >= len(df): break
            fill = float(df.loc[j, "open"])
            # buy price with slippage+fee (one side)
            buy = fill * (1 + slip) * (1 + fee/2.0)
            pos = {
                "entry_idx": j,
                "entry_time": int(df.loc[j, "time"]),
                "entry_price": buy,
                "age": 0,
                "peak": buy
            }
            continue

        # 2) 포지션 관리/청산
        if pos is not None:
            pos["age"] += 1
            # 롱 포지션 피크는 intrabar 고가 기준이 안전
            pos["peak"] = max(pos["peak"], h)

            # 교체 후
            exit_reasons = []

            # 1) 손절 (최우선)
            if exit_cfg.stop_loss_pct is not None and pos["entry_price"] > 0:
                if _pct(c, pos["entry_price"]) <= -abs(exit_cfg.stop_loss_pct):
                    exit_reasons.append("stop_loss")

            # 2) 트레일링 스탑
            if exit_cfg.trailing_pct:
                trail_line = pos["peak"] * (1 - abs(exit_cfg.trailing_pct)/100.0)
                if c <= trail_line:
                    exit_reasons.append("trailing_stop")

            # 3) 반대신호 청산
            if exit_cfg.use_opposite and opp_exit_sig.iloc[i] == 1:
                exit_reasons.append("opposite_signal")

            # 4) 시간 제한
            if exit_cfg.time_limit_bars and pos["age"] >= int(exit_cfg.time_limit_bars):
                exit_reasons.append("time_limit")

            # 5) 익절
            if exit_cfg.take_profit_pct is not None and pos["entry_price"] > 0:
                if _pct(c, pos["entry_price"]) >= abs(exit_cfg.take_profit_pct):
                    exit_reasons.append("take_profit")

            if exit_reasons:
                j = i+1 if fill_next_bar else i
                if j >= len(df):
                    # 마지막 봉이면 종가로 강제 종료
                    fill = float(c)
                else:
                    fill = float(df.loc[j, "open"])
                # sell price with slippage+fee (one side)
                sell = fill * (1 - slip) * (1 - fee/2.0)
                pnl_pct = _pct(sell, pos["entry_price"])
                trades.append({
                    "entryTime": pos["entry_time"],
                    "entryPrice": round(pos["entry_price"], 8),
                    "exitTime": int(df.loc[j if j < len(df) else i, "time"]),
                    "exitPrice": round(sell, 8),
                    "pnlPct": round(pnl_pct, 4),
                    "bars": pos["age"],
                    "reason": exit_reasons[0]
                })
                pos = None

    # 포지션 남았으면 마지막 바 종가로 강제 청산
    if pos is not None:
        last_o, last_c, last_t = float(df.iloc[-1]["open"]), float(df.iloc[-1]["close"]), int(df.iloc[-1]["time"])
        sell = last_c * (1 - slip) * (1 - fee/2.0)
        trades.append({
            "entryTime": pos["entry_time"],
            "entryPrice": round(pos["entry_price"], 8),
            "exitTime": last_t,
            "exitPrice": round(sell, 8),
            "pnlPct": round(_pct(sell, pos["entry_price"]), 4),
            "bars": pos["age"],
            "reason": "force_close_at_end"
        })

    # 통계
    if trades:
        pnl = [t["pnlPct"] for t in trades]
        wins = [x for x in pnl if x > 0]
        losses = [x for x in pnl if x <= 0]
        win_rate = (len(wins)/len(pnl))*100.0
        avg_win = sum(wins)/len(wins) if wins else 0.0
        avg_loss = sum(losses)/len(losses) if losses else 0.0
        profit_factor = (sum(wins)/abs(sum(losses))) if losses else math.inf
    else:
        win_rate = avg_win = avg_loss = profit_factor = 0.0

    return {
        "trades": trades,
        "stats": {
            "trades": len(trades),
            "winRate": round(win_rate, 2),
            "avgWinPct": round(avg_win, 3),
            "avgLossPct": round(avg_loss, 3),
            "profitFactor": round(profit_factor, 3) if profit_factor != math.inf else None
        }
    }
