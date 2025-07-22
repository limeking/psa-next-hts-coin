import os
import sys
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)

import datetime

def list_db_modules():
    base_dir = "db/modules"
    if not os.path.exists(base_dir):
        print("[!] db/modules 폴더가 없습니다.")
        return
    print(f"\n[DB 모듈 목록 및 상태조회] ({base_dir})")
    for module_name in os.listdir(base_dir):
        module_dir = os.path.join(base_dir, module_name)
        sql_file = os.path.join(module_dir, "init.sql")
        if os.path.isfile(sql_file):
            mtime = datetime.datetime.fromtimestamp(os.path.getmtime(sql_file))
            size = os.path.getsize(sql_file)
            print(f"- {module_name:15} | {size:6} bytes | 최종수정: {mtime.strftime('%Y-%m-%d %H:%M:%S')}")
        else:
            print(f"- {module_name:15} | [init.sql 없음]")

if __name__ == "__main__":
    list_db_modules()
