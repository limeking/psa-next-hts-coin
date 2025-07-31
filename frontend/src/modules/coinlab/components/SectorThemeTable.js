import React, { useEffect, useState } from "react";

export default function ThemeRankingTable() {
  const [data, setData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);

  // [모달용 상태 추가]
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [coinList, setCoinList] = useState({});
  const [coinDetailData, setCoinDetailData] = useState([]);

  // 문제점:
  // 1. useEffect에서 GET과 POST를 동시에 호출하고 있음. (POST는 의도치 않은 데이터 변경/오염 가능)
  // 2. newThemeMapping 변수가 정의되어 있지 않음. (ReferenceError 발생)
  // 3. 컴포넌트 mount 시 불필요하게 theme_mapping을 POST로 덮어씀 (심각한 버그)
  // 4. fetch의 비동기 흐름이 서로 의존성이 없는데 순서 보장 없이 호출됨 (괜찮지만, POST는 아예 불필요)
  // 5. 에러 핸들링 없음

  useEffect(() => {
    // 테마 랭킹 데이터와 테마 매핑 데이터만 GET으로 불러온다.
    setLoading(true);
    Promise.all([
      fetch("/api/coinlab/theme_ranking").then(res => res.json()),
      fetch("/api/coinlab/theme_mapping").then(res => res.json())
    ])
      .then(([rankingResult, mappingResult]) => {
        setData(rankingResult.theme_ranking || []);
        setLastUpdated(rankingResult.last_updated || "");
        setCoinList(mappingResult || {});
        console.log("coinList 객체:", mappingResult)
      })
      .catch((err) => {
        console.error("테마 랭킹/매핑 fetch 에러:", err);
      })
      .finally(() => setLoading(false));
  }, []);


  function normalize(str) {
    return String(str)
      .replace(/\s+/g, '')    // 공백 제거
      .replace(/[()\/]/g, '') // 괄호, 슬래시 제거
      .toLowerCase();
  }
  
  // [테마 클릭시 해당 코인 데이터 모달로 뿌리기]
  const handleThemeClick = (theme) => {
    const norm = normalize(theme);
    const themeKey = Object.keys(coinList).find(
      key => normalize(key) === norm
    );
    if (!themeKey) {
      alert("테마 매칭 실패: key가 일치하지 않습니다.");
      return;
    }
    const coinSymbols = coinList[themeKey] || [];
    fetch("https://api.bithumb.com/public/ticker/ALL_KRW")
    .then(res => res.json())
    .then(result => {
      const all = result.data;
      const coins = coinSymbols
        .map(sym => {
          const symbol = sym.replace("_KRW", "");
          const v = all[symbol];
          if (!v) return null;
          return {
            symbol, // ← 심볼명 직접 삽입
            price: v['closing_price'],
            change: v['fluctate_rate_24H'],
            volume: v['acc_trade_value_24H']
          };
        })
        .filter(Boolean);
      setCoinDetailData(coins);
      setSelectedTheme(theme);
      });
  };
  

  const closeModal = () => setSelectedTheme(null);

  if (loading) return <div>테마 랭킹 불러오는 중...</div>;

  console.log("ThemeRankingTable 렌더링 - data:", data);
  console.log("ThemeRankingTable 렌더링 - coinList:", coinList);
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontWeight: 700, marginBottom: 12, color: "#00796b" }}>
        🚀 코인 테마별 실시간 랭킹
      </h3>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
        마지막 업데이트: {lastUpdated}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#e0f2f1" }}>
            <th style={{ padding: 8 }}>테마</th>
            <th style={{ padding: 8 }}>소속 코인수</th>
            <th style={{ padding: 8 }}>평균 상승률(%)</th>
            <th style={{ padding: 8 }}>총 거래대금(₩)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            // 여기 추가!
            
            console.log("row.theme:", row.theme);
            console.log("normalize(row.theme):", normalize(row.theme));
            console.log("coinList keys:", Object.keys(coinList));
            console.log("normalize(coinList keys):", Object.keys(coinList).map(normalize));
            return (
              <tr key={row.theme} style={{ cursor: "pointer" }} onClick={() => handleThemeClick(row.theme)}>
                <td style={{ padding: 8, textDecoration: "underline" }}>{row.theme}</td>
                <td style={{ padding: 8 }}>{row.count}</td>
                <td style={{ padding: 8, color: row.mean_return > 0 ? "#d32f2f" : "#1976d2", fontWeight: 600 }}>
                  {row.mean_return}
                </td>
                <td style={{ padding: 8 }}>{row.sum_volume.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* [모달/팝업] */}
      {selectedTheme && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center"
        }}>
          <div style={{
            background: "#fff", padding: 24, borderRadius: 12, minWidth: 350,
            boxShadow: "0 8px 32px #0003"
          }}>
            <h4 style={{ fontWeight: 700, marginBottom: 16 }}>{selectedTheme} 테마 코인 상세</h4>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>코인</th><th>가격</th><th>상승률(%)</th><th>거래대금</th>
                </tr>
              </thead>
              <tbody>
                {coinDetailData.map((c, idx) => (
                  <tr key={idx}>
                    <td>{c.symbol}</td>
                    <td>{c.price}</td>
                    <td>{c.change}</td>
                    <td>{parseInt(c.volume).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={closeModal} style={{
              marginTop: 16, padding: "6px 18px", borderRadius: 8,
              background: "#1976d2", color: "#fff", fontWeight: 700, border: "none"
            }}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
