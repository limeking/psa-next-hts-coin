// frontend/src/modules/coinlab/pages/CoinLabStrategyPage.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConditionComboPicker from "../components/ConditionSearch/ConditionComboPicker";
import { BACKTEST_PERIOD_PRESETS, INTERVALS, INTERVAL_LABELS } from "../constants";
import { fetchWatchlistSymbols, fetchWatchlistNames } from "../services/watchlistApi";

// ──────────────────────────────────────────────────────────────────────────────
// 유틸/상수
// ──────────────────────────────────────────────────────────────────────────────
const MAX_SYMBOLS = 80; // 서버 부하 방지: 한 번에 실행할 최대 종목 수
const DEFAULT_EXIT = {
  useTakeProfit: false,
  takeProfitPct: 5,
  useStopLoss: false,
  stopLossPct: 3,
  useTimeLimit: false,         // ← 추가
  timeLimitBars: 20,
  useOppositeSignal: false,
  useTrailingStop: false,
  trailingPct: 2,
};


// 파일 상단 import 밑에(컴포넌트 밖)
const tipIconStyle = { cursor: "help", fontSize: 12, opacity: 0.7, border: "1px solid #ccc", borderRadius: 10, padding: "0 6px" };
const warnBadgeStyle = { marginLeft: 8, fontSize: 12, color: "#a10000", background: "#ffe6e6", border: "1px solid #ffb3b3", borderRadius: 6, padding: "2px 6px" };
const infoBadgeStyle = { marginTop: 6, fontSize: 12, color: "#333", background: "#f2f2f2", border: "1px solid #ddd", borderRadius: 6, padding: "6px 8px" };


function newStep(idSeed = Date.now()) {
  return {
    id: `${idSeed}`,
    tf: "1d",               // 기본: 일봉
    comboName: null,         // 조건검색식 조합 이름
    periodKey: "12m",       // 최근 1년
    exit: { ...DEFAULT_EXIT }
  };
}

// 시간/분봉 기간 프리셋 (필요시 조정)
const HOUR_PERIOD_PRESETS = [
  { key: "300d", label: "최근 300일", days: 300 }, // ✅ 추가
  { key: "200d", label: "최근 200일", days: 200 }, // ✅ 추가
  { key: "90d", label: "최근 90일", days: 90 },
  { key: "60d", label: "최근 60일", days: 60 },
  { key: "30d", label: "최근 30일", days: 30 },
  { key: "14d", label: "최근 14일", days: 14 },
  { key: "7d",  label: "최근 7일",  days: 7  },
];

