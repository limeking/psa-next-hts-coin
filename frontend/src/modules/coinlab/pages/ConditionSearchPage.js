// frontend/src/modules/coinlab/pages/ConditionSearchPage.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ConditionComboManager from "../components/ConditionSearch/ConditionComboManager";
import CoinChartModal from "../components/Backtest/CoinChartModal";
import { dummyCandles } from '../components/dummy/dummyCoinResults';
import { fetchConditionSearchList, saveConditionSearchList } from '../api/conditionSearchApi';
import { runConditionSearch, fetchCandles } from "../services/coinApi";
import WatchlistPanel from "../components/WatchlistPanel";
import useWatchlist from "../hooks/useWatchlist";

const dummyCoinList = [
  { symbol: "BTC_KRW", return: 3.2, volume: 7000000000, rsi: 55, ma5: 45000, ma20: 43000, ma60: 40000, ma120: 38000, theme: "플랫폼", close: 45000 },
  { symbol: "HIPPO_KRW", return: 7.5, volume: 180000000, rsi: 27, ma5: 105, ma20: 98, ma60: 91, ma120: 80, theme: "AI", close: 105 },
  { symbol: "ETH_KRW", return: 1.2, volume: 4000000000, rsi: 62, ma5: 2900, ma20: 2700, ma60: 2400, ma120: 2100, theme: "DeFi", close: 2900 },
];

function filterByComboObj(comboObj, data) {
  const combo = comboObj?.combo || [];
  return data.filter(item =>
    combo.every(cond => {
      if (cond.key === "ma_cross") {
        const ma1 = item["ma" + cond.value.ma1];
        const ma2 = item["ma" + cond.value.ma2];
        if (!ma1 || !ma2) return false;
        return cond.op === "상향돌파" ? (ma1 > ma2) : (ma1 < ma2);
      }
      if (cond.key === "ma_gap") {
        const ma1 = item["ma" + cond.value.ma1];
        const ma2 = item["ma" + cond.value.ma2];
        if (!ma1 || !ma2) return false;
        const gap = ((ma1 - ma2) / ma2) * 100;
        if (cond.op === ">") return gap > Number(cond.value.gap);
        if (cond.op === "<") return gap < Number(cond.value.gap);
        if (cond.op === ">=") return gap >= Number(cond.value.gap);
        if (cond.op === "<=") return gap <= Number(cond.value.gap);
        return false;
      }
      const v = item[cond.key];
      if (cond.op === ">")  return Number(v) >  Number(cond.value);
      if (cond.op === ">=") return Number(v) >= Number(cond.value);
      if (cond.op === "<")  return Number(v) <  Number(cond.value);
      if (cond.op === "<=") return Number(v) <= Number(cond.value);
      if (cond.op === "=") return String(v) === String(cond.value);
      return false;
    })
  );
}

