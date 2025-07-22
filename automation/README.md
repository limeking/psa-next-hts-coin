# PSA-NEXT 자동화 & 관리 스크립트 모음

> 이 폴더는 PSA-NEXT 프로젝트의 "실무형 자동화/유틸/관리 스크립트"만 따로 모아두는 곳입니다.  
> 
> 모든 스크립트는 어디서 실행해도 항상 "프로젝트 루트 기준"으로 동작합니다.
>
> ⚡️ 프로젝트 루트에서 `python automation/파일명.py ...` 또는 `bash automation/파일명.sh`로 실행하세요!

---

## 📂 포함된 파일과 역할

| 파일명                          | 역할/설명                                                             |
|----------------------------------|----------------------------------------------------------------------|
| setup_skeleton.py                | 전체 프로젝트 폴더/파일/도커구조 자동생성 (최초 1회/구조 리셋용)      |
| add_module.py                    | 기능별 모듈(백/프론트/DB) 자동 생성, App.js/main.py 자동등록         |
| delete_module.py                 | 기능별 모듈 자동 삭제, App.js/main.py 자동정리                        |
| generate_nginx_conf.py           | Nginx conf(프록시/API경로) 모듈별로 자동 생성/동기화                  |
| setup_system_dashboard.py         | **관리자(sysadmin) 대시보드 모듈 자동 생성/삭제**.<br>백엔드 라우터, 프론트 대시보드 UI, DB, Nginx conf, main.py, App.js까지<br>관리자 페이지/시스템 구조 전체를 한 번에 자동 구성/정리.<br>REST API 및 React 샘플 페이지 포함 (삭제시 모든 관련 경로 자동 정리) |
| add_frontend_dockerfiles.py      | React 프론트엔드 Dockerfile.dev/prod, .dockerignore 자동 생성         |
| **clean_project.py**             | **automation/.git(기본값)만 남기고 전체 싹 정리, 옵션으로 frontend도 남김** |
| print_tree.py                    | 전체 프로젝트 폴더 트리 구조 한눈에 출력                              |
| module_list.py                   | 전체 모듈 목록/상태를 한눈에 출력 (모듈 메타 자동 수집)               |
| db_module_list.py                | DB용 모듈 목록/상태를 한눈에 출력                                     |
| run.sh                           | 도커 개발환경 기동 (docker-compose up --build)                        |
| stop.sh                          | 도커 개발환경 중지 (docker-compose down)                              |
| reset.sh                         | 도커/DB/Redis 완전 초기화 (모든 데이터 볼륨 삭제)                      |

---

### 👨‍💻 관리자 대시보드 자동화란?

- `setup_system_dashboard.py`는 **실무형 운영/관리자 대시보드 전체 모듈을 한 번에 자동 생성/삭제**하는 스크립트입니다.
- **생성:**  
  `python automation/setup_system_dashboard.py`  
  → sysadmin(관리자) 라우터, React 대시보드 UI, DB, Nginx, 라우팅(App.js/main.py)까지 **모든 관리자 구성요소를 자동 생성/등록**
- **삭제:**  
  `python automation/setup_system_dashboard.py --delete`  
  → 관련 모든 파일/폴더/라우팅/프록시 설정 자동 삭제 및 Nginx conf 최신화
- **REST API(예: `/sysadmin/status`)와 React 대시보드 샘플 페이지가 같이 생성**되어, 빠르게 실무 관리자 화면/백엔드 API를 구현 가능
- 실무에서는 **운영 대시보드, 시스템 상태 모니터링, 관리 기능**을 실수 없이 빠르고 확장성 있게 구축/리셋할 때 반복 활용

---

## 🛠️ **실무 자동화/운영 전체 순서**

1. **전체 프로젝트 싹 정리(테스트/리셋)**
    - `python automation/clean_project.py`  
      (옵션: `--keep-frontend` 사용 시 frontend 폴더도 남김)
2. **(필요시) 프론트엔드 폴더 재설치**
    - frontend 폴더가 없으면, 아래 명령어로 React 프로젝트를 다시 생성:
      ```bash
      npx create-react-app frontend
      ```
    - (기존 템플릿/구성에 맞게 직접 복원해도 됨)
3. **최초 셋업/구조 리셋**
    - `python automation/setup_skeleton.py`
4. **기능 모듈 추가 (예: user, admin 등)**
    - `python automation/add_module.py [모듈명]`
5. **관리자 대시보드 자동 생성**
    - `python automation/setup_system_dashboard.py`
    - 삭제 시: `python automation/setup_system_dashboard.py --delete`
6. **Nginx conf 동기화 자동 생성**
    - `python automation/generate_nginx_conf.py` 실행 시 dev/prod conf 모두 생성됨
7. **도커 서비스 실행 (개발/운영 모드)**
    - 개발: `bash run_dev.sh`
    - 운영: `bash run_prod.sh`
8. **모듈 삭제**
    - `python automation/delete_module.py [모듈명]`
9. **트리/모듈/DB 상태 실시간 확인**
    - `python automation/print_tree.py`
    - `python automation/module_list.py`
    - `python automation/db_module_list.py`

> 각 단계 후, 변경 사항은 항상 **git add/commit**으로 기록할 것!

---

## ⚠️ **실무/초보자 주의사항 & 팁**

- 모든 py파일은 automation/ 폴더에서만 관리(루트에 중복X)
- py파일 내부 os.chdir 자동 포함 → 항상 루트 기준 파일 생성/수정
- sh 파일은 `chmod +x automation/*.sh`로 실행권한 부여
- add_module/delete_module 사용시 App.js/main.py 자동 반영,  
  그래도 최종적으로 직접 코드 한번씩 꼭 확인!
- 도커/프로젝트 구조 꼬이면 setup_skeleton.py로 리셋하면 99% 해결
- **프로젝트 폴더를 완전히 싹 비우고 싶을 땐 `clean_project.py` 사용  
  (automation, .git 폴더만 남김. 옵션: `--keep-frontend`로 frontend도 남길 수 있음)**
- **frontend 폴더까지 삭제했다면, 반드시 `npx create-react-app frontend`로 React 앱을 다시 설치!**
- **docker-compose.dev.yml / prod.yml 내부에 nginx.conf 마운트 경로 자동 포함됨 → 따로 수정할 필요 없음!**
- 질문/에러/팀원 onboarding시 이 README를 보여주면 됨!

---

## 💬 **FAQ**
- **Q. 모든 py, sh를 automation 폴더에 다 넣어도 되나요?**  
  → 네, 실무에서도 관리가 훨씬 편합니다.
- **Q. os.chdir이 안 들어가도 되나요?**  
  → 모든 py파일에는 반드시 os.chdir 코드가 포함되어야 합니다.
- **Q. automation폴더를 git으로 공유해도 되나요?**  
  → 네, 팀/협업/교육/사내템플릿 배포에 적극 추천!
- **Q. 프로젝트 폴더를 한 번에 싹 정리할 방법은?**  
  → `python automation/clean_project.py` 사용!  
    (기본값: automation, .git만 남김. 옵션: `--keep-frontend`로 frontend 폴더도 남길 수 있음)
- **Q. frontend 폴더가 삭제된 경우 어떻게 해야 하나요?**  
  → `npx create-react-app frontend` 명령어로 React 앱을 새로 설치하면 됩니다.

---

> PSA-NEXT 실무 자동화 시스템  
> (문의/팀공유: 담당자/리드엔지니어 연락처)
