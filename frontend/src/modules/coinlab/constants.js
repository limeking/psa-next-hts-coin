// src/modules/coinlab/constants.js

export const INTERVALS = [
  { key: "1d", label: "일봉" },
  { key: "1h", label: "1시간봉" },
  { key: "15m", label: "15분봉" },
  { key: "5m", label: "5분봉" }
];

// 라벨 매핑 객체도 constants.js에서만 선언
export const INTERVAL_LABELS = Object.fromEntries(
  INTERVALS.map(i => [i.key, i.label])
);

// constants.js
// constants.js (수정본)
export function getYearsForInterval(interval) {
  const thisYear = new Date().getFullYear();
  if (interval === "1d") {
    // 최근 5년치
    return Array.from({length: 5}, (_, i) => (thisYear - i).toString());
  } else {
    // 나머지 interval은 올해 1개만
    return [thisYear.toString()];
  }
}
