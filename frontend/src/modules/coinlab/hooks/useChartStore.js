// src/modules/coinlab/hooks/useChartStore.js
import { useEffect, useState } from "react";

/**
 * 아주 가벼운 전역 상태 저장소 (의존 라이브러리 없음)
 * - 외부에서 ChartStore.set({ symbol, interval }) 호출 가능
 * - 컴포넌트에서는 useChartStore()로 구독
 */
const _state = {
  symbol: null,       // 예: "BTC_KRW"
  interval: "1h",     // "1d" | "1h" | "15m" | "5m"
};
const _listeners = new Set();

function _emit() {
  for (const l of _listeners) l();
}

export const ChartStore = {
  get() {
    return { ..._state };
  },
  set(patch) {
    Object.assign(_state, patch);
    _emit();
  },
  reset() {
    _state.symbol = null;
    _state.interval = "1h";
    _emit();
  },
  subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};

export function useChartStore() {
  const [snap, setSnap] = useState(ChartStore.get());
  useEffect(() => ChartStore.subscribe(() => setSnap(ChartStore.get())), []);
  return {
    ...snap,
    setChartTarget: (payload) => ChartStore.set(payload),
  };
}
