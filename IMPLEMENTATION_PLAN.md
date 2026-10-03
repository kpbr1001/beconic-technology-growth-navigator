# BECONIC Technology Growth Navigator — IMPLEMENTATION_PLAN v1.0

작성일: 2026-09-28 · 기준선: `reference/BECONIC_Technology_Growth_Navigator_v0.9.html` (배포본 `public/index.html` = v0.9.1, 브랜딩만 변경)
근거 문서: `BECONIC_ClaudeCode_Implementation_Master_Prompt_v1.0.md`, `BECONIC_RAG_Upload_Manifest_v1.0.md`

> 진행 현황은 `docs/progress.md` 참고 (Phase 0·1·2 완료 — 로드맵 52건 전체 수령·파싱).
>
> 이 문서의 모든 "현황" 서술은 v0.9 소스를 직접 읽고 확인한 사실만 적었습니다. 확인하지 못한 항목은 **[미확인]** 으로 표시합니다.

---

## 0. 한 장 요약 (Executive Summary)

| 구분 | 내용 |
|---|---|
| 현재 상태 | 단일 HTML(425줄, 약 111KB) 클라이언트 전용 POC. 서버·DB·RAG·LLM 없음. 상태는 `localStorage` 1개 키. |
| 잘 된 점 | `모름`을 0점이 아닌 **결측 처리**, 기업규모·업력을 점수에 **미사용**, 역량점수와 **신뢰도(Confidence) 분리**, 근본원인을 "가능성" **가설형 문장**으로 표현, 13페이지 **별도 인쇄 레이어**(`buildPrintReport`) 보유. |
| 가장 큰 리스크 (P0) | ① 로드맵 매칭이 **세부분야 이름의 단어 일치**만으로 "높음/중간"을 표시하고 출처를 "2026~2028 중소기업 전략기술로드맵"으로 **페이지 없이** 표기 → 마스터 프롬프트 금지사항 2·3번 및 17장 위반. ② 응답이 전혀 없는 차원이 **50점으로 표시**(`avg([])=50`). ③ 핵심기술 TRL을 **평균 1개 값**으로 합산 → "핵심기술별 TRL 독립" 원칙과 충돌. |
| 목표 구조 | Rule Engine(판정) · Hybrid RAG(공식근거) · Claude API(해석·가설·계획) 3계층 분리 + Supabase 이력/재현성 + A4 Report Renderer |
| 진행 방식 | Phase 0(완료) → **Phase 1 모듈화(회귀 0건)** → 2 Ingestion → 3 RAG → 4 평가 → 5 Claude → 6 PDF → 7 재진단 |
| 지금 필요한 결정 | ① 임베딩 공급자 ② Supabase 프로젝트 ③ Anthropic API Key ④ 로드맵 PDF 전달 경로 ⑤ 프론트엔드 빌드 도입(Vite) 승인 — 12장 참조 |

---

## 1. 현재 파일 전체 분석 (Baseline Audit)

### 1.1 구성·상태관리
- 단일 파일: `<style>` 약 120줄 + 마크업 10줄 + `<script>` 약 280줄. 외부 라이브러리 **0개**, 차트는 자체 SVG(`radarSVG`) + CSS 막대.
- 전역 `state`(`fresh()`로 초기화): `step, visited, mode(quick|deep), entry, company{…}, discovery{…}, inventory[], answers{}, evidence{}, results`.
- 저장: `localStorage["beconic_tgn_v09"]` 수동 저장(`saveState`). 서버 저장·버전 기록 **없음**.
- 렌더: `render()`가 매번 6개 섹션 전체를 `innerHTML`로 재생성. 이벤트는 인라인 `onclick`.

### 1.2 사용자 흐름 (6단계, `STEPS`)
0 기업 이해 → 1 기술 발견(6개 질문) → 2 핵심기술(Inventory·TRL) → 3 핵심진단(Core 12 + 심화) → 4 근거 확인(선별 최대 6문항) → 5 통합 결과·PDF

