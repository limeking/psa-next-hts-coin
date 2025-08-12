// frontend/src/modules/coinlab/components/Backtest/CoinChartModal.js
import React, { useMemo } from "react";
import { Chart, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts-react-wrapper";

export default function CoinChartModal(props) {
  const { open } = props;
  if (!open) return null;
  return <CoinChartModalBody {...props} />;
}

function CoinChartModalBody({ onClose, symbol, title, interval, loading, candles = [] }) {
  const hasData = Array.isArray(candles) && candles.length > 0;

  // 이동평균 계산
  const { ma7, ma14, ma30, ma90, ma180 } = useMemo(() => {
    const toLine = (p) => {
      if (!hasData) return [];
      let sum = 0, out = [];
      for (let i = 0; i < candles.length; i++) {
        sum += candles[i].close;
        if (i >= p) sum -= candles[i - p].close;
        out.push({ time: candles[i].time, value: i >= p - 1 ? +(sum / p).toFixed(8) : NaN });
      }
      return out;
    };
    return {
      ma7:  toLine(7),
      ma14: toLine(14),
      ma30: toLine(30),
      ma90: toLine(90),
      ma180: toLine(180),
    };
  }, [hasData, candles]);

  // 거래량 최대값 (autoscale 고정용)
  const vMax = useMemo(() => {
    if (!hasData) return 1;
    let m = 1;
    for (const c of candles) {
      const v = Number(c?.volume ?? 0);
      if (v > m) m = v;
    }
    return m;
  }, [hasData, candles]);

  // 레이아웃(고정 높이로 ResizeObserver 경고 억제)
  const MODAL_W = 1200;
  const MODAL_H = 760;
  const CHART_H = 680;

  const modalStyle = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  };
  const panelStyle = {
    width: `min(${MODAL_W}px, 96vw)`,
    height: `min(${MODAL_H}px, 92vh)`,
    background: "#111", color: "#fff",
    borderRadius: 12, overflow: "hidden",
    display: "grid", gridTemplateRows: "52px 1fr",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  };
  const headerStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 16px", borderBottom: "1px solid #222", background: "#0b0b0b", fontWeight: 600,
  };
  const bodyStyle = { padding: 8 };
  const buttonStyle = { background: "#222", color: "#fff", border: "1px solid #333", borderRadius: 8, padding: "6px 10px", cursor: "pointer" };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>{title || `${symbol ?? ""} (${interval ?? ""})`}</div>
          <button style={buttonStyle} onClick={onClose}>닫기</button>
        </div>

        {!hasData && !loading && (
          <div style={{ display: "grid", placeItems: "center", color: "#bbb" }}>캔들 데이터가 없습니다</div>
        )}
        {loading && (
          <div style={{ display: "grid", placeItems: "center", color: "#bbb" }}>불러오는 중…</div>
        )}

        {hasData && !loading && (
          <div style={bodyStyle}>
            {/* ✅ 하나의 Chart + 두 가격축:
                - right: 캔들/MA (상단 75%)
                - left : 거래량 (하단 25%, 눈금 표시)
                같은 timeScale 공유 → 완전 동기화 */}
            <Chart
              width={undefined}
              height={CHART_H}
              rightPriceScale={{
                visible: true,
                borderVisible: false,
                scaleMargins: { top: 0.05, bottom: 0.25 }, // 위 75%
              }}
              leftPriceScale={{
                visible: true,            // 👈 거래량 축 눈금 표시
                borderVisible: false,
                scaleMargins: { top: 0.75, bottom: 0.02 }, // 아래 25%
              }}
              timeScale={{ fixLeftEdge: true, rightOffset: 6, borderVisible: false }}
              grid={{ vertLines: { visible: false }, horzLines: { color: "#1e1e1e" } }}
              layout={{ textColor: "#ddd", background: { color: "#111" } }}
              localization={{ priceFormatter: (p) => (p ?? 0).toLocaleString() }}
            >
              {/* 캔들 + MA (기본 right 스케일) */}
              <CandlestickSeries
                data={candles}
                upColor="#d32f2f" downColor="#1976d2"
                borderVisible={false}
                wickUpColor="#d32f2f" wickDownColor="#1976d2"
              />
              <LineSeries data={ma7}   priceLineVisible={false} color="#d32f2f" lineWidth={1} />
              <LineSeries data={ma14}  priceLineVisible={false} color="#1976d2" lineWidth={1} />
              <LineSeries data={ma30}  priceLineVisible={false} color="#fbc02d" lineWidth={1} />
              <LineSeries data={ma90}  priceLineVisible={false} color="#2e7d32" lineWidth={1} />
              <LineSeries data={ma180} priceLineVisible={false} color="#000000" lineWidth={1} />

              {/* 거래량: left 스케일 + 범위 고정(0~vMax) → 위로 침범 방지 */}
              <HistogramSeries
                priceFormat={{ type: "volume" }}
                priceScaleId="left"
                baseLineVisible={false}
                autoscaleInfoProvider={() => ({
                  priceRange: { minValue: 0, maxValue: vMax || 1 },
                })}
                data={candles.map((c) => ({
                  time: c.time,
                  value: c.volume ?? 0,
                  color: (c.close >= c.open) ? "#d32f2f" : "#1976d2",
                }))}
              />
            </Chart>
          </div>
        )}
      </div>
    </div>
  );
}
