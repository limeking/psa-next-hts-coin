import React, { useState, useEffect } from "react";
import { fetchConditionList, saveConditionList } from "../../api/conditionComboApi";
import ConditionComboBuilder from "./ConditionComboBuilder";

export default function ConditionComboManager({ onAddCombo }) {
  const [comboList, setComboList] = useState([]);
  const [currentCombo, setCurrentCombo] = useState([]);
  const [comboName, setComboName] = useState("");

  // 최초 목록 불러오기
  useEffect(() => {
    fetchConditionList().then(setComboList).catch(() => setComboList([]));
  }, []);

  // 저장: 현재 만든 조건식(이름+combo) 목록에 추가, 백엔드에도 저장
  const handleSaveCombo = async () => {
    if (!comboName || currentCombo.length === 0) {
      alert("조건식 이름과 내용을 모두 입력하세요!");
      return;
    }
    const newCombo = { name: comboName, combo: currentCombo };
    const newList = [...comboList, newCombo];
    try {
      await saveConditionList(newList);
      setComboList(newList);
      setCurrentCombo([]);
      setComboName("");
      alert("저장되었습니다!");
    } catch (e) {
      alert("저장 실패: " + e.message);
    }
  };

  // 삭제: 목록에서 빼고 백엔드에도 저장
  const handleDelete = async (idx) => {
    if (!window.confirm("정말 삭제할까요?")) return;
    const newList = comboList.filter((_, i) => i !== idx);
    try {
      await saveConditionList(newList);
      setComboList(newList);
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  // 오른쪽 조합 빌더에 추가
  const handleAddToBuilder = (item) => {
    if (onAddCombo) onAddCombo(item);
  };

  return (
    <div style={{ width: 260, background: "#f6f9fb", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800, color: "#1976d2", marginBottom: 13 }}>조건검색식 목록</div>
      {comboList.length === 0 && <div style={{ color: "#aaa", marginBottom: 14 }}>저장된 조건검색식이 없습니다.</div>}
      {comboList.map((item, idx) => (
        <div key={idx} style={{
          background: "#fff", borderRadius: 8, padding: "6px 5px", marginBottom: 5,
          display: "flex", alignItems: "center", gap: 4
        }}>
          <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
          <button
            onClick={() => handleAddToBuilder(item)}
            style={{
              fontSize: 13, background: "#1976d2", color: "#fff", borderRadius: 7, border: "none", padding: "2px 10px", cursor: "pointer"
            }}>추가</button>
          <button onClick={() => handleDelete(idx)} style={{ fontSize: 13, color: "#d32f2f", marginLeft: 2 }}>삭제</button>
        </div>
      ))}
      <hr style={{ margin: "16px 0" }} />
      <div style={{ fontWeight: 700, marginBottom: 8 }}>새 조건검색식 만들기</div>
      <input value={comboName} onChange={e => setComboName(e.target.value)}
        placeholder="조건검색식 이름" style={{ width: "98%", marginBottom: 5 }} />
      <ConditionComboBuilder value={currentCombo} onChange={setCurrentCombo} />
      <button
        style={{ marginTop: 8, padding: "6px 18px", borderRadius: 8, background: "#1976d2", color: "#fff", fontWeight: 600, border: "none" }}
        onClick={handleSaveCombo}
      >저장</button>
    </div>
  );
}
