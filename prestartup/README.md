# BECONIC 창업 준비 가이드 (09번 · 예비창업자)

- 서비스: https://beconic-diagnosis-pre-startup.netlify.app
- 성격: **진단이 아닌 준비 도구(유틸)**. 점수·등급 없이 업종별 준비 서류·진행 순서·인허가·업종코드·세금 혜택·지원사업 확인 포인트를 **기준일과 함께** 보여 주고, 체크한 진행 상황을 이 기기에 저장한다.
- 원본: Founder CodeFit Pro(컨설턴트 상담지원 도구, 2026-06-11) 업종 데이터 64종 + 국세청 업종코드 연계표 1,785행(고유 코드 1,612개)

## 기준일(화면·인쇄·요약 복사에 모두 표기)

| 항목 | 기준 | 위치 |
|---|---|---|
| 자료 기준일 | 2026-11-19 | `data.js` `meta.guideBaseDate` |
| 세제 수치 | 2026-01 법령 기준, 다음 점검 2027-01(지나면 화면에 경고) | `meta.taxBaseDate` · `meta.taxNextCheck` |
| 업종코드 | 국세청 홈택스 업종코드-KSIC 연계표(2025년 귀속) | `meta.codeBase` |

내용을 고치면 `guideBaseDate`를 바꾸고, 세제를 다시 점검하면 `taxBaseDate`·`taxNextCheck`를 함께 바꾼다.

## 구조

```text
index.html   화면 뼈대·스타일(토스 스타일 공통 팔레트)
app.js       해시 라우팅(#/ · #/g/업태 · #/guide/업종 · #/search · #/me · #/my), 체크리스트·맞춤 안내·검색·공유·인쇄
data.js      업종 64종·세제 사전·국세청 업종코드(이 파일이 원본)
sw.js        오프라인 캐시(네트워크 우선)
assets/      로고·아이콘·매니페스트·OG 이미지(scripts/render-images.mjs로 생성)
tests/qa.mjs Chromium QA 90항목
docs/        CHANGELOG · 자가부검·레드팀 보고서
```

## 화면 구성(웹·앱)

| 화면 폭 | 내비 |
|---|---|
| 1024px 이상(웹) | 상단 메뉴 3개 + 가이드 **좌측 고정 목차**(스크롤 연동·체크 개수·링크 복사/PDF) |
| 768~1023px(태블릿) | 상단 메뉴 + 목차 칩 |
| 767px 이하(앱) | **하단 탭 3개**(업종 가이드·업종코드·내 준비함) + 목차 칩 + 스크롤 후 하단 고정 '지원사업 찾기' |

홈 화면에 추가(PWA)·오프라인 열람, 카카오톡 등 앱 안 브라우저는 PDF 대신 체크리스트 요약 복사.

## 개발

```bash
npm run build                                   # dist/ 생성(공개 파일만)
(cd dist && python3 -m http.server 8795) &
node tests/qa.mjs http://127.0.0.1:8795/        # CHROME_PATH 로 브라우저 지정 가능
npm run images                                  # 아이콘·OG 다시 만들기
```

Netlify: Base directory `prestartup`, 빌드 설정은 `netlify.toml`. 입력값·체크는 브라우저 localStorage(`beconic_prestartup_v1`)에만 저장, 서버 전송 없음.
