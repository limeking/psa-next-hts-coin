import React from "react";
import { INTERVALS, INTERVAL_LABELS, getYearsForInterval } from "../../constants";

const DOT_COLORS = [
  "#b0bec5",   // 0개: 회색(없음)
  "#f44336",   // 1개: 빨강
  "#fbc02d",   // 2개: 노랑
  "#4caf50",   // 3개: 초록
  "#1976d2",   // 4개: 파랑(전부 있음)
];

const BASE_URL = "/api/coinlab";



function normalizeBithumbSymbol(symbol) {
  // 자동으로 대문자 + _KRW로 변환
  let s = symbol.toUpperCase().replace(/-/g, "_");
  if (!s.endsWith("_KRW")) {
    if (s.endsWith("KRW")) {
      s = s.replace(/KRW$/, "_KRW");
    } else {
      s = s + "_KRW";
    }
  }
  return s;
}


async function handleSymbolClick(symbol) {
  const normSymbol = normalizeBithumbSymbol(symbol);
  for (const { key: interval } of INTERVALS) {
    for (const year of getYearsForInterval(interval)) {
      await fetch(
        `${BASE_URL}/coin_data_update?symbol=${normSymbol}&interval=${interval}&year=${year}`,
        { method: "POST" }
      );
    }
  }
  alert(`${normSymbol}의 모든 봉/연도 데이터 최신화(생성/덮어쓰기) 완료!`);
}

export default function CoinDataTable({ symbolList, dataState, onDataChanged }) {

  async function handleDelete(symbol) {
    if (window.confirm(`정말로 ${symbol}의 모든 데이터를(폴더 포함) 삭제할까요?`)) {
      // 폴더 전체 삭제
      await fetch(`/api/coinlab/coin_data_delete_all?symbol=${symbol}`, { method: "DELETE" });
      alert(`${symbol}의 데이터 폴더가 통째로 삭제되었습니다.`);
      if (onDataChanged) onDataChanged();
    }
  }

  // 카드 클릭 핸들러
  async function handleCardClick(symbol) {
    // 데이터가 하나라도 있으면 삭제, 아니면 최신화
    const exists = INTERVALS.some(({ key: interval }) =>
      getYearsForInterval(interval).some(year =>
        dataState[symbol]?.[interval]?.[year]
      )
    );
    if (exists) {
      await handleDelete(symbol);
    } else {
      await handleSymbolClick(symbol);
      if (onDataChanged) onDataChanged();
    }
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: 16, marginTop: 16
    }}>
      {symbolList.map(symbol => {
        const existsArr = INTERVALS.map(({ key: interval }) =>
          getYearsForInterval(interval).some(year =>
            dataState[symbol]?.[interval]?.[year]
          )
        );
        const exists = existsArr.some(Boolean); // 데이터가 하나라도 있으면
        const existsCount = existsArr.filter(Boolean).length;
        const dotColor = DOT_COLORS[existsCount];
        const tooltip = INTERVALS.map(({ key: interval }, i) =>
          `${INTERVAL_LABELS[interval]}: ${existsArr[i] ? "있음" : "없음"}`
        ).join("\n");

        const cardBg = exists
          ? "linear-gradient(135deg, #b6d0ff 0%, #ecf4fc 100%)"
          : "#f7fafc";

        return (
          <div
            key={symbol}
            onClick={() => handleCardClick(symbol)} // ★여기만 수정!
            style={{
              background: cardBg,
              border: exists ? "2.3px solid #376fb2" : "1.5px solid #e3e6ea",
              borderRadius: 13,
              padding: "20px 14px 16px 14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              minHeight: 96,
              boxShadow: exists
                ? "0 4px 13px 0 rgba(64,112,212,0.07)"
                : "0 2px 7px 0 rgba(120,120,120,0.03)",
              position: "relative",
              cursor: "pointer",
              transition: "background 0.2s"
            }}
            title={
              exists
                ? "클릭 시 데이터 모두 삭제"
                : "클릭 시 모든 봉/연도 데이터 최신화"
            }
          >
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 21, color: dotColor, marginRight: 9 }}>●</span>
              <span style={{
                fontWeight: 700, fontSize: 18, color: "#333"
              }}>{symbol}</span>
            </div>
            <span style={{
              fontSize: 13, color: exists ? "#2d4e7b" : "#1976d2", marginLeft: 2
            }}>
              {exists ? "🗑️ 클릭시 모든 데이터 삭제" : "⬆️ 클릭시 모든 데이터 최신화"}
            </span>
            <div style={{ marginTop: 6, display: "flex", gap: 11 }}>
              {INTERVALS.map(({ key: interval }, i) => (
                <span key={interval} title={INTERVAL_LABELS[interval]}
                  style={{
                    fontSize: 15,
                    color: existsArr[i] ? DOT_COLORS[4] : DOT_COLORS[0],
                    verticalAlign: "middle"
                  }}
                >● <span style={{
                  fontWeight: 500, fontSize: 12,
                  color: "#777"
                }}>{INTERVAL_LABELS[interval]}</span></span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}