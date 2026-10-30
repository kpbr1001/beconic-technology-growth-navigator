// 서버 함수 단위 테스트 — 외부 API는 fetch 스텁으로 대체(네트워크·실제 키 불필요).
// 실행: node --test grants/tests/server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { regionsFromText, extractAmount, dedupe, isPastKst, stripTags, detectGus } from '../netlify/lib/normalize.mjs';
import { normalizeBizinfo, parsePeriod } from '../netlify/lib/bizinfo.mjs';
import { mapBusinessAge, mapAge, normalizeKstartup } from '../netlify/lib/kstartup.mjs';
import { mergeEligibility, safeParse } from '../netlify/lib/eligibility-ai.mjs';
import programsHandler, { getPrograms, _resetCache } from '../netlify/functions/programs.mjs';
import { isAlive, refreshSnapshot, readSnapshot, _setStore, enrichLocal, storeName } from '../netlify/lib/collect.mjs';
import { extractRules } from '../netlify/lib/rule-extract.mjs';
import { analyzeDocText, applyDoc, sections } from '../netlify/lib/doc-rules.mjs';
import { analyzeDocs, readDocIndex } from '../netlify/lib/docs.mjs';
import { docUrlOf } from '../netlify/lib/bizinfo.mjs';
import { writeSnapshot } from '../netlify/lib/collect.mjs';
import { detectCities } from '../netlify/lib/normalize.mjs';
import { handler as health } from '../netlify/functions/health.mjs';

test('지역: 정식 명칭(경상남도·전라북도 등)도 약칭으로 인식, 없으면 null', () => {
  assert.deepEqual(regionsFromText('경상남도 2026 스마트공장 지원'), ['경남']);
  assert.deepEqual(regionsFromText('전라북도경제통상진흥원'), ['전북']);
  assert.deepEqual(regionsFromText('전북특별자치도 창업 지원'), ['전북']);
  assert.deepEqual(regionsFromText('충청남도·충청북도 공동'), ['충북', '충남']);
  assert.deepEqual(regionsFromText('[서울] 소상공인'), ['서울']);
  assert.equal(regionsFromText('2026 중소기업 정책자금'), null);
  assert.deepEqual(regionsFromText('서울,부산,대구,인천,광주,대전,울산,세종,경기,강원,충북,충남,전북,전남,경북,경남,제주'), ['전국']);
});

test('지원금액: 기업당 한도만 추출, 매출·예산 문구는 무시', () => {
  assert.equal(extractAmount('매출 100억 이하 기업, 기업당 최대 5천만원 지원').max, 5e7);
  assert.equal(extractAmount('총 사업예산 50억원, 업체당 최대 2억원').max, 2e8);
  assert.equal(extractAmount('총 예산 30억원 규모로 추진').max, null);
  assert.equal(extractAmount('최대 1억 5천만원 이내').max, 1.5e8);
  assert.equal(extractAmount('과제당 3,000만원 이내 지원').max, 3e7);
  assert.equal(extractAmount('연매출 10억원 이상 기업 대상').max, null);
  assert.equal(extractAmount('기업당 최대 5천만원').text, '최대 5,000만원');
  // 운영 데이터 오추출 회귀(v3.9): 쉼표 숫자·사업 총액·지원규모
  assert.equal(extractAmount('대출 지원(예산 규모 1,395억원) - 건별 한도 : 발주서 금액의 80%').max, null);
  assert.equal(extractAmount('☞ 융자 지원규모 3,300억원 이내(창업 및 경쟁력강화자금)').max, null);
  assert.equal(extractAmount('☞ 총 180억원(업체당 최대 50백만원) 지원').max, 5e7);
  assert.equal(extractAmount('예산규모 590억원 - 팩토링 한도 : 판매기업 10억원, 구매기업 30억원 이내').max, 3e9);
});

test('마감 판정: 마감 당일은 한국시간 자정까지 유효', () => {
  const d0900 = Date.UTC(2026, 9, 28, 0, 0); // 2026-10-28 09:00 KST
  const d2359 = Date.UTC(2026, 9, 28, 14, 59); // 23:59 KST
  const next = Date.UTC(2026, 9, 28, 15, 1); // 10-29 00:01 KST
  assert.equal(isPastKst('2026-10-28', d0900), false);
  assert.equal(isPastKst('2026-10-28', d2359), false);
  assert.equal(isPastKst('2026-10-28', next), true);
  assert.equal(isAlive({ applicationEnd: '2026-10-28' }, d0900), true);
  assert.equal(isAlive({ recruitInProgress: false }, d0900), false);
});

test('기업마당 정규화: 지역은 소관기관까지 보고, 대상 미표기는 inferred', () => {
  const p = normalizeBizinfo({ pblancId: 'PBLN_1', pblancNm: '2026 제조기업 혁신 지원', jrsdInsttNm: '경상남도', reqstBeginEndDe: '20261001 ~ 20261031', trgetNm: '', bsnsSumryCn: '<p>업체당 최대 3천만원</p>', pblancUrl: 'https://www.bizinfo.go.kr/x' });
  assert.deepEqual(p.targetRegions, ['경남']);
  assert.equal(p.targetRegionsInferred, false);
  assert.equal(p.targetBusinessTypeInferred, true);
  assert.equal(p.applicationEnd, '2026-10-31');
  assert.equal(p.supportAmountMax, 3e7);
  assert.equal(p.eligibilityDepth, 'listing');
  const q = normalizeBizinfo({ pblancId: 'PBLN_2', pblancNm: '중소기업 정책자금', trgetNm: '중소기업' });
  assert.deepEqual(q.targetRegions, ['전국']);
  assert.equal(q.targetRegionsInferred, true);
  assert.deepEqual(parsePeriod('2026.9.1 ~ 2026.9.30'), { start: '2026-09-01', end: '2026-09-30', endText: null });
  assert.equal(parsePeriod('예산 소진시까지').endText, '예산 소진시까지');
});

