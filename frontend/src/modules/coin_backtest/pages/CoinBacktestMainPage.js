import React from "react";
import { useNavigate } from "react-router-dom";

export default function CoinBacktestMainPage() {
  const navigate = useNavigate();

  const menuItems = [
    {
      title: "백테스트 실행",
      description: "단일/전체 종목 백테스트 실행 및 결과 분석",
      icon: "📊",
      path: "/coin_backtest/run",
      color: "#1976d2"
    },
    {
      title: "데이터 관리",
      description: "거래 데이터 다운로드, 조회, 삭제",
      icon: "📁",
      path: "/coin_backtest/data",
      color: "#388e3c"
    },
    {
      title: "전략 설정",
      description: "백테스트 전략 파라미터 설정 및 저장",
      icon: "⚙️",
      path: "/coin_backtest/strategy",
      color: "#f57c00"
    },
    {
      title: "결과 분석",
      description: "과거 백테스트 결과 조회 및 비교 분석",
      icon: "📈",
      path: "/coin_backtest/analysis",
      color: "#7b1fa2"
    }
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, color: "#333", marginBottom: 8 }}>
          🚀 코인 백테스트 시스템
        </h1>
        <p style={{ fontSize: 16, color: "#666" }}>
          암호화폐 거래 전략을 백테스트하고 분석하세요
        </p>
      </div>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
        gap: 24 
      }}>
        {menuItems.map((item, index) => (
          <div
            key={index}
            onClick={() => navigate(item.path)}
            style={{
              background: "#fff",
              border: `2px solid ${item.color}`,
              borderRadius: 16,
              padding: 32,
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              textAlign: "center",
              position: "relative",
              overflow: "hidden"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ 
              fontSize: 48, 
              marginBottom: 16,
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
            }}>
              {item.icon}
            </div>
            <h3 style={{ 
              fontSize: 20, 
              fontWeight: "bold", 
              color: item.color, 
              marginBottom: 12 
            }}>
              {item.title}
            </h3>
            <p style={{ 
              fontSize: 14, 
              color: "#666", 
              lineHeight: 1.5,
              marginBottom: 20 
            }}>
              {item.description}
            </p>
            <div style={{
              background: item.color,
              color: "white",
              padding: "8px 16px",
              borderRadius: 20,
              fontSize: 14,
              fontWeight: "bold",
              display: "inline-block"
            }}>
              시작하기 →
            </div>
          </div>
        ))}
      </div>

      {/* 시스템 상태 표시 */}
      <div style={{ 
        marginTop: 40, 
        padding: 20, 
        background: "#f8f9fa", 
        borderRadius: 12,
        border: "1px solid #e9ecef"
      }}>
        <h3 style={{ marginBottom: 16, color: "#495057" }}>📊 시스템 상태</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#28a745" }}>✅</div>
            <div style={{ fontSize: 14, color: "#6c757d" }}>백엔드 서버</div>
            <div style={{ fontSize: 12, color: "#28a745" }}>정상 작동</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#28a745" }}>✅</div>
            <div style={{ fontSize: 14, color: "#6c757d" }}>데이터베이스</div>
            <div style={{ fontSize: 12, color: "#28a745" }}>연결됨</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#ffc107" }}>⚠️</div>
            <div style={{ fontSize: 14, color: "#6c757d" }}>데이터 수집</div>
            <div style={{ fontSize: 12, color: "#ffc107" }}>일부 종목만</div>
          </div>
        </div>
      </div>
    </div>
  );
} 