# K-ITEM FINDER (BECONIC 31 · S1 아이템 발굴)

운영: https://beconic-diagnosis-item-discovery.netlify.app · 현재 v0.4.0

이 폴더는 **프론트 파일만** 있습니다. 서버 함수(`netlify/functions/_core.mjs`, `discover-background.mjs`, `status.mjs`, `opportunity.js`)와 `netlify.toml`은 기존 `k-item-finder-deploy.zip`의 것을 그대로 씁니다(v0.4.0에서 변경 없음).

## 배포
기존 zip을 풀고 아래 파일만 덮어쓴 뒤 Netlify에 드래그:
`index.html`, `app.js`, `app-result.js`, `app-pdf.js`, `app-plus.js`(신규)

## 파일
| 파일 | 역할 |
|---|---|
| app-plus.js | v0.4.0 보강: 규칙 데이터(PLUS_DATA)·입력 충실도·조건 점검·근거 확인처·검증 3걸음·탐색 기록 비교·31 다음 진단·메일 상담 |
| app.js / app-result.js / app-pdf.js | 기존 + 보강 섹션 연결 |
| tests/e2e.mjs | `node tests/e2e.mjs` (Playwright, API는 가짜 응답) |
| docs/SCORECARD_9.md | 9개 항목 점검표 |
