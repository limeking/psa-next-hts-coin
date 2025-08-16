# backend/app/modules/coinlab/services/orderbook.py
import math

def aggregate_orderbook(ob: dict, depth: int = 10):
    bids = ob.get("bids", [])[:depth]
    asks = ob.get("asks", [])[:depth]

    total_bid = sum(float(s) for _, s in bids)
    total_ask = sum(float(s) for _, s in asks)
    best_bid = float(bids[0][1]) if bids else 0.0
    best_ask = float(asks[0][1]) if asks else 0.0
    ratio = (total_bid / total_ask) if total_ask > 0 else math.inf

    return {
        "total_bid_size": total_bid,
        "total_ask_size": total_ask,
        "best_bid_size": best_bid,
        "best_ask_size": best_ask,
        "orderbook_ratio": ratio,
        "orderbook_depth": depth,
    }
