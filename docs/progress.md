# 진행 기록 (progress)

## Phase 0 — Baseline & 배포 구성 (2026-09-28) ✅

**변경 파일**
- `public/index.html` — v0.9 + 그로스벤처스 헤더/푸터, 인증번호, OG 메타, PDF 발행사 표기 (v0.9.1)
- `public/assets/*` — 원본 .ai에서 추출한 방패·가로형 로고 SVG, OG 이미지(1200×630), 파비콘
- `reference/BECONIC_Technology_Growth_Navigator_v0.9.html` — 기준선 원본(수정 금지)
- `netlify.toml`, `.env.example`, `.gitignore`, `README.md`
- `IMPLEMENTATION_PLAN.md`, `data/roadmaps/manifests/roadmap_manifest.csv`(52건, 전부 미수령)

**테스트**
- Playwright(Chromium): 1440 / 900 / 375px — 가로 스크롤 없음, 콘솔 에러 0건
- 샘플기업 PDF: A4 13페이지, 표지·페이지 푸터 발행사 표기 확인

**한계**
- 로드맵 PDF 원본 미수령 → manifest checksum 공란
- 기존 로직의 D1~D3(P0) 이슈는 Phase 1에서 승인 후 수정

**다음 단계**
- 사용자 승인: IMPLEMENTATION_PLAN 11장(변경 범위)·12장(결정 항목)
- Phase 1: Vite+TS 모듈화 + v0.9 회귀 스냅샷

## Phase 1 — Code Modularization (2026-09-28) ✅

**구조 변경**
- 빌드: Vite + TypeScript 도입, Netlify `npm run build` → `dist` (netlify.toml 기준, UI 설정보다 우선)
- `src/diagnosis/` Rule Engine (순수 함수, 브라우저·서버 공용)
  - `questions.ts` 문항·척도·근거수준 (v0.9 원문 동일) · `scoring.ts` 차원·종합점수 · `confidence.ts` 신뢰도
  - `consistency.ts` 일관성 경고 · `priority.ts` Gap·P0/P1/P2 · `trl.ts` 핵심기술 TRL · `strategy.ts` 전략 3안·리스크
  - `versions.ts` 버전 태그 · `index.ts` `evaluate(input) → result`
- `src/roadmap/candidates.ts` 로드맵 참고 후보(검증 전 라벨)
- `src/reports/report-model.ts` ReportViewModel(데이터품질 지표·보고서 ID·버전·발행사)
- `src/app/legacy-ui.ts` v0.9 화면 렌더링 이관 — 판정 로직 제거, 엔진 결과만 표시
- `scripts/check-bundle-secrets.mjs` 빌드 시 비밀키 패턴 검사

**승인된 P0 수정 — 변경 전후**

| ID | v0.9 | v0.9.2 |
|---|---|---|
| D1 | 세부분야명 단어 일치로 "높음/중간" 적합도 + 출처 "2026~2028 로드맵"(페이지 없음) | "참고 후보 · 원문 검증 전", 출처 "세부분야명 · 원문 페이지 미확인", `evidenceGrade=unverified`, `page=null` |
| D2 | 응답 0개 차원 = 50점(보완 필요로 표시), 전부 모름이어도 역량 50점 | 차원 `null` = **판단 보류**, 종합점수는 응답 차원끼리 재정규화, 전부 모름 → 역량 "판단 보류" + P0 "근거확보" |
| D3 | 핵심기술 TRL 평균 1개 값(`trl`) 산출 | 평균 폐지, 기술별 TRL + 최저·최고·분포(`4~8`)만 제공 |
| 버전 | 없음 | 결과·PDF 부록에 Assessment/Question/Scoring/Roadmap KB 버전 기록 |

v0.9와 **달라지지 않는 것**(회귀 테스트로 고정): 문항·가중치·척도, 차원점수(응답 있는 경우), 신뢰도, 진단수준, Gap·우선순위, 일관성 경고, 전략 3안 점수·추천, 리스크 신호, 로드맵 후보 순서, TRL 다음 Gate.
단, 무응답 차원이 있을 때는 Gap 대상에서 빠지고(점수 50 가정 제거), 우선순위의 리스크 항목만 중립값 50을 내부 계산에 사용(화면 표시 없음). 전략 추천은 판단 보류 영역이 있으면 A(검증·안정화) 우선.

**v0.9 UI 결함 보완**: `.choice-row/.choice`(진단방식·간편/정밀 선택 버튼), `.module-head`, `.qwrap`, `.ev-card` CSS가 원본에 정의되지 않아 기본 버튼 모양으로 보이던 문제 수정.

**테스트**
- 회귀(`tests/regression/v09-parity.test.ts`): v0.9 원본 스크립트를 vm으로 실행하는 오라클과 비교 — 고정 8 + 시드 고정 난수 300 시나리오(전 차원 응답 128 · 일부 무응답 138 · 전부 무응답 42), 1,543 assertion 통과
  - 변형 검증: 가중치 0.30→0.31 변경 시 126건, P0 임계 60→61 변경 시 14건 실패로 탐지 확인
- 단위(`tests/unit/rule-engine.test.ts`): 모름≠0점, 점수·신뢰도 분리, 규모·업력 비가산, 재정규화, band 경계, 우선순위, TRL 독립, 전략 추천, 버전·재현성 — 14건 통과
- E2E(`tests/e2e/smoke.mjs`, Chromium): 375/390/430/1366/1440/1920px 가로스크롤·콘솔에러·HTTP 에러 0, 로드맵 등급 비노출, 전부 모름 흐름, A4 PDF 13섹션·버전·발행사·표지 로고
- `npm run build`: tsc + vite build + 번들 비밀키 검사 통과

