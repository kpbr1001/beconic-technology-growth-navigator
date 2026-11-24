# BECONIC BM Navigator (v5.1.1 화면 + v5.1.2 AI 프록시 잠금)

서비스 주소: https://beconic-diagnosis-business-model.netlify.app
그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호

화면은 `index.html` 하나(규칙 기반 진단, 점수 계산은 브라우저 안에서)입니다. AI 보조(컨설턴트 총평 + 심층 해석 7개 섹션)만 서버 함수를 거칩니다.

## 2026-11-24 점검: 공개 프록시 → 잠금

### 무엇이 문제였나
기존 함수(2026-09-05 드롭 배포)는 **받은 요청을 그대로 Anthropic 으로 넘기는 공개 프록시**였습니다. 출처 확인이 없고, 모델·프롬프트·tools 도 거르지 않아 주소만 알면 누구나 우리 키로 임의 요청을 보낼 수 있었습니다.

### 로그에서 확인한 이상 호출 (Netlify 요청 로그, 최근 7일)
| 시각(UTC) | 경로 | 방식 | 결과 | 호출자 |
|---|---|---|---|---|
| 11-24 04:52:36 | `/.netlify/functions/claude` | POST | 400 | `curl/8.5.0`, Referer 없음, 미국 |
| 11-24 04:52:38 | `/api/claude-stream` | POST | 400 | `curl/8.5.0`, Referer 없음, 미국 |
| 11-24 04:53:08 · 04:53:09 | `/.netlify/functions/claude` | POST ×2 | **200** | `curl/8.5.0`, Referer 없음, 미국 |
| 11-24 04:53:17 | `/api/claude-stream` | POST | **200** | `curl/8.5.0`, Referer 없음, 미국 |

- 화면 밖(curl)에서 보낸 요청이 **200(=키 사용 성공)** 으로 통과 → 공개 프록시 상태가 실제로 확인됨.
- 같은 기간 이 사이트를 거친 AI 호출은 총 10건(함수 7 · 엣지 3, GET 상태 확인 포함)뿐입니다. **Anthropic 대시보드에 이보다 훨씬 많은 사용량이 보인다면 이 사이트가 아니라 같은 키를 쓰는 다른 사이트이거나 키 자체가 새어 나간 것**이므로, 아래 "키 교체"를 바로 진행하세요.

### 잠금 (S4·M2 와 같은 방식) — `lib/guard.mjs`
두 경로(`/api/claude-stream` 엣지 함수, `/.netlify/functions/claude` 일반 함수)가 같은 잠금을 씁니다.

| 단계 | 내용 | 실패 시 |
|---|---|---|
| 1. 같은 사이트 출처 | `Origin` 헤더 필수 + 요청을 받은 바로 그 사이트 주소와 일치(운영·미리보기 주소 모두 통과). 브라우저의 `Sec-Fetch-Site` 는 `same-origin` 이어야 함. `Content-Type: application/json` 필수 | 403 |
| 2. 화면 요청 형식만 | 항목은 `model·max_tokens·system·messages` 4개뿐(tools·temperature·stream 등 추가 불가). 모델 `claude-sonnet-4-6` 고정. **시스템 프롬프트는 화면의 8개(총평 + s5·s8·s9·s11·s12·s16·s17)와 글자 단위로 같아야 함.** max_tokens 상한(총평 1536 · PSST 1280 · 나머지 1024). user 메시지 1개, `[진단 결과]` 머리말 + 화면 꼬리말, 진단 맥락 6,000자 이하·`사업단계:` 포함. 서버가 허용 항목만으로 요청을 새로 만들어 보냄 | 422 |
| 3. 사용량 한도 | 하루 전체 400회 · IP당 48회(보고서 1건 ≈ 8회). 한국 날짜 기준, Netlify Blobs `bm-ai-usage`. 형식 오류 요청은 한도를 쓰지 않음. 저장소 장애 시 열지 않고 막음 | 429 / 503 |
| 응답 정리 | Anthropic 오류 본문은 넘기지 않음(계정 정보 노출 방지). 일반 함수는 화면이 읽는 `content` 텍스트만 반환 | — |