test('K-Startup 업력: 목록의 최대 연차를 상한으로, 예비창업 포함 여부 반영', () => {
  const a = mapBusinessAge('예비창업자,1년미만,2년미만,3년미만');
  assert.equal(a.max, 3); assert.equal(a.preStartupAllowed, true); assert.equal(a.preStartupOnly, false);
  const b = mapBusinessAge('1년미만,2년미만,3년미만,5년미만,7년미만');
  assert.equal(b.max, 7); assert.equal(b.preStartupAllowed, false);
  const c = mapBusinessAge('예비창업자');
  assert.equal(c.preStartupOnly, true); assert.equal(c.preStartupAllowed, true);
  assert.equal(mapBusinessAge('전체').max, null);
  assert.equal(mapAge('만 39세 이하'), 39);
  assert.equal(mapAge('만 40세 미만'), 39);
  const p = normalizeKstartup({ pbanc_sn: 77, biz_pbanc_nm: '청년 창업 지원', supt_regin: '전국', aply_trgt: '일반인,대학생', biz_enyy: '예비창업자', rcrt_prgs_yn: 'Y', pbanc_rcpt_end_dt: '20261130' });
  assert.equal(p.sourceProgramId, 'KS_77');
  assert.ok(p.targetBusinessType.includes('예비창업자'));
  assert.equal(p.recruitInProgress, true);
});

test('중복 제거: 같은 출처의 다른 공고는 합치지 않고, 출처 간 같은 공고는 합침', () => {
  const list = [
    { source: 'bizinfo', sourceProgramId: 'a', programName: '스마트공장 구축지원사업', applicationEnd: '2026-11-30' },
    { source: 'bizinfo', sourceProgramId: 'b', programName: '스마트공장 구축지원사업(고도화)', applicationEnd: '2026-11-30' },
    { source: 'kstartup', sourceProgramId: 'KS_1', programName: '2026년 초기창업패키지 창업기업 모집 공고', applicationEnd: '2026-10-15', businessAgeMax: 3 },
    { source: 'bizinfo', sourceProgramId: 'c', programName: '[중기부] 2026년 초기창업패키지 창업기업', applicationEnd: '2026-10-15' },
  ];
  const ids = dedupe(list).map((p) => p.sourceProgramId).sort();
  assert.deepEqual(ids, ['KS_1', 'a', 'b']);
});

test('AI 병합: 본문에 없는 근거·범위 밖 숫자는 버리고, 우대는 필수자격으로 바꾸지 않음', () => {
  const program = { programName: 'X', rawSummary: '창업 7년 이내 기업. 상시근로자 50인 이하. 여성기업 우대. 국세 체납이 없어야 함.' };
  const merged = mergeEligibility(program, {
    businessAgeMax: 7, employeeMax: '50', revenueMax: 30, representativeAgeMax: 39,
    specialRequirements: ['여성기업'], preferences: ['여성기업'], requiresNoTaxArrears: true,
    evidence: { businessAgeMax: '창업 7년 이내', employeeMax: '상시근로자 50인 이하', revenueMax: '매출 30억', representativeAgeMax: '만 39세 이하', specialRequirements: '없는 문구', preferences: '여성기업 우대', requiresNoTaxArrears: '국세 체납이 없어야 함' },
    confidence: 'high',
  });
  assert.equal(merged.businessAgeMax, 7);
  assert.equal(merged.employeeMax, 50);
  assert.equal(merged.revenueMax, undefined, '근거 없음·단위 오류 값은 버림');
  assert.equal(merged.representativeAgeMax, undefined, '본문에 없는 근거는 버림');
  assert.equal(merged.specialRequirements, undefined);
  assert.deepEqual(merged.preferenceConditions, ['여성기업']);
  assert.equal(merged.requiresNoTaxArrears, true);
  assert.equal(merged._aiEnriched, true);
  assert.equal(merged.eligibilityDepth, 'ai');
  assert.equal(mergeEligibility(program, { businessAgeMax: 9, evidence: {} }), program, '반영값이 없으면 원본 그대로');
  assert.equal(safeParse('```json\n{"a":1}\n```').a, 1);
  assert.equal(safeParse('[1,2]'), null);
});

test('본문 규칙 추출: 업력·근로자·매출·대표자 연령, 우대·충돌·고령 근로자 문맥은 제외', () => {
  const r = extractRules('신청자격: 창업 7년 이내 기업으로 상시근로자 10인 미만, 연매출액 10억원 이하. 대표자 만 39세 이하(청년). 수출기업 우대.');
  assert.equal(r.fields.businessAgeMax, 7);
  assert.equal(r.fields.businessAgeMaxExclusive, false);
  assert.equal(r.fields.employeeMax, 9);
  assert.equal(r.fields.revenueMax, 1e9);
  assert.equal(r.fields.representativeAgeMax, 39);
  assert.equal(r.evidence.employeeMax, '상시근로자 10인 미만');
  assert.equal(extractRules('업력 3년 미만 기업 우대'), null, '우대 조건은 필수 아님');
  assert.equal(extractRules('일반 창업 7년 이내, 신산업 창업 10년 이내 기업'), null, '값이 엇갈리면 단정 안 함');
  assert.equal(extractRules('만 60세 이상 고령자 채용 시 인건비 지원'), null, '근로자 연령은 대표자 조건 아님');
  assert.equal(extractRules('업력 7년 이상 중소기업').fields.businessAgeMin, 7);
});

test('시·군 기관 공고: 대상 시·군 인식(접두·정식명), 남양주≠양주, 겹치는 이름은 시·도 확인', () => {
  assert.deepEqual(detectCities({ executingAgency: '성남산업진흥원' }).map((c) => c.name), ['성남시']);
  assert.deepEqual(detectCities({ programName: '[경기] 남양주시 소상공인 지원' }).map((c) => c.name), ['남양주시']);
  assert.deepEqual(detectCities({ programName: '고성군 모범음식점' }), [], '강원·경남 둘 다 있어 시·도 없이는 판단 안 함');
  assert.deepEqual(detectCities({ programName: '고성군 모범음식점' }, ['강원']).map((c) => c.sido), ['강원']);
  assert.deepEqual(detectCities({ agency: '광주경제진흥상생일자리재단' }), [], '광역시 이름과 같은 경기 광주시는 접두로 판단 안 함');
  const p = enrichLocal({ programName: '2026 창업 지원', agency: '경기도', executingAgency: '시흥산업진흥원', targetRegions: ['전국'], targetRegionsInferred: true, rawSummary: '창업 3년 이내 기업', eligibilityDepth: 'listing' });
  assert.deepEqual(p.targetRegions, ['경기']);
  assert.deepEqual(p.targetDistricts, ['시흥시']);
  assert.equal(p.businessAgeMax, 3);
  assert.equal(p.eligibilityDepth, 'rule');
  const q = enrichLocal({ programName: 'X', executingAgency: '성남산업진흥원', targetRegions: ['전국'], targetRegionsInferred: false });
  assert.equal(q.targetDistricts, undefined, '전국으로 명시된 공고는 그대로');
});

