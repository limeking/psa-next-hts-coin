// src/modules/coinlab/components/StockRankingTable.js
import React from "react";

export default function StockRankingTable() {
  const stocks = [
    { rank: 1, name: "BTC", change: "+4%", volume: "700억", signal: "매수" },
    { rank: 2, name: "ETH", change: "-1%", volume: "350억", signal: "매도" },
  ];
  return (
    <div style={{ marginBottom: 24 }}>
      <b>관심종목 랭킹</b>
      <table style={{ width: "100%", marginTop: 8 }}>
        <thead>
          <tr><th>순위</th><th>종목명</th><th>등락률</th><th>거래대금</th><th>신호</th></tr>
        </thead>
        <tbody>
          {stocks.map(stock => (
            <tr key={stock.rank} style={{ cursor: "pointer" }} onClick={() => alert(`${stock.name} 상세보기`)}>
              <td>{stock.rank}</td>
              <td>{stock.name}</td>
              <td>{stock.change}</td>
              <td>{stock.volume}</td>
              <td>{stock.signal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
