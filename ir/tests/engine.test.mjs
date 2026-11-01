// 검증 엔진 원칙 테스트 — 결정론·정수 계산·분모 0·음수·통화/기간 차이·원인 비추측.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseCount, fmtUnit, growthPct, normPeriod, evaluate, runRules, canonical, sha256Hex } from '../src/engine.js';
import { sampleState } from '../src/sample.js';
import { blank } from '../src/store.js';

const withQ = (patch) => { const st = blank(); st.meta.baseDate = '2026-09-30'; for (const [q, fields] of Object.entries(patch)) st.answers[q] = { status: 'answer', fields }; return st; };
const find = (st, rule) => runRules(st).filter((f) => f.rule === rule);

test('금액 파싱: 쉼표·억 단위·음수·소수 둘째 자리 제한', () => {
  assert.equal(parseAmount('120,000,000').v, 12000000000n);
  assert.equal(parseAmount('1.5억').v, 15000000000n);
  assert.equal(parseAmount('-3,000.5').v, -300050n);
  assert.ok(parseAmount('1.234').err);
  assert.ok(parseAmount('12a').err);
  assert.equal(parseAmount(''), null);
  assert.ok(parseCount('-1').err);
  assert.equal(fmtUnit(parseAmount('0.1').v + parseAmount('0.2').v, 'KRW'), '0.3원'); // 부동소수 오차 없음
});

test('합성 예시: 07 문서 해석 예시(120,000,000 vs 150,000,000 → 30,000,000 차이) 재현, 원인 비추측', () => {
  const r = evaluate(sampleState());
  const deck = r.findings.find((f) => f.id === 'F-DECK01-Q23-1');
  assert.equal(deck.result, 'mismatch');
  assert.match(deck.fact.join(' '), /30,000,000원 차이의 원인은 확인되지 않았습니다/);
  assert.equal(r.findings.find((f) => f.rule === 'R-CF-01').result, 'match');
  assert.equal(r.findings.find((f) => f.rule === 'R-CAP-01').result, 'match');
  assert.equal(r.findings.find((f) => f.rule === 'R-FUND-01').result, 'match');
});

test('결정론: 같은 입력은 같은 결과·같은 해시', async () => {
  const a = evaluate(sampleState()).findings, b = evaluate(sampleState()).findings;
  assert.deepEqual(a, b);
  assert.equal(await sha256Hex(canonical({ x: 1, y: [2, { z: 3 }] })), await sha256Hex(canonical({ y: [2, { z: 3 }], x: 1 })));
});

test('현금흐름 대사: 불일치는 차액만, 미입력은 입력 부족', () => {
  const st = withQ({ Q22: { currency: 'KRW', open: '100', op: '10', inv: '-5', fin: '0', close: '200' } });
  const f = find(st, 'R-CF-01')[0];
  assert.equal(f.result, 'mismatch'); assert.match(f.fact.join(' '), /95원 차이/);
  assert.equal(find(withQ({ Q22: { open: '100' } }), 'R-CF-01')[0].result, 'incomplete');
});

test('성장률: 기간 길이 다름·분모 0 이하면 계산하지 않음, 과거 실적 문구', () => {
  const base = { cStart: '2025-01', cEnd: '2025-12', cRev: '120', pStart: '2024-01', pRev: '80' };
  assert.equal(find(withQ({ Q20: { ...base, pEnd: '2024-06' } }), 'R-GROW-01')[0].result, 'blocked');
  assert.equal(find(withQ({ Q20: { ...base, pEnd: '2024-12', pRev: '0' } }), 'R-GROW-01')[0].result, 'blocked');
  assert.equal(find(withQ({ Q20: { ...base, pEnd: '2024-12', pRev: '-10' } }), 'R-GROW-01')[0].result, 'blocked');
  const ok = find(withQ({ Q20: { ...base, pEnd: '2024-12' } }), 'R-GROW-01')[0];
  assert.equal(ok.result, 'calc'); assert.match(ok.fact[0], /\+50%.*전망이 아닙니다/);
  assert.equal(growthPct(3n, 4n), 3330n); // 33.3%
  assert.equal(growthPct(0n, 4n), null);
});