**한계**
- `legacy-ui.ts`는 `@ts-nocheck`(v0.9 템플릿 그대로 이관). 타입 적용은 Phase 6 Report Renderer 재작성 때 진행
- PDF는 여전히 브라우저 인쇄 기반, 페이지 수 13 고정(Phase 6에서 Paged.js)
- 개발 의존성(vitest 내부 vite) moderate 취약점 2건 — 배포 번들에는 포함되지 않음
- 로드맵 세부분야 목록(`static-taxonomy.json`)은 원문 대조 전

**다음 단계**: Phase 2 Roadmap Ingestion — 로드맵 PDF 원본·임베딩 공급자 결정 필요

## PR #1 머지 전 최종검수 (2026-09-28)

**검수 방법**
- 플로우 동등성(`tests/e2e/flow-parity.mjs`): v0.9 원본과 신규를 390·1440px에서 **실제 클릭**으로 동일 조작(입력·예시입력·기술후보·TRL·핵심지정·정밀진단 17문항·모름 2개·근거선택·결과·PDF 인쇄·저장→새로고침 복원·초기화) 후 결과 텍스트 비교
- PDF(`tests/e2e/pdf-generate.mjs` + `pdf_qa.py`): v0.9·신규 × 샘플/전부모름/극한입력(긴 기업명·긴 기술명 12개) + 모바일 입력 후 출력, 총 7개 A4 PDF를 페이지 단위 자동검사 + 전 페이지 이미지 육안 확인

**발견·수정**
| # | 문제 | 출처 | 조치 |
|---|---|---|---|
| 1 | 1단계 입력 후 진단방식 버튼 클릭 시 기업명·로드맵 분야 등 **입력 전체 유실** → 결과가 기본값(AI) 기준으로 산출 | v0.9 원본 버그 | 버튼 클릭 전 입력 저장 |
| 2 | 1·2단계에서 상단 'PDF 인쇄' 시 방금 입력한 값 미반영 | v0.9 원본 | 인쇄 전 입력 저장 |
| 3 | 긴 기업명일 때 PDF 바닥글 2줄 넘침 | 이번 PR(발행사 문구 추가) | 문구 축약·줄바꿈 금지 |
| 4 | 전부 모름 PDF: 좁은 칸 "판단 보류"가 '판단 보/류'로 쪼개짐, "판단 보류 판단 보류" 반복 문장 | 이번 PR(D2) | '보류' 표기·안내 문장 대체 |
| 5 | 핵심기술 7개 이상이면 PDF에 6개(정렬표 4개)만 표시되고 누락 안내 없음 | v0.9 원본 | "N건 중 6건 표시" 안내 추가 |
| 6 | PDF 표 마지막 행 하단 테두리 누락 | v0.9 원본 | 테두리 추가 |
| 7 | 모바일 첫 화면 제목 '아니/라,' 단어 중간 줄바꿈 | v0.9 원본 | 한글 단어 단위 줄바꿈(keep-all) |
| 8 | 결과 막대 점수 "0"→"0/100" 표기 변경 | 이번 PR | v0.9 표기로 복원 |

**재검증**: 단위·회귀 1,557 · 스모크 E2E · 플로우 동등성 · PDF 7종(이슈 0) · 클린 클론 `npm ci && npm run build` 통과

## CI 도입 (2026-09-28)
- `.github/workflows/ci.yml`: PR·main push마다 Lint·저장소 위생 / Build / Unit·v0.9 Regression / E2E·플로우·PDF QA 4개 Check
- `eslint.config.js` (legacy-ui.ts는 Phase 6 재작성 전까지 제외), `scripts/check-repo-hygiene.mjs`
- `pdf_qa.py`: 신규 PDF에 이슈가 있으면 실패 처리(v0.9 원본은 기준선이라 제외)

## Embedding adapter·검색 fallback (2026-09-28)
- `src/rag/embedding/`: `EmbeddingProvider` 인터페이스, 비활성 공급자, Voyage HTTP 어댑터(SDK 없음), 환경변수 기반 선택(`EMBEDDING_PROVIDER`, `VOYAGE_API_KEY`)
- `src/rag/hybrid-search.ts`: Keyword + Semantic RRF 병합. 키 없음·임베딩 실패 시 `keyword_only`로 계속(사유 반환), 키워드 검색 실패만 오류
- 격리: 브라우저 앱·Rule Engine·보고서·로드맵 코드는 `src/rag` 미의존(테스트), 번들에 `api.voyageai.com`·`VOYAGE_API_KEY` 포함 시 빌드 실패
- 테스트 17건 추가(공급자 선택·Voyage 요청 형식/배치/오류 마스킹·fallback 4경로·RRF·격리) — 실제 키·네트워크 없이 실행

## v0.9.3 — 버전·업데이트 일자 표기 (2026-09-29)
- 푸터 우측(모바일은 하단)에 `v{버전} · {YYYY.MM.DD} 업데이트` 배지, PDF 부록 버전 줄에 `App v… · … 업데이트` 추가
- 버전은 `package.json`, 업데이트 일자는 **빌드(배포) 시각 한국시간**을 빌드 때 자동 주입(`vite.config.ts` → `src/build-info.ts`). 마우스를 올리면 배포 커밋 해시 표시(Netlify `COMMIT_REF`)
- 앱 버전(App)과 진단 로직 버전(Assessment/Scoring)은 별개: 화면·문구 변경은 App만 올리고, 점수식 변경 시에만 Scoring/Assessment를 올림
