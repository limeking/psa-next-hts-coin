# automation/setup_system_dashboard.py
import subprocess
import os
import shutil
import json
import datetime
from pathlib import Path
from automation.utils import (
    add_route_to_main, add_route_to_appjs, run_generate_nginx,
    remove_route_from_main, remove_route_from_appjs
)

BASE_DIR = Path(__file__).resolve().parent.parent

BACKEND_SYSADMIN = BASE_DIR / 'backend/app/modules/sysadmin'
FRONTEND_SYSADMIN = BASE_DIR / 'frontend/src/modules/sysadmin'
DB_SYSADMIN = BASE_DIR / 'db/modules/sysadmin.sql'
MODULE_INFO_PATH = BACKEND_SYSADMIN / 'module_info.json'

BACKEND_FILES = {
    'routers.py': '''from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from pydantic import BaseModel
from pathlib import Path
import os
import json
import subprocess
import sys
from datetime import datetime
from typing import List

router = APIRouter(prefix="/sysadmin", tags=["System Admin"])

# --- WebSocket 실시간 브로드캐스트 추가 ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@router.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# PSA-NEXT 전체 모듈/디렉터리 트리 구조 반환
@router.get("/module-tree")
def get_module_tree():
    try:
        current_dir = Path(__file__).resolve()
        backend_dir = current_dir.parent.parent
        frontend_dir = current_dir.parent.parent.parent.parent / "frontend/src/modules"
        db_dir = current_dir.parent.parent.parent.parent / "db/modules"

        def get_children(directory):
            if not directory.exists():
                return []
            items = []
            for p in sorted(directory.iterdir(), key=lambda x: x.name):
                if p.is_dir():
                    items.append({
                        "name": p.name,
                        "type": "folder",
                        "children": get_children(p)
                    })
                else:
                    items.append({
                        "name": p.name,
                        "type": "file"
                    })
            return items

        tree = {
            "name": "PSA-NEXT",
            "type": "folder",
            "children": [
                {"name": "backend", "type": "folder", "children": get_children(backend_dir)},
                {"name": "frontend", "type": "folder", "children": get_children(frontend_dir)},
                {"name": "db", "type": "folder", "children": get_children(db_dir)}
            ]
        }
        return tree
    except Exception as e:
        return {"error": str(e)}

@router.get("/status")
def get_system_status():
    """
    전체 도커 컨테이너 & 모듈 상태 반환
    """
    is_prod = os.getenv("PSA_PRODUCTION") == "1"
    containers = []
    try:
        if is_prod:
            import docker
            client = docker.from_env()
            containers = [
                {
                    "name": c.name,
                    "status": c.status,
                    "image": c.image.tags,
                    "id": c.short_id
                } for c in client.containers.list(all=True)
            ]
        else:
            containers = [
                {"name": "backend", "status": "running", "image": "psa-backend:dev", "id": "123abc"},
                {"name": "frontend", "status": "running", "image": "psa-frontend:dev", "id": "234bcd"},
                {"name": "db", "status": "running", "image": "mysql:8", "id": "345cde"},
                {"name": "nginx", "status": "running", "image": "nginx:latest", "id": "456def"},
                {"name": "redis", "status": "exited", "image": "redis:7", "id": "567efg"}
            ]
    except Exception as e:
        return {"error": str(e), "containers": []}

    # (확장) 모듈 상태 예시 (여기선 mock, 실무에선 meta/헬스 연동)
    modules_status = {
        "admin": {"status": "OK", "version": "0.2.1", "last_sync": datetime.now().isoformat()},
        "user": {"status": "OK", "version": "0.1.0", "last_sync": datetime.now().isoformat()},
        "order": {"status": "FAIL", "version": "0.1.2", "last_sync": datetime.now().isoformat()},
    }

    return {"containers": containers, "modules": modules_status, "env": "production" if is_prod else "dev"}

# 전체 모듈 메타정보 반환 (상세 info용)
@router.get("/modules")
def get_modules_status():
    try:
        current_dir = Path(__file__).resolve()
        backend_dir = current_dir.parent.parent
        frontend_dir = current_dir.parent.parent.parent.parent / "frontend/src/modules"
        db_dir = current_dir.parent.parent.parent.parent / "db/modules"

        def module_meta(mod_name):
            meta_file = backend_dir / mod_name / 'module_info.json'
            if meta_file.exists():
                try:
                    with open(meta_file, encoding='utf-8') as f:
                        return json.load(f)
                except Exception:
                    return {}
            return {}

        backend_modules = {p.name for p in backend_dir.iterdir() if p.is_dir()} if backend_dir.exists() else set()
        frontend_modules = {p.name for p in frontend_dir.iterdir() if p.is_dir()} if frontend_dir.exists() else set()
        db_modules = {p.stem for p in db_dir.glob("*.sql")} if db_dir.exists() else set()

        all_modules = sorted(backend_modules | frontend_modules | db_modules)
        results = []
        for m in all_modules:
            results.append({
                "name": m,
                "backend": m in backend_modules,
                "frontend": m in frontend_modules,
                "db": m in db_modules,
                "enabled": module_meta(m).get("enabled", True),
                "route": f"/{m}",
                "meta": module_meta(m)
            })
        return results
    except Exception as e:
        return {"error": str(e)}

@router.get("/events")
def get_sysadmin_events():
    """
    최근 이벤트/에러 로그 반환
    """
    is_prod = os.getenv("PSA_PRODUCTION") == "1"
    try:
        if is_prod:
            log_file = Path("/var/log/psa-next-events.log")
            if log_file.exists():
                lines = log_file.read_text(encoding='utf-8', errors='ignore').splitlines()[-20:]
                return {"events": [ {"message": l} for l in lines ]}
            else:
                return {"events": [{"message": "(실운영 로그 파일이 없습니다)"}]}
        else:
            return {
                "events": [
                    {"message": "[INFO] 개발 환경 mock event #1"},
                    {"message": "[WARN] 개발 mock 경고 예시"},
                    # {"message": "[ERROR] 임시 에러 로그: test failure"},
                    {"message": "[INFO] PSA-NEXT 개발환경 이벤트 #2"}
                ]
            }
    except Exception as e:
        return {"error": str(e), "events": []}

@router.get("/errors")
def get_errors():
    """
    최근 에러/예외 로그만 반환 (이벤트에서 필터링)
    """
    # 개발환경 예시 (운영은 실 로그에서 에러라인만 추출)
    try:
        events = [
            {"message": "[INFO] 개발 환경 mock event #1"},
            {"message": "[WARN] 개발 mock 경고 예시"},
            {"message": "[ERROR] 임시 에러 로그: test failure"},
            {"message": "[INFO] PSA-NEXT 개발환경 이벤트 #2"}
        ]
        error_logs = [e for e in events if "ERROR" in e["message"]]
        return {"errors": error_logs}
    except Exception as e:
        return {"error": str(e), "errors": []}

@router.get("/health")
def get_health():
    """
    전체 시스템 헬스 상태 (실제 ping/check 로직 연동 가능)
    """
    health = {
        "backend": "OK",
        "frontend": "OK",
        "db": "OK",
        "redis": "OK",
        "nginx": "OK",
    }
    return {"health": health}

# --- 실시간 이벤트를 보내는 POST API(자동화 스크립트 연동용) ---
class EventMsg(BaseModel):
    type: str
    message: str
    module: str = None
    status: str = None

@router.post("/push_event")
async def push_event(event: EventMsg):
    await manager.broadcast({
        "type": event.type,
        "message": event.message,
        "module": event.module,
        "status": event.status,
        "timestamp": datetime.now().isoformat()
    })
    return {"ok": True}

# --- 모듈 생성/삭제: 브로드캐스트 포함 ---
class ModuleName(BaseModel):
    name: str

@router.post("/create_module")
async def create_module(data: ModuleName):
    try:
        result = subprocess.run(
            [sys.executable, "automation/add_module.py", data.name],
            capture_output=True, text=True, cwd="/app"
        )
        status = "success" if result.returncode == 0 else "fail"
        # 실시간 브로드캐스트
        await manager.broadcast({
            "type": "module_created",
            "module": data.name,
            "status": status,
            "message": f"{data.name} 모듈 생성 {status}",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "timestamp": datetime.now().isoformat()
        })
        return {
            "success": status == "success",
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    except Exception as e:
        await manager.broadcast({
            "type": "error",
            "module": data.name,
            "status": "fail",
            "message": f"모듈 생성 중 에러: {e}",
            "timestamp": datetime.now().isoformat()
        })
        return {"success": False, "error": str(e)}

@router.post("/delete_module")
async def delete_module(data: ModuleName):
    try:
        result = subprocess.run(
            [sys.executable, "automation/delete_module.py", data.name],
            capture_output=True, text=True, cwd="/app"
        )
        status = "success" if result.returncode == 0 else "fail"
        await manager.broadcast({
            "type": "module_deleted",
            "module": data.name,
            "status": status,
            "message": f"{data.name} 모듈 삭제 {status}",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "timestamp": datetime.now().isoformat()
        })
        return {
            "success": status == "success",
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    except Exception as e:
        await manager.broadcast({
            "type": "error",
            "module": data.name,
            "status": "fail",
            "message": f"모듈 삭제 중 에러: {e}",
            "timestamp": datetime.now().isoformat()
        })
        return {"success": False, "error": str(e)}
''', 


    'schemas.py': '''from pydantic import BaseModel

class SystemStatus(BaseModel):
    status: str
    containers: dict = {}
''',

    'services.py': '''def fetch_status():
    """
    시스템 상태를 반환하는 서비스 함수 (확장용)
    """
    return {"status": "ok"}
''',
}

