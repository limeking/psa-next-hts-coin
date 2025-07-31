import React, { useState, useEffect } from "react";

export default function MarketStatusBanner() {
  const [short, setShort] = useState(5);
  const [long, setLong] = useState(20);
  const [pendingShort, setPendingShort] = useState(5);
  const [pendingLong, setPendingLong] = useState(20);
  const [saved, setSaved] = useState(false);
  const [fearGreed, setFearGreed] = useState(null);

  // ✅ 가격 배열 상태 추가!
  const [priceData, setPriceData] = useState([]);

  // 옵션 불러오기 (기존과 동일)
  useEffect(() => {
    fetch("/api/coinlab/market/options")
      .then(res => res.json())
      .then(data => {
        setShort(data.short);
        setLong(data.long);
        setPendingShort(data.short);
        setPendingLong(data.long);
      });
  }, []);

  // ✅ 실시간 가격 데이터 fetch
  // ✅ 옵션에 따라 count를 자동 계산하여 fetch!
  useEffect(() => {
    const n = Math.max(pendingLong, long) + 20; // 10보다 더 여유있게!
    fetch(`/api/coinlab/price/btc_krw?count=${n}`)
      .then(res => res.json())
      .then(data => {
        console.log('fetch count:', n, 'prices.length:', data.prices?.length, data);
        if (data.prices && data.prices.length > 0) setPriceData(data.prices);
      });
  }, [pendingLong, long]);  // 옵션이 바뀔 때마다 재요청

  // 공포-탐욕 지수(Fear & Greed Index)를 백엔드에서 받아와 상태에 저장하는 useEffect
  useEffect(() => {
    fetch("/api/coinlab/fear_greed_index")
      .then(res => res.json())
      .then(data => {
        setFearGreed(data);
      });
  }, []);

  function calcMA(arr, period, end = null) {
    const len = arr.length;
    if (!end) end = len;
    if (end < period) return null;
    const window = arr.slice(end - period, end);
    const sum = window.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  function getMarketStatus(prices, short=5, long=20) {
    if (prices.length < long + 5) return "데이터부족";
    const maShort = calcMA(prices, short);
    const maLong = calcMA(prices, long);
    const maLong5ago = calcMA(prices, long, prices.length - 5);
    if (maShort > maLong && maLong > maLong5ago) return "상승장";
    if (maShort < maLong && maLong < maLong5ago) return "하락장";
    return "횡보장";
  }

  const marketStatus = getMarketStatus(priceData, short, long);

  // 종합판별 예시1: 둘 다 강한 신호일 때 “강한 상승장” 표시
  const isStrongBull =
    marketStatus === "상승장" &&
    fearGreed &&
    (fearGreed.classification === "Greed" || fearGreed.classification === "Extreme Greed");

  // 종합판별 예시2: 둘이 불일치(예: MA는 상승장인데 탐욕지수는 Fear)면 “경고” 표시
  const isCaution =
    marketStatus === "상승장" &&
    fearGreed &&
    (fearGreed.classification === "Fear" || fearGreed.classification === "Extreme Fear");

  const handleSave = () => {
    fetch("/api/coinlab/market/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ short: pendingShort, long: pendingLong }),
    })
      .then(res => res.json())
      .then(() => {
        setShort(pendingShort);
        setLong(pendingLong);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* 1. 종합 시장상태 + 탐욕지수(한 번만!) */}
      <div style={{
        background: isStrongBull
          ? "#fff9c4"
          : isCaution
          ? "#ffe0b2"
          : marketStatus === "상승장"
          ? "#e3f2fd"
          : marketStatus === "하락장"
          ? "#ffebee"
          : "#f9fbe7",
        padding: 16,
        borderRadius: 12,
        fontWeight: 700,
        fontSize: 20,
        color: isStrongBull
          ? "#fbc02d"
          : isCaution
          ? "#e65100"
          : marketStatus === "상승장"
          ? "#1976d2"
          : marketStatus === "하락장"
          ? "#d32f2f"
          : "#388e3c",
        textAlign: "center"
      }}>
        {isStrongBull && "🚀 강한 상승장 (탐욕지수도 Greed!)"}
        {isCaution && "⚠️ 신호 불일치: 상승장+탐욕지수는 공포(Fear), 주의 필요"}
        {!isStrongBull && !isCaution && `시장상태: ${marketStatus}`}
        <div style={{ textAlign: "center", marginTop: 8, fontWeight: 400, fontSize: 16 }}>
          <b>탐욕지수:</b> {fearGreed ? `${fearGreed.value} (${fearGreed.classification})` : "로딩중..."}
        </div>
      </div>
  
      {/* 2. MA 옵션/저장폼 */}
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <label>
          단기 MA:
          <input type="number" min={1} max={pendingLong-1} value={pendingShort}
            style={{ width: 40, margin: "0 8px" }}
            onChange={e => setPendingShort(Number(e.target.value))}
          />
        </label>
        <label>
          장기 MA:
          <input type="number" min={pendingShort+1} max={30} value={pendingLong}
            style={{ width: 40, margin: "0 8px" }}
            onChange={e => setPendingLong(Number(e.target.value))}
          />
        </label>
        <button
          style={{ marginLeft: 12, padding: "4px 14px", borderRadius: 6, border: "1px solid #1976d2", color: "#1976d2", fontWeight: 600, background: "#fff" }}
          onClick={handleSave}
        >
          저장
        </button>
        {saved && <span style={{ marginLeft: 10, color: "#388e3c", fontSize: 13 }}>설정이 저장되었습니다!</span>}
      </div>
  
      {/* 3. 안내 문구 */}
      <div style={{ color: "#888", fontSize: 13, textAlign: "center" }}>
        (BTC/KRW 기준, 단기 MA가 장기 MA 위 + 장기MA 우상향 = 상승장)
      </div>
    </div>
  )
}
