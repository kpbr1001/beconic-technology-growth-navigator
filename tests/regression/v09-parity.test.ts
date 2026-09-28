// v0.9 회귀 테스트: 신규 Rule Engine이 v0.9 원본과 같은 판정을 내는지 확인한다.
// 의도된 차이(승인된 P0 수정)는 별도 describe에서 '차이가 정확히 그것뿐'임을 고정한다.
import { describe, expect, it } from 'vitest';
import { evaluate, activeQuestions, nextTrlGate } from '../../src/diagnosis';
import { strategicOptions, riskItems } from '../../src/diagnosis/strategy';
import { roadmapCandidates } from '../../src/roadmap/candidates';
import type { AssessmentInput } from '../../src/diagnosis';
import { NAMED, randomInputs } from '../fixtures/assessments';
import { runV09 } from './v09-oracle';

const cases: [string, AssessmentInput][] = [
  ...Object.entries(NAMED),
  ...randomInputs(300).map((x, i) => [`random#${i}`, x] as [string, AssessmentInput]),
];

const candidateTexts = (x: AssessmentInput) => [
  x.company.product, x.company.sectorDetail, x.discovery.hardPart, x.discovery.automated, x.discovery.data,
  ...x.inventory.filter((t) => t.critical).map((t) => t.name),
];

describe.each(cases)('v0.9 parity · %s', (_name, input) => {
  const old = runV09(input);
  const now = evaluate(input);
  const complete = now.pendingDimensions.length === 0;

  it('활성 문항 세트 동일', () => {
    expect(activeQuestions(input.mode, input.company.bizType).map((q) => q.id)).toEqual(old.activeIds);
  });

  it('신뢰도·응답수·진단수준·미완료 판정 동일', () => {
    expect(now.confidence).toBe(old.results.confidence);
    expect(now.answered).toBe(old.results.answered);
    expect(now.unknown).toBe(old.results.unknown);
    expect(now.insufficient).toBe(old.results.insufficient);
    expect(now.level).toBe(old.results.level);
  });

  it('응답이 있는 차원 점수는 v0.9와 동일, 무응답 차원만 50 → null(D2)', () => {
    for (const [d, v] of Object.entries(now.m)) {
      if (v === null) expect(old.results.m[d]).toBe(50);
      else expect(v).toBe(old.results.m[d]);
    }
  });

  it('리스크 신호·로드맵 후보 순서·TRL Gate 동일', () => {
    expect(riskItems(input.answers)).toEqual(old.risks);
    const cand = roadmapCandidates({ roadmapField: input.company.roadmapField, texts: candidateTexts(input) });
    expect(cand.map((c) => c.name)).toEqual(old.candidates.map((c) => c.name));
    const crit = input.inventory.filter((t) => t.critical).map((t) => ({ id: t.id, ...nextTrlGate(t.trl) }));
    expect(crit).toEqual(old.crit.map(({ id, target, gate }) => ({ id, target, gate })));
  });

  it.runIf(complete)('전 차원 응답 시: 역량점수·범위·Gap·우선순위·경고·전략대안 완전 동일', () => {
    expect(now.capability).toBe(old.results.capability);
    expect(now.range).toEqual(old.results.range);
    expect(now.gaps).toEqual(old.results.gaps);
    expect(now.alerts).toEqual(old.results.alerts);
    expect(strategicOptions(now).map((o) => [o.name, o.score, o.recommended])).toEqual(
      old.options.map((o) => [o.name, o.score, o.recommended]),
    );
  });

  it.runIf(!complete)('무응답 차원 존재 시: Gap에서 제외되고 판단 보류 경고가 추가됨', () => {
    const areas = now.gaps.map((g) => g.area);
    expect(now.alerts.at(-1)).toMatch(/판단 보류/);
    expect(now.alerts.slice(0, -1)).toEqual(old.results.alerts);
    for (const g of now.gaps) if (g.score !== null) expect(areas).toContain(g.area);
    expect(now.gaps.every((g) => g.score === null || g.area !== '근거확보')).toBe(true);
  });
});

describe('의도된 차이 고정 (승인된 P0 수정)', () => {
  it('D3: TRL 평균 필드가 없고 핵심기술별 값과 분포만 제공', () => {
    const { trl } = evaluate(NAMED.sample);
    expect(trl).not.toHaveProperty('avg');
    expect(trl.items.map((x) => x.trl)).toEqual([6, 6, 7]);
    expect(trl.distribution).toBe('6~7');
    expect(runV09(NAMED.sample).results.trl).toBe(6); // v0.9는 (6+6+7)/3 반올림 = 6
  });

  it('D1: 로드맵 후보에 적합도 등급·공식근거 표기가 없음', () => {
    const c = roadmapCandidates({ roadmapField: 'AI', texts: ['AI 에이전트 컨텐츠'] });
    for (const x of c) {
      expect(x.evidenceGrade).toBe('unverified');
      expect(x.page).toBeNull();
      expect(`${x.label} ${x.reason} ${x.source}`).not.toMatch(/높음|중간|공식근거/);
    }
  });

  it('D2: 전부 모름이면 모든 차원 판단 보류, 역량점수 null, 근거확보가 P0', () => {
    const r = evaluate(NAMED.allUnknown);
    expect(Object.values(r.m).every((v) => v === null)).toBe(true);
    expect(r.capability).toBeNull();
    expect(r.range).toBeNull();
    expect(r.gaps).toEqual([{ area: '근거확보', score: null, ps: null, priority: 'P0' }]);
    expect(runV09(NAMED.allUnknown).results.capability).toBe(50); // v0.9는 50점으로 표시
  });
});
