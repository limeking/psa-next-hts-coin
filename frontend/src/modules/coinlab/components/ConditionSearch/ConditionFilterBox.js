// src/modules/coinlab/components/ConditionFilterBox.js
import React, { useEffect, useState } from "react";

// 임시 테마/코인 데이터(실전엔 API fetch)
const themeList = ["AI", "DeFi", "게임", "스테이블코인", "플랫폼", "NFT"];
const dummyCoinList = [
  { symbol: "BTC", theme: "플랫폼", return: 2.1, volume: 4000000000, rsi: 58, ma20Breakout: true, suddenVolume: false, continuousRise: 1, favorite: false },
  { symbol: "HIPPO", theme: "의료", return: 4.5, volume: 100000000, rsi: 23, ma20Breakout: false, suddenVolume: true, continuousRise: 3, favorite: true },
  // ... 더 추가 가능
];

export default function ConditionFilterBox({ filters, setFilters, setFilteredList }) {
  const [result, setResult] = useState([]);

  // 필터 로직(실전은 API로 넘길 수 있음)
  useEffect(() => {
    let res = dummyCoinList.filter(item => {
      if (filters.themes.length > 0 && !filters.themes.includes(item.theme)) return false;
      if (item.return < filters.minReturn || item.return > filters.maxReturn) return false;
      if (item.volume < filters.minVolume || item.volume > filters.maxVolume) return false;
      if (item.rsi < filters.minRSI || item.rsi > filters.maxRSI) return false;
      if (filters.ma20Breakout && !item.ma20Breakout) return false;
      if (filters.suddenVolume && !item.suddenVolume) return false;
      if (filters.continuousRise > 0 && item.continuousRise < filters.continuousRise) return false;
      if (filters.favoritesOnly && !item.favorite) return false;
      return true;
    });
    setResult(res);
    setFilteredList(res);
  }, [filters, setFilteredList]);

  // 입력 변화 핸들러
  const update = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));

  return (
    <div style={{ marginBottom: 32, background: "#f7f9fc", borderRadius: 16, padding: 24 }}>
      <h3 style={{ fontWeight: 700, marginBottom: 18, color: "#1976d2" }}>조건 설정</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {/* 테마 선택 */}
        <div>
          <div>테마</div>
          <select multiple value={filters.themes} onChange={e => update('themes', Array.from(e.target.selectedOptions, o => o.value))} style={{ minWidth: 120, minHeight: 70 }}>
            {themeList.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* 상승률 */}
        <div>
          <div>상승률 (%)</div>
          <input type="range" min={-20} max={20} value={filters.minReturn} onChange={e => update('minReturn', Number(e.target.value))} />
          <span style={{ marginLeft: 8 }}>{filters.minReturn} 이상</span>
          <input type="range" min={-20} max={20} value={filters.maxReturn} onChange={e => update('maxReturn', Number(e.target.value))} />
          <span style={{ marginLeft: 8 }}>{filters.maxReturn} 이하</span>
        </div>
        {/* 거래대금 */}
        <div>
          <div>거래대금 (₩)</div>
          <input type="number" min={0} value={filters.minVolume} onChange={e => update('minVolume', Number(e.target.value))} style={{ width: 100 }} /> ~
          <input type="number" min={0} value={filters.maxVolume} onChange={e => update('maxVolume', Number(e.target.value))} style={{ width: 100, marginLeft: 8 }} />
        </div>
        {/* RSI */}
        <div>
          <div>RSI (14)</div>
          <input type="range" min={0} max={100} value={filters.minRSI} onChange={e => update('minRSI', Number(e.target.value))} />
          <span style={{ marginLeft: 8 }}>{filters.minRSI} 이상</span>
          <input type="range" min={0} max={100} value={filters.maxRSI} onChange={e => update('maxRSI', Number(e.target.value))} />
          <span style={{ marginLeft: 8 }}>{filters.maxRSI} 이하</span>
        </div>
        {/* MA20 상향 돌파 */}
        <div>
          <div>MA20 상향 돌파</div>
          <input type="checkbox" checked={filters.ma20Breakout} onChange={e => update('ma20Breakout', e.target.checked)} />
        </div>
        {/* 거래량 급증 */}
        <div>
          <div>거래량 급증</div>
          <input type="checkbox" checked={filters.suddenVolume} onChange={e => update('suddenVolume', e.target.checked)} />
        </div>
        {/* 연속상승 */}
        <div>
          <div>N일 연속 상승</div>
          <input type="range" min={0} max={7} value={filters.continuousRise} onChange={e => update('continuousRise', Number(e.target.value))} />
          <span style={{ marginLeft: 8 }}>{filters.continuousRise}일 이상</span>
        </div>
        {/* 즐겨찾기 */}
        <div>
          <div>관심코인만</div>
          <input type="checkbox" checked={filters.favoritesOnly} onChange={e => update('favoritesOnly', e.target.checked)} />
        </div>
      </div>
    </div>
  );
}
