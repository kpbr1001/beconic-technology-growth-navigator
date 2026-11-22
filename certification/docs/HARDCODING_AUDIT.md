# 하드코딩 점검 보고서 (2026-11-22)

대상: 운영 중인 `certification/` v1 (src/*.js, index.html)
방법: 제도 ID·질문 ID·법정 숫자·연락처·URL·날짜·법령 문구·매직 넘버 grep 스캔 + 데이터 검사(tests/data.test.mjs) 우회 여부 확인

## 요약

| 등급 | 건수 | 의미 |
|---|---|---|
| **P0 판정 정확성** | 2 | 법정 기준값이 코드에 있어 출처 대조 검사(DATA-05)를 피함 |
| **P1 유지보수·일관성** | 5 | 제도·법령 문구·연락처가 코드 여러 곳에 흩어짐 |
| **P2 정리 권장** | 3 | 상수·화면 문구·버전 |

결론: 판정 엔진 대부분은 데이터(rule_packs)로 되어 있지만, **기업부설연구소 인원 기준만 코드에 박혀 있고 검사도 통과하지 않음**. 법령이 바뀌면 코드 수정 없이는 반영되지 않고, 오타가 나도 테스트가 잡지 못함.

## P0 — 판정 정확성 (즉시 수정 권장)

| # | 위치 | 내용 | 위험 | 수정안 |
|---|---|---|---|---|
| 1 | `src/engine.js:152-161` | 연구전담요원 기준 2·3·5·7·10명, 창업 3년, 중기업 전환 기준이 코드 분기문 | rule_packs/rnd.json의 `RNDI-STAFF`는 `args: {}` → DATA-05 숫자·발췌 대조가 **사실상 검사 안 됨**. 법령 개정 시 코드 수정 필요 | 기준표를 `rnd.json`의 `tables.staff_min`으로 이동, 각 행에 시행령 제6조 quote 연결, DATA-05가 표의 숫자를 발췌와 대조 |
| 2 | `src/engine.js:188` | 연구개발전담부서 예외 업종 `['software_582','info_63']` | 업종 코드 추가·변경 시 코드 수정, 출처 연결 없음 | `rnd.json` 규칙 args `industries: [...]` + quote로 이동 |

## P1 — 유지보수·일관성

| # | 위치 | 내용 | 수정안 |
|---|---|---|---|
| 3 | `src/model.js:31-34` `ongoingFor()` | 이노비즈·메인비즈·연구소·벤처 사후관리 문구와 법령 조항을 switch로 하드코딩 | `catalog.json` 각 제도에 `ongoing_note` + `source_refs` 필드 |
| 4 | `src/views.js:315`, `src/print.js:130` | `scheme_id === 'VEN'`일 때 "4개 유형 중 하나" 문구 — 화면·PDF 두 곳에 다른 문장 | `catalog.json`에 `pathway_note` 하나로 통합, 화면·PDF가 같은 문장 사용 |
| 5 | `src/recommend.js:26` | 예비창업자 제외 목록 `['INNO','MAIN','RNDI','RNDD']` | `catalog.json`에 `requires_business: true` 플래그 |
| 6 | `index.html`·`src/views.js`·`src/print.js` | 전화·메일·주소·상담회사 등록번호가 3곳 중복(전화 5회, 메일 6회) | `data/site.json` 하나로 통합, 빌드 시 index.html에 주입 |
| 7 | `src/app.js`, `index.html` | 운영 URL(canonical) 중복 | `site.json`으로 통합 |

## P2 — 정리 권장

| # | 위치 | 내용 | 수정안 |
|---|---|---|---|
| 8 | `views.js:9` MAX_SELECT=3, `app.js` 검색 60자·입력 100자, 각종 `slice(0,2~4)` | 화면 제한값 분산 | `src/config.js` 상수로 모음 |
| 9 | `views.js:478-479`, `triage.js` SPEC 안내, `search.js` PURPOSE_WORDS | "미확보 원문" 목록·안내 문구가 코드에 있음 → 데이터 변경과 따로 놀 수 있음 | 미확보 목록은 sources.json 상태(`unverified`)에서 자동 생성 |
| 10 | `index.html:79` `© 2026`, `APP_VERSION`·`ENGINE_VERSION` | 연도·버전 수동 관리 | 빌드 시 package.json 버전·현재 연도 주입 |

## 하드코딩이 아닌 것(확인 완료)
- 벤처·이노비즈·메인비즈 숫자 기준(투자 5천만원, 업력 3년, 연구개발비 비율표 등): rule_packs + quote + DATA-05 검사 적용 중 ✓
- 질문 ID를 엔진이 직접 읽는 부분(`a.founded_on` 등): 공통 질문이라 허용 범위. 다만 v2에서는 CHECKS 함수가 args로 질문 ID를 받도록 통일 권장

## 재발 방지
- 테스트 추가: `src/`에서 제도 ID 문자열(`'VEN'` 등)·연락처 패턴이 나오면 실패하는 검사(HC-01)
- 숫자 판정 함수는 `args`가 비어 있으면 실패(DATA-05 강화)