### 1.3 문항 체계
- **Core 12** (`CORE`): 7개 차원 `tech, rd, exec, evidence, scale, strategy, risk`, 가중치 1.0~1.3, `critical` 6문항(q1,q2,q5,q6,q10,q11).
- **심화** (`DEEP`): AI/SW 4 · 제조 4 · 서비스 3 · 딥테크 4. 융합형 = AI/SW 앞 2 + 제조 앞 3. `mode==="deep"`일 때만 포함.
- 응답: 1~5 척도(차원별 행동앵커 `ANCHORS`) 또는 `null`(모름·확인필요).
- 근거수준 `EVIDENCE` 5단계, 신뢰 승수 m = .42 / .62 / .78 / .90 / 1.0. 미지정 시 0단계(.42).

### 1.4 점수 계산 (`calc`) — 현행 공식 그대로
```text
문항점수     = (응답-1)/4 × 100            # 모름은 제외(결측), 0점 아님 ✅
차원점수 m_k = Σ(점수×w)/Σw                 # 해당 차원 응답 0개면 50 ⚠️
capability   = .30tech + .18rd + .17exec + .13scale + .10strategy + .06evidence + .06risk   (합 1.00)
confidence   = (Σ(evidence.m×w)/Σw ×100)×.75 + (확정 기술 비율)×25 − 모름개수×1.2   → [10,100] 클램프
level        = confidence≥72 "근거기반 진단", ≥88 & evidence≥70 "외부검증 준비", 그 외 "잠정진단"
range        = capability ± round((100−confidence)×.18)
TRL          = critical 기술 TRL 평균(반올림), trlRange = (min−1)~(max+1)
gaps(Top5)   = ps = (100−score)×.55 + (100−risk)×.20 + (100−confidence)×.15 + (전략정렬이면 +10)
               P0 ≥60, P1 ≥42, 그 외 P2
insufficient = 응답 < 8
```
- 기업규모(`size`)·업력(`years`)은 **입력만 받고 점수에 쓰지 않음** ✅ (금지사항 5 준수)
- 일관성 검사 `checks()` 4종: 구현↑·실증↓, 모방난이도↑·기록↓, 외부의존 有·대체↓, 모름 ≥4.

### 1.5 해석·계획 로직 (모두 규칙 기반 고정문장)
- `rootCause/actionText/nextEvidence`: 차원별 사전 정의 문장 → Next Best Action과 Next Best Evidence가 **이미 분리**되어 있음 ✅
- `strategicOptions`: A 안정화 / B 제품화·Scale-up / C 차별화 3안 점수식 + 추천 규칙.
- `quarterPlan`, `detailedRoadmap`: Top gap 3개로 90일·12개월·3·5년 문장 구성 → **입력이 달라도 문장 틀이 동일**(PDF QA "복사 문장" 리스크).
- `roadmapCandidates`: 선택한 분야의 `ROADMAP_DETAIL` 세부분야명 단어가 입력 텍스트에 몇 개 포함되는지로 **높음/중간/검토 필요** 산정.

### 1.6 PDF
- `printReport()` → `buildPrintReport()`가 숨김 `#printReport`에 13개 `.pr-page` 생성 → `window.print()`.
- 화면 카드 복제가 아닌 **별도 인쇄 DOM**이라는 점은 좋음. 다만 페이지 수 `total=13` **하드코딩**, 내용이 넘치면 번호 없는 페이지가 생김. 브라우저 인쇄 대화상자 의존.
- Phase 0 실측: 샘플기업 기준 A4 13페이지 정상 출력(Chromium, 2026-09-28).

### 1.7 기술적 부채·리스크 목록

