import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ConditionComboManager from "../components/ConditionSearch/ConditionComboManager";
import CoinChartModal from "../components/Backtest/CoinChartModal";
import { dummyCoinResults, dummyCandles } from '../components/dummy/dummyCoinResults';
import { fetchConditionSearchList, saveConditionSearchList } from '../api/conditionSearchApi';

const dummyCoinList = [
  { symbol: "BTC", return: 3.2, volume: 7000000000, rsi: 55, ma5: 45000, ma20: 43000, ma60: 40000, ma120: 38000, theme: "플랫폼" },
  { symbol: "HIPPO", return: 7.5, volume: 180000000, rsi: 27, ma5: 105, ma20: 98, ma60: 91, ma120: 80, theme: "AI" },
  { symbol: "ETH", return: 1.2, volume: 4000000000, rsi: 62, ma5: 2900, ma20: 2700, ma60: 2400, ma120: 2100, theme: "DeFi" },
];

function filterByComboObj(comboObj, data) {
  const combo = comboObj?.combo || [];
  return data.filter(item =>
    combo.every(cond => {
      // MA 크로스
      if (cond.key === "ma_cross") {
        const ma1 = item["ma" + cond.value.ma1];
        const ma2 = item["ma" + cond.value.ma2];
        if (!ma1 || !ma2) return false;
        return cond.op === "상향돌파" ? (ma1 > ma2) : (ma1 < ma2);
      }
      // MA 이격도
      if (cond.key === "ma_gap") {
        const ma1 = item["ma" + cond.value.ma1];
        const ma2 = item["ma" + cond.value.ma2];
        if (!ma1 || !ma2) return false;
        const gap = ((ma1 - ma2) / ma2) * 100;
        switch (cond.op) {
          case ">": return gap > Number(cond.value.gap);
          case "<": return gap < Number(cond.value.gap);
          case ">=": return gap >= Number(cond.value.gap);
          case "<=": return gap <= Number(cond.value.gap);
          default: return false;
        }
      }
      // 기본 조건
      const v = item[cond.key];
      if (cond.op === ">" || cond.op === ">=") return Number(v) >= Number(cond.value);
      if (cond.op === "<" || cond.op === "<=") return Number(v) <= Number(cond.value);
      if (cond.op === "=") return String(v) === String(cond.value);
      return false;
    })
  );
}



  

