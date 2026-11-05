# Phase 3 — 원문 근거 검색(Hybrid RAG) 켜는 법

진단 결과의 '기술로드맵 정렬' 후보 카드 아래에 **공식 로드맵 원문 발췌(쪽 번호 포함)**를 붙이는 기능입니다.
설정 전에도 사이트는 정상 동작합니다(원문 색인 후보만 표시). 모든 비밀키는 Netlify 서버 환경변수에만 둡니다.

## 구성

```text
브라우저(결과 화면) ──POST /api/roadmap-evidence──▶ Netlify Function ──▶ Supabase(Postgres + pgvector)
   VITE_ROADMAP_EVIDENCE=on 일 때만 호출          SUPABASE_SERVICE_ROLE_KEY     roadmap_chunks 3,520개
                                                  VOYAGE_API_KEY(선택)          키워드(희소어 가중) + 의미(1024차원)
```

| 상태 | 동작 |
|---|---|
| Supabase 미설정 | 함수가 `not_configured` 응답 → 화면은 원문 색인 후보만 |
| Supabase O, Voyage 키 X | **키워드 검색만**(`keyword_only`) — 원문 발췌는 정상 표시 |
| Supabase O, Voyage 키 O | 키워드 + 의미 검색(RRF 병합) |

## 설정 순서 (대표님 작업 약 20분)

1. **Supabase 프로젝트 생성** — supabase.com → New project (리전: Seoul 권장)
2. **테이블·검색 함수 만들기** — Supabase 대시보드 → SQL Editor → `supabase/migrations/20261003000000_roadmap_kb.sql` 내용 붙여넣고 Run
3. **키 확인** — Project Settings → API: `Project URL`, `service_role`(또는 secret) 키
4. **원문 적재(1회)**
   - 키워드 검색만: Supabase 표 가져오기(CSV) 또는 로컬 `npx vite-node scripts/rag/load_kb.ts --chunks …`
   - **의미 검색(Voyage)까지: 비공개 KB 저장소의 GitHub Actions 버튼** — `beconic-roadmap-kb` → Settings → Secrets에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`VOYAGE_API_KEY` 등록 → Actions → "로드맵 원문 임베딩 적재" → `시험`(쓰기 없음) → `전체 적재`
   - 적재는 재실행해도 안전합니다(같은 문단은 갱신, 다른 KB 버전은 비활성). Voyage 사용 한도(429)는 20초·40초… 간격으로 자동 재시도합니다.
5. **Netlify 환경변수 등록** — Site configuration → Environment variables

   | 이름 | 값 | 공개 여부 |
   |---|---|---|
   | `SUPABASE_URL` | Project URL | 서버 전용 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role/secret 키 | **비밀** |
   | `EMBEDDING_PROVIDER` | `voyage` (의미 검색 쓸 때만) | 서버 전용 |
   | `VOYAGE_API_KEY` | Voyage 키 (선택) | **비밀** |
   | `VITE_ROADMAP_EVIDENCE` | `on` | 화면 스위치(비밀 아님) |

6. **재배포** — Deploys → Trigger deploy. 결과 화면 후보 카드 아래 '원문 근거'가 보이면 완료

## 원문 검색 오류 복구 (v0.9.27)

연동 상태의 '원문 근거'가 빨강일 때, 점검 문구로 원인을 구분합니다(키 값·주소는 표시하지 않음).

| 점검 문구 | 원인 | 조치 |
|---|---|---|
| DB 서버 접속 불가(ENOTFOUND 등) | Supabase 프로젝트 삭제·일시정지, 또는 `SUPABASE_URL`이 예전 주소 | 일시정지면 Supabase에서 Restore. 새 프로젝트로 옮겼으면 아래 '새 프로젝트로 옮기기' |
| 원문 검색 테이블·함수 없음(HTTP 404) | 새 프로젝트에 마이그레이션 미적용 | `supabase/migrations/20261003000000_roadmap_kb.sql` 적용 후 원문 적재 |
| DB 키 거부(HTTP 401/403) | 서버 키가 다른 프로젝트 것이거나 폐기됨 | 같은 프로젝트의 service_role(또는 sb_secret_) 키로 교체 |

**새 프로젝트로 옮기기**(2026-11 사례: 원문 DB 프로젝트가 사라지고 `beconic-core-prod`만 남음)
1. 새 프로젝트 SQL Editor에서 `supabase/migrations/` 의 `20261003000000_roadmap_kb.sql` → `20261105000000_roadmap_kb_search_path.sql` 순서로 실행(기존 테이블은 건드리지 않고 `roadmap_chunks`·검색 함수만 추가, 브라우저 키로는 읽을 수 없음).
2. Netlify 환경변수 `SUPABASE_URL`(Project URL)·`SUPABASE_SERVICE_ROLE_KEY`(서버 키)를 새 프로젝트 값으로 교체 → 재배포.
3. KB 저장소(beconic-roadmap-kb) GitHub Secrets의 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`를 같은 값으로 교체 → Actions '로드맵 원문 임베딩 적재'를 **처음부터 다시**로 실행(문단 3,520개·의미 검색 임베딩).
4. `/api/health?refresh`에서 '원문 근거'가 초록(정상)인지 확인.

원문 DB가 안 될 때도 앱은 멈추지 않습니다: 로드맵 후보는 앱에 내장된 원문 색인(품목·핵심기술·쪽 번호)으로 정상 표시되고, 화면은 '원문 근거 검색 점검 중 — 원문 쪽 번호로 확인'으로 안내하며 같은 요청을 반복하지 않습니다.

## 보안

- `roadmap_chunks`는 RLS 켜짐·정책 없음 → 브라우저(anon) 키로는 표·검색 함수 모두 거부(CI `DB · 로드맵 KB 마이그레이션`에서 검증)
- 서버 함수 오류 응답에는 키·URL을 넣지 않음, 입력 품목키 형식 검사, 품목 최대 3개·질의 600자 제한
- 번들 비밀키 검사가 `VOYAGE_API_KEY`·`api.voyageai.com` 등을 브라우저 번들에서 차단

## 원칙

- 원문 근거는 **원문 문장을 그대로 발췌**(요약·생성 없음), 인쇄 쪽·PDF 쪽을 항상 함께 표기
- 키워드 일치·의미 유사도는 '적합도 판정'이 아니므로 등급(높음/중간)을 붙이지 않음
