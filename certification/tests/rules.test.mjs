// 판정 엔진 회귀 테스트 — v2.0 §05 필수 10종 + 제도별 시나리오 + 레드팀 공격 케이스
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, combineAnd, combineOr, evaluateNode, evaluateScheme, gateRulePack, fullYearsBetween, parseDate, schemeLabel } from '../src/engine.js';
import { computeReadiness, evidenceFromUser, assertReachable, EVIDENCE } from '../src/readiness.js';
import { buildReport } from '../src/model.js';
import { loadDataSync, AS_OF } from './helpers.mjs';

const D = loadDataSync();
const run = (id, answers, asOf = AS_OF) => evaluateScheme(D.packs[id], answers, { asOf, sources: D.sourceMap });
const path = (r, pid) => r.pathways.find((p) => p.pathway_id === pid);
const leaf = (r, pid, lid) => path(r, pid).leaves.find((l) => l.id === lid);

const CORP_OK = { biz_status: 'corporation', founded_on: '2020-03-02', converted_from_individual: 'no', suspended_period: 'no', is_sme: 'yes', company_size: 'small', industry: 'software_582' };

// ── 필수 1~7: 4값 결합 ──
test('R01 AND(PASS,FAIL) -> FAIL', () => assert.equal(combineAnd([S.PASS, S.FAIL]), S.FAIL));
test('R02 AND(PASS,UNKNOWN) -> UNKNOWN', () => assert.equal(combineAnd([S.PASS, S.UNKNOWN]), S.UNKNOWN));
test('R03 OR(FAIL,PASS) -> PASS (대체 경로 오판 방지)', () => assert.equal(combineOr([S.FAIL, S.PASS]), S.PASS));
test('R04 OR(FAIL,UNKNOWN) -> UNKNOWN', () => assert.equal(combineOr([S.FAIL, S.UNKNOWN]), S.UNKNOWN));
test('R05 OR(FAIL,FAIL) -> FAIL', () => assert.equal(combineOr([S.FAIL, S.FAIL]), S.FAIL));
test('R06 OR(N/A,PASS) -> PASS', () => assert.equal(combineOr([S.NA, S.PASS]), S.PASS));
test('R07 OR(N/A,N/A) -> N/A', () => assert.equal(combineOr([S.NA, S.NA]), S.NA));
test('R07b AND(N/A,N/A) -> N/A, AND(PASS,N/A) -> PASS, AND(FAIL,UNKNOWN) -> FAIL', () => {
  assert.equal(combineAnd([S.NA, S.NA]), S.NA);
  assert.equal(combineAnd([S.PASS, S.NA]), S.PASS);
  assert.equal(combineAnd([S.FAIL, S.UNKNOWN]), S.FAIL);
});

// ── 필수 8: 미검증 규칙에서 확정값 생성 금지 ──
test('R08a 규칙팩 review_status가 VERIFIED가 아니면 판정 차단', () => {
  for (const st of ['DRAFT', 'UNVERIFIED', 'CONFLICTED', 'EXPIRED']) {
    const pack = { ...D.packs.VEN, review_status: st };
    const r = evaluateScheme(pack, { ...CORP_OK, ven_excluded_industry: 'no', ven_invest_total: 10000, ven_capital: 5000, ven_qualified_investor: 'yes' }, { asOf: AS_OF, sources: D.sourceMap });
    assert.equal(r.basic, 'OUT_OF_SCOPE', st);
    assert.equal(r.pathways.length, 0);
  }
});
test('R08b 미검증 원자요건(이노비즈 별표 2)은 답과 무관하게 UNKNOWN', () => {
  const r = run('INNO', { ...CORP_OK, x_credit: 'no', x_dishonor: 'no', x_insolvency: 'none', x_violation: 'no' });
  const l = leaf(r, 'INNO-NEW', 'INNO-X-INDUSTRY');
  assert.equal(l.status, S.UNKNOWN);
  assert.equal(l.unverified, true);
  assert.equal(r.basic, S.UNKNOWN, '미검증 요건 때문에 PASS로 확정하지 않음');
});
test('R08c 출처가 없거나 접속 미확인 출처만 가진 원자요건은 자동 판정 금지', () => {
  const ctx = { answers: { is_sme: 'yes' }, asOf: AS_OF, sources: D.sourceMap };
  const noSrc = evaluateNode({ type: 'LEAF', id: 'X', label: 'x', check: 'yes', args: { q: 'is_sme' }, source_refs: [] }, ctx);
  assert.equal(noSrc.status, S.UNKNOWN); assert.equal(noSrc.unverified, true);
  const blocked = evaluateNode({ type: 'LEAF', id: 'X', label: 'x', check: 'yes', args: { q: 'is_sme' }, source_refs: ['S-FCC'] }, ctx);
  assert.equal(blocked.status, S.UNKNOWN, '403 차단 출처만으로는 판정하지 않음');
  const ok = evaluateNode({ type: 'LEAF', id: 'X', label: 'x', check: 'yes', args: { q: 'is_sme' }, source_refs: ['S-VEN-A'] }, ctx);
  assert.equal(ok.status, S.PASS);
});
test('R08d 규칙팩이 존재하지 않는 출처 ID를 참조하면 게이트 차단', () => {
  const pack = JSON.parse(JSON.stringify(D.packs.MAIN));
  pack.pathways[0].root.then.children[0].source_refs = ['S-NOPE'];
  assert.equal(gateRulePack(pack, AS_OF, D.sourceMap).code, 'SOURCE_MISSING');
});
test('R08e 정보형 제도(규칙팩 없음)는 판정 범위 밖', () => {
  assert.equal(gateRulePack(null, AS_OF, D.sourceMap).active, false);
  assert.equal(schemeLabel('OUT_OF_SCOPE').text, '판정 범위 밖');
});