| ID | 등급 | 내용 | 근거(코드) | 조치 Phase |
|---|---|---|---|---|
| D1 | **P0** | 로드맵 적합성 "높음/중간"을 Gold Set 검증 없이 노출, 출처 페이지 없음 | `roadmapCandidates()` | 1(라벨 강등) → 3·4 |
| D2 | **P0** | 응답 0개 차원이 50점으로 표시되어 "보완 필요"처럼 보임 | `avg()` | 1 |
| D3 | **P0** | 핵심기술 TRL 평균값 1개로 요약 | `calc()` trl | 1 |
| D4 | P1 | `ROADMAP_DETAIL` 세부분야 목록이 원문 대조 전 하드코딩 **[미확인]** | 상수 | 2 |
| D5 | P1 | 버전(문항·점수식·KB) 미기록 → 재현 불가 | `state` | 1·3 |
| D6 | P1 | 우선순위식의 `전략정렬 +10` 고정 가산(근거 미기재) | `calc()` gaps | 1(문서화) |
| D7 | P1 | PDF 페이지 수 하드코딩·오버플로 미검출 | `prPage(total=13)` | 6 |
| D8 | P1 | 90일/12개월/3·5년 문장이 템플릿 고정 | `quarterPlan` | 5 |
| D9 | P2 | 전역 상태·인라인 핸들러·전체 재렌더 → 테스트 곤란 | 전반 | 1 |
| D10 | P2 | 저장이 브라우저 단일 키, 기업 간 비교·재진단 불가 | `saveState` | 3·7 |

---

## 2. 로드맵 PDF Manifest

- 파일 정의: `data/roadmaps/manifests/roadmap_manifest.csv` (이번 커밋에 초안 포함)
- **현재 저장소·세션에 PDF 원본은 0건** — Upload Manifest v1.0의 파일명 목록만 등록, `status=미수령`, `sha256` 공란.
- 구성: 2026~2028 일반 13 · 특화/확장 4 · 2025~2027 과거 35(29~33 서비스R&D는 1개 파일) = **총 52건 예정**

## 3. 중복·버전 분류 규칙

| 규칙 | 처리 |
|---|---|
| 동일 SHA-256 | 1개만 ingestion, 나머지 `duplicate_of` 기록 (이차전지 중복본 주의) |
| `version` | `2026-2028` / `2025-2027` / `2023-2027` / `2026` |
| `roadmap_type` | `general` / `specialized` / `sobujang_definition` |
| `priority_rank` (검색 충돌 시) | 1 최신 특화 → 2 2026~2028 일반 → 3 2026 소부장 정의서 → 4 2025~2027 일반 → 5 과거 특화(원전) |
| `role` | `primary`(현재 기준) / `crosswalk`(추세·변화 분석 전용) |
| 원본 보존 | `data/roadmaps/raw/{version}/{원본파일명}` — 덮어쓰기 금지, 저장소에는 커밋하지 않음(.gitignore) |

---

## 4. 목표 Architecture

```text
Browser (public/ → Vite 빌드)
  └─ fetch /api/*  ──►  Netlify Functions (API Gateway, 비밀키 보관)
                          ├─ diagnose            → Rule Engine (src/diagnosis, 브라우저와 동일 코드 공유)
                          ├─ discover-technology → Claude task 1
                          ├─ hybrid-search       → RAG Service
                          ├─ analyze-result      → Claude task 2~4
                          ├─ generate-report     → ReportViewModel + Claude task 5 → report_snapshots
                          └─ health
                                   │
                         Supabase PostgreSQL (+pgvector, FTS, Storage: 원본 PDF 비공개 버킷)
```
원칙
- **Rule Engine은 순수 함수**(입력 JSON → 결과 JSON, 버전 태그 포함). 브라우저·서버 동일 코드. Claude는 결과를 읽기만 함.
- **오프라인 우선 유지**: API 실패 시에도 v0.9와 동일하게 Rule 결과·규칙기반 보고서가 나와야 함(Graceful degradation).
- 비밀키는 Netlify 환경변수 → Functions에서만 참조. 브라우저 번들 검사(빌드 후 grep)를 CI에 포함.

## 5. DB / ERD

마스터 프롬프트 5장의 16개 테이블을 그대로 채택. 추가 컬럼만 명시합니다.

