// 구간 답(구간 버튼) 판정 검사 — 숫자 답과 절대 모순되지 않고, 버튼 경계가 법정 기준과 같은지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataSync, AS_OF } from './helpers.mjs';
import { S, evaluateScheme, fullYearsBetween, rdRatioThresholds } from '../src/engine.js';
import { band, bandGte, evalExpr } from '../src/conditions.js';

const D = loadDataSync();
const run = (id, answers) => evaluateScheme(D.packs[id], answers, { asOf: AS_OF, sources: D.sourceMap });
const leafOf = (r, id) => r.pathways.flatMap((p) => p.leaves).find((l) => l.id === id);
const opts = (q) => D.questionMap[q].response_options.map((o) => o.value).filter((v) => v !== 'unknown');
const pick = (q, x) => opts(q).find((v) => { const b = band(v); return b.exact ? b.lo === x : x >= b.lo && x < b.hi; });

test('BAND-01 구간 해석: r:lo:hi = lo 이상 hi 미만, 같으면 정확한 값, 상한 생략 = 무한', () => {
  assert.deepEqual(band('r:5000:'), { lo: 5000, hi: Infinity, exact: false });
  assert.deepEqual(band('r:0:0'), { lo: 0, hi: 0, exact: true });
  assert.equal(band('r:9:3'), null);
  assert.equal(band('unknown'), null);
  assert.equal(bandGte(band('r:5000:'), 5000), true);
  assert.equal(bandGte(band('r:1:5000'), 5000), false);
  assert.equal(bandGte(band('r:3:7'), 5), null, '걸치면 모름');
});

test('BAND-02 모든 구간 버튼의 경계가 규칙의 법정 기준값과 일치(경계 안쪽에 기준값이 들어가면 실패)', () => {
  const crit = {
    ven_invest_total: [5000], ven_rd_spend: [5000], main_debt_ratio: [1000], ven_invest_ratio: [7, 10],
    founded_on: [3], rnd_researchers: [1, 2, 3, 5, 7, 10],
    ven_rd_ratio: [...new Set(Object.values(D.packs.VEN.tables.rd_ratio.rows).flat())],
    ven_revenue: D.packs.VEN.tables.rd_ratio.revenue_buckets_manwon,
  };
  Object.entries(crit).forEach(([q, ths]) => opts(q).forEach((v) => {
    const b = band(v);
    ths.forEach((t) => assert.ok(b.exact || !(t > b.lo && t < b.hi), `${q} ${v} 구간 안에 기준 ${t}가 들어감`));
  }));
});

