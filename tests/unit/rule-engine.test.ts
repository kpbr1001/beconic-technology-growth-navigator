// Rule Engine 원칙 테스트 (마스터 프롬프트 2장 금지사항·20장 완료조건 중 Rule 담당분)
import { describe, expect, it } from 'vitest';
import { evaluate, band, CAPABILITY_WEIGHTS, VERSIONS } from '../../src/diagnosis';
import { strategicOptions } from '../../src/diagnosis/strategy';
import { makeInput, NAMED } from '../fixtures/assessments';

describe('모름·확인필요 처리', () => {
  it('모름은 0점(1점 응답)과 다르게 처리된다 — 결측으로 제외', () => {
    // 최소 응답 기준(공통 핵심 8문항) 이상이 되도록 다른 영역도 응답
    const base = { q1: 5, q2: 5, q12: 5, q3: 3, q4: 3, q5: 3, q6: 3, q7: 3, q8: 3 };
    const unknown = evaluate(makeInput({ answers: { ...base, q1: null } }));
    const lowest = evaluate(makeInput({ answers: { ...base, q1: 1 } }));
    expect(unknown.m.tech).toBeCloseTo(100, 10);
    expect(lowest.m.tech).toBeLessThan(100);
  });

  it('모름이 늘면 점수가 아니라 신뢰도가 내려간다', () => {
    const all4 = Object.fromEntries(Object.keys(NAMED.all5.answers).map((k) => [k, 4]));
    const a = evaluate(makeInput({ answers: all4 }));
    const b = evaluate(makeInput({ answers: { ...all4, q3: null, q5: null } }));
    expect(b.m.tech).toBe(a.m.tech);
    expect(b.confidence).toBeLessThan(a.confidence);
  });

  it('자료 없는 기업(전부 모름)도 진단이 완료된다', () => {
    const r = evaluate(NAMED.allUnknown);
    expect(r.insufficient).toBe(true);
    expect(r.gaps[0].priority).toBe('P0');
    expect(r.alerts.join(' ')).toMatch(/판단 보류/);
  });
});

describe('점수와 신뢰도 분리', () => {
  it('근거수준을 올려도 기술점수는 변하지 않고 신뢰도만 오른다', () => {
    const answers = { q1: 3, q2: 3, q6: 3 };
    const weak = evaluate(makeInput({ answers }));
    const strong = evaluate(makeInput({ answers, evidence: { q1: 4, q2: 4, q6: 4 } }));
    expect(strong.m).toEqual(weak.m);
    expect(strong.capability).toBe(weak.capability);
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });

  it('높은 자기평가 + 근거 없음 → 잠정진단', () => {
    const r = evaluate(makeInput({ answers: NAMED.all5.answers })); // 근거 입력 없음
    expect(r.capability).toBe(100);
    expect(r.level).toBe('잠정진단');
    expect(r.confidence).toBeLessThan(60);
  });
});

describe('기업규모·업력 비가산 (금지사항 5)', () => {
  it('인원·업력·단계가 달라도 결과가 동일하다', () => {
    const small = evaluate({ ...NAMED.sample, company: { ...NAMED.sample.company, size: '1인', years: '1년 미만', stage: '예비' } });
    const large = evaluate({ ...NAMED.sample, company: { ...NAMED.sample.company, size: '1,000명 이상', years: '10년 이상', stage: '중견기업' } });
    expect(large).toEqual(small);
  });
});