```text
organizations 1─* assessments 1─* assessment_answers
                         │ 1─* technology_inventory 1─* evidence_items
                         │ 1─* score_results
                         │ 1─* retrieval_runs, llm_runs, report_snapshots, expert_feedback
organizations 1─* reassessments (previous_assessment_id, current_assessment_id → assessments)
roadmap_documents 1─* roadmap_nodes (self parent_id) 1─* roadmap_chunks
roadmap_nodes *─* roadmap_nodes via roadmap_crosswalks
```
추가 사항
- `roadmap_documents`: `sha256 UNIQUE`, `priority_rank`, `role`, `duplicate_of`, `parse_status`
- `roadmap_nodes`·`roadmap_chunks`: `parse_confidence numeric`, `value_origin ('text'|'ocr'|'table')` — OCR 추정값과 원문값 구분
- `roadmap_chunks.fts`: `tsvector` GENERATED. 한국어는 PostgreSQL 기본 사전이 형태소 분석을 못 하므로 **`simple` 사전 + `pg_trgm`(2~3gram) 병행** 인덱스
- `roadmap_chunks.embedding vector(N)`: N은 임베딩 모델 확정 후 결정, HNSW 인덱스
- `assessments`: `assessment_version, question_version, scoring_version, roadmap_kb_version, input_snapshot jsonb`
- RLS: 기업 데이터 테이블은 기본 거부, Functions의 service-role로만 접근. 로드맵 KB는 읽기 전용.

## 6. RAG Ingestion / Search / Evaluation

**Ingestion** (`scripts/`, Python 권장 — PDF 표 추출 도구가 풍부)
1. `ingest`: 원본 목록 → SHA-256 → dedup → `roadmap_documents`
2. `parse`: PyMuPDF 텍스트+좌표, 표는 pdfplumber/camelot 비교. 페이지 번호는 **PDF 물리 페이지 + 인쇄 페이지 둘 다** 저장
3. `structure`: 전략분야 → 세부분야 → 전략품목(코드) → 핵심기술 → TRL·개발기간·목표 계층화. 불확실하면 빈 값 + `parse_confidence` (추측 금지)
4. `chunk`: 의미 단락, 10~15% overlap, 표는 행 단위 직렬화, contextual prefix(`[문서][전략분야][전략품목][핵심기술][페이지]`)
5. `embed`: `EmbeddingProvider` 어댑터(`embedText`, `embedBatch`), 모델명은 환경변수

**Embedding 정책 (2026-09-28 확정)**
- Voyage는 Phase 3 Hybrid RAG의 **1차 후보**이며 Phase 0~2에서는 필수 의존성이 아님. SDK 미설치, HTTP 어댑터만 보유
- `src/rag/embedding`: `EmbeddingProvider` 인터페이스(`embedText`/`embedBatch`) + 등록부 방식 → 공급자 교체 시 어댑터 1개 추가
- `VOYAGE_API_KEY`(서버 환경변수 전용)가 없거나 호출이 실패하면 **의미 검색만 비활성**, Keyword/FTS 검색으로 계속 응답(`mode: keyword_only` + 사유)
- 브라우저 앱·Rule Engine·보고서·로드맵 파싱은 임베딩 코드에 의존하지 않음(테스트로 고정, 번들 검사로 `api.voyageai.com`·키 이름 차단)

**Search** (`netlify/functions/hybrid-search`)
- Stage A 질의 정규화(Claude, 원문·정규화 둘 다 저장) → B FTS·trigram·벡터 병렬 + 메타필터(version, type, field, active) → C RRF(k=50, 가중치 1:1 시작) → D Top 30~50 재정렬 → Top 8 반환, UI Top 3
- 반환 필수 필드: `source_document, roadmap_version, strategic_field, strategic_item, technology, source_page, retrieval_score, matched_terms, evidence_text`
- 페이지 없는 결과는 `evidence_grade="unverified"`로 내려 UI에 "공식근거" 표기 금지
- 모든 호출 `retrieval_runs` 기록

**Reranker 선택지**: (a) Claude에게 후보 30개를 주고 순위만 매기게 하는 LLM rerank(추가 계약 불필요) (b) 전용 reranker API. → **(a)로 시작**, Gold Set 결과 보고 (b) 검토.

