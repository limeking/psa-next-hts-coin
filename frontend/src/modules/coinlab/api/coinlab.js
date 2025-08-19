// frontend/src/modules/coinlab/api/coinlab.js
import {
  runConditionSearch as coreRun,
  fetchCandles as coreFetchCandles,
  runBacktestScenario as coreRunBacktest,
} from "../services/coinApi";

// 그대로 패스스루
export async function runConditionSearch(payload) {
  return coreRun(payload);
}

// CommonChartPanel이 기대하는 형태로 래핑
export async function fetchCandles(symbol, interval = "1d", limit = 500) {
  const candles = await coreFetchCandles({ symbol, interval, limit });
  return { candles, symbol, interval };
}


// ✅ 패스스루: 백테스트 실행
export async function runBacktestScenario(payload, signal) {
  return coreRunBacktest(payload, signal);
}