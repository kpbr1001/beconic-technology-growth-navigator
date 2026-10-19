# BECONIC 기업 재무진단 (v1.0.0)

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호
서비스 주소: https://beconic-diagnosis-finance.netlify.app

3개년 실제 재무자료(국세청 표준재무제표증명 PDF·XLSX·CSV·붙여넣기)로 성장성·수익성·안정성·유동성·활동성과 통장 입출금 흐름을 진단하고, 수치 정의로 확인된 징후 → 원인 점검 질문 → 90일·12개월 로드맵 → A4 보고서까지 이어지는 **단일 HTML 웹앱**입니다.

## 구성

```text
finance/
├─ index.html                       # 화면 전체(CSS·JS 인라인, 프리텐다드 웹폰트)
├─ og-finance.png                   # 카카오톡·SNS 공유 이미지 1200×630
├─ vendor/                          # 필요할 때만 불러오는 파서 (같은 사이트에서 제공, CDN 미사용)
│  ├─ pdf-3.11.174.min.js / pdf.worker-3.11.174.min.js   # pdf.js (Apache-2.0)
│  └─ xlsx-0.18.5.full.min.js                             # SheetJS CE (Apache-2.0)
├─ netlify/functions/finance-insights.mjs  # AI 개선처방 서버 함수(/api/finance-insights)
├─ netlify.toml · package.json · .env.example
├─ tests/qa.mjs                     # Chromium 자동 QA(52개 항목) + A4 PDF 생성
└─ docs/  REQUIREMENTS · CHANGELOG · QA_REPORT · PRIVACY_NOTES · 마스터 프롬프트
```

## Netlify 배포

1. Netlify에서 새 사이트 → 이 저장소 연결 → **Base directory: `finance`** (나머지는 `finance/netlify.toml`이 지정).
2. 사이트 이름을 `beconic-diagnosis-finance`로 지정 → https://beconic-diagnosis-finance.netlify.app
3. 화면만 쓸 때는 환경변수가 필요 없습니다(AI 기능은 기본 꺼짐).
4. AI 개선처방을 켜려면 Site configuration → Environment variables(Scope: **Functions**)에 설정:
   `BECONIC_AI_ENABLED=true`, `ANTHROPIC_API_KEY`, `BECONIC_ACCESS_CODE`(8자 이상, 이용자에게 별도 안내), 선택 `ANTHROPIC_MODEL`(기본 `claude-opus-5-5`), `BECONIC_AI_DAILY_LIMIT`(기본 200), `BECONIC_AI_IP_LIMIT`(기본 10). Anthropic 콘솔에서도 월 사용 한도를 걸어 두세요.
5. 카카오톡 미리보기 갱신: https://developers.kakao.com/tool/debugger/sharing 에서 URL 입력 → 캐시 초기화.

## 로컬 확인·QA

```bash
cd finance && python3 -m http.server 8790      # http://127.0.0.1:8790
node tests/qa.mjs http://127.0.0.1:8790/       # 루트에서 npm ci 후 (playwright 사용)
```
