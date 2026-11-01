// 표현 검사 — 투자 성공 예측·확률·기업가치 산정 표현은 부정 문맥(하지 않음·아님)에서만 허용. 사용자 입력은 이스케이프.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderReport } from '../src/report.js';
import { evaluate } from '../src/score.js';
import { sampleState } from '../src/sample.js';

const BANNED = /예측|확률|성공률|밸류에이션|추정|예상|투자 유치 가능성|보장합니다|흑자 전환/g;
const NEG = /않|없|아니|아님|아닙|금지|제외|하지\s*않/;
function check(name, text) {
  const plain = text.replace(/<[^>]+>/g, ' '); const bad = [];
  for (const m of plain.matchAll(BANNED)) { const w = plain.slice(Math.max(0, m.index - 60), m.index + 80); if (!NEG.test(w)) bad.push(`${name}: …${w.replace(/\s+/g, ' ')}…`); }
  assert.deepEqual(bad, []);
}
test('화면·모델·보고서 원본 문구', () => {
  for (const f of ['index.html', 'src/app.js', 'src/model.js', 'src/score.js', 'src/fin.js', 'src/report.js', 'design/og.html']) check(f, readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
});
test('생성 보고서(재무 반영/미반영)', () => {
  const st = sampleState(); check('report', renderReport(st, evaluate(st), { id: 'IR-X', date: '2026-11-01', version: 'v' }));
  st.fin = null; const html = renderReport(st, evaluate(st), { id: 'IR-X', date: '2026-11-01', version: 'v' }); check('report-nofin', html); assert.match(html, /재무제표 미반영/);
});
test('사용자 입력 이스케이프', () => {
  const st = sampleState(); st.meta.company = '<script>x</script>'; st.fin.fileName = '<img src=x onerror=1>';
  const html = renderReport(st, evaluate(st), { id: 'IR-X', date: 'd', version: 'v' }); assert.doesNotMatch(html, /<script>x|<img src=x/);
});
