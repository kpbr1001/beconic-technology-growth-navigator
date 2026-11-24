# K-ITEM FINDER (BECONIC 31 · S1 아이템 발굴)

운영: https://beconic-diagnosis-item-discovery.netlify.app · 현재 v0.9.3

v0.5.0부터 서버 함수(`netlify/functions/`)까지 이 폴더가 원본입니다.

## 배포
`docs/k-item-finder-deploy-v0.9.3.zip`을 풀어 폴더째 Netlify에 드래그(서버 함수 포함 완성본).
환경변수: `ANTHROPIC_API_KEY`(필수), 선택 `KIF_DAILY_LIMIT`(기본 300)·`KIF_IP_LIMIT`(기본 15)·`KIF_DISABLED=true`(긴급 중지)·`NAVER_HUB_KEY_ID`·`NAVER_HUB_KEY_SECRET`(데이터랩)·`KIF_DEBUG=1`.

## 테스트
`node tests/server.mjs` · `node tests/datalab.mjs` · `node tests/e2e.mjs` · `node tests/redteam.mjs`

## 파일
| 파일 | 역할 |
|---|---|
| app-plus.js | v0.4.0 보강: 규칙 데이터(PLUS_DATA)·입력 충실도·조건 점검·근거 확인처·검증 3걸음·탐색 기록 비교·31 다음 진단·메일 상담 |
| app.js / app-result.js / app-pdf.js | 기존 + 보강 섹션 연결 |
| tests/e2e.mjs | `node tests/e2e.mjs` (Playwright, API는 가짜 응답) |
| docs/SCORECARD_9.md | 9개 항목 점검표 |
