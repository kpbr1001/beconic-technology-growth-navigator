# Phase 5 — Claude 진단 해석 켜는 법

결과 화면에 **'AI 해석 · Claude'** 패널을 붙이고, PDF 5쪽의 근본원인 가설과 확인 질문을 Claude 해석으로 채우는 기능입니다.
설정 전에도 사이트는 정상 동작합니다. 이때는 규칙 기반 해석만 표시합니다. API 키는 Netlify 서버 환경변수에만 둡니다.

## 구성

```text
브라우저(결과 화면) ──POST /api/ai-interpret──▶ Netlify Function ──▶ Claude API (구조화 출력)
  VITE_AI_INTERPRET=on 일 때만 호출              ANTHROPIC_API_KEY        └▶ (선택) Supabase 원문 근거
  기업명은 보내지 않음                           Rule Engine 재계산 → 가드레일 → 응답
```

| 단계 | 하는 일 |
|---|---|
| 입력 검증 | 형식·길이 제한(zod), 사이트 출처(운영·배포 미리보기)만 허용, 본문 60KB 제한 |
| 점수 | 브라우저가 보낸 점수는 쓰지 않고 **서버가 Rule Engine으로 다시 계산** |
| 원문 근거 | 로드맵 후보 3개의 원문 발췌를 Supabase에서 조회(설정된 경우) |
| Claude | 구조화 출력(JSON 스키마). 거절 시 서버에서 대체 모델로 자동 재시도(`fallbacks: "default"`) |
| 가드레일 | 입력에 없는 점수·TRL·품목코드·쪽 번호가 들어간 문장 제거, 로드맵 적합도 등급 제거, '확인된 사실' → '자가응답'으로 낮춤, 항목 수·길이 제한 |
| 실패 시 | `not_configured` / `fallback` → 화면은 규칙 기반 해석 그대로 |

## 설정 순서 (대표님 작업 약 5분)

1. **Anthropic Console에서 월 사용 한도 설정** — console.anthropic.com → Settings → Limits
   - 해석 1건 예상 비용은 약 0.03~0.08달러입니다(입력 약 3천 토큰, 출력·사고 약 1.5천~3천 토큰, Opus 5.5 기준 — 추정치). 실제 사용량은 Netlify 함수 로그(`ai-interpret ok … usage`)로 확인하세요.
2. **Netlify 환경변수 등록** — Project configuration → Environment variables

   | 이름 | 값 | 공개 여부 |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Console에서 발급한 키 | **비밀** (Secret 체크) |
   | `VITE_AI_INTERPRET` | `on` | 화면 스위치(비밀 아님) |
   | `ANTHROPIC_MODEL` | 비우면 `claude-opus-5-5` | 서버 전용(선택) |
   | `AI_INTERPRET_EFFORT` | 비우면 `low`. `medium`·`high`는 더 깊지만 느림 | 서버 전용(선택) |

3. **재배포** — Deploys → Trigger deploy → Deploy site
4. **확인** — 샘플기업 → 결과 화면 맨 위 'AI 해석 · Claude' 패널(보통 20~40초 뒤 표시) → PDF 인쇄 5쪽

## 문제가 생기면

Netlify → Logs → Functions → `ai-interpret`

| 로그 | 의미 | 조치 |
|---|---|---|
| `ai-interpret ok {model, ms, usage, removed}` | 정상. `ms`가 응답 시간 | — |
| `ai-interpret 실패 auth` | 키 오류 | 키 재발급 후 등록·재배포 |
| `ai-interpret 실패 rate_limit` | 사용 한도·속도 제한 | Console 한도 확인 |
| `ai-interpret 실패 timeout` / 화면이 계속 '해석 중' | 응답 지연 | `AI_INTERPRET_EFFORT`를 `low`로 유지. 계속되면 백그라운드 처리로 전환 예정 |
| `ai-interpret fallback {reason}` | 거절·형식 오류 | 화면은 규칙 기반 해석으로 정상 표시 |

## 원칙

- Claude는 **해석 문장만** 씁니다. 점수·TRL·우선순위는 Rule Engine 값 그대로입니다(가드레일로 자동 대조).
- 모든 문장에 근거 유형(자가응답·원문 근거·검증 가설·권고)을 표시합니다. 외부검증 전에는 '확인된 사실'로 표기하지 않습니다.
- 로드맵 노트는 원문 근거가 있는 품목에만 쓰고, 적합도 등급은 쓰지 않습니다.
- 시스템 프롬프트: `src/ai/prompt.ts`. 바꾸면 `PROMPT_VERSION`을 올립니다(보고서 부록에 기록됨).