**Evaluation** (`scripts/evaluate-retrieval`)
- Gold Set 템플릿 `tests/fixtures/gold_set_template.csv`(Phase 4) — 최소 50건, 목표 100건
- 지표: Hit@1·Hit@3·Recall@5·MRR·NDCG@5·Citation Accuracy·Groundedness
- **통과 전까지 UI의 "높음/중간" 라벨 비노출** (Phase 1에서 우선 "참고 후보"로 강등)

## 7. Claude API Task 분리

| Task | 입력 | 출력(JSON Schema) | 금지 |
|---|---|---|---|
| 1 technology_discovery | 기업정보·Discovery 답변 | candidates[type, ownership, ambiguity], follow_up(≤3) | 점수 산정 |
| 2 interpret_assessment | Rule 결과·Confidence·RAG 근거 | interpretation, strengths, constraints, root_cause_hypotheses, confirmation_needed | 점수·TRL 변경 |
| 3 strategic_options | 2의 결과 + Rule의 3안 점수 | 3안별 suitability·actions·prerequisites·tradeoffs·evidence_needed | 추천안 임의 변경(Rule 추천 존중, 이견은 note로) |
| 4 action_plan | gaps(P0~P2) | action·rationale·owner·duration·dependency·KPI·next_evidence·next_gate | 우선순위 변경 |
| 5 report_narrative | 1~4 + ReportViewModel | 섹션별 문단(Exec~Limitations) | 근거 없는 인용 |

공통
- 모델: `ANTHROPIC_MODEL`, `ANTHROPIC_REPORT_MODEL` 환경변수. 코드 하드코딩 금지.
- 출력 강제: tool use의 `input_schema`로 JSON 구조 고정 → 서버에서 스키마 재검증(zod/ajv) → 실패 시 1회 재시도 → 그래도 실패하면 규칙기반 문장 fallback.
- 모든 문장에 `claim_type` 태그: `verified_fact | self_report | retrieved_evidence | hypothesis | recommendation` → UI·PDF에서 색/아이콘으로 구분.
- **Guardrail 사후검증**(코드): 출력에 등장한 전략품목·페이지·TRL이 입력 RAG 결과에 실제로 있는지 대조, 없으면 제거 + `llm_runs`에 위반 기록.
- 시스템 프롬프트: 마스터 프롬프트 10장 원문 채택, `src/llm/prompts/`에 버전 관리.
- 타임아웃: Netlify Functions 기본 제한을 고려해 task별 분리 호출, 보고서 Narrative는 Background Function 또는 스트리밍 검토 **[배포 플랜 확인 필요]**.

## 8. PDF Report Architecture

```text
Rule 결과 + RAG citations + Claude narrative
      └─► ReportViewModel(JSON, report_version) ──► report_snapshots 저장
                └─► A4 Renderer (HTML 템플릿 + print.css + Paged.js)
                        └─► 브라우저 "PDF 저장" / (선택) 서버 헤드리스 렌더
```
- **Paged.js 도입**: 실제 `Page X of Y`, running header(보고서명/기업명), 표 header 반복, 넘침 자동 분할 → D7 해결.
- 목차 15개 섹션(마스터 13.1) 구성. 내용 부족 시 섹션 병합(억지 15페이지 금지).
- 서버측 PDF 파일 생성(메일 첨부 등)이 필요하면 Phase 6 후반에 헤드리스 Chromium 별도 서비스 검토 — Netlify Function 용량 제한 때문에 **기본안은 클라이언트 렌더**.
- 발행사 블록(그로스벤처스·인증번호 제2025-684호)은 v0.9.1에서 반영 완료, ViewModel 필드로 이관.

## 9. Phase별 구현계획

