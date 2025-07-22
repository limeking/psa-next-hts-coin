from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
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
