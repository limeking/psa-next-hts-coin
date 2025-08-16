import React, { useState } from "react";
import { useNavigate } from "react-router-dom";   // 반드시 추가!
import MarketStatusBanner from '../components/Dashboard/MarketStatusBanner';
import SectorThemeTable from '../components/SectorThemeTable';
import StockRankingTable from '../components/Common/StockRankingTable';
import StrategyMenuCards from '../components/StrategyMenuCards';
import NoticeBar from '../components/Dashboard/NoticeBar';
import ThemeMappingEditor from '../components/Theme/ThemeMappingEditor';

export default function HTSDashboardPage() {
  const navigate = useNavigate();   // 반드시 추가!
  const [showEditor, setShowEditor] = useState(false);

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <button
        style={{
          marginBottom: 24,
          padding: "10px 28px",
          borderRadius: 8,
          background: "#f5f5f5",
          border: "1px solid #1976d2",
          color: "#1976d2",
          fontWeight: "bold",
          fontSize: 16,
          cursor: "pointer",
        }}
        onClick={() => navigate("/coinlab")}
      >
        🏠 메인페이지로
      </button>

      <h2 style={{ fontWeight: 800, fontSize: 28, marginBottom: 24, color: "#1976d2" }}>
        📊 실전 HTS 시장 대시보드
      </h2>
      {/* === 여기가 추천 위치 === */}
      <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
        <button
          onClick={() => setShowEditor(true)}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            background: "#ffecb3",
            border: "1px solid #ff9800",
            color: "#ff9800",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          🛠️ 테마 매핑 에디터
        </button>
        <button
          onClick={() => navigate("/coinlab/condition_search")}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            background: "#ffecb3",
            border: "1px solid #ff9800",
            color: "#ff9800",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          🧠 조건검색 (실전 HTS)
        </button>
        <button
          onClick={() => navigate("/coinlab/coin_data_manager")}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            background: "#e3f2fd",
            border: "1px solid #1976d2",
            color: "#1976d2",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          📂 종목데이터관리
        </button>
        <button
          onClick={() => navigate("/coinlab/watchlist")}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            background: "#e3f2fd",
            border: "1px solid #1976d2",
            color: "#1976d2",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          ⭐ 관심종목
        </button>
      </div>


      {/* 모달/팝업 형식 */}
      {showEditor && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.2)", zIndex: 2000, display: "flex", justifyContent: "center", alignItems: "center"
        }}>
          <div style={{
            background: "#fff", padding: 28, borderRadius: 16, minWidth: 400,
            boxShadow: "0 8px 40px #0002", maxWidth: 700
          }}>
            <ThemeMappingEditor />
            <div style={{ textAlign: "right" }}>
              <button onClick={() => setShowEditor(false)} style={{
                marginTop: 12, padding: "6px 24px", borderRadius: 8,
                background: "#1976d2", color: "#fff", fontWeight: 700, border: "none"
              }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* === 테마 랭킹 === */}
      <MarketStatusBanner />
      <SectorThemeTable />
      {/* 이하 동일 */}
      <StockRankingTable />
      <StrategyMenuCards />
      <NoticeBar />
    </div>
  );
}

