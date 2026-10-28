// 서버 함수 단위 테스트 — 외부 API는 fetch 스텁으로 대체(네트워크·실제 키 불필요).
// 실행: node --test grants/tests/server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { regionsFromText, extractAmount, dedupe, isPastKst, stripTags } from '../netlify/lib/normalize.mjs';
import { normalizeBizinfo, parsePeriod } from '../netlify/lib/bizinfo.mjs';
import { mapBusinessAge, mapAge, normalizeKstartup } from '../netlify/lib/kstartup.mjs';
import { mergeEligibility, safeParse } from '../netlify/lib/eligibility-ai.mjs';
import { getPrograms, handler, isAlive, _resetCache } from '../netlify/functions/programs.mjs';
import { handler as health } from '../netlify/functions/health.mjs';

test('지역: 정식 명칭(경상남도·전라북도 등)도 약칭으로 인식, 없으면 null', () => {
  assert.deepEqual(regionsFromText('경상남도 2026 스마트공장 지원'), ['경남']);
  assert.deepEqual(regionsFromText('전라북도경제통상진흥원'), ['전북']);
  assert.deepEqual(regionsFromText('전북특별자치도 창업 지원'), ['전북']);
  assert.deepEqual(regionsFromText('충청남도·충청북도 공동'), ['충북', '충남']);
  assert.deepEqual(regionsFromText('[서울] 소상공인'), ['서울']);
  assert.equal(regionsFromText('2026 중소기업 정책자금'), null);
});

test('지원금액: 기업당 한도만 추출, 매출·예산 문구는 무시', () => {
  assert.equal(extractAmount('매출 100억 이하 기업, 기업당 최대 5천만원 지원').max, 5e7);
  assert.equal(extractAmount('총 사업예산 50억원, 업체당 최대 2억원').max, 2e8);
  assert.equal(extractAmount('총 예산 30억원 규모로 추진').max, null);
  assert.equal(extractAmount('최대 1억 5천만원 이내').max, 1.5e8);
  assert.equal(extractAmount('과제당 3,000만원 이내 지원').max, 3e7);
  assert.equal(extractAmount('연매출 10억원 이상 기업 대상').max, null);
  assert.match(extractAmount('기업당 최대 5천만원').text, /최대 5천만원/);
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

test('programs: 키 없으면 not_configured, 외부 호출 없음', async () => {
  _resetCache();
  const calls = stubFetch();
  const r = await getPrograms({}, { fresh: true });
  assert.equal(r.mode, 'not_configured');
  assert.equal(calls.bizinfo + calls.kstartup, 0);
});

test('programs: 수집·마감 제외·응답에 본문 원문 없음·캐시로 재호출 안 함', async () => {
  _resetCache();
  const calls = stubFetch({ bizinfo: BIZ, kstartup: KS });
  const env = { BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k' };
  const r = await getPrograms(env);
  assert.equal(r.mode, 'live');
  assert.equal(r.totalCollected, 3);
  assert.deepEqual(r.programs.map((p) => p.sourceProgramId).sort(), ['KS_9', 'P1']);
  assert.ok(r.programs.every((p) => !('rawSummary' in p)));
  assert.equal(r.enriched, 0);
  await getPrograms(env);
  await getPrograms(env);
  assert.equal(calls.bizinfo, 1, '30분 캐시 안에서는 외부 API를 다시 부르지 않음');
});

test('programs: 한 소스가 실패해도 나머지로 동작', async () => {
  _resetCache();
  stubFetch({ bizinfo: BIZ, fail: { kstartup: true } });
  const r = await getPrograms({ BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k' }, { fresh: true });
  assert.equal(r.mode, 'live');
  assert.ok(r.errors.kstartup);
  assert.equal(r.sourceCounts.bizinfo, 2);
});

test('programs: AI 키가 있으면 살아 있는 기업마당 공고만 추출, 근거 대조 후 병합', async () => {
  _resetCache();
  const calls = stubFetch({ bizinfo: BIZ, kstartup: KS, claude: { businessAgeMax: 7, evidence: { businessAgeMax: '창업 7년 이내' }, confidence: 'high' } });
  const r = await getPrograms({ BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test' }, { fresh: true });
  assert.equal(calls.claude, 1, '마감 공고·K-Startup은 AI 호출 대상 아님');
  const p1 = r.programs.find((p) => p.sourceProgramId === 'P1');
  assert.equal(p1._aiEnriched, true);
  assert.equal(p1.businessAgeMax, 7);
  assert.equal(r.enriched, 1);
});

test('programs handler: 쿼리로 AI 호출 수를 늘릴 수 없고, CDN 캐시 헤더 부여', async () => {
  _resetCache();
  const calls = stubFetch({ bizinfo: BIZ, kstartup: KS, claude: {} });
  const saved = { ...process.env };
  Object.assign(process.env, { BIZINFO_API_KEY: 'b', KSTARTUP_API_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test' });
  try {
    const res = await handler({ queryStringParameters: { enrichCount: '30', max: '5000' } });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['netlify-cdn-cache-control'], /s-maxage=1800/);
    assert.ok(calls.claude <= 12);
    assert.ok(!res.body.includes('sk-test'));
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
