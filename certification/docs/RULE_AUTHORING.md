# 인증 규정 추가·검토·수정 방법 (운영 담당자용)

## 원칙
1. **공식 원문 없이는 판정 규칙을 만들지 않아요.** 원문을 못 구하면 제도는 정보형(`diagnosable: false`)으로 두거나, 원자 요건에 `"check": "unverified"`를 써서 항상 '확인 필요'가 되게 해요.
2. 민간 블로그·대행사 자료는 근거로 쓰지 않아요(참고만).
3. 숫자 기준(금액·비율·연수·인원)에는 반드시 `quote`(원문 문구)를 달아요. 테스트가 이 문구가 출처 발췌에 있는지, 규칙의 숫자가 문구에 있는지 확인해요.

## 1) 출처 추가 — `data/sources.json`
- `source_id`(S-로 시작), `official_url`(https), `document_identifier`(고시 번호·조항), `effective_from`, `checked_at`, `access_status`(OK/OK_IMAGE/BLOCKED/UNREACHABLE/NOT_FOUND), `excerpt_or_section_ref`(원문 발췌 — 규칙 `quote`가 여기에 그대로 있어야 함)
- 판정 근거로 쓸 수 있는 건 `access_status`가 OK 또는 OK_IMAGE인 출처뿐이에요(엔진이 차단).

## 2) 질문 추가 — `data/questions.json`
- `why_this_matters`(왜 필요한가), `evidence_examples`(어디서 확인), `unknown_allowed: true`(모름 허용), `show_when`(표시 조건식)
- 조건식 문법: `always`, `x in [a, b]`, `x has [a]`, `x == v`, `x > 0`, `scheme in [VEN]`, `and`로 연결

## 3) 규칙 추가·수정 — `data/rule_packs/*.json`
- 노드: `LEAF`(원자 요건) / `AND`(모두 충족) / `OR`(대체 경로) / `WHEN`(선행조건 — 불해당이 공식 확인되면 '해당 없음')
- 판정 함수는 `src/engine.js`의 `CHECKS` 목록에 있는 것만 써요(`yes`, `no`, `enum`, `gte`, `lt`, `years_since_gte`, `biz_age_gte` 등). 새 함수가 필요하면 엔진에 추가하고 테스트도 함께 넣어요.
- 기관 평가 단계는 `"check": "assessment", "kind": "assessment"` — 엔진은 판정하지 않아요.
- 신청 유형이 여러 개면 `pathways`를 나누고 `combine: "OR"`로 둬요(한 유형 미충족 ≠ 전체 미충족).
- 메타: `rule_version`을 올리고, `valid_from`/`valid_to`, `review_due_at`(근거 재확인 기한 — 지나면 자동 판정이 멈춰요), `last_verified_at`, `reviewer`(대표 검토자·일자)

## 4) 제도 추가 — `data/catalog.json`
- `display_group`(국내/해외 탭)과 `jurisdiction_country`·`standard_origin`·`scheme_type`·`mandatory_status`를 따로 적어요(예: 한국 기관이 인증하는 ISO도 `international`·`ISO`).
- 해외 제품 규제는 `mandatory_status: "needs_review"`로 두고 `triage`를 써요(의무 확정 금지).
- `readiness_items`(서류 체크)는 공식 제출서류 목록에서만 가져와요.

## 5) 검사·배포
```bash
cd certification
npm test                 # 스키마·출처·근거 문구·숫자 대조·엔진 회귀
node scripts/matrix.mjs  # RULE_SOURCE_MATRIX.md 갱신 → 대표 검토
npm run build && node tests/qa.mjs && node tests/pdf.mjs
```
`DATA_CHANGELOG.md`에 변경 내용을 기록한 뒤 PR을 올리면 CI가 같은 검사를 다시 해요.
