// 전략실험/모의투자/실전매매 메뉴
import React from "react";

export default function StrategyMenuCards() {
  return (
    <div style={{ display: "flex", gap: 32, marginBottom: 24 }}>
      <button style={{ flex: 1, padding: 32, borderRadius: 12, fontSize: 20, background: "#bbdefb", border: "none" }}
        onClick={() => alert("전략 백테스트 이동")}>
        전략 백테스트
      </button>
      <button style={{ flex: 1, padding: 32, borderRadius: 12, fontSize: 20, background: "#c8e6c9", border: "none" }}
        onClick={() => alert("모의투자 이동")}>
        모의투자
      </button>
      <button style={{ flex: 1, padding: 32, borderRadius: 12, fontSize: 20, background: "#ffcdd2", border: "none" }}
        onClick={() => alert("실전 매매 이동")}>
        실전 매매
      </button>
    </div>
  );
}
