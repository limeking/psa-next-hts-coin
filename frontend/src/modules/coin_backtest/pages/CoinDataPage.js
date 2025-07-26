import React, { useEffect, useState } from "react";
import { fetchBithumbKrwTickers } from "../api/coinData";

const INTERVALS = [
  { label: "일봉", value: "24h" },
  { label: "1시간봉", value: "1h" },
  { label: "10분봉", value: "10m" },
  { label: "3분봉", value: "3m" },
];

const INTERVAL_COUNTS = {
  "24h": 730,
  "1h": 720,
  "10m": 4320,
  "3m": 7200,
};

async function fetchDataList() {
  const res = await fetch("/api/coin_backtest/data/list");
  return res.json();
}
async function downloadData(market, interval, count) {
  const params = new URLSearchParams({market, interval, count});
  const res = await fetch("/api/coin_backtest/data/download?" + params, {method: "POST"});
  return res.json();
}
async function deleteData(filename) {
  const params = new URLSearchParams({filename});
  const res = await fetch("/api/coin_backtest/data/delete?" + params, {method: "POST"});
  return res.json();
}

// --------- 동시 처리 제한 Promise Pool 구현 ----------
async function promisePool(items, poolLimit, asyncFn, onProgress, abortCheck, onError) {
  let idx = 0, done = 0;
  const results = [];
  const executing = [];
  const updateProgress = () => onProgress && onProgress(done + 1, items.length);
  const enqueue = async () => {
    if ((abortCheck && abortCheck()) || idx === items.length) return; // abort 체크
    const i = idx++;
    const p = Promise.resolve(asyncFn(items[i], i))
      .catch(err => { 
        if (onError) onError(err);
        return null; // 실패해도 계속 진행
      })
      .then(result => {
        done++; updateProgress(); return result;
      });
    results.push(p);
    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);
    let r = Promise.resolve();
    if (executing.length >= poolLimit) { r = Promise.race(executing); }
    await r; await enqueue();
  };
  await enqueue();
  return Promise.all(results);
}

