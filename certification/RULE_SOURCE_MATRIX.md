# 규칙–공식 근거 대조표 (RULE_SOURCE_MATRIX)

> 자동 생성: `node scripts/matrix.mjs` · 데이터 2026.11.22-1 · 출처 2026.11.22-1

검토 방법: 각 행의 **근거 문구**가 **출처 원문**에 있는지, 판정 함수·기준이 원문과 같은지 확인합니다. 숫자 기준 문구는 `tests/data.test.mjs` DATA-05가 출처 발췌와 자동 대조합니다(숫자 변조 시 실패).

검토 상태: 공식 원문 대조 = 개발 시점 완료 · 법률 전문가 검토 = 제외(요청에 따라) · **운영사 대표 검토 = 대기** (규칙팩 `reviewer` 칸에 기록)

## 벤처기업확인 — RP-VEN v2026.11.22-1

- 상태 VERIFIED · 적용 2026-11-22~ · 근거 재확인 기한 2027-05-22 · 경로 결합 OR
- 근거: 공식 원문 대조 완료(벤처확인시스템 유형별 안내·별표). 전문가 검토 절차 제외 — 운영사 대표 검토 대상
- 대표 검토: □ 미기재

| 경로 | 요건 ID | 요건 | 판정 함수·기준 | 근거 문구 | 출처 | 접속 |
|---|---|---|---|---|---|---|
| 벤처투자유형 | VEN-INV-OPERATING | 사업자등록 완료 | enum {"q":"biz_status","pass":["individual","corporation"],"fail":["pre"]} | - | [벤처확인 유형별 안내 — 벤처투자유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=A)<br>[벤처확인 유형별 안내 — 예비벤처유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=D) | OK, OK |
| 벤처투자유형 | VEN-SME | 「중소기업기본법」 제2조 중소기업 | yes {"q":"is_sme"} | - | [벤처확인 유형별 안내 — 벤처투자유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=A) | OK |
| 벤처투자유형 | VEN-EXCL | 벤처 제외 업종(시행령 별표 1)이 아님 | no {"q":"ven_excluded_industry"} | 카지노 운영업(91242) | [벤처기업육성에 관한 특별법 시행령 [별표 1] 벤처기업에 포함되지 않는 업종 (벤처확인시스템 게시 이미지)](https://www.smes.go.kr/venturein/resources/images/sub/ventureRestricted11thIndustry.jpg) | OK_IMAGE |
| 벤처투자유형 | VEN-INV-AMT | 적격투자기관 투자금 합계 5천만원 이상 | gte {"q":"ven_invest_total","min":5000,"unit":"만원"} | 투자금액 합계 5천만원 이상 | [벤처확인 유형별 안내 — 벤처투자유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=A) | OK |
| 벤처투자유형 | VEN-INV-RATIO | 자본금 중 투자금 비율 10% 이상(문화산업 제작자 법인 7%) | venture_invest_ratio {"invest":"ven_invest_total","ratio_q":"ven_invest_ratio","capital":"ven_capital","culture":"ven_culture_producer","pct":10,"pct_culture":7} | 투자금액 합계 비율 10% 이상(문화산업진흥 기본법 제2조제12호 제작자 중 법인은 7% 이상) | [벤처확인 유형별 안내 — 벤처투자유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=A) | OK |
| 벤처투자유형 | VEN-INV-QUAL | 투자자가 적격투자기관 | yes {"q":"ven_qualified_investor"} | - | [벤처확인 유형별 안내 — 벤처투자유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=A) | OK |
| 벤처투자유형 | VEN-INV-REVIEW | 전문평가기관 요건검증(한국벤처캐피탈협회) | 기관 평가(판정 안 함) | - | [벤처확인 유형별 안내 — 벤처투자유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=A) | OK |
| 연구개발유형 | VEN-RD-OPERATING | 사업자등록 완료 | enum {"q":"biz_status","pass":["individual","corporation"],"fail":["pre"]} | - | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B)<br>[벤처확인 유형별 안내 — 예비벤처유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=D) | OK, OK |
| 연구개발유형 | VEN-SME | 「중소기업기본법」 제2조 중소기업 | yes {"q":"is_sme"} | - | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B) | OK |
| 연구개발유형 | VEN-EXCL | 벤처 제외 업종(시행령 별표 1)이 아님 | no {"q":"ven_excluded_industry"} | 카지노 운영업(91242) | [벤처기업육성에 관한 특별법 시행령 [별표 1] 벤처기업에 포함되지 않는 업종 (벤처확인시스템 게시 이미지)](https://www.smes.go.kr/venturein/resources/images/sub/ventureRestricted11thIndustry.jpg) | OK_IMAGE |
| 연구개발유형 | VEN-RD-UNIT | 기업부설연구소·연구개발전담부서 등 연구조직 1개 이상 보유 | enum {"q":"rnd_unit","pass":["institute","dept","creative"],"fail":["none"]} | - | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B) | OK |
| 연구개발유형 | VEN-RD-AMT | 직전 4개 분기 연구개발비 5천만원 이상 | gte {"q":"ven_rd_spend","min":5000,"unit":"만원"} | 직전 4개 분기 연구개발비 5천만원 이상 | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B) | OK |
| 연구개발유형 | VEN-RD-AGE3 | 창업 후 3년 경과 | years_since_gte {"q":"founded_on","years":3} | 창업 3년 미만은 비율 미적용 | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B) | OK |
| 연구개발유형 | VEN-RD-RATIO | 같은 기간 매출액 대비 연구개발비 비율(업종·매출 규모별 5~10%) 이상 | venture_rd_ratio {"spend":"ven_rd_spend","ratio_q":"ven_rd_ratio","revenue":"ven_revenue","industry":"industry"} | 5% 이상(업종별 기준) | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B)<br>[업종별 연구개발투자비율 (연구개발유형 '업종별 기준 확인' 게시 이미지)](https://www.smes.go.kr/venturein/resources/images/sub/09rd_type.png) | OK, OK_IMAGE |
| 연구개발유형 | VEN-RD-REVIEW | 벤처기업확인기관의 '사업의 성장성' 평가 | 기관 평가(판정 안 함) | - | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B) | OK |
| 혁신성장유형 | VEN-GROWTH-OPERATING | 사업자등록 완료 | enum {"q":"biz_status","pass":["individual","corporation"],"fail":["pre"]} | - | [벤처확인 유형별 안내 — 혁신성장유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=C)<br>[벤처확인 유형별 안내 — 예비벤처유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=D) | OK, OK |
| 혁신성장유형 | VEN-SME | 「중소기업기본법」 제2조 중소기업 | yes {"q":"is_sme"} | - | [벤처확인 유형별 안내 — 혁신성장유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=C) | OK |
| 혁신성장유형 | VEN-EXCL | 벤처 제외 업종(시행령 별표 1)이 아님 | no {"q":"ven_excluded_industry"} | 카지노 운영업(91242) | [벤처기업육성에 관한 특별법 시행령 [별표 1] 벤처기업에 포함되지 않는 업종 (벤처확인시스템 게시 이미지)](https://www.smes.go.kr/venturein/resources/images/sub/ventureRestricted11thIndustry.jpg) | OK_IMAGE |
| 혁신성장유형 | VEN-GROWTH-REVIEW | 벤처기업확인기관의 '기술의 혁신성·사업의 성장성' 평가 | 기관 평가(판정 안 함) | - | [벤처확인 유형별 안내 — 혁신성장유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=C) | OK |
| 예비벤처유형 | VEN-PRE-STATUS | 법인 또는 개인사업자 등록을 준비 중 | enum {"q":"biz_status","pass":["pre"],"fail":["individual","corporation"]} | - | [벤처확인 유형별 안내 — 예비벤처유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=D) | OK |
| 예비벤처유형 | VEN-EXCL | 벤처 제외 업종(시행령 별표 1)이 아님 | no {"q":"ven_excluded_industry"} | 카지노 운영업(91242) | [벤처기업육성에 관한 특별법 시행령 [별표 1] 벤처기업에 포함되지 않는 업종 (벤처확인시스템 게시 이미지)](https://www.smes.go.kr/venturein/resources/images/sub/ventureRestricted11thIndustry.jpg)<br>[벤처확인 유형별 안내 — 예비벤처유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=D) | OK_IMAGE, OK |
| 예비벤처유형 | VEN-PRE-REVIEW | 벤처기업확인기관의 '기술의 혁신성·사업의 성장성' 평가 | 기관 평가(판정 안 함) | - | [벤처확인 유형별 안내 — 예비벤처유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=D) | OK |

## 이노비즈(기술혁신형 중소기업) — RP-INNO v2026.11.22-1

- 상태 VERIFIED · 적용 2026-06-22~ · 근거 재확인 기한 2027-05-22 · 경로 결합 OR
- 근거: 공식 원문 대조 완료(이노비즈 제도 운영규정 고시 제2026-44호). 전문가 검토 절차 제외 — 운영사 대표 검토 대상
- 대표 검토: □ 미기재

| 경로 | 요건 ID | 요건 | 판정 함수·기준 | 근거 문구 | 출처 | 접속 |
|---|---|---|---|---|---|---|
| 신규 신청 | INNO-OPERATING | 사업자등록 완료 | enum {"q":"biz_status","pass":["individual","corporation"],"fail":["pre"]} | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-SME | 「중소기업기본법」 제2조 중소기업 | yes {"q":"is_sme"} | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-AGE | 업력 3년 이상(휴업기간 제외) | biz_age_gte {"years":3,"conversion":true,"suspension":true} | 업력 3년 이상 | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-X-CREDIT | 체납정보 등 신용정보 등록 기업이 아님 | no {"q":"x_credit"} | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-X-DISHONOR | 어음교환소 거래정지처분 기업이 아님 | no {"q":"x_dishonor"} | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-X-INSOLV | 파산·회생·청산 절차 중이 아님(회생인가 후 정상이행 예외) | enum {"q":"x_insolvency","pass":["none","rehab_ok"],"fail":["yes"]} | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-X-VIOL | 최근 3년 법령위반 공표·처분(4종) 해당 없음 | no {"q":"x_violation"} | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-X-INDUSTRY | 운영규정 별표 2 업종(신청 불가 업종)이 아님 | 미검증 → 항상 확인 필요 | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | OK |
| 신규 신청 | INNO-SELF | 온라인 자가진단 650점 이상(운영규정 제7조②) | 기관 평가(판정 안 함) | - | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf)<br>[이노비즈 제도소개 · 신규신청 안내](https://www.innobiz.net/authen/authen1.asp) | OK, OK |
| 신규 신청 | INNO-FIELD | 기술보증기금 현장평가(기술혁신시스템 700점 이상·개별기술수준 B등급 이상) | 기관 평가(판정 안 함) | - | [이노비즈 제도소개 · 신규신청 안내](https://www.innobiz.net/authen/authen1.asp) | OK |

## 메인비즈(경영혁신형 중소기업) — RP-MAIN v2026.11.22-1

- 상태 VERIFIED · 적용 2026-11-22~ · 근거 재확인 기한 2027-05-22 · 경로 결합 OR
- 근거: 공식 안내 화면 원문 대조 완료(메인비즈 인증시스템 제도 안내 — 운영규정 인용). 전문가 검토 절차 제외 — 운영사 대표 검토 대상
- 대표 검토: □ 미기재

| 경로 | 요건 ID | 요건 | 판정 함수·기준 | 근거 문구 | 출처 | 접속 |
|---|---|---|---|---|---|---|
| 신규 신청 | MAIN-OPERATING | 사업자등록 완료 | enum {"q":"biz_status","pass":["individual","corporation"],"fail":["pre"]} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-SME | 「중소기업기본법」 제2조제1항 중소기업 | yes {"q":"is_sme"} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-AGE | 업력 3년 이상 | biz_age_gte {"years":3,"conversion":true,"suspension":false} | 업력 3년 이상 | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-EXCL | 평가 제외 업종이 아님 | no {"q":"main_excluded_industry"} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-X-CREDIT | 체납정보 등 신용정보 등록 기업이 아님 | no {"q":"x_credit"} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-X-DISHONOR | 어음교환소 거래정지처분 기업이 아님 | no {"q":"x_dishonor"} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-X-INSOLV | 파산·회생·청산 절차 중이 아님(회생인가 후 정상이행 예외) | enum {"q":"x_insolvency","pass":["none","rehab_ok"],"fail":["yes"]} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-X-DEBT | 직전 사업연도 말 부채비율 1,000% 미만 | lt {"q":"main_debt_ratio","max":1000,"unit":"%"} | 부채비율 1,000% 이상 | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-X-IMPAIRED | 직전 사업연도 말 완전자본잠식이 아님 | no {"q":"main_capital_impaired"} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-X-VIOL | 최근 3년 법령위반 공표·처분(4종) 해당 없음 | no {"q":"x_violation"} | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-SELF | 1차 온라인 자가진단 600점 이상 | 기관 평가(판정 안 함) | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |
| 신규 신청 | MAIN-FIELD | 2차 현장평가 700점 이상 | 기관 평가(판정 안 함) | - | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | OK |

## 기업부설연구소 — RP-RNDI v2026.11.22-1

- 상태 VERIFIED · 적용 2026-02-01~ · 근거 재확인 기한 2027-05-22 · 경로 결합 OR
- 근거: 공식 원문 대조 완료(「기업부설연구소등의 연구개발 지원에 관한 법률」 시행령 제2조·제6조, 시행규칙 제2조, 2026.2.1. 시행). 한국산업기술진흥협회 2026 업무편람은 접속 불가로 미반영. 전문가 검토 절차 제외 — 운영사 대표 검토 대상
- 대표 검토: □ 미기재

| 경로 | 요건 ID | 요건 | 판정 함수·기준 | 근거 문구 | 출처 | 접속 |
|---|---|---|---|---|---|---|
| 국내 기업부설연구소 인정 | RNDI-OPERATING | 사업자등록 완료 | enum {"q":"biz_status","pass":["individual","corporation"],"fail":["pre"]} | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행령](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EB%A0%B9) | OK |
| 국내 기업부설연구소 인정 | RNDI-STAFF | 연구전담요원 상시 확보(기업 규모별 2~10명) | rnd_institute_staff {"q":"rnd_researchers","unit":"명","staff":{"small":3,"startup_years":3,"small_startup":2,"medium":5,"transition_years":1,"medium_transition":3,"venture_or_founder":2,"midsize":7,"large":10}} | 소기업 3명(창업일부터 3년까지 2명), 중기업 5명(소기업→중기업 1년까지 3명), 연구원·교원 창업 연구개발형 중소기업 또는 벤처기업 2명, 중견기업 7명, 그 밖 10명 | [기업부설연구소등의 연구개발 지원에 관한 법률 시행령](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EB%A0%B9)<br>[기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | OK, OK |
| 국내 기업부설연구소 인정 | RNDI-FIELD | 유흥 등 관련 분야(시행령 별표 1)가 아닌 연구개발활동 | no {"q":"rnd_excluded_field"} | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행령](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EB%A0%B9) | OK |
| 국내 기업부설연구소 인정 | RNDI-SPACE | 연구공간 기준(독립 공간 또는 인정되는 예외) | rnd_space {"unit":"institute"} | 50㎡ 초과 면적을 확보할 수 없는 경우 칸막이 구분 인정 | [기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | OK |
| 국내 기업부설연구소 인정 | RNDI-EQUIP | 연구 기자재가 연구공간 안에 있음 | yes {"q":"rnd_equipment"} | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | OK |
| 국내 기업부설연구소 인정 | RNDI-FILE | 한국산업기술진흥협회 인정 신청·검토 | 기관 평가(판정 안 함) | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | OK |

## 연구개발전담부서 — RP-RNDD v2026.11.22-1

- 상태 VERIFIED · 적용 2026-02-01~ · 근거 재확인 기한 2027-05-22 · 경로 결합 OR
- 근거: 공식 원문 대조 완료(시행령 제6조제1항제1호사목, 시행규칙 제2조). 전문가 검토 절차 제외 — 운영사 대표 검토 대상
- 대표 검토: □ 미기재

| 경로 | 요건 ID | 요건 | 판정 함수·기준 | 근거 문구 | 출처 | 접속 |
|---|---|---|---|---|---|---|
| 연구개발전담부서 인정 | RNDD-OPERATING | 사업자등록 완료 | enum {"q":"biz_status","pass":["individual","corporation"],"fail":["pre"]} | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행령](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EB%A0%B9) | OK |
| 연구개발전담부서 인정 | RNDD-STAFF | 연구전담요원 1명 이상 | gte {"q":"rnd_researchers","min":1,"unit":"명"} | 연구개발전담부서 1명 | [기업부설연구소등의 연구개발 지원에 관한 법률 시행령](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EB%A0%B9) | OK |
| 연구개발전담부서 인정 | RNDD-FIELD | 유흥 등 관련 분야(시행령 별표 1)가 아닌 연구개발활동 | no {"q":"rnd_excluded_field"} | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행령](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EB%A0%B9) | OK |
| 연구개발전담부서 인정 | RNDD-SPACE | 연구공간 기준(독립 공간 또는 인정되는 예외) | rnd_space {"unit":"dept","partition_industries":["software_582","info_63"]} | 50㎡ 초과 면적을 확보할 수 없는 경우 칸막이 구분 인정 | [기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | OK |
| 연구개발전담부서 인정 | RNDD-EQUIP | 연구 기자재가 연구공간 안에 있음 | yes {"q":"rnd_equipment"} | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | OK |
| 연구개발전담부서 인정 | RNDD-FILE | 한국산업기술진흥협회 인정 신청·검토 | 기관 평가(판정 안 함) | - | [기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | OK |

## 공식 출처 목록

| ID | 제목 | 기관 | 문서·조항 | 시행 | 확인일 | 접속 | 알려진 문제 |
|---|---|---|---|---|---|---|---|
| S-VEN-A | [벤처확인 유형별 안내 — 벤처투자유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=A) | 중소벤처기업부 · 벤처기업확인기관 | 법적 근거: 벤처기업법 제2조의2 제1항 제2호 가목 | 미기재 | 2026-11-22 | OK | - |
| S-VEN-B | [벤처확인 유형별 안내 — 연구개발유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=B) | 중소벤처기업부 · 벤처기업확인기관 | 법적 근거: 벤처기업법 제2조의2 제1항 제2호 나목 | 미기재 | 2026-11-22 | OK | - |
| S-VEN-B-RATIO | [업종별 연구개발투자비율 (연구개발유형 '업종별 기준 확인' 게시 이미지)](https://www.smes.go.kr/venturein/resources/images/sub/09rd_type.png) | 중소벤처기업부 · 벤처기업확인기관 | 매출액 규모별(50억원 미만 / 50억~100억원 미만 / 100억원 이상) 업종별 비율표 | 미기재 | 2026-11-22 | OK_IMAGE | - |
| S-VEN-C | [벤처확인 유형별 안내 — 혁신성장유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=C) | 중소벤처기업부 · 벤처기업확인기관 | 법적 근거: 벤처기업법 제2조의2 제1항 제2호 다목 | 미기재 | 2026-11-22 | OK | - |
| S-VEN-D | [벤처확인 유형별 안내 — 예비벤처유형](https://www.smes.go.kr/venturein/institution/requireGuide?rgCd=D) | 중소벤처기업부 · 벤처기업확인기관 | 법적 근거 표기: 벤처기업법 제2조의2 제1항 제2호 다목(공식 화면 표기 그대로) | 미기재 | 2026-11-22 | OK | - |
| S-VEN-EXCL | [벤처기업육성에 관한 특별법 시행령 [별표 1] 벤처기업에 포함되지 않는 업종 (벤처확인시스템 게시 이미지)](https://www.smes.go.kr/venturein/resources/images/sub/ventureRestricted11thIndustry.jpg) | 중소벤처기업부 | 시행령 별표 1 (제2조의4 관련) | 미기재 | 2026-11-22 | OK_IMAGE | - |
| S-VEN-DOCS | [벤처확인 유형별 제출서류 안내(유형별 화면 '제출서류' 표)](https://www.smes.go.kr/venturein/institution/requireGuide) | 중소벤처기업부 · 벤처기업확인기관 | 유형별 안내 각 탭 제출서류 표 | 미기재 | 2026-11-22 | OK | - |
| S-INNO-RULE | [기술혁신형 중소기업(Inno-Biz) 제도 운영규정](https://www.innobiz.net/download/2606_%EC%9D%B4%EB%85%B8%EB%B9%84%EC%A6%88%EC%A0%9C%EB%8F%84%20%EC%9A%B4%EC%98%81%EA%B7%9C%EC%A0%95.pdf) | 중소벤처기업부 · (사)중소기업기술혁신협회 | 중소벤처기업부 고시 제2026-44호 (2026.6.22. 일부개정) | 2026-06-22 | 2026-11-22 | OK | 내려받은 파일 첫 줄 제목이 '일부개정(안)'으로 표기됨 — 부칙에는 고시 제2026-44호·시행일이 기재됨. 국가법령정보센터 행정규칙 원문과 대조 필요 / 별표 2(신청 불가 업종) 표가 파일에 포함되어 있지 않음 — 원문 미확보 |
| S-INNO-PROC | [이노비즈 제도소개 · 신규신청 안내](https://www.innobiz.net/authen/authen1.asp) | (사)중소기업기술혁신협회 | 제도소개/신규신청 화면 | 미기재 | 2026-11-22 | OK | - |
| S-MAIN-GUIDE | [메인비즈 제도 안내(선정기준·신청 제외 대상) 및 현장평가 준비 안내](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/descriptMainbiz.do) | 중소벤처기업부 · (사)한국경영혁신중소기업협회 | 경영혁신형 중소기업(Main-Biz) 제도 운영규정 인용 화면, 중소기업 기술혁신 촉진법 제2조 제4의2호 | 미기재 | 2026-11-22 | OK | 업력 기산일 정의 조항(운영규정 원문) 미확보 — 공식 안내 화면 문구 기준으로만 판정 |
| S-MAIN-DOCS | [메인비즈 현장평가 준비 자료 목록](https://www.smes.go.kr/mainbiz/usr/mainbizInfo/mainbizGuide.do) | (사)한국경영혁신중소기업협회 | 신청 안내 화면 '현장평가 준비 자료 목록' | 미기재 | 2026-11-22 | OK | - |
| S-RND-DEC | [기업부설연구소등의 연구개발 지원에 관한 법률 시행령](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EB%A0%B9) | 과학기술정보통신부 | 대통령령 (2026.1.27. 공포, 2026.2.1. 시행) | 2026-02-01 | 2026-11-22 | OK | - |
| S-RND-RULE | [기업부설연구소등의 연구개발 지원에 관한 법률 시행규칙](https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B8%B0%EC%97%85%EB%B6%80%EC%84%A4%EC%97%B0%EA%B5%AC%EC%86%8C%EB%93%B1%EC%9D%98%EC%97%B0%EA%B5%AC%EA%B0%9C%EB%B0%9C%EC%A7%80%EC%9B%90%EC%97%90%EA%B4%80%ED%95%9C%EB%B2%95%EB%A5%A0%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99) | 과학기술정보통신부 | 과학기술정보통신부령 (2026.2.1. 시행) | 2026-02-01 | 2026-11-22 | OK | - |
| S-RND-PORTAL | [연구소/전담부서 신고관리 · 2026 업무편람](https://www.rnd.or.kr/user/info/outline.do) | 한국산업기술진흥협회 | 2026 기업부설연구소/연구개발전담부서 업무편람 | 미기재 | 2026-11-22 | UNREACHABLE | - |
| S-KC-SAFETY | [제품안전정보센터(KC 안전인증 등)](https://www.safetykorea.kr) | 국가기술표준원 | - | 미기재 | 2026-11-22 | OK | - |
| S-KC-RADIO | [방송통신기자재 적합성평가](https://www.rra.go.kr) | 국립전파연구원 | - | 미기재 | 2026-11-22 | OK | - |
| S-HACCP | [HACCP(식품안전관리인증기준)](https://www.haccp.or.kr) | 식품의약품안전처 · 한국식품안전관리인증원 | - | 미기재 | 2026-11-22 | OK | - |
| S-WOMEN | [여성기업 확인](https://www.wbiz.or.kr) | 중소벤처기업부 · 한국여성경제인협회 | - | 미기재 | 2026-11-22 | UNREACHABLE | - |
| S-DISABLED | [장애인기업 확인](https://www.debc.or.kr) | 중소벤처기업부 · 장애인기업종합지원센터 | - | 미기재 | 2026-11-22 | UNREACHABLE | - |
| S-FAMILY | [가족친화인증](https://www.ffm.go.kr) | 가족친화인증 운영기관(정부) | - | 미기재 | 2026-11-22 | UNREACHABLE | - |
| S-SOCIALV | [소셜벤처 판별](https://www.kibo.or.kr) | 중소벤처기업부 · 기술보증기금(판별 운영) | - | 미기재 | 2026-11-22 | UNREACHABLE | - |
| S-ISO | [ISO — Certification](https://www.iso.org/certification.html) | ISO (International Organization for Standardization) | - | 미기재 | 2026-11-22 | BLOCKED | - |
| S-EU-CE | [Your Europe — CE marking](https://europa.eu/youreurope/business/product-rules-compliance/general-product-compliance/ce-marking/index_en.htm) | European Union | - | 미기재 | 2026-11-22 | OK | - |
| S-EU-CA | [Conformity assessment](https://single-market-economy.ec.europa.eu/single-market/goods/building-blocks/conformity-assessment_en) | European Commission | - | 미기재 | 2026-11-22 | OK | - |
| S-FDA-RL | [Important Reminders about Registration and Listing (Medical Devices)](https://www.fda.gov/medical-devices/device-registration-and-listing/important-reminders-about-registration-and-listing) | U.S. FDA | - | 미기재 | 2026-11-22 | OK | - |
| S-FDA-DEV | [Overview of Device Regulation](https://www.fda.gov/medical-devices/device-advice-comprehensive-regulatory-assistance/overview-device-regulation) | U.S. FDA | - | 미기재 | 2026-11-22 | OK | - |
| S-FDA-FOOD | [Registration of Food Facilities and Other Submissions](https://www.fda.gov/food/guidance-regulation-food-and-dietary-supplements/registration-food-facilities-and-other-submissions) | U.S. FDA | - | 미기재 | 2026-11-22 | OK | - |
| S-FCC | [Equipment Authorization](https://www.fcc.gov/oet/ea) | U.S. FCC | - | 미기재 | 2026-11-22 | BLOCKED | - |
| S-SME-CONF | [중소기업확인서](https://sminfo.mss.go.kr) | 중소벤처기업부 | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-SOCIAL-ENT | [사회적기업 인증](https://www.socialenterprise.or.kr) | 고용노동부 | - | 미기재 | 2026-11-23 | OK | - |
| S-PRE-SOCIAL | [예비사회적기업 지정](https://www.socialenterprise.or.kr) | 고용노동부·지방자치단체 | - | 미기재 | 2026-11-23 | OK | - |
| S-ROOT-IND | [뿌리기업 확인](https://www.kpic.re.kr) | 산업통상자원부 | - | 미기재 | 2026-11-23 | OK | - |
| S-DIRECT-PROD | [직접생산확인](https://www.smpp.go.kr) | 중소벤처기업부 | - | 미기재 | 2026-11-23 | OK | - |
| S-PERF-CERT | [성능인증](https://www.smpp.go.kr) | 중소벤처기업부 | - | 미기재 | 2026-11-23 | OK | - |
| S-SHARE-PERF | [성과공유기업 확인](https://www.winwinnuri.or.kr) | 중소벤처기업부 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-EXPORT-SME | [수출유망중소기업 지정](https://www.exportcenter.go.kr) | 중소벤처기업부(지방중소벤처기업청) | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-SW-BIZ | [소프트웨어사업자 신고](https://www.sw.or.kr) | 과학기술정보통신부 | - | 미기재 | 2026-11-23 | OK | - |
| S-RND-SERVICE | [연구개발서비스업 신고](https://www.rnd.or.kr) | 과학기술정보통신부 | - | 미기재 | 2026-11-23 | OK | - |
| S-CREATIVE-LAB | [기업부설창작연구소·기업창작전담부서](https://www.rnd.or.kr) | 과학기술정보통신부 | - | 미기재 | 2026-11-23 | OK | - |
| S-GS-CERT | [GS인증(소프트웨어 품질인증)](https://www.tta.or.kr) | 과학기술정보통신부 | - | 미기재 | 2026-11-23 | OK | - |
| S-NEP | [NEP 신제품 인증](https://www.newproduct.or.kr) | 산업통상자원부(국가기술표준원) | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-NET | [NET 신기술 인증](https://www.netmark.or.kr) | 산업통상자원부(국가기술표준원) | - | 미기재 | 2026-11-23 | OK | - |
| S-GREEN-CERT | [녹색인증](https://www.greencertif.or.kr) | 관계부처 합동 | - | 미기재 | 2026-11-23 | OK | - |
| S-PPS-EXCELLENT | [조달우수제품 지정](https://www.pps.go.kr) | 조달청 | - | 미기재 | 2026-11-23 | OK | - |
| S-INNOV-PROD | [혁신제품 지정](https://www.pps.go.kr) | 조달청 등 관계부처 | - | 미기재 | 2026-11-23 | OK | - |
| S-KS | [KS 인증](https://www.ksa.or.kr) | 산업통상자원부(국가기술표준원) | - | 미기재 | 2026-11-23 | OK | - |
| S-HIGH-EFF | [고효율에너지기자재 인증](https://eep.energy.or.kr) | 산업통상자원부 | - | 미기재 | 2026-11-23 | OK | - |
| S-ENERGY-LABEL | [에너지소비효율등급 표시](https://eep.energy.or.kr) | 산업통상자원부 | - | 미기재 | 2026-11-23 | OK | - |
| S-ECO-LABEL | [환경표지 인증](https://el.keiti.re.kr) | 환경부 | - | 미기재 | 2026-11-23 | OK | - |
| S-GR-MARK | [우수재활용제품(GR) 인증](https://www.buygr.or.kr) | 산업통상자원부 | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-GOOD-DESIGN | [우수디자인(GD) 선정](https://www.kidp.or.kr) | 산업통상자원부 | - | 미기재 | 2026-11-23 | OK | - |
| S-KR-MEDICAL | [의료기기 허가·인증·신고](https://www.mfds.go.kr) | 식품의약품안전처 | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-ISMS-P | [ISMS-P 정보보호 관리체계 인증](https://isms.kisa.or.kr) | 과학기술정보통신부·개인정보보호위원회 | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-CC-CERT | [CC인증(정보보호제품 평가·인증)](https://itscc.kr) | 과학기술정보통신부(국가정보원 협력) | - | 미기재 | 2026-11-23 | OK | - |
| S-KOSHA-MS | [안전보건경영시스템(KOSHA-MS) 인증](https://www.kosha.or.kr) | 고용노동부 | - | 미기재 | 2026-11-23 | OK | - |
| S-DISABLED-WS | [장애인표준사업장 인증](https://www.kead.or.kr) | 고용노동부 | - | 미기재 | 2026-11-23 | OK | - |
| S-ECO-AGRI | [친환경농산물 인증](https://www.enviagro.go.kr) | 농림축산식품부(국립농산물품질관리원) | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-KCS-SAFETY | [산업안전 KCs 안전인증](https://www.kosha.or.kr) | 고용노동부 | - | 미기재 | 2026-11-23 | OK | - |
| S-CARBON-LABEL | [환경성적표지(탄소발자국) 인증](https://www.epd.or.kr) | 환경부 | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-ISO50001 | [ISO 50001 에너지경영시스템](https://www.iso.org/iso-50001-energy-management.html) | 인정받은 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-ISO37001 | [ISO 37001 부패방지경영시스템](https://www.iso.org/iso-37001-anti-bribery-management.html) | 인정받은 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-ISO37301 | [ISO 37301 규범준수경영시스템](https://www.iso.org/standard/75080.html) | 인정받은 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-ISO27701 | [ISO/IEC 27701 개인정보경영시스템](https://www.iso.org/standard/71670.html) | 인정받은 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-ISO22301 | [ISO 22301 비즈니스연속성경영시스템](https://www.iso.org/standard/75106.html) | 인정받은 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-ISO20000 | [ISO/IEC 20000-1 IT서비스경영시스템](https://www.iso.org/standard/70636.html) | 인정받은 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-IATF16949 | [IATF 16949 자동차 품질경영시스템](https://www.iatfglobaloversight.org) | IATF 인정 인증기관 | - | 미기재 | 2026-11-23 | OK | - |
| S-AS9100 | [AS9100 항공우주 품질경영시스템](https://iaqg.org) | IAQG 인정 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-FSSC22000 | [FSSC 22000 식품안전시스템](https://www.fssc.com) | 인정받은 인증기관 | - | 미기재 | 2026-11-23 | OK | - |
| S-SOC2 | [SOC 2 보고서](https://www.aicpa-cima.com) | AICPA 기준에 따른 감사인 | - | 미기재 | 2026-11-23 | OK | - |
| S-PCI-DSS | [PCI DSS 카드 데이터 보안 표준](https://www.pcisecuritystandards.org) | PCI SSC(평가는 QSA) | - | 미기재 | 2026-11-23 | OK | - |
| S-CMMI | [CMMI 성숙도 평가](https://cmmiinstitute.com) | ISACA(CMMI Institute) 공인 평가자 | - | 미기재 | 2026-11-23 | OK | - |
| S-BCORP | [B Corp 인증](https://www.bcorporation.net) | B Lab | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-FSC | [FSC 산림인증](https://fsc.org) | FSC 인정 인증기관 | - | 미기재 | 2026-11-23 | OK | - |
| S-CB-SCHEME | [IECEE CB Scheme](https://www.iecee.org) | IECEE 회원 인증기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-IECEX | [IECEx 방폭 인증](https://www.iecex.com) | IECEx 인증기관 | - | 미기재 | 2026-11-23 | OK | - |
| S-EU-ROHS | [EU RoHS 유해물질 제한](https://environment.ec.europa.eu/topics/waste-and-recycling/rohs-directive_en) | 유럽연합 | - | 미기재 | 2026-11-23 | OK | - |
| S-EU-REACH | [EU REACH 화학물질 등록](https://echa.europa.eu) | 유럽화학물질청(ECHA) | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-EU-MDR | [EU 의료기기 규정(MDR)](https://health.ec.europa.eu/medical-devices-sector_en) | 유럽연합(인증기관: Notified Body) | - | 미기재 | 2026-11-23 | OK | - |
| S-UKCA | [UKCA 마킹(영국)](https://www.gov.uk/guidance/using-the-ukca-marking) | 영국 정부 | - | 미기재 | 2026-11-23 | OK | - |
| S-US-FDA-COS | [미국 FDA 화장품(MoCRA) 등록](https://www.fda.gov/cosmetics) | 미국 FDA | - | 미기재 | 2026-11-23 | OK | - |
| S-US-NRTL | [미국 NRTL 안전인증(UL 등)](https://www.osha.gov/nationally-recognized-testing-laboratory-program) | 미국 OSHA(인정) · NRTL 시험기관 | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-US-ENERGY-STAR | [ENERGY STAR(미국)](https://www.energystar.gov) | 미국 환경보호청(EPA) | - | 미기재 | 2026-11-23 | OK | - |
| S-JP-PSE | [일본 PSE 마크](https://www.meti.go.jp) | 일본 경제산업성(METI) | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-CN-CCC | [중국 CCC 강제인증](https://www.cnca.gov.cn) | 중국 국가인증인가감독관리위원회(CNCA) | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-IN-BIS | [인도 BIS 인증](https://www.bis.gov.in) | 인도 표준국(BIS) | - | 미기재 | 2026-11-23 | OK | - |
| S-SA-SASO | [사우디 SASO·SABER 적합성](https://www.saso.gov.sa) | 사우디 표준청(SASO) | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-EAEU-EAC | [유라시아경제연합 EAC 인증](https://eec.eaeunion.org) | 유라시아경제위원회 | - | 미기재 | 2026-11-23 | OK | - |
| S-CN-NMPA | [중국 NMPA 의료기기 등록](https://www.nmpa.gov.cn) | 중국 국가약품감독관리국(NMPA) | - | 미기재 | 2026-11-23 | BLOCKED | - |
| S-JP-PMDA | [일본 의료기기 승인·인증(PMDA)](https://www.pmda.go.jp) | 일본 후생노동성·PMDA | - | 미기재 | 2026-11-23 | OK | - |
| S-AU-TGA | [호주 TGA 의료제품 등록](https://www.tga.gov.au) | 호주 TGA | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-CA-HC-MD | [캐나다 의료기기 허가(Health Canada)](https://www.canada.ca/en/health-canada.html) | 캐나다 보건부 | - | 미기재 | 2026-11-23 | UNREACHABLE | - |
| S-HALAL-MY | [할랄 인증(말레이시아 JAKIM 등)](https://www.halal.gov.my) | 국가별 할랄 인증기관 | - | 미기재 | 2026-11-23 | OK | - |
