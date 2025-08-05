import os
import logging
from pathlib import Path
from typing import List
from datetime import datetime
import requests
import shutil
import pandas as pd
from ..routers.coin_data import update_coin_data

BASE_DIR = "/data"
LOG_DIR = "/logs/backend"
STATUS_DIR = "/data/operation_status"
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(STATUS_DIR, exist_ok=True)

logfile = os.path.join(LOG_DIR, "coin_data_ops.log")
logging.basicConfig(
    filename=logfile,
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO
)
logger = logging.getLogger("coin_data")



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

def log_and_record(symbol, interval, year, action, result, message=""):
    logger.info(f"{action} | {symbol} | {interval} | {year} | {result} | {message}")

def delete_coin_data(symbol: str, interval: str = "1d", year: str = "2024"):
    symbol = normalize_bithumb_symbol(symbol)
    interval = normalize_bithumb_interval(interval)
    try:
        file_path = Path(BASE_DIR) / symbol / interval / f"{year}.parquet"
        if file_path.exists():
            file_path.unlink()
            log_and_record(symbol, interval, year, "DELETE", "SUCCESS")
            return True
        else:
            log_and_record(symbol, interval, year, "DELETE", "NOT_FOUND")
            return False
    except Exception as e:
        log_and_record(symbol, interval, year, "DELETE", "ERROR", str(e))
        return False

def bulk_delete(symbols: List[str], interval: str, year: str, status_id: str):
    symbols = [normalize_bithumb_symbol(s) for s in symbols]
    interval = normalize_bithumb_interval(interval)
    status = {
        "total": len(symbols),
        "current": 0,
        "success": [],
        "failed": [],
        "start_time": datetime.now().isoformat()
    }
    for symbol in symbols:
        ok = delete_coin_data(symbol, interval, year)
        if ok:
            status["success"].append(symbol)
        else:
            status["failed"].append(symbol)
        status["current"] += 1
        with open(f"{STATUS_DIR}/{status_id}.json", "w", encoding="utf-8") as f:
            import json; json.dump(status, f, ensure_ascii=False, indent=2)
    status["end_time"] = datetime.now().isoformat()
    with open(f"{STATUS_DIR}/{status_id}.json", "w", encoding="utf-8") as f:
        import json; json.dump(status, f, ensure_ascii=False, indent=2)
    logger.info(f"BULK_DELETE_FINISHED | {interval} | {year} | success:{len(status['success'])} failed:{len(status['failed'])}")
    return status

def bulk_update(symbols: List[str], interval: str, year: str, status_id: str):
    symbols = [normalize_bithumb_symbol(s) for s in symbols]
    interval = normalize_bithumb_interval(interval)
    status = {
        "total": len(symbols),
        "current": 0,
        "success": [],
        "failed": [],
        "start_time": datetime.now().isoformat()
    }
    for symbol in symbols:
        try:
            ok = update_coin_data(symbol, interval, year)
            if ok:
                status["success"].append(symbol)
            else:
                status["failed"].append(symbol)
            status["current"] += 1
            with open(f"{STATUS_DIR}/{status_id}.json", "w", encoding="utf-8") as f:
                import json; json.dump(status, f, ensure_ascii=False, indent=2)
        except Exception as e:
            status["failed"].append(symbol)
    status["end_time"] = datetime.now().isoformat()
    with open(f"{STATUS_DIR}/{status_id}.json", "w", encoding="utf-8") as f:
        import json; json.dump(status, f, ensure_ascii=False, indent=2)
    return status


def bulk_download(symbols: List[str], interval: str, year: str, status_id: str):
    symbols = [normalize_bithumb_symbol(s) for s in symbols]
    interval = normalize_bithumb_interval(interval)
    # (실제 다운로드 로직은 필요에 따라 구현)
    # 예: zip 파일로 묶어서 /data/downloads/{status_id}.zip 생성
    # 여기서는 진행률/성공/실패만 기록
    status = {
        "total": len(symbols),
        "current": 0,
        "success": [],
        "failed": [],
        "start_time": datetime.now().isoformat()
    }
    for symbol in symbols:
        try:
            file_path = Path(BASE_DIR) / symbol / interval / f"{year}.parquet"
            if file_path.exists():
                # (실전: zip 등에 파일 추가)
                log_and_record(symbol, interval, year, "DOWNLOAD", "SUCCESS")
                status["success"].append(symbol)
            else:
                log_and_record(symbol, interval, year, "DOWNLOAD", "NOT_FOUND")
                status["failed"].append(symbol)
        except Exception as e:
            log_and_record(symbol, interval, year, "DOWNLOAD", "ERROR", str(e))
            status["failed"].append(symbol)
        status["current"] += 1
        with open(f"{STATUS_DIR}/{status_id}.json", "w", encoding="utf-8") as f:
            import json; json.dump(status, f, ensure_ascii=False, indent=2)
    status["end_time"] = datetime.now().isoformat()
    with open(f"{STATUS_DIR}/{status_id}.json", "w", encoding="utf-8") as f:
        import json; json.dump(status, f, ensure_ascii=False, indent=2)
    logger.info(f"BULK_DOWNLOAD_FINISHED | {interval} | {year} | success:{len(status['success'])} failed:{len(status['failed'])}")
    return status



def delete_coin_all_data(symbol: str):
    """해당 심볼의 모든 데이터(parquet 포함 폴더) 삭제"""
    from pathlib import Path
    symbol = normalize_bithumb_symbol(symbol)
    folder = Path("/data") / symbol
    if folder.exists() and folder.is_dir():
        shutil.rmtree(folder)
        return True
    return False