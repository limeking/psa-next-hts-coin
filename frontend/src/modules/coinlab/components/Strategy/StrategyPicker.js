// frontend/src/modules/coinlab/components/Strategy/StrategyPicker.js
import React from "react";
import { STRATEGY_OPTIONS } from "../../constants";

export default function StrategyPicker({ value, onChange, disabled }) {
  return (
    <div style={{ minWidth: 240 }}>
      <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 6 }}>
        전략/패턴
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value || null)}
        disabled={disabled}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8 }}
      >
        <option value="">선택하세요</option>
        {STRATEGY_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
