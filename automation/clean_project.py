import os
import shutil
import argparse
import time

def clean_project(keep_frontend=False):
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    exclude = {"automation", ".git"}
    if keep_frontend:
        exclude.add("frontend")
    print(f"\n[시작] 프로젝트 폴더 정리! (남기는 폴더: {exclude})")
    try:
        for entry in os.listdir(root_dir):
            if entry in exclude:
                continue
            path = os.path.join(root_dir, entry)
            try:
                if os.path.isdir(path):
                    print(f"  [삭제중] 폴더: {entry} ...")
                    shutil.rmtree(path)
                    print(f"    [완료] 폴더: {entry}")
                else:
                    print(f"  [삭제중] 파일: {entry} ...")
                    os.remove(path)
                    print(f"    [완료] 파일: {entry}")
            except Exception as e:
                print(f"    [실패] {entry}: {e}")
        print("\n[완료] 프로젝트 폴더 정리 끝!")
    except KeyboardInterrupt:
        print("\n[중단] 사용자가 직접 멈췄습니다. (KeyboardInterrupt)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="프로젝트 폴더 정리 (automation, .git 폴더만 남김)")
    parser.add_argument(
        "--keep-frontend",
        action="store_true",
        help="frontend 폴더는 남기고 나머지만 삭제"
    )
    args = parser.parse_args()
    clean_project(keep_frontend=args.keep_frontend)
