export async function runConditionSearch(payload, signal) {
  return fetch('/api/coinlab/condition_search_run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  }).then(r => {
    if (!r.ok) throw new Error("조건검색 실행 실패");
    return r.json();
  });
}
  
  export async function fetchCandles(symbol, interval = "1d") {
    const res = await fetch(`/api/coinlab/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`);
    if (!res.ok) throw new Error("캔들 데이터 조회 실패");
    return res.json();
  }
  

  // ✅ 백테스트 시나리오 실행: 최소한의 페이로드만 전송 (심볼/기간/스텝 정의)
export async function runBacktestScenario(payload, signal) {
    const res = await fetch('/api/coinlab/backtest/run_scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`백테스트 실행 실패: ${msg || res.status}`);
    }
    return res.json();
}