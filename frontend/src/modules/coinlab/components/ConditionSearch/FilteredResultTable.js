// src/modules/coinlab/components/FilteredResultTable.js
import React from "react";

export default function FilteredResultTable({ data }) {
  return (
    <div>
      <h4 style={{ marginBottom: 12 }}>검색 결과 ({data.length}종목)</h4>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#e0f2f1" }}>
            <th>코인</th><th>테마</th><th>상승률</th><th>거래대금</th><th>RSI</th>
            <th>MA20상향</th><th>급증</th><th>연속상승</th><th>관심</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, idx) => (
            <tr key={idx}>
              <td>{c.symbol}</td>
              <td>{c.theme}</td>
              <td>{c.return}%</td>
              <td>{parseInt(c.volume).toLocaleString()}</td>
              <td>{c.rsi}</td>
              <td>{c.ma20Breakout ? "O" : ""}</td>
              <td>{c.suddenVolume ? "O" : ""}</td>
              <td>{c.continuousRise}</td>
              <td>{c.favorite ? "★" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
