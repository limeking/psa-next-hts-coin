# backend/routers/backtest.py
from fastapi import APIRouter, Body, HTTPException
from typing import Dict, Any
from ..services.backtest_service import run_scenario_service

router = APIRouter(prefix="/api/coinlab", tags=["backtest"])

@router.post("/backtest/run_scenario")
def run_scenario(payload: Dict[str, Any] = Body(...)):
    try:
        return run_scenario_service(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"run_scenario failed: {e}")
