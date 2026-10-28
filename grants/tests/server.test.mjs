// 서버 함수 단위 테스트 — 외부 API는 fetch 스텁으로 대체(네트워크·실제 키 불필요).
// 실행: node --test grants/tests/server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { regionsFromText, extractAmount, dedupe, isPastKst, stripTags } from '../netlify/lib/normalize.mjs';
import { normalizeBizinfo, parsePeriod } from '../netlify/lib/bizinfo.mjs';
import { mapBusinessAge, mapAge, normalizeKstartup } from '../netlify/lib/kstartup.mjs';
import { mergeEligibility, safeParse } from '../netlify/lib/eligibility-ai.mjs';
import programsHandler, { getPrograms, _resetCache } from '../netlify/functions/programs.mjs';
import { isAlive, refreshSnapshot, readSnapshot, _setStore, enrichLocal } from '../netlify/lib/collect.mjs';
import { extractRules } from '../netlify/lib/rule-extract.mjs';
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
  const r = await getPrograms(env, { fresh: true, triggerRefresh: async () => { refreshReq++; } });
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
