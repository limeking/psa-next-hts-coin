
import React, { createContext, useContext, useCallback, useState, useEffect } from "react";

const ToastCtx = createContext(null);
export function useToast() { return useContext(ToastCtx); }

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="info", ms=2200) => {
    const id = `${Date.now()}-${Math.random()}`; setToasts(p=>[...p,{id,msg,type,ms}]); return id;
  }, []);
  const remove = useCallback((id)=>setToasts(p=>p.filter(t=>t.id!==id)),[]);
  useEffect(()=>{ const ts = toasts.map(t=>setTimeout(()=>remove(t.id), t.ms)); return ()=>ts.forEach(clearTimeout); },[toasts,remove]);

  const api = { info:(m,ms)=>add(m,"info",ms), success:(m,ms)=>add(m,"success",ms), error:(m,ms)=>add(m,"error",ms) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{position:"fixed",left:"50%",bottom:24,transform:"translateX(-50%)",display:"flex",flexDirection:"column",gap:8,zIndex:4000}}>
        {toasts.map(t=>(
          <div key={t.id} style={{
            padding:"10px 14px",borderRadius:10,
            background:t.type==="success"?"#e8f5e9":t.type==="error"?"#ffebee":"#e3f2fd",
            border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 4px 10px rgba(0,0,0,0.08)", minWidth:240, textAlign:"center", fontWeight:600
          }}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