test('Blobs 저장소: 미리보기 배포는 운영 스냅샷과 분리', () => {
  assert.equal(storeName('beconic-grant-matching.netlify.app', 'production'), 'grant-programs');
  assert.equal(storeName('deploy-preview-45--beconic-grant-matching.netlify.app', undefined), 'grant-programs-preview', '배포 맥락 값이 없어도 주소로 구분');
  assert.equal(storeName(null, 'deploy-preview'), 'grant-programs-preview');
  assert.equal(storeName(null, undefined), 'grant-programs');
  assert.equal(storeName('main--beconic-grant-matching.netlify.app', 'production'), 'grant-programs', '운영 브랜치 주소(main--)라도 배포 맥락이 운영이면 운영 저장소');
  assert.equal(storeName('beconic-grant-matching.netlify.app', 'deploy-preview'), 'grant-programs-preview');
});

test('광역시 자치구·여성기업 공고명', () => {
  assert.deepEqual(detectGus({ programName: '[서울] 구로 G밸리 기업 지원' }, '서울'), ['구로구']);
  assert.deepEqual(detectGus({ agency: '용산구청' }, '서울'), ['용산구']);
  assert.deepEqual(detectGus({ programName: '집중구간 지원' }, '서울'), []);
  assert.deepEqual(detectGus({ programName: '구로구 지원' }, '부산'), [], '다른 광역시 이름은 무시');
  const g = enrichLocal({ programName: '[인천] 서구 2026년 청년기업 인증', agency: '인천광역시', targetRegions: ['인천'], targetRegionsInferred: false });
  assert.deepEqual(g.targetDistricts, ['서구']);
  const w = enrichLocal({ programName: '2026년 여성기업 육성사업 공고', targetRegions: ['전국'], targetRegionsInferred: false });
  assert.deepEqual(w.specialRequirements, ['여성기업']);
  const nw = enrichLocal({ programName: '창업 지원', rawSummary: '여성기업 우대', targetRegions: ['전국'], targetRegionsInferred: false });
  assert.equal(nw.specialRequirements, undefined, '본문의 여성기업 우대는 필수 아님');
});

const DOC = '2026년 ○○ 지원사업 모집 공고\n1. 사업 개요\n지원 규모: 총 사업예산 30억원\n2. 신청 자격\n○ 공고일 기준 서울특별시 구로구 소재 중소기업으로 창업 7년 이내 기업\n○ 상시근로자 50인 미만, 대표자 만 39세 이하(청년)\n※ 수출 실적 보유 기업 우대\n3. 지원 내용\n○ 기업당 최대 5천만원\n4. 신청 제외 대상\n○ 업력 10년 이상 기업\n5. 평가 방법\n○ 매출액 100억원 이상 기업 평가위원';

test('공고문 분석: 자격 절만(제외·평가 절 숫자 무시), 소재 자치구, 지원 내용 금액', () => {
  assert.deepEqual(sections(DOC).map((s) => s.head), ['1. 사업 개요', '2. 신청 자격', '3. 지원 내용', '4. 신청 제외 대상', '5. 평가 방법']);
  const r = analyzeDocText(DOC, { regions: ['서울'] });
  assert.equal(r.sectionFound, true);
  assert.equal(r.fields.businessAgeMax, 7);
  assert.equal(r.fields.employeeMax, 49);
  assert.equal(r.fields.representativeAgeMax, 39);
  assert.equal(r.fields.businessAgeMin, undefined, '제외 절의 업력 10년 이상은 자격으로 쓰지 않음');
  assert.equal(r.fields.revenueMin, undefined, '평가 절 숫자 무시');
  assert.deepEqual(r.districts, ['구로구']);
  assert.equal(r.amount, 5e7);
  const r2 = analyzeDocText('□ 지원대상\nㅇ 경기도 내 본사를 둔 창업 3년 미만 기업\n□ 신청제한\nㅇ 업력 7년 이상 기업', { regions: ['경기'] });
  assert.equal(r2.fields.businessAgeMax, 3);
  assert.equal(r2.fields.businessAgeMaxExclusive, true);
});

test('공고문 병합: 요약문 값 유지, 빈 항목만 채움, 근거·깊이 표시', () => {
  const p = { sourceProgramId: 'X', businessAgeMax: 5, eligibilityDepth: 'listing', targetRegions: ['서울'] };
  const q = applyDoc(p, { status: 'ok', fields: { businessAgeMax: 7, employeeMax: 49 }, evidence: { employeeMax: '상시근로자 50인 미만' }, districts: ['구로구'], districtEvidence: '구로구 소재' });
  assert.equal(q.businessAgeMax, 5, '요약문 값 유지');
  assert.equal(q.employeeMax, 49);
  assert.deepEqual(q.targetDistricts, ['구로구']);
  assert.equal(q.eligibilityDepth, 'doc');
  assert.match(q._docEvidence.employeeMax, /^공고문:/);
  assert.equal(applyDoc(p, { status: 'notext' }), p);
});

test('공고문 주소: 본문출력 PDF 우선, 없으면 첨부 중 PDF, 기업마당 주소만', () => {
  assert.equal(docUrlOf({ printFlpthNm: 'https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=F1&fileSn=0', printFileNm: '공고.pdf' }), 'https://www.bizinfo.go.kr/cmm/fms/getImageFile.do?atchFileId=F1&fileSn=0');
  assert.equal(docUrlOf({ printFlpthNm: 'https://www.bizinfo.go.kr/a', printFileNm: '공고.hwp', flpthNm: 'https://www.bizinfo.go.kr/b@https://www.bizinfo.go.kr/c', fileNm: '서식.hwp@공고문.pdf' }), 'https://www.bizinfo.go.kr/c');
  assert.equal(docUrlOf({ printFlpthNm: 'https://evil.example/x.pdf', printFileNm: 'x.pdf' }), null);
});