GET(상태 확인 배지)은 Anthropic 을 부르지 않으므로 그대로 둡니다. 화면(`index.html`)은 바꾸지 않았습니다 — 브라우저에서 보내는 요청은 그대로 통과합니다(실제 Chromium 으로 확인).

> 한계: `Origin` 헤더는 curl 로도 꾸며 넣을 수 있습니다. 그래서 1단계만으로는 부족하고, **2단계(화면 프롬프트 외엔 못 씀)와 3단계(하루 상한)가 실질적인 방어선**입니다. 꾸민 요청이 통과해도 얻을 수 있는 건 "BM 컨설턴트 해석문" 뿐이고, 하루 상한을 넘을 수 없습니다.

## 환경 변수 (Netlify → Site configuration → Environment variables, 범위 Functions)
| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✓ | — | 서버 함수에서만 읽음 |
| `BECONIC_AI_DAILY_LIMIT` | | 400 | 하루 전체 호출 상한 |
| `BECONIC_AI_IP_LIMIT` | | 48 | IP당 하루 상한 |
| `BECONIC_AI_DISABLED` | | — | `true` 면 AI 즉시 차단(화면은 규칙 기반 초안으로 자동 전환) |
| `BECONIC_ALLOWED_ORIGIN` | | — | 사용자 도메인을 붙일 때만(예: `https://bm.beconic.kr`) |

## 배포
1. Netlify 사이트 `beconic-diagnosis-business-model` → Build settings → **Base directory `bm`** 로 이 저장소를 연결(또는 `bm/` 에서 `netlify deploy --prod`).
2. 배포 후 확인:
   - 화면 우측 위 배지가 "AI 연결" 인지
   - 보고서에서 "AI 총평" 생성이 되는지
   - 터미널에서 아래가 **403** 인지 (Origin 없는 외부 호출 차단)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://beconic-diagnosis-business-model.netlify.app/.netlify/functions/claude -H 'content-type: application/json' -d '{}'
```

3. **키 교체(권장)**: 공개 상태였던 기간이 있으므로 Anthropic 콘솔에서 새 키를 만들어 이 사이트 전용으로 넣고, 옛 키는 폐기. 콘솔에서 키별 월 사용 한도도 함께 설정.

## 화면 프롬프트를 고쳤을 때
서버는 화면과 글자 단위로 같은 프롬프트만 통과시키므로, `index.html` 의 프롬프트·모델을 바꾸면 반드시:

```bash
npm run sync-prompts
```

`npm test` 가 화면과 허용 목록이 다르면 실패합니다(배포 전 확인용).

## 이상 호출 점검 방법
- Netlify → Logs → Functions `claude` / Edge Functions `claude-stream` 에서 `bm-ai-blocked` 로 검색하면 차단된 호출(사유·출처·User-Agent)이 보입니다. 사유: `origin_missing`·`origin_foreign`·`cross_site`·`system_not_allowed`·`keys`·`ip_limit`·`daily_limit` 등.
- `bm-ai-upstream` 은 Anthropic 쪽 오류(429·5xx) 기록입니다.

## 구성
```text
bm/
├─ index.html                            # 화면(v5.1.1, 변경 없음)
├─ og-image.png · favicon.ico            # 운영 사이트에서 가져온 정적 파일
├─ lib/guard.mjs                          # 잠금 3단(출처·형식·한도) — 두 함수 공용
├─ lib/allowed-prompts.mjs               # 자동 생성: 화면의 시스템 프롬프트 8개·모델·max_tokens 상한
├─ scripts/sync-prompts.mjs              # index.html → 허용 목록 생성/검사
├─ netlify/functions/claude.mjs          # 비스트리밍(폴백) + 상태 확인
├─ netlify/edge-functions/claude-stream.js # 스트리밍
└─ tests/proxy.test.mjs                  # 21개: 화면 요청 통과 / 변형·외부 호출 차단 / 한도
```
