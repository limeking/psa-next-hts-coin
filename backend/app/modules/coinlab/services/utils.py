# [공통 유틸 함수 모음(시간, 로그, 변환 등)]
# backend/app/modules/coinlab/services/utils.py

import json
import os

OPTIONS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "market_options.json")

def save_options(options):
    with open(OPTIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(options, f)

def load_options():
    try:
        with open(OPTIONS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"short": 5, "long": 20}  # 기본값