describe('종합 역량점수', () => {
  it('가중치 합은 1.00', () => {
    expect(CAPABILITY_WEIGHTS.reduce((s, [, w]) => s + w, 0)).toBeCloseTo(1, 10);
  });

  it('일부 차원만 응답하면 응답 차원끼리 재정규화된다', () => {
    // 전략정렬·리스크대응 무응답(8문항 응답)
    const r = evaluate(makeInput({ answers: { q1: 5, q2: 5, q12: 5, q3: 5, q4: 5, q5: 5, q6: 5, q7: 5 } }));
    expect(r.capability).toBeCloseTo(100, 10);
    expect(r.pendingDimensions).toEqual(['strategy', 'risk']);
  });

  it('최소 응답 기준: 공통 핵심 8문항 미만이면 응답한 영역도 점수를 내지 않음(판단 보류)', () => {
    const r = evaluate(makeInput({ answers: { q1: 5, q2: 5, q12: 5 } }));
    expect(r.coreAnswered).toBe(3);
    expect(r.insufficient).toBe(true);
    expect(r.capability).toBeNull();
    expect(r.m.tech).toBeNull();
  });

  it('band 경계값', () => {
    expect([band(80), band(79.9), band(65), band(45), band(44.9), band(null)]).toEqual(['강점', '양호', '양호', '보완 필요', '우선 개선', '판단 보류']);
  });
});

describe('우선순위', () => {
  it('Gap은 최대 5개, 낮은 점수 순, 우선순위 임계값 60/42', () => {
    const r = evaluate(NAMED.sample);
    expect(r.gaps.length).toBeLessThanOrEqual(5);
    const scores = r.gaps.map((g) => g.score as number);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
    for (const g of r.gaps) expect(g.priority).toBe((g.ps as number) >= 60 ? 'P0' : (g.ps as number) >= 42 ? 'P1' : 'P2');
  });
});

describe('핵심기술 TRL (D3)', () => {
  it('핵심기술별로 독립 유지, 비핵심·미확인 분리', () => {
    const r = evaluate(makeInput({
      inventory: [
        { id: 1, name: 'A', type: '', ownership: '자체', status: '확정', critical: true, trl: 4, confirmed: true },
        { id: 2, name: 'B', type: '', ownership: '자체', status: '확정', critical: true, trl: 8, confirmed: true },
        { id: 3, name: 'C', type: '', ownership: '외부', status: '추정', critical: true, trl: 0, confirmed: false },
        { id: 4, name: 'D', type: '', ownership: '외부', status: '추정', critical: false, trl: 9, confirmed: false },
      ],
    }));
    expect(r.trl.items).toEqual([{ id: 1, name: 'A', trl: 4 }, { id: 2, name: 'B', trl: 8 }, { id: 3, name: 'C', trl: null }]);
    expect([r.trl.min, r.trl.max, r.trl.distribution, r.trl.unknownCount]).toEqual([4, 8, '4~8', 1]);
  });
});

describe('전략대안', () => {
  it('판단 보류 영역이 있으면 검증·안정화(A)를 우선 권고', () => {
    const r = evaluate(makeInput({ answers: { q1: 5, q2: 5, q12: 5 }, evidence: { q1: 4, q2: 4, q12: 4 } }));
    expect(strategicOptions(r).find((o) => o.recommended)?.name).toMatch(/^A\./);
  });
});

describe('재현성', () => {
  it('결과에 버전 태그가 포함된다', () => {
    expect(evaluate(NAMED.sample).versions).toEqual(VERSIONS);
    expect(VERSIONS.scoring).toBe('rule-v1.1');
  });
  it('동일 입력 → 동일 결과', () => {
    expect(evaluate(NAMED.sample)).toEqual(evaluate(structuredClone(NAMED.sample)));
  });
});

import { recommendReason } from '../../src/diagnosis/strategy';
describe('우선 검토안 이유', () => {
  it('A안: 기준 미달 항목을 숫자로 밝힘', () => {
    const m = { tech: 63, rd: 75, exec: 75, evidence: 50, scale: 37, strategy: 37, risk: 50 };
    expect(recommendReason({ m, confidence: 54 })).toMatch(/^A를 먼저 권하는 이유: 진단 신뢰도 54\(기준 62 미만\)/);
    expect(recommendReason({ m, confidence: 70 })).toMatch(/^B를 권하는 이유: 기술성숙이 63점\(60 이상\).*확장준비가 37점/);
    expect(recommendReason({ m: { ...m, tech: 70, scale: 70, strategy: 60 }, confidence: 70 })).toMatch(/^C를 권하는 이유/);
  });
});
