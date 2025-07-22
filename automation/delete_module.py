# automation/delete_module.py
import sys
import os
import shutil
from automation.utils import remove_route_from_main, remove_route_from_appjs, run_generate_nginx, rebuild_frontend_and_nginx

PROTECTED_MODULES = {"sysadmin"}

def main():
    if len(sys.argv) < 2:
        print("사용법: python automation/delete_module.py [모듈명]")
        sys.exit(1)
    module = sys.argv[1].lower()
    if module in PROTECTED_MODULES:
        print(f"[경고] '{module}' 모듈은 삭제할 수 없습니다!")
        sys.exit(1)

    backend_dir = f'backend/app/modules/{module}'
    frontend_dir = f'frontend/src/modules/{module}'
    db_file = f'db/modules/{module}.sql'

    # 폴더/파일 삭제
    if os.path.exists(backend_dir):
        shutil.rmtree(backend_dir)
        print(f"[삭제] {backend_dir}")
    if os.path.exists(frontend_dir):
        shutil.rmtree(frontend_dir)
        print(f"[삭제] {frontend_dir}")
    if os.path.exists(db_file):
        os.remove(db_file)
        print(f"[삭제] {db_file}")

    # **main.py, App.js 라우터/Route 자동 삭제: utils.py 함수만 호출!**
    remove_route_from_main(module)
    remove_route_from_appjs(module)
    # ⭐️ Nginx conf 자동 동기화!
    run_generate_nginx()
    rebuild_frontend_and_nginx()
    print(f"[완료] {module} 모듈 삭제 및 Nginx conf 동기화 완료!")

    print(f"[완료] {module} 모듈 삭제 및 main.py, App.js 라우트 삭제 완료!")

if __name__ == "__main__":
    main()