// ── 필수 9: 자가응답만으로 '검증 완료' 생성 금지 ──
test('R09 증빙 자가응답은 SELF_DECLARED까지만, 검증 완료 상태로 승격 불가', () => {
  assert.equal(evidenceFromUser('have'), EVIDENCE.SELF_DECLARED_AVAILABLE);
  assert.equal(evidenceFromUser('verified'), EVIDENCE.UNKNOWN);
  assert.equal(evidenceFromUser('EXPERT_VERIFIED'), EVIDENCE.UNKNOWN);
  assert.throws(() => assertReachable(EVIDENCE.EXPERT_VERIFIED));
  assert.throws(() => assertReachable(EVIDENCE.FILE_PROVIDED_LOCAL));
  const r = computeReadiness(D.schemeMap.VEN.readiness_items, CORP_OK, Object.fromEntries(D.schemeMap.VEN.readiness_items.map((i) => [i.item_id, 'have'])));
  assert.ok(r.rows.every((x) => x.status !== EVIDENCE.EXPERT_VERIFIED && x.status !== EVIDENCE.FILE_PROVIDED_LOCAL));
});

// ── 필수 10: 유효일·기준일·신청유형 변경 시 재계산 ──
test('R10a 규칙 시작일 이전 기준일 → 판정 차단', () => {
  assert.equal(gateRulePack(D.packs.RNDI, '2026-01-31', D.sourceMap).code, 'NOT_YET_EFFECTIVE');
  assert.equal(gateRulePack(D.packs.RNDI, '2026-02-01', D.sourceMap).active, true);
});
test('R10b 근거 재확인 기한 경과 → 판정 차단(E13)', () => {
  assert.equal(gateRulePack(D.packs.VEN, '2027-05-23', D.sourceMap).code, 'REVIEW_OVERDUE');
  const r = run('VEN', CORP_OK, '2027-06-01');
  assert.equal(r.basic, 'OUT_OF_SCOPE');
});
test('R10c valid_to 지난 규칙 → EXPIRED 차단', () => {
  assert.equal(gateRulePack({ ...D.packs.MAIN, valid_to: '2026-11-01' }, AS_OF, D.sourceMap).code, 'EXPIRED');
});
test('R10d 잘못된 기준일 → 차단', () => assert.equal(gateRulePack(D.packs.MAIN, '2026-02-30', D.sourceMap).code, 'BAD_AS_OF'));
test('R10e 기준일이 바뀌면 업력 판정도 바뀜', () => {
  const a = { ...CORP_OK, founded_on: '2023-12-01' };
  assert.equal(leaf(run('INNO', a, '2026-11-30'), 'INNO-NEW', 'INNO-AGE').status, S.FAIL);
  assert.equal(leaf(run('INNO', a, '2026-12-01'), 'INNO-NEW', 'INNO-AGE').status, S.PASS);
});
test('R10f 사업자 형태 변경(법인→예비창업) 시 벤처 경로 재계산', () => {
  const r1 = run('VEN', { ...CORP_OK, ven_excluded_industry: 'no' });
  assert.equal(path(r1, 'VEN-PRE').basic, S.NA);
  const r2 = run('VEN', { biz_status: 'pre', ven_excluded_industry: 'no' });
  assert.equal(path(r2, 'VEN-PRE').basic, S.PASS);
  assert.equal(path(r2, 'VEN-INV').basic, S.NA);
  assert.equal(r2.basic, S.PASS);
});

