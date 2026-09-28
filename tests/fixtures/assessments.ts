// 회귀·단위 테스트용 입력 fixture. 고정 시나리오 + 시드 고정 난수 시나리오.
import type { Answer, AssessmentInput, TechItem } from '../../src/diagnosis';
import { activeQuestions } from '../../src/diagnosis';
import options from '../../src/app/options.json';
import taxonomy from '../../src/roadmap/static-taxonomy.json';

const emptyDiscovery = { hardPart: '', automated: '', data: '', external: '', people: '', validation: '' };
const baseCompany = { bizType: 'AI/SW 중심', roadmapField: 'AI', product: '', sectorDetail: '' };

export function makeInput(p: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    mode: 'quick', company: { ...baseCompany }, discovery: { ...emptyDiscovery },
    inventory: [], answers: {}, evidence: {}, ...p,
  };
}

const allAnswers = (v: Answer, mode: AssessmentInput['mode'] = 'quick', bizType = baseCompany.bizType) =>
  Object.fromEntries(activeQuestions(mode, bizType).map((q) => [q.id, v]));

/** v0.9 loadSample()과 동일한 샘플기업 */
export const SAMPLE: AssessmentInput = {
  mode: 'deep',
  company: {
    name: '샘플AI 제조솔루션', stage: '소기업', roadmapField: '스마트제조(특화)', bizType: '융합형(제조+SW/AI)',
    sectorDetail: 'AI 기반 설비 예지보전', size: '20~49명', years: '4~7년', techKnow: '부분적으로 알고 있음',
    product: '설비 센서데이터와 AI를 이용해 이상징후를 탐지하고 고장 가능성을 예측하는 예지보전 솔루션',
    customer: '중소 제조기업의 생산·설비관리 담당자',
  },
  discovery: {
    hardPart: '설비별 센서데이터 정규화와 이상패턴 탐지', automated: '설비 이상징후 탐지와 정비 우선순위 추천',
    data: '진동·온도·전류 센서데이터와 설비 이벤트 로그', external: '클라우드 인프라와 일부 LLM API',
    people: 'CTO·AI 개발자·현장 엔지니어', validation: '2개 제조현장 PoC 및 내부 성능 테스트',
  },
  inventory: [
    { id: 1, name: '설비센서 데이터 정규화', type: '데이터기술', ownership: '자체', status: '확정', critical: true, trl: 6, confirmed: true },
    { id: 2, name: '이상징후 탐지 모델', type: 'AI/알고리즘', ownership: '혼합', status: '확정', critical: true, trl: 6, confirmed: true },
    { id: 3, name: '예지보전 플랫폼', type: '응용기술', ownership: '자체', status: '확정', critical: true, trl: 7, confirmed: true },
    { id: 4, name: '클라우드·LLM 연계', type: '통합기술', ownership: '외부', status: '대표진술', critical: false, trl: 7, confirmed: true },
  ],
  answers: { q1: 5, q2: 4, q3: 3, q4: 3, q5: 3, q6: 3, q7: 3, q8: 3, q9: 2, q10: 2, q11: 2, q12: 4, d1: 4, d2: 3, d5: 3, d6: 3, d7: 2 },
  evidence: {
    ...Object.fromEntries(activeQuestions('deep', '융합형(제조+SW/AI)').map((q) => [q.id, 1])),
    q1: 3, q2: 3, q6: 3, q3: 2, q4: 2, q12: 2,
  },
};

export const NAMED: Record<string, AssessmentInput> = {
  sample: SAMPLE,
  all5: makeInput({ answers: allAnswers(5), evidence: Object.fromEntries(Object.keys(allAnswers(5)).map((k) => [k, 4])) }),
  all1: makeInput({ answers: allAnswers(1) }),
  all3Deep제조: makeInput({ mode: 'deep', company: { ...baseCompany, bizType: '제조 중심', roadmapField: '첨단제조' }, answers: allAnswers(3, 'deep', '제조 중심') }),
  allUnknown: makeInput({ answers: allAnswers(null) }),
  noAnswers: makeInput(),
  /** 리스크·확장·전략 차원 무응답 */
  partial: makeInput({ answers: { q1: 4, q2: 2, q3: 3, q4: 3, q5: 2, q6: 1, q12: 5 } }),
  externalDependency: makeInput({
    discovery: { ...emptyDiscovery, external: 'LLM API' },
    answers: { ...allAnswers(3), q9: 1, q1: 5, q2: 1, q12: 4, q6: 2 },
  }),
};

// ---- 시드 고정 난수 ----
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInputs(n: number, seed = 20260928): AssessmentInput[] {
  const r = mulberry32(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const fields = Object.values(taxonomy.ROADMAP_GROUPS).flat();
  const words = Object.values(taxonomy.ROADMAP_DETAIL).flat().join(' ').split(/[·/\s]+/);
  const out: AssessmentInput[] = [];
  for (let i = 0; i < n; i++) {
    const mode = r() < 0.5 ? 'quick' : 'deep';
    const bizType = pick(options.BUSINESS_TYPES);
    const unknownRate = pick([0, 0.1, 0.3, 0.6, 0.95]);
    const qs = activeQuestions(mode, bizType);
    const answers: Record<string, Answer> = {};
    const evidence: Record<string, number> = {};
    for (const q of qs) {
      const x = r();
      answers[q.id] = x < unknownRate ? (r() < 0.5 ? null : undefined) : 1 + Math.floor(r() * 5);
      if (r() < 0.7) evidence[q.id] = Math.floor(r() * 5);
    }
    const inventory: TechItem[] = Array.from({ length: Math.floor(r() * 6) }, (_, k) => ({
      id: k + 1, name: `기술${k} ${pick(words)}`, type: '핵심기술', ownership: '자체',
      status: pick(['확정', '대표진술', '추정', '미확인']), critical: r() < 0.6,
      trl: pick([0, 2, 4, 6, 7, 8, 9]), confirmed: r() < 0.4,
    }));
    out.push({
      mode, answers, evidence, inventory,
      company: { bizType, roadmapField: pick(fields), product: `${pick(words)} ${pick(words)} 솔루션`, sectorDetail: pick(words) },
      discovery: { ...emptyDiscovery, external: r() < 0.5 ? '외주' : '', hardPart: pick(words), data: pick(words) },
    });
  }
  return out;
}