export default function CoinDataPage() {
  const [tickers, setTickers] = useState([]);
  const [dataList, setDataList] = useState([]);
  const [totalSizeMB, setTotalSizeMB] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({current: 0, total: 0, text: ""});
  const [abortFlag, setAbortFlag] = useState(false);  // <-- 내부로 이동
  const [errorLog, setErrorLog] = useState([]);       // <-- 내부로 이동

  async function reloadDataList() {
    const res = await fetchDataList();
    setDataList(res.data || []);
    setTotalSizeMB(res.total_size_mb || 0);
  }

  useEffect(() => {
    fetchBithumbKrwTickers().then(data => setTickers(data.tickers));
    reloadDataList();
  }, []);

  function hasData(ticker, interval) {
    return dataList.find(
      d =>
        d.market?.toUpperCase() === ticker.toUpperCase() &&
        d.interval?.toLowerCase() === interval.toLowerCase()
    );
  }

  // 종목 전체 다운로드 (동시 3개 제한)
  async function downloadAllForTicker(ticker) {
    setLoading(true);
    setAbortFlag(false);
    setProgress({current: 0, total: INTERVALS.length, text: `다운로드중: ${ticker}`});
    setErrorLog([]);
    await promisePool(
      INTERVALS,
      3,
      async (iv) => {
        await downloadData(ticker, iv.value, INTERVAL_COUNTS[iv.value]);
      },
      (current) => setProgress(p => ({...p, current})),
      () => abortFlag,
      (err) => setErrorLog(prev => [...prev, String(err)])
    );
    await reloadDataList();
    setProgress({current: 0, total: 0, text: ""});
    setLoading(false);
  }

  // 종목 전체 삭제 (동시 3개 제한)
  async function deleteAllForTicker(ticker) {
    setLoading(true);
    setAbortFlag(false);
    setErrorLog([]);
    const files = dataList.filter(d => d.market === ticker);
    setProgress({current: 0, total: files.length, text: `삭제중: ${ticker}`});
    await promisePool(
      files,
      3,
      async (file) => {
        await deleteData(file.filename);
      },
      (current) => setProgress(p => ({...p, current})),
      () => abortFlag,
      (err) => setErrorLog(prev => [...prev, String(err)])
    );
    await reloadDataList();
    setProgress({current: 0, total: 0, text: ""});
    setLoading(false);
  }

  // 전체 보유종목 재다운로드 (동시 3개 제한)
  async function handleBulkUpdate() {
    setLoading(true);
    setAbortFlag(false);
    setErrorLog([]);
    const ownedTickers = Array.from(new Set(dataList.map(d => d.market)));
    setProgress({current: 0, total: ownedTickers.length, text: "전체 재다운로드"});
    await promisePool(
      ownedTickers,
      3,
      async (ticker) => {
        await downloadAllForTicker(ticker);
      },
      (current) => setProgress(p => ({...p, current})),
      () => abortFlag,
      (err) => setErrorLog(prev => [...prev, String(err)])
    );
    await reloadDataList();
    setProgress({current: 0, total: 0, text: ""});
    setLoading(false);
  }

  // "2024-07-27 08:13:45" → 한국시간 변환 (이미 +9면 자동 유지)
  function toKoreanTime(str) {
    if (!str) return "";
    // 1. 파싱 (UTC, 혹은 그냥 문자열이면 파싱)
    let date = new Date(str.replace(" ", "T") + "Z"); // Z를 붙이면 UTC로 파싱
    if (isNaN(date)) date = new Date(str); // 그래도 안 되면 그냥 파싱
    // 2. 한국시간(+9)로 변환
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }

  // --- 아래부터는 렌더 ---
  return (
    <div style={{padding:24}}>
      <h2>시세 데이터 관리</h2>
      <div style={{fontSize:14, marginBottom:8, color:"#666"}}>
        <b>
          다운로드 기준: 일봉 730개(2년), 1시간봉 720개(1달), 10분봉 4320개(1달), 3분봉 7200개(15일)
        </b>
        <br />
        <b>총 데이터 파일 용량: {totalSizeMB} MB</b>
        <br />
        <button
          onClick={handleBulkUpdate}
          disabled={loading}
          style={{marginTop: 8, background:"#118811", color:"white", padding:"4px 12px", borderRadius:4, cursor:"pointer"}}
        >
          전체 [보유종목] 재다운로드
        </button>
        {progress.total > 0 && (
          <div style={{marginTop:12, width:350}}>
            <b>{progress.text}</b>
            <div style={{border:"1px solid #aaa", height:14, width:"100%", borderRadius:5, background:"#f0f0f0"}}>
              <div style={{
                width: (progress.current/progress.total*100)+"%",
                height:"100%",
                background: "#51a2fa",
                borderRadius:5
              }} />
            </div>
            <div style={{fontSize:12}}>
              {progress.current} / {progress.total} 완료
              {loading && (
                <button
                  style={{marginLeft:16, fontSize:12, background:"#fa5151", color:"white", borderRadius:3, cursor:"pointer", padding:"2px 8px"}}
                  onClick={()=>setAbortFlag(true)}
                >작업 중단</button>
              )}
            </div>
          </div>
        )}
        {errorLog.length > 0 &&
          <div style={{color:"red", fontSize:13, marginTop:6}}>
            에러:<br/>
            {errorLog.map((e,i)=><div key={i}>{e}</div>)}
          </div>
        }
      </div>
      <table border="1" cellPadding={4} style={{marginTop:12, minWidth:640}}>
        <thead>
          <tr>
            <th>종목</th>
            <th>상태 및 다운로드/삭제</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map(ticker => {
            const files = INTERVALS.map(iv => hasData(ticker, iv.value));
            const hasAny = files.some(f => f);
            return (
              <tr key={ticker}>
                <td>{ticker}</td>
                <td>
                  {hasAny ? (
                    <>
                      <span style={{color:"green", fontSize:13}}>
                        {files.map((data, idx) =>
                          data ?
                          <span key={idx}>
                            {INTERVALS[idx].label}: {data.row_count}개, {data.size_mb}MB, {toKoreanTime(data.last_modified)}<br/>
                          </span> : null
                        )}
                      </span>
                      <button
                        disabled={loading}
                        style={{marginLeft:10}}
                        onClick={()=>deleteAllForTicker(ticker)}
                      >종목 전체 삭제</button>
                    </>
                  ) : (
                    <button
                      disabled={loading}
                      onClick={()=>downloadAllForTicker(ticker)}
                    >종목 전체 다운로드</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