// ── 날짜 ──
test('D01 없는 날짜·미래 날짜 처리', () => {
  assert.equal(parseDate('2025-02-29'), null);
  assert.ok(parseDate('2024-02-29'));
  assert.equal(fullYearsBetween('2023-11-23', '2026-11-22'), 2);
  assert.equal(fullYearsBetween('2023-11-22', '2026-11-22'), 3);
  const r = run('INNO', { ...CORP_OK, founded_on: '2030-01-01' });
  assert.equal(leaf(r, 'INNO-NEW', 'INNO-AGE').status, S.UNKNOWN);
});

// ── 벤처(E06): 한 경로 FAIL + 다른 경로 PASS면 전체 FAIL 금지 ──
test('T-VEN-01 투자유형 FAIL이어도 혁신성장유형 기본요건 PASS면 전체 PASS', () => {
  const r = run('VEN', { ...CORP_OK, ven_excluded_industry: 'no', ven_invest_total: 1000, ven_capital: 5000, ven_qualified_investor: 'yes' });
  assert.equal(path(r, 'VEN-INV').basic, S.FAIL);
  assert.equal(path(r, 'VEN-GROWTH').basic, S.PASS);
  assert.equal(r.basic, S.PASS);
  assert.equal(r.overall, S.UNKNOWN, '평가 단계는 남아 있어 최종은 미정');
});
test('T-VEN-02 투자 5천만·비율 10%·적격 → 투자유형 기본요건 PASS', () => {
  const r = run('VEN', { ...CORP_OK, ven_excluded_industry: 'no', ven_invest_total: 5000, ven_capital: 50000, ven_qualified_investor: 'yes' });
  assert.equal(path(r, 'VEN-INV').basic, S.PASS);
});
test('T-VEN-03 투자비율 8%: 문화산업 제작자 법인 여부에 따라 PASS/FAIL/UNKNOWN', () => {
  const base = { ...CORP_OK, ven_excluded_industry: 'no', ven_invest_total: 8000, ven_capital: 100000, ven_qualified_investor: 'yes' };
  assert.equal(leaf(run('VEN', { ...base, ven_culture_producer: 'yes' }), 'VEN-INV', 'VEN-INV-RATIO').status, S.PASS);
  assert.equal(leaf(run('VEN', { ...base, ven_culture_producer: 'no' }), 'VEN-INV', 'VEN-INV-RATIO').status, S.FAIL);
  assert.equal(leaf(run('VEN', base), 'VEN-INV', 'VEN-INV-RATIO').status, S.UNKNOWN);
});
test('T-VEN-04 제외 업종이면 모든 경로 FAIL → 전체 FAIL', () => {
  const r = run('VEN', { ...CORP_OK, ven_excluded_industry: 'yes' });
  assert.equal(r.basic, S.FAIL);
});
test('T-VEN-05 연구개발유형: 창업 3년 미만이면 비율 N/A, 3년 이상이면 업종·매출 규모별 기준', () => {
  const young = run('VEN', { ...CORP_OK, founded_on: '2025-01-10', ven_excluded_industry: 'no', rnd_unit: 'institute', ven_rd_spend: 6000, ven_revenue: 1000000 });
  assert.equal(leaf(young, 'VEN-RD', 'VEN-RD-RATIO').status, S.NA);
  assert.equal(path(young, 'VEN-RD').basic, S.PASS);
  // SW(582) 매출 50억 미만 → 10%: 6천/5억=12% PASS, 6천/10억=6% FAIL
  const ok = run('VEN', { ...CORP_OK, ven_excluded_industry: 'no', rnd_unit: 'institute', ven_rd_spend: 6000, ven_revenue: 50000 });
  assert.equal(leaf(ok, 'VEN-RD', 'VEN-RD-RATIO').status, S.PASS);
  const ng = run('VEN', { ...CORP_OK, ven_excluded_industry: 'no', rnd_unit: 'institute', ven_rd_spend: 6000, ven_revenue: 100000 });
  assert.equal(leaf(ng, 'VEN-RD', 'VEN-RD-RATIO').status, S.FAIL);
  // 매출 100억 이상 SW → 8%
  const big = run('VEN', { ...CORP_OK, ven_excluded_industry: 'no', rnd_unit: 'institute', ven_rd_spend: 90000, ven_revenue: 1000000 });
  assert.equal(leaf(big, 'VEN-RD', 'VEN-RD-RATIO').status, S.PASS);
  // 업종 모름 + 비율 7% → 업종 따라 다름 → UNKNOWN
  const unk = run('VEN', { ...CORP_OK, industry: 'unknown', ven_excluded_industry: 'no', rnd_unit: 'institute', ven_rd_spend: 7000, ven_revenue: 100000 });
  assert.equal(leaf(unk, 'VEN-RD', 'VEN-RD-RATIO').status, S.UNKNOWN);
});
test('T-VEN-06 창업일 모름 → 비율 분기 UNKNOWN(N/A로 바꾸지 않음)', () => {
  const r = run('VEN', { ...CORP_OK, founded_on: undefined, ven_excluded_industry: 'no', rnd_unit: 'institute', ven_rd_spend: 6000, ven_revenue: 100000 });
  const when = path(r, 'VEN-RD').tree.then.children.find((c) => c.id === 'VEN-RD-RATIO-WHEN');
  assert.equal(when.status, S.UNKNOWN);
});