test('통화·기간 차이는 비교를 막는다(환산 없음)', () => {
  const st = withQ({ Q07: { start: '2025-01', end: '2025-12', currency: 'USD', ledger: '100' }, Q20: { currency: 'KRW', cStart: '2025-01', cEnd: '2025-12', cRev: '100' } });
  assert.equal(find(st, 'R-REV-01')[0].result, 'blocked');
  const st2 = withQ({ Q07: { start: '2025-01', end: '2025-12', currency: 'KRW', ledger: '100' }, Q23: { rows: [{ metric: '매출(Q07 원장)', deck: '100', unit: 'KRW', period: '2025-07~2025-12' }] } });
  assert.equal(find(st2, 'R-DECK-01')[0].result, 'blocked');
  const st3 = withQ({ Q07: { start: '2025-01', end: '2025-12', currency: 'KRW', ledger: '100' }, Q23: { rows: [{ metric: '매출(Q07 원장)', deck: '100', unit: 'USD', period: '2025' }] } });
  assert.equal(find(st3, 'R-DECK-01')[0].result, 'blocked');
  assert.equal(normPeriod('2025'), '2025-01~2025-12');
  assert.equal(normPeriod('2025.12.31'), '2025-12-31');
  assert.equal(normPeriod('작년'), null);
});

test('분모 0·분자>분모·음수 현금 처리', () => {
  assert.equal(find(withQ({ Q10: { base: '0', kept: '0' } }), 'R-RET-01')[0].result, 'blocked');
  assert.equal(find(withQ({ Q10: { base: '10', kept: '11' } }), 'R-RET-01')[0].result, 'mismatch');
  assert.equal(find(withQ({ Q21: { total: '-5', restricted: '0' } }), 'R-CASH-01')[0].result, 'blocked');
  assert.equal(find(withQ({ Q21: { total: '5', restricted: '6' } }), 'R-CASH-01')[0].result, 'mismatch');
  assert.equal(find(withQ({ Q21: { total: '5' } }), 'R-CASH-01')[0].result, 'incomplete');
});

test('날짜: 시작>종료, 기준일 이후 날짜 확인', () => {
  const f = find(withQ({ Q22: { start: '2025-12-31', end: '2025-01-01' }, Q21: { asOf: '2027-01-01' } }), 'R-DATE-01');
  assert.equal(f.length, 2);
});

test('상태 축: 자가진술·원문 연결·일치·불일치·적용 제외가 구분된다', () => {
  const st = sampleState(); const r = evaluate(st);
  assert.equal(r.byQ.Q03.data, 'submitted');
  assert.equal(r.byQ.Q01.data, 'linked');
  assert.equal(r.byQ.Q17.data, 'match');
  assert.equal(r.byQ.Q23.data, 'mismatch');
  assert.equal(r.byQ.Q13.data, 'na_wait');
  assert.equal(r.byQ.Q11.data, 'none');
  st.answers.Q13.naApproved = true;
  const r2 = evaluate(st); assert.equal(r2.byQ.Q13.data, 'na_ok'); assert.equal(r2.progress.applicable, 23);
  // 위치 없이 연결만 하면 '원문 연결 확인'이 아님
  st.answers.Q01.links[0].loc = ''; assert.equal(evaluate(st).byQ.Q01.data, 'submitted');
});

test('미래 예측·확률 문구를 만들지 않는다', () => {
  const text = JSON.stringify(evaluate(sampleState()).findings);
  for (const bad of [/예상됩니다/, /가능성이 높/, /확률/, /전망됩니다/, /과장/, /분식/, /등급/, /점수/]) assert.doesNotMatch(text, bad);
});
