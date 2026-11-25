# BECONIC | 기업인증 준비도 진단

우리 회사에 필요한 국내·해외 인증·확인·규제 절차를 찾고, 무엇이 부족하며 무엇부터 준비할지 알려 주는 근거 기반 도구예요.
운영: 그로스벤처스 주식회사 · 사이트: https://beconic-diagnosis-certification.netlify.app

- 계산은 모두 브라우저 안에서 해요. 입력값을 서버나 브라우저 저장소에 남기지 않아요. 외부 CDN·애널리틱스도 쓰지 않아요.
- 자동 판정은 **공식 원문과 대조한 요건만** 해요. 확인 못 한 요건은 '확인 필요'로 표시해요.
- 결과는 4가지예요: `기본요건 확인`(입력 기준 · 기관 평가 필요) / `기본요건 미충족` / `추가 확인 필요` / `해당 없음`. 정보형 제도는 `판정 범위 밖`으로 표시해요.

## 폴더

```text
index.html            정적 head(OG·카카오) + 앱 셸
netlify.toml          Base directory=certification, publish=dist, CSP(self 전용)
assets/               공식 로고(.ai 원본 추출 PNG), 방패 심볼, 파비콘, OG 이미지
fonts/pretendard/     Pretendard 가변 글꼴 동적 서브셋(OFL-1.1, LICENSE.txt 포함)
data/                 catalog.json(제도 22) · sources.json(공식 출처 28) · questions.json · rule_packs/*.json
schemas/              JSON Schema(출처·제도·규칙·질문)
src/
  engine.js           4값 판정 엔진(AND/OR/WHEN), 규칙팩 게이트, 판정 함수 화이트리스트
  readiness.js        준비항목·증빙 상태(자가응답 → '있음(자가응답)'까지만)
  recommend.js        관련성 3단계(확률 아님) · search.js 검색 · triage.js 해외 규제 트리아지
  model.js            화면·PDF 공용 보고서 뷰모델, 실행계획
  views.js / app.js   화면·라우팅·입력 · print.js/print.css 인쇄 보고서 · styles.css
tests/                rules.test.mjs · data.test.mjs(단위) · qa.mjs(E2E) · pdf.mjs(PDF 8종)
scripts/              build.mjs · matrix.mjs(RULE_SOURCE_MATRIX 생성)
docs/                 RULE_AUTHORING.md(규정 추가·수정 방법) · qa/(PDF·모바일 샘플 이미지)
PLAN.md · QA_REPORT.md · QA_PDF_REPORT.md · RULE_SOURCE_MATRIX.md · DATA_CHANGELOG.md
```

## 실행·검사

```bash
cd certification
npm test                         # 엔진·데이터 단위 테스트(52)
npm run build                    # dist/ 생성
npm run serve                    # http://127.0.0.1:8797
node tests/qa.mjs                # E2E(38) — 저장소 루트에서 npm ci 후(playwright)
node tests/pdf.mjs               # PDF 8종 — poppler-utils(pdfinfo·pdftotext·pdffonts·pdftoppm) 필요
node scripts/matrix.mjs          # 규칙–근거 대조표 갱신
```

CI: `scripts/ci/app-qa.sh certification`(단위 → 빌드 → E2E → PDF). PR에서 `certification/` 폴더가 바뀌면 실행돼요.

## 배포(Netlify)

Netlify 사이트 `beconic-diagnosis-certification`에서 **Base directory = `certification`** 으로 설정하세요. 이 폴더의 `netlify.toml`이 빌드(`npm run build`, publish `dist`)와 보안 헤더를 지정해요.
배포 뒤에는 https://developers.kakao.com/tool/debugger/sharing 에서 URL을 넣고 **캐시 초기화**를 해 주세요.

## 문의

그로스벤처스 주식회사 · 서울특별시 구로구 디지털로27길 24, 209호 · 02-6124-5960 · start@gven.kr · www.beconic.kr
