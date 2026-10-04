// Phase 7 재진단 비교: 스냅샷·파일 검증·현재 엔진 재계산·영역/TRL/P0 이행/리스크 변화
import { describe, expect, it } from 'vitest';
import { evaluate, type AssessmentInput } from '../../src/diagnosis';
import { compareAssessments, deltaMargin, makeSnapshot, parseSnapshot, scoreDelta } from '../../src/diagnosis/delta';

const base: AssessmentInput = {
  mode: 'quick',
  company: { name: '테스트', roadmapField: '스마트제조(특화)', bizType: 'AI/SW 중심', sectorDetail: '', product: '예지보전' },
  discovery: { hardPart: '', automated: '', data: '', external: '클라우드 API', people: '', validation: '' },
  inventory: [
    { id: 1, name: '탐지 모델', type: '알고리즘', ownership: '자체', status: '확정', critical: true, trl: 5, confirmed: true },
    { id: 2, name: '정규화', type: '데이터', ownership: '자체', status: '확정', critical: true, trl: 0, confirmed: false },
  ],
  answers: { q1: 4, q2: 3, q3: 3, q4: 3, q5: 3, q6: 3, q7: 2, q8: 2, q9: 1, q10: null, q11: 2, q12: 3 },
  evidence: { q1: 2, q2: 2, q9: 1 },
};
const T0 = new Date('2026-10-04T00:00:00Z'), T1 = new Date('2027-01-02T00:00:00Z');
const snap = makeSnapshot(base, evaluate(base), T0, 'v0.9.12');

describe('스냅샷', () => {
  it('입력 복제·요약 저장, JSON 왕복 후 검증 통과', () => {
    expect(snap.summary.p0.length).toBeGreaterThan(0);
    const back = parseSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(back?.input.answers).toEqual(base.answers);
    expect(back?.input.inventory[0]).toMatchObject({ name: '탐지 모델', trl: 5, critical: true });
  });
  it('형식이 다르거나 값이 범위를 벗어나면 거부·정리', () => {
    expect(parseSnapshot({ kind: 'other' })).toBeNull();
    expect(parseSnapshot({ ...snap, savedAt: 'x' })).toBeNull();
    // 화면 버튼에 쓰이는 id에 스크립트를 넣은 조작 파일은 거부
    expect(parseSnapshot({ ...snap, id: "x');alert(1);('" })).toBeNull();
    const dirty = JSON.parse(JSON.stringify(snap));
    dirty.input.answers = { q1: 9, q2: 3, '__proto__x': 1, q3: null };
    dirty.input.inventory[0].trl = 42;
    const p = parseSnapshot(dirty)!;
    expect(p.input.answers).toEqual({ q2: 3, q3: null });
    expect(p.input.inventory[0].trl).toBe(9);
  });
});

describe('비교', () => {
  it('오차 범위: 낮은 신뢰도 기준, 최소 3점', () => {
    expect(deltaMargin(53, 78)).toBe(8);
    expect(deltaMargin(99, 99)).toBe(3);
    expect(scoreDelta(40, 50, 8).verdict).toBe('개선');
    expect(scoreDelta(40, 45, 8).verdict).toBe('오차 범위 내');
    expect(scoreDelta(50, 40, 8).verdict).toBe('악화');
    expect(scoreDelta(null, 40, 8).verdict).toBe('신규 산정');
  });
  it('개선된 재진단: 영역 개선·P0 해소·TRL 상승·리스크 완화·모름 확인', () => {
    const cur: AssessmentInput = {
      ...base,
      inventory: [{ ...base.inventory[0], trl: 6 }, { ...base.inventory[1], trl: 4 }, { id: 3, name: '플랫폼', type: '응용', ownership: '자체', status: '확정', critical: true, trl: 6, confirmed: true }],
      answers: { ...base.answers, q9: 4, q10: 3, q8: 4, q11: 4, q7: 3 },
      evidence: { ...base.evidence, q9: 3, q10: 2, q8: 2, q11: 2 },
    };
    const d = compareAssessments(snap, cur, evaluate(cur), T1);
    expect(d.days).toBe(90);
    expect(d.dims.find((x) => x.dim === 'risk')?.verdict).toBe('개선');
    expect(d.dims.find((x) => x.dim === 'tech')?.verdict).toBe('오차 범위 내');
    expect(d.priorities.find((p) => p.area === '리스크대응')?.outcome).toBe('해소');
    expect(d.trl.map((t) => [t.name, t.status])).toEqual([['탐지 모델', '상승'], ['정규화', '확인 전'], ['플랫폼', '신규 지정']]);
    expect(d.risks.find((r) => r.id === 'R2')?.change).toBe('완화');
    expect(d.risks.find((r) => r.id === 'R4')?.change).toBe('확인됨');
    expect(d.unknown).toEqual({ prev: 1, cur: 0 });
    expect(d.headline).toMatch(/^기준 진단\(2026\.10\.0[34]\) 이후 90일, 기술역량 \d+→\d+/);
    expect(d.versionNote).toBeNull();
  });
  it('악화·정체·유형 변경·점수식 버전 차이 안내', () => {
    const cur: AssessmentInput = { ...base, mode: 'deep', answers: { ...base.answers, q5: 1, q6: 1, q4: 1 } };
    const old = { ...snap, summary: { ...snap.summary, versions: { ...snap.summary.versions, scoring: 'rule-v0.9' } } };
    const d = compareAssessments(old, cur, evaluate(cur), T1);
    expect(d.dims.find((x) => x.dim === 'exec')?.verdict).toBe('악화');
    expect(d.versionNote).toContain('rule-v0.9');
    expect(d.modeNote).toContain('간편 → 정밀');
    expect(d.next.some((n) => n.includes('낮아졌습니다'))).toBe(true);
  });
  it('기준 진단은 저장된 점수가 아니라 입력을 현재 엔진으로 다시 계산', () => {
    const forged = { ...snap, summary: { ...snap.summary, capability: 99, confidence: 99 } };
    const d = compareAssessments(forged, base, evaluate(base), T1);
    expect(d.capability.prev).toBe(Math.round(evaluate(base).capability as number));
    expect(d.capability.verdict).toBe('오차 범위 내');
    expect(d.priorities.every((p) => p.outcome === '정체' || p.outcome === '판단 보류')).toBe(true);
  });
});
