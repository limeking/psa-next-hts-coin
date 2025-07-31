# [Pydantic 데이터 스키마(요청, 응답, 조건 등 정의)]
# backend/app/modules/coinlab/schemas.py

from pydantic import BaseModel

class MarketOption(BaseModel):
    short: int
    long: int
