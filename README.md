# BECONIC 기업 기술진단 (Technology Growth Navigator)

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호

- 서비스: https://beconic-diagnosis-tech.netlify.app
- 회사: 서울시 구로구 디지털로27길 24, 209호 · 070-4103-4177 · start@gven.kr · www.beconic.kr

## 구조

```text
index.html                  # 화면 마크업·스타일 (Vite 진입점)
src/
├─ diagnosis/               # Rule Engine — 점수·신뢰도·우선순위·TRL (순수 함수, 테스트 대상)
├─ roadmap/                 # 로드맵 참고 후보 (RAG 연결 전, 원문 검증 전 라벨)
├─ reports/                 # ReportViewModel (화면·PDF 공용 데이터)
└─ app/                     # 화면 렌더링 (v0.9 이관)
public/assets/              # 로고·OG 이미지·파비콘 (빌드 시 그대로 복사)
tests/
├─ regression/              # v0.9 원본과 판정 비교 (오라클)
├─ unit/                    # Rule Engine 원칙 테스트
└─ e2e/                     # Chromium 뷰포트·PDF 스모크
reference/                  # 기준선 원본 v0.9 (수정 금지)
docs/progress.md            # Phase별 진행 기록
IMPLEMENTATION_PLAN.md      # 전체 설계·Phase 계획
```

## 개발

```bash
npm install
npm run dev          # 로컬 개발 서버 http://localhost:8787
npm test             # 회귀 + 단위 테스트
npm run build        # 타입체크 + 빌드(dist) + 번들 비밀키 검사
npm run lint         # ESLint
npm run test:e2e     # 빌드본 E2E + v0.9 대비 사용자 플로우 (build 후 실행)
npm run test:pdf     # A4 PDF 7종 생성·페이지별 검수 (pymupdf 필요)
npm run ci           # CI와 동일한 전체 검사
```

## CI (GitHub Actions)

PR·main push마다 `.github/workflows/ci.yml`이 4개 검사를 실행합니다.

| Check | 내용 |
|---|---|
| Lint · 저장소 위생 | .env·비밀키·PDF 원본·2MB 초과 파일 차단, ESLint |
| Build | 타입체크, Vite 빌드, 번들 비밀키 검사 |
| Unit · v0.9 Regression | Rule Engine 원칙 테스트 + v0.9 원본 대비 308 시나리오 |
| E2E · 사용자 플로우 · PDF QA | 6개 화면 크기, v0.9 대비 실제 클릭 플로우, A4 PDF 7종 페이지별 검수 |

main 보호: Settings → Rules → Rulesets → main 대상 **Require status checks to pass**에 위 4개 Check 등록.

## 버전 관리

- **App 버전**: `package.json`의 `version`. 배포 단위 변경 시 올립니다. 화면 푸터·PDF 부록에 `v버전 · 업데이트 일자`로 자동 표기되며, 업데이트 일자는 빌드(배포) 시각(한국시간)입니다.
- **진단 로직 버전**: `src/diagnosis/versions.ts`(Assessment·Question·Scoring·Roadmap KB). 점수식·문항이 바뀔 때만 올립니다.

## 배포 (Netlify)

`netlify.toml`이 빌드 설정을 지정합니다(Build command `npm run build`, Publish `dist`, Node 22).
Netlify 화면에서 저장소만 연결하면 되고, 화면의 빌드 설정값보다 `netlify.toml`이 우선합니다.

## 카카오톡 공유 미리보기 갱신

카카오는 OG 정보를 캐시합니다. 이미지·문구 변경 후
https://developers.kakao.com/tool/debugger/sharing 에서 URL 입력 → **캐시 초기화**.
