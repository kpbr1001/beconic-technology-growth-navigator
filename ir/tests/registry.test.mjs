// 문항·출처 원장 무결성 — 24문항·8출처·위치·한계·미검증 상태 보존.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, SOURCES, SMAP, RULES, questionMeta, SECTIONS } from '../src/registry.js';

test('24문항 Q01~Q24, 8개 출처 S01~S08', () => {
  assert.deepEqual(QUESTIONS.map((q) => q.id).sort(), Array.from({ length: 24 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(SOURCES.map((s) => s.id), ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08']);
});
test('모든 문항: 출처 ID·위치·이유·제출 예시·확인 방법·규칙 존재', () => {
  for (const q of QUESTIONS) {
    assert.ok(q.src.length, q.id);
    for (const [sid, loc] of q.src) { assert.ok(SMAP[sid], `${q.id} ${sid}`); assert.ok(loc.trim(), `${q.id} 위치`); }
    assert.ok(q.why && q.ex.length && q.check, q.id);
    for (const r of q.rules) assert.ok(RULES[r], `${q.id} ${r}`);
    assert.ok(SECTIONS.find((s) => s.id === q.sec));
  }
});
test('모든 출처: URL·위치·적용 한계', () => {
  for (const s of SOURCES) { assert.match(s.url, /^https:\/\//); assert.ok(s.locator && s.limit); }
});
test('전문가 검토·사용성·예측 타당도는 미검증으로 보존', () => {
  for (const q of QUESTIONS) {
    const m = questionMeta(q);
    assert.equal(m.expert_review_status, '미검증'); assert.equal(m.usability_status, '미검증'); assert.equal(m.reviewer, null);
    assert.equal(m.predictive_validity, '검증하지 않음');
  }
});