FRONTEND_FILES = {
        'pages/SystemStatusPage.js': """
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
""",


'pages/ModuleTreePage.js': '''
import React, { useState, useEffect } from "react";

function getIcon(type, name) {
  if (type === "folder") return "📁";
  if (type === "file" && name.endsWith('.py')) return "🐍";
  if (type === "file" && name.endsWith('.js')) return "🟨";
  if (type === "file" && name.endsWith('.json')) return "📝";
  if (type === "file" && name.endsWith('.sql')) return "🗄️";
  return "📄";
}

function TreeNode({ node, level = 0, onSelect, selected }) {
  const [expanded, setExpanded] = useState(level < 2);
  const isFolder = node.type === "folder" || node.children;
  const isSelected = selected && selected.path === node.path;

  return (
    <div style={{ marginLeft: level * 14, background: isSelected ? "#f0f6ff" : "none", borderRadius: 6 }}>
      <div
        style={{ cursor: isFolder ? "pointer" : "default", fontWeight: isSelected ? "bold" : "normal", display: "flex", alignItems: "center" }}
        onClick={() => {
          if (isFolder) setExpanded(e => !e);
          onSelect && onSelect(node);
        }}
      >
        {isFolder && (
          <span style={{ width: 16 }}>{expanded ? "▼" : "▶"}</span>
        )}
        <span style={{ marginLeft: 2, marginRight: 6 }}>{getIcon(node.type, node.name)}</span>
        <span>{node.name}</span>
      </div>
      {isFolder && expanded && node.children && (
        <div>
          {node.children.map((child, i) =>
            <TreeNode
              key={child.name + i + (child.path || "")}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selected={selected}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ModuleInfoBox({ selectedNode }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!selectedNode) { setInfo(null); return; }
    // 경로에서 모듈명 추출
    const match = selectedNode.path && selectedNode.path.match(/modules\\/([^/]+)/);
    const moduleName = match ? match[1] : null;
    if (!moduleName) { setInfo(null); return; }

    fetch("/api/sysadmin/modules")
      .then(res => res.json())
      .then(list => {
        const found = list.find(m => m.name === moduleName);
        setInfo(found || null);
      });
  }, [selectedNode]);

  if (!selectedNode || !info) return <div style={{ color: "#888" }}>모듈을 선택하세요</div>;

  return (
    <div className="border p-3 rounded shadow bg-white mt-3" style={{ minWidth: 320 }}>
      <div className="font-bold mb-1 text-lg">모듈: {info.name}</div>
      <div>설명: {info.meta?.description || "-"}</div>
      <div>경로: <code>{selectedNode.path}</code></div>
      <div>백엔드: {info.backend ? "✅" : "❌"}, 프론트: {info.frontend ? "✅" : "❌"}, DB: {info.db ? "✅" : "❌"}</div>
      <div>생성일: {info.meta?.created_at || "-"}</div>
      <div>ws_needed: {info.meta?.ws_needed ? "True" : "False"}</div>
      <div>상태: <span style={{ color: info.enabled ? "#36ba46" : "#e94040" }}>{info.enabled ? "Enabled" : "Disabled"}</span></div>
      {info.meta && (
        <pre style={{ background: "#f7f7f7", padding: 6, borderRadius: 6, marginTop: 6 }}>
          {JSON.stringify(info.meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function ModuleTreePage() {
  const [tree, setTree] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    fetch("/api/sysadmin/module-tree")
      .then(res => res.json())
      .then(data => {
        // 각 노드에 path(트리 경로) 추가
        const addPath = (node, parent = "") => {
          node.path = parent ? parent + "/" + node.name : node.name;
          if (node.children) node.children.forEach(child => addPath(child, node.path));
          return node;
        };
        setTree(addPath(data));
      });
  }, []);

  return (
    <div style={{ display: "flex", gap: 32 }}>
      <div style={{ minWidth: 320 }}>
        {tree ? (
          <TreeNode node={tree} onSelect={setSelectedNode} selected={selectedNode} />
        ) : (
          <div>트리 구조 불러오는 중...</div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <ModuleInfoBox selectedNode={selectedNode} />
      </div>
    </div>
  );
}
''',

    'api/sysadmin.js': '''export async function fetchSystemStatus() {
  const res = await fetch('/api/sysadmin/status');
  return await res.json();
}
export async function fetchModuleList() {
  const res = await fetch('/api/sysadmin/modules');
  return await res.json();
}
export async function fetchEvents() {
  const res = await fetch('/api/sysadmin/events');
  return await res.json();
}
export async function createModule(moduleName) {
  const res = await fetch('/api/sysadmin/create_module', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: moduleName})
  });
  return await res.json();
}
export async function deleteModule(moduleName) {
  const res = await fetch('/api/sysadmin/delete_module', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: moduleName})
  });
  return await res.json();
}

''',

    'components/DummyBox.js': '''import React from 'react';
const DummyBox = () => <div>Sysadmin Dummy Component</div>;
export default DummyBox;
''',
    'hooks/useEventSocket.js': '''import { useEffect, useRef } from "react";

/**
 * 실시간 WebSocket 이벤트를 수신하는 커스텀 훅 (onEvent 콜백은 ref로 고정)
 * @param {(msg: object) => void} onEvent
 */
export function useEventSocket(onEvent) {
  const wsRef = useRef(null);
  const onEventRef = useRef(onEvent);

  // onEvent가 바뀔 때마다 ref에 저장(불필요한 재연결 방지)
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/sysadmin/ws/events`;
    const ws = new window.WebSocket(wsUrl);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        onEventRef.current && onEventRef.current(msg);
      } catch (e) {}
    };
    ws.onerror = (e) => {
      // 원하는 경우 에러 로그 출력
      // console.error("WebSocket error:", e);
    };
    ws.onclose = (e) => {
      // 필요시 닫힘 로그
      // console.log("WebSocket closed:", e);
    };

    wsRef.current = ws;
    return () => {
      wsRef.current && wsRef.current.close();
    };
  }, []); // 의존성 없음: 최초 마운트/언마운트 시 한 번만 실행
}
''',
}