| Phase | 산출물 | 완료 기준 |
|---|---|---|
| **0 Baseline** ✅ | 배포 구성, 브랜딩, 이 문서, manifest 초안 | 완료 |
| **1 모듈화** ✅ | Vite+TS, `src/diagnosis/{questions,scoring,confidence,consistency,priority,versions}.ts`, `src/reports/report-model.ts`, v0.9 회귀 스냅샷 테스트 | 동일 입력 → v0.9와 **수치 동일**(D2·D3 수정분 제외, 변경 내역 문서화). D1 라벨 강등 |
| **2 Ingestion** ✅ 52/52 | scripts 5종, manifest 확정(checksum), parsed JSON | 13+4 문서 파싱, 페이지 보존율 100%, parse_confidence 기록 |
| **3 Hybrid RAG** | Supabase migration, hybrid-search 함수, retrieval log | FTS+벡터+메타필터+RRF+rerank 동작, source/page 100% |
| **4 평가** | Gold Set ≥50, evaluate 스크립트, 결과 리포트 | 목표치 합의 후 통과 시 UI 라벨 복원 |
| **5 Claude** | 5개 task, schema, guardrail, fallback | 스키마 준수 100%, 점수 변경 0건, 날조 인용 0건(자동검사) |
| **6 PDF** | ReportViewModel, Paged.js 렌더러, PDF QA 체크리스트 | 마스터 13.4 항목 전수 통과 |
| **7 재진단** | reassessments, delta 뷰, expert_feedback | 90일 후 재진단 비교 보고서 |

## 10. 테스트·QA 계획

- **Unit (Vitest)**: scoring·unknown·confidence·priority·TRL·metadata filter·RRF·citation object·report view model
- **회귀 스냅샷**: v0.9 원본 함수를 그대로 실행한 결과를 fixture로 고정 — 샘플기업 / 전부 모름 / 전부 5점 / 전부 1점 / 핵심기술 TRL 미입력 / 근거 최고등급
- **Integration**: diagnosis→RAG→Claude→report JSON, RAG 실패 시 `insufficient_evidence`, Claude 타임아웃 시 fallback, Rule 결과 불변
- **E2E (Playwright)**: AI/SW·제조·서비스·자료없는 대표·Evidence 많은 기업 × 375/390/430/1366/1440/1920px, 콘솔 에러 0, PDF A4
- **Red Team**(마스터 15장): 사용자 7 · RAG 7 · Claude 6 · PDF 6 시나리오를 `tests/redteam/`에 케이스화
- **보안**: 빌드 산출물에서 키 패턴 grep, Functions 입력 검증, rate limit

## 11. 이번 Phase 1에서 바꾸는 것 / 안 바꾸는 것

바꾸는 것(사전 승인 요청)
1. D2: 응답 0개 차원은 점수 대신 `null`(표시 "판단 보류")로, capability 가중치는 **응답 있는 차원끼리 재정규화**
2. D3: TRL은 기술별 개별 표시, 요약에는 "최저 핵심기술 TRL"과 분포만 표기(평균 폐지)
3. D1: 로드맵 매칭 라벨 "높음/중간" → "참고 후보(검증 전)", 출처 문구에 "페이지 미확인" 표기
4. 모든 결과 JSON에 `question_version/scoring_version` 기록

안 바꾸는 것
- 문항 문구·가중치·척도·흐름·화면 디자인, 전략 3안 공식, 근거수준 승수 (전문가 검증 전 임의 조정 금지)

## 12. 사용자 결정·준비 필요 항목

| # | 항목 | 권장안 | 비고 |
|---|---|---|---|
| 1 | 임베딩 공급자 | **Voyage `voyage-4`(1024차원) 1차 후보**, Phase 3에서 Gold Set으로 대안 비교 | 키는 Phase 3부터, 서버 환경변수에만 |
| 2 | Supabase | 신규 프로젝트(서울 리전) + pgvector 활성화 | URL·anon·service-role 키 |
| 3 | Anthropic API Key | Console 발급, 월 사용 한도 설정 | Netlify 환경변수에만 등록 |
| 4 | 로드맵 PDF 전달 | Supabase Storage 비공개 버킷 업로드 또는 세션에 분할 업로드 | 저장소 커밋 X (용량·배포 무게) |
| 5 | 빌드 도입 | Vite + TypeScript (Netlify build 1줄 변경) | 승인 시 `netlify.toml` publish → `dist` |
| 6 | 전문가 Gold Set | 대표님 또는 내부 컨설턴트가 정답 라벨링 50건 | Phase 4 |
