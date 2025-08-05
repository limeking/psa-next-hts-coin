# [Pydantic 데이터 스키마(요청, 응답, 조건 등 정의)]
# backend/app/modules/coinlab/schemas.py

from pydantic import BaseModel
from typing import List

class MarketOption(BaseModel):
    short: int
    long: int


class BulkRequest(BaseModel):
    symbols: List[str]
    interval: str
    year: str