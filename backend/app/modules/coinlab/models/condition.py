from pydantic import BaseModel, Field
from typing import Literal, List, Optional

Comparator = Literal["gt","gte","lt","lte","eq","neq","cross_up","cross_down"]
Indicator = Literal[
    "price_change_pct","volume_ma","rsi","macd","bbands","ema","sma","obv","vwap"
]

class Condition(BaseModel):
    indicator: Indicator
    comparator: Comparator
    value: float | int
    lookback: int = 0  # 필요시

class Combo(BaseModel):
    name: str
    all_of: List[Condition] = Field(default_factory=list)
    any_of: List[Condition] = Field(default_factory=list)
    none_of: List[Condition] = Field(default_factory=list)
