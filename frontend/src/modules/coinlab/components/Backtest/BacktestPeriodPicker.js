import React from "react";
import { BACKTEST_PERIOD_PRESETS } from "../../constants";

/**
 * props:
 * - value: 현재 선택된 key (예: "12m" | "all" 등)
 * - onChange: (key) => void
 */
export default function BacktestPeriodPicker({ value, onChange }) {
  return (
    <div className="w-full">
      <label className="text-sm text-gray-400 block mb-1">백테스트 기간 (일봉 기준)</label>
      <div className="flex flex-wrap gap-2">
        {BACKTEST_PERIOD_PRESETS.map((p) => {
          const selected = value === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange?.(p.key)}
              className={[
                "px-3 py-1 rounded-full border text-sm",
                selected ? "border-blue-400" : "border-gray-700",
              ].join(" ")}
              title={p.months ? `${p.months}개월` : "전체"}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
