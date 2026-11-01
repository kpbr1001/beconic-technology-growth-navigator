// 문항 모델·점수 엔진 — 구조·계산식·결정론·해석 규칙.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, CATEGORIES, WEIGHTS, STAGES, GRADES, INDUSTRY_ADJ, weightsFor, LENSES, EXPECT } from '../src/model.js';
import { evaluate, gradeOf, targetOf } from '../src/score.js';
import { sampleState } from '../src/sample.js';
import { blank, validate } from '../src/store.js';
import { indicators } from '../src/fin.js';

const withAll = (v, stage = 'seed', fin = null) => { const st = blank(); st.meta.company = 'X'; st.meta.stage = stage; st.answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, { v }])); st.fin = fin; return st; };

test('모델: 9영역(기술역량 포함) × 4문항, 문항마다 보기 5개·난이도·산출물, ID 고유', () => {
  assert.equal(CATEGORIES.length, 9); assert.equal(QUESTIONS.length, 36); assert.ok(CATEGORIES.some((c) => c.id === 'TC' && c.name === '기술역량'));
  for (const c of CATEGORIES) assert.equal(QUESTIONS.filter((q) => q.cat === c.id).length, 4, c.id);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 36);
  for (const q of QUESTIONS) { assert.equal(q.opts.length, 5, q.id); assert.ok(q.opts.every((o) => o.trim()) && q.q && q.why && q.title && q.doc && ['S', 'M', 'L'].includes(q.e), q.id); }
  for (const l of LENSES) for (const id of l.qs) assert.ok(QUESTIONS.some((q) => q.id === id), `${l.id} ${id}`);
  for (const s of STAGES) for (const c of CATEGORIES) assert.ok(EXPECT[s.id][c.id] > 0);
});
test('단계별 가중치 합 100, 모든 영역 포함', () => {
  for (const s of STAGES) { const w = WEIGHTS[s.id]; assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100, s.id); for (const c of CATEGORIES) assert.ok(w[c.id] > 0); }
});
test('점수식: 전부 5 → 100(S), 전부 1 → 20(D), 모르겠어요 = 1점 + 표시', () => {
  assert.equal(evaluate(withAll(5)).overall, 100); assert.equal(evaluate(withAll(5)).grade.g, 'S');
  assert.equal(evaluate(withAll(1)).overall, 20); assert.equal(evaluate(withAll(1)).grade.g, 'D');
  const u = evaluate(withAll(0)); assert.equal(u.overall, 20); assert.equal(u.unknown.length, 36);
});
test('가중 평균: 예비창업, 문제·고객만 5점이면 (100×18 + 20×82) ÷ 100 = 34', () => {
  const st = withAll(1, 'pre'); for (const q of QUESTIONS.filter((x) => x.cat === 'PC')) st.answers[q.id].v = 5;
  const r = evaluate(st); assert.equal(r.cats.PC.score, 100); assert.equal(r.overall, 34);
  const st2 = withAll(1, 'a'); for (const q of QUESTIONS.filter((x) => x.cat === 'PC')) st2.answers[q.id].v = 5;
  assert.equal(evaluate(st2).overall, 24); // 시리즈A 이상은 문제·고객 비중 5%
});
test('등급 경계', () => { assert.equal(gradeOf(90).g, 'S'); assert.equal(gradeOf(89).g, 'A'); assert.equal(gradeOf(70).g, 'B'); assert.equal(gradeOf(60).g, 'C'); assert.equal(gradeOf(59).g, 'D'); assert.equal(GRADES.at(-1).min, 0); });
test('목표 단계: 2단계 이하는 최소 3단계, 모르겠어요는 현황 확인 문구', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(targetOf), [3, 3, 3, 4, 5]);
  const st = withAll(4); st.answers.IR3 = { v: 2 }; st.answers.BM4 = { v: 0 };
  const r = evaluate(st); const ir3 = r.weaknesses.find((w) => w.q.id === 'IR3'); const bm4 = r.weaknesses.find((w) => w.q.id === 'BM4');
  assert.equal(ir3.next, QUESTIONS.find((q) => q.id === 'IR3').opts[2]); assert.match(bm4.next, /먼저 현황을 확인/);
});
test('결정론·부분 응답·로드맵의 재무 항목', () => {
  assert.deepEqual(evaluate(sampleState()), evaluate(sampleState()));
  const st = withAll(3); delete st.answers.PC1; const r = evaluate(st);
  assert.equal(r.complete, false); assert.match(r.summary.join(' '), /35문항만 답했어요/);
  assert.equal(r.roadmap.now[0].special, 'fin'); assert.match(r.summary.join(' '), /재무제표 미반영/);
  const r2 = evaluate(sampleState()); assert.ok(!r2.roadmap.now.some((x) => x.special === 'fin'));
});
test('응답 ↔ 재무 교차 확인(관찰만)', () => {
  const fin = { confirmed: true, source: 'manual', cur: { rev: 0, op: -1, net: -1, assets: 10, liab: 5, equity: 5 }, prev: {} };
  const st = withAll(4, 'seed', fin); const r = evaluate(st);
  assert.ok(r.checks.some((c) => c.qid === 'BM2' && /0원/.test(c.text)));
  const st2 = withAll(1, 'seed', { ...fin, cur: { ...fin.cur, rev: 5e8 } }); assert.ok(evaluate(st2).checks.some((c) => c.qid === 'BM2'));
  const st3 = withAll(4, 'seed', { ...fin, cur: { rev: 1, op: 1, net: 1, assets: 10000, liab: 5000, equity: 4000 } }); assert.ok(evaluate(st3).checks.some((c) => /달라요/.test(c.text))); // 자산 ≠ 부채+자본
});

