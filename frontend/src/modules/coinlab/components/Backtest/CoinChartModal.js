import React from "react";
import { Chart, CandlestickSeries } from "lightweight-charts-react-wrapper";

export default function CoinChartModal({ open, coin, onClose }) {
  if (!open || !coin) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "#0008", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center"
    }}
      onClick={onClose}
    >
      <div style={{
        background: "#fff", borderRadius: 12, minWidth: 600, minHeight: 400,
        padding: 24, position: "relative", boxShadow: "0 6px 30px #0002"
      }}
        onClick={e => e.stopPropagation()}>
        <button style={{
          position: "absolute", top: 18, right: 20, fontSize: 21,
          background: "none", border: "none", cursor: "pointer"
        }} onClick={onClose}>×</button>
        <h3 style={{ marginBottom: 14, color: "#1976d2" }}>{coin.symbol} 차트</h3>
        <div style={{
          background: "#f6f7fa", borderRadius: 8, height: 320, marginBottom: 12, overflow: "hidden"
        }}>
          <Chart autoWidth height={310}>
            <CandlestickSeries data={coin.candles} />
          </Chart>
        </div>
        <div style={{ fontSize: 15 }}>
          <b>현재가:</b> {coin.close?.toLocaleString() || "-"} &nbsp;
          <b>등락률:</b> {coin.return}% &nbsp;
          <b>거래대금:</b> {parseInt(coin.volume).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
