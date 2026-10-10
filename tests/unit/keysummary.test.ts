// 6단계 핵심요약: 모든 값이 reportCore 결과와 같고, 대표가 바로 읽을 수 있는 문장인지
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reportCore } from '../../src/reports/core';
import { keySummary } from '../../src/reports/keysummary';
import { textIssues } from '../../src/reports/text-quality';
import { setRoadmapIndex, type AppIndex } from '../../src/roadmap/candidates';
import raw from '../../src/roadmap/kb-app-index.json';
import { NAMED } from '../fixtures/assessments';
import { GOLDEN } from '../fixtures/golden';

const act = (area: string) => [`${area} 개선 과제`, '설명', '대표', '2~4주', '지표'];

describe('핵심요약', () => {
  beforeAll(() => setRoadmapIndex(raw as unknown as AppIndex));
  afterAll(() => setRoadmapIndex(null));

  it('샘플기업: 결론 한 줄 + 카드 6개 + 90일 할 일, 값은 본문과 같음', () => {
    const c = reportCore(NAMED.sample);
    const k = keySummary(NAMED.sample, c, act);
    expect(k.held).toBe(false);
    expect(k.tiles.map((t) => t.key)).toEqual(['position', 'urgent', 'tech', 'support', 'risk', 'trust']);
    expect(k.facts.p0Area).toBe(c.priorities[0].area);
    expect(k.facts.p0Act).toBe(`${c.priorities[0].area} 개선 과제`);
    expect(k.facts.topTech).toBe(c.ranked[0].tech.name);
    expect(k.facts.ready).toBe(c.ready.overall);
    expect(k.facts.high).toBe(c.redteam.risks.filter((x) => x.grade === '높음').length);
    expect(k.headline).toContain(`${k.facts.capability}점`);
    expect(k.headline).toContain(`'${c.priorities[0].area}'`);
    expect(k.steps[0].what).toBe(k.facts.p0Act);
    expect(k.steps.at(-1)!.when).toBe('90일 후');
  });

  it('표준 사례 12개: 문장 품질 규칙 통과·선정 가능성 표현 없음', () => {
    for (const g of GOLDEN) {
      const c = reportCore(g.input);
      const k = keySummary(g.input, c, act);
      const text = [k.headline, ...k.tiles.flatMap((t) => [t.label, t.head, t.body]), ...k.steps.map((s) => s.what)].join('\n');
      expect(textIssues(text).filter((x) => x.kind !== 'long-sentence'), g.id).toEqual([]);
      expect(text, g.id).not.toMatch(/선정 가능|합격|적합도|undefined|NaN|null/);
      expect(k.headline.length, g.id).toBeLessThanOrEqual(120);
      expect(k.steps.length, g.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("응답 부족(판단 보류)이면 점수 대신 '먼저 응답 보완'", () => {
    const g = GOLDEN[0].input;
    const input = { ...g, answers: Object.fromEntries(Object.keys(g.answers).map((x) => [x, null])) };
    const k = keySummary(input, reportCore(input), act);
    expect(k.held).toBe(true);
    expect(k.headline).toMatch(/아직 점수를 판단하지 않았습니다/);
    expect(k.tiles[0].head).toBe('판단 보류');
    expect(k.facts.p0Area).toBeNull();
    expect(k.steps[0].when).toBe('이번 주');
  });
});
