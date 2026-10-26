# BECONIC HR Health Navigator (v3.0.1)

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호
서비스 주소: https://beconic-diagnosis-hr.netlify.app

대표·인사담당자가 15분 동안 **조직 상태(10영역 30문항) · 성과지표(4) · HR 제도·노무(14영역)**를 응답하고, 선택으로 이직률·연장근로 같은 **객관 지표**를 넣으면
경영진 요약 → 문제정의 → 항목별 해석 → 경험×제도 갭 매트릭스 → 법정 노무 점검 → 120일 로드맵 → A4 보고서까지 만드는 **단일 HTML 웹앱**입니다.
점수·우선순위·로드맵은 공개된 규칙으로 계산하고, AI 해석은 운영자가 켠 경우에만 동의 후 초안으로 덧붙입니다.

## 구성

```text
hr/
├─ index.html                         # 화면 전체(CSS·JS 인라인). 계산은 브라우저 안에서
├─ og-image-v3.png                    # 카카오톡·SNS 공유 이미지 1200×630
├─ netlify/functions/hr-insights.mjs             # AI 접수·결과 조회(/api/hr-insights)
├─ netlify/functions/hr-insights-background.mjs  # AI 처리(백그라운드, 최대 15분)
├─ lib/ai-core.mjs                    # AI 입력·출력 스키마, 금지 표현, Claude 호출
├─ netlify.toml · package.json · .env.example
├─ tests/qa.mjs                       # Chromium QA 62항목(규칙 엔진·플로우·모바일·AI 화면·레드팀 회귀·A4 PDF)
├─ tests/ai-contract.mjs              # AI 서버 함수 계약·키 노출 테스트 45항목(모의 API·카나리 키)
├─ docs/CHANGELOG.md                  # 개선 내역과 27개 Tool 진단 보고서 대응표
└─ docs/REDTEAM_2026-10-26.md         # 자가부검·레드팀 점검 결과
```

## Netlify 배포

1. 기존 `beconic-diagnosis-hr` 사이트(드래그 배포)를 이 저장소에 연결 → **Base directory: `hr`**. 나머지는 `hr/netlify.toml`이 지정합니다(`npm run build`로 공개 파일만 `dist/`에 복사).
2. 화면만 쓸 때는 환경변수가 필요 없습니다(AI 해석은 기본 꺼짐 — 꺼져 있으면 화면은 '규칙 기반 진단'으로만 표기).
3. AI 해석을 켜려면 Environment variables(Scope: **Functions**)에 `BECONIC_AI_ENABLED=true`, `ANTHROPIC_API_KEY`, `BECONIC_ACCESS_CODE`(8자 이상), 선택 `ANTHROPIC_MODEL`(기본 `claude-opus-5-5`), `BECONIC_AI_DAILY_LIMIT`(200), `BECONIC_AI_IP_LIMIT`(10), `BECONIC_AI_EFFORT`(medium).
4. 22번 창업자·CEO 역량진단 주소가 정해지면 `index.html`의 `TOOL_LINKS.ceo`에 넣으세요(비어 있으면 'BECONIC 허브에서 이용' 안내만 표시).

## 로컬 확인·QA

```bash
cd hr && python3 -m http.server 8791               # http://127.0.0.1:8791
node hr/tests/qa.mjs http://127.0.0.1:8791/        # 루트에서 npm ci 후 (playwright 사용)
cd hr && npm run build && cd .. && node hr/tests/ai-contract.mjs
```

브라우저가 없다는 오류가 나면 `CHROME_PATH`에 Chromium 실행 파일 경로를 지정합니다.
