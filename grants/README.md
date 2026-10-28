# BECONIC 지원사업 MATCH (v3.8.0)

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호
서비스 주소: https://beconic-grant-matching.netlify.app

기업마당·K-Startup 공고를 서버 함수(BFF)로 모아, 브라우저 안에서 **자격조건(대상·지역·업력·매출·근로자·연령 등)을 먼저 판정**하고
검토할 만한 사업을 지원분야별로 보여 주는 웹앱입니다. 기업 입력값은 서버로 보내지 않고 이 브라우저에만 저장합니다.

## 판정 원칙

| 원칙 | 내용 |
|---|---|
| 자격 → 적합도 → 확인도 분리 | 자격(충족·미충족·확인 필요)이 먼저, 적합도는 순서용, 확인도는 '얼마나 확정했나' |
| 모르면 '확인 필요' | 구간 입력(연령대·매출·근로자)이 요건에 걸치거나, 업력 경계 연차, 공고에 표기 없는 대상은 단정하지 않음 |
| 목록 정보의 한계 표시 | 실시간 공고는 목록 정보만 있으면 '세부 자격요건(공고문 확인)'을 남겨 최대 '조건부'. AI 근거 대조 추출 공고만 예외 |
| 금액은 성격별 | 보조·출연과 융자·보증 한도를 따로 합산하고 '사업별 최대액 단순 합계'임을 표시 |
| 적합도 산식 | `APP_CONFIG.MATCH_WEIGHTS` 중 입력으로 판단 가능한 요소만 가중평균 × (0.6 + 0.4 × 근거 비중) + 지역 가점(시군구 8·시도 5) |

## 구성

```text
grants/
├─ index.html · app.js · data.js(DEMO 16건) · assets/   # 공개 파일 (dist/로 복사)
├─ netlify/functions/  programs.mjs(BFF·캐시) · health.mjs
├─ netlify/lib/        bizinfo.mjs · kstartup.mjs · normalize.mjs · eligibility-ai.mjs  (함수 내부 모듈, 공개 엔드포인트 아님)
├─ scripts/build.mjs   # dist/ 배포본, --demo 로 단일 HTML(dist-demo/)
├─ tests/server.test.mjs  # 서버 단위 14개(fetch 스텁)
├─ tests/qa.mjs           # Chromium QA 68개(엔진·흐름·레드팀 회귀·실시간 모의·모바일·PDF·데모 단일본)
└─ docs/  CHANGELOG.md · REDTEAM_2026-10-28.md · DEPLOY_GUIDE.md · AI_ELIGIBILITY.md
```

## 설정 고치는 곳

| 바꿀 것 | 위치 |
|---|---|
| 적합도 가중치·지역 가점·마감임박 일수·목록/PDF 표시 개수 | `app.js` `APP_CONFIG` |
| 입력 구간(연령대·매출·근로자) | `app.js` `AGE_BANDS`·`REVENUE_BANDS`·`EMPLOYEE_BANDS` |
| 수집량·캐시 시간·AI 추출 건수·시간 예산 | `netlify/functions/programs.mjs` 상단 상수 |
| 버전 | `package.json`의 `version`과 `app.js`의 `APP_VERSION.version`(빌드 시 불일치하면 실패) |

## 배포 (Netlify)

1. 이 저장소를 Netlify 사이트에 연결하고 **Base directory: `grants`** 로 지정 — 나머지는 `grants/netlify.toml`(빌드 `npm run build`, 공개 폴더 `dist`, 함수 `netlify/functions`)
2. 환경변수: `BIZINFO_API_KEY`, `KSTARTUP_API_KEY`(공공데이터포털 Decoding 키), 선택 `ANTHROPIC_API_KEY` — 자세한 절차는 [docs/DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md)
3. 키가 없거나 원천 API가 실패하면 화면은 DEMO 데이터로 동작하고 'DEMO' 배지·안내를 표시

## 로컬 확인·QA

```bash
cd grants && npm run build && npm run build:demo
(cd dist && python3 -m http.server 8793)                       # http://127.0.0.1:8793 (localhost는 DEMO 모드)
node --test grants/tests/server.test.mjs                        # 루트에서
node grants/tests/qa.mjs http://127.0.0.1:8793/                 # 루트에서 npm ci 후 (playwright)
```

브라우저가 없다는 오류가 나면 `CHROME_PATH`에 Chromium 실행 파일 경로를 지정합니다.
데모 단일본(`dist-demo/beconic-grant-match-demo-v*.html`)은 파일로 열면 외부 요청 없이 DEMO 데이터로 동작합니다(웹폰트 제외).
