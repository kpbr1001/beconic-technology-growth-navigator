# BECONIC | 기업인증 준비도 진단 — 개발계획 (STEP 1 착수분석)

- 작성일: 2026-11-22 · 기준 요구사항: `BECONIC_기업인증_ClaudeCode_마스터프롬프트_v2.0.md` (v1.1과 충돌 시 v2.0 우선)
- 상태: **구현·검증 완료(로컬)** — 운영 배포(main 병합)는 승인 대기. 결과: `QA_REPORT.md`, `QA_PDF_REPORT.md`
- 승인 반영(2026-11-22): Base directory=`certification` · 전화 02-6124-5960 · 확인 안 된 법령·제도는 '확인 필요'로 명시 · OG는 첨부본에서 '78%' 부분만 교체 · 전문가 검토 대신 대표 검토

---

## 1. 현재 상태 진단

### 1-1. 저장소
| 항목 | 확인 결과 | 시사점 |
|---|---|---|
| 구조 | 모노레포. 루트=기술진단(Vite/TS), 앱별 폴더 `prestartup/ psf/ esg/ finance/ hr/ ir/ growth/ grants/` | 인증진단도 **`certification/` 독립 폴더**로 만든다 |
| 배포 패턴 | 앱마다 `netlify.toml` + `npm run build`(공개 파일만 `dist/` 복사) + Base directory=폴더명 | 동일 패턴 재사용 |
| CI | `.github/workflows/ci.yml` → `scripts/ci/changed-apps.mjs`의 `APPS`, `scripts/ci/app-qa.sh`에 한 줄씩 등록 | `certification` 등록 필요 |
| 인증진단 기존 코드 | **없음** (v1.1 산출물도 저장소에 없음) | 신규 개발 |

### 1-2. Netlify `beconic-diagnosis-certification` 배포 실패 원인
- 오류: `When resolving config file /opt/build/repo/netlify.toml: Base directory …` (main@158f6d0)
- 원인(추정, 근거: API로 Base directory 값 비공개 / 다른 앱 패턴): 사이트의 Base directory가 아직 main에 **존재하지 않는 폴더**(예: `certification`)를 가리킴. 코드가 없어서 실패한 것이지 설정 오류는 아닐 가능성이 높음.
- 조치: `certification/` + `certification/netlify.toml`이 main에 들어가면 해결. **Base directory 값을 `certification`으로 맞춰 주시면** 됨(다르면 알려 주세요).

### 1-3. 제공 자산
| 자산 | 확인 결과 | 조치 |
|---|---|---|
| `.ai` 로고 | PDF 호환, 4페이지 확인 — p1 영문/밝음, p2 영문/어두움, p3 한글 `그로스벤처스(주)`/밝음, p4 한글/어두움. 벡터 원본 | `pdftocairo`로 **벡터에서 직접** 투명 PNG(2x/3x) + **SVG** 추출. 방패 심볼은 같은 벡터에서 잘라냄(재그리기 없음) |
| 패키지 PNG 5종·`og-certification.png` | **이번 업로드에 없음** (보고서상 ZIP 포함이라 했으나 미첨부) | 위와 같이 원본에서 직접 생성 |
| OG 이미지(채팅 첨부 1장) | 1733×908, 큰 **"인증 준비도 78%" 도넛**, 금색 메달 "인증서" | ⚠️ v2.0 자체 원칙(§05 `%` 단독 노출 지양, 취득 오인 금지)과 충돌 → **결정 필요 D2** |

