import * as LightweightCharts from "lightweight-charts";
import React, { useState, useRef, useEffect } from "react";

// === 유틸: 안전한 타임스탬프 변환 ===
function toTimestamp(str) {
  if (!str || typeof str !== "string") return 0;
  
  // 여러 날짜 형식 시도
  let dateVal;
  try {
    // ISO 형식 시도
    dateVal = new Date(str.replace(" ", "T"));
    if (!isNaN(dateVal.getTime())) {
      return Math.floor(dateVal.getTime() / 1000);
    }
    
    // 다른 형식들 시도
    dateVal = new Date(str);
    if (!isNaN(dateVal.getTime())) {
      return Math.floor(dateVal.getTime() / 1000);
    }
    
    // 숫자인 경우 (이미 타임스탬프)
    const numVal = parseInt(str);
    if (!isNaN(numVal)) {
      return numVal;
    }
  } catch (e) {
    console.warn("날짜 파싱 실패:", str, e);
  }
  
  return 0;
}


// === 차트 컴포넌트 ===
export function CandleChart({ candles = [], ma_lines = [], trades = [], allowMultiPosition = false }) {
  const chartRef = useRef();

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.innerHTML = "";

    // Null-safe 처리
    const candleData = Array.isArray(candles)
      ? candles.filter(c => c && typeof c.time !== "undefined")
        .map(c => ({
          time: toTimestamp(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          signal: c.signal,
          state: c.state,
        }))
      : [];

    console.log("candleData", candleData);
    console.log("trades", trades);
    const volumeData = candleData.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close > c.open ? "#d32f2f" : "#1976d2",
    }));
    const shortMA = Array.isArray(ma_lines)
      ? ma_lines.filter(m => m && typeof m.time !== "undefined")
        .map(m => ({
          time: toTimestamp(m.time),
          value: m.short_ma
        }))
      : [];
    const longMA = Array.isArray(ma_lines)
      ? ma_lines.filter(m => m && typeof m.time !== "undefined")
        .map(m => ({
          time: toTimestamp(m.time),
          value: m.long_ma
        }))
      : [];

    const markers = (trades || [])
    .filter(t => ["buy", "sell", "signal"].includes(t.action))
    .map(t => {
      // ⭐️ 개선된 중복포지션 판단 로직 ⭐️
      let isMultiPosition = false;
      let isNormalTrade = false;
      
      if (allowMultiPosition && t.reason) {
        // 중복포지션 매매 조건
        isMultiPosition = (
          t.reason.includes("다중전략 매수") || 
          t.reason.includes("분할/중복") ||
          t.reason.includes("반복진입") ||
          (t.reason.includes("매수") && t.reason.includes("1/") && t.reason.includes("분할"))
        );
        
        // 일반 매매 조건 (중복포지션이 아닌 경우)
        isNormalTrade = !isMultiPosition && (
          t.reason.includes("매수") || 
          t.reason.includes("매도") ||
          t.reason.includes("익절") ||
          t.reason.includes("손절") ||
          t.reason.includes("트레일스탑") ||
          t.reason.includes("신호")
        );
      } else {
        // 중복포지션 허용이 안된 경우 모든 매매는 일반 매매
        isNormalTrade = true;
      }
      
      if (t.action === "buy") {
        if (isMultiPosition) {
          return {
            time: toTimestamp(String(t.date)),
            position: "belowBar",
            color: "#ff9800", // 주황색
            shape: "circle",
            text: "중복매수",
            size: 2,
          };
        } else if (isNormalTrade) {
          return {
            time: toTimestamp(String(t.date)),
            position: "belowBar",
            color: "#43a047", // 초록색
            shape: "arrowUp",
            text: "일반매수",
            size: 1,
          };
        } else {
          return {
            time: toTimestamp(String(t.date)),
            position: "belowBar",
            color: "#43a047",
            shape: "arrowUp",
            text: "매수체결",
            size: 1,
          };
        }
      }
      
      if (t.action === "sell") {
        if (isMultiPosition) {
          return {
            time: toTimestamp(String(t.date)),
            position: "aboveBar",
            color: "#e91e63", // 분홍색
            shape: "circle",
            text: "중복매도",
            size: 2,
          };
        } else if (isNormalTrade) {
          return {
            time: toTimestamp(String(t.date)),
            position: "aboveBar",
            color: "#fbc02d", // 노란색
            shape: "arrowDown",
            text: "일반매도",
            size: 1,
          };
        } else {
          return {
            time: toTimestamp(String(t.date)),
            position: "aboveBar",
            color: "#fbc02d",
            shape: "arrowDown",
            text: "매도체결",
            size: 1,
          };
        }
      }
      
      if (t.action === "signal") {
        return {
          time: toTimestamp(String(t.date)),
          position: "aboveBar",
          color: "#2196f3",
          shape: "circle",
          text: "매수신호",
        };
      }
    });

    if (candleData.length === 0) return; // 데이터 없음 안내 (아래에서 div로 커버)

    const chart = LightweightCharts.createChart(chartRef.current, {
      width: 900,
      height: 400,
      layout: { background: { color: "#fff" }, textColor: "#222" },
      grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
      crosshair: { mode: 0 }
    });

    // CandleChart 내부 useEffect 내에 chart 생성 후
    chart.timeScale().applyOptions({
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: (timestamp) => {
        const d = new Date(timestamp * 1000);
        const h = d.getHours(), m = d.getMinutes();
        const Y = d.getFullYear(), M = d.getMonth() + 1, D = d.getDate();
        let candleInterval = 0;
        if (candleData.length > 2) {
          candleInterval = candleData[1].time - candleData[0].time;
        }
        if (candleInterval >= 80000) {
          return `${Y}-${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')}`;
        }
        if (candleInterval >= 3000) {
          return `${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')} ${String(h).padStart(2,'0')}시`;
        }
        if (h === 0 && m === 0) {
          return `${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        }
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#d32f2f",
      downColor: "#1976d2",
      borderUpColor: "#d32f2f",
      borderDownColor: "#1976d2",
      wickUpColor: "#d32f2f",
      wickDownColor: "#1976d2",
    });
    candleSeries.setData(candleData);
    candleSeries.setMarkers(markers);

    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      overlay: true,
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(volumeData);
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });


    // state=1(신호ON) 구간 파란색 띠 표시
    if (candleData.length && candleData[0].state !== undefined) {
      const stateAreas = candleData.map(c => ({
        time: c.time,
        value: c.state === 1 ? 1 : 0
      }));
      const stateSeries = chart.addAreaSeries({
        topColor: 'rgba(33, 150, 243, 0.12)',
        bottomColor: 'rgba(33, 150, 243, 0.05)',
        lineColor: 'rgba(33, 150, 243, 0.5)',
        lineWidth: 1,
        priceScaleId: '', // 독립축
      });
      stateSeries.setData(stateAreas);
    }

    const shortMASeries = chart.addLineSeries({ color: "#43a047", lineWidth: 2 });
    shortMASeries.setData(shortMA);
    const longMASeries = chart.addLineSeries({ color: "#fbc02d", lineWidth: 2 });
    longMASeries.setData(longMA);

    const handleResize = () => {
      chart.applyOptions({ width: Math.min(900, window.innerWidth - 32) });
    };
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [candles, ma_lines, trades, allowMultiPosition]); // allowMultiPosition 의존성 추가

  if (!Array.isArray(candles) || candles.length === 0) {
    return <div>캔들 데이터 없음</div>;
  }
  return <div ref={chartRef} />;
}

export function EquityCurveChart({ trades = [] }) {
  const chartRef = useRef();

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.innerHTML = "";

    let equityCurve = [];
    let lastBuy = null;
    let equity = 1.0;
    (trades || []).forEach(t => {
      if (t.action === "buy") lastBuy = t;
      if (t.action === "sell" && lastBuy) {
        equity *= t.price / lastBuy.price;
        equityCurve.push({
          time: toTimestamp(t.date),
          value: Math.round((equity - 1) * 10000) / 100,
        });
        lastBuy = null;
      }
    });

    if (equityCurve.length === 0) return;

    const chart = LightweightCharts.createChart(chartRef.current, {
      width: 900,
      height: 160,
      layout: { background: { color: "#f7f7f7" }, textColor: "#222" },
      grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    });
    const series = chart.addLineSeries({ color: "#2196f3", lineWidth: 2 });
    series.setData(equityCurve);

    const handleResize = () => {
      chart.applyOptions({ width: Math.min(900, window.innerWidth - 32) });
    };
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [trades]);

  return (
    <div style={{ marginTop: 20 }}>
      <b>누적 수익곡선 (백테스트 누적 수익률 %)</b>
      <div ref={chartRef} />
    </div>
  );
}

// ==== 통계/유틸 ====
export function calcBacktestStats(trades, allowMultiPosition = false) {
  let pairs = [];
  let lastBuy = null;
  let equity = 1.0;
  let equityCurve = [];
  let profits = [];
  let durations = [];
  let multiPositionCount = 0;
  let normalTradeCount = 0; // 일반 매매 개수 추가
  
  (trades || []).forEach((t) => {
    if (t.action === "buy") lastBuy = t;
    if (t.action === "sell" && lastBuy) {
      const buyTime = new Date(lastBuy.date).getTime();
      const sellTime = new Date(t.date).getTime();
      const ret = (t.price - lastBuy.price) / lastBuy.price;
      profits.push(ret);
      durations.push((sellTime - buyTime) / 1000 / 60 / 60);
      equity *= t.price / lastBuy.price;
      equityCurve.push(equity);
      
      // ⭐️ 개선된 중복포지션 판단 로직 ⭐️
      let isMultiPosition = false;
      let isNormalTrade = false;
      
      if (allowMultiPosition) {
        // 중복포지션 매매 조건
        isMultiPosition = (
          (lastBuy.reason && (
            lastBuy.reason.includes("다중전략 매수") ||
            lastBuy.reason.includes("분할/중복") ||
            lastBuy.reason.includes("반복진입") ||
            (lastBuy.reason.includes("매수") && lastBuy.reason.includes("1/") && lastBuy.reason.includes("분할"))
          )) ||
          (t.reason && (
            t.reason.includes("분할/중복") ||
            t.reason.includes("반복진입")
          ))
        );
        
        // 일반 매매 조건
        isNormalTrade = !isMultiPosition && (
          (lastBuy.reason && (
            lastBuy.reason.includes("매수") ||
            lastBuy.reason.includes("익절") ||
            lastBuy.reason.includes("손절") ||
            lastBuy.reason.includes("트레일스탑") ||
            lastBuy.reason.includes("신호")
          )) ||
          (t.reason && (
            t.reason.includes("매도") ||
            t.reason.includes("익절") ||
            t.reason.includes("손절") ||
            t.reason.includes("트레일스탑") ||
            t.reason.includes("신호")
          ))
        );
      } else {
        // 중복포지션 허용이 안된 경우 모든 매매는 일반 매매
        isNormalTrade = true;
      }
      
      if (isMultiPosition) multiPositionCount++;
      if (isNormalTrade) normalTradeCount++;
      
      pairs.push({
        buy: lastBuy,
        sell: t,
        purePL: (ret * 100).toFixed(2),
        durationHr: ((sellTime - buyTime) / 1000 / 60 / 60).toFixed(2),
        isMultiPosition: isMultiPosition,
        isNormalTrade: isNormalTrade
      });
      lastBuy = null;
    }
  });
  
  const totalReturn = equity - 1;
  let peak = 1.0, mdd = 0;
  for (let v of equityCurve) {
    if (v > peak) peak = v;
    mdd = Math.min(mdd, (v - peak) / peak);
  }
  const winCount = profits.filter(p => p > 0).length;
  const loseCount = profits.filter(p => p <= 0).length;
  const avgWin = profits.filter(p => p > 0).reduce((a, b) => a + b, 0) / (winCount || 1);
  const avgLose = profits.filter(p => p <= 0).reduce((a, b) => a + b, 0) / (loseCount || 1);
  const avgDuration = durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  
  return {
    pairs,
    totalReturn: (totalReturn * 100).toFixed(2),
    mdd: (mdd * 100).toFixed(2),
    winRate: (winCount / (profits.length || 1) * 100).toFixed(2),
    avgWin: (avgWin * 100).toFixed(2),
    avgLose: (avgLose * 100).toFixed(2),
    avgDuration: avgDuration.toFixed(2),
    tradeCount: profits.length,
    multiPositionCount: multiPositionCount,
    normalTradeCount: normalTradeCount // 일반 매매 개수 추가
  };
}
export function humanizeHour(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0 && m === 0) return "0분";
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
export function StatsBox({ stats }) {
  return (
    <div style={{
      background: "#f6f6fa",
      border: "1px solid #ccc",
      borderRadius: 12,
      padding: 20,
      margin: "24px 0 12px 0",
      fontSize: 15,
      maxWidth: 900,
      display: "flex",
      flexWrap: "wrap",
      gap: 20,
    }}>
      <div><b>총 매매쌍:</b> {stats.tradeCount}회</div>
      {stats.normalTradeCount > 0 && (
        <div style={{ color: "#43a047", fontWeight: "bold" }}>
          <b>일반매매:</b> {stats.normalTradeCount}회 📈
        </div>
      )}
      {stats.multiPositionCount > 0 && (
        <div style={{ color: "#ff9800", fontWeight: "bold" }}>
          <b>중복포지션:</b> {stats.multiPositionCount}회 🔄
        </div>
      )}
      <div><b>누적수익률:</b> {stats.totalReturn}%</div>
      <div><b>최대드로우다운:</b> {stats.mdd}%<br /><span style={{ fontSize: 13, color: "#666" }}>(최고점 대비 최저점 하락폭)</span></div>
      <div><b>승률:</b> {stats.winRate}%</div>
      <div><b>평균수익:</b> {stats.avgWin}%</div>
      <div><b>평균손실:</b> {stats.avgLose}%</div>
      <div><b>평균보유기간:</b> {humanizeHour(stats.avgDuration)}</div>
    </div>
  );
}


function isDateClose(dateA, dateB, minutes = 5) {
  // "2025-03-20 15:00:00" 등 dateA/B를 Date로 변환 후 분 차이 체크
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(a - b) <= minutes * 60 * 1000;
}



// === 신호+체결 통합 표 ===
function renderFullSignalTradeTable(trades, intervals, allTradesByInterval, multiStrategies, allowMultiPosition = false) {
  if (!trades || trades.length === 0) return <div>거래내역 없음</div>;

  let rows = [];
  let lastBuyStack = [];

  trades.forEach((t) => {
    if (t.action === "buy") {
      lastBuyStack.push(t);
    }

    if (t.action === "sell") {
      if (lastBuyStack.length === 0) return;
      const buy = lastBuyStack.shift();
      if (!buy || !buy.date) return;

      const buyTime = new Date(buy.date).getTime();
      const sellTime = new Date(t.date).getTime();
      const ret = (t.price - buy.price) / buy.price;

      // ⭐️ 개선된 중복포지션 판단 로직 ⭐️
      let isMultiPosition = false;
      let isNormalTrade = false;
      
      if (allowMultiPosition) {
        // 중복포지션 매매 조건
        isMultiPosition = (
          (buy.reason && (
            buy.reason.includes("다중전략 매수") ||
            buy.reason.includes("분할/중복") ||
            buy.reason.includes("반복진입") ||
            (buy.reason.includes("매수") && buy.reason.includes("1/") && buy.reason.includes("분할"))
          )) ||
          (t.reason && (
            t.reason.includes("분할/중복") ||
            t.reason.includes("반복진입")
          ))
        );
        
        // 일반 매매 조건
        isNormalTrade = !isMultiPosition && (
          (buy.reason && (
            buy.reason.includes("매수") ||
            buy.reason.includes("익절") ||
            buy.reason.includes("손절") ||
            buy.reason.includes("트레일스탑") ||
            buy.reason.includes("신호")
          )) ||
          (t.reason && (
            t.reason.includes("매도") ||
            t.reason.includes("익절") ||
            t.reason.includes("손절") ||
            t.reason.includes("트레일스탑") ||
            t.reason.includes("신호")
          ))
        );
      } else {
        // 중복포지션 허용이 안된 경우 모든 매매는 일반 매매
        isNormalTrade = true;
      }

      let buyOnSignals = [];
      if (allTradesByInterval && intervals) {
        intervals.forEach(interval => {
          const arr = allTradesByInterval[interval] || [];
          let lastRow = null;
          for (let i = arr.length - 1; i >= 0; i--) {
            if (new Date(arr[i].date).getTime() <= new Date(buy.date).getTime()) {
              lastRow = arr[i];
              break;
            }
          }
          if (lastRow && lastRow.state === 1) {
            buyOnSignals.push(interval);
          }
        });
      }

      rows.push({
        buyDate: buy.date,
        buyPrice: buy.price,
        sellDate: t.date,
        sellPrice: t.price,
        purePL: ((ret * 100).toFixed(2)),
        duration: humanizeHour(((sellTime - buyTime) / 1000 / 60 / 60).toFixed(2)),
        buyReason: (
          buyOnSignals.length === intervals.length && intervals.length > 1
            ? `동시신호: ${buyOnSignals.join(" + ")}`
            : buyOnSignals.length > 0
              ? `신호: ${buyOnSignals.join(" + ")}`
              : (buy.reason || "")
        ) + (
          (() => {
            let filterText = '';
            if (intervals && Array.isArray(intervals)) {
              filterText = intervals
                .filter(interval => {
                  const params = multiStrategies.find(s => s.interval === interval)?.params || {};
                  return params.use_volume_filter;
                })
                .map(interval => {
                  const params = multiStrategies.find(s => s.interval === interval)?.params || {};
                  return `(${interval}거래량+${Math.round((params.volume_threshold||0)*100)}%)`;
                })
                .join(' ');
            }
            return filterText;
          })()
        ),
        sellReason: t.reason,
        isMultiPosition: isMultiPosition,
        isNormalTrade: isNormalTrade
      });
    }

    if (t.action === "signal") {
      let signalIntervals = [];
      if (t.interval) signalIntervals = [t.interval];
      else if (allTradesByInterval && intervals) {
        intervals.forEach(interval => {
          const arr = allTradesByInterval[interval] || [];
          const signalAtThisTime = arr.find(tr => tr.date === t.date && tr.action === "signal");
          if (signalAtThisTime) signalIntervals.push(interval);
        });
      }
      rows.push({
        buyDate: t.date,
        buyPrice: t.price,
        sellDate: "",
        sellPrice: "",
        purePL: "",
        duration: "",
        buyReason: signalIntervals.length > 0
          ? `신호: ${signalIntervals.join(" + ")}`
          : (t.reason || "매수신호"),
        sellReason: "",
        isMultiPosition: false,
        isNormalTrade: true
      });
    }
  });

  return (
    <table border={1} cellPadding={4}>
      <thead>
        <tr>
          <th>매수일시</th>
          <th>매수가</th>
          <th>매도일시</th>
          <th>매도가</th>
          <th>순수익률(%)</th>
          <th>보유기간(시간)</th>
          <th>매매사유(매수)</th>
          <th>매매사유(매도)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx} style={{
            background: r.purePL === "" ? "#f2f7fc" : 
                       r.isMultiPosition ? "#fff3e0" : 
                       r.isNormalTrade ? "#f1f8e9" : undefined, // 일반매매 배경색
            borderLeft: r.isMultiPosition ? "4px solid #ff9800" : 
                       r.isNormalTrade ? "4px solid #43a047" : undefined, // 일반매매 왼쪽 테두리
            fontWeight: (r.isMultiPosition || r.isNormalTrade) ? "bold" : "normal"
          }}>
            <td>{r.buyDate}</td>
            <td>{r.buyPrice}</td>
            <td>{r.sellDate}</td>
            <td>{r.sellPrice}</td>
            <td style={{ 
              color: r.purePL === "" ? "inherit" : 
                     parseFloat(r.purePL) > 0 ? "#43a047" : "#d32f2f",
              fontWeight: (r.isMultiPosition || r.isNormalTrade) ? "bold" : "normal"
            }}>
              {r.purePL}
            </td>
            <td>{r.duration}</td>
            <td style={{ 
              color: r.isMultiPosition ? "#ff9800" : 
                     r.isNormalTrade ? "#43a047" : "inherit",
              fontWeight: (r.isMultiPosition || r.isNormalTrade) ? "bold" : "normal"
            }}>
              {r.isMultiPosition ? "🔄 " : r.isNormalTrade ? "📈 " : ""}{r.buyReason}
            </td>
            <td style={{ 
              color: r.isMultiPosition ? "#e91e63" : 
                     r.isNormalTrade ? "#fbc02d" : "inherit",
              fontWeight: (r.isMultiPosition || r.isNormalTrade) ? "bold" : "normal"
            }}>
              {r.isMultiPosition ? "🔄 " : r.isNormalTrade ? "📉 " : ""}{r.sellReason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}



// === 메인 컴포넌트 ===
export default function CoinBacktestRunPage() {
  const [mode, setMode] = useState("single"); // "single", "mtf", "multi"
  const [market, setMarket] = useState("BTC_KRW");
  const [slippage, setSlippage] = useState(0.1);
  const [fee, setFee] = useState(0.05);
  const [showFullChart, setShowFullChart] = useState(false);


  // 멀티타임프레임(MTF) 입력 (단일종목/전체종목 모두 사용)
  const [multiStrategies, setMultiStrategies] = useState([
    { interval: "24h", strategy: "sma_cross", params: { short: 5, long: 20, use_volume_filter: true, volume_threshold: 0.3 } }
  ]);
  const [useTrailingStop, setUseTrailingStop] = useState(false);
  const [trailingTrigger, setTrailingTrigger] = useState(3);
  const [trailingGap, setTrailingGap] = useState(1);

  // 결과/상태
  const [result, setResult] = useState(null);
  const [multiResults, setMultiResults] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [popupResult, setPopupResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // useState 선언부 (제일 위쪽!)
  const [useTakeProfit, setUseTakeProfit] = useState(false);
  const [takeProfitPct, setTakeProfitPct] = useState(3);
  const [useStopLoss, setUseStopLoss] = useState(false);
  const [stopLossPct, setStopLossPct] = useState(3);

  const [allowMultiPosition, setAllowMultiPosition] = useState(false); // 중복포지션 허용
  const [splitOrderCount, setSplitOrderCount] = useState(1);           // 분할매수 횟수


  // === 단일종목 MTF 백테스트 실행 ===
  const runMTFBacktest = async () => {
    console.log("[FRONT-MTF] params", {
      market,
      multi_strategies: multiStrategies,
      slippage: slippage / 100,
      fee: fee / 100,
      use_trailing_stop: useTrailingStop,
      trailing_trigger: trailingTrigger / 100,
      trailing_gap: trailingGap / 100,
      show_all: showFullChart,
      use_take_profit: useTakeProfit,
      take_profit_pct: takeProfitPct / 100,
      use_stop_loss: useStopLoss,
      stop_loss_pct: stopLossPct / 100,
    });
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/coin_backtest/backtest/mtf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          multi_strategies: multiStrategies,
          slippage: slippage / 100,
          fee: fee / 100,
          use_trailing_stop: useTrailingStop,
          trailing_trigger: trailingTrigger / 100,
          trailing_gap: trailingGap / 100,
          show_all: showFullChart,
          use_take_profit: useTakeProfit,
          take_profit_pct: takeProfitPct / 100,
          use_stop_loss: useStopLoss,
          stop_loss_pct: stopLossPct / 100,
          allow_multi_position: allowMultiPosition,
          split_order_count: splitOrderCount,
        }),
      });
      const data = await res.json();
      if (data.error) {
        console.error("[FRONT-MTF] 백엔드 에러:", data.error);
        setResult({ error: data.error });
      } else {
        setResult(data);
      }
    } catch (error) {
      console.error("[FRONT-MTF] 네트워크 에러:", error);
      setResult({ error: "네트워크 오류가 발생했습니다." });
    }
    setLoading(false);
  };

  // === 전체종목 MTF 백테스트 실행 ===
  const runMultiMTF = async () => {
    console.log("[FRONT-MULTI_MTF] params", {
      multi_strategies: multiStrategies,
      slippage: slippage / 100,
      fee: fee / 100,
      use_trailing_stop: useTrailingStop,
      trailing_trigger: trailingTrigger / 100,
      trailing_gap: trailingGap / 100,
      show_all: showFullChart,
      use_take_profit: useTakeProfit,
      take_profit_pct: takeProfitPct / 100,
      use_stop_loss: useStopLoss,
      stop_loss_pct: stopLossPct / 100,
    });
    setLoading(true); setMultiResults([]);
    try {
      const res = await fetch("/api/coin_backtest/backtest/multi_mtf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          multi_strategies: multiStrategies,
          slippage: slippage / 100,
          fee: fee / 100,
          use_trailing_stop: useTrailingStop,
          trailing_trigger: trailingTrigger / 100,
          trailing_gap: trailingGap / 100,
          show_all: showFullChart,
          use_take_profit: useTakeProfit,
          take_profit_pct: takeProfitPct / 100,
          use_stop_loss: useStopLoss,
          stop_loss_pct: stopLossPct / 100,
          allow_multi_position: allowMultiPosition,
          split_order_count: splitOrderCount,
        }),
      });
      const data = await res.json();
      console.log("[FRONT-MULTI_MTF] 응답", data);
      
      if (data.error) {
        console.error("[FRONT-MULTI_MTF] 백엔드 에러:", data.error);
        setMultiResults([{ error: data.error }]);
      } else {
        // === 아래 배열 여부에 따라 setMultiResults 처리 ===
        if (Array.isArray(data)) {
          setMultiResults(data);
        } else if (Array.isArray(data.data)) {
          setMultiResults(data.data);
        } else {
          setMultiResults([]);  // 응답이 없을 때 방어용
        }
      }
    } catch (error) {
      console.error("[FRONT-MULTI_MTF] 네트워크 에러:", error);
      setMultiResults([{ error: "네트워크 오류가 발생했습니다." }]);
    }
    setLoading(false);
  };

  // 상세 팝업
  const openPopup = async (symbol) => {
    setSelectedSymbol(symbol);
    const res = await fetch("/api/coin_backtest/backtest/mtf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        market: symbol,
        multi_strategies: multiStrategies,
        slippage: slippage / 100,
        fee: fee / 100,
        use_trailing_stop: useTrailingStop,
        trailing_trigger: trailingTrigger / 100,
        trailing_gap: trailingGap / 100,
        show_all: true,
        use_take_profit: useTakeProfit,
        take_profit_pct: takeProfitPct / 100,
        use_stop_loss: useStopLoss,
        stop_loss_pct: stopLossPct / 100,
        allow_multi_position: allowMultiPosition,
        split_order_count: splitOrderCount,
      }),
    });
    setPopupResult(await res.json());
  };

  // === UI ===
  return (
    <div style={{ padding: 24 }}>
      <h2>백테스트 실행</h2>
      {/* 모드 선택 */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ marginLeft: 12 }}>
          <input type="radio" name="mode" value="multi" checked={mode === "multi"} onChange={() => setMode("multi")} /> 전체종목 MTF
        </label>
        <label style={{ marginLeft: 12 }}>
          <input type="radio" name="mode" value="mtf" checked={mode === "mtf"} onChange={() => setMode("mtf")} /> 단일종목 MTF
        </label>
      </div>

      
      {/* === 단일/전체종목 MTF 입력 === */}
      {(mode === "mtf" || mode === "multi") && (
        <form onSubmit={e => { e.preventDefault(); mode === "mtf" ? runMTFBacktest() : runMultiMTF(); }}>
          {mode === "mtf" && (
            <label>종목: <input value={market} onChange={e => setMarket(e.target.value)} /></label>
          )}
          <label style={{ marginLeft: 10 }}>슬리피지(%): <input type="number" min={0} step={0.01} value={slippage} onChange={e => setSlippage(Number(e.target.value))} style={{ width: 60 }}/></label>
          <label style={{ marginLeft: 10 }}>수수료(%): <input type="number" min={0} step={0.01} value={fee} onChange={e => setFee(Number(e.target.value))} style={{ width: 60 }}/></label>
          <label style={{ marginLeft: 10 }}>
            <input type="checkbox" checked={showFullChart} onChange={e => setShowFullChart(e.target.checked)} />
            전체 차트 보기
          </label>
          {/* MTF 전략 입력 */}
          <div style={{margin: '16px 0', border: '1px solid #bbb', borderRadius: 8, padding: 10, maxWidth: 680}}>
            <b>타임프레임별 전략 조합</b>
            {multiStrategies.map((item, idx) => (
              <div key={idx} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 8, margin: 8 }}>
                <select value={item.interval}
                  onChange={e => {
                    const arr = [...multiStrategies];
                    arr[idx].interval = e.target.value;
                    setMultiStrategies(arr);
                  }}>
                  <option value="24h">일봉</option>
                  <option value="4h">4시간봉</option>
                  <option value="1h">1시간봉</option>
                  <option value="10m">10분봉</option>
                  <option value="3m">3분봉</option>
                  <option value="1m">1분봉</option>
                </select>
                <select value={item.strategy}
                  onChange={e => {
                    const arr = [...multiStrategies];
                    arr[idx].strategy = e.target.value;
                    arr[idx].params = (e.target.value === 'sma_cross') ?
                      { short: 5, long: 20 } : { period: 14, threshold: 30 };
                    setMultiStrategies(arr);
                  }}>
                  <option value="sma_cross">이동평균선 돌파</option>
                  <option value="rsi">RSI</option>
                </select>
                {item.strategy === 'sma_cross' && (
                  <>
                  단기:<input type="number" value={item.params.short} min={1}
                    onChange={e => {
                      const arr = [...multiStrategies];
                      arr[idx].params.short = Number(e.target.value);
                      setMultiStrategies(arr);
                    }} style={{ width: 50 }}/>
                  장기:<input type="number" value={item.params.long} min={1}
                    onChange={e => {
                      const arr = [...multiStrategies];
                      arr[idx].params.long = Number(e.target.value);
                      setMultiStrategies(arr);
                    }} style={{ width: 50 }}/>
              
                  {/* 👇 거래량 필터 옵션 (체크박스 + 임계값) */}
                  <label style={{ marginLeft: 10 }}>
                    <input type="checkbox"
                      checked={item.params.use_volume_filter || false}
                      onChange={e => {
                        const arr = [...multiStrategies];
                        arr[idx].params.use_volume_filter = e.target.checked;
                        setMultiStrategies(arr);
                      }}
                    />
                    거래량 필터
                  </label>
                  {item.params.use_volume_filter && (
                    <>
                      임계값(%) : <input type="number" min={0.01} step={0.01}
                        value={item.params.volume_threshold || 0.3}
                        onChange={e => {
                          const arr = [...multiStrategies];
                          arr[idx].params.volume_threshold = Number(e.target.value);
                          setMultiStrategies(arr);
                        }}
                        style={{ width: 60 }}
                      />
                    </>
                  )}
                </>
                )}
                {item.strategy === 'rsi' && (
                  <>
                    기간:<input type="number" value={item.params.period} min={1}
                      onChange={e => {
                        const arr = [...multiStrategies];
                        arr[idx].params.period = Number(e.target.value);
                        setMultiStrategies(arr);
                      }} style={{ width: 50 }}/>
                    임계값:<input type="number" value={item.params.threshold} min={1}
                      onChange={e => {
                        const arr = [...multiStrategies];
                        arr[idx].params.threshold = Number(e.target.value);
                        setMultiStrategies(arr);
                      }} style={{ width: 50 }}/>
                        {/* 👇 거래량 필터 옵션 (체크박스 + 임계값) */}
                    <label style={{ marginLeft: 10 }}>
                      <input type="checkbox"
                        checked={item.params.use_volume_filter || false}
                        onChange={e => {
                          const arr = [...multiStrategies];
                          arr[idx].params.use_volume_filter = e.target.checked;
                          setMultiStrategies(arr);
                        }}
                      />
                      거래량 필터
                    </label>
                    {item.params.use_volume_filter && (
                      <>
                        임계값(%) : <input type="number" min={0.01} step={0.01}
                          value={item.params.volume_threshold || 0.3}
                          onChange={e => {
                            const arr = [...multiStrategies];
                            arr[idx].params.volume_threshold = Number(e.target.value);
                            setMultiStrategies(arr);
                          }}
                          style={{ width: 60 }}
                        />
                      </>
                    )}
                  </>
                )}
                <button type="button" style={{marginLeft: 10}} onClick={() => setMultiStrategies(arr => arr.filter((_, i) => i !== idx))}>삭제</button>
              </div>
            ))}
            <button type="button" onClick={() => setMultiStrategies(arr => [...arr, { interval: "1h", strategy: "sma_cross", params: { short: 5, long: 20 } }])}>
              + 전략 추가
            </button>
          </div>
          {/* 트레일링스탑 */}
          <div style={{marginTop: 16}}>
            <label>
              <input type="checkbox" checked={useTrailingStop} onChange={e => setUseTrailingStop(e.target.checked)}/>
              트레일링스탑 사용
            </label>
            {useTrailingStop && (
              <>
                트리거(%) : <input type="number" value={trailingTrigger} min={0.1}
                  onChange={e => setTrailingTrigger(Number(e.target.value))} step={0.1} style={{ width: 50 }}/>
                트레일폭(%) : <input type="number" value={trailingGap} min={0.1}
                  onChange={e => setTrailingGap(Number(e.target.value))} step={0.1} style={{ width: 50 }}/>
              </>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={useTakeProfit}
                onChange={e => setUseTakeProfit(e.target.checked)}
              /> 익절 사용
            </label>
            {useTakeProfit && (
              <> 익절(%): <input type="number" min={0.1} step={0.1}
                value={takeProfitPct}
                onChange={e => setTakeProfitPct(Number(e.target.value))}
                style={{ width: 50 }} /></>
            )}
            <label style={{ marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={useStopLoss}
                onChange={e => setUseStopLoss(e.target.checked)}
              /> 손절 사용
            </label>
            {useStopLoss && (
              <> 손절(%): <input type="number" min={0.1} step={0.1}
                value={stopLossPct}
                onChange={e => setStopLossPct(Number(e.target.value))}
                style={{ width: 50 }} /></>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={allowMultiPosition}
                onChange={e => setAllowMultiPosition(e.target.checked)}
              />
              중복 포지션(여러 번 진입) 허용
            </label>
            <label style={{ marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={splitOrderCount > 1}
                onChange={e => setSplitOrderCount(e.target.checked ? 3 : 1)}
              />
              분할매수 사용
            </label>
            {splitOrderCount > 1 && (
              <> (몇 번 분할? <input type="number" value={splitOrderCount} min={2} max={10}
                  onChange={e => setSplitOrderCount(Number(e.target.value))}
                  style={{ width: 40 }} />회)
              </>
            )}
          </div>


          <button type="submit" disabled={loading} style={{ marginLeft: 16 }}>
            {mode === "mtf" ? "MTF 실행" : "전체종목 MTF 실행"}
          </button>
        </form>
      )}

      {loading && <div style={{ margin: 16 }}>실행 중...</div>}

      {/* === 결과 표출 === */}
      {/* 단일종목/다중종목 MTF 결과 */}
      {mode === "mtf" && result && (
        result.error ? (
          <div style={{ background: "#fee", padding: 24, border: "2px solid #c00", borderRadius: 8, marginTop: 16 }}>
            <b>백테스팅 오류:</b> {result.error}
          </div>
        ) : result.per_interval && (() => {
          const intervals = Object.keys(result.per_interval); // 전체 interval!
          const lastInterval = intervals.slice(-1)[0];
          const trades = result.trades_by_interval?.[lastInterval] || result.trades;
          return (
            <div>
              {Object.entries(result.per_interval).map(([interval, data], idx, arr) => {
                 // interval별 params를 multiStrategies에서 찾아오기
                const params = multiStrategies.find(s => s.interval === interval)?.params || {};
                return (
                  <div key={interval}>
                    <h3>
                    전략 {idx + 1}: {interval}
                    {params.use_volume_filter
                      ? ` (거래량+${Math.round((params.volume_threshold || 0) * 100)}%)`
                      : ""}
                    </h3>
                    <CandleChart
                      candles={data.candles}
                      ma_lines={data.ma_lines}
                      trades={result.trades_by_interval?.[interval] || result.trades}
                      allowMultiPosition={allowMultiPosition} // allowMultiPosition 전달
                    />
                  </div>
                );
              })}
              {/* 수익률, 통계, 통합표 모두 한 번만 아래에서! */}
              <div style={{marginTop:24}}>
                <EquityCurveChart trades={trades} />
                <StatsBox stats={calcBacktestStats(trades, allowMultiPosition)} /> {/* allowMultiPosition 전달 */}
                <b>신호 + 매수-매도 체결내역</b>
                {renderFullSignalTradeTable(trades, intervals, result.trades_by_interval, multiStrategies, allowMultiPosition)} {/* allowMultiPosition 전달 */}
              </div>
            </div>
          );
        })()
      )}


      {/* 전체종목 요약 테이블 */}
      {mode === "multi" && multiResults.length > 0 && (
        <table border={1} cellPadding={4} style={{ marginTop: 24 }}>
          <thead>
            <tr><th>종목</th><th>수익률</th><th>매매쌍</th><th>비고</th></tr>
          </thead>
          <tbody>
            {multiResults.map(r => (
              <tr key={r.market} onClick={() => !r.errorMsg && openPopup(r.market)} style={{ cursor: r.errorMsg ? "not-allowed" : "pointer", color: r.errorMsg ? "#bbb" : undefined }}>
                <td>{r.market}</td>
                <td>{r.return_pct}%</td>
                <td>{r.tradeCount}</td>
                <td>{r.errorMsg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 팝업 상세: 신호+체결+통계 통합 */}
      {selectedSymbol && (popupResult?.error ? (
        <div style={{ background: "#fee", padding: 24, border: "2px solid #c00", borderRadius: 8 }}>
          <b>팝업 오류:</b> {popupResult.error}
          <br /><button onClick={() => setSelectedSymbol(null)} style={{ marginTop: 12 }}>닫기</button>
        </div>
      ) : popupResult && (() => {
        const intervals = popupResult.per_interval ? Object.keys(popupResult.per_interval) : [];
        const lastInterval = intervals[intervals.length-1];
        const lastTrades = popupResult.trades_by_interval?.[lastInterval] || [];
        const allTrades = popupResult.trades_by_interval
          ? Object.values(popupResult.trades_by_interval).flat()
          : popupResult.trades || [];
        
        // ⭐️ 백엔드에서 계산된 tradeCount 사용 ⭐️
        const backendTradeCount = popupResult.tradeCount || 0;
        
        // ⭐️ 팝업에서 실제 거래 데이터로 통계 계산 ⭐️
        const popupStats = calcBacktestStats(lastTrades, allowMultiPosition);
        
        return (
          <div style={{
            position: "fixed", top: 80, left: "10%",
            width: "80%", maxHeight: "80vh", overflowY: "auto",
            background: "#fff", border: "2px solid #666", padding: 24, zIndex: 999
          }}>
            <h3>{selectedSymbol} 상세 백테스트</h3>
            <div><b>최종 수익률: {popupResult.profit_percent}%</b></div>
            <div><b>매매쌍 수: {backendTradeCount}회</b></div>
            
            {/* ⭐️ 팝업에서 통계 박스 표시 ⭐️ */}
            <div style={{marginTop: 16}}>
              <StatsBox stats={popupStats} />
            </div>
            
            {/* 전략별 차트만 출력 */}
            {intervals.map((interval, idx) => {
              const params = multiStrategies.find(s => s.interval === interval)?.params || {};
              return (
                <div key={interval}
                  style={{
                    marginBottom: 40,
                    border: idx === intervals.length-1 ? "3px solid #1976d2" : "1.5px solid #bbb",
                    borderRadius: 12,
                    padding: 18,
                    background: idx === intervals.length-1 ? "#e3f2fd" : "#fafafa",
                    boxShadow: idx === intervals.length-1 ? "0 4px 24px #b4d8fa22" : "none",
                  }}>
                  <h3 style={{
                    color: idx === intervals.length-1 ? "#1565c0" : "#555",
                    fontWeight: idx === intervals.length-1 ? 700 : 600,
                    fontSize: 22,
                    letterSpacing: "0.01em"
                  }}>
                    전략 {idx+1}: {interval}
                    {params.use_volume_filter
                      ? ` (거래량+${Math.round((params.volume_threshold || 0) * 100)}%)`
                      : ""}
                    {idx === intervals.length-1 && <span style={{fontSize:16,marginLeft:8}}>(실매매)</span>}
                  </h3>
                  <CandleChart
                    candles={popupResult.per_interval[interval].candles}
                    ma_lines={popupResult.per_interval[interval].ma_lines}
                    trades={popupResult.trades_by_interval?.[interval] || popupResult.trades}
                    allowMultiPosition={allowMultiPosition}
                  />
                </div>
              )
            })}
            <div style={{marginTop:24}}>
              <EquityCurveChart trades={lastTrades} />
              <b>신호 + 매수-매도 체결내역</b>
              {renderFullSignalTradeTable(allTrades, intervals, popupResult.trades_by_interval, multiStrategies, allowMultiPosition)}
            </div>
            <button onClick={() => setSelectedSymbol(null)} style={{ marginTop: 12 }}>닫기</button>
          </div>
        );
      })())}
    </div>
  );
}

  // 체결표 함수 (기존과 동일)
  function renderTradesTable(trades, isLast) {
    if (!trades || trades.length === 0) return <div>거래내역 없음</div>;
    if (!isLast) {
      // 위 전략은 매수신호만 표
      return (
        <table border={1} cellPadding={4}>
          <thead><tr><th>신호일시</th><th>가격</th><th>신호사유</th></tr></thead>
          <tbody>
            {trades.map((t, idx) => (
              <tr key={idx}>
                <td>{t.date}</td>
                <td>{t.price}</td>
                <td>{t.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    // 마지막 전략은 기존 체결표
    const stats = calcBacktestStats(trades);
    return (
      <>
        <div style={{marginBottom: 8}}>
          <b>매수-매도 체결쌍: {stats.tradeCount}회</b>
        </div>
        <table border={1} cellPadding={4}>
          <thead>
            <tr>
              <th>매수일시</th>
              <th>매수가</th>
              <th>매도일시</th>
              <th>매도가</th>
              <th>순수익률(%)</th>
              <th>보유기간(시간)</th>
              <th>매매사유(매수)</th>
              <th>매매사유(매도)</th>
            </tr>
          </thead>
          <tbody>
            {stats.pairs.map((p, idx) => (
              <tr key={idx}>
                <td>{p.buy.date}</td>
                <td>{p.buy.price}</td>
                <td>{p.sell.date}</td>
                <td>{p.sell.price}</td>
                <td>{p.purePL}</td>
                <td>{humanizeHour(p.durationHr)}</td>
                <td>{p.buy.reason}</td>
                <td>{p.sell.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  

