// 질문 3층 구조·업종 필터 검사 — 판정에 필요한 질문은 빠짐없이, 필요 없는 질문은 묻지 않는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataSync, AS_OF } from './helpers.mjs';
import { evaluateScheme, questionsUsedBy } from '../src/engine.js';
import { answerQuestions, filterSchemes, industryFits } from '../src/views.js';

const D = loadDataSync();
const SCHEMES = Object.keys(D.packs);
const shownIds = (selected, f = {}) => {
  const { common, exp, per } = answerQuestions({ selected, answers: {}, f }, D);
  return new Set([...common, ...exp, ...per.flatMap((p) => p.list)].map((q) => q.question_id));
};
// 결정적 난수(재현 가능)
let seed = 20261123;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
function randomAnswers() {
  const a = {};
  for (const q of D.questions.questions) {
    const r = rnd();
    if (r < 0.15) continue; // 미답
    const vals = q.response_options.map((o) => o.value);
    if (!vals.length) continue;
    if (q.allow_date && r < 0.3) { a[q.question_id] = `${2010 + Math.floor(rnd() * 16)}-0${1 + Math.floor(rnd() * 9)}-15`; continue; }
    a[q.question_id] = q.data_type === 'multi' ? vals.filter(() => rnd() < 0.4) : vals[Math.floor(rnd() * vals.length)];
  }
  return a;
}

test('QS-01 규칙이 쓰는 질문은 그 인증만 골라도 모두 화면에 나온다(질문 누락 0)', () => {
  for (const id of SCHEMES) {
    const used = questionsUsedBy(D.packs[id], D.questionMap);
    assert.ok(used.size > 0, id);
    const shown = shownIds([id]);
    const missing = [...used].filter((q) => !shown.has(q) && D.questionMap[q].show_when !== 'never');
    assert.deepEqual(missing, [], `${id}: 규칙이 쓰는데 화면에 없는 질문`);
  }
});

test('QS-02 무작위 답 2만 건: 판정이 실제로 읽은 질문(inputs·missing) ⊆ 규칙이 쓰는 질문 목록', () => {
  const extra = new Map();
  for (let n = 0; n < 20000; n += 1) {
    const a = randomAnswers();
    for (const id of SCHEMES) {
      const used = questionsUsedBy(D.packs[id], D.questionMap);
      const r = evaluateScheme(D.packs[id], a, { asOf: AS_OF, sources: D.sourceMap });
      for (const leaf of r.pathways.flatMap((p) => p.leaves)) {
        for (const q of [...(leaf.inputs || []), ...(leaf.missing || [])]) {
          if (D.questionMap[q] && !used.has(q)) extra.set(`${id}:${q}`, (extra.get(`${id}:${q}`) || 0) + 1);
        }
      }
    }
  }
  assert.deepEqual([...extra.keys()], [], '판정 함수가 읽는데 IMPLICIT_INPUTS에 없는 질문');
});

test('QS-03 판정 규칙이 없는 인증(요건 체크·정보 안내)만 고르면 공통 질문은 사업자 형태 하나', () => {
  const nonA = D.catalog.schemes.filter((s) => !D.packs[s.scheme_id]).map((s) => s.scheme_id);
  for (const id of nonA) {
    const { common } = answerQuestions({ selected: [id], answers: {}, f: {} }, D);
    assert.deepEqual(common.map((q) => q.question_id), ['biz_status'], id);
  }
});

test('QS-04 공통 질문은 고른 인증이 쓰는 것만 — 판정에 안 쓰이는 공통 질문 0', () => {
  const combos = [...SCHEMES.map((x) => [x]), ['VEN', 'INNO', 'RNDI'], ['VEN', 'MAIN', 'RNDD'], ['INNO', 'EU-CE'], ['ISO9001', 'RNDI']];
  for (const sel of combos) {
    const used = new Set(sel.filter((x) => D.packs[x]).flatMap((x) => [...questionsUsedBy(D.packs[x], D.questionMap)]));
    const { common } = answerQuestions({ selected: sel, answers: {}, f: {} }, D);
    const idle = common.filter((q) => !q.core && !used.has(q.question_id)).map((q) => q.question_id);
    assert.deepEqual(idle, [], sel.join('+'));
  }
});

test('QS-05 업종 대분류: 태그는 정해진 값, 업종을 고르면 다른 업종 전용만 빠지고 공통 인증은 남는다', () => {
  const majors = D.questionMap.industry_major.response_options.map((o) => o.value).filter((v) => v !== 'unknown');
  assert.equal(majors.length, 12);
  for (const s of D.catalog.schemes) {
    assert.ok(Array.isArray(s.industry_major) && s.industry_major.length, s.scheme_id);
    s.industry_major.forEach((m) => assert.ok(m === 'all' || majors.includes(m), `${s.scheme_id}: ${m}`));
  }
  for (const m of majors) {
    for (const region of ['domestic', 'international']) {
      const st = { f: { region, field: 'all', purpose: null, industry: m, q: '' } };
      const list = filterSchemes(st, D);
      const all = D.catalog.schemes.filter((s) => s.display_group === region);
      all.filter((s) => s.industry_major.includes('all')).forEach((s) => assert.ok(list.includes(s), `${m}: 공통 인증 ${s.scheme_id} 사라짐`));
      all.filter((s) => !list.includes(s)).forEach((s) => assert.ok(!industryFits(s, m), `${m}: ${s.scheme_id} 잘못 제외`));
      assert.ok(list.length > 0, `${m} ${region} 목록 비어 있음`);
    }
  }
  // 업종 고르지 않음·모름 = 전체
  for (const ind of [null, 'unknown']) {
    const list = filterSchemes({ f: { region: 'domestic', field: 'all', purpose: null, industry: ind, q: '' } }, D);
    assert.equal(list.length, D.catalog.schemes.filter((s) => s.display_group === 'domestic').length);
  }
});

