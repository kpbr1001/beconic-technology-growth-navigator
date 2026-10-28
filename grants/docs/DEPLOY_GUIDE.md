# Netlify 배포 & API 세팅 완전 가이드 (따라만 하세요)

이 문서 하나로 배포부터 실시간 연동까지 끝냅니다. 순서대로만 하시면 됩니다.

---

# PART 1. API 인증키 발급 (먼저 준비)

## 1-A. 기업마당 API 키
이미 발급받은 키가 채팅·문서 등에 노출된 적이 있으면 재발급을 권장합니다:
1. https://www.bizinfo.go.kr 로그인
2. 상단 **활용정보 → 정책정보 개방**
3. 지원사업정보 API에서 **활용신청** (또는 기존 키 재발급)
4. 이메일로 받은 **crtfcKey**를 복사해 둡니다 → 이게 `BIZINFO_API_KEY`

## 1-B. K-Startup API 키 (공공데이터포털)
1. https://www.data.go.kr 회원가입/로그인
2. 검색창에 **"창업진흥원 K-Startup"** 검색 → "창업진흥원_K-Startup(사업소개,사업공고,콘텐츠 등)_조회서비스" 클릭
   (직접 링크: https://www.data.go.kr/data/15125364/openapi.do)
3. 우측 **활용신청** 클릭 → 활용목적 입력(예: "지원사업 매칭 서비스") → 신청
4. **개발계정은 보통 자동승인**(즉시). 마이페이지 → **오픈API → 인증키**에서 확인
5. ⚠️ **중요**: 공공데이터포털은 키를 2개 줍니다 —
   - **일반 인증키(Encoding)**: URL에 그대로 붙이는 용도
   - **일반 인증키(Decoding)**: 디코딩된 원본
   → 우리 코드는 자동으로 인코딩 처리하므로 **Decoding(디코딩) 키**를 쓰세요.
   (Encoding 키를 쓰면 `%2B` 같은 게 이중 인코딩돼 오류날 수 있음)
   이게 `KSTARTUP_API_KEY`

## 1-C. Claude API 키 (선택 — 정밀 자격추출용)
1. https://console.anthropic.com 로그인
2. **API Keys → Create Key** → 키 복사 (`sk-ant-...`로 시작)
   → 이게 `ANTHROPIC_API_KEY`
   ※ 기업마당 본문에서 업력·매출을 뽑을 때만 필요. 처음엔 없어도 됩니다.

---

# PART 2. Netlify 배포

Netlify 함수(서버)가 필요하고, v3.8부터는 빌드(`npm run build`)로 공개 파일만 `dist/`에 담아 배포합니다.
(v3.7까지의 '폴더 통째로 드래그' 방식은 `docs/`·서버 함수 소스가 공개 URL로 열려 더 이상 쓰지 않습니다.)

## GitHub 연동 (권장)

1. Netlify → **Add new site → Import an existing project → GitHub** → `beconic-technology-growth-navigator` 저장소 선택
   (기존 `beconic-grant-matching` 사이트라면 **Site configuration → Build & deploy → Link repository**)
2. **Base directory: `grants`** 만 입력 — 빌드 명령·공개 폴더·함수 폴더는 `grants/netlify.toml`이 지정
3. main에 병합할 때마다 자동 재배포

## 수동 배포가 꼭 필요할 때

로컬에서 `cd grants && npm run build` 후 Netlify CLI로 `netlify deploy --prod --dir=dist --functions=netlify/functions`.

---

# PART 3. 환경변수(API 키) 등록 ★핵심

배포가 끝났으면, 이제 키를 넣습니다. **코드가 아니라 Netlify 설정에만** 넣습니다.

1. Netlify 대시보드 → 해당 사이트 클릭
2. **Site configuration** → 좌측 **Environment variables**
3. **Add a variable → Add a single variable** 로 아래를 하나씩 추가:

| Key (이름) | Value (값) | 필수? |
|---|---|---|
| `BIZINFO_API_KEY` | 기업마당 crtfcKey | 권장 |
| `KSTARTUP_API_KEY` | K-Startup 디코딩 인증키 | 권장 |
| `ANTHROPIC_API_KEY` | sk-ant-... | 선택(본문 자격조건 추출) |

4. 다 넣었으면 **Deploys 탭 → Trigger deploy → Deploy site** (환경변수는 재배포해야 함수에 반영)

---

# PART 4. 작동 확인

## 4-A. 함수 상태 (브라우저 주소창)

```
https://내사이트주소/.netlify/functions/health     → 키 설정 여부(ready / not_configured)
https://내사이트주소/.netlify/functions/programs   → 실제 수집 결과
```

`programs` 응답 읽는 법:
- `"mode":"live"` + `"sourceCounts":{"bizinfo":N,"kstartup":M}` → ✅ 정상. `aliveCount`는 접수 중·예정 공고 수, `enriched`는 AI 추출 건수
- `"mode":"not_configured"` → 키 미등록(이름 오타·재배포 누락 확인)
- `"errors":{"kstartup":"..."}` → 해당 소스만 실패(나머지 소스로 동작)
- 결과는 30분 캐시됩니다. 키를 바꾼 직후에는 재배포하면 새로 수집합니다.

v3.7의 `/bizinfo`·`/kstartup`·`/ai-analysis` 주소는 쿼터·비용 보호를 위해 삭제했습니다(404가 정상).

## 4-B. 실제 화면에서
1. 사이트 접속 → 유형 선택 → 분석 실행
2. 헤더 배지 **"실시간 공고"(초록)** → 라이브 성공
3. **"DEMO 데이터"(주황)** → 함수가 데이터를 못 받아 예시 데이터로 폴백(4-A로 원인 확인)

---

# PART 5. 자주 나는 문제 (해결법)

**Q. 배지가 계속 "DEMO 데이터"예요**
→ `/health`에서 not_configured면 환경변수 이름 오타(대소문자·언더스코어) 또는 재배포 안 함. ready인데 DEMO면 `/programs`의 `errors` 확인.

**Q. kstartup이 errors에 나와요**
→ ①Decoding 키를 썼는지(Encoding 키는 이중 인코딩 오류) ②공공데이터포털 활용신청 승인 여부 ③트래픽 한도(개발계정 일 10,000회). v3.8은 30분 캐시라 정상 운영 시 한도에 닿지 않습니다.

**Q. 실시간 공고가 대부분 '조건부'·'확인 필요'예요**
→ 정상입니다. 기업마당 목록 API는 업력·매출 조건을 주지 않아 '세부 자격요건(공고문 확인)'이 남습니다. `ANTHROPIC_API_KEY`를 등록하면 본문을 분석한 공고부터 '추천'까지 올라갑니다(docs/AI_ELIGIBILITY.md).

**Q. 함수가 시간 초과(10초)로 실패해요**
→ 소스별 7초·AI 6초 제한이 있어 보통 10초 안에 끝납니다. 계속 실패하면 Netlify 함수 제한 시간을 26초로 늘리거나(Site configuration → Functions), `programs.mjs`의 `BIZINFO_MAX`를 줄입니다.

---

# 요약 체크리스트
- [ ] 기업마당 키(필요 시 재발급), K-Startup 디코딩 키 발급
- [ ] Netlify 사이트에 저장소 연결, Base directory `grants`
- [ ] 환경변수 `BIZINFO_API_KEY`, `KSTARTUP_API_KEY` 등록 (+선택 `ANTHROPIC_API_KEY`)
- [ ] Trigger deploy로 재배포
- [ ] `/health`·`/programs`로 확인
- [ ] 사이트에서 "실시간 공고" 배지 확인