// ── 이노비즈·메인비즈 ──
test('T-INNO-01 업력 2년 법인(전환 아님) → FAIL', () => {
  const r = run('INNO', { ...CORP_OK, founded_on: '2025-01-01', x_credit: 'no', x_dishonor: 'no', x_insolvency: 'none', x_violation: 'no' });
  assert.equal(r.basic, S.FAIL);
});
test('T-INNO-02 업력 2년 법인이지만 개인사업자에서 전환 → 업력 승계 가능성 UNKNOWN', () => {
  const r = run('INNO', { ...CORP_OK, founded_on: '2025-01-01', converted_from_individual: 'yes' });
  assert.equal(leaf(r, 'INNO-NEW', 'INNO-AGE').status, S.UNKNOWN);
});
test('T-INNO-03 휴업 이력 있음 → 업력 재계산 필요 UNKNOWN / 예비창업자 → N/A', () => {
  assert.equal(leaf(run('INNO', { ...CORP_OK, suspended_period: 'yes' }), 'INNO-NEW', 'INNO-AGE').status, S.UNKNOWN);
  assert.equal(run('INNO', { biz_status: 'pre' }).basic, S.NA);
  assert.equal(leaf(run('INNO', { ...CORP_OK, x_insolvency: 'rehab_ok' }), 'INNO-NEW', 'INNO-X-INSOLV').status, S.PASS);
});
test('T-MAIN-01 부채비율 1,000% 이상이면 FAIL, 999%는 통과', () => {
  const base = { ...CORP_OK, main_excluded_industry: 'no', x_credit: 'no', x_dishonor: 'no', x_insolvency: 'none', x_violation: 'no', main_capital_impaired: 'no' };
  assert.equal(run('MAIN', { ...base, main_debt_ratio: 1000 }).basic, S.FAIL);
  assert.equal(run('MAIN', { ...base, main_debt_ratio: 999 }).basic, S.PASS);
});
test('T-MAIN-02 모든 답이 모름이면 FAIL이 아니라 UNKNOWN(E05)', () => {
  const r = run('MAIN', { biz_status: 'corporation' });
  assert.equal(r.basic, S.UNKNOWN);
  assert.ok(path(r, 'MAIN-NEW').leaves.every((l) => l.status !== S.FAIL));
});