test('공고문 분석 작업: PDF만·텍스트 부족 구분, 마감 가까운 순, 잠금, 응답 병합', async () => {
  _resetCache(); _setStore(memStore());
  const progs = [
    { source: 'bizinfo', sourceProgramId: 'A', programName: 'A', docUrl: 'https://www.bizinfo.go.kr/a', applicationEnd: '2099-12-01', targetRegions: ['서울'], eligibilityDepth: 'listing' },
    { source: 'bizinfo', sourceProgramId: 'B', programName: 'B', docUrl: 'https://www.bizinfo.go.kr/b', applicationEnd: '2099-01-01', targetRegions: ['전국'], eligibilityDepth: 'listing' },
    { source: 'bizinfo', sourceProgramId: 'C', programName: 'C', docUrl: 'https://www.bizinfo.go.kr/c', applicationEnd: '2099-06-01', targetRegions: ['전국'], eligibilityDepth: 'listing' },
  ];
  await writeSnapshot({ mode: 'live', fetchedAt: new Date().toISOString(), errors: {}, count: 3, programs: progs });
  const order = [];
  const fetchImpl = async (u) => { order.push(u.slice(-1)); const body = u.endsWith('c') ? 'HWP!' : '%PDF-1.7 ...'; return { ok: true, status: 200, headers: new Map([['content-length', '10']]), arrayBuffer: async () => Buffer.from(body) }; };
  const textImpl = async () => DOC;
  const r = await analyzeDocs({ limit: 2, fetchImpl, textImpl });
  assert.equal(r.processed, 2);
  assert.equal(r.remaining, 1);
  assert.deepEqual(order.slice(0, 2).sort(), ['b', 'c'], '마감이 가까운 공고부터');
  let idx = await readDocIndex();
  assert.equal(idx.B.status, 'ok');
  assert.equal(idx.C.status, 'notpdf');
  const r2 = await analyzeDocs({ fetchImpl, textImpl: async () => '포스터' });
  assert.equal(r2.processed, 1);
  idx = await readDocIndex();
  assert.equal(idx.A.status, 'notext');
  const st = await (await import('../netlify/lib/collect.mjs')).namedStore('grant-docs');
  await st.setJSON('lock', { at: Date.now() });
  assert.equal((await analyzeDocs({ fetchImpl, textImpl })).reason, 'locked');
  const res = await getPrograms({ BIZINFO_API_KEY: 'b' }, { fresh: true, triggerRefresh: noRefresh });
  const b = res.programs.find((p) => p.sourceProgramId === 'B');
  assert.equal(b.businessAgeMax, 7);
  assert.equal(b.eligibilityDepth, 'doc');
  assert.ok(res.programs.every((p) => !('docUrl' in p)), '공고문 주소는 응답에서 제거');
  assert.equal(res.docStats.ok, 1);
});

test('PDF 텍스트 추출(unpdf, 설치된 경우): 한국어 공고문', async (t) => {
  let mod; try { mod = await import('../netlify/lib/docs.mjs'); await import('unpdf'); } catch { t.skip('unpdf 미설치'); return; }
  const fs = await import('node:fs');
  // 저장소 위생 검사가 .pdf 커밋을 막으므로 base64 텍스트로 보관(Chromium으로 만든 한국어 공고문 1쪽)
  const f = new URL('./fixtures/sample-notice.pdf.b64', import.meta.url);
  const text = await mod.pdfText(Buffer.from(fs.readFileSync(f, 'utf8'), 'base64'));
  const r = analyzeDocText(text, { regions: ['서울'] });
  assert.equal(r.fields.businessAgeMax, 7);
  assert.deepEqual(r.districts, ['구로구']);
});

test('stripTags: 태그 제거·엔티티 복원', () => {
  assert.equal(stripTags('<b>a&nbsp;&amp;&lt;b</b>'), 'a &<b');
});

// ---- programs 함수: fetch 스텁 ----
function stubFetch({ bizinfo = [], kstartup = [], claude = null, fail = {} } = {}) {
  const calls = { bizinfo: 0, kstartup: 0, claude: 0 };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (u.includes('bizinfo.go.kr')) { calls.bizinfo++; if (fail.bizinfo) return { ok: false, status: 500 }; return ok({ jsonArray: bizinfo }); }
    if (u.includes('apis.data.go.kr')) { calls.kstartup++; if (fail.kstartup) throw new Error('timeout'); return ok({ data: u.includes('pageNo=1') ? kstartup : [] }); }
    if (u.includes('api.anthropic.com')) {
      calls.claude++;
      assert.equal(opts.headers['x-api-key'], 'sk-test');
      return ok({ content: [{ type: 'text', text: JSON.stringify(claude) }] });
    }
    throw new Error('unexpected ' + u);
  };
  return calls;
}
const BIZ = [
  { pblancId: 'P1', pblancNm: '[서울] 소상공인 경영개선', reqstBeginEndDe: '20260101 ~ 20991231', trgetNm: '소상공인', bsnsSumryCn: '창업 7년 이내 소상공인, 업체당 최대 1천만원 지원. 세부 내용은 공고문 참조 바랍니다. 신청 서류 사업자등록증.', pblancUrl: 'https://www.bizinfo.go.kr/1' },
  { pblancId: 'P2', pblancNm: '마감된 공고', reqstBeginEndDe: '20200101 ~ 20200201', trgetNm: '중소기업', bsnsSumryCn: 'x' },
];
const KS = [{ pbanc_sn: 9, biz_pbanc_nm: '예비창업패키지', supt_regin: '전국', aply_trgt: '일반인', biz_enyy: '예비창업자', rcrt_prgs_yn: 'Y', pbanc_rcpt_end_dt: '20991231' }];

function memStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); }, _m: m };
}
const noRefresh = async () => {};

test('programs: 키 없으면 not_configured, 외부 호출 없음', async () => {
  _resetCache(); _setStore(memStore());
  const calls = stubFetch();
  const r = await getPrograms({}, { fresh: true, triggerRefresh: noRefresh });
  assert.equal(r.mode, 'not_configured');
  assert.equal(calls.bizinfo + calls.kstartup, 0);
});

test('K-Startup: page·perPage로 요청(numOfRows만 보내면 10건만 옴)', async () => {
  const urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); return { ok: true, status: 200, json: async () => ({ data: [] }) }; };
  const { collectKstartup } = await import('../netlify/lib/kstartup.mjs');
  await collectKstartup('k', { max: 500 });
  assert.equal(urls.length, 5);
  assert.ok(urls.every((u) => /[?&]perPage=100/.test(u)) && urls.some((u) => /[?&]page=5/.test(u)));
});