def ensure_dir(path):
    path.mkdir(parents=True, exist_ok=True)

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def write_module_info(module):
    created_at = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    creator = os.getenv("USERNAME") or os.getenv("USER") or "unknown"
    info = {
        "name": module,
        "type": "관리자대시보드",
        "description": f"{module} 시스템 관리자 대시보드 (자동 생성)",
        "created_at": created_at,
        "creator": creator,
        "enabled": True,
        "backend": f"backend/app/modules/{module}",
        "frontend": f"frontend/src/modules/{module}",
        "db": f"db/modules/{module}.sql"
    }
    # ★ sysadmin 모듈이면 ws_needed True 추가
    if module == "sysadmin":
        info["ws_needed"] = True
        
    with open(MODULE_INFO_PATH, 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2, ensure_ascii=False)


def rebuild_and_restart_backend_container():
    import subprocess
    from pathlib import Path
    PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
    print("[자동 재빌드+재기동] backend 컨테이너 build & up 시도...")
    result_build = subprocess.run(
    ["docker", "compose", "-f", "docker-compose.prod.yml", "build", "backend"],
    capture_output=True, text=True, encoding="utf-8", cwd=PROJECT_ROOT
)
    print("[build] stdout:", result_build.stdout)
    print("[build] stderr:", result_build.stderr)
    result_up = subprocess.run(
        ["docker", "compose", "-f", "docker-compose.prod.yml", "up", "-d", "backend"],
        capture_output=True, text=True, cwd=PROJECT_ROOT
    )
    print("[up] stdout:", result_up.stdout)
    print("[up] stderr:", result_up.stderr)
    if result_build.returncode == 0 and result_up.returncode == 0:
        print("✅ backend 컨테이너가 완전히 재빌드+재기동되어 라우트가 100% 반영됨!")
    else:
        print("❌ backend 재빌드/재기동 실패! 위 로그 확인")


