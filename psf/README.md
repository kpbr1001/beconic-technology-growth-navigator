# BECONIC 고객문제·솔루션 적합성 진단 (v2.2) — Tool 20

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호
서비스 주소: https://beconic-diagnosis-psf.netlify.app

예비창업자~중소기업 대표가 6단계(기업·문제·고객·솔루션·검증·사업화) 40개 문항에 답하면, **문제-고객-솔루션 적합성(PSF)**을 9개 영역 100점으로 진단하고
등급·신뢰도·증거 등급·진단유형 → 강점/약점/리스크 → 근본원인 → 권고전략 → 30·90·180일 로드맵 → KPI → 18개 섹션 A4 보고서까지 만드는 **단일 HTML 웹앱**입니다.
점수는 화면·보고서의 '점수 산정 원칙(공개 산식)'에 적힌 규칙으로만 계산합니다(규칙 기반 진단). **AI 해석(선택)**은 운영자가 켜고 이용자가 동의한 경우에만 서술 답변(회사명 제거·연락처 가림)을 Claude로 보내 참고 초안을 덧붙이며, 그 외 입력값은 서버로 보내지 않습니다.

## 점수 원칙 (PSF Engine v2)

| 원칙 | 내용 |
|---|---|
| 점수 = 입력의 질 | 서술 문항은 '작성법'의 체크 신호(대상·상황·손실·수치 등) 충족률로 채점: 기본 0.3 + 신호 충족률×0.6 + 충분한 분량 0.1. 분량·입력 여부만으로는 점수가 오르지 않음 |
| 무의미 입력 0점 | 반복 문자('아아아', 'ㅋㅋㅋ')·자리채움('없음','test')·다른 문항 복사·'대안 없음' 같은 부정 답변·유행어 나열('AI 기반 혁신 플랫폼') 감점 |
| 정합성 영역 신설 | 문제→솔루션, Pain→Pain Reliever, Job→Outcome, 대안→차별점, 고객군→Early Adopter의 공통 개념 비율(10점). 50% 미만이면 솔루션·가치제안 감액, 30% 미만이면 B등급 이상 불가 |
| 증거 등급 관문 | L0 주장 → L1 대화 → L2 패턴 → L3 사용 → L4 약속 → L5 지불 → L6 반복. S등급 L5↑, A등급 L3↑, B등급 L1↑ 필요(미달 시 상한) |
| 모순 탐지 | 유료 고객↔매출, 사업단계↔매출, 인터뷰 수↔피드백 기록, 근거 없는 고심각도, 일률 최고 응답 → 감점·상한·신뢰도 반영 |
| 신뢰도 분리 | 30+70×응답률에서 무의미 입력·모순 감점, 증거 L0 상한 55·L1~2 상한 78. 40 미만은 '판정 보류 권고' |
| 단계 기대수준 | 아이디어~스케일업 단계별 영역 기대 비율과 비교(같은 입력이면 점수는 같고 기대수준만 다름) |

배점(9개 영역 = 100): 문제명확성 12 · 고객구체성 12 · 문제심각도 10 · 기존대안 이해도 8 · 솔루션 적합성 12 · 차별적 가치제안 8 · 문제-솔루션 정합성 10 · 검증근거 신뢰도 20 · 실행가능성 8

## AI 해석 (Phase 2 · 선택)

| 원칙 | 내용 |
|---|---|
| 점수는 규칙 | 정식 점수·등급은 바뀌지 않음. AI는 영역당 ±2·합계 ±6의 **보정 참고점수**만 제안하고, 증거·정합성 관문을 다시 적용 |
| 인용 대조 | 보정마다 대표 답변의 구절을 그대로 인용해야 하며, 서버가 입력과 대조해 맞지 않으면 버림 |
| 수치 가림 | 고쳐 쓰기 예시에 입력에 없는 수치가 나오면 `[수치 확인 필요]`로 바꿈 |
| 금지 표현 | 업계 평균·시장 규모 추정·선정/투자 가능성·성공 보장 문장 제거(한계 설명 문장은 유지) |
| 보내는 것 | 사업단계·유형·규칙 점수·연결 판정·점검 사항 제목·검증 선택값·서술 답변 30문항(각 400자) — 회사명은 `[기업명]`, 연락처·이메일은 가림. 샘플 데이터로는 요청 불가 |
| 운영 보호 | 동의 체크 + 이용 코드(오입력 20회 잠금) + 일일 한도(전체 200·IP 10) + 출처 확인. 키는 서버 함수에서만 읽고, 처리 후 입력은 지움 |
| 호출 | `claude-opus-5-5`, 구조화 출력(json_schema), effort medium, 거절 시 서버측 대체 모델(`fallbacks: "default"`). 접수(202) → 백그라운드 처리 → 조회의 3단계 |

## 구성

