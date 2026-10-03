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
4. **원문 적재(1회, 로컬 PC에서)** — 비공개 KB 저장소를 옆에 두고:
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=<키> \
     npx vite-node scripts/rag/load_kb.ts --chunks ../beconic-roadmap-kb/kb/chunks.jsonl
   # 의미 검색까지: 앞에 EMBEDDING_PROVIDER=voyage VOYAGE_API_KEY=<키> 추가 (EMBEDDING_DIMENSIONS=1024)
   ```
   키는 명령 실행 시에만 입력하고 파일에 저장하지 않습니다. 적재는 재실행해도 안전합니다(같은 문단은 갱신, 다른 KB 버전은 비활성).
5. **Netlify 환경변수 등록** — Site configuration → Environment variables

   | 이름 | 값 | 공개 여부 |
   |---|---|---|
   | `SUPABASE_URL` | Project URL | 서버 전용 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role/secret 키 | **비밀** |
   | `EMBEDDING_PROVIDER` | `voyage` (의미 검색 쓸 때만) | 서버 전용 |
   | `VOYAGE_API_KEY` | Voyage 키 (선택) | **비밀** |
   | `VITE_ROADMAP_EVIDENCE` | `on` | 화면 스위치(비밀 아님) |

6. **재배포** — Deploys → Trigger deploy. 결과 화면 후보 카드 아래 '원문 근거'가 보이면 완료

## 보안

- `roadmap_chunks`는 RLS 켜짐·정책 없음 → 브라우저(anon) 키로는 표·검색 함수 모두 거부(CI `DB · 로드맵 KB 마이그레이션`에서 검증)
- 서버 함수 오류 응답에는 키·URL을 넣지 않음, 입력 품목키 형식 검사, 품목 최대 3개·질의 600자 제한
- 번들 비밀키 검사가 `VOYAGE_API_KEY`·`api.voyageai.com` 등을 브라우저 번들에서 차단

## 원칙

- 원문 근거는 **원문 문장을 그대로 발췌**(요약·생성 없음), 인쇄 쪽·PDF 쪽을 항상 함께 표기
- 키워드 일치·의미 유사도는 '적합도 판정'이 아니므로 등급(높음/중간)을 붙이지 않음
