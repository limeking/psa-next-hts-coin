// src/pages/MainPage.js
import { useNavigate } from "react-router-dom";

export default function MainPage() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, marginBottom: 16, color: "#1976d2" }}>
        🚀 PSA-NEXT-HTS-COIN 홈
      </h1>
      <p style={{ color: "#555", marginBottom: 32 }}>
        실전 HTS 스타일의 트레이딩/전략 실험/시장 대시보드<br />
        원하는 메뉴를 선택하세요!
      </p>

      {/* HTS처럼 메인메뉴 → 대시보드, 전략실험 등 분기 */}
      <div style={{ display: "flex", gap: 32 }}>
        <button
          style={{ flex: 1, padding: 40, fontSize: 22, borderRadius: 12, background: "#e3f2fd", border: "none", cursor: "pointer" }}
          onClick={() => navigate("/coinlab/dashboard")}
        >
          📊 시장 대시보드
        </button>
        <button
          style={{ flex: 1, padding: 40, fontSize: 22, borderRadius: 12, background: "#fffde7", border: "none", cursor: "pointer" }}
          onClick={() => navigate("/coinlab")}
        >
          ⚙️ 전략 실험실
        </button>
        {/* 기타 메뉴 계속 추가 가능 */}
      </div>

      <div style={{ marginTop: 48, color: "#888", fontSize: 14 }}>
        <hr />
        <div>📢 PSA-NEXT 실전 HTS 시스템 - 2025</div>
        <div>ver 0.9.0 / 전체 구조 및 자동화 기반 완성</div>
      </div>
    </div>
  );
}
