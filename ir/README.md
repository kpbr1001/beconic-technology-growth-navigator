# BECONIC IR 진단 (ir/)

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호

- 서비스: https://beconic-diagnosis-ir.netlify.app
- 기준 문서: 07 근거기반 통합기획 v2 · 08 진단문항·출처·검증원장 · 09 글로벌투자자 PDF 보고서명세 · 10 Claude Code v2 우선 프롬프트
- 하는 일: 제출 자료의 **존재·범위·자료 간 일치** 확인, 출처가 있는 재현 가능한 계산, 미제출·확인 요청 목록, 근거 연결 보고서(PDF 2종)
- 하지 않는 일: 점수·등급·합격선, 투자 성공 확률, 밸류·성장·현금 전망, 차이 원인 추측, 회계 적정성·법적 유효성 판정

## 구조

```text
ir/
├─ index.html            # 화면 마크업·스타일(Pretendard, 토스형 UI)·인쇄(A4) 스타일·OG 메타
├─ src/
│  ├─ registry.js        # SourceRegistry(S01~S08) · QuestionRegistry(Q01~Q24) · 규칙 목록
│  ├─ engine.js          # VerificationEngine — 순수 함수, BigInt 정수 계산, 상태 2축, 지금 할 일
│  ├─ store.js           # 브라우저 저장·검토 파일 검증
│  ├─ guide.js           # 해석 가이드(GUIDE-1.0) — 확인할 항목·보완 방법·준비 방법·먼저 하면 좋은 일·섹션 정리
│  ├─ report.js          # Investor Brief · Evidence Review Report (승인 스냅샷 → HTML → 인쇄 PDF)
│  ├─ sample.js          # 합성 예시(실제 기업 자료 아님)
│  └─ app.js             # 화면·워크플로우(대표 입력 → 컨설턴트 검토 → 대표 승인 → PDF)
├─ assets/               # 방패 로고·아이콘·OG 이미지(1200×630)
├─ design/og.html        # OG 이미지 원본 → npm run images
├─ scripts/              # build(dist 복사) · render-images
├─ tests/                # 단위(엔진·원장·금지어) + E2E·PDF QA
└─ docs/                 # v2 마이그레이션 · 자가부검/레드팀 · 배포 · 변경 이력
```

## 개발·검사

```bash
cd ir
npm run build                      # dist/ 생성 (버전 일치 검사)
npm test                           # 단위 테스트(엔진·문항 원장·금지어·이스케이프)
(cd dist && python3 -m http.server 8794 --bind 127.0.0.1) &
node tests/qa.mjs http://127.0.0.1:8794/   # E2E·PDF QA (Chromium, pdftotext 필요)
npm run images                     # OG 이미지 재생성
```

데이터 흐름·권한 범위·남은 과제는 [docs/REDTEAM_2026-11-01.md](docs/REDTEAM_2026-11-01.md), 배포는 [docs/DEPLOY.md](docs/DEPLOY.md)를 보세요.
