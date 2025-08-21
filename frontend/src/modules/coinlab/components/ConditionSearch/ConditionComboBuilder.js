import React, { useState, useEffect } from "react";

// ① 조건항목 리스트
const ALL_CONDITIONS = [
  { key: "return", label: "상승률", inputType: "number", opList: [">", "<", ">=", "<="], unit: "%" },
  { key: "volume", label: "거래대금", inputType: "number", opList: [">", "<", ">=", "<="], unit: "₩" },
  { key: "rsi", label: "RSI(14)", inputType: "number", opList: [">", "<"], unit: "" },
  { key: "volume_change_rate", label: "전일대비 거래량(%)", inputType: "number", opList: [">", "<", ">=", "<="], unit: "%" },
  {
    key: "ma_cross",
    label: "이평선 크로스",
    inputType: "ma_cross",
    opList: ["상향돌파", "하향돌파"],
    maOptions: [5, 20, 60, 120]
  },
  {
    key: "ma_gap",
    label: "이평선 이격도",
    inputType: "ma_gap",
    opList: [">", "<", ">=", "<="],
    maOptions: [5, 20, 60, 120]
  },
  { key: "theme", label: "테마", inputType: "select", opList: ["="], options: ["AI", "DeFi", "게임", "플랫폼"], unit: "" },
  { key: "total_bid_size", label: "총매수잔량", inputType: "number", opList: [">", "<", ">=", "<="], unit: "" },
  { key: "total_ask_size", label: "총매도잔량", inputType: "number", opList: [">", "<", ">=", "<="], unit: "" },
  { key: "orderbook_ratio", label: "매수/매도 잔량비", inputType: "number", opList: [">", "<", ">=", "<="], unit: "" },
];