### 1-4. 공식 근거 접근성 (이 개발환경에서 실측, 2026-11-22)
| 출처 | HTTP | 의미 |
|---|---|---|
| smes.go.kr 벤처 신청요건 | 200 | 접근 가능 → 원문 확인 후 규칙화 가능 |
| law.go.kr (국가법령정보센터) | 200 | 벤처기업법·시행령, 중소기업기술혁신촉진법, 기업부설연구소법 원문 확인 가능 |
| innobiz.net | 200 | 접근 가능 |
| smes.go.kr/mainbiz | 302 | 리다이렉트 — 추가 확인 필요 |
| rnd.or.kr (연구소 신고·2026 편람) | **접속 불가** | 편람 직접 확인 불가 → 법령 원문으로만 검증, 미검증 부분은 정보형 |
| europa.eu CE | 200 | 정보형 카드 근거 |
| iso.org / fcc.gov | 403 | 봇 차단 — 링크 제공만, 접근 상태 기록 |
| fda.gov 지정 URL | 404 | **URL 변경됨** → 대체 공식 URL 확인 필요 |
| Pretendard(jsDelivr) | 200 | npm 패키지(OFL-1.1)로 **자체 호스팅** 예정 |
| Manus 참조 페이지 | 200(셸만) | JS 렌더 앱 — 실제 흐름 관찰 가능 범위만 기록, 복제 안 함 |

---

## 2. v1.1 → v2.0 핵심 변경점 (구현에 미치는 영향)
| 코드 | 변경 | 구현 방식 |
|---|---|---|
| R01 | 하드게이트 단일 FAIL → 전체 FAIL 오류 | 4값(PASS/FAIL/UNKNOWN/N/A) **AND/OR/WHEN 트리 엔진** + 회귀테스트 10종 필수 |
| R02 | 국내/해외 탭 ≠ 법적 관할 | `display_group`과 `jurisdiction_country / applicable_markets / standard_origin / issuing_authority / scheme_type / mandatory_status` 분리 |
| R03·R04 | 2026 연구소 제도 변경·법령 최신성 | 소스·규칙마다 `effective_from/until, checked_at, review_status, rule_version` |
| R05 | 점수 오해 | `8개 중 5개 완료 · 2개 확인 필요 · 1개 미완료` 건수형, UNKNOWN 분리 |
| R06 | 미검증 규칙 판정 | `DRAFT/UNVERIFIED/CONFLICTED/EXPIRED` → **자동판정 코드 경로 자체 차단** |
| R07 | 해외 제품 적용판단 | 판매국·역할·intended use·제품군 트리아지, 부족하면 `적용 규정 확인 필요` 강제 |
| R08 | 자가응답=검증 오인 | 증빙 상태 6종, MVP에서 `EXPERT_VERIFIED` 도달 불가 |
| R10 | PDF 표 붕괴 | 인쇄 전용 DOM, 8개 시나리오 실출력·렌더 이미지 검수 |
| R11 | 로고 | AI 원본 벡터 기반 |
| R13 | 개인정보 | 브라우저 메모리 전용, 서버 전송 0, 상담은 `tel:/mailto:`만 |

---

## 3. 아키텍처