export default function ConditionSearchPage() {
  const [builderList, setBuilderList] = useState([]); // 현재 입력 중인 조합식(AND/OR 배열)
  const [savedCombos, setSavedCombos] = useState([]); // 저장된 전체 조합 배열
  const [result, setResult] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [appliedComboName, setAppliedComboName] = useState("");
  const navigate = useNavigate();

  // 최초 마운트 시 백엔드에서 조합 전체 불러오기
  useEffect(() => {
    fetchAllCombos();
  }, []);

  // 백엔드에서 조합 배열 전체 불러오기
  const fetchAllCombos = async () => {
    try {
      const list = await fetchConditionSearchList();
      setSavedCombos(list || []);
    } catch (e) {
      setSavedCombos([]);
    }
  };

  const handleDeleteSavedCombo = async (idx) => {
    if (!window.confirm("정말 이 조합을 삭제할까요?")) return;
    const newCombos = savedCombos.filter((_, i) => i !== idx);
    try {
      await saveConditionSearchList(newCombos); // 백엔드 저장 함수
      setSavedCombos(newCombos);
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  // 저장: 현재 builderList를 이름과 함께 전체 배열로 저장(백엔드로)
  const handleSaveCombo = async () => {
    if (!saveName || builderList.length === 0) {
      alert("저장할 이름과 조합식을 입력하세요!");
      return;
    }
    // 기존 배열에 추가
    const newCombos = [...savedCombos, { name: saveName, combo: builderList }];
    try {
      await saveConditionSearchList(newCombos);
      setSavedCombos(newCombos);
      setSaveName("");
      alert("조합식이 저장되었습니다.");
    } catch (e) {
      alert("저장 실패: " + e.message);
    }
  };

  // 불러오기: 모달에 저장된 목록 보여주기
  const handleShowLoadModal = () => setShowLoadModal(true);
  const handleSelectCombo = (item) => {
    setBuilderList(item.combo);
    setAppliedComboName(item.name || "");
    setShowLoadModal(false);
  };

  // 실행: 결과 테이블 갱신 + builderList 초기화
  const handleSearch = () => {
    if (builderList.length === 0) {
      setResult(dummyCoinList); // 전체 리스트 그대로
      setBuilderList([]);
      setAppliedComboName("");
      return;
    }
    let combined = filterByComboObj(builderList[0].comboObj, dummyCoinList);
    for (let i = 1; i < builderList.length; i++) {
      const op = builderList[i].op;
      const nextRes = filterByComboObj(builderList[i].comboObj, dummyCoinList);
      if (op === "AND") {
        combined = combined.filter(x => nextRes.some(y => y.symbol === x.symbol));
      } else { // OR
        combined = [...combined, ...nextRes].filter(
          (v, idx, arr) => arr.findIndex(t => t.symbol === v.symbol) === idx
        );
      }
    }
    setResult(combined);
    setBuilderList([]); // 실행 후 빌더 초기화!
  };

  // 조합식 한눈에 표시
  const getDisplay = (item) => {
    if (!item?.comboObj?.combo) return "";
    return item.comboObj.combo.map(c => {
      if (c.key === "ma_cross")
        return `${c.value.ma1}이평선이 ${c.value.ma2}이평선을 ${c.op}`;
      if (c.key === "ma_gap")
        return `${c.value.ma1}이평선과 ${c.value.ma2}이평선 이격도 ${c.op} ${c.value.gap}%`;
      if (c.key === "theme")
        return `테마 = ${c.value}`;
      return `${c.label} ${c.op} ${c.value}${c.unit}`;
    }).join(" · ");
  };

  // CoinChartModal에 넘길 coin 객체(차트 데이터 포함) 생성
  const getSelectedCoinWithCandles = () => {
    if (!selectedCoin) return null;
    const symbol = selectedCoin.symbol.includes("_KRW") ? selectedCoin.symbol : selectedCoin.symbol + "_KRW";
    return {
      ...selectedCoin,
      candles: dummyCandles[symbol] || dummyCandles[selectedCoin.symbol] || [],
    };
  };

  // 오른쪽 조합 영역에 추가 (조건검색식/조합식 + AND/OR)
  const handleAddCombo = (comboObj) => {
    setBuilderList(list => [
      ...list,
      {
        comboObj,
        op: list.length === 0 ? "" : "AND"
      }
    ]);
  };

  // 연산자 변경
  const handleOpChange = (idx, op) => {
    setBuilderList(list => list.map((x, i) => i === idx ? { ...x, op } : x));
  };

  // 순서변경
  const handleMove = (idx, dir) => {
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === builderList.length - 1)) return;
    const newList = [...builderList];
    [newList[idx], newList[idx + dir]] = [newList[idx + dir], newList[idx]];
    setBuilderList(newList);
  };

  // 삭제
  const handleDelete = (idx) => {
    setBuilderList(list => list.filter((_, i) => i !== idx));
  };

  

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <button
        style={{
          marginBottom: 22,
          padding: "10px 28px",
          borderRadius: 8,
          background: "#f5f5f5",
          border: "1px solid #1976d2",
          color: "#1976d2",
          fontWeight: "bold",
          fontSize: 16,
          cursor: "pointer",
        }}
        onClick={() => navigate("/coinlab/dashboard")}
      >
        🏠 대시보드로
      </button>
      <h2 style={{ fontWeight: 800, fontSize: 28, marginBottom: 12, color: "#1976d2" }}>
        🧠 조건검색식 조합식 빌더 (실전 HTS)
      </h2>
      <div style={{ display: "flex", gap: 36, alignItems: "flex-start", marginBottom: 18 }}>
        {/* 왼쪽 조건검색식 목록 */}
        <ConditionComboManager onAddCombo={handleAddCombo} />
        {/* 오른쪽 조합식 빌더 */}
        <div style={{ flex: 1, minWidth: 420 }}>
          <div style={{ marginBottom: 12, fontWeight: 700, color: "#1976d2" }}>
            조건검색식 조합영역
            <span style={{ color: "#555", fontWeight: 400, fontSize: 14, marginLeft: 10 }}>
              (추가할 때마다 AND/OR 지정, 순서변경, 삭제 가능)
            </span>
          </div>
          {/* 저장/불러오기 UI */}
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              placeholder="조합 이름"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid #ccc" }}
            />
            <button onClick={handleSaveCombo} style={{ background: "#1976d2", color: "#fff", border: "none", borderRadius: 7, padding: "6px 18px" }}>
              조합 저장
            </button>
            <button onClick={handleShowLoadModal} style={{ background: "#aaa", color: "#fff", border: "none", borderRadius: 7, padding: "6px 18px" }}>
              조합 불러오기
            </button>
            <button
                onClick={() => {
                setBuilderList([]);
                setAppliedComboName("");
                }}
                style={{ background: "#f44336", color: "#fff", border: "none", borderRadius: 7, padding: "6px 18px" }}
            >
                조합 초기화
            </button>
          </div>
          {/* 불러오기 모달 */}
          {showLoadModal && (
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#0008", zIndex: 3000,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <div style={{ background: "#fff", borderRadius: 14, padding: 28, minWidth: 350 }}>
                <h4>저장된 조건검색 조합</h4>
                {savedCombos.length === 0 && <div style={{ color: "#aaa" }}>저장된 조합이 없습니다.</div>}
                {savedCombos.map((item, i) => (
                 <div key={i} style={{
                     marginBottom: 12, padding: 10, border: "1px solid #eee", borderRadius: 8,
                     display: "flex", justifyContent: "space-between", alignItems: "center"
                 }}>
                     <span style={{ fontWeight: 700 }}>{item.name}</span>
                     <div>
                      <button
                          onClick={() => handleSelectCombo(item)}
                          style={{
                          marginLeft: 12, background: "#1976d2", color: "#fff", border: "none",
                          padding: "4px 16px", borderRadius: 7, fontWeight: 600, cursor: "pointer"
                          }}
                      >적용</button>
                      <button
                          onClick={() => handleDeleteSavedCombo(i)}
                          style={{
                          marginLeft: 8, background: "#d32f2f", color: "#fff", border: "none",
                          padding: "4px 10px", borderRadius: 7, fontWeight: 600, cursor: "pointer"
                          }}
                      >삭제</button>
                     </div>
                 </div>
                 ))}
                <button onClick={() => setShowLoadModal(false)} style={{ marginTop: 14 }}>닫기</button>
              </div>
            </div>
          )}
                {/* 빌더 영역 위 */}
            {appliedComboName && (
            <div style={{ marginBottom: 6, color: "#1976d2", fontWeight: 700 }}>
                현재 적용 조합: {appliedComboName}
            </div>
            )}
          {/* 기존 조합식 빌더 */}
          {builderList.length === 0 &&
            <div style={{ color: "#bbb", marginBottom: 18 }}>왼쪽에서 조건검색식을 [추가]하세요!</div>}
          {builderList.map((item, idx) => (
            <div key={idx} style={{
              background: "#fff", borderRadius: 8, padding: 10, marginBottom: 7,
              display: "flex", alignItems: "center", gap: 6
            }}>
              {idx > 0 && (
                <select
                  value={item.op}
                  onChange={e => handleOpChange(idx, e.target.value)}
                  style={{ marginRight: 7 }}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              )}
              <span style={{ minWidth: 230 }}>{item.comboObj.name}:
                <span style={{ color: "#1976d2", marginLeft: 8 }}>{getDisplay(item)}</span>
              </span>
              <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} style={{ marginLeft: 6 }}>↑</button>
              <button onClick={() => handleMove(idx, 1)} disabled={idx === builderList.length - 1}>↓</button>
              <button onClick={() => handleDelete(idx)} style={{ color: "#d32f2f" }}>삭제</button>
            </div>
          ))}
          <button
            onClick={handleSearch}
            style={{
              marginTop: 10,
              padding: "9px 30px",
              borderRadius: 8,
              background: "#1976d2",
              color: "#fff",
              fontWeight: 700,
              border: "none",
              fontSize: 16,
              cursor: "pointer"
            }}>
            실행
          </button>
          <div style={{ marginTop: 14 }}>
            <h4 style={{ marginBottom: 10 }}>검색 결과 ({result.length} 종목)</h4>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#e0f2f1" }}>
                  <th>코인</th>
                  <th>등락률</th>
                  <th>현재가</th>
                  <th>거래대금</th>
                </tr>
              </thead>
              <tbody>
                {result.map((c, idx) => (
                  <tr key={idx} style={{ cursor: "pointer" }} onClick={() => setSelectedCoin(c)}>
                    <td style={{ color: "#1976d2", fontWeight: 700 }}>{c.symbol}</td>
                    <td>{c.return}%</td>
                    <td>{c.close ? c.close.toLocaleString() : "미지원"}</td>
                    <td>{parseInt(c.volume).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <CoinChartModal
              open={!!selectedCoin}
              coin={getSelectedCoinWithCandles()}
              onClose={() => setSelectedCoin(null)}
            />
            {result.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button style={{ marginRight: 10 }}>백테스트로</button>
                <button style={{ marginRight: 10 }}>모의투자로</button>
                <button>실전매매로</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
