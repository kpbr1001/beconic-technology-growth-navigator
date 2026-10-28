# Netlify 배포 & API 세팅 완전 가이드 (따라만 하세요)

이 문서 하나로 배포부터 실시간 연동까지 끝냅니다. 순서대로만 하시면 됩니다.

---

# PART 1. API 인증키 발급 (먼저 준비)

## 1-A. 기업마당 API 키
대표님은 이미 발급받으셨습니다(작동 확인됨). **채팅에 노출됐으니 재발급 권장**:
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

Netlify 함수(서버)가 필요하므로 **전체 폴더**를 올려야 합니다. 방법 2가지 중 편한 걸 고르세요.

## 방법 A. 드래그앤드롭 (가장 쉬움, GitHub 불필요)

1. https://app.netlify.com 로그인 (없으면 무료 가입)
2. 상단 **Sites** 탭 → 화면 아래쪽 **"Want to deploy a new site without connecting to Git? Drag and drop your site output folder here"** 영역
3. `배포_v2.5-라이브전체` **폴더를 통째로** 그 영역에 드래그
4. 잠시 후 배포 완료 → `랜덤이름.netlify.app` 주소 생성됨
5. (선택) **Site configuration → Change site name**에서 원하는 주소로 변경
   (예: beconic-grant-matching → https://beconic-grant-matching.netlify.app)

> 드래그 방식은 함수도 함께 올라갑니다(netlify/functions 폴더 포함되어 있음).
> 코드 수정 시마다 다시 드래그하면 됩니다.

## 방법 B. GitHub 연동 (자동 배포, 추천)

1. GitHub에 새 저장소 만들고 `배포_v2.5-라이브전체` 폴더 내용을 push
2. Netlify → **Add new site → Import an existing project → GitHub**
3. 저장소 선택 → 빌드 설정은 netlify.toml이 자동 처리 → **Deploy**
4. 이후 GitHub에 push할 때마다 자동 재배포

---

# PART 3. 환경변수(API 키) 등록 ★핵심

배포가 끝났으면, 이제 키를 넣습니다. **코드가 아니라 Netlify 설정에만** 넣습니다.

1. Netlify 대시보드 → 해당 사이트 클릭
2. **Site configuration**(또는 Site settings) → 좌측 **Environment variables**
3. **Add a variable → Add a single variable** 로 아래를 하나씩 추가:

| Key (이름) | Value (값) | 필수? |
|---|---|---|
| `BIZINFO_API_KEY` | 기업마당 crtfcKey | 권장 |
| `KSTARTUP_API_KEY` | K-Startup 디코딩 인증키 | 권장 |
| `ANTHROPIC_API_KEY` | sk-ant-... | 선택 |

   - Key에 변수명(대문자 그대로), Value에 키 값을 붙여넣기
   - Scopes는 기본값(All) 그대로 두면 됩니다
4. 다 넣었으면 **재배포 필요**: **Deploys 탭 → Trigger deploy → Deploy site**
   (환경변수는 재배포해야 함수에 반영됩니다)

---

# PART 4. 작동 확인

## 4-A. 함수가 키를 읽는지 (브라우저 주소창)
아래 3개를 각각 열어봅니다 (`내사이트주소`를 실제 주소로 교체):

```
https://내사이트주소/.netlify/functions/bizinfo
https://내사이트주소/.netlify/functions/kstartup
https://내사이트주소/.netlify/functions/programs
```

- `{"status":"READY","count":50,...}` → ✅ 정상 (공고를 가져옴)
- `{"status":"NOT_CONFIGURED"}` → 키 미등록 (환경변수 이름 오타 확인 + 재배포)
- `{"status":"ERROR","message":"..."}` → 키는 있는데 호출 실패 (아래 문제해결)

`programs`는 병합 결과라 `{"mode":"live","sourceCounts":{"bizinfo":50,"kstartup":50}}` 형태로 소스별 건수를 보여줍니다.

## 4-B. 실제 화면에서
1. 사이트 접속 → 아무 유형이나 선택해 분석 실행
2. 결과 화면 상단 배지가 **"실시간 공고"(초록)** → 라이브 성공
3. **"DEMO 데이터"(주황)** → 함수가 데이터를 못 받아 mock으로 폴백된 것 (4-A로 원인 확인)

---

# PART 5. 자주 나는 문제 (해결법)

**Q. 배지가 계속 "DEMO 데이터"예요**
→ 함수 3개 URL을 직접 열어 상태 확인. NOT_CONFIGURED면 환경변수 이름 오타(대소문자, 언더스코어) 또는 재배포 안 함.

**Q. kstartup이 ERROR로 나와요**
→ 대부분 키 문제입니다. ①Decoding 키를 썼는지 확인(Encoding 키는 이중인코딩 오류). ②공공데이터포털에서 활용신청이 승인됐는지(마이페이지). ③트래픽 한도(개발계정 일 10,000회) 초과 여부.

**Q. bizinfo는 되는데 kstartup만 안 돼요 (또는 반대)**
→ 괜찮습니다. 한쪽만 있어도 그 소스로 동작합니다. 나중에 나머지 키만 채우면 됩니다.

**Q. 공고가 너무 적거나/지역이 안 맞아요**
→ K-Startup은 지역 서버필터가 부정확한 사례가 있어, 우리 코드가 클라이언트에서 다시 거릅니다. 초기엔 표시 건수를 보며 조정하면 됩니다.

**Q. AI 자격추출(정밀매칭)을 켜고 싶어요**
→ `ANTHROPIC_API_KEY` 등록 후, `app2.js` 안의 `AI_ENRICH: false` → `true`, `AI_MODE: 'mock'` → `'live'`로 바꿔 재배포. (비용 발생하니 먼저 목록 라이브부터 확인 권장)

---

# 요약 체크리스트
- [ ] 기업마당 키 재발급, K-Startup 디코딩 키 발급
- [ ] `배포_v2.5-라이브전체` 폴더 Netlify에 드래그(또는 GitHub 연동)
- [ ] 환경변수 `BIZINFO_API_KEY`, `KSTARTUP_API_KEY` 등록
- [ ] Trigger deploy로 재배포
- [ ] 함수 3개 URL로 READY 확인
- [ ] 사이트에서 "실시간 공고" 배지 확인