```text
psf/
├─ index.html                                   # 화면 전체(CSS·JS 인라인). 점수 계산은 브라우저 안에서. 화면은 토스 스타일, 보고서는 컨설팅 톤
├─ sw.js · assets/(manifest·아이콘)              # 홈 화면 설치(PWA). /api/ 는 캐시하지 않음
├─ lib/ai-core.mjs                              # AI 입력·출력 스키마, 시스템 프롬프트, Claude 호출, 인용 대조·수치 가림·금지 표현
├─ netlify/functions/psf-insights.mjs           # AI 접수·결과 조회(/api/psf-insights)
├─ netlify/functions/psf-insights-background.mjs # AI 처리(백그라운드, 최대 15분)
├─ netlify.toml · package.json · .env.example
├─ tests/qa.mjs            # Chromium QA 59항목(엔진 원칙·무의미 입력·정합성·증거 관문·모순·작성 가이드 자기 일관성·클릭 플로우·모바일 375px·A4 PDF·레드팀 회귀)
├─ tests/ai-contract.mjs   # AI 서버 함수 계약·키 노출·화면 연동 테스트 46항목(모의 API·카나리 키)
└─ docs/CHANGELOG.md · REDTEAM_2026-11-19.md   # 개선 내역 · 자가부검·레드팀 점검
```

## 설정 고치는 곳 (index.html 엔진 스크립트)

| 바꿀 것 | 위치 |
|---|---|
| 문항 작성법·좋은 예·피할 예·채점 신호 | `GUIDE` — 폼 안내·실시간 작성 체크·채점이 같은 정의를 씀 |
| 채점 신호 사전(대상·상황·손실·수치 …) | `SIG` |
| 영역 배점 | `DOMAIN_META` (판정 임계값은 모두 만점 대비 비율 `RT()`이라 배점을 바꿔도 판정 유지) |
| 정합성 연결 구간·범용어 제외 | `LINKS` · `LINK_STOP` |
| 증거 등급·등급 관문 | `EVIDENCE_LEVELS` · `GRADE_GATES` |
| 사업단계 기대수준 | `STAGE_EXPECT` |
| 진단유형(10개) | `TYPE_CATALOG` · `TYPE_ORDER` |
| 회사명·전화·메일·주소·인증번호 | `COMPANY` — 화면·보고서·PDF 머리글·상담 링크 공통 |
| 증거 단계별 다음 행동(권고·KPI·12개월) | `EVIDENCE_NEXT` |
| 화면 디자인(토스 스타일) | `<style id="toss-theme">` — 화면 영역에서만 토큰 재정의, 보고서 영향 없음 |
| 안내용 소요 시간 · 보고서 섹션 수 | `EST_MINUTES` · `REPORT_SECTION_COUNT`(QA가 실제 목차와 대조) |

## Netlify 배포

1. 새 사이트 `beconic-diagnosis-psf`를 이 저장소에 연결 → **Base directory: `psf`**. 나머지는 `psf/netlify.toml`이 지정합니다(`npm run build`로 `index.html`만 `dist/`에 복사).
2. 화면만 쓸 때는 환경변수가 필요 없습니다(AI 해석은 기본 꺼짐 — 요청하면 '기능이 꺼져 있습니다' 안내, 규칙 진단·보고서는 그대로). CSP는 같은 사이트 호출만 허용합니다(`connect-src 'self'`).
   AI 해석을 켜려면 Environment variables(Scope: **Functions**)에 `BECONIC_AI_ENABLED=true`, `ANTHROPIC_API_KEY`, `BECONIC_ACCESS_CODE`(8자 이상), 선택 `ANTHROPIC_MODEL`(기본 `claude-opus-5-5`), `BECONIC_AI_EFFORT`(medium), `BECONIC_AI_DAILY_LIMIT`(200), `BECONIC_AI_IP_LIMIT`(10). Anthropic 콘솔에서 월 사용 한도도 함께 걸어 두세요.
3. 공유 미리보기 이미지 `beconic-og.jpg`(1200×594)는 아직 저장소에 없습니다. 파일을 `psf/`에 넣고 `package.json`의 build에 추가하세요. `<meta>` 공유 문구의 영역 수는 정적이라 영역 수를 바꾸면 직접 고칩니다.
4. v1 진단 이력(브라우저 저장)은 배점 구조가 달라 읽지 않습니다(저장 키 `beconic_psf_diagnoses_v2`).

## 로컬 확인·QA

```bash
cd psf && npm run build && python3 -m http.server 8796 --directory dist   # http://127.0.0.1:8796
node psf/tests/qa.mjs http://127.0.0.1:8796/                            # 루트에서 npm ci 후 (playwright 사용)
node psf/tests/ai-contract.mjs                                          # psf에서 npm run build 후 (모의 API, 실제 호출 없음)
```

PDF 본문 검사는 `pymupdf`가 있으면 실제 PDF 텍스트로, 없으면 인쇄 DOM으로 합니다.