test('업종 보정: 합 100 유지, 바이오는 기술역량 +6', () => {
  for (const s of STAGES) for (const ind of [...Object.keys(INDUSTRY_ADJ), 'IT·소프트웨어']) assert.equal(Object.values(weightsFor(s.id, ind)).reduce((a, b) => a + b, 0), 100, `${s.id} ${ind}`);
  assert.equal(weightsFor('seed', '바이오·헬스케어').TC, WEIGHTS.seed.TC + 6);
  const st = withAll(1, 'seed'); st.meta.industry = '바이오·헬스케어'; for (const q of QUESTIONS.filter((x) => x.cat === 'TC')) st.answers[q.id].v = 5;
  const st2 = withAll(1, 'seed'); for (const q of QUESTIONS.filter((x) => x.cat === 'TC')) st2.answers[q.id].v = 5;
  assert.ok(evaluate(st).overall > evaluate(st2).overall);
});
test('투자자 관점·단계 기대·경계 신호', () => {
  const st = withAll(2, 'prea'); st.answers.CO1 = { v: 1 }; const r = evaluate(st);
  assert.equal(r.lenses.length, 6); assert.ok(r.lenses.every((l) => l.score !== null && l.verdict));
  assert.equal(r.lenses[0].verdict.tone, 'warn');
  assert.equal(r.gaps.length, 9); // 2점(40) < 프리A 기대 수준
  for (const id of ['no-competitor', 'cap-table', 'no-fs', 'cash-unknown', 'numbers']) assert.ok(r.flags.some((f) => f.id === id), id);
  const ok = evaluate(withAll(5, 'prea')); assert.deepEqual(ok.flags.map((f) => f.id), ['no-evidence']); // 근거 없는 고득점만 신호
  assert.ok(ok.flags.some((f) => f.id === 'no-evidence')); assert.equal(ok.gaps.length, 0);
});
test('로드맵: 난이도별 배치(S→2주, L은 2주에 오지 않음), 항목마다 산출물', () => {
  const r = evaluate(withAll(2, 'seed', { confirmed: true, source: 'manual', cur: { rev: 1, op: 1, net: 1, assets: 2, liab: 1, equity: 1 }, prev: {} }));
  const all = [...r.roadmap.now, ...r.roadmap.d30, ...r.roadmap.d90];
  assert.ok(all.every((x) => x.doc)); assert.ok(r.roadmap.now.every((x) => x.effort === 'S'));
  assert.ok(!r.roadmap.d30.some((x) => x.effort === 'L')); assert.ok(r.roadmap.now.length <= 4 && r.roadmap.d90.length <= 5);
});
test('v2.0 응답 이관(SP3 → TC2)·현금 보유 개월 수(참고)', () => {
  const v = validate({ app: 'beconic-ir', schema: 2, meta: { company: 'x' }, answers: { SP3: { v: 4, ev: true } }, fin: null });
  assert.deepEqual(v.answers, { TC2: { v: 4, ev: true } });
  const b = indicators({ cur: { cash: 120, op: -120 }, prev: {} }).find((x) => x.k === 'burn'); assert.equal(b.value, 12); assert.match(b.note, /전망이 아니에요/);
  assert.ok(!indicators({ cur: { cash: 120, op: 5 }, prev: {} }).some((x) => x.k === 'burn')); // 흑자면 계산 안 함
});
