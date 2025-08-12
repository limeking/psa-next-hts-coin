// frontend/src/modules/coinlab/components/ConditionSearch/FilteredResultTable.js
import React, { useMemo, useState } from "react";

export default function FilteredResultTable({ data = [], resultRowClick }) {
  // 기본 정렬: 등락률 내림차순
  const [sortBy, setSortBy] = useState("return");
  const [sortOrder, setSortOrder] = useState("desc");

  // 안전 숫자 처리
  const toNumberOrNull = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  const fmtComma = (v) => {
    const n = toNumberOrNull(v);
    return n === null ? "-" : n.toLocaleString();
  };
  const fmtPercent = (v) => {
    const n = toNumberOrNull(v);
    if (n === null) return "-";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
  };
  // HTS 컬러 규칙: +빨강, -파랑
  const colorByChange = (v) => {
    const n = toNumberOrNull(v);
    if (n === null) return "#999";
    if (n > 0) return "#d32f2f"; // 빨강(상승)
    if (n < 0) return "#1976d2"; // 파랑(하락)
    return "#222";
  };

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  };

  const sortedData = useMemo(() => {
    const arr = Array.isArray(data) ? [...data] : [];
    const numCompare = (a, b) => {
      const av = toNumberOrNull(a?.[sortBy]);
      const bv = toNumberOrNull(b?.[sortBy]);
      // null은 뒤로
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortOrder === "asc" ? av - bv : bv - av;
    };
    return arr.sort((a, b) => {
      // 숫자 우선 정렬, 아니면 문자열 비교
      const av = a?.[sortBy];
      const bv = b?.[sortBy];
      const an = toNumberOrNull(av);
      const bn = toNumberOrNull(bv);
      if (an !== null || bn !== null) return numCompare(a, b);
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sortOrder === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [data, sortBy, sortOrder]);

  const arrow = (key) =>
    sortBy === key ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕";

  return (
    <div>
      <h4 style={{ marginBottom: 12 }}>검색 결과 ({sortedData.length}종목)</h4>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#e0f2f1" }}>
            <th style={{ textAlign: "left", padding: "8px 10px" }}>종목</th>
            <th
              style={{ cursor: "pointer", textAlign: "right", padding: "8px 10px" }}
              onClick={() => handleSort("return")}
            >
              등락률{arrow("return")}
            </th>
            <th
              style={{ cursor: "pointer", textAlign: "right", padding: "8px 10px" }}
              onClick={() => handleSort("close")}
            >
              현재가{arrow("close")}
            </th>
            <th
              style={{ cursor: "pointer", textAlign: "right", padding: "8px 10px" }}
              onClick={() => handleSort("volume")}
            >
              거래대금{arrow("volume")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((c, idx) => (
            <tr
              key={`${c?.symbol || "ROW"}-${idx}`}
              style={{
                cursor: resultRowClick ? "pointer" : "default",
                borderBottom: "1px solid #eee",
              }}
              onClick={resultRowClick ? () => resultRowClick(c) : undefined}
            >
              <td style={{ color: "#1976d2", fontWeight: 700, padding: "8px 10px" }}>
                {c?.symbol || "-"}
              </td>
              <td
                style={{
                  color: colorByChange(c?.return),
                  fontWeight: toNumberOrNull(c?.return) === null ? 400 : 700,
                  textAlign: "right",
                  padding: "8px 10px",
                }}
              >
                {fmtPercent(c?.return)}
              </td>
              <td style={{ textAlign: "right", padding: "8px 10px" }}>
                {fmtComma(c?.close)}
              </td>
              <td style={{ textAlign: "right", padding: "8px 10px" }}>
                {fmtComma(c?.volume)}
              </td>
            </tr>
          ))}
          {sortedData.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "#999", padding: 16 }}>
                결과가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
