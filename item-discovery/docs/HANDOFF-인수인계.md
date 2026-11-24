# K-ITEM FINDER — 인수인계 문서 (2026.08.10 최신)

> 새 대화 시작 시 이 문서 + `k-item-finder-deploy.zip`(전체 소스)를 업로드하면 즉시 이어서 작업 가능.

---

## 1. 제품 한 줄 정의

**K-ITEM FINDER** = 아이템이 없거나 방향이 미정인 사용자가 **고객문제·시장공백·본인역량**을 연결해 **사업기회를 발견**하는 Explainable Opportunity Discovery Engine.

- 기존 아이템을 평가하는 도구가 **아님** (발견 도구)
- 제품 경계: **FIND → COMPARE → SELECT → HANDOFF** 까지만
- 성공확률·투자등급·매출예측·TAM/SAM/SOM·재무예측은 **산출 안 함** (별도 제품 K-ITEM PMF LAB이 담당)
- 발주자: 그로스벤처스㈜ (Beconic 브랜드), 중소기업상담회사 제2025-684호

---

## 2. 현재 배포 상태 (핵심 기능 작동 중)

- **도메인**: https://item-discovery-2026.netlify.app
- **PMF LAB(검증 이관 대상)**: https://item-jindan-2026.netlify.app
- **버전**: 앱 v0.2.0 · Prompt v1.2.0 · Updated 2026.08.10
- **배포**: `k-item-finder-deploy.zip` 통째로 Netlify에 드래그
- **필수 환경변수**: `ANTHROPIC_API_KEY`(필수), `KIF_DEBUG=1`(현재 켜져 있음 — 결과화면 하단에 "진단: CALL B ok(5)" 표시됨)
- **Netlify Blobs 활성화 필요** (background function 결과 저장용)
- **현재 모델**: claude-sonnet-4-6 (CALL A·B 공통)

### 아키텍처 (Background Function — 504 타임아웃 해결책)
```
프론트(app.js Discovery.run)
  → jobId 생성 → POST /api/discover (discover-background.mjs, 즉시 202)
       → 백그라운드에서 _core.mjs orchestrate() 실행
       → 결과를 @netlify/blobs "kif-jobs" store에 저장
  → GET /api/status?jobId=... (status.mjs) 3초 간격 폴링 (최대 5분)
  → done이면 결과 렌더
```
health 체크(AI 배지)만 opportunity.js의 action:"health" 사용.

---

## 3. 파일 구조

| 파일 | 역할 |
|---|---|
| index.html | SPA 셸 + 전체 CSS (네이비 #223254, Signal Blue #2F6BFF, Pretendard) |
| app.js | App 컨트롤러, State(세션저장), Onboarding(5스텝), Discovery(폴링), AI배지, App.esc(XSS) |
| app-result.js | 결과 렌더(카드/시그널바/Founder Fit/explainPath/비교표/Shortlist), Handoff, SAMPLE_RESULT |
| app-pdf.js | PDFLayout.build() — 결과보고서 |
| netlify/functions/_core.mjs | **실제 orchestrate 로직** (CALL A→Rule Engine→CALL B). ⚠️ maxTokens 등 설정 여기 있음 |
| netlify/functions/discover-background.mjs | 탐색 제출(background) |
| netlify/functions/status.mjs | 상태 폴링 조회 |
| netlify/functions/opportunity.js | health 체크 전용 (레거시 orchestrate 코드 남아있으나 미사용) |
| netlify.toml | /api/discover·/api/status·/api/opportunity 라우팅 |
| package.json | @netlify/blobs 의존성 |
| assets/og-finder-v3.png | 카톡 OG 이미지 |

⚠️ **주의**: maxTokens·API_CONFIG·model은 `_core.mjs`가 실제 사용됨. opportunity.js의 같은 값은 미사용(혼동 주의).

---

## 4. 설계 핵심 원칙 (반드시 준수)

- **SUCCESS SCORE 금지**. 5개 신호만: Problem/MarketGap/Timing + Founder Match + Evidence Confidence(L0~L3)
- **Missing ≠ Negative**: 데이터 없으면 임의추정 금지, UNKNOWN 처리
- 점수/필터/다양성은 **Rule Engine(JS)**이 계산. **Claude는 구조화·서술만**
- Claude 2-Call: **CALL A**(구조화·seed) → Rule Engine → **CALL B**(카드 서술)
- PDF 명칭: "사업기회 발굴 결과보고서"
- Founder Match: 밴드 UNKNOWN("정밀 평가 전") 유지, 정성 코멘트+하드미스핏 경고만

---

## 5. 지금까지 해결된 주요 이슈 (시간순)

1. 배포·도메인·OG이미지(카톡) — 도메인 불일치가 원인이었음
2. 모바일 최적화, AI 연동상태 배지, 세션 저장(이탈방지)
3. 시장관점 UI/UX(차별점 카드, 발견 톤 결과화면)
4. **504 타임아웃 → Background Function 전환**
5. **PARSE_A_FAILED → maxTokens 조정 + 잘린 JSON 복구 로직**
6. 레드팀: XSS 2곳 방어(App.esc), 엣지케이스
7. 9개 레드팀 UI 개선(select, 버전 v0.2.0, handoff URL, 신뢰배지 등)
8. **아이템명 문제 → refineItemName/makeFallbackTitle/dedupeTitles + CALL B slim화**
9. **CALL B 실패를 드러내는 진단 표시(_debug callBStatus)** → CALL B가 실제로 성공(ok(5))함을 확인
10. **카드 필드 정비**: 영어 모티브(AVOID)→한글, "확인 필요" 빈행 숨김, 핵심가치 추가
11. **explainPath UI**: 화살표 나열 → 번호 매긴 세로 단계 흐름
12. PDF 동일 정비(빈행 숨김, 핵심가치)
13. 푸터 주소에서 "(구로 디지털단지)" 삭제

---

## 6. ⚠️ 현재 상태 & 다음 확인 사항

### 작동 확인됨
- CALL B ok(5) — 아이템명("성장병목 AI 진단 SaaS" 등), 왜지금·해결방식 필드 채워짐
- 카드/PDF 필드 한글화·정비 완료 (배포 후 실제 결과로 최종 확인 필요)

### 다음 세션에서 볼 것
- **내용의 질**: 아이템이 실제로 매력적인지, 5개가 충분히 다른지 (실배포 결과 기준)
- **분석 시간**: CALL B 7필드 slim화로 개선했으나 실측 필요 (여전히 느리면 추가 최적화)
- **모델 업그레이드 검토**: 구조가 안정됐으니 CALL B만 Opus 4.8로 올리면 아이템 품질↑
  (사용자가 "테스트 후 결정" 상태. 타임아웃 안정화 확인 후 진행 권장)

### ⚠️ 반복된 프로세스 반성점
- **목(mock) 데이터 검증만 하고 "통과"라고 보고 → 실제 Claude 응답에서 안 먹히는 오류 반복됨**
- 목 데이터는 이상적 응답 가정 → 실제 응답의 불완전성/장황함을 못 잡음
- **판단 기준은 실배포 결과 스크린샷. 목 검증은 참고로만.**

## 7. 백로그 (여유 시)
- 실사용 데이터 기반 WEIGHT_CONFIG 가중치 튜닝
- Prompt Caching 적용 (비용 40~50% 절감)
- Analytics 이벤트 연결 (퍼널/이탈 분석)
- 비용 참고: 진단 1회 약 100원 (Sonnet 표준가)
