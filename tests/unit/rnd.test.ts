// R&D 과제 제안(규칙): 유형별 제안·목표 TRL·로드맵 원문 연결·준비 상태·선정 가능성 표현 없음
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/diagnosis';
import { rndProposals, targetTrl, type RndInput } from '../../src/diagnosis/rnd';
import { NAMED } from '../fixtures/assessments';

const roadmap = [
  { name: 'AI 설비 예지보전 솔루션', code: 'SMESTR-2025-B-03-08', page: 271, source: '스마트제조 로드맵', matchedTechs: [{ name: 'AI 기반 설비 이상 탐지 및 고장 예측 알고리즘 기술', trl: '5', page: 272 }] },
  { name: 'AI 실시간 디지털트윈 의사결정 시스템', code: 'SMESTR-2025-B-02-02', page: 210, source: '스마트제조 로드맵', matchedTechs: [] },
];
const mk = (over: Partial<RndInput> = {}): RndInput => {
  const input = NAMED.sample;
  return {
    r: evaluate(input),
    techs: input.inventory.map((t) => ({ name: t.name, trl: t.trl, critical: t.critical, ownership: t.ownership })),
    roadmap,
    linkOf: (n) => (/예지보전|이상/.test(n) ? roadmap[0] : null),
    answers: input.answers,
    externalDependency: true,
    ...over,
  };
};

describe('R&D 과제 제안', () => {
  it('목표 TRL: 현재 +2단계(최대 9), 확인 전이면 확인 후 설정', () => {
    expect([targetTrl(4), targetTrl(8), targetTrl(9), targetTrl(0)]).toEqual(['TRL 6(유사환경 시스템 시연)', 'TRL 9(실사용·양산)', 'TRL 9 유지·확장', 'TRL 확인 후 설정']);
  });
  it('샘플기업: 고도화·초격차·실증 3개, 서로 다른 기술, 로드맵 원문 품목·쪽 연결', () => {
    const p = rndProposals(mk());
    expect(p.map((x) => x.track)).toEqual(['upgrade', 'frontier', 'validation']);
    expect(p[0].techName).not.toBe(p[2].techName);
    expect(p[1].roadmap).toMatchObject({ code: 'SMESTR-2025-B-03-08', page: 272, techTrl: '5' });
    expect(p[1].trlTarget).toBe('차세대 성능 목표 설정(로드맵 원문 TRL 5 기준 대조)');
    for (const x of p) {
      expect(x.contents).toHaveLength(3);
      expect(x.prep.length).toBeLessThanOrEqual(4);
      expect(JSON.stringify(x)).not.toMatch(/선정 가능|합격|적합도|높음|중간/);
    }
  });
  it('TRL 미확인이면 고도화는 선행 조건(TRL 확인), 실증 없음 → 융합 확장으로 채움', () => {
    const p = rndProposals(mk({ techs: [{ name: '탐지 모델', trl: 0, critical: true }] }));
    expect(p[0]).toMatchObject({ track: 'upgrade', readiness: '선행 조건 필요', trlTarget: 'TRL 확인 후 설정' });
    expect(p[0].prep[0]).toContain('TRL 확인');
    expect(p.map((x) => x.track)).toEqual(['upgrade', 'frontier', 'convergence']);
  });
  it('응답 부족(판단 보류)이면 모두 준비 상태가 신청 전 단계', () => {
    const r = evaluate({ ...NAMED.sample, answers: { q1: 5, q2: 5 } });
    const p = rndProposals(mk({ r }));
    expect(p.every((x) => x.readiness !== '신청 준비됨')).toBe(true);
  });
  it('핵심기술·로드맵이 없으면 제안 없음', () => {
    expect(rndProposals(mk({ techs: [], roadmap: [] }))).toEqual([]);
  });
});
