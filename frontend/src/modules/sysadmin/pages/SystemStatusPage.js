
import React, { useEffect, useState, useRef } from 'react';
import { fetchSystemStatus, fetchModuleList, fetchEvents, createModule, deleteModule } from '../api/sysadmin';
import { useEventSocket } from '../hooks/useEventSocket';

// 토스트 알림
function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  let bg = "#444";
  if (type === "success") bg = "#36ba46";
  if (type === "warn") bg = "#ffb100";
  if (type === "error") bg = "#e94040";
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 1000,
      background: bg, color: "#fff", padding: "12px 20px", borderRadius: 10,
      fontWeight: "bold", boxShadow: "0 2px 12px #2224", minWidth: 200
    }}>
      {msg}
      <button onClick={onClose} style={{ marginLeft: 12, color: "#fff", background: "none", border: "none", fontSize: 16, cursor: "pointer" }}>×</button>
    </div>
  );
}

// 상태 뱃지
function StatusBadge({ status }) {
  let color = "gray";
  if (status === "OK" || status === "running") color = "#36ba46";
  else if (status === "FAIL" || status === "exited") color = "#e94040";
  else if (status === "starting") color = "#ffb100";
  return (
    <span style={{
      display: "inline-block",
      minWidth: 48,
      padding: "2px 8px",
      borderRadius: "8px",
      background: color,
      color: "#fff",
      marginRight: 4,
      fontWeight: "bold",
      boxShadow: status === "FAIL" || status === "exited" ? "0 0 8px 2px #e9404066" : "none",
      transition: "background 0.3s"
    }}>
      {status}
    </span>
  );
}

// 모듈 생성/삭제
function ModuleManager({ onToast }) {
  const [moduleName, setModuleName] = useState('');
  const [result, setResult] = useState(null);

  const handleCreate = async () => {
    setResult(null);
    const res = await createModule(moduleName);
    setResult(res);
    // 성공/실패 토스트 무조건 띄움
    if (res && res.success) {
      onToast(moduleName + " 모듈 생성 성공", "success");
    } else {
      onToast(moduleName + " 모듈 생성 실패: " + (res && (res.stderr || res.error || "에러")), "error");
    }
  };

  const handleDelete = async () => {
    setResult(null);
    const res = await deleteModule(moduleName);
    setResult(res);
    if (res && res.success) {
      onToast(moduleName + " 모듈 삭제 성공", "success");
    } else {
      onToast(moduleName + " 모듈 삭제 실패: " + (res && (res.stderr || res.error || "에러")), "error");
    }
  };

  return (
    <div style={{margin: "2em 0", padding: "1em", border: "1px solid #ddd", borderRadius: "8px"}}>
      <h3>모듈 생성/삭제</h3>
      <input
        type="text"
        value={moduleName}
        onChange={e => setModuleName(e.target.value)}
        placeholder="모듈명"
        style={{marginRight: "1em"}}
      />
      <button onClick={handleCreate}>생성</button>
      <button onClick={handleDelete} style={{marginLeft: "1em"}}>삭제</button>
      {result && (
        <pre style={{marginTop: "1em", background: "#f8f8f8", padding: "1em", borderRadius: "6px"}}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// 모듈 리스트(별도 polling 없이 props만)
function ModuleList({ modules }) {
  if (!modules || !modules.length) return <div>모듈 없음</div>;
  return (
    <div>
      <h3>모듈 현황</h3>
      <table>
        <thead>
          <tr>
            <th>이름</th>
            <th>Backend</th>
            <th>Frontend</th>
            <th>DB</th>
            <th>Enabled</th>
            <th>Route</th>
          </tr>
        </thead>
        <tbody>
          {modules.map(m => (
            <tr key={m.name}>
              <td>{m.name}</td>
              <td>{m.backend ? <StatusBadge status="OK" /> : "-"}</td>
              <td>{m.frontend ? <StatusBadge status="OK" /> : "-"}</td>
              <td>{m.db ? <StatusBadge status="OK" /> : "-"}</td>
              <td>{m.enabled ? "Y" : "N"}</td>
              <td>{m.route}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ⭐️ WebSocket 이벤트 + 최초 이벤트(fetchEvents)는 한 번만 호출!
function EventLog({ onToast, events, setEvents }) {
  // 최초 1회만 fetchEvents
  useEffect(() => {
    fetchEvents().then(res => {
      setEvents(res.events || []);
    });
  }, [setEvents]);

  // WebSocket으로 실시간 이벤트 받기
  useEventSocket((msg) => {
    setEvents(prev => [msg, ...prev].slice(0, 30));
    if (msg.type === "error" || (msg.message || "").includes("ERROR")) {
      onToast(msg.message, "error");
    } else if (msg.type === "warn" || (msg.message || "").includes("WARN")) {
      onToast(msg.message, "warn");
    } else {
      onToast(msg.message, "success");
    }
  });

  if (!events.length) return <div>이벤트 없음</div>;
  return (
    <div>
      <h3>최근 이벤트/에러 로그</h3>
      <ul>
        {events.map((e, idx) => (
          <li key={idx} style={{
            color: e.type === "error" || (e.message || "").includes('ERROR') ? '#e94040' :
                  (e.type === "warn" || (e.message || "").includes('WARN')) ? '#ffb100' : 'black',
            fontWeight: e.type === "error" ? 'bold' : 'normal',
            background: e.type === "error" ? '#ffe0e0' :
                       e.type === "warn" ? '#fff5d4' : 'none',
            borderRadius: "5px",
            padding: "2px 6px",
            marginBottom: "2px"
          }}>
            [{e.timestamp?.slice(11,19) || ''}] {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// 메인 시스템 상태 페이지 (polling은 status/modules만)
function SystemStatusPage() {
  const [status, setStatus] = useState({});
  const [modules, setModules] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: "", type: "" });
  const lastToastRef = useRef({ msg: "", type: "", time: 0 });
  const intervalRef = useRef(null);

  useEffect(() => {
    // polling은 status, modules만!
    const fetchAll = async () => {
      const [statusRes, modulesRes] = await Promise.all([
        fetchSystemStatus(),
        fetchModuleList()
      ]);
      setStatus(statusRes);
      setModules(modulesRes);
      setLoading(false);
    };
    fetchAll();
    intervalRef.current = setInterval(fetchAll, process.env.NODE_ENV === 'production' ? 15000 : 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const closeToast = () => setToast({ msg: "", type: "" });
  const handleToast = (msg, type) => {
    const now = Date.now();
    if (
      lastToastRef.current.msg === msg &&
      lastToastRef.current.type === type &&
      now - lastToastRef.current.time < 2000
    ) {
      return;
    }
    lastToastRef.current = { msg, type, time: now };
    setToast({ msg, type });
    setTimeout(closeToast, 3000);
  };

  return (
    <div>
      <Toast msg={toast.msg} type={toast.type} onClose={closeToast} />
      <h2>시스템 상태 (환경: {status.env})</h2>
      <ModuleManager onToast={handleToast} />  // ⭐️ 여기에 onToast 전달!

      <table>
        <thead>
          <tr>
            <th>컨테이너</th><th>상태</th><th>이미지</th><th>ID</th>
          </tr>
        </thead>
        <tbody>
          {status.containers && status.containers.map((c, i) => (
            <tr key={c.name || i}>
              <td>{c.name}</td>
              <td><StatusBadge status={c.status} /></td>
              <td>{c.image ? c.image : '-'}</td>
              <td>{c.id ? c.id : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ModuleList modules={modules} />
      <EventLog onToast={handleToast} events={events} setEvents={setEvents} />
    </div>
  );
}

export default SystemStatusPage;