export default function ConditionComboBuilder({ value = [], onChange }) {
  const [combo, setCombo] = useState(value || []);
  const [selectedCondition, setSelectedCondition] = useState(null);
  const [selectedOp, setSelectedOp] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [logicOps, setLogicOps] = useState(value.length > 0 ? value.map((_, i) => (i === 0 ? "" : "AND")) : []);

  useEffect(() => {
    // value가 combo랑 다를 때만 동기화
    if (JSON.stringify(value) !== JSON.stringify(combo)) {
      setCombo(value);
      setLogicOps(
        value.length > 0
          ? value.map((c, i) => (i === 0 ? "" : ((c && c.logic) ? String(c.logic).toUpperCase() : "AND")))
          : []
      );
    }
  }, [value]);
  

  useEffect(() => {
    if (onChange) {
      const out = combo.map((c, i) => ({
        ...c,
        logic: (logicOps[i] ? String(logicOps[i]).toUpperCase() : (i === 0 ? "AND" : "AND"))
      }));
      
      onChange(out);
    }
    // eslint-disable-next-line
  }, [combo, logicOps]);

  // 조건 추가 핸들러
  const handleAddCondition = () => {
    // [MA 크로스/이격도] 값 체크
    if (selectedCondition?.inputType === "ma_cross") {
      if (!selectedValue.ma1 || !selectedValue.ma2 || !selectedOp) return;
      setCombo([...combo, {
        key: selectedCondition.key,
        label: selectedCondition.label,
        op: selectedOp,
        value: { ma1: selectedValue.ma1, ma2: selectedValue.ma2 },
        unit: ""
      }]);
      setLogicOps([...logicOps, combo.length === 0 ? "" : "AND"]);
      setSelectedCondition(null); setSelectedOp(""); setSelectedValue({});
      return;
    }
    if (selectedCondition?.inputType === "ma_gap") {
      if (!selectedValue.ma1 || !selectedValue.ma2 || !selectedOp || !selectedValue.gap) return;
      setCombo([...combo, {
        key: selectedCondition.key,
        label: selectedCondition.label,
        op: selectedOp,
        value: { ma1: selectedValue.ma1, ma2: selectedValue.ma2, gap: selectedValue.gap },
        unit: "%"
      }]);
      setLogicOps([...logicOps, combo.length === 0 ? "" : "AND"]);
      setSelectedCondition(null); setSelectedOp(""); setSelectedValue({});
      return;
    }
    // 일반 조건
    if (!selectedCondition || !selectedOp || selectedValue === "") return;
    setCombo([...combo, {
      key: selectedCondition.key,
      label: selectedCondition.label,
      op: selectedOp,
      value: selectedValue,
      unit: selectedCondition.unit
    }]);
    setLogicOps([...logicOps, combo.length === 0 ? "" : "AND"]);
    setSelectedCondition(null); setSelectedOp(""); setSelectedValue("");
  };

  // 조합에서 조건 삭제
  const handleDelete = (idx) => {
    const newCombo = combo.filter((_, i) => i !== idx);
    setCombo(newCombo);
    setLogicOps(logicOps.filter((_, i) => i !== idx));
  };

  // AND/OR 연산자 변경
  const handleLogicChange = (idx, newOp) => {
    setLogicOps(logicOps.map((op, i) => i === idx ? newOp : op));
  };

  // 조합 순서 변경 (위/아래)
  const handleMove = (idx, dir) => {
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === combo.length - 1)) return;
    const newCombo = [...combo];
    const newLogic = [...logicOps];
    [newCombo[idx], newCombo[idx + dir]] = [newCombo[idx + dir], newCombo[idx]];
    [newLogic[idx], newLogic[idx + dir]] = [newLogic[idx + dir], newLogic[idx]];
    setCombo(newCombo); setLogicOps(newLogic);
  };

  // 조건식 자연어 표시 함수 (특히 ma_cross/ma_gap)
  function getDisplay(c) {
    if (c.key === "volume_change_rate") {
      return `전일대비 거래량 ${c.op} ${c.value}%`;
    }
    if (c.key === "total_bid_size") {
      return `총매수잔량 ${c.op} ${c.value}`;
    }
    if (c.key === "total_ask_size") {
      return `총매도잔량 ${c.op} ${c.value}`;
    }
    if (c.key === "orderbook_ratio") {
      return `매수/매도 잔량비 ${c.op} ${c.value}`;
    }
    if (c.key === "ma_cross") {
      return `${c.value.ma1}이평선이 ${c.value.ma2}이평선을 ${c.op}`;
    }
    if (c.key === "ma_gap") {
      return `${c.value.ma1}이평선과 ${c.value.ma2}이평선 이격도 ${c.op} ${c.value.gap}%`;
    }
    if (c.key === "theme") {
      return `테마 = ${c.value}`;
    }
    return `${c.label} ${c.op} ${c.value}${c.unit}`;
  }

  return (
    <div style={{ minWidth: 320, background: "#f7f7fa", padding: 16, borderRadius: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color: "#1976d2" }}>조건식</div>
      {/* 조건항목 선택/추가 */}
      <div style={{ marginBottom: 10 }}>
        {ALL_CONDITIONS.map(cond => (
          <button
            key={cond.key}
            style={{ display: "inline-block", marginRight: 6, marginBottom: 6, padding: "4px 9px", borderRadius: 8, border: "1px solid #aaa", background: "#fff" }}
            onClick={() => {
              setSelectedCondition(cond);
              setSelectedOp("");
              setSelectedValue(cond.inputType === "ma_cross" || cond.inputType === "ma_gap" ? {} : "");
            }}
          >+ {cond.label}</button>
        ))}
      </div>
      {/* 추가 영역 */}
      {selectedCondition && (
        <div style={{ marginBottom: 10 }}>
          {/* MA 크로스(골든/데드) */}
          {selectedCondition.inputType === "ma_cross" && (
            <span>
              <select value={selectedValue.ma1 || ""} onChange={e => setSelectedValue(v => ({ ...v, ma1: e.target.value }))}>
                <option value="">기준선</option>
                {selectedCondition.maOptions.map(ma => <option key={ma} value={ma}>{ma}이평선</option>)}
              </select>
              <select value={selectedOp} onChange={e => setSelectedOp(e.target.value)} style={{ margin: "0 7px" }}>
                <option value="">방향</option>
                {selectedCondition.opList.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <select value={selectedValue.ma2 || ""} onChange={e => setSelectedValue(v => ({ ...v, ma2: e.target.value }))}>
                <option value="">대상선</option>
                {selectedCondition.maOptions.map(ma => <option key={ma} value={ma}>{ma}이평선</option>)}
              </select>
              <button onClick={handleAddCondition} style={{ marginLeft: 10 }}>추가</button>
            </span>
          )}
          {/* MA 이격도 */}
          {selectedCondition.inputType === "ma_gap" && (
            <span>
              <select value={selectedValue.ma1 || ""} onChange={e => setSelectedValue(v => ({ ...v, ma1: e.target.value }))}>
                <option value="">이평선1</option>
                {selectedCondition.maOptions.map(ma => <option key={ma} value={ma}>{ma}이평선</option>)}
              </select>
              <select value={selectedValue.ma2 || ""} onChange={e => setSelectedValue(v => ({ ...v, ma2: e.target.value }))}>
                <option value="">이평선2</option>
                {selectedCondition.maOptions.map(ma => <option key={ma} value={ma}>{ma}이평선</option>)}
              </select>
              <select value={selectedOp} onChange={e => setSelectedOp(e.target.value)} style={{ margin: "0 7px" }}>
                <option value="">비교연산</option>
                {selectedCondition.opList.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input type="number" value={selectedValue.gap || ""} onChange={e => setSelectedValue(v => ({ ...v, gap: e.target.value }))} style={{ width: 50 }} />%
              <button onClick={handleAddCondition} style={{ marginLeft: 10 }}>추가</button>
            </span>
          )}
          {/* 일반 숫자조건/테마 */}
          {selectedCondition.inputType === "number" && (
            <span>
              <select value={selectedOp} onChange={e => setSelectedOp(e.target.value)} style={{ marginRight: 8 }}>
                <option value="">비교연산</option>
                {selectedCondition.opList.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input type="number" value={selectedValue} onChange={e => setSelectedValue(e.target.value)} style={{ width: 70 }} />
              {selectedCondition.unit}
              <button onClick={handleAddCondition} style={{ marginLeft: 10 }}>추가</button>
            </span>
          )}
          {selectedCondition.inputType === "select" && (
            <span>
              <select value={selectedOp} onChange={e => setSelectedOp(e.target.value)} style={{ marginRight: 8 }}>
                <option value="">비교연산</option>
                {selectedCondition.opList.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <select value={selectedValue} onChange={e => setSelectedValue(e.target.value)} style={{ marginLeft: 6 }}>
                <option value="">선택</option>
                {selectedCondition.options.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <button onClick={handleAddCondition} style={{ marginLeft: 10 }}>추가</button>
            </span>
          )}
        </div>
      )}
      {/* 조건식 리스트 */}
      <div>
        {combo.length === 0 && <div style={{ color: "#bbb" }}>추가된 조건이 없습니다.</div>}
        {combo.map((c, i) => (
          <div key={i} style={{ marginBottom: 10, background: "#fff", borderRadius: 7, padding: 8, display: "flex", alignItems: "center" }}>
            {i > 0 &&
              <select value={logicOps[i]} onChange={e => handleLogicChange(i, e.target.value)} style={{ marginRight: 8 }}>
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>}
            <span style={{ minWidth: 180 }}>{getDisplay(c)}</span>
            <button onClick={() => handleDelete(i)} style={{ marginLeft: 8 }}>❌</button>
            <button onClick={() => handleMove(i, -1)} disabled={i === 0} style={{ marginLeft: 4 }}>↑</button>
            <button onClick={() => handleMove(i, 1)} disabled={i === combo.length - 1}>↓</button>
          </div>
        ))}
      </div>
    </div>
  );
}
