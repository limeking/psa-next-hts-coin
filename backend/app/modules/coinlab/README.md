# coinlab 모듈

## 📦 목적
- 암호화폐/주식 등 다양한 자산의 **시장 환경(상승장/하락장), 섹터, 테마** 분석 및 실험, 전략별 백테스트를 자동화/관리하는 백엔드 핵심 모듈

## 📂 주요 폴더/파일 구조

- **data/**  
  - `sector_mapping.json` : 종목별 섹터(업종) 정보 사전  
  - `theme_mapping.json` : 종목별 테마 분류 사전  
  - `market_conditions.json` : 상승장/하락장 등 시장상황 정의

- **results/**  
  - 백테스트/실험 결과 CSV, JSON 등 저장 폴더

- **routers/**  
  - FastAPI 라우터(엔드포인트) 관리

- **schemas.py**  
  - 요청/응답 데이터 타입(Pydantic 스키마)

- **services/**  
  - `engine.py` : 전략/실험 실행 엔진  
  - `sector_theme.py` : 섹터/테마/시장 분석 유틸  
  - `experiment.py` : 실험/반복 백테스트 로직  
  - `strategy_manager.py` : 전략 불러오기/등록/관리  
  - `utils.py` : 공통 유틸 함수  
  - `strategies/` : 실제 전략 코드(MA, RSI 등)

- **module_info.json**  
  - coinlab 모듈 메타데이터(설명, 지원 전략 등)

## 🏗️ 기능 예시

- 종목별/섹터별/테마별 시장 환경 분류
- 단일/다중 전략, 단일/다중 종목 백테스트
- 시장상황(시나리오)별 조건부 실험
- 결과 저장/비교/조회 지원

## 🛠️ 사용법 (간단 예시)
- 라우터 추가: `routers/coinlab.py` 참고
- 전략 추가: `services/strategies/` 폴더에 전략 파일 추가
- 섹터/테마 데이터 확장: `data/`의 json 수정

---

> ⚠️ 실험 및 서비스 확장 시 폴더 구조/README 반드시 갱신!
