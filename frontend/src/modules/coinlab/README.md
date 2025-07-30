# coinlab 프론트엔드 모듈

## 📦 목적
- 시장 환경/섹터/테마/전략/실험/결과를 시각적으로 관리하는 React 기반 UI 모듈  
- 실시간 결과 테이블, 필터, 전략/실험 등록, 결과 비교 등 제공

## 📂 주요 폴더/파일 구조

- **api/**  
  - `coinlab.js` : 백엔드 coinlab API 연동 함수

- **components/**  
  - `SectorFilter.js` : 섹터별 필터 UI  
  - `ThemeFilter.js` : 테마별 필터 UI  
  - `MarketConditionTag.js` : 시장상황(상승/하락장) 표시  
  - `BacktestSummaryTable.js` : 결과 요약 테이블  
  - `MarketConditionSelector.js` : 시장상황 조건 선택 UI

- **hooks/**  
  - 커스텀 훅 (예: 소켓, 실시간 데이터 등)

- **pages/**  
  - `CoinLabMainPage.js` : coinlab 전체 메인  
  - `CoinLabRunPage.js` : 전략 실행/테스트  
  - `CoinLabStrategyPage.js` : 전략 관리/등록  
  - `ExperimentManagerPage.js` : 실험/조건별 반복 실행  
  - `ResultComparePage.js` : 전략/종목/조건별 결과 비교  
  - `StrategyManagerPage.js` : 전략 추가/삭제/설정

## 🏗️ 기능 예시

- 전략/종목/시장조건별 실험 실행 및 결과 시각화
- 실시간 요약 테이블, 차트, 필터, 상세 비교 기능
- 전략/실험 등록, 조건별 시나리오 생성 등 UI 제공

## 🛠️ 사용법 (간단 예시)
- API 연동: `api/coinlab.js` 함수 참고
- 전략 추가: `StrategyManagerPage.js`에서 신규 등록
- 결과 비교: `ResultComparePage.js`에서 조건별 비교 가능

---

> ⚠️ 신규 컴포넌트/기능 추가 시 README 및 구조 설명 갱신!
