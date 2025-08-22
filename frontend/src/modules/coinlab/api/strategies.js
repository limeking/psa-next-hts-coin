// frontend/src/modules/coinlab/api/strategies.js
export async function fetchStrategies() {
    const res = await fetch("/api/coinlab/backtest/strategies");
    if (!res.ok) throw new Error("전략 목록 요청 실패");
    return res.json();
  }
  