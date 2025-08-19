// frontend/src/modules/coinlab/components/StrategyMenuCards.js
// 전략실험/모의투자/실전매매 메뉴
import React from "react";
import { useNavigate } from "react-router-dom";

export default function StrategyMenuCards() {
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", gap: 32, marginBottom: 24 }}>
      <button
        style={{
          flex: 1,
          padding: 32,
          borderRadius: 12,
          fontSize: 20,
          background: "#bbdefb",
          border: "none",
          cursor: "pointer",
          fontWeight: 700,
        }}
        onClick={() => navigate("/coinlab/strategy")} // ✅ 실제 페이지로 이동
        title="전략 백테스트 페이지로 이동"
      >
        전략 백테스트
      </button>

      {/* 아래 두 개는 아직 라우트가 없을 수 있으니 기존 alert 유지 */}
      <button
        style={{
          flex: 1,
          padding: 32,
          borderRadius: 12,
          fontSize: 20,
          background: "#c8e6c9",
          border: "none",
          cursor: "pointer",
          fontWeight: 700,
        }}
        onClick={() => alert("모의투자 이동")}
      >
        모의투자
      </button>

      <button
        style={{
          flex: 1,
          padding: 32,
          borderRadius: 12,
          fontSize: 20,
          background: "#ffcdd2",
          border: "none",
          cursor: "pointer",
          fontWeight: 700,
        }}
        onClick={() => alert("실전 매매 이동")}
      >
        실전 매매
      </button>
    </div>
  );
}
