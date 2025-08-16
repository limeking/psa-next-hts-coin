import React from "react";
export default function WatchlistPanel({ symbols=[], onRemove, onSave, title="관심종목(공용)", hideSave=false, }) {
  return (
    <div style={{ background:"#fff", borderRadius:12, padding:12, border:"1px solid #eee", minWidth:260 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
        <strong>{title}</strong>
        {!hideSave && onSave && (
        <button onClick={() => onSave(symbols)}>
          저장
        </button>
        )}
      </div>
      {symbols.length === 0 && <div style={{ color:"#aaa" }}>비어있음</div>}
      <ul style={{ listStyle:"none", padding:0, margin:0 }}>
        {symbols.map(s => (
          <li key={s} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px dashed #f0f0f0" }}>
            <span style={{ color:"#1976d2", fontWeight:600 }}>{s}</span>
            <button onClick={() => onRemove?.(s)} style={{ color:"#d32f2f", background:"transparent", border:"none", cursor:"pointer" }}>삭제</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