test('QS-06 세부 업종(벤처·전담부서 판정용): 모든 대분류에 고를 항목이 1개 이상, 태그는 정해진 값', () => {
  const majors = D.questionMap.industry_major.response_options.map((o) => o.value).filter((v) => v !== 'unknown');
  const opts = D.questionMap.industry.response_options.filter((o) => o.value !== 'unknown');
  opts.forEach((o) => { assert.ok(o.majors && o.majors.length, o.value); o.majors.forEach((m) => assert.ok(majors.includes(m), `${o.value}: ${m}`)); });
  majors.forEach((m) => assert.ok(opts.some((o) => o.majors.includes(m)), `${m}: 세부 업종 없음`));
  // 판정표의 업종 키는 모두 선택지에 있다(대분류로 좁혀도 판정표 키가 사라지지 않음)
  Object.keys(D.packs.VEN.tables.rd_ratio.rows).forEach((k) => assert.ok(opts.some((o) => o.value === k), `판정표 업종 ${k}`));
});

test('QS-07 조건식 or: and가 먼저 묶이고, 전담부서는 칸막이를 고른 경우에만 연구원 창업 질문이 나온다', async () => {
  const { evalExpr, assertExpr } = await import('../src/conditions.js');
  const e = D.questionMap.rnd_founder_researcher.show_when;
  assert.doesNotThrow(() => assertExpr(e));
  assert.equal(evalExpr(e, {}, { schemes: ['RNDI'] }), true);
  assert.equal(evalExpr(e, { rnd_space: 'partition' }, { schemes: ['RNDD'] }), true);
  assert.equal(evalExpr(e, { rnd_space: 'independent' }, { schemes: ['RNDD'] }), false);
  assert.equal(evalExpr(e, {}, { schemes: ['VEN'] }), false);
  assert.equal(evalExpr('a == 1 or b == 2 and c == 3', { a: 0, b: 2, c: 4 }), false);
  assert.equal(evalExpr('a == 1 or b == 2 and c == 3', { a: 1 }), true);
});

test('QS-08 인증별 질문: 그 인증만 고르면 화면의 인증별 질문은 모두 그 인증 규칙이 쓰는 것(군더더기 0)', () => {
  for (const id of SCHEMES) {
    const used = questionsUsedBy(D.packs[id], D.questionMap);
    const { per } = answerQuestions({ selected: [id], answers: {}, f: {} }, D);
    const idle = per.flatMap((p) => p.list).map((q) => q.question_id).filter((q) => !used.has(q));
    assert.deepEqual(idle, [], `${id}: 규칙이 쓰지 않는 인증별 질문`);
  }
});

test('QS-09 모든 인증(86개): 결과에 할 일 2개 이상, 판정 없는 인증은 준비 점검·신청 단계 포함, 문항은 판정·체크·트리아지·준비점검 중 하나', async () => {
  const { buildReport } = await import('../src/model.js');
  for (const s of D.catalog.schemes) {
    const R = buildReport(D, { answers: {}, selected: [s.scheme_id], docStatus: {}, asOf: AS_OF });
    const acts = R.actions.filter((a) => a.scheme_id === s.scheme_id);
    assert.ok(acts.length >= 2, `${s.scheme_id}: 할 일 ${acts.length}개`);
    const kinds = [!!D.packs[s.scheme_id], !!s.self_check, !!s.triage, !!s.prep_check].filter(Boolean).length;
    assert.equal(kinds, 1, `${s.scheme_id}: 문항 유형 ${kinds}개`);
    if (!D.packs[s.scheme_id]) assert.ok(acts.some((a) => a.timeframe === 'd90'), `${s.scheme_id}: 신청 단계 없음`);
    if (s.prep_check) {
      const { per } = answerQuestions({ selected: [s.scheme_id], answers: {}, f: {} }, D);
      assert.equal(per[0].checks.length, 3, `${s.scheme_id}: 준비 점검 3문항`);
      assert.ok(per[0].checks[0].why && per[0].checks[0].why === s.first_check, `${s.scheme_id}: 첫 문항 이유 = 먼저 확인할 것`);
    }
  }
});

test('QS-10 제품·판매 시장 질문은 그 답을 쓰는 해외 규정 트리아지 인증을 고를 때만', () => {
  for (const s of D.catalog.schemes) {
    const { exp } = answerQuestions({ selected: [s.scheme_id], answers: {}, f: {} }, D);
    assert.equal(exp.length > 0, !!s.triage, `${s.scheme_id}: 제품·시장 질문 ${exp.length}개`);
  }
});
