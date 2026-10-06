// 보완 필요 기술·데이터: 로드맵 품목 원문 핵심기술 전체를 기업 핵심기술과 대조(원문에 있는 기술명·TRL·쪽만)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roadmapCandidates, roadmapInputOf, setRoadmapIndex, type AppIndex, type RoadmapCandidate } from '../../src/roadmap/candidates';
import { gapCards, gapTechNames } from '../../src/roadmap/gaps';
import raw from '../../src/roadmap/kb-app-index.json';
import { NAMED } from '../fixtures/assessments';

const cand = (o: Partial<RoadmapCandidate>): RoadmapCandidate => ({
  name: 'AI 설비 예지보전 솔루션', hits: 3, label: '', reason: '', source: '스마트제조 로드맵', evidenceGrade: 'retrieved', page: 271, code: 'B-03-08',
  allTechs: [
    { name: 'AI 기반 설비 이상 탐지 및 고장 예측 알고리즘 기술', trl: '5', page: 272 },
    { name: '엣지 기반 센서·비전 데이터 실시간 수집·전처리 기술', trl: '4', page: 272 },
    { name: '설비 유지보수 최적화 및 자동 정비 스케줄링 기술', trl: '6', page: 272 },
    { name: '디지털트윈 연계 가상 시운전 기술', trl: '7', page: 273 },
  ],
  ...o,
});

describe('보완 필요 기술·데이터', () => {
  it('원문 핵심기술마다 보유 대조 / 답변 언급 / 보완 후보로 나누고 근거 단어를 남김', () => {
    const [card] = gapCards({
      candidates: [cand({})],
      techs: [{ name: '이상징후 탐지 모델', trl: 6, critical: true }, { name: '목록만 기술', trl: 3, critical: false }],
      answerText: '정비 우선순위까지 자동 추천합니다', dataText: '진동·온도·전류 센서값, 알람 로그', rdScore: 75,
    });
    expect(card.rows.map((r) => [r.status, r.company?.name ?? r.route ?? r.overlap.join('·')])).toEqual([
      ['held', '이상징후 탐지 모델'],
      ['gap', '자체 개발 후보'],
      ['mentioned', '정비'],
      ['gap', '외부 협력·기술 도입 검토'], // 원문 TRL 7 → 외부 협력·도입 검토
    ]);
    expect(card.rows[0].overlap).toEqual(['이상', '탐지']);
    // 데이터: 원문 기술명에 '비전'이 있는데 데이터 답변에 없음(센서는 있음)
    expect(card.dataGaps).toEqual([{ term: '비전', roadmapTech: '엣지 기반 센서·비전 데이터 실시간 수집·전처리 기술', page: 272 }]);
    expect(gapTechNames([card])).toHaveLength(3);
  });
  it('R&D 역량이 낮으면 보완 경로는 외부 협력·도입, 데이터 답변이 비면 데이터 대조 안 함', () => {
    const [card] = gapCards({ candidates: [cand({})], techs: [], answerText: '', dataText: '', rdScore: 30 });
    expect(card.rows.every((r) => r.status === 'gap' && r.route === '외부 협력·기술 도입 검토')).toBe(true);
    expect(card).toMatchObject({ dataGaps: [], dataUnchecked: true });
  });
  it('원문 핵심기술이 없는 후보(세부분야 대체)는 카드 없음, 약한 후보보다 강한 후보 우선', () => {
    expect(gapCards({ candidates: [cand({ allTechs: [] })], techs: [], answerText: '', dataText: '', rdScore: 50 })).toEqual([]);
    const cards = gapCards({ candidates: [cand({ name: '약한', weak: true }), cand({ name: '강한' })], techs: [], answerText: '', dataText: '', rdScore: 50 });
    expect(cards.map((c) => c.item.name)).toEqual(['강한']);
  });

  describe('실제 원문 색인(샘플기업)', () => {
    beforeAll(() => setRoadmapIndex(raw as unknown as AppIndex));
    afterAll(() => setRoadmapIndex(null));
    it('후보 품목의 원문 핵심기술·쪽만 쓰고, 이름 겹침이 있으면 보유 대조', () => {
      const input = NAMED.sample;
      const cards = gapCards({
        candidates: roadmapCandidates(roadmapInputOf(input)),
        techs: input.inventory.map((t) => ({ name: t.name, trl: t.trl, critical: t.critical })),
        answerText: Object.values(input.discovery).join(' '), dataText: input.discovery.data, rdScore: 50,
      });
      expect(cards.length).toBeGreaterThan(0);
      for (const c of cards) for (const r of c.rows) expect(r.page === null || r.page > 0).toBe(true);
      expect(cards.flatMap((c) => c.rows).some((r) => r.status === 'held')).toBe(true);
    });
  });
});