test('BAND-03 숫자 답과 구간 답은 절대 모순되지 않음(충족↔미충족 뒤집힘 0건, 무작위 2만 건)', () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  let checked = 0; let unknownFromBand = 0;
  for (let i = 0; i < 4000; i += 1) {
    const yrs = rnd(10); const founded = `${2026 - yrs - 1}-0${1 + rnd(9)}-1${rnd(9)}`;
    const invest = [0, 3000, 5000, 8000, 20000][rnd(5)]; const capital = [10000, 50000, 80000, 200000][rnd(4)];
    const spend = [1000, 4999, 5000, 9000, 30000][rnd(5)]; const revenue = [100000, 499999, 500000, 900000, 1500000][rnd(5)];
    const staff = rnd(13); const debt = [100, 999, 1000, 3000][rnd(4)];
    const common = {
      biz_status: 'corporation', is_sme: 'yes', company_size: ['small', 'medium', 'midsize', 'large'][rnd(4)],
      industry: ['software_582', 'pharma_21', 'other', 'machinery_29'][rnd(4)], suspended_period: 'no', converted_from_individual: 'no',
      ven_excluded_industry: 'no', ven_qualified_investor: 'yes', ven_culture_producer: ['yes', 'no'][rnd(2)], rnd_unit: 'institute',
      rnd_is_venture: ['yes', 'no'][rnd(2)], rnd_founder_researcher: 'no', rnd_became_medium_1y: 'no', rnd_space: 'independent',
      rnd_equipment: 'yes', rnd_excluded_field: 'no', main_capital_impairment: 'no',
    };
    const numeric = { ...common, founded_on: founded, ven_invest_total: invest, ven_capital: capital, ven_rd_spend: spend, ven_revenue: revenue, rnd_researchers: staff, main_debt_ratio: debt };
    const y = fullYearsBetween(founded, AS_OF);
    const banded = {
      ...common, founded_on: pick('founded_on', y), ven_invest_total: pick('ven_invest_total', invest),
      ven_invest_ratio: pick('ven_invest_ratio', (invest / capital) * 100), ven_rd_spend: pick('ven_rd_spend', spend),
      ven_revenue: pick('ven_revenue', revenue), ven_rd_ratio: pick('ven_rd_ratio', (spend / revenue) * 100),
      rnd_researchers: pick('rnd_researchers', staff), main_debt_ratio: pick('main_debt_ratio', debt),
    };
    ['VEN', 'INNO', 'MAIN', 'RNDI', 'RNDD'].forEach((id) => {
      const a = run(id, numeric); const b = run(id, banded);
      const key = (p, l) => `${p.name}|${l.id}`;
      const la = a.pathways.flatMap((p) => p.leaves.map((l) => [key(p, l), l]));
      const lb = new Map(b.pathways.flatMap((p) => p.leaves.map((l) => [key(p, l), l])));
      la.forEach(([k, l]) => {
        const m = lb.get(k); if (!m) return;
        if (m.status === S.NA || l.status === S.NA) { assert.equal(m.status, l.status, `${id}/${k}: 적용 여부 다름 숫자 ${l.status} ↔ 구간 ${m.status} ${JSON.stringify(numeric.founded_on)} ${banded.founded_on}`); return; }
        checked += 1;
        if (m.status === S.UNKNOWN && l.status !== S.UNKNOWN) { unknownFromBand += 1; return; }
        if (l.status === S.UNKNOWN) return;
        assert.equal(m.status, l.status, `${id}/${l.id}: 숫자 ${l.status}(${l.detail}) ↔ 구간 ${m.status}(${m.detail})`);
      });
      assert.ok(!(a.basic === S.PASS && b.basic === S.FAIL) && !(a.basic === S.FAIL && b.basic === S.PASS), `${id} 기본요건 뒤집힘`);
    });
  }
  assert.ok(checked > 50000);
  // 업력 경계(만 3년 직전·직후)를 구간으로 고르면 정확한 값과 같은 구간이라 '모름'이 거의 없어야 함
  assert.ok(unknownFromBand / checked < 0.05, `구간 때문에 생긴 '확인 필요' 비율 ${(unknownFromBand / checked * 100).toFixed(2)}%`);
});

test('BAND-04 연구개발비 비율: 업종·매출 구간을 알면 기준이 하나로 정해지고, 그 기준 경계로 판정', () => {
  const T = D.packs.VEN.tables.rd_ratio;
  assert.deepEqual(rdRatioThresholds(T, 'software_582', 'r:1:500000'), [10]);
  assert.deepEqual(rdRatioThresholds(T, 'software_582', 'r:500000:1000000'), [8]);
  assert.deepEqual(rdRatioThresholds(T, 'machinery_29', 'r:1000000:'), [5]);
  assert.ok(rdRatioThresholds(T, undefined, 'r:1:500000').length > 1, '업종 모르면 여러 기준');
  const base = { biz_status: 'corporation', is_sme: 'yes', founded_on: 'r:3:7', industry: 'software_582', ven_revenue: 'r:1:500000', rnd_unit: 'institute', ven_rd_spend: 'r:5000:' };
  assert.equal(leafOf(run('VEN', { ...base, ven_rd_ratio: 'r:10:' }), 'VEN-RD-RATIO').status, S.PASS);
  assert.equal(leafOf(run('VEN', { ...base, ven_rd_ratio: 'r:8:10' }), 'VEN-RD-RATIO').status, S.FAIL);
  const u = leafOf(run('VEN', { ...base, industry: 'unknown', ven_rd_ratio: 'r:8:10' }), 'VEN-RD-RATIO');
  assert.equal(u.status, S.UNKNOWN); assert.ok(u.missing.includes('industry'));
  // 화면이 '10% 이상인가요? 네/아니요'로 물을 때 저장하는 값
  assert.equal(leafOf(run('VEN', { ...base, ven_rd_ratio: 'r:0:10' }), 'VEN-RD-RATIO').status, S.FAIL);
});

