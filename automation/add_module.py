# automation/add_module.py
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import json
import datetime
from automation.utils import add_route_to_main, add_route_to_appjs, run_generate_nginx, rebuild_frontend_and_nginx


def main():
    if len(sys.argv) < 2:
        print("사용법: python automation/add_module.py [모듈명]")
        sys.exit(1)
    module = sys.argv[1].lower()

    module_cap = module.capitalize()
    backend_dir = f'backend/app/modules/{module}'
    frontend_dir = f'frontend/src/modules/{module}'
    db_dir = f'db/modules'

    # backend 생성 예시 (routers.py만)
    os.makedirs(f'{backend_dir}/routers', exist_ok=True)
    with open(f'{backend_dir}/routers/{module}.py', 'w', encoding='utf-8') as f:
        f.write(f'''from fastapi import APIRouter

router = APIRouter(prefix="/{module}")

@router.get("/")
def {module}_ping():
    return {{"msg": "{module_cap} API OK"}}
''')
    with open(f'{backend_dir}/__init__.py', 'w', encoding='utf-8') as f:
        f.write('')
    with open(f'{backend_dir}/routers/__init__.py', 'w', encoding='utf-8') as f:
        f.write('from .{0} import router\n'.format(module))  # <- 명시적으로 router export

    # frontend 생성 예시
    os.makedirs(frontend_dir, exist_ok=True)
    with open(f'{frontend_dir}/index.js', 'w', encoding='utf-8') as f:
        f.write(f'''import React from "react";

export default function {module_cap}Page() {{
  return <div>{module_cap} Page</div>;
}}
''')

    # db 생성 예시
    os.makedirs(db_dir, exist_ok=True)
    with open(f'{db_dir}/{module}.sql', 'w', encoding='utf-8') as f:
        f.write(f'-- SQL for {module_cap}\n')

    # ⭐️ module_info.json 자동 생성!
    module_info_path = f'{backend_dir}/module_info.json'
    created_at = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    creator = os.getenv("USERNAME") or os.getenv("USER") or "unknown"
    info = {
        "name": module,
        "type": "일반모듈",
        "description": f"{module} 기능 모듈 (자동 생성)",
        "created_at": created_at,
        "creator": creator,
        "enabled": True,
        "backend": backend_dir,
        "frontend": frontend_dir,
        "db": f"{db_dir}/{module}.sql"
    }
    with open(module_info_path, 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2, ensure_ascii=False)

    # **자동 라우터/Route 등록: utils.py 함수만 호출!**
    add_route_to_main(module)
    add_route_to_appjs(module)
    # ⭐️ Nginx conf 자동 동기화!
    run_generate_nginx()
    rebuild_frontend_and_nginx()

    print(f"[완료] {module} 모듈 생성 및 Nginx conf 동기화 완료!")
    print(f"[완료] {module_cap} 모듈 자동 생성 및 main.py, App.js 라우트 등록!")

if __name__ == "__main__":
    main()
