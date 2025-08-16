import React from "react";

export function Modal({ open, title, children, footer, onClose }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:20,minWidth:360,maxWidth:520,boxShadow:"0 10px 30px rgba(0,0,0,0.25)"}}>
        {title && <div style={{fontWeight:800,marginBottom:10}}>{title}</div>}
        <div style={{marginBottom:14}}>{children}</div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>{footer}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ open, title="확인", message, confirmText="확인", cancelText="취소", onConfirm, onCancel }) {
  return (
    <Modal open={open} title={title} onClose={onCancel} footer={
      <>
        <button onClick={onCancel} style={{padding:"6px 12px",borderRadius:8}}>{cancelText}</button>
        <button onClick={onConfirm} style={{padding:"6px 12px",borderRadius:8,background:"#1976d2",color:"#fff",border:"none"}}>{confirmText}</button>
      </>
    }>
      <div style={{whiteSpace:"pre-line"}}>{message}</div>
    </Modal>
  );
}

export function PromptModal({ open, title="입력", placeholder="", initialValue="", confirmText="저장", cancelText="취소", onConfirm, onCancel }) {
  const [val, setVal] = React.useState(initialValue);
  React.useEffect(()=>setVal(initialValue),[initialValue]);
  return (
    <Modal open={open} title={title} onClose={onCancel} footer={
      <>
        <button onClick={onCancel} style={{padding:"6px 12px",borderRadius:8}}>{cancelText}</button>
        <button onClick={()=>onConfirm(val)} style={{padding:"6px 12px",borderRadius:8,background:"#1976d2",color:"#fff",border:"none"}}>{confirmText}</button>
      </>
    }>
      <input value={val} onChange={e=>setVal(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #ddd"}} />
    </Modal>
  );
}