// ── 연구소·전담부서 ──
const RND = { ...CORP_OK, rnd_excluded_field: 'no', rnd_space: 'independent', rnd_equipment: 'yes', rnd_is_venture: 'no', rnd_founder_researcher: 'no' };
test('T-RNDI-01 소기업 창업 3년 경과: 3명 필요', () => {
  assert.equal(run('RNDI', { ...RND, rnd_researchers: 2 }).basic, S.FAIL);
  assert.equal(run('RNDI', { ...RND, rnd_researchers: 3 }).basic, S.PASS);
});
test('T-RNDI-02 소기업 창업 3년 미만 2명, 벤처기업 2명, 중기업 5명, 중기업 전환 1년 이내 3명', () => {
  assert.equal(run('RNDI', { ...RND, founded_on: '2025-03-01', rnd_researchers: 2 }).basic, S.PASS);
  assert.equal(run('RNDI', { ...RND, rnd_is_venture: 'yes', rnd_researchers: 2 }).basic, S.PASS);
  assert.equal(run('RNDI', { ...RND, company_size: 'medium', rnd_became_medium_1y: 'no', rnd_researchers: 4 }).basic, S.FAIL);
  assert.equal(run('RNDI', { ...RND, company_size: 'medium', rnd_became_medium_1y: 'yes', rnd_researchers: 3 }).basic, S.PASS);
  assert.equal(run('RNDI', { ...RND, company_size: 'midsize', rnd_researchers: 7 }).basic, S.PASS);
});
test('T-RNDI-03 레드팀: "연구인력 있음" 한 가지 답만으로 인정 확정 금지', () => {
  const r = run('RNDI', { biz_status: 'corporation', rnd_researchers: 5 });
  assert.equal(r.basic, S.UNKNOWN);
  assert.equal(r.overall, S.UNKNOWN);
  assert.notEqual(schemeLabel(r.basic).text, '기본요건 확인');
});
test('T-RNDI-04 규모 모름 + 2명: 기준 2~10명 → UNKNOWN, 10명이면 어떤 규모든 PASS', () => {
  const a = { ...RND, company_size: 'unknown', rnd_is_venture: 'unknown' };
  assert.equal(leaf(run('RNDI', { ...a, rnd_researchers: 2 }), 'RNDI-DOMESTIC', 'RNDI-STAFF').status, S.UNKNOWN);
  assert.equal(leaf(run('RNDI', { ...a, rnd_researchers: 10 }), 'RNDI-DOMESTIC', 'RNDI-STAFF').status, S.PASS);
  assert.equal(leaf(run('RNDI', { ...a, rnd_researchers: 1 }), 'RNDI-DOMESTIC', 'RNDI-STAFF').status, S.FAIL);
});
test('T-RNDD-01 칸막이 예외: 중소기업 + 50㎡ 초과 확보 불가 → PASS, 확보 가능 → FAIL', () => {
  const base = { ...RND, rnd_space: 'partition', rnd_researchers: 1 };
  assert.equal(run('RNDD', { ...base, rnd_space_over50_impossible: 'yes' }).basic, S.PASS);
  assert.equal(run('RNDD', { ...base, rnd_space_over50_impossible: 'no' }).basic, S.FAIL);
  assert.equal(run('RNDD', { ...base, rnd_space_over50_impossible: 'unknown' }).basic, S.UNKNOWN);
});
test('T-RNDD-02 중소기업 아님(is_sme=no)·벤처 아님이어도 SW업 전담부서는 칸막이 예외 대상', () => {
  const base = { ...RND, is_sme: 'no', rnd_space: 'partition', rnd_space_over50_impossible: 'yes', rnd_researchers: 1 };
  assert.equal(run('RNDD', { ...base, industry: 'software_582' }).basic, S.PASS);
  assert.equal(run('RNDD', { ...base, industry: 'other' }).basic, S.FAIL);
  assert.equal(run('RNDI', { ...base, industry: 'software_582', company_size: 'large', rnd_researchers: 10 }).basic, S.FAIL, '연구소에는 SW업 예외 없음');
});

// ── 결정성(E15) ──
test('E15 같은 입력·같은 버전 → 같은 결과(문서 ID 포함)', () => {
  const st = { answers: { ...CORP_OK, ven_excluded_industry: 'no' }, selected: ['VEN', 'INNO'], asOf: AS_OF, docStatus: {} };
  const a = buildReport(D, st); const b = buildReport(D, JSON.parse(JSON.stringify(st)));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
