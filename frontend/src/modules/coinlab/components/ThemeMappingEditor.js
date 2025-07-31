import React, { useEffect, useState } from "react";

// ThemeMappingEditor는 테마-코인 매핑 관리용 컴포넌트입니다.
export default function ThemeMappingEditor() {
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(true);
  const [themeName, setThemeName] = useState("");
  const [coinInput, setCoinInput] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch("/api/coinlab/theme_mapping")
      .then((res) => res.json())
      .then((data) => setMapping(data))
      .finally(() => setLoading(false));
  }, []);

  // 테마 추가/수정
  const handleAddOrUpdate = () => {
    if (!themeName) return;
    const coins = coinInput
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    setMapping((prev) => ({ ...prev, [themeName]: coins }));
    setThemeName("");
    setCoinInput("");
    setSelected(null);
  };

  // 테마 삭제
  const handleDelete = (theme) => {
    if (!window.confirm(`${theme} 테마를 삭제할까요?`)) return;
    const newMapping = { ...mapping };
    delete newMapping[theme];
    setMapping(newMapping);
    setThemeName("");
    setCoinInput("");
    setSelected(null);
  };

  // 기존 테마 선택(수정/편집)
  const handleSelect = (theme) => {
    setThemeName(theme);
    setCoinInput((mapping[theme] || []).join(", "));
    setSelected(theme);
  };

  // 백엔드에 매핑 저장 (POST)
  const handleSave = () => {
    fetch("/api/coinlab/theme_mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    })
      .then((res) => res.json())
      .then(() => alert("저장 완료!"))
      .catch(() => alert("저장 실패!"));
  };

  if (loading) return <div>테마 매핑 로딩 중...</div>;

  return (
    <div style={{ background: "#fafafa", padding: 24, borderRadius: 12, margin: "24px 0", maxWidth: 600 }}>
      <h4>테마 매핑 관리 (추가/수정/삭제)</h4>
      <table style={{ width: "100%", marginBottom: 16 }}>
        <thead>
          <tr style={{ background: "#eee" }}>
            <th>테마명</th>
            <th>코인목록(쉼표구분)</th>
            <th>편집</th>
            <th>삭제</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(mapping).map(([theme, coins]) => (
            <tr key={theme}>
              <td>{theme}</td>
              <td>{coins.join(", ")}</td>
              <td>
                <button onClick={() => handleSelect(theme)}>✏️</button>
              </td>
              <td>
                <button onClick={() => handleDelete(theme)}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="테마명 (예: NFT)"
          value={themeName}
          onChange={e => setThemeName(e.target.value)}
          style={{ flex: 1 }}
        />
        <input
          placeholder="코인목록 (예: SAND, MANA, ENJ)"
          value={coinInput}
          onChange={e => setCoinInput(e.target.value)}
          style={{ flex: 3 }}
        />
        <button onClick={handleAddOrUpdate}>{selected ? "수정" : "추가"}</button>
      </div>
      <button onClick={handleSave} style={{
        background: "#1976d2", color: "#fff", border: "none", borderRadius: 8,
        padding: "8px 16px", fontWeight: 700
      }}>저장</button>
    </div>
  );
}