export default function ConditionSearchPage() {
  const [builderList, setBuilderList] = useState([]);
  const [savedCombos, setSavedCombos] = useState([]);
  const [result, setResult] = useState([]);
  const { symbols: gwatch, add: addWatch, remove: removeWatch, save: saveWatch, loading: wlLoading } = useWatchlist();
  const [interval, setInterval] = useState("1d"); // 1단계 인터벌
  const [stage2Combos, setStage2Combos] = useState([]); // 2단계 조합식
  const [autoRefresh, setAutoRefresh] = useState(false); // 자동 새로고침 활성화 여부
  const [refreshMs, setRefreshMs] = useState(2000); // 자동 새로고침 간격(ms)
  const [saveName, setSaveName] = useState(""); // 조합식 저장 이름
  const [showLoadModal, setShowLoadModal] = useState(false); // 조합식 불러오기 모달 표시 여부

  const [selectedCoin, setSelectedCoin] = useState(null); // 선택된 코인
  const [candles, setCandles] = useState([]); // 캔들
  const [appliedComboName, setAppliedComboName] = useState(""); // 적용된 조합식 이름
  const [isSearching, setIsSearching] = useState(false); // 검색 진행 여부
  const [isLoadingCandles, setIsLoadingCandles] = useState(false); // 캔들 로딩 여부
  const [useRealtime, setUseRealtime] = useState(false); // 실시간 조건 포함 여부
  const [isStage2Running, setIsStage2Running] = useState(false); // 2단계 실행 여부
  const stage2RunningRef = useRef(false);
  const ctrlRef = useRef();
  const [stage1Symbols, setStage1Symbols] = useState([]); // 1단계 실행 결과 심볼 보관
  const [watchlistName, setWatchlistName] = useState(""); // 관심종목 저장 이름(옵션)
  const [watchlistNames, setWatchlistNames] = useState([]); // 관심종목 이름 목록
  const [selectedWatchlist, setSelectedWatchlist] = useState(""); // 불러올 이름름
  const [useWatchlistForStage2, setUseWatchlistForStage2] = useState(false); // ⬅️ 체크되면 관심종목 기반
  const [selectedWatchlistSymbols, setSelectedWatchlistSymbols] = useState([]); // 선택된 이름의 심볼들
  const [flash, setFlash] = useState(""); // 플래시 메시지
  const [flashType, setFlashType] = useState("info"); // 플래시 타입 info | success | error
  const [orderbookDepth, setOrderbookDepth] = useState(5); // 오더북 깊이  5/10/20/30
  const [lastScannedAt, setLastScannedAt] = useState(null); // 마지막 스캔 시간
  const [tick, setTick] = useState(0); // 다음 갱신까지 남은 ms 표시용용
  
  // ✅ 정렬 상태
  // 검색 결과(코인 리스트) 테이블의 정렬 상태를 관리
  // 기본 정렬: 등락률(return)이 높은 순(내림차순)
  const [sortConfig, setSortConfig] = useState({ key: "return", direction: "desc" });

  const navigate = useNavigate();

  useEffect(() => { fetchAllCombos(); }, []);

  useEffect(() => () => ctrlRef.current?.abort?.(), []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/coinlab/watchlist_names");
        const j = await r.json();
        setWatchlistNames(j?.names || []);
      } catch { setWatchlistNames([]); }
    })();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    let timerId;
    let countTimer;
    let left;
    const loop = async () => {
      await handleStage2ScanOnce();
      setLastScannedAt(new Date());
      left = Math.max(500, refreshMs);
      setTick(left);
      timerId = setTimeout(loop, Math.max(500, refreshMs));
    };
    timerId = setTimeout(loop, Math.max(500, refreshMs));
    countTimer = setInterval(() => { left = (left || 0) - 250; setTick(left > 0 ? left : 0); }, 250);
    return () => { if (timerId) clearTimeout(timerId); if (countTimer) clearInterval(countTimer); };
    }, [
      autoRefresh,
      refreshMs,
      JSON.stringify(stage2Combos),
      useWatchlistForStage2,
      selectedWatchlist,
      JSON.stringify(selectedWatchlistSymbols),
      JSON.stringify(stage1Symbols),
      JSON.stringify(gwatch),
      orderbookDepth,
    ]);
  
  

  const fetchAllCombos = async () => {
    try {
      const list = await fetchConditionSearchList();
      setSavedCombos(Array.isArray(list) ? list : []);
    } catch {
      setSavedCombos([]);
    }
  };

  const handleDeleteSavedCombo = async (idx) => {
    if (!window.confirm("정말 이 조합을 삭제할까요?")) return;
    const newCombos = savedCombos.filter((_, i) => i !== idx);
    try {
      await saveConditionSearchList(newCombos);
      setSavedCombos(newCombos);
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  const handleSaveCombo = async () => {
    if (!saveName || builderList.length === 0) {
      alert("저장할 이름과 조합식을 입력하세요!");
      return;
    }
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

  const handleShowLoadModal = async () => {
    await fetchAllCombos();
    setShowLoadModal(true);
  };

  const handleSelectCombo = (item) => {
    setBuilderList(item.combo);
    setAppliedComboName(item.name || "");
    setShowLoadModal(false);
  };

  // 실행 (실데이터 우선 → 실패 시 더미)
  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const combos = builderList.flatMap(x => x?.comboObj?.combo || []);
      const payload = ({ combos, interval, realtime: useRealtime });
      const res = await runConditionSearch(payload);
      const rows = Array.isArray(res?.coins) ? res.coins : [];
      setResult(rows);
    } catch (err) {
      console.error("실데이터 조건검색 실패, 더미 데이터 사용:", err);
      if (builderList.length === 0) {
        setResult(dummyCoinList);
      } else {
        let combined = filterByComboObj(builderList[0].comboObj, dummyCoinList);
        for (let i = 1; i < builderList.length; i++) {
          const op = builderList[i].op;
          const nextRes = filterByComboObj(builderList[i].comboObj, dummyCoinList);
          if (op === "AND") {
            combined = combined.filter(x => nextRes.some(y => y.symbol === x.symbol));
          } else {
            combined = [...combined, ...nextRes].filter(
              (v, idx, arr) => arr.findIndex(t => t.symbol === v.symbol) === idx
            );
          }
        }
        setResult(combined);
      }
    } finally {
      setBuilderList([]);
      setAppliedComboName("");
      setIsSearching(false);
    }
  };

  // 행 클릭 → 모달 띄우고, 캔들은 비동기 로딩
  const handleRowClick = async (coin) => {
    const normSymbol = coin.symbol?.includes("_KRW") ? coin.symbol : `${coin.symbol}_KRW`;
    setSelectedCoin({
      ...coin,
      symbol: normSymbol,
      interval: "1d",
      name: coin.name || coin.symbol || normSymbol,
      title: `${coin.name || coin.symbol || normSymbol} (1d)`,
    });
  setCandles([]);

    try {
      setIsLoadingCandles(true);
      const data = await fetchCandles(normSymbol, "1d"); // (symbol, interval) 포지셔널 인자!
      setCandles(Array.isArray(data?.candles) ? data.candles : []);
      setSelectedCoin(prev => ({
        ...prev,
        symbol: data?.symbol || normSymbol,
        interval: data?.interval || "1d",
        title: `${prev?.name || normSymbol} (${data?.interval || "1d"})`,
      }));
    } catch (err) {
      console.error("캔들 로딩 실패, 더미 사용:", err);
      setCandles(dummyCandles[normSymbol] || dummyCandles[coin.symbol] || []);
    } finally {
      setIsLoadingCandles(false);
    }
  };

  const getDisplay = (item) => {
    if (!item?.comboObj?.combo) return "";
    return item.comboObj.combo.map(c => {
      if (c.key === "ma_cross") return `${c.value.ma1}이평선이 ${c.value.ma2}이평선을 ${c.op}`;
      if (c.key === "ma_gap")   return `${c.value.ma1}이평선과 ${c.value.ma2}이평선 이격도 ${c.op} ${c.value.gap}%`;
      if (c.key === "theme")    return `테마 = ${c.value}`;
      return `${c.label} ${c.op} ${c.value}${c.unit}`;
    }).join(" · ");
  };

  const handleAddCombo = (comboObj) => {
    setBuilderList(list => [...list, { comboObj, op: list.length === 0 ? "" : "AND" }]);
  };
  const handleOpChange = (idx, op) => setBuilderList(list => list.map((x, i) => i === idx ? { ...x, op } : x));
  const handleMove = (idx, dir) => {
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === builderList.length - 1)) return;
    const newList = [...builderList];
    [newList[idx], newList[idx + dir]] = [newList[idx + dir], newList[idx]];
    setBuilderList(newList);
  };
  const handleDelete = (idx) => setBuilderList(list => list.filter((_, i) => i !== idx));

  // =========================
  // ✅ 헤더 클릭 정렬 (토글)
  // =========================
  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedResult = useMemo(() => {
    if (!Array.isArray(result) || !sortConfig.key) return result;
    const sorted = [...result].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (["return","close","volume","orderbook_ratio","total_bid_size","total_ask_size","best_bid_size","best_ask_size"].includes(sortConfig.key)) {
        const aN = Number(valA);
        const bN = Number(valB);
        const aBad = !Number.isFinite(aN);
        const bBad = !Number.isFinite(bN);
        if (aBad && bBad) return 0;
        if (aBad) return 1;       // a가 null/NaN 이면 항상 뒤로
        if (bBad) return -1;
        valA = aN; valB = bN;
      } else {
          valA = String(valA ?? "");
          valB = String(valB ?? "");
        }
      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [result, sortConfig]);

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "↑" : "↓";
  };


  const handleStage1Search = async () => {
    setIsSearching(true);
    try {
      // 현재 조합 영역(= builderList)을 1단계 조건으로 사용
      const combos = builderList.flatMap(x => x?.comboObj?.combo || []);
      const payload = { combos, interval, realtime: false };
      const res = await runConditionSearch(payload);
      const rows = Array.isArray(res?.coins) ? res.coins : [];
      setResult(rows);
      setStage1Symbols(rows.map(r => r.symbol));
    } catch (e) {
      console.error(e);
      // 실패 시 더미/필요 처리
    } finally {
      setIsSearching(false);
    }
  };

  const stage2Payload = () => ({
    combos: stage2Combos.flatMap(x => x?.comboObj?.combo || []),
    realtime: true,
    interval,
    symbols: getStage2Symbols(),            // ⬅️ 1단계에서 만든 관심종목만 대상으로
    orderbook_depth: Number(orderbookDepth) || 5,
  });
  
  const handleStage2ScanOnce = async () => {
    if (stage2RunningRef.current) return;
    stage2RunningRef.current = true;
    setIsStage2Running(true);
    try {
      ctrlRef.current?.abort?.();
      ctrlRef.current = new AbortController();
      const payload = stage2Payload();
      if (!Array.isArray(payload.symbols) || payload.symbols.length === 0) {
        alert(`${getSymbolsLabel()} 대상 심볼이 없습니다. 먼저 목록을 준비하세요.`);
        return;
      }
      const res = await runConditionSearch(payload, ctrlRef.current?.signal);
      const rows = Array.isArray(res?.coins) ? res.coins : [];
      setResult(rows);
    } finally {
      setIsStage2Running(false);
      stage2RunningRef.current = false;
    }
  };
  
  const handleStage2Scan = async () => {
    // 실시간 컬럼 보이기
    setUseRealtime(true);
     // 수동 1회 실행
    await handleStage2ScanOnce();
    // 자동갱신이 켜져있으면 이후 호출은 useEffect 루프가 처리리
  };

  const handleSaveStage1ToWatchlist = async () => {
    if (!stage1Symbols.length) return alert("저장할 1차 결과가 없습니다.");
    try {
      const name = (watchlistName || "").trim();
  
      // 1) 공용 관심종목 저장
      await saveWatch(stage1Symbols);
  
      // 2) 이름으로도 저장 (백엔드가 ?name= 지원해야 작동)
      if (name) {
        await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: stage1Symbols })
        });
        // 저장 후 이름 목록 갱신
        try {
          const r = await fetch("/api/coinlab/watchlist_names");
          const j = await r.json();
          setWatchlistNames(j?.names || []);
        } catch {}
      }
  
      // ✅ 입력칸 비우기 + 플래시 메시지
      setWatchlistName("");
      setFlash(`저장 완료: ${name || "공용 관심종목"} (${stage1Symbols.length}종목)`);
      setFlashType("success");
      setTimeout(() => setFlash(""), 2200);
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    }
  };
  

  const handleLoadNamedWatch = async () => {
    if (!selectedWatchlist) return;
    try {
      const r = await fetch(`/api/coinlab/watchlist?name=${encodeURIComponent(selectedWatchlist)}`);
      const j = await r.json();
      const syms = j?.symbols || [];
      setSelectedWatchlistSymbols(syms);
  
      // 관심종목 모드로 스캔하는 중이면 테이블에도 미리 표시
      if (useWatchlistForStage2) {
        setResult(syms.map(s => ({ symbol: s })));
      }
      setUseRealtime(false);
  
      // ✅ 로드 완료 안내
      setFlash(`불러옴: ${selectedWatchlist} (${syms.length}종목) — 2단계 대상: ${useWatchlistForStage2 ? "관심종목" : "1차결과"} 모드`);
      setFlashType("info");
      setTimeout(() => setFlash(""), 2500);
    } catch (e) {
      alert("불러오기 실패: " + (e?.message || e));
    }
  };
  

  const getStage2Symbols = () => {
    if (useWatchlistForStage2) {
      // 이름을 고르면 그 리스트, 아니면 공용 gwatch 사용
      const arr = selectedWatchlist ? selectedWatchlistSymbols : gwatch;
      return Array.isArray(arr) ? arr : [];
    }
    return Array.isArray(stage1Symbols) ? stage1Symbols : [];
  };

  const getSymbolsLabel = () =>
    useWatchlistForStage2
      ? (selectedWatchlist ? `관심종목(${selectedWatchlist})` : "관심종목")
      : "1차결과";
  

  const RunBadge = ({ active, text }) =>
    active ? (
      <span
        style={{
          padding: '2px 10px',
          borderRadius: 999,
          background: '#1e88e5',
          color: '#fff',
          fontSize: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#fff',
            animation: 'pulse 1.2s infinite',
          }}
        />
        {text}
        <style>
          {`@keyframes pulse{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}`}
        </style>
      </span>
    ) : null;

  // 숫자 포맷터(한국 로케일)
  const nf = new Intl.NumberFormat('ko-KR');



  const retColor = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "#000";
    if (n > 0) return "#d32f2f"; // 상승=빨강
    if (n < 0) return "#1976d2"; // 하락=파랑
    return "#000";
  };

  const ratioColor = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return "#000";   // 무채색
    return n > 1 ? "#d32f2f" : "#1976d2";
  };

  const displayRatio = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "-";      // 0 나눗셈 등 비정상값 가드
    return n.toFixed(2);
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <button
        style={{
          marginBottom: 22, padding: "10px 28px", borderRadius: 8,
          background: "#f5f5f5", border: "1px solid #1976d2", color: "#1976d2",
          fontWeight: "bold", fontSize: 16, cursor: "pointer",
        }}
        onClick={() => navigate("/coinlab/dashboard")}
      >
        🏠 대시보드로
      </button>

      <h2 style={{ fontWeight: 800, fontSize: 28, marginBottom: 12, color: "#1976d2" }}>
        🧠 조건검색식 조합식 빌더 (실전 HTS)
      </h2>

      <div style={{ display: "flex", gap: 36, alignItems: "flex-start", marginBottom: 18 }}>
        <div style={{ display:"grid", gap:16 }}>
          <ConditionComboManager onAddCombo={handleAddCombo} />
          <WatchlistPanel
            symbols={gwatch}
            onRemove={removeWatch}
            onSave={saveWatch}
            title="관심종목(공용)"
            loading={wlLoading}
          />
        </div>

        <div style={{ flex: 1, minWidth: 420 }}>
          <div style={{ marginBottom: 12, fontWeight: 700, color: "#1976d2" }}>
            조건검색식 조합영역
            <span style={{ color: "#555", fontWeight: 400, fontSize: 14, marginLeft: 10 }}>
              (추가할 때마다 AND/OR 지정, 순서변경, 삭제 가능)
            </span>
          </div>

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
              onClick={() => { setBuilderList([]); setAppliedComboName(""); }}
              style={{ background: "#f44336", color: "#fff", border: "none", borderRadius: 7, padding: "6px 18px" }}
            >
              조합 초기화
            </button>
          </div>

          {showLoadModal && (
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#0008",
              zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center"
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
                        style={{ marginLeft: 12, background: "#1976d2", color: "#fff", border: "none", padding: "4px 16px", borderRadius: 7, fontWeight: 600, cursor: "pointer" }}
                      >적용</button>
                      <button
                        onClick={() => handleDeleteSavedCombo(i)}
                        style={{ marginLeft: 8, background: "#d32f2f", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 7, fontWeight: 600, cursor: "pointer" }}
                      >삭제</button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setShowLoadModal(false)} style={{ marginTop: 14 }}>닫기</button>
              </div>
            </div>
          )}

          {appliedComboName && (
            <div style={{ marginBottom: 6, color: "#1976d2", fontWeight: 700 }}>
              현재 적용 조합: {appliedComboName}
            </div>
          )}

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
          {/* <label>
            <input
              type="checkbox"
              checked={useRealtime}
              onChange={e => setUseRealtime(e.target.checked)}
            />
            실시간(호가창) 조건 포함
          </label> */}
                    

          {/* ─────────────────────────────────────────
          ① 1단계: 후보 추출 섹션
          ────────────────────────────────────────── */}
          <div style={{ marginTop: 10, border: "1px solid #e0e0e0", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color:"#1976d2" }}>① 1단계: 후보 추출</div>

            {/* 1단계: 과거데이터 기반 실행 */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <label>인터벌</label>
              <select
                value={interval}
                onChange={e=>{
                  const v = e.target.value;
                  setInterval(v);
                  if (v !== "1d") { setFlash("일봉 외 인터벌은 준비중입니다(현재는 일봉 기준)."); setTimeout(()=>setFlash(""), 2000); }
                }}
              >
                <option value="1d">1d</option>
                <option value="1h">1h</option>
                <option value="15m">15m</option>
                <option value="5m">5m</option>
              </select>
              <button onClick={handleStage1Search} disabled={isSearching}
                style={{ padding:"6px 14px", borderRadius:8, background:"#1976d2", color:"#fff" }}>
                1단계 실행(후보 추출)
              </button>
              {isSearching && <div style={{padding:8}}>🔎 조건검색 실행 중...</div>}
            </div>

            {/* 1단계 결과 -> 관심종목 저장 */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <input
                type="text"
                placeholder="관심종목 이름"
                value={watchlistName}
                onChange={e => setWatchlistName(e.target.value)}
                style={{padding:"6px 9px", borderRadius:8, border:"1px solid #ccc", width:220}}
              />
              <button
                onClick={handleSaveStage1ToWatchlist}
                disabled={!stage1Symbols.length}
                style={{padding:"6px 14px", borderRadius:8, background:"#555", color:"#fff"}}
              >
                1단계 결과 관심종목 저장
              </button>
              <span style={{color:"#777"}}>({stage1Symbols.length} 종목)</span>
            </div>

            {/* 이름별 관심종목 불러오기 */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <select
                value={selectedWatchlist}
                onChange={e => setSelectedWatchlist(e.target.value)}
                disabled={isStage2Running}
                style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #ccc", minWidth:200 }}
              >
                <option value="">저장된 관심종목 선택…</option>
                {watchlistNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button onClick={handleLoadNamedWatch} disabled={!selectedWatchlist}>불러오기</button>
              <span style={{color:"#777"}}>불러오면 2단계 대상(1차결과)로 세팅됩니다.</span>
            </div>
          </div>

          {/* ② 2단계: 실시간 스캔 */}
          <div style={{ marginTop: 12, border: "1px solid #e0e0e0", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color:"#1976d2" }}>② 2단계: 실시간 스캔</div>

            {/* 옵션 줄 */}
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              {/* 체크/셀렉트들 */}
              <label style={{display:"flex", alignItems:"center", gap:6}}>
                <input type="checkbox" checked={useWatchlistForStage2}
                      onChange={e => setUseWatchlistForStage2(e.target.checked)}
                      disabled={isStage2Running} />
                관심종목으로 스캔
              </label>

              <label style={{display:"flex", alignItems:"center", gap:6}}>
                <input type="checkbox" checked={autoRefresh}
                      onChange={e => setAutoRefresh(e.target.checked)}
                      disabled={isStage2Running} />
                자동갱신
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                호가 레벨
                <select value={orderbookDepth}
                        onChange={e => setOrderbookDepth(Number(e.target.value) || 5)}
                        disabled={isStage2Running}>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                새로고침
                <input type="number" min={500} step={500} value={refreshMs}
                      onChange={e => setRefreshMs(Number(e.target.value) || 2000)}
                      style={{ width: 90 }} disabled={isStage2Running} />
                <span>ms</span>
              </label>

              {/* ✅ 이 세 줄이 “그 코드” */}
              <span style={{color:"#777"}}>
                대상: {useWatchlistForStage2
                  ? (selectedWatchlist
                      ? `관심종목(${selectedWatchlist}) ${selectedWatchlistSymbols.length}종목`
                      : `관심종목 ${Array.isArray(gwatch) ? gwatch.length : 0}종목`)
                  : `1차결과 ${stage1Symbols.length}종목`}
              </span>
              {autoRefresh && isStage2Running && <span style={{color:"#d32f2f"}}>⏱ 자동갱신 ON</span>}
              <span style={{color:"#777"}}>※ 실시간 모드에서는 interval이 무시됩니다</span>
            </div>

            {/* 실행 줄(버튼을 아래로) */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
              <button onClick={handleStage2Scan} disabled={isStage2Running}
                      style={{ padding:"8px 18px", borderRadius:8, background:"#455a64", color:"#fff", fontWeight:700 }}>
                {isStage2Running ? "스캔 중..." : "2단계 실행(호가창)"}
              </button>
              <RunBadge active={isStage2Running || autoRefresh}
                        text={autoRefresh ? "실시간 자동 스캔중" : "스캔 중"} />
              {lastScannedAt && (
                <span style={{color:"#777"}}>
                  마지막 스캔: {new Date(lastScannedAt).toLocaleTimeString()} · 다음 갱신: {Math.ceil(tick/1000)}s
                </span>
              )}
              {flash && (
                <div style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: flashType==='success' ? '#e8f5e9' : '#e3f2fd',
                  color: flashType==='success' ? '#1b5e20' : '#0d47a1', fontSize: 13
                }}>
                  {flash}
                </div>
              )}
            </div>
          </div>
            

          <div style={{ marginTop: 14 }}>
            <h4 style={{ marginBottom: 10 }}>검색 결과 ({Array.isArray(result) ? result.length : 0} 종목)</h4>
            {isSearching && <div style={{ padding: 8 }}>🔎 조건검색 실행 중...</div>}

            {/* ▼ 테이블 컨테이너: 테두리/라운드/안쪽 여백/스크롤 */}
            <div
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                background: "#fff",
                padding: "8px 12px",           // 좌우·위아래 여백
                overflow: "auto",              // 폭이 좁을 때 가로 스크롤
                maxHeight: 560,                // 높이 제한(원하면 조절/삭제)
              }}
            >
              {/* ▼ 이 스타일 블록은 이 컴포넌트 안에서만 적용됨 */}
              <style>{`
                .cond-table { width: 100%; border-collapse: collapse; min-width: 800px; }
                .cond-table th, .cond-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
                .cond-table thead th { position: sticky; top: 0; background: #fafafa; z-index: 1; }
                .cond-table tbody tr:hover { background: #fafafa55; }
                .cond-table th:first-child, .cond-table td:first-child { padding-left: 14px; }
                .cond-table th:last-child,  .cond-table td:last-child  { padding-right: 14px; }
              `}</style>

              <table className="cond-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('symbol')}>코인 {sortIndicator('symbol')}</th>
                    <th onClick={() => handleSort('return')}>등락률 {sortIndicator('return')}</th>
                    <th onClick={() => handleSort('close')}>현재가 {sortIndicator('close')}</th>
                    <th onClick={() => handleSort('volume')}>거래대금 {sortIndicator('volume')}</th>
                    {useRealtime && (
                      <>
                        <th onClick={() => handleSort('orderbook_ratio')}>잔량비 {sortIndicator('orderbook_ratio')}</th>
                        <th onClick={() => handleSort('total_bid_size')}>총매수잔량 {sortIndicator('total_bid_size')}</th>
                        <th onClick={() => handleSort('total_ask_size')}>총매도잔량 {sortIndicator('total_ask_size')}</th>
                        {/* 이미 추가해둔 최우선 잔량 컬럼도 있으면 그대로 두세요 */}
                        <th onClick={() => handleSort('best_bid_size')}>최우선매수잔량 {sortIndicator('best_bid_size')}</th>
                        <th onClick={() => handleSort('best_ask_size')}>최우선매도잔량 {sortIndicator('best_ask_size')}</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                {Array.isArray(sortedResult) && sortedResult.length === 0 && (
                  <tr>
                    <td colSpan={useRealtime ? 9 : 4} style={{ padding: 24, textAlign:'center', color:'#777' }}>
                      조건에 맞는 종목이 없습니다.
                    </td>
                  </tr>
                )}
                  {sortedResult?.map((c, idx) => (
                    <tr key={c.symbol || idx} onClick={() => handleRowClick(c)} style={{ cursor: "pointer" }}>
                      <td>{c.symbol}</td>

                      {/* 등락률: 빨/파 + 소수2자리 + +기호, 우측정렬은 retColor를 쓰고 있다면 그대로 유지 */}
                      <td style={{ color: retColor(c.return), textAlign: 'right', fontWeight: 600 }}>
                        {c.return != null ? `${Number(c.return) > 0 ? '+' : ''}${Number(c.return).toFixed(2)}%` : '-'}
                      </td>

                      {/* 숫자들 우측 정렬 권장 */}
                      <td style={{ textAlign: 'right' }}>{c.close != null ? nf.format(Number(c.close)) : "-"}</td>
                      <td style={{ textAlign: 'right' }}>{c.volume != null ? nf.format(Math.round(Number(c.volume))) : "-"}</td>

                      {useRealtime && (
                        <>
                          {/* 잔량비: 매수우위 >1 빨강, <1 파랑 */}
                          <td style={{ color: ratioColor(c.orderbook_ratio), textAlign: 'right' }}>
                            {displayRatio(c.orderbook_ratio)}
                          </td>

                          {/* 총/최우선 잔량들: 우측 정렬만 */}
                          <td style={{ textAlign: 'right' }}>
                            {c.total_bid_size != null ? nf.format(Number(c.total_bid_size)) : "-"}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {c.total_ask_size != null ? nf.format(Number(c.total_ask_size)) : "-"}
                          </td>

                          {/* 최우선 잔량 컬럼을 이미 쓰고 있으면 아래 두 칸도 유지하세요 */}
                          <td style={{ textAlign: 'right' }}>{c.best_bid_size != null ? nf.format(Number(c.best_bid_size)) : "-"}</td>
                          <td style={{ textAlign: 'right' }}>{c.best_ask_size != null ? nf.format(Number(c.best_ask_size)) : "-"}</td>

                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* ✅ 모달: coin prop 제거, 필요한 값만 명시 전달 */}
      <CoinChartModal
        open={!!selectedCoin}
        onClose={() => setSelectedCoin(null)}
        loading={isLoadingCandles}
        symbol={selectedCoin?.symbol}
        interval={selectedCoin?.interval || "1d"}
        title={selectedCoin?.title || `${selectedCoin?.name || selectedCoin?.symbol || ""} (${selectedCoin?.interval || "1d"})`}
        candles={candles}
      />
    </div>
  );
}
