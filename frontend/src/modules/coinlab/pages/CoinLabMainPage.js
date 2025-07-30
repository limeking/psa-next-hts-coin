// frontend/src/modules/coinlab/pages/CoinLabMainPage.js
import React from "react";
import { useNavigate } from "react-router-dom";

export default function CoinLabMainPage() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ color: "#1976d2", marginBottom: 20 }}>🧪 코인랩 실험실</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>
        새로운 전략/옵션 실험, 인터랙티브 백테스트, 결과 분석을 위한 실험실 공간입니다.<br/>
        다양한 전략을 직접 조합하고 실시간으로 결과를 확인하세요!
      </p>
      <div style={{ display: "flex", gap: 32, marginTop: 24 }}>
        <button
          onClick={() => navigate("run")}
          style={{
            background: "#1976d2", color: "#fff", padding: "16px 32px",
            border: "none", borderRadius: 8, fontSize: 18, fontWeight: "bold", cursor: "pointer"
          }}
        >
          ▶️ 전략 실행/테스트
        </button>
        <button
          onClick={() => navigate("strategy")}
          style={{
            background: "#f57c00", color: "#fff", padding: "16px 32px",
            border: "none", borderRadius: 8, fontSize: 18, fontWeight: "bold", cursor: "pointer"
          }}
        >
          ⚙️ 전략/옵션 설정
        </button>
      </div>
    </div>
  );
}
