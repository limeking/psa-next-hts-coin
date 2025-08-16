import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useWatchlist from "../hooks/useWatchlist";

/**
 * ⭐ 관심종목 페이지 (공용 + 이름별 관리)
 * - 좌측: 관심종목 목록(공용 + 저장된 이름 리스트)
 * - 우측: 선택한 목록의 심볼 편집 (추가/삭제/덮어쓰기/다른이름으로 저장/초기화)
 *
 * 백엔드 의존 API (이미 ConditionSearchPage에서 사용):
 *  - GET  /api/coinlab/watchlist_names                -> { names: string[] }
 *  - GET  /api/coinlab/watchlist?name=XXX             -> { symbols: string[] }
 *  - POST /api/coinlab/watchlist?name=XXX (JSON body: { symbols: [...] })
 *
 * 공용 관심종목은 useWatchlist 훅을 그대로 사용합니다.
 */

const PANEL = {
  COMMON: "__COMMON__", // 공용 관심종목 표시용 상수
};

export default function WatchlistPage() {
  const navigate = useNavigate();

  // 공용 관심종목 훅 (기존 시스템과 동일)
  const {
    symbols: commonSymbols,
    add: addCommon,
    remove: removeCommon,
    save: saveCommon,
    loading: commonLoading,
  } = useWatchlist();

  // 새 목록 이름 입력용
  const [newListName, setNewListName] = useState(""); 

  // 이름별 관심종목 목록
  const [nameList, setNameList] = useState([]);
  const [selected, setSelected] = useState(PANEL.COMMON); // 좌측에서 선택된 목록 (기본: 공용)

  // 에디터 영역 (우측)에서 편집 중인 심볼들
  const [editingSymbols, setEditingSymbols] = useState([]);
  const [newSymbol, setNewSymbol] = useState("");

  // 저장 관련 입력 (다른이름으로 저장)
  const [saveAsName, setSaveAsName] = useState("");
  const [flash, setFlash] = useState("");
  const [flashType, setFlashType] = useState("info"); // info | success | error
  const [namesLoading, setNamesLoading] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);

  const [editMode, setEditMode] = useState(false);

  const nf = useMemo(() => new Intl.NumberFormat("ko-KR"), []);

  // 새 목록(빈 목록) 생성
  const handleCreateEmptyList = async () => {
    const name = withDateSuffix((newListName || "").trim());
    if (!name) return alert("새로 만들 목록의 이름을 입력하세요.");
    if (name === "(공용)" || name === PANEL.COMMON) return alert("이 이름은 사용할 수 없습니다.");
    try {
      // 중복 체크: 이미 있으면 선택만 전환
      if (nameList.includes(name)) {
        const go = window.confirm(`"${name}" 목록이 이미 있습니다. 그 목록을 불러올까요?`);
        if (go) setSelected(name);
        return;
      }
      // 빈 목록으로 생성
      await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [] }),
      });
      await fetchNameList();        // 좌측 이름 목록 갱신
      setSelected(name);            // 방금 만든 목록 선택
      setEditingSymbols([]);        // 우측 에디터는 빈 목록으로
      setNewListName("");           // 입력값 비우기
      setFlash(`새 목록 생성: ${name}`);
      setFlashType("success");
      setTimeout(() => setFlash(""), 2000);
    } catch (e) {
      alert("새 목록 생성 실패: " + (e?.message || e));
    }
  };

  // 🔹 최초/갱신: 이름 리스트 로드
  const fetchNameList = async () => {
    try {
      setNamesLoading(true);
      const r = await fetch("/api/coinlab/watchlist_names");
      const j = await r.json();
      setNameList(Array.isArray(j?.names) ? j.names : []);
    } catch (e) {
      setNameList([]);
    } finally {
      setNamesLoading(false);
    }
  };

  // 오늘 날짜 YYMMDD
  const todayYYMMDD = () => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  };

  // 이름 뒤에 (YYMMDD) 붙이기. 이미 (6자리숫자)로 끝나면 중복 안 붙임
  const withDateSuffix = (name) => {
    const base = String(name || "").trim();
    if (!base) return "";
    if (/\(\d{6}\)$/.test(base)) return base; // 이미 붙어있으면 그대로
    return `${base}(${todayYYMMDD()})`;
  };


  useEffect(() => { fetchNameList(); }, []);

  // 🔹 좌측 선택 변경 -> 우측 편집 목록 로드
  useEffect(() => {
    const loadPanel = async () => {
      setPanelLoading(true);
      try {
        if (selected === PANEL.COMMON) {
          setEditingSymbols(Array.isArray(commonSymbols) ? commonSymbols : []);
        } else if (selected) {
          const r = await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(selected)}`);
          const j = await r.json();
          setEditingSymbols(Array.isArray(j?.symbols) ? j.symbols : []);
        } else {
          setEditingSymbols([]);
        }
      } catch (e) {
        setEditingSymbols([]);
      } finally {
        setPanelLoading(false);
      }
    };
    loadPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, commonSymbols]);

  // 🔹 유틸: 심볼 정규화 (대문자 + _KRW 보정)
  const normalizeSymbol = (s) => {
    if (!s) return "";
    let v = String(s).trim().toUpperCase();
    if (!v) return "";
    if (!v.includes("_KRW")) v = `${v}_KRW`;
    return v;
  };

  // 🔹 편집: 심볼 추가
  const handleAddSymbol = () => {
    const v = normalizeSymbol(newSymbol);
    if (!v) return;
    setEditingSymbols((prev) => {
      if (prev.includes(v)) return prev; // 중복 방지
      return [...prev, v];
    });
    setNewSymbol("");
  };

  // 🔹 편집: 심볼 삭제
  const handleRemoveSymbol = (sym) => {
    setEditingSymbols((prev) => prev.filter((s) => s !== sym));
  };

  // 🔹 저장: 현재 선택 목록에 덮어쓰기
  const handleSaveOverwrite = async () => {
    try {
      if (selected === PANEL.COMMON) {
        await saveCommon(editingSymbols);
      } else if (selected) {
        await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(selected)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: editingSymbols }),
        });
      }
      setFlash(`저장 완료: ${selected === PANEL.COMMON ? "공용 관심종목" : selected} (${editingSymbols.length}종목)`);
      setFlashType("success");
      setTimeout(() => setFlash(""), 2200);
      if (selected !== PANEL.COMMON) await fetchNameList();
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    }
  };

  // 🔹 저장: 다른 이름으로 저장
  const handleSaveAs = async () => {
    const name = withDateSuffix((saveAsName || "").trim());
    if (!name) return alert("저장할 이름을 입력하세요.");
    try {
      await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: editingSymbols }),
      });
      setFlash(`저장 완료: ${name} (${editingSymbols.length}종목)`);
      setFlashType("success");
      setTimeout(() => setFlash(""), 2200);
      setSaveAsName("");
      await fetchNameList();
      setSelected(name);
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    }
  };

  // 🔹 목록 초기화 (비우기)
  const handleClearList = async () => {
    if (!window.confirm("현재 목록의 심볼을 모두 비울까요?")) return;
    try {
      if (selected === PANEL.COMMON) {
        await saveCommon([]);
      } else if (selected) {
        await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(selected)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: [] }),
        });
      }
      setEditingSymbols([]);
      setFlash("목록을 비웠습니다.");
      setFlashType("info");
      setTimeout(() => setFlash(""), 1800);
      if (selected !== PANEL.COMMON) await fetchNameList();
    } catch (e) {
      alert("초기화 실패: " + (e?.message || e));
    }
  };

  // 🔹 목록 삭제 (이름 자체 삭제) – 백엔드에 DELETE가 없다면, 초기화로 대체
  const handleDeleteList = async () => {
    if (selected === PANEL.COMMON) return alert("공용 관심종목은 삭제할 수 없습니다.");
    if (!window.confirm(`목록 \"${selected}\" 을(를) 삭제할까요?`)) return;
    try {
      // 선호: DELETE 시도
      const r = await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(selected)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        // 대안: 비우기로 대체(POST []) 후 좌측 목록에서 제거
        await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(selected)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: [] }),
        });
      }
      await fetchNameList();
      setSelected(PANEL.COMMON);
      setEditingSymbols(Array.isArray(commonSymbols) ? commonSymbols : []);
      setFlash("목록을 삭제했습니다.");
      setFlashType("info");
      setTimeout(() => setFlash(""), 1800);
    } catch (e) {
      alert("삭제 실패: " + (e?.message || e));
    }
  };

  const deleteSavedList = async (name) => {
    if (!name || name === "(공용)") return alert("공용은 삭제할 수 없습니다.");
    if (!window.confirm(`"${name}" 목록을 삭제할까요?`)) return;
  
    // 1) DELETE 시도
    let ok = false;
    try {
      const r = await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      ok = r.ok;
    } catch {}
  
    // 2) 구서버 폴백: 비우기
    if (!ok) {
      await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [] }),
      });
    }
  
    await fetchNameList();
    if (selected === name) {
      setSelected(PANEL.COMMON);
      setEditingSymbols(Array.isArray(commonSymbols) ? commonSymbols : []);
    }
    setFlash(ok ? `삭제 완료: ${name}` : `"${name}" 비워졌습니다.`);
    setFlashType("info");
    setTimeout(() => setFlash(""), 1800);
  };
  
  
  

  const LeftListItem = ({ id, label, count, active, onClick, showDelete, onDelete }) => (
    <div
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        cursor: "pointer",
        background: active ? "#e3f2fd" : "#fff",
        border: active ? "1px solid #1976d2" : "1px solid #eee",
        color: active ? "#0d47a1" : "#333",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8
      }}
      title={label}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </span>
        {typeof count === "number" && (
          <span style={{ color: "#777", fontSize: 12 }}>{count}</span>
        )}
      </div>
  
      {/* 편집 모드일 때만 삭제 버튼 노출 */}
      {showDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(label); }}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #e57373",
            background: "#ffebee",
            color: "#c62828",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer"
          }}
          title={`"${label}" 삭제`}
        >
          🗑 삭제
        </button>
      )}
    </div>
  );
  

  const currentCount = editingSymbols?.length || 0;

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontWeight: 800, color: "#1976d2", margin: 0 }}>⭐ 관심종목</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => navigate("/coinlab/dashboard")}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #1976d2", background: "#fff", color: "#1976d2", fontWeight: 700 }}
          >
            ← 대시보드
          </button>
        </div>
      </div>

      {/* 레이아웃: 좌측 목록 / 우측 에디터 */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        {/* 좌측: 목록 */}
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#1976d2" }}>목록</div>
          <div style={{ display: "grid", gap: 8 }}>
            <LeftListItem
              id={PANEL.COMMON}
              label="공용 관심종목"
              count={Array.isArray(commonSymbols) ? commonSymbols.length : 0}
              active={selected === PANEL.COMMON}
              onClick={() => setSelected(PANEL.COMMON)}
            />

            <div style={{ height: 6 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ color: "#777", fontSize: 12 }}>저장된 목록</div>
            <button
              onClick={() => setEditMode(v => !v)}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: editMode ? "#1976d2" : "#fafafa",
                color: editMode ? "#fff" : "#333",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer"
              }}
              title="저장된 목록 편집"
            >
              {editMode ? "편집 완료" : "편집"}
            </button>
          </div>

            {/* ✅ 새 목록 만들기 UI */}
            <div style={{ display:"flex", gap: 6, margin: "6px 0 4px 0" }}>
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="새 목록 이름(예: 단타관심)"
                style={{ flex: 1, padding: "6px 9px", borderRadius: 8, border: "1px solid #ddd" }}
              />
              <button
                onClick={handleCreateEmptyList}
                style={{ padding: "6px 10px", borderRadius: 8, background: "#1976d2", color: "#fff", border: "none", fontWeight: 700 }}
              >
                새로 만들기
              </button>
            </div>
            {namesLoading && <div style={{ color: "#999" }}>목록 불러오는 중…</div>}
            {!namesLoading && nameList.length === 0 && (
              <div style={{ color: "#aaa" }}>저장된 이름이 없습니다.</div>
            )}
            {!namesLoading && nameList.map((n) => (
              <LeftListItem
                key={n}
                id={n}
                label={n}
                count={undefined /* 선택 시 우측 편집에서 갱신 표시 */}
                active={selected === n}
                onClick={() => setSelected(n)}
                showDelete={editMode}                    // ✅ 편집 모드에서만 삭제 버튼 표시
                onDelete={(name) => deleteSavedList(name)} // ✅ 삭제 핸들러 연결
              />
            ))}
          </div>
        </div>

        {/* 우측: 에디터 */}
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 12, background: "#fff" }}>
          <div style={{ padding: 14, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800, color: "#0d47a1" }}>
              {selected === PANEL.COMMON ? "공용 관심종목" : `목록: ${selected}`}
              <span style={{ color: "#777", fontWeight: 400, marginLeft: 8 }}>({nf.format(currentCount)} 종목)</span>
            </div>
            {panelLoading && <div style={{ color: "#999" }}>로딩…</div>}
          </div>

          {/* 편집 영역 */}
          <div style={{ padding: 14 }}>
            {/* 추가 입력줄 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder="심볼 추가 (예: BTC 또는 BTC_KRW)"
                style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }}
              />
              <button
                onClick={handleAddSymbol}
                style={{ padding: "6px 14px", borderRadius: 8, background: "#1976d2", color: "#fff", border: "none", fontWeight: 700 }}
              >
                추가
              </button>
              <span style={{ color: "#888", fontSize: 12 }}>자동으로 대문자/ _KRW 로 정규화됩니다.</span>
            </div>

            {/* 심볼 테이블 */}
            <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #eee" }}>심볼</th>
                    <th style={{ width: 120, textAlign: "right", padding: "10px 12px", borderBottom: "1px solid #eee" }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {editingSymbols.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ padding: 16, color: "#777" }}>비어 있습니다.</td>
                    </tr>
                  ) : (
                    editingSymbols.map((s, i) => (
                      <tr key={`${s}-${i}`} style={{ borderTop: "1px solid #f7f7f7" }}>
                        <td style={{ padding: "10px 12px" }}>{s}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <button
                            onClick={() => handleRemoveSymbol(s)}
                            style={{ padding: "6px 10px", borderRadius: 7, background: "#d32f2f", color: "#fff", border: "none", fontWeight: 700 }}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 저장/초기화/다른이름 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
              {selected !== PANEL.COMMON && (
                <button
                  onClick={handleDeleteList}
                  style={{ padding: "8px 12px", borderRadius: 8, background: "#fff3e0", color: "#e65100", border: "1px solid #ff9800", fontWeight: 700 }}
                >
                  목록 삭제
                </button>
              )}

              <button
                onClick={handleClearList}
                style={{ padding: "8px 12px", borderRadius: 8, background: "#fafafa", color: "#444", border: "1px solid #ddd", fontWeight: 700 }}
              >
                초기화(비우기)
              </button>

              <button
                onClick={handleSaveOverwrite}
                disabled={panelLoading}
                style={{ padding: "8px 12px", borderRadius: 8, background: "#1976d2", color: "#fff", border: "none", fontWeight: 800 }}
              >
                저장 (덮어쓰기)
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="다른 이름으로 저장"
                  style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid #ccc", minWidth: 220 }}
                />
                <button
                  onClick={handleSaveAs}
                  style={{ padding: "8px 12px", borderRadius: 8, background: "#455a64", color: "#fff", border: "none", fontWeight: 800 }}
                >
                  저장
                </button>
              </div>

              {flash && (
                <div style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: flashType === "success" ? "#e8f5e9" : flashType === "error" ? "#ffebee" : "#e3f2fd",
                  color: flashType === "success" ? "#1b5e20" : flashType === "error" ? "#b71c1c" : "#0d47a1",
                  fontSize: 13,
                }}>
                  {flash}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
