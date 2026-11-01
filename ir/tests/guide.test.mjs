// 해석 가이드 — 범위·원칙(원인 비단정·위험도 순위 없음)·결정론.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULE_GUIDE, QUESTION_GUIDE, guideFor, nextActions, sectionSummary } from '../src/guide.js';
import { QUESTIONS, SECTIONS, RULES } from '../src/registry.js';
import { evaluate, runRules } from '../src/engine.js';
import { sampleState } from '../src/sample.js';
import { blank } from '../src/store.js';

test('모든 규칙(R-DOC-01 제외)에 가이드, 24문항 모두 준비 방법', () => {
  for (const r of Object.keys(RULES).filter((x) => x !== 'R-DOC-01')) assert.ok(RULE_GUIDE[r], r);
  for (const q of QUESTIONS) assert.ok(QUESTION_GUIDE[q.id]?.length, q.id);
});
test('실제로 나오는 모든 확인 필요 결과에 가이드가 붙는다', () => {
  const sts = [sampleState(), (() => { const st = blank(); st.answers = { Q22: { status: 'answer', fields: { open: '1' } }, Q20: { status: 'answer', fields: { pRev: '1', pStart: '2024-01', pEnd: '2024-06', cStart: '2025-01', cEnd: '2025-12', cRev: '2' } }, Q10: { status: 'answer', fields: { base: '0', kept: '0' } } }; return st; })()];
  for (const st of sts) for (const f of runRules(st).filter((x) => ['mismatch', 'blocked', 'incomplete'].includes(x.result))) {
    const g = guideFor(f); assert.ok(g && g.checks.length && g.fix.length, f.id);
  }
  assert.equal(guideFor({ result: 'match', rule: 'R-CF-01' }), null);
});
test('원인 단정·확률·위험도 표현 없음', () => {
  // 주석 줄과 부정 문맥("~은 판단하지 않아요")은 제외하고 검사
  const text = readFileSync(new URL('../src/guide.js', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    .replace(/[가-힣]+(은|는) 판단하지 않아요/g, '');
  for (const bad of [/때문(에|입니다)/, /가능성/, /확률/, /위험도가 (높|낮)/, /원인은 [^"'`]*입니다/, /추정/, /예상/]) assert.doesNotMatch(text, bad);
});
test('먼저 하면 좋은 일: 차이 해소 먼저, 같은 입력이면 같은 결과', () => {
  const a = nextActions(evaluate(sampleState())); const b = nextActions(evaluate(sampleState()));
  assert.deepEqual(a, b);
  assert.equal(a[0].kind, 'fix'); assert.equal(a[0].qid, 'Q23');
  // 빈 상태: 차이 없음 → 입력 시 자동 확인이 많은 문항(Q20·Q21·Q22: 2건)이 앞
  const e = nextActions(evaluate(blank()));
  assert.ok(e.every((x) => x.kind === 'unlock')); assert.equal(e[0].n, 2);
  assert.ok(e.findIndex((x) => x.qid === 'Q20') < e.findIndex((x) => x.qid === 'Q07'));
});
test('섹션별 정리: 건수 합 = 문항 수', () => {
  const ev = evaluate(sampleState());
  for (const s of SECTIONS) { const x = sectionSummary(ev, s.id); assert.equal(x.confirmed + x.self + x.none + x.na + x.attention, x.total, s.id); assert.match(x.sentence, /다음 행동/); }
});
