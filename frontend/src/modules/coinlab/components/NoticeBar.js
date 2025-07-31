// 공지/이벤트/업데이트
import React from "react";

export default function NoticeBar() {
  const notices = [
    "2025-07-30 시스템 점검 안내",
    "새로운 전략 실험실 오픈!",
  ];
  return (
    <div style={{ background: "#f0f4c3", padding: 12, borderRadius: 8 }}>
      <b>공지사항</b>
      <ul>
        {notices.map(n => <li key={n}>{n}</li>)}
      </ul>
    </div>
  );
}
