// 결과 문구 개인화: 입력에 있는 기술·과제·의존요소로 채우고, 없는 사실은 만들지 않음
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/diagnosis/questions';
import { areaDrivers, confirmQuestions, decisionData, horizonPlan, personalAction, type PlanCtx } from '../../src/reports/personalize';
import { examplesFor, EXAMPLE_TYPES } from '../../src/app/examples';
import { discoverCandidates } from '../../src/diagnosis/discovery';

const ctx: PlanCtx = {
  product: '예지보전 AI SaaS', data: '진동·온도 센서데이터', external: 'AWS 클라우드와 LLM API',
  gaps: [
    { area: '전략정렬', score: 37, ps: 62, priority: 'P0' },
    { area: '확장준비', score: 37, ps: 55, priority: 'P1' },
    { area: '기술기록', score: 50, ps: 45, priority: 'P1' },
  ],
  techs: [
    { name: '데이터 정규화', trl: 3, gate: '실험실 시제품 검증', target: 'TRL 4', confirmed: false },
    { name: '고장 예측 모델', trl: 0, gate: '현재 TRL 근거 확인', target: '확인 필요' },
  ],
  rnd: [{ id: 'R&D-1', title: '데이터 정규화 성능 고도화', trackLabel: '기존 기술 고도화', techName: '데이터 정규화' }],
  roadmapTop: { name: 'AI 설비 예지보전 솔루션', code: 'B-03-08', page: 271 },
  mappedCount: 1, recommended: 'A', highRisks: [{ id: 'R2', name: '외부 의존 중단 리스크' }],
};
const base = (t: string) => [t, '기본 설명', '담당', '2주', '기본 지표'];

describe('개인화 문구', () => {
  it('영역 과제에 기업의 기술·로드맵·의존요소·과제 수를 넣음(담당·기간은 표준 유지)', () => {
    expect(personalAction('전략정렬', base('대조표'), ctx)).toEqual(['대조표', "로드맵 품목 'AI 설비 예지보전 솔루션'(B-03-08 p.271) 개발목표와 내부 개발과제를 대조합니다.", '담당', '2주', '핵심기술 2개 매핑(현재 후보 연결 1개)']);
    expect(personalAction('리스크대응', base('대체경로'), ctx)[1]).toContain("'AWS 클라우드와 LLM API' 중단");
    expect(personalAction('리스크대응', base('대체경로'), ctx)[4]).toBe("'높음' 리스크 1건(R2) 대응책 수립");
    expect(personalAction('기술기록', base('정의서'), ctx)[4]).toBe('핵심기술 정의서 2건 확보');
    expect(personalAction('실행준비', base('책임'), ctx)[4]).toBe('P0 1건·P1 2건 담당·기한·완료기준 100% 지정');
    // 정보가 없으면 표준 문구 그대로
    expect(personalAction('전략정렬', base('대조표'), { ...ctx, roadmapTop: null })).toEqual(base('대조표'));
  });
  it('로드맵: Q1은 P0 과제, 1·3·5년은 핵심기술 TRL 단계·R&D 과제·추천안·리스크로', () => {
    const h = horizonPlan(ctx, (a) => `${a} 과제`);
    expect(h.quarters[0][1][0]).toBe('[P0] 전략정렬 과제 완료');
    expect(h.y1).toContain("'데이터 정규화' TRL 3→4(실험실 시제품 검증)");
    expect(h.y1).toContain("'고장 예측 모델' 현재 TRL 확인·근거자료 확보");
    expect(h.y1.some((x) => x.startsWith('R&D-1'))).toBe(true);
    expect(h.y3).toContain('핵심 외부 의존 대체경로 확보(R2)');
    expect(h.y5[0]).toBe("'데이터 정규화' 실제환경 실증(TRL 7)");
    for (const l of [h.y1, h.y3, h.y5]) expect(l.length).toBeLessThanOrEqual(4);
  });
  it('영역 근거 문항과 확인 질문은 실제 응답에서', () => {
    const ans = { q7: 2, q8: null, q11: 5, q2: 4 };
    const evName = (id: string) => (id === 'q11' ? '말로만 설명' : '내부 자료');
    const evRank = (id: string) => (id === 'q11' ? 0 : 2);
    expect(areaDrivers('scale', CORE, ans, evName, evRank).map((d) => d.text)).toEqual(["'확장 시 품질 유지' 문항: 2/5 '병목 일부 인지' · 근거 '내부 자료'"]);
    expect(areaDrivers('strategy', CORE, ans, evName, evRank).map((d) => d.kind)).toEqual(['unknown', 'weak_evidence']);
    const all = confirmQuestions(CORE, ans, evName, evRank, ['TRL 대조: 실증한 기술을 확인하세요.'], ctx.techs, 30);
    // 핵심 문항 먼저, 미응답과 '모름'을 구분
    expect(all[0]).toBe("'핵심 기능 구현' 문항을 응답하지 않았습니다. 누가 확인할 수 있고, 어떤 자료가 있습니까?");
    expect(all).toContain("'1~3년 핵심기술 정의' 문항을 '모름'으로 답했습니다. 누가 확인할 수 있고, 어떤 자료가 있습니까?");
    expect(all).toContain('실증한 기술을 확인하세요.');
    expect(all).toContain("'로드맵 연관성 설명' 문항을 5/5로 답했지만 근거가 '말로만 설명'입니다. 다시 확인할 수 있는 기록은 무엇입니까?");
    expect(all).toContain("핵심기술 '데이터 정규화'의 TRL 3은 어떤 시험·실증 결과로 확인했습니까?");
    expect(confirmQuestions(CORE, ans, evName, evRank, [], ctx.techs)).toHaveLength(4);
  });
  it('결정 데이터는 높음 리스크·추천안·R&D 과제에 따라', () => {
    expect(decisionData(ctx)).toEqual(['과제별 예상비용·필요인력', '외부 의존 대체 공급자·전환 비용', '근거자료 확보에 필요한 기간·담당', 'R&D 지원사업 공고 일정·매칭 비율']);
  });
});

describe('업종별 작성 예시', () => {
  it('6개 운영유형마다 9개 칸 예시가 있고, 모르는 유형은 융합형', () => {
    expect(EXAMPLE_TYPES).toHaveLength(6);
    for (const t of EXAMPLE_TYPES) for (const v of Object.values(examplesFor(t))) expect(v.length).toBeGreaterThan(10);
    expect(examplesFor('없는 유형')).toBe(examplesFor('융합형(제조+SW/AI)'));
    expect(examplesFor('제조 중심').hardPart).not.toBe(examplesFor('AI/SW 중심').hardPart);
  });
  it('각 예시로 기술 후보를 2개 이상 찾을 수 있음(규칙 기반)', () => {
    for (const t of EXAMPLE_TYPES) {
      const e = examplesFor(t);
      const found = discoverCandidates({ company: { bizType: t, roadmapField: '', product: e.product, sectorDetail: e.sectorDetail }, discovery: e });
      expect(found.length, t).toBeGreaterThanOrEqual(2);
    }
  });
});
