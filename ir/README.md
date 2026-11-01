# BECONIC IR 진단 (ir/) — v2

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호

- 서비스: https://beconic-diagnosis-ir.netlify.app
- 하는 일: 8개 영역 32문항 5점 진단 + 표준재무제표(홈택스 표준재무제표증명 PDF) 분석 → IR 준비도 점수·등급(S~D), 영역별 점수, 강점·보완점, 재무 지표, 응답↔재무 교차 확인, 2주·30일·90일 로드맵, 결과 보고서 PDF
- 점수의 의미: 대표 응답과 제출 재무제표 기반의 자가진단. 투자 유치 여부·기업가치를 판단·보장하지 않음
- 개인정보: 입력 내용과 PDF는 브라우저 안에서만 처리(서버 전송 없음, pdf.js 내장)

## 구조

```text
ir/
├─ index.html          # 화면·인쇄(A4) 스타일, OG 메타 (Pretendard 정적 글꼴)
├─ src/
│  ├─ model.js         # 8영역·32문항·5단계 행동 기준 보기·단계별 가중치·등급 구간
│  ├─ score.js         # 점수(평균×20, 단계 가중 평균)·강점·보완·로드맵·교차 확인·요약 — 순수 함수
│  ├─ fin.js           # 표준재무제표 텍스트 → 계정 추출, 지표·참고 구간, 대차 확인
│  ├─ pdfread.js       # pdf.js로 PDF → 텍스트 줄(브라우저 안)
│  ├─ charts.js        # SVG 게이지·레이더·재무 막대
│  ├─ report.js        # 결과 보고서(3쪽) HTML
│  ├─ store.js         # 브라우저 저장(v2 키, v1 기록은 보존)
│  ├─ sample.js        # 합성 예시
│  └─ app.js           # 화면: 시작 → 한 문항씩 진단 → 재무 → 결과
├─ vendor/pdfjs/       # pdfjs-dist 4.10.38(Apache-2.0) + 한국어 CMap
├─ tests/              # 단위(모델·점수·재무·표현) + E2E·PDF QA
└─ docs/
```

## 개발·검사

```bash
cd ir
npm run build
npm test
(cd dist && python3 -m http.server 8794 --bind 127.0.0.1) &
node tests/qa.mjs http://127.0.0.1:8794/
```