```
certification/
  index.html                 # 정적 head(OG 포함) + 앱 셸
  netlify.toml               # Base directory=certification, publish=dist, CSP(self only)
  package.json               # build: 공개 파일만 dist/ 복사 · test · qa · pdf
  assets/                    # 로고 SVG/PNG(AI 원본 추출), favicon, og-certification.png
  fonts/                     # Pretendard(OFL) 자체 호스팅 subset
  data/
    catalog.json             # 제도 카탈로그(국내5 핵심 + 정보형 국내/해외)
    aliases.json             # 한/영 동의어·약어
    sources.json             # 공식 출처 메타(접근상태·확인일·조항)
    questions.json           # 질문 객체(why/예시/어디서 확인/모름 허용)
    rule_packs/*.json        # 제도·경로별 규칙 트리
  src/
    app.js                   # 상태·라우팅(history API, 뒤로가기 지원)
    search.js                # NFKC·case-fold·별칭·부분일치·0건 처리·비교(최대3)
    rules-engine.js          # 4값 AND/OR/WHEN · review_status 게이트 · 유효일 게이트
    readiness.js             # 준비항목·증빙 상태 집계(건수형)
    recommend.js             # 관련성 3단계(확률 아님) + 추천 이유 추적
    report.js / print.js     # 화면·인쇄 공용 뷰모델 → 인쇄 전용 DOM
    styles.css / print.css
  schemas/                   # catalog/rule/source/question JSON Schema
  tests/
    rules.test.mjs           # 엔진 회귀(필수 10 + 레드팀)
    data.test.mjs            # 스키마·출처 링크·가짜 기준 차단
    qa.mjs                   # Playwright E2E E01~E15, 뷰포트 7종
    pdf.mjs                  # 8개 시나리오 PDF 출력 + 페이지 이미지 + pdffonts
  docs/ RULE_SOURCE_MATRIX.md · DATA_CHANGELOG.md · RULE_AUTHORING.md
  QA_REPORT.md · QA_PDF_REPORT.md · README.md
```
- 프레임워크 없음(바닐라 ES 모듈) — 다른 정적 앱과 동일, 의존성 최소.
- 테스트 도구는 루트에 이미 있는 Playwright·Node test runner 재사용. Chromium은 환경에 설치되어 있음.
- 화면 15종: 홈 / 탐색 / 검색결과 / 제도상세 / 목적 / 기본정보 / 조건부질문 / 후보추천 / 비교 / 상세진단 / 결과요약 / 서류체크 / 로드맵 / 인쇄보고서 / 오류·0건.

## 4. 판정 엔진 설계 요지
- leaf: `{op:'leaf', input, predicate, as_of}` → PASS/FAIL/UNKNOWN/N/A. 미입력·`모름` → UNKNOWN(절대 FAIL/N/A 치환 안 함).
- `AND`: FAIL 우선 → UNKNOWN → PASS(N/A 제외) → 전부 N/A면 N/A.
- `OR`: PASS 우선 → UNKNOWN → 전부 FAIL이면 FAIL → 전부 N/A면 N/A.
- `WHEN(cond, then)`: cond UNKNOWN → UNKNOWN, cond가 공식 근거로 불해당일 때만 N/A.
- 게이트: 규칙 `review_status ∉ {VERIFIED}` 또는 기준일이 `valid_from~valid_to` 밖 → 결과는 `판정 범위 밖(정보형)`으로 고정(엔진 단에서 차단, UI 단 아님).
- 결과 3층 분리: A 관련성(내부 순위·숫자 미노출) / B 기본요건 상태 / C 준비·증빙 건수.
- PASS의 UI 문구는 항상 `입력 정보 기준 기본요건 확인 · 추가 평가/심사 필요`.

## 5. 초기 카탈로그와 판정 활성화 범위(제안)
| 제도 | 유형 | 제안 상태 | 근거 확보 방법 |
|---|---|---|---|
| 벤처기업확인 (벤처투자·연구개발·혁신성장·예비벤처 경로) | company_confirmation | **경로별 기본요건만** 판정 후보 | 벤처기업법·시행령 원문(law.go.kr) + smes 신청요건 화면 대조 |
| 이노비즈 | company_confirmation | 업력·업종 등 **원문 확인된 항목만** 후보, 평가점수는 범위 밖 | 중소기업기술혁신촉진법·운영규정 |
| 메인비즈 | company_confirmation | 동일 | 관련 법령·운영규정(사이트 302 확인 필요) |
| 기업부설연구소 / 연구개발전담부서 | rnd_institute_recognition | 인력 수·전담성 등 **법령 원문 확인 항목만** 후보. 편람(rnd.or.kr) 미접속 → 그 외 정보형 | 「기업부설연구소등의 연구개발 지원에 관한 법률」·시행령·시행규칙(2026-02-01 시행) |
| KC·HACCP·여성/장애인기업·가족친화·소셜벤처 | 각 유형 | **정보형만** | 공식 링크 |
| ISO 9001/14001/45001/27001/22000/13485 | management_system_certification | 정보형 + **준비상태 자가점검**(원문 복제 없음) | ISO 공식 페이지(403 → 링크만) |
| EU CE · US FDA · FCC | product_conformity_assessment / registration / authorization | 정보형 + 트리아지 → `적용 규정 확인 필요` | europa.eu, fda.gov(대체 URL 확인), fcc.gov |