test('programs: 스냅샷 없으면 직접 수집·저장, 마감 제외·본문 원문 없음, 이후 외부 API 재호출 없음', async () => {
  _resetCache(); const st = memStore(); _setStore(st);
  const calls = stubFetch({ bizinfo: BIZ, kstartup: KS });
  let refreshReq = 0;
  const env = { BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k' };
  let refreshOrigin = null;
  const r = await getPrograms(env, { fresh: true, origin: 'https://deploy-preview-1--x.netlify.app', triggerRefresh: async (_e, o) => { refreshReq++; refreshOrigin = o; } });
  assert.equal(refreshOrigin, 'https://deploy-preview-1--x.netlify.app', '요청이 들어온 배포 주소로 수집 요청');
  assert.equal(r.mode, 'live');
  assert.equal(r.totalCollected, 3);
  assert.deepEqual(r.programs.map((p) => p.sourceProgramId).sort(), ['KS_9', 'P1']);
  assert.ok(r.programs.every((p) => !('rawSummary' in p)));
  assert.equal(refreshReq, 1, '백그라운드 수집 요청');
  assert.ok((await readSnapshot())?.count === 2, '스냅샷 저장');
  const before = calls.bizinfo;
  await getPrograms(env, { fresh: true, triggerRefresh: noRefresh });
  await getPrograms(env, { triggerRefresh: noRefresh });
  assert.equal(calls.bizinfo, before, '스냅샷이 있으면 외부 API를 부르지 않음');
});

test('programs: 오래된 스냅샷은 그대로 응답하면서 갱신 요청, 응답 시점에 마감 공고 제외', async () => {
  _resetCache(); _setStore(memStore());
  stubFetch();
  const { writeSnapshot } = await import('../netlify/lib/collect.mjs');
  await writeSnapshot({ mode: 'live', fetchedAt: '2026-01-01T00:00:00Z', errors: {}, count: 2, programs: [{ sourceProgramId: 'A', applicationEnd: '2099-01-01' }, { sourceProgramId: 'B', applicationEnd: '2020-01-01' }] });
  let refreshReq = 0;
  const r = await getPrograms({ BIZINFO_API_KEY: 'b' }, { fresh: true, triggerRefresh: async () => { refreshReq++; } });
  assert.deepEqual(r.programs.map((p) => p.sourceProgramId), ['A']);
  assert.equal(refreshReq, 1);
});

test('수집 함수: 최근 스냅샷이면 건너뜀(반복 호출로 쿼터 소모 불가), 일시 장애로 급감하면 이전 유지', async () => {
  _setStore(memStore());
  const calls = stubFetch({ bizinfo: BIZ, kstartup: KS });
  const env = { BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k' };
  const a = await refreshSnapshot(env);
  assert.equal(a.written, true);
  const b = await refreshSnapshot(env);
  assert.equal(b.skipped, true);
  assert.equal(calls.bizinfo, 1);
  stubFetch({ bizinfo: [], fail: { kstartup: true } });
  const later = Date.now() + 60 * 60 * 1000;
  const c = await refreshSnapshot(env, { now: later });
  assert.equal(c.reason, 'degraded');
  assert.equal((await readSnapshot()).count, 2);
});

test('programs: 한 소스가 실패해도 나머지로 동작(부분 결과는 스냅샷 미저장)', async () => {
  _resetCache(); _setStore(memStore());
  stubFetch({ bizinfo: BIZ, fail: { kstartup: true } });
  const r = await getPrograms({ BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k' }, { fresh: true, triggerRefresh: noRefresh });
  assert.equal(r.mode, 'live');
  assert.ok(r.errors.kstartup);
  assert.equal(r.sourceCounts.bizinfo, 2);
  assert.equal(await readSnapshot(), null);
});

test('programs: AI 키가 있으면 살아 있는 기업마당 공고만 추출, 근거 대조 후 병합', async () => {
  _resetCache(); _setStore(memStore());
  const calls = stubFetch({ bizinfo: BIZ, kstartup: KS, claude: { businessAgeMax: 7, evidence: { businessAgeMax: '창업 7년 이내' }, confidence: 'high' } });
  const r = await getPrograms({ BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test' }, { fresh: true, triggerRefresh: noRefresh });
  assert.equal(calls.claude, 1, '마감 공고·K-Startup은 AI 호출 대상 아님');
  const p1 = r.programs.find((p) => p.sourceProgramId === 'P1');
  assert.equal(p1._aiEnriched, true);
  assert.equal(p1.businessAgeMax, 7);
  assert.equal(r.enriched, 1);
});

test('programs handler: 키 값 비노출, 완전한 결과만 CDN 캐시', async () => {
  _resetCache(); _setStore(memStore());
  const calls = stubFetch({ bizinfo: BIZ, kstartup: KS, claude: {} });
  const saved = { ...process.env };
  Object.assign(process.env, { BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test' });
  delete process.env.URL;
  try {
    const res = await programsHandler(new Request('http://x/.netlify/functions/programs?enrichCount=30&max=5000'));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('netlify-cdn-cache-control'), /s-maxage=600/);
    assert.ok(calls.claude <= 12);
    assert.ok(!(await res.text()).includes('sk-test'));
  } finally { process.env = saved; }
});

test('health: 키 값은 반환하지 않음', async () => {
  const saved = { ...process.env };
  process.env.ANTHROPIC_API_KEY = 'canary-secret-value';
  try {
    const res = await health();
    assert.ok(!res.body.includes('secret'));
    assert.equal(JSON.parse(res.body).claude, 'ready');
  } finally { process.env = saved; }
});

test('공고문 분석(실제 공고 앞부분): 라벨 글머리 줄, 소재 시·도, 예비창업자 허용', async () => {
  const fs = await import('node:fs');
  // 기업마당 공고문 PDF 5건에서 뽑은 텍스트 앞부분(미리보기 배포에서 수집)
  const f = JSON.parse(fs.readFileSync(new URL('./fixtures/notice-heads.json', import.meta.url), 'utf8'));
  const a = (id) => analyzeDocText(f[`PBLN_000000000${id}`]);
  assert.deepEqual(a(127259).regions, ['충북']);
  assert.equal(a(127259).preStartupAllowed, true);
  assert.deepEqual(a(127256).regions, ['전남'], "'舊 전라남도 지역'은 전남만");
  assert.deepEqual(a(127322).regions, ['광주', '전남']);
  assert.deepEqual(a(127316).regions, ['강원']);
  assert.equal(a(127257).regions, undefined, '응모자격에 소재지 없음');
  assert.equal(a(127257).sectionFound, true, "'ㅇ (응모자격) …' 글머리 줄 인식");
  // 라벨 아닌 줄('지원 제외 대상', '지원대상 사업')은 자격으로 읽지 않음
  const r = analyzeDocText('❍ 지원 제외 대상 : 서울 소재 기업\n❍ 지원대상 사업 : 창업 3년 이내');
  assert.equal(r.regions, undefined);
  assert.equal(r.fields, undefined);
  assert.equal(analyzeDocText('❍ 신청자격 : 경상북도 소재 제조기업과 전국소재 서비스기업').regions, undefined);
  assert.equal(analyzeDocText('❍ 신청자격 : 중소기업\n※ 타 지역 소재 기업도 참여 가능하나, 충북 내 본사 이전 필요').regions, undefined);
  const neg = analyzeDocText('❍ 신청자격 : 중소기업\n- 예비창업자는 신청 불가');
  assert.equal(neg.preStartupAllowed, false);
});

test('공고문 병합: 전국 간주 공고만 소재 시·도로 바로잡고 예비창업자 허용 반영', () => {
  const doc = { status: 'ok', regions: ['충북'], regionEvidence: '충북 소재', preStartupAllowed: true, preStartupEvidence: '또는 예비창업자' };
  const q = applyDoc({ targetRegions: ['전국'], targetRegionsInferred: true, targetBusinessType: ['법인', '개인사업자'], targetBusinessTypeInferred: true, eligibilityDepth: 'listing' }, doc);
  assert.deepEqual(q.targetRegions, ['충북']);
  assert.equal(q.targetRegionsInferred, false);
  assert.equal(q.preStartupAllowed, true);
  assert.ok(q.targetBusinessType.includes('예비창업자'));
  assert.equal(q.eligibilityDepth, 'doc');
  assert.deepEqual(applyDoc({ targetRegions: ['전국'], targetRegionsInferred: false }, doc).targetRegions, ['충북'], '해시태그 전국 공고도 공고문 소재지로');
  assert.deepEqual(applyDoc({ targetRegions: ['서울'], targetRegionsInferred: false }, doc).targetRegions, ['서울'], '목록에 지역이 있으면 유지');
});

test('규칙 추출: 우대·선택 요건의 숫자는 필수 조건으로 쓰지 않음(검증 세트 오류 3건)', () => {
  assert.equal(extractRules('■ 정부지원금 추가지원 대상 여부 창업 5년이내 기업(3%) 이노비즈 인증기업(3%)'), null, '지원율 가산 항목');
  assert.equal(extractRules('중소기업 중 아래 하나에 해당되는 기업 m 제조업 전업률 30% 이상 m 벤처기업 m 최근 1년 동안 월평균 상시근로자수 5인 이상'), null, '선택지 목록');
  assert.equal(extractRules('기술혁신기업 : 기술창업기업(업력 7년미만), 중소벤처기업, 중소이노비즈기업'), null, '나열된 유형 정의');
  // 필수 조건은 유지
  assert.equal(extractRules('청년 창업기업(창업 3년 이내)으로 상시근로자 10인 미만').fields.businessAgeMax, 3);
  assert.equal(extractRules('다음 중 하나에 해당하는 기업은 제외 1. 휴업 2. 신청자격 가. 창업 7년 이내 기업').fields.businessAgeMax, 7, '선택지 목록이 끝난 뒤의 조건');
});

test('공고문 지역: 여러 시·도 목록 좁히기, 시·군 이름·특례시 표기', () => {
  const doc = { status: 'ok', regions: ['대구'], regionEvidence: '대구 소재' };
  assert.deepEqual(applyDoc({ targetRegions: ['대구', '경북'], targetRegionsInferred: false }, doc).targetRegions, ['대구']);
  assert.deepEqual(applyDoc({ targetRegions: ['서울', '경기'], targetRegionsInferred: false }, doc).targetRegions, ['서울', '경기'], '목록 밖 지역으로는 바꾸지 않음');
  const g = analyzeDocText('□ 지원대상\n○ 과천시에 사업장을 두고 운영 중인 중소기업');
  assert.deepEqual(g.regions, ['경기']);
  assert.deepEqual(g.districts, ['과천시']);
  assert.deepEqual(analyzeDocText('□ 지원대상\n○ 본사가 경상남도 창원특례시에 소재한 기업', { regions: ['경남'] }).districts, ['창원시']);
  assert.deepEqual(analyzeDocText('□ 지원 대상\n◦ 경북·구미지역 내에 소재(본사, 공장)한 중소기업', { regions: ['경북'] }).districts, ['구미시']);
  assert.equal(analyzeDocText('□ 지원대상\n○ 고성군 소재 기업').regions, undefined, '두 도에 있는 이름(고성군)은 판단 보류');
});

test('규칙 추출: 구간표·제외 문맥·업종별 기준은 자격 조건 아님(2차 검증 세트)', () => {
  assert.equal(extractRules('매출액 규모 50억 이상 30억 이상~50억 미만 10억 이상~30억미만 3억 초과~10억 미만 3억 미만 성장단계 5점 4점 3점'), null, '평가 점수표');
  assert.equal(extractRules('∎ (총매출액 3억이하) 카드매출액의 0.4% 지원 ∎ (총매출액 3억초과 5억이하) 카드매출액의 1.0% 지원')?.fields?.revenueMin, undefined, '지원율 구간표');
  assert.equal(extractRules('연매출액 기준 이상 (업력 1년 미만, 면세법인사업자 심사 제외)'), null, '제외 괄호');
  assert.equal(extractRules('※ 도‧소매업, 음식업, 숙박업: 상시 종업원수 5인 이상 업체'), null, '특정 업종에만 붙은 기준');
  assert.equal(extractRules('상시근로자 5인 미만(제조, 건설, 운수, 광업 10인 미만) 소상공인'), null, '업종별로 다른 기준');
  assert.equal(extractRules('지원대상 확대 ￭ 업력 1년 이상 ￭ 업력 6개월 이상'), null, '개월 단위·변경 전후 비교표는 보류');
  assert.equal(extractRules('보조금을 지원받은 사업자는 해당 방지시설을 3년 이상 운영하여야 함'), null, '시설 운영 의무는 업력 아님');
});

test('규칙 추출: 업력·근로자·대표자 연령 표현 확장(개선 우선순위 4)', () => {
  assert.equal(extractRules('사업 개시 3년 미만의 기창업자').fields.businessAgeMax, 3);
  assert.equal(extractRules('* 창업기업 : 사업개시일로부터 7년 이내 기업').fields.businessAgeMax, 7);
  assert.equal(extractRules('대표로서 1년 이상 사업을 운영하고 있는 기업').fields.businessAgeMin, 1);
  assert.equal(extractRules('- 고용보험 피보험자 5인 이상 기업(소상공인, 중소·중견기업)').fields.employeeMin, 5);
  const r = extractRules('상시근로자 5인 이상 300인 미만의 중소기업');
  assert.deepEqual([r.fields.employeeMin, r.fields.employeeMax], [5, 299]);
  assert.equal(extractRules('수혜기업 중 50인 미만 중소사업장').fields.employeeMax, 49);
  assert.equal(extractRules('재취업지원서비스 1,000인 이상 의무대상기업').fields.employeeMin, 1000);
  assert.equal(extractRules('신청자가 대표자로 있는 사업장에 상시 근로자가 없는 1인 장애인기업').fields.employeeMax, 0);
  assert.equal(extractRules('동래구에 소재하며 18~39세 이하의 청년이 대표로서').fields.representativeAgeMax, 39);
  assert.equal(extractRules('도내 창업을 희망하는 만 40세 이상인 자').fields.representativeAgeMin, 40);
  assert.equal(extractRules('만 15세 이상~ 34세 이하 취업애로유형 청년'), null, '채용 대상 청년 연령은 대표자 조건 아님');
});

test('공고문 시·군 나열: 대상 지역을 알리는 말 뒤 같은 시·도 시·군 3개 이상', () => {
  assert.deepEqual(analyzeDocText('□ 지원대상\n○ 14개 시군 소재 중소기업\n※ 14개 시군 : 포항, 경주, 안동, 구미', { regions: ['경북'] }).districts, ['포항시', '경주시', '안동시', '구미시']);
  assert.deepEqual(analyzeDocText('□ 신청지역\n○ 안동, 구미, 영천, 울릉', { regions: ['경북'] }).districts, ['안동시', '구미시', '영천시', '울릉군']);
  assert.equal(analyzeDocText('□ 지원기관별 한도\n창원시 1백만원 밀양시 2백만원 양산시 1백만원', { regions: ['경남'] }).districts, undefined, '알림말 없는 표는 무시');
  assert.equal(analyzeDocText('□ 신청지역\n○ 창원, 진주', { regions: ['경남'] }).districts, undefined, '2개 이하는 무시');
});

// ---------- 카카오 챗봇 허브(오픈빌더 스킬 v2.0) ----------
import kakaoSkill, { _resetBotCache } from '../netlify/functions/kakao-skill.mjs';
import { route, searchPrograms, ddayKst } from '../netlify/lib/bot/kakao.mjs';
import { TOOLS } from '../netlify/lib/bot/tools.mjs';

const BOT_NOW = Date.parse('2026-10-29T03:00:00Z'); // 한국시간 10-29 12:00
const botPrograms = [
  { programName: '2026년 소상공인 정책자금 융자사업 공고', agency: '중소벤처기업부', applicationEnd: '2026-11-03', originalUrl: 'https://www.bizinfo.go.kr/a' },
  { programName: '[서울] 2026년 중소기업 정책 자금 지원', agency: '서울특별시', applicationEnd: null, originalUrl: 'https://www.bizinfo.go.kr/b' },
  { programName: '2026년 스마트공장 구축 지원', agency: '중소벤처기업부', applicationEnd: '2026-10-29', originalUrl: 'javascript:alert(1)' },
  { programName: '2026년 수출상담회 참가기업 모집', agency: 'KOTRA', applicationEnd: '2026-12-31', originalUrl: 'https://www.bizinfo.go.kr/c' },
];
// 카카오 제한 검사: 출력 3개·바로가기 10개(라벨 14자)·리스트 5개·캐러셀 10장·카드 설명 230자·링크는 https만
function assertKakao(res) {
  assert.equal(res.version, '2.0');
  const { outputs, quickReplies = [] } = res.template;
  assert.ok(outputs.length >= 1 && outputs.length <= 3);
  assert.ok(quickReplies.length <= 10 && quickReplies.every((q) => q.label.length <= 14 && q.action === 'message'));
  for (const o of outputs) {
    if (o.listCard) { assert.ok(o.listCard.items.length <= 5); o.listCard.items.forEach((i) => { if (i.link) assert.match(i.link.web, /^https:\/\//); }); }
    if (o.carousel) { assert.ok(o.carousel.items.length <= 10); o.carousel.items.forEach((c) => assert.ok(c.description.length <= 230)); }
    if (o.basicCard) assert.ok((o.basicCard.description || '').length <= 230);
  }
}

test('챗봇: 처음·메뉴는 인사와 메뉴 바로가기, 응답 형식이 카카오 제한 안', () => {
  const r = route('처음', botPrograms, BOT_NOW);
  assertKakao(r);
  assert.match(r.template.outputs[0].simpleText.text, /비코닉/);
  assert.deepEqual(r.template.quickReplies.map((q) => q.label), ['지원사업 찾기', '사업명 검색', '마감 임박', '경영진단', '상담 연결']);
  assertKakao(route('', botPrograms, BOT_NOW));
});

test('챗봇: 사업명 검색은 띄어쓰기 무시·마감 가까운 순·https 링크만', () => {
  assert.deepEqual(searchPrograms(botPrograms, '정책 자금', BOT_NOW).map((p) => p.agency), ['중소벤처기업부', '서울특별시']);
  const r = route('정책자금', botPrograms, BOT_NOW);
  assertKakao(r);
  const lc = r.template.outputs[0].listCard;
  assert.match(lc.header.title, /정책자금.*2건/);
  assert.match(lc.items[0].description, /D-5/);
  assert.match(lc.items[1].description, /예산 소진/);
  const s = route('스마트공장', botPrograms, BOT_NOW).template.outputs[0].listCard.items[0];
  assert.match(s.description, /오늘 마감/);
  assert.equal(s.link, undefined, 'javascript: 링크는 넣지 않음');
});

test('챗봇: 공고 없으면 안내+맞춤 매칭, 진단 키워드는 진단툴 카드, 공고명에 있으면 공고 우선', () => {
  const none = route('존재하지않는사업', botPrograms, BOT_NOW);
  assertKakao(none);
  assert.match(none.template.outputs[0].simpleText.text, /지금은 없어요/);
  const fin = route('재무 진단', botPrograms, BOT_NOW);
  assert.equal(fin.template.outputs[0].carousel.items[0].title, '기업 재무진단');
  const finBtns = route('재무', botPrograms, BOT_NOW).template.outputs[0].carousel.items[0].buttons;
  assert.deepEqual(finBtns.map((b) => b.action), ['message', 'phone'], '진단툴은 링크 없이 상담 연결만(AI 연동 보호 전)');
  for (const q of ['처음', '경영진단', '재무', '인사 진단', '기술', '성장전략', '정책자금', '상담 연결', '없는말']) {
    assert.ok(!/beconic-diagnosis/.test(JSON.stringify(route(q, botPrograms, BOT_NOW))), `진단툴 주소 노출 금지: ${q}`);
  }
  assert.ok(route('수출상담회', botPrograms, BOT_NOW).template.outputs[0].listCard, '"상담"이 들어간 공고명은 상담 연결이 아니라 검색');
  const all = route('경영진단', botPrograms, BOT_NOW);
  assertKakao(all);
  assert.equal(all.template.outputs[1].carousel.items.length, TOOLS.length);
});

test('챗봇: 상담 요청 글(앱 복사 문구·전화번호·긴 글)은 검색하지 않고 접수 안내', () => {
  const appText = '[지원사업 신청 도움 요청]\n· 사업명: 2026년 소상공인 정책자금 융자사업 공고\n· 필요한 도움: 사업계획서 작성·검토\n· 연락처(이름·전화): ';
  const r = route(appText, botPrograms, BOT_NOW);
  assertKakao(r);
  assert.match(r.template.outputs[0].simpleText.text, /접수됐어요[\s\S]*소상공인 정책자금 융자사업/);
  assert.match(route('홍길동 010-1234-5678 사업계획서 상담 원해요', botPrograms, BOT_NOW).template.outputs[0].simpleText.text, /접수됐어요/);
  assert.ok(route('정책자금', botPrograms, BOT_NOW).template.outputs[0].listCard, '짧은 사업명은 그대로 검색');
});

test('챗봇: 말풍선·카드 줄바꿈 유지, 요청 양식 → 채운 양식은 접수', () => {
  assert.match(route('처음', botPrograms, BOT_NOW).template.outputs[0].simpleText.text, /비코닉입니다 🙂\n\n/, '줄바꿈이 공백으로 뭉개지지 않음');
  assert.match(route('상담 연결', botPrograms, BOT_NOW).template.outputs[0].basicCard.description, /\n✔ 사업계획서/);
  const form = route('상담 요청합니다', botPrograms, BOT_NOW);
  assertKakao(form);
  assert.match(form.template.outputs[1].simpleText.text, /^회사명:\n업종\/지역:/);
  assert.match(route('회사명: 비코닉\n관심 사업: 수출바우처', botPrograms, BOT_NOW).template.outputs[0].simpleText.text, /접수됐어요/);
  assert.ok(!/접수됐어요/.test(route('회사명:\n업종/지역:', botPrograms, BOT_NOW).template.outputs[0].simpleText?.text || ''), '빈 양식은 접수로 보지 않음');
});

test('챗봇: 마감 임박·상담 연결·공고 미준비', () => {
  const soon = route('마감 임박', botPrograms, BOT_NOW);
  assertKakao(soon);
  assert.deepEqual(soon.template.outputs[0].listCard.items.map((i) => i.title.slice(0, 13)), ['2026년 스마트공장 구축', '2026년 소상공인 정책자금 '].map((t) => t.slice(0, 13)));
  const c = route('상담 연결', botPrograms, BOT_NOW);
  assertKakao(c);
  assert.equal(c.template.outputs[0].basicCard.buttons[0].action, 'phone');
  assert.match(route('정책자금', null, BOT_NOW).template.outputs[0].simpleText.text, /불러오는 중/);
  assert.equal(ddayKst('2026-10-28', BOT_NOW), -1);
});

test('챗봇 스킬 함수: POST만·토큰 검사·스냅샷 공고로 응답', async () => {
  const mem = new Map();
  _setStore({ get: async (k) => mem.get(k) ?? null, setJSON: async (k, v) => { mem.set(k, v); } });
  _resetBotCache();
  mem.set('latest', { mode: 'live', fetchedAt: new Date().toISOString(), programs: [{ programName: '2099년 테스트 정책자금', agency: '기관', applicationEnd: '2099-12-31', originalUrl: 'https://x.kr/1' }] });
  const call = (body, headers = {}) => kakaoSkill(new Request('https://example.netlify.app/api/kakao/skill', { method: 'POST', headers, body: JSON.stringify(body) }), {});
  assert.equal((await kakaoSkill(new Request('https://example.netlify.app/api/kakao/skill'), {})).status, 405);
  process.env.KAKAO_SKILL_TOKEN = 't0ken';
  assert.equal((await call({ userRequest: { utterance: '처음' } })).status, 401);
  const ok = await call({ userRequest: { utterance: '정책자금' } }, { 'x-beconic-skill-token': 't0ken' });
  delete process.env.KAKAO_SKILL_TOKEN;
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assertKakao(j);
  assert.equal(j.template.outputs[0].listCard.items[0].title, '2099년 테스트 정책자금');
  assert.equal((await kakaoSkill(new Request('https://example.netlify.app/api/kakao/skill', { method: 'POST', body: '{' }), {})).status, 400);
  const welcome = await (await call({ intent: { name: '웰컴 블록' }, userRequest: { utterance: '아무 문장', block: { name: '웰컴 블록' } } })).json();
  assert.match(welcome.template.outputs[0].simpleText.text, /비코닉/, '웰컴 블록은 문장과 관계없이 첫 메뉴');
  _setStore(null);
});
