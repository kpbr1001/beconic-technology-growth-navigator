// 문항 모델·점수 엔진 — 구조·계산식·결정론·해석 규칙.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, CATEGORIES, WEIGHTS, STAGES, GRADES } from '../src/model.js';
import { evaluate, gradeOf, targetOf } from '../src/score.js';
import { sampleState } from '../src/sample.js';
import { blank } from '../src/store.js';

const withAll = (v, stage = 'seed', fin = null) => { const st = blank(); st.meta.company = 'X'; st.meta.stage = stage; st.answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, { v }])); st.fin = fin; return st; };

test('모델: 8영역 × 4문항, 문항마다 보기 5개, ID 고유', () => {
  assert.equal(CATEGORIES.length, 8); assert.equal(QUESTIONS.length, 32);
  for (const c of CATEGORIES) assert.equal(QUESTIONS.filter((q) => q.cat === c.id).length, 4, c.id);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 32);
  for (const q of QUESTIONS) { assert.equal(q.opts.length, 5, q.id); assert.ok(q.opts.every((o) => o.trim()) && q.q && q.why && q.title, q.id); }
});
test('단계별 가중치 합 100, 모든 영역 포함', () => {
  for (const s of STAGES) { const w = WEIGHTS[s.id]; assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100, s.id); for (const c of CATEGORIES) assert.ok(w[c.id] > 0); }
});
test('점수식: 전부 5 → 100(S), 전부 1 → 20(D), 모르겠어요 = 1점 + 표시', () => {
  assert.equal(evaluate(withAll(5)).overall, 100); assert.equal(evaluate(withAll(5)).grade.g, 'S');
  assert.equal(evaluate(withAll(1)).overall, 20); assert.equal(evaluate(withAll(1)).grade.g, 'D');
  const u = evaluate(withAll(0)); assert.equal(u.overall, 20); assert.equal(u.unknown.length, 32);
});
test('가중 평균: 예비창업, 문제·고객만 5점이면 (100×20 + 20×80) ÷ 100 = 36', () => {
  const st = withAll(1, 'pre'); for (const q of QUESTIONS.filter((x) => x.cat === 'PC')) st.answers[q.id].v = 5;
  const r = evaluate(st); assert.equal(r.cats.PC.score, 100); assert.equal(r.overall, 36);
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
  assert.equal(r.complete, false); assert.match(r.summary.join(' '), /31문항만 답했어요/);
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