test('BAND-05 투자 비율·문화산업 법인: 7~10% 구간은 문화산업 여부로 갈림', () => {
  const base = { biz_status: 'corporation', is_sme: 'yes', ven_invest_total: 'r:5000:', ven_invest_ratio: 'r:7:10' };
  assert.equal(leafOf(run('VEN', { ...base, ven_culture_producer: 'yes' }), 'VEN-INV-RATIO').status, S.PASS);
  assert.equal(leafOf(run('VEN', { ...base, ven_culture_producer: 'no' }), 'VEN-INV-RATIO').status, S.FAIL);
  assert.equal(leafOf(run('VEN', { ...base, ven_culture_producer: 'unknown' }), 'VEN-INV-RATIO').status, S.UNKNOWN);
  assert.equal(leafOf(run('VEN', { ...base, ven_invest_ratio: 'r:10:' }), 'VEN-INV-RATIO').status, S.PASS);
  assert.equal(leafOf(run('VEN', { ...base, ven_invest_total: 'r:1:5000' }), 'VEN-INV-AMT').status, S.FAIL);
});

test('BAND-06 연구소 인원: 소기업 3명 기준에서 2명 미충족·3~4명 충족, 창업 3년 미만 소기업은 2명 충족', () => {
  const base = { biz_status: 'corporation', is_sme: 'yes', company_size: 'small', founded_on: 'r:3:7', rnd_is_venture: 'no', rnd_founder_researcher: 'no' };
  assert.equal(leafOf(run('RNDI', { ...base, rnd_researchers: 'r:2:3' }), 'RNDI-STAFF').status, S.FAIL);
  assert.equal(leafOf(run('RNDI', { ...base, rnd_researchers: 'r:3:5' }), 'RNDI-STAFF').status, S.PASS);
  assert.equal(leafOf(run('RNDI', { ...base, founded_on: 'r:1:3', rnd_researchers: 'r:2:3' }), 'RNDI-STAFF').status, S.PASS);
  assert.match(leafOf(run('RNDI', { ...base, rnd_researchers: 'r:2:3' }), 'RNDI-STAFF').detail, /선택 2명 \/ 기준 3명 이상/);
  assert.equal(leafOf(run('RNDD', { ...base, rnd_researchers: 'r:0:1' }), 'RNDD-STAFF').status, S.FAIL);
});

test('BAND-07 조건식: 구간 답도 서류·질문 표시 조건에 맞게 동작', () => {
  assert.equal(evalExpr('ven_invest_total > 0', { ven_invest_total: 'r:0:0' }), false);
  assert.equal(evalExpr('ven_invest_total > 0', { ven_invest_total: 'r:1:5000' }), true);
  assert.equal(evalExpr('rnd_researchers >= 10', { rnd_researchers: 'r:10:' }), true);
  assert.equal(evalExpr('rnd_researchers >= 10', { rnd_researchers: 'r:7:10' }), false);
  assert.equal(evalExpr('scheme in [VEN] and ven_invest_total in [r:5000:]', { ven_invest_total: 'r:5000:' }, { schemes: ['VEN'] }), true);
});
