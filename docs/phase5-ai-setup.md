# Phase 5 — Claude 진단 해석 켜는 법

결과 화면에 **'AI 해석 · Claude'** 패널을 붙이고, PDF 5쪽의 근본원인 가설과 확인 질문을 Claude 해석으로 채우는 기능입니다. v0.9.9(`interpret-v2`)부터는 같은 호출에서 **전략 대안 A·B·C의 기업 맥락 메모**와 **우선순위 영역별 맞춤 90일 실행과제**도 만들어 화면(전략 대안·90일 실행계획)과 PDF 2·9·10쪽에 반영합니다.
설정 전에도 사이트는 정상 동작합니다. 이때는 규칙 기반 해석만 표시합니다. API 키는 Netlify 서버 환경변수에만 둡니다.

## 기술 후보 찾기(v0.9.16)

3단계 '핵심기술'에서 **AI로 기술 후보 더 찾기**를 누르면 `/api/ai-discover`가 2단계 답변과 제품 설명(기업명 제외)으로 이미 가진 기술 후보를 찾습니다(같은 백그라운드 함수가 `task: 'discover'` 작업을 처리).
- 후보마다 답변 원문 구절을 인용해야 하며, 원문에 없는 인용·모르는 칸·TRL/점수 표기·기존 목록 중복은 서버가 제거합니다. 근거 있는 후보가 없으면 fallback
- 사용자가 '목록에 추가'를 눌러야 핵심기술 목록에 '추정'·'AI 추천'으로 들어가며, TRL은 사용자가 고릅니다
- 외부 처리 동의 전에는 호출하지 않습니다(동의 버튼이 3단계에도 있음). 동의해도 결과 화면 AI 해석은 결과 단계에서만 실행됩니다
- 비용: 1회 약 $0.01~0.03(입력 1천 토큰 안팎, 출력 1천 토큰 안팎 — 추정)

## 구성

```text
브라우저 ──POST /api/ai-interpret──▶ 접수 함수 ──(작업 저장: Netlify Blobs)──▶ 202 {job}
   │                                     └─▶ ai-interpret-background (백그라운드, 최대 15분)
   │                                          Rule Engine 재계산 → (선택) Supabase 원문 근거 → Claude → 가드레일 → 결과 저장
   └─ 3초마다 GET /api/ai-interpret?job=… ──▶ queued / running / 결과(ok·fallback)
  VITE_AI_INTERPRET=on 일 때만 호출, 기업명은 보내지 않음, 처리 후 입력 원문은 저장소에서 삭제
```

Claude 응답(30초~1분)이 Netlify 일반 함수 제한 시간을 넘어 504가 나서(v0.9.6 운영 확인), 백그라운드 함수로 처리합니다. 추가 설정은 없습니다(Netlify Blobs는 자동 연결).

| 단계 | 하는 일 |
|---|---|
| 입력 검증 | 형식·길이 제한(zod), 사이트 출처(운영·배포 미리보기)만 허용, 본문 60KB 제한 |
| 점수 | 브라우저가 보낸 점수는 쓰지 않고 **서버가 Rule Engine으로 다시 계산** |
| 원문 근거 | 로드맵 후보 3개의 원문 발췌를 Supabase에서 조회(설정된 경우) |
| Claude | 구조화 출력(JSON 스키마). 거절 시 서버에서 대체 모델로 자동 재시도(`fallbacks: "default"`) |
| 가드레일 | 입력에 없는 점수·TRL·품목코드·쪽 번호가 들어간 문장 제거, 로드맵 적합도 등급 제거, '확인된 사실' → '자가응답'으로 낮춤, 전략 메모는 A·B·C만·실행과제는 Rule 우선순위 영역만(순서·우선순위 Rule 값), 항목 수·길이 제한 |
| 실패 시 | `not_configured` / `fallback` → 화면은 규칙 기반 해석 그대로 |

## 설정 순서 (대표님 작업 약 5분)

1. **Anthropic Console에서 월 사용 한도 설정** — console.anthropic.com → Settings → Limits
   - 해석 1건 예상 비용은 약 0.05~0.10달러입니다(입력 약 3.5천 토큰, 출력·사고 약 2.5천~4천 토큰, Opus 5.5 기준 — 추정치. v0.9.8까지 실측 약 0.04~0.06달러에 전략 메모·실행과제 출력이 추가됨). 실제 사용량은 Netlify 함수 로그(`ai-interpret ok … usage`)로 확인하세요.
2. **Netlify 환경변수 등록** — Project configuration → Environment variables

   | 이름 | 값 | 공개 여부 |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Console에서 발급한 키 | **비밀** (Secret 체크) |
   | `VITE_AI_INTERPRET` | `on` | 화면 스위치(비밀 아님) |
   | `ANTHROPIC_MODEL` | 비우면 `claude-opus-5-5` | 서버 전용(선택) |
   | `AI_INTERPRET_EFFORT` | 비우면 `low`. `medium`·`high`는 더 깊지만 느림 | 서버 전용(선택) |

3. **재배포** — Deploys → Trigger deploy → Deploy site
4. **확인** — 샘플기업 → 결과 화면 맨 위 'AI 해석 · Claude' 패널(보통 30초~1분 뒤 표시) → PDF 인쇄 5쪽

## 문제가 생기면

먼저 결과 화면 맨 위 **'연동 상태'** 신호등을 확인하세요. 빨간 항목에 원인(키 오류·권한·사용 한도·모델 이름 등)이 표시됩니다. 서버 점검만 보려면 `/api/health`를 열면 됩니다(키 값은 표시되지 않음).

Netlify → Logs → Functions → `ai-interpret`(접수·조회), `ai-interpret-background`(Claude 처리 — `ai-interpret ok {ms, usage}`는 여기)

| 로그 | 의미 | 조치 |
|---|---|---|
| `ai-interpret ok {model, ms, usage, removed}` | 정상. `ms`가 응답 시간 | — |
| `ai-interpret 실패 auth` | 키 오류 | 키 재발급 후 등록·재배포 |
| `ai-interpret 실패 rate_limit` | 사용 한도·속도 제한 | Console 한도 확인 |
| `ai-interpret-background` 로그에 `ai-interpret 실패 timeout` / 화면이 3분 넘게 '해석 중' | Claude 응답 지연 | `AI_INTERPRET_EFFORT`를 `low`로 유지, Anthropic 상태 확인 |
| `ai-interpret 접수 실패` | 작업 저장·백그라운드 호출 실패 | 재배포 후 재시도, 계속되면 로그 캡처 |
| `ai-interpret fallback {reason}` | 거절·형식 오류 | 화면은 규칙 기반 해석으로 정상 표시 |

## 원칙

- Claude는 **해석 문장만** 씁니다. 점수·TRL·우선순위는 Rule Engine 값 그대로입니다(가드레일로 자동 대조).
- 모든 문장에 근거 유형(자가응답·원문 근거·검증 가설·권고)을 표시합니다. 외부검증 전에는 '확인된 사실'로 표기하지 않습니다.
- 로드맵 노트는 원문 근거가 있는 품목에만 쓰고, 적합도 등급은 쓰지 않습니다.
- 전략 대안의 추천안과 90일 과제의 우선순위·담당·기간은 Rule Engine 값이며, Claude는 이 기업 맥락 문장만 덧붙입니다.
- 시스템 프롬프트: `src/ai/prompt.ts`. 바꾸면 `PROMPT_VERSION`을 올립니다(보고서 부록에 기록됨).
