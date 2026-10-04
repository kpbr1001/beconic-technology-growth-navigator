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
├─ roadmap/                 # 로드맵 파서·공개 색인 테스트 (Python)
└─ e2e/                     # Chromium 뷰포트·PDF 스모크
reference/                  # 기준선 원본 v0.9 (수정 금지)
docs/progress.md            # Phase별 진행 기록
IMPLEMENTATION_PLAN.md      # 전체 설계·Phase 계획
scripts/roadmap/            # 로드맵 PDF 파서(형식 4종 자동 판별)·KB 빌더 (원본 PDF는 비공개 저장소)
data/roadmaps/              # manifest·공개 색인(이름·코드·TRL·쪽)·2025→2026 대조표
```

## 개발

```bash
npm install
npm run dev          # 로컬 개발 서버 http://localhost:8787
npm test             # 회귀 + 단위 테스트
npm run test:roadmap # 로드맵 파서·색인 테스트 (python3)
npm run build        # 타입체크 + 빌드(dist) + 번들 비밀키 검사
npm run lint         # ESLint
npm run test:e2e     # 빌드본 E2E + v0.9 대비 사용자 플로우 (build 후 실행)
npm run test:pdf     # A4 PDF 7종 생성·페이지별 검수 (pymupdf 필요)
npm run ci           # CI와 동일한 전체 검사
```

## 로드맵 KB 갱신

원본 PDF·원문 문장은 비공개 저장소 `kpbr1001/beconic-roadmap-kb`에만 둡니다(`pip install pymupdf`).

```bash
python3 scripts/roadmap/parse_roadmap.py ../beconic-roadmap-kb/*.pdf --out ../beconic-roadmap-kb/parsed
python3 scripts/roadmap/build_kb.py ../beconic-roadmap-kb/parsed \
  --chunks ../beconic-roadmap-kb/kb/chunks.jsonl --index-dir data/roadmaps/index
npm run test:roadmap
```

## 원문 근거 검색(Phase 3)

Supabase·Voyage 설정 방법은 [docs/phase3-rag-setup.md](docs/phase3-rag-setup.md). 설정 전에도 앱은 원문 색인 후보로 정상 동작합니다.

## Claude 진단 해석(Phase 5)

Anthropic API 키 설정 방법은 [docs/phase5-ai-setup.md](docs/phase5-ai-setup.md). 설정 전에도 앱은 규칙 기반 해석으로 정상 동작합니다.

## 재진단 비교(Phase 7)

결과 화면 '진단 기록 · 재진단'에서 이번 진단을 기록으로 저장하거나 파일(JSON)로 내보낸 뒤, 90일 후 '재진단 시작'으로 같은 입력을 불러와 바뀐 항목만 수정하면 기준 진단 대비 변화(영역·신뢰도·TRL·P0 이행·리스크)를 화면과 PDF(비교 쪽 1개 추가)로 보여 줍니다. 기록은 브라우저와 내려받은 파일에만 저장되며 서버로 보내지 않습니다. 비교 로직: `src/diagnosis/delta.ts`.

## CI (GitHub Actions)

PR·main push마다 `.github/workflows/ci.yml`이 4개 검사를 실행합니다.

| Check | 내용 |
|---|---|
| Lint · 저장소 위생 | .env·비밀키·PDF 원본·2MB 초과 파일 차단, ESLint |
| Build | 타입체크, Vite 빌드, 번들 비밀키 검사 |
| Unit · v0.9 Regression | Rule Engine 원칙 테스트 + v0.9 원본 대비 308 시나리오 + 로드맵 파서·색인 |
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