// ──────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────────────────────────────────────────────────
export default function CoinLabStrategyPage() {
  const nav = useNavigate();

  // 범위/대상
  const [scope, setScope] = useState("all"); // "all" | "watchlist"
  const [watchlistNames, setWatchlistNames] = useState([]);
  const [selectedWatchlist, setSelectedWatchlist] = useState("");
  const [wlSymbols, setWlSymbols] = useState([]);

  // 전체 종목 (KRW)
  const [allSymbols, setAllSymbols] = useState([]);

  // 시나리오 단계
  const [steps, setSteps] = useState([newStep()]);

  // 실행/로딩/취소
  const [isRunning, setIsRunning] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const abortRef = useRef(null);

  // 결과 요약
  const [runSummary, setRunSummary] = useState(null);

  const [chainMode, setChainMode] = useState("parallel");

  const [wfFolds, setWfFolds] = useState(0);
  const [wfScheme, setWfScheme] = useState("rolling");

  // 초기 로드: 전체심볼 + 관심종목 이름
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [names, krw] = await Promise.all([
          fetchWatchlistNames().catch(() => []),
          fetch("/api/coinlab/krw_symbols").then(r => r.json()).catch(() => [])
        ]);
        if (!mounted) return;
        
        // ✅ 배열 또는 { names:[...] } 모두 지원
        const normNames = Array.isArray(names) ? names :
                          (Array.isArray(names?.names) ? names.names : []);
        
        // ✅ 배열 또는 { symbols:[...] } 모두 지원
        const normKrw = Array.isArray(krw) ? krw :
                        (Array.isArray(krw?.symbols) ? krw.symbols : []);
        
        setWatchlistNames(normNames);
        setAllSymbols(normKrw);
        
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 관심종목 선택 변경 시 심볼 로딩
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (scope !== "watchlist" || !selectedWatchlist) {
        setWlSymbols([]);
        return;
      }
      try {
        const res = await fetchWatchlistSymbols(selectedWatchlist);
        if (!mounted) return;

        // ✅ 배열 또는 { symbols:[...] } 모두 지원
        const syms = Array.isArray(res) ? res :
                    (Array.isArray(res?.symbols) ? res.symbols : []);

        setWlSymbols(syms);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { mounted = false; };
  }, [scope, selectedWatchlist]);

  // 실제 실행에 사용할 종목 미리보기
  const previewSymbols = useMemo(() => {
    const base = scope === "watchlist" ? wlSymbols : allSymbols;
    return Array.isArray(base) ? base.slice(0, MAX_SYMBOLS) : [];
  }, [scope, wlSymbols, allSymbols]);

  const previewCountText = useMemo(() => {
    const total = scope === "watchlist" ? wlSymbols.length : allSymbols.length;
    const capped = previewSymbols.length;
    if (!total) return "0";
    return capped < total ? `${capped}/${total} (상한 ${MAX_SYMBOLS})` : `${total}`;
  }, [scope, wlSymbols.length, allSymbols.length, previewSymbols.length]);

  // ── 시나리오 단계 조작 ───────────────────────────
  function addStep() {
    setSteps(prev => [...prev, newStep(Date.now() + Math.random())]);
  }
  function removeStep(id) {
    setSteps(prev => prev.filter(s => s.id !== id));
  }
  function updateStep(id, patch) {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }
  function updateExit(id, patch) {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, exit: { ...s.exit, ...patch } } : s)));
  }

  // ── 페이로드 빌드 (최소 정보만) ───────────────────
  function buildPayload() {
    const symbols = previewSymbols;
    const stepsPayload = steps.map(s => ({
      tf: s.tf,
      comboName: s.comboName ?? null,
      periodKey: s.periodKey,
      exit: s.exit,
    }));
    return {
      scope,
      watchlistName: scope === "watchlist" ? (selectedWatchlist || null) : null,
      symbols,
      steps: stepsPayload,
      chainMode,
      walkForward: { folds: wfFolds, scheme: wfScheme },
    };
  }

  // ── 실행 핸들러 (AbortController 포함) ────────────
  async function handleRunBacktest() {
    if (isRunning) return;
    const payload = buildPayload();
    if (!payload.symbols?.length) {
      alert("실행할 심볼이 없습니다.");
      return;
    }
    try {
      setIsRunning(true);
      setLoadingText(`백테스트 실행 중… (종목 ${payload.symbols.length}개)`);
      const ctl = new AbortController();
      abortRef.current = ctl;

      const res = await fetch("/api/coinlab/backtest/run_scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),  // ← 이 한 줄로 워크포워드/옵션 포함
        signal: ctl.signal,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `실패 (${res.status})`);
      }
      const j = await res.json();
      setRunSummary(j);
      setTimeout(() => {
        document.getElementById("backtest-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      setLoadingText("");
    }
  }
  function cancelRun() {
    try { abortRef.current?.abort(); } catch {}
  }

  // ──────────────────────────────────────────────────
  // 렌더
  // ──────────────────────────────────────────────────
  return (
    <div style={{ padding: 20 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => nav(-1)} style={btnGhost}>← 대시보드로</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0F172A" }}>전략 백테스트</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addStep} style={btnPrimary}>단계 추가</button>
        </div>
      </div>

      {/* 범위 선택 */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: "#0F172A" }}>대상 범위</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={radioLabel}>
            <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /> 전체종목
          </label>
          <label style={radioLabel}>
            <input type="radio" name="scope" checked={scope === "watchlist"} onChange={() => setScope("watchlist")} /> 관심종목
          </label>
          {scope === "watchlist" && (
            <select value={selectedWatchlist} onChange={e => setSelectedWatchlist(e.target.value)} style={select}>
              <option value="">관심종목 선택…</option>
              {watchlistNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#334155" }}>
            미리보기: <b>{previewCountText}</b>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <label style={{ fontSize:12, color:"#334155" }}>실행 모드</label>
          <select
            value={chainMode}
            onChange={e => setChainMode(e.target.value)}
            style={{ padding:"6px 8px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", fontSize:12 }}
            title="단계 실행 방식을 선택합니다"
          >
            <option value="parallel">독립(병렬)</option>
            <option value="gated">게이팅-동시(같은 봉)</option>
            <option value="state">게이팅-상태(전단계 레짐)</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label>워크포워드 폴드</label>
          <input type="number" min={0} max={12} value={wfFolds}
                onChange={e => setWfFolds(parseInt(e.target.value || "0", 10))} />
          <select value={wfScheme} onChange={e => setWfScheme(e.target.value)}>
            <option value="rolling">rolling</option>
            <option value="anchored">anchored</option>
          </select>
          {/* 워크포워드 상태 안내 */}
          <span
            style={tipIconStyle}
            title={
              "워크포워드: 데이터를 폴드로 나눠 테스트합니다.\n" +
              "현재 anchored(누적)는 미구현이며,\n" +
              "rolling은 등분 분할로 동작합니다(슬라이딩 아님)."
            }
          >
            ⓘ 워크포워드 안내
          </span>

          {/* anchored 선택 시 명확 배지 */}
          {wfScheme === "anchored" && (
            <span style={warnBadgeStyle}>anchored 미구현(표시는 rolling과 동일)</span>
          )}
        </div>


        </div>

        {/* 심볼 미리보기 */}
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 120, overflow: "auto" }}>
          {previewSymbols.map(s => (
            <span key={s} style={chip}>{s}</span>
          ))}
          {!previewSymbols.length && <div style={{ fontSize: 12, color: "#64748B" }}>대상 심볼이 없습니다.</div>}
        </div>
      </div>

      {/* 시나리오 단계들 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {steps.map((step, idx) => (
          <StepCard
            key={step.id}
            step={step}
            index={idx}
            onRemove={removeStep}
            onUpdate={updateStep}
            onUpdateExit={updateExit}
          />
        ))}
      </div>

      {/* 실행/결과 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
        <button onClick={handleRunBacktest} disabled={isRunning} style={btnPrimaryLarge}>
          {isRunning ? "실행 중…" : "백테스트"}
        </button>
        {isRunning && <button onClick={cancelRun} style={btnGhost}>취소</button>}
      </div>
      {(wfFolds > 0) && (
        <div style={infoBadgeStyle}>
          워크플로우 안내: 현재 <b>anchored(누적)</b>과 <b>슬라이딩 rolling</b>은 미구현 상태입니다.
          서버는 <b>등분 분할(rolling 유사)</b>로만 폴드를 처리합니다.
        </div>
      )}

      <div id="backtest-results" style={{ marginTop: 18 }}>
        {runSummary && (
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "#0F172A" }}>결과 요약</div>
            <div style={{ fontSize: 14 }}>
              사용 심볼: <b>{runSummary?.summary?.symbols ?? 0}</b> 개 · 총 체결: <b>{runSummary?.summary?.totalTrades ?? 0}</b>
            </div>
          </div>
        )}
        {runSummary?.steps?.map((step, si) => (
          <div key={si} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              [{si+1}단계] TF: {step.tf}, 콤보: {step.combo}, 기간: {step.periodKey}
            </div>
            {(!step.runs || step.runs.length===0) ? (
              <div style={{ fontSize: 13, color: "#64748B" }}>
                이 단계에서 표시할 결과가 없습니다. (데이터 부족 또는 신호 없음)
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #E5E7EB" }}>
                    <th style={{ padding: "6px 4px" }}>심볼</th>
                    <th style={{ padding: "6px 4px" }}>체결수</th>
                    <th style={{ padding: "6px 4px" }}>승률(%)</th>
                    <th style={{ padding: "6px 4px" }}>평균익절(%)</th>
                    <th style={{ padding: "6px 4px" }}>평균손절(%)</th>
                    <th style={{ padding: "6px 4px" }}>PF</th>
                  </tr>
                </thead>
                <tbody>
                {step.runs.map((r, i) => {
                  // 새 구조 대응: base 프로파일을 집계
                  const profs = Array.isArray(r.profiles) ? r.profiles : [];
                  const base = profs.find(p => p.name === "base") || profs[0];
                  let trades=0, winRate=0, pf=0, cnt=0, avgWinPct=0, avgLossPct=0;
                  if (base && Array.isArray(base.runs) && base.runs.length) {
                    cnt = base.runs.length;
                    const wr = [], pfs = [], aw = [], al = [], trd = [];
                    for (const fr of base.runs) {
                      const s = fr.stats || {};
                      trd.push(s.trades ?? 0);
                      wr.push(s.winRate ?? 0);
                      pfs.push(s.pf ?? s.profitFactor ?? 0);
                      aw.push(s.avgWinPct ?? 0);
                      al.push(s.avgLossPct ?? 0);
                    }
                    // 폴드 평균
                    const avg = arr => arr.length ? (arr.reduce((a,b)=>a+(+b||0),0)/arr.length) : 0;
                    trades = trd.reduce((a,b)=>a+(+b||0),0); // 폴드 합계
                    winRate = avg(wr);
                    pf = avg(pfs);
                    avgWinPct = avg(aw);
                    avgLossPct = avg(al);
                  }
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "6px 4px" }}>{r.symbol}</td>
                      <td style={{ padding: "6px 4px" }}>{trades}</td>
                      <td style={{ padding: "6px 4px" }}>{(winRate*100).toFixed(1)}</td>
                      <td style={{ padding: "6px 4px" }}>{avgWinPct.toFixed(2)}</td>
                      <td style={{ padding: "6px 4px" }}>{avgLossPct.toFixed(2)}</td>
                      <td style={{ padding: "6px 4px" }}>{pf ? pf.toFixed(2) : "-"}</td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      {/* 로딩 오버레이 */}
      {isRunning && (
        <div style={overlayWrap}>
          <div style={overlayCard}>{loadingText || "백테스트 실행 중…"}</div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// StepCard 컴포넌트 (단일 파일 내부 정의)
// ──────────────────────────────────────────────────────────────────────────────
function StepCard({ step, index, onRemove, onUpdate, onUpdateExit }) {
  const isLocked = false;
  const tfOptions = INTERVALS; // constants에서 가져온 간단한 목록
  const isDaily = step.tf === "1d";
  const periodOptions = isDaily ? BACKTEST_PERIOD_PRESETS : HOUR_PERIOD_PRESETS;
  const tfTitle = `${index + 1}단계 · ${INTERVAL_LABELS?.[step.tf] || step.tf}`;

  return (
    <div style={card}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{tfTitle}</div>
        {!isLocked && (
          <button type="button" onClick={() => onRemove?.(step.id)} title="이 단계 삭제" style={btnDangerGhost}>삭제</button>
        )}
      </div>

      {/* TF */}
      <label style={fieldLabel}>타임프레임</label>
      <select value={step.tf} onChange={e => onUpdate?.(step.id, { tf: e.target.value })} style={select}>
        {tfOptions.map(o => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>

      {/* 콤보 선택 */}
      <label style={{ ...fieldLabel, marginTop: 10 }}>조건검색식 조합</label>
      <ConditionComboPicker
        value={step.comboName}
        onChange={(name) => onUpdate?.(step.id, { comboName: name })}
        placeholder="조건검색식 조합 선택"
      />

      {/* 기간 프리셋 */}
      <label style={{ ...fieldLabel, marginTop: 10 }}>기간</label>
      <select value={step.periodKey} onChange={e => onUpdate?.(step.id, { periodKey: e.target.value })} style={select}>
        {periodOptions.map(p => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>

      {/* 종료 조건 */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E5E7EB" }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#0F172A" }}>종료 조건</div>

        <div style={row}>
          <label style={checkLabel}>
            <input type="checkbox" checked={!!step.exit?.useTakeProfit} onChange={e => onUpdateExit?.(step.id, { useTakeProfit: e.target.checked })} /> 익절 사용
          </label>
          <input type="number" min={0.1} step={0.1} disabled={!step.exit?.useTakeProfit} value={step.exit?.takeProfitPct ?? 5}
                 onChange={e => onUpdateExit?.(step.id, { takeProfitPct: parseFloat(e.target.value || "0") })}
                 style={numInput(step.exit?.useTakeProfit)} />
          <span style={unit}>%</span>
        </div>

        <div style={row}>
          <label style={checkLabel}>
            <input type="checkbox" checked={!!step.exit?.useStopLoss} onChange={e => onUpdateExit?.(step.id, { useStopLoss: e.target.checked })} /> 손절 사용
          </label>
          <input type="number" min={0.1} step={0.1} disabled={!step.exit?.useStopLoss} value={step.exit?.stopLossPct ?? 3}
                 onChange={e => onUpdateExit?.(step.id, { stopLossPct: parseFloat(e.target.value || "0") })}
                 style={numInput(step.exit?.useStopLoss)} />
          <span style={unit}>%</span>
        </div>

        <div style={row}>
          <label style={checkLabel}>
            <input type="checkbox" checked={step.exit?.useTimeLimit} onChange={e => onUpdateExit?.(step.id, { useTimeLimit: e.target.checked })} /> 시간제한(봉)
          </label>
          <input type="number" min={1} disabled={!step.exit?.useTimeLimit} value={step.exit?.timeLimitBars ?? 20}
                 onChange={e => onUpdateExit?.(step.id, { timeLimitBars: parseInt(e.target.value || "0", 10) })}
                 style={numInput(!!step.exit?.useTimeLimit)} />
          <span style={unit}>봉</span>
        </div>

        <div style={row}>
          <label style={checkLabel}>
            <input type="checkbox" checked={!!step.exit?.useOppositeSignal} onChange={e => onUpdateExit?.(step.id, { useOppositeSignal: e.target.checked })} /> 반대신호 청산
          </label>
        </div>

        <div style={row}>
          <label style={checkLabel}>
            <input type="checkbox" checked={!!step.exit?.useTrailingStop} onChange={e => onUpdateExit?.(step.id, { useTrailingStop: e.target.checked })} /> 트레일링 스탑
          </label>
          <input type="number" min={0.1} step={0.1} disabled={!step.exit?.useTrailingStop} value={step.exit?.trailingPct ?? 2}
                 onChange={e => onUpdateExit?.(step.id, { trailingPct: parseFloat(e.target.value || "0") })}
                 style={numInput(step.exit?.useTrailingStop)} />
          <span style={unit}>%</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 스타일 (가볍고 명확하게)
// ──────────────────────────────────────────────────────────────────────────────
const card = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 2px 10px rgba(15,23,42,0.04)",
};
const fieldLabel = { fontSize: 12, color: "#334155", marginBottom: 6, display: "block" };
const radioLabel = { fontSize: 14, color: "#0F172A", display: "flex", alignItems: "center", gap: 6 };
const checkLabel = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#0F172A" };
const row = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" };
const unit = { fontSize: 12, color: "#475569" };
const select = { padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff" };
const chip = { background: "#F1F5F9", color: "#0F172A", padding: "4px 8px", borderRadius: 999, fontSize: 12 };
const btnPrimary = { padding: "8px 12px", borderRadius: 10, background: "#2563EB", color: "#fff", border: "1px solid #1D4ED8" };
const btnPrimaryLarge = { ...btnPrimary, padding: "10px 16px", fontWeight: 700 };
const btnGhost = { padding: "8px 12px", borderRadius: 10, background: "#F8FAFC", color: "#0F172A", border: "1px solid #E2E8F0" };
const btnDangerGhost = { padding: "6px 10px", borderRadius: 10, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FCA5A5" };
const numInput = (enabled = true) => ({
  width: 100,
  padding: 8,
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: enabled ? "#FFFFFF" : "#F8FAFC",
  opacity: enabled ? 1 : 0.6,
});
const overlayWrap = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center"
};
const overlayCard = {
  background: "#111827", color: "#FFFFFF", padding: "14px 18px",
  borderRadius: 12, fontSize: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
};