> 가짜 임계값 0건 원칙: 원문 조항을 소스에 인용·기록하지 못한 요건은 `TODO`로 남기고 코드화하지 않음.

## 6. 단계별 일정 (승인 후)
| STEP | 산출물 | 완료 판단 |
|---|---|---|
| 2. 데이터·엔진 | 스키마, 카탈로그, 소스, 규칙팩, 엔진, 준비도, 회귀 15+·레드팀 테스트 | `npm test` 전부 통과, 미검증 규칙 판정 0 |
| 3. UI | 15개 화면, A/B 경로, 검색·비교, 로고·Pretendard·OG head | 뷰포트 320~1440 7종 가로스크롤 0, 키보드 완주 |
| 4. PDF | 인쇄 DOM, A4 CSS, 8개 시나리오 실출력 | 표 붕괴·글자 분절·출처 누락 0 (렌더 이미지 검수) |
| 5. 통합 QA·보안 | E01~E15, 레드팀 10문항, CSP·XSS·저장소·콘솔 노출 검사 | `QA_REPORT.md`, `QA_PDF_REPORT.md` |
| 6. 인계 | README, RULE_AUTHORING, CI 등록, 브랜치 푸시(승인 시), PR(요청 시) | `IMPLEMENTED / TESTED / NOT_VERIFIED / NEXT` 보고 |

## 7. 승인이 필요한 결정사항
- **D1 전화번호/주소 불일치**: v2.0은 `070-4103-4177` + 주소 표기, 저장소의 다른 앱 전체는 `02-6124-5960`이고 prestartup은 v1.6.2에서 주소를 삭제함.
- **D2 OG 이미지**: 첨부 이미지는 `78%` 도넛·메달 인증서 표현이 v2.0 원칙과 충돌. 제안: 같은 톤으로 **`%`·인증서 메달 없는 1200×630 OG를 HTML로 렌더링해 새로 제작**(다른 앱의 `render-images.mjs` 방식), 첨부본은 보관만.
- **D3 판정 활성화 기준**: v2.0은 `VERIFIED` = 공식 출처 + 유효일 + 테스트 + **전문가 검토 기록**. 개발 측에서 원문 대조까지는 하지만 전문가 검토는 대표님(또는 지정 검토자)만 가능. 제안: 원문 대조 완료 규칙은 `SOURCE_CHECKED`로 두고, `RULE_SOURCE_MATRIX.md`에 검토자·검토일을 기록하면 `VERIFIED`로 전환되는 구조.
- **D4 중기부 상담회사 문구**: `제2025-684호` 표기는 다른 앱과 동일하게 푸터에만, "운영사 정보"로만 표기(진단 시스템 공식성 암시 금지).
- **D5 Git**: 작업 브랜치 `claude/peaceful-gauss-qbsmc2`에 커밋·푸시까지 허용 여부. main 병합·Netlify 운영 배포는 별도 승인.

## 8. 주요 위험
| 위험 | 대응 |
|---|---|
| 연구소 편람 미접속으로 세부요건 누락 | 법령 원문 범위로만 판정, 나머지 정보형 + `NOT_VERIFIED` 보고 |
| 해외 공식 사이트 봇 차단 | 링크·`access_status` 기록, 해외는 P0 정보형 |
| 브라우저 인쇄의 페이지번호/반복 푸터 한계 | 실측 후 보고, 미달 시 P1에서 PDF 엔진 검토 |
| 카카오 OG 실측 | 운영 배포 후에만 가능 → `NOT_VERIFIED`로 분리 |
| 실사용자 관찰 테스트 | 실시 불가 → `미실시`로 보고, 테스트 계획만 제공 |
