// 금지 표현 검사 — 점수·등급·확률·전망 표현은 부정 문맥(하지 않음·아님)에서만 허용.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderBrief, renderDetail } from '../src/report.js';
import { evaluate } from '../src/engine.js';
import { sampleState } from '../src/sample.js';

const BANNED = /준비도\s*\d|\d+\s*점(?![검])|점수|(?<!비밀)등급|합격|성공률|확률|예측|예상|추정|상위\s*\d+\s*%|흑자\s*전환|밸류에이션|런웨이/g;
const NEG = /않|없|아니|아님|아닙|금지|제외|폐기|하지\s*않|만들지|매기지|판단하지|계산하지/;
function check(name, text) {
  const plain = text.replace(/<[^>]+>/g, ' ');
  const bad = [];
  for (const m of plain.matchAll(BANNED)) {
    const win = plain.slice(Math.max(0, m.index - 60), m.index + 60);
    if (!NEG.test(win)) bad.push(`${name}: …${win.replace(/\s+/g, ' ')}…`);
  }
  assert.deepEqual(bad, []);
}
test('화면 문구', () => {
  for (const f of ['index.html', 'src/app.js', 'src/registry.js', 'design/og.html']) check(f, readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
});
test('생성 보고서(합성 예시, 한/영, 마스킹)', () => {
  const st = sampleState(); const ev = evaluate(st);
  const snap = { draft: false, version: 1, reportId: 'IR-TEST', hash: 'x'.repeat(64), approvedAt: new Date().toISOString(), approvedBy: '김대표(예시)', state: st, findings: ev.findings, byQ: ev.byQ, history: [] };
  for (const lang of ['ko', 'en']) for (const mask of [false, true]) {
    check(`brief-${lang}`, renderBrief(snap, { lang, mask })); check(`detail-${lang}`, renderDetail(snap, { lang, mask }));
  }
  const masked = renderDetail(snap, { lang: 'ko', mask: true });
  assert.doesNotMatch(masked, /엔젤투자자\(예시\)/); assert.match(masked, /주주 A/);
  assert.doesNotMatch(masked, /영업팀장\(예시\)/);
});
test('사용자 입력은 이스케이프된다', () => {
  const st = sampleState(); st.answers.Q01.text = '<img src=x onerror=alert(1)>'; st.meta.company = '<script>x</script>';
  const ev = evaluate(st);
  const html = renderDetail({ draft: true, version: 1, reportId: 'R', hash: '', state: st, findings: ev.findings, byQ: ev.byQ, history: [] }, {});
  assert.doesNotMatch(html, /<img src=x|<script>x/);
});
