import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CoinDataTable from "../components/CoinData/CoinDataTable";
import { INTERVALS, getYearsForInterval } from "../constants";

function formatDate(d) {
  if (!d) return "-";
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function CoinDataManagerPage() {
  const navigate = useNavigate();
  const [symbolList, setSymbolList] = useState([]);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [dataState, setDataState] = useState({});
  const [totalSize, setTotalSize] = useState(null);
  const [totalSizeUnit, setTotalSizeUnit] = useState(null);
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkStatusText, setBulkStatusText] = useState("");
  const [abortController, setAbortController] = useState(null);
  const [bulkStatusDetail, setBulkStatusDetail] = useState({ success: [], failed: [] });

  function handleBulkAbort() {
    if (abortController) {
      abortController.abort();
      setBulkStatusText("⛔️ 작업 취소됨");
      setIsBulkWorking(false);
      setAbortController(null);
    }
  }

  // 총 데이터 용량 fetch
  const fetchTotalSize = async () => {
    const res = await fetch("/api/coinlab/coin_data_total_size");
    if (res.ok) {
      const data = await res.json();
      setTotalSize(data.total_size);
      setTotalSizeUnit(data.unit);
    }
  };

  const refreshSymbols = async () => {
    const res = await fetch("/api/coinlab/krw_symbols");
    if (res.ok) {
      const data = await res.json();
      setSymbolList(data.symbols || []);
      setLastRefreshedAt(new Date());
    }
  };
  const saveSymbols = async () => {
    const res = await fetch("/api/coinlab/save_krw_symbols", { method: "POST" });
    if (res.ok) {
      alert("최신 원화마켓 심볼리스트 저장 완료!");
      setLastSavedAt(new Date());
      refreshSymbols();
    } else {
      alert("저장 실패! 네트워크/서버를 확인하세요.");
    }
  };

  const fetchDataState = async () => {
    const res = await fetch("/api/coinlab/coin_data_state");
    if (res.ok) {
      const data = await res.json();
      setDataState(data);
    }
  };

  useEffect(() => {
    refreshSymbols();
    fetchDataState();
    fetchTotalSize();
  }, []);
    


    // 병렬 처리 유틸
  async function processInChunks(targets, handler, setProgress, setStatusText, signal) {
    const CONCURRENCY = 5;
    let done = 0;
    let success = [], failed = [];
  
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const chunk = targets.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(target => handler(target, signal))
      );
      results.forEach((res, idx) => {
        const { symbol, interval, year } = chunk[idx];
        if (res.status === "fulfilled") {
          success.push({ symbol, interval, year });
        } else {
          failed.push({
            symbol, interval, year,
            reason: res.reason ? res.reason.message : "알 수 없음"
          });
        }
      });
      done += chunk.length;
      setProgress(Math.round((done / targets.length) * 100));
      setStatusText(`처리 중... (${done} / ${targets.length})`);
      await new Promise(r => setTimeout(r, 1000));
    }
    setBulkStatusDetail({ success, failed });
    return { success, failed };
  }

  // --- 전체 삭제(종목/interval/year별로 삭제, 성공/실패 리스트 일관) ---
  // 전체삭제(폴더 통째)로 변경!
  async function handleBulkDelete() {
    const controller = new AbortController();
    setAbortController(controller);

    // interval/year별 파일말고, symbol만 추출
    const targets = symbolList.filter(symbol =>
      Object.values(dataState[symbol] || {}).some(intervalObj =>
        Object.values(intervalObj || {}).some(Boolean)
      )
    );

    if (targets.length === 0) {
      alert("데이터가 있는 종목이 없습니다!");
      return;
    }

    setIsBulkWorking(true);
    setBulkProgress(0);
    setBulkStatusText("🗑️ 전체 삭제 시작...");
    setBulkStatusDetail({ success: [], failed: [] });

    // 병렬 처리: CONCURRENCY=3개씩 폴더 삭제
    const CONCURRENCY = 3;
    let done = 0, success = [], failed = [];
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const chunk = targets.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map(symbol =>
        fetch(`/api/coinlab/coin_data_delete_all?symbol=${symbol}`, { method: "DELETE", signal: controller.signal })
      ));
      results.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value.ok) {
          success.push(chunk[idx]);
        } else {
          failed.push(chunk[idx]);
        }
      });
      done += chunk.length;
      setBulkProgress(Math.round((done / targets.length) * 100));
      setBulkStatusText(`처리 중... (${done} / ${targets.length})`);
      await new Promise(r => setTimeout(r, 1000));
    }
    setBulkStatusText("🗑️ 전체 삭제 완료!");
    setBulkStatusDetail({ success, failed });

    setIsBulkWorking(false);
    setAbortController(null);
    fetchDataState();
    fetchTotalSize();
  }

  

  // --- 전체 다운로드(종목/interval/year별로 업데이트, 성공/실패 리스트 일관) ---
  // handleBulkDownload 병렬 개선
  async function handleBulkDownload() {
    const controller = new AbortController();
    setAbortController(controller);

    const targets = symbolList.flatMap(symbol =>
      INTERVALS.flatMap(({ key: interval }) =>
        getYearsForInterval(interval).map(year => ({ symbol, interval, year }))
      )
    );

    if (targets.length === 0) {
      alert("종목이 없습니다!");
      return;
    }

    setIsBulkWorking(true);
    setBulkProgress(0);
    setBulkStatusText("⬇️ 전체 다운로드 시작...");
    setBulkStatusDetail({ success: [], failed: [] });

    const handler = async ({ symbol, interval, year }, signal) => {
      const res = await fetch(
        `/api/coinlab/coin_data_update?symbol=${symbol}&interval=${interval}&year=${year}`,
        { method: "POST", signal }
      );
      if (!res.ok) throw new Error("서버 오류");
    };

    try {
      const { success, failed } = await processInChunks(
        targets, handler, setBulkProgress, setBulkStatusText, controller.signal
      );
      setBulkStatusText("⬇️ 전체 다운로드 완료!");
      setBulkStatusDetail({ success, failed });
    } catch {
      setBulkStatusText("⛔️ 다운로드 중단됨");
    } finally {
      setIsBulkWorking(false);
      setAbortController(null);
      fetchDataState();
      fetchTotalSize();
    }
  }

  // === 데이터 있는 종목 전체업데이트 ===
    // handleBulkUpdateExisting 병렬 개선
  async function handleBulkUpdateExisting() {
    const controller = new AbortController();
    setAbortController(controller);

    const targets = symbolList.filter(symbol =>
      Object.values(dataState[symbol] || {}).some(intervalObj =>
        Object.values(intervalObj || {}).some(Boolean)
      )
    ).flatMap(symbol =>
      INTERVALS.flatMap(({ key: interval }) =>
        getYearsForInterval(interval).map(year => ({ symbol, interval, year }))
      )
    );

    if (targets.length === 0) {
      alert("데이터가 있는 종목이 없습니다!");
      return;
    }

    setIsBulkWorking(true);
    setBulkProgress(0);
    setBulkStatusText("♻️ 전체 업데이트 시작...");
    setBulkStatusDetail({ success: [], failed: [] });

    const handler = async ({ symbol, interval, year }) => {
      const res = await fetch(
        `/api/coinlab/coin_data_update?symbol=${symbol}&interval=${interval}&year=${year}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok || !data.result) {
        // 실패일 때 reason을 반환 (없으면 "알 수 없음")
        throw new Error(data.reason || "알 수 없음");
      }
    };

    try {
      const { success, failed } = await processInChunks(
        targets, handler, setBulkProgress, setBulkStatusText, controller.signal
      );
      setBulkStatusText("♻️ 전체 업데이트 완료!");
      setBulkStatusDetail({ success, failed });
    } catch {
      setBulkStatusText("⛔️ 업데이트 중단됨");
    } finally {
      setIsBulkWorking(false);
      setAbortController(null);
      fetchDataState();
      fetchTotalSize();
    }
  }


  return (
    <div style={{ maxWidth: 950, margin: "0 auto", padding: 32 }}>
      {/* ---- 대시보드로 이동 버튼 ---- */}
      <button onClick={() => navigate("/coinlab/dashboard")} style={{
        marginBottom: 24, padding: "10px 28px", borderRadius: 8,
        background: "#f5f5f5", border: "1px solid #1976d2", color: "#1976d2",
        fontWeight: "bold", fontSize: 16, cursor: "pointer"
      }}>
        🏠 대시보드로
      </button>
      {/* ---- 상단 제목 ---- */}
      <h2 style={{
        fontWeight: 800, fontSize: 28, marginBottom: 24, color: "#1976d2"
      }}>
        📂 전체 원화종목 데이터 관리
      </h2>
      {/* ---- 버튼 영역 ---- */}
      <div style={{
        marginBottom: 16, display: "flex", alignItems: "center", gap: 10
      }}>
        <button
          onClick={saveSymbols}
          style={{
            padding: "8px 22px", borderRadius: 8,
            background: "#d7ffd9", border: "1px solid #66bb6a", color: "#388e3c",
            fontWeight: 700, fontSize: 15, cursor: "pointer"
          }}
        >🔄 원화마켓 심볼 최신 저장</button>
        <span style={{ color: "#388e3c", fontSize: 14 }}>
          {lastSavedAt && `저장: ${formatDate(lastSavedAt)}`}
        </span>
        <button
          onClick={refreshSymbols}
          style={{
            padding: "8px 22px", borderRadius: 8,
            background: "#e0f7fa", border: "1px solid #00bcd4", color: "#00838f",
            fontWeight: 700, fontSize: 15, cursor: "pointer"
          }}
        >♻️ 심볼 새로고침</button>
        <span style={{ color: "#1976d2", fontSize: 14 }}>
          {lastRefreshedAt && `새로고침: ${formatDate(lastRefreshedAt)}`}
        </span>
      </div>
      {/* --- 데이터 기간 안내 --- */}
      <div style={{ marginBottom: 10, fontSize: 14, color: "#777" }}>
        데이터 기간 안내:&nbsp;
        <b>일봉</b> (최근 5년),&nbsp;
        <b>1시간봉</b> (최근 1년),&nbsp;
        <b>15분봉</b> (최근 1년),&nbsp;
        <b>5분봉</b> (최근 1년)
      </div>
      {/* ---- 설명 ---- */}
      <div style={{
        margin: "8px 0 20px 0", color: "#888", fontSize: 15
      }}>
        • 심볼 최신저장: 빗썸 원화마켓의 최신 종목 리스트를 저장합니다.<br />
        • 심볼 새로고침: 저장된 심볼리스트를 다시 불러옵니다.<br />
        • 아래 표에서 파란색은 데이터가 있는 종목, 회색은 데이터가 없는 종목입니다.
      </div>
      {/* ---- 총 데이터 용량 표시 ---- */}
      <div style={{
        fontSize: 17, color: "#222", marginBottom: 9, fontWeight: 600
      }}>
        💾 전체 데이터 총용량: {totalSize ? `${totalSize} ${totalSizeUnit}` : "-"}
      </div>
      {/* ---- 일괄 작업 버튼 ---- */}
      <div style={{ margin: "20px 0 10px 0", display: "flex", gap: 12 }}>
        <button
          onClick={handleBulkDelete}
          style={{
            background: "#ffebee", color: "#d32f2f", fontWeight: 700,
            padding: "8px 18px", borderRadius: 8, border: "1.5px solid #d32f2f"
          }}>
          🗑️ 데이터 있는 종목 전체삭제
        </button>
        {/* ⭐️ 추가: 데이터 있는 종목 전체업데이트 버튼 */}
        <button
          onClick={handleBulkUpdateExisting}
          style={{
            background: "#fffbe7", color: "#a28009", fontWeight: 700,
            padding: "8px 18px", borderRadius: 8, border: "1.5px solid #e4bc0f"
          }}>
          ♻️ 데이터 있는 종목 전체업데이트
        </button>
        <button
          onClick={handleBulkDownload}
          style={{
            background: "#e3f2fd", color: "#1976d2", fontWeight: 700,
            padding: "8px 18px", borderRadius: 8, border: "1.5px solid #1976d2"
          }}>
          ⬇️ 전체 종목 일괄 다운로드
        </button>
      </div>

      {isBulkWorking && (
        <div style={{ margin: "18px 0", display: "flex", alignItems: "center", gap: 20 }}>
          <progress value={bulkProgress} max="100" style={{ width: 280, height: 20 }} />
          <span style={{ fontWeight: 600 }}>{bulkStatusText}</span>
          <button
            onClick={handleBulkAbort}
            style={{
              background: "#ffe0e0", color: "#b71c1c", fontWeight: 700,
              padding: "7px 15px", borderRadius: 8, border: "1.5px solid #b71c1c",
              marginLeft: 12, cursor: "pointer"
            }}
          >
            ⛔️ 작업 취소
          </button>
        </div>
      )}

      {/* ✔️ 실패가 있을 때만 리스트 출력 */}
      {bulkStatusDetail.failed.length > 0 && (
        <div style={{ margin: "10px 0 30px 0" }}>
          <div style={{ color: "#388e3c", fontWeight: 700 }}>
            성공: {bulkStatusDetail.success.length > 0
              ? bulkStatusDetail.success.map(f => `${f.symbol}(${f.interval}/${f.year})`).join(", ")
              : "-"}
          </div>
          <div style={{ color: "#d32f2f", fontWeight: 700 }}>
            실패:
            <ul>
              {bulkStatusDetail.failed.map(f => (
                <li key={`${f.symbol}-${f.interval}-${f.year}`}>
                  {f.symbol}({f.interval}/{f.year})
                  <span style={{ marginLeft: 6, color: "#a00", fontWeight: 400, fontSize: 13 }}>
                    {f.reason && `→ ${f.reason}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ---- 종목 상태 카드 ---- */}
      <CoinDataTable
        symbolList={symbolList}
        dataState={dataState}
        showCheckbox={false}
        onDataChanged={() => {
          fetchDataState();
          fetchTotalSize();
        }}
      />
    </div>
  );
}