def create_sysadmin_module():
    ensure_dir(BACKEND_SYSADMIN)
    for filename, content in BACKEND_FILES.items():
        write_file(BACKEND_SYSADMIN / filename, content)

    for subdir_file, content in FRONTEND_FILES.items():
        target_path = FRONTEND_SYSADMIN / subdir_file
        ensure_dir(target_path.parent)
        write_file(target_path, content)

    write_file(DB_SYSADMIN, '-- sysadmin db structure')
    write_module_info('sysadmin')

    add_route_to_main('sysadmin')    # FastAPI main.py에 라우터 자동 등록
    add_route_to_appjs('sysadmin')   # React App.js에 라우트 자동 등록
    add_route_to_appjs('sysadmin/module-tree')  # 트리뷰 경로 자동등록
    run_generate_nginx()             # Nginx location 자동 동기화
    # rebuild_and_restart_backend_container()
    print("✅ System dashboard module created & Nginx conf updated!")

def delete_sysadmin_module():
    shutil.rmtree(BACKEND_SYSADMIN, ignore_errors=True)
    shutil.rmtree(FRONTEND_SYSADMIN, ignore_errors=True)
    if DB_SYSADMIN.exists():
        DB_SYSADMIN.unlink()

    remove_route_from_main('sysadmin')
    remove_route_from_appjs('sysadmin')
    remove_route_from_appjs('sysadmin/module-tree')  # ⭐️ 이 한 줄 추가!
    run_generate_nginx()
    # rebuild_and_restart_backend_container()
    print("🗑️ System dashboard module deleted & Nginx conf updated!")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='System Dashboard Setup/Delete')
    parser.add_argument('--delete', action='store_true', help='Delete system dashboard module')
    args = parser.parse_args()

    if args.delete:
        delete_sysadmin_module()
        print("🗑️ System dashboard module has been deleted.")
    else:
        create_sysadmin_module()
        print("✅ System dashboard module has been created.")
