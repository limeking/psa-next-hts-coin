import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ToastProvider, { useToast } from "../components/Common/ToastProvider";
import { ConfirmModal, PromptModal } from "../components/Common/Modal";
import {
  fetchWatchlist, saveWatchlist,
  fetchWatchlistByName, saveWatchlistByName, fetchWatchlistNames,
  deleteWatchlistByName, renameWatchlist
} from "../services/watchlistApi";

function InnerWatchlistPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [names, setNames] = useState([]);
  const [filter, setFilter] = useState("");
  const [selectedName, setSelectedName] = useState(""); // "" = 공용
  const [symbols, setSymbols] = useState([]);
  const [inputSym, setInputSym] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const promptModeRef = useRef(null); // "saveAs" | "rename"
  const [promptInit, setPromptInit] = useState("");

  useEffect(()=>{(async()=>{
    const [common, nm] = await Promise.all([fetchWatchlist(), fetchWatchlistNames()]);
    setSymbols(common||[]); setNames(nm||[]);
  })();},[]);

  const filteredNames = useMemo(()=>{
    const q = filter.trim().toLowerCase();
    const base = ["(공용)", ...(names||[])];
    return q ? base.filter(n=>n.toLowerCase().includes(q)) : base;
  },[names,filter]);

  const handleSelect = async (name)=>{
    setSelectedName(name==="(공용)"?"":name);
    setSymbols(name==="(공용)" ? await fetchWatchlist() : await fetchWatchlistByName(name));
  };

  const addSymbol = ()=>{
    const s = inputSym.trim().toUpperCase(); if(!s) return;
    setSymbols(prev => Array.from(new Set([...(prev||[]), s]))); setInputSym("");
  };
  const removeSymbol = s => setSymbols(prev => (prev||[]).filter(x=>x!==s));
  const sorted = useMemo(()=>{ const arr=[...(symbols||[])]; arr.sort((a,b)=>sortDesc?b.localeCompare(a):a.localeCompare(b)); return arr; },[symbols,sortDesc]);

  const saveCurrent = async ()=>{
    if(!selectedName){ await saveWatchlist(symbols); toast.success("공용 관심종목 저장 완료"); }
    else { await saveWatchlistByName(selectedName, symbols); toast.success(`[${selectedName}] 저장 완료`); setNames(await fetchWatchlistNames()); }
  };
  const openSaveAs = ()=>{ promptModeRef.current="saveAs"; setPromptInit(selectedName||""); setPromptOpen(true); };
  const openRename = ()=>{ if(!selectedName) return; promptModeRef.current="rename"; setPromptInit(selectedName); setPromptOpen(true); };
  const onPromptConfirm = async (val)=>{
    const name=(val||"").trim(); if(!name){ toast.error("이름을 입력하세요"); return; }
    if(promptModeRef.current==="saveAs"){
      await saveWatchlistByName(name, symbols); toast.success(`[${name}]로 저장 완료`);
      setNames(await fetchWatchlistNames()); setSelectedName(name);
    }else{
      try{
        const j = await renameWatchlist(selectedName, name);
        toast.success(`"${selectedName}" → "${name}" 이름 변경`);
        setNames(Array.isArray(j?.names)?j.names:await fetchWatchlistNames());
        setSelectedName(name); setSymbols(await fetchWatchlistByName(name));
      }catch(e){ toast.error(e.message||"이름 변경 실패"); }
    }
    setPromptOpen(false);
  };
  const openDelete = ()=>{ if(!selectedName) return; setConfirmOpen(true); };
  const onDeleteConfirm = async ()=>{
    try{
      await deleteWatchlistByName(selectedName);
      toast.success(`"${selectedName}" 삭제 완료`);
      const nm = await fetchWatchlistNames(); setNames(nm); setSelectedName(""); setSymbols(await fetchWatchlist());
    }catch(e){ toast.error(e.message||"삭제 실패"); } finally { setConfirmOpen(false); }
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16,padding:16,height:"calc(100vh - 80px)"}}>
      {/* 좌측 목록 */}
      <div style={{border:"1px solid #e5e7eb",borderRadius:12,background:"#fff",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"12px 12px 8px",borderBottom:"1px solid #f1f5f9"}}>
          <div style={{fontWeight:700}}>관심종목 목록</div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <input placeholder="이름 검색" value={filter} onChange={e=>setFilter(e.target.value)} style={{flex:1}} />
            <button onClick={()=>nav("/coinlab/condition_search")}>조건검색으로</button>
          </div>
        </div>
        <div style={{overflowY:"auto"}}>
          <ListItem active={selectedName===""} name="(공용)" onClick={()=>handleSelect("(공용)")} />
          {filteredNames.filter(n=>n!=="(공용)").map(n=>(
            <ListItem key={n} active={selectedName===n} name={n} onClick={()=>handleSelect(n)} />
          ))}
          {filteredNames.length===0 && <div style={{padding:12,color:"#94a3b8"}}>저장된 관심종목이 없습니다.</div>}
        </div>
      </div>

      {/* 우측 상세 */}
      <div style={{border:"1px solid #e5e7eb",borderRadius:12,background:"#fff",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:12,display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #f1f5f9"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <div style={{fontWeight:700}}>{selectedName||"공용 관심종목"}</div>
            <div style={{color:"#64748b"}}>{symbols?.length||0} 종목</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={saveCurrent}>저장</button>
            <button onClick={openSaveAs}>다른 이름으로 저장</button>
            <button onClick={()=>nav("/coinlab/condition_search?target=watchlist")}>이 대상으로 2단계 스캔</button>
            <button onClick={openRename} disabled={!selectedName}>이름 변경</button>
            <button onClick={openDelete} disabled={!selectedName}>삭제</button>
          </div>
        </div>

        <div style={{display:"flex",gap:8,padding:12,borderBottom:"1px solid #f8fafc"}}>
          <input placeholder="예: BTC_KRW" value={inputSym} onChange={e=>setInputSym(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addSymbol();}} style={{flex:1}} />
          <button onClick={addSymbol}>추가</button>
          <button onClick={()=>setSortDesc(v=>!v)} title="심볼 정렬">{sortDesc?"심볼▼":"심볼▲"}</button>
        </div>

        <div style={{flex:1,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,minWidth:640}}>
            <thead style={{position:"sticky",top:0,background:"#fff",boxShadow:"inset 0 -1px 0 #f1f5f9"}}>
              <tr><th style={{textAlign:"left",padding:"10px 12px",color:"#64748b"}}>심볼</th><th style={{textAlign:"right",padding:"10px 12px",color:"#64748b"}}>작업</th></tr>
            </thead>
            <tbody>
              {sorted.map(s=>(
                <tr key={s} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={{padding:"10px 12px"}}><span style={{fontWeight:600}}>{s}</span></td>
                  <td style={{textAlign:"right",padding:"8px 12px"}}><button onClick={()=>removeSymbol(s)} style={{padding:"4px 8px"}}>삭제</button></td>
                </tr>
              ))}
              {sorted.length===0 && <tr><td colSpan={2} style={{padding:24,textAlign:"center",color:"#94a3b8"}}>비어있습니다. 위 입력창에 심볼을 추가하세요.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 모달 */}
      <ConfirmModal open={confirmOpen} title="세트 삭제" message={`"${selectedName}" 세트를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`} onConfirm={onDeleteConfirm} onCancel={()=>setConfirmOpen(false)} />
      <PromptModal open={promptOpen} title={promptModeRef.current==="rename"?"이름 변경":"다른 이름으로 저장"} placeholder="예: 단타관심" initialValue={promptInit} confirmText="확인" cancelText="취소" onConfirm={onPromptConfirm} onCancel={()=>setPromptOpen(false)} />
    </div>
  );
}

function ListItem({ active, name, onClick }) {
  return (
    <div onClick={onClick} style={{padding:"10px 12px",cursor:"pointer",background:active?"#eef2ff":"transparent",color:active?"#1e3a8a":"#0f172a",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <span style={{fontWeight:active?700:500}}>{name}</span>
      {active && <span style={{fontSize:12}}>선택됨</span>}
    </div>
  );
}

export default function WatchlistPage(){ return (<ToastProvider><InnerWatchlistPage/></ToastProvider>); }
