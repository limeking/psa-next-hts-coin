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
  