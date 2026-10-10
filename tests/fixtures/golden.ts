// 표준 사례 12개: 운영유형 6종 × 성숙도(초기·성장). 결과(P0·추천안·핵심기술 1위·R&D·보완 후보)를 기대 결과표로 고정해
// 규칙을 바꿀 때 결과가 조용히 바뀌지 않게 한다. 기업 답변은 업종별 작성 예시(src/app/examples.ts)를 그대로 쓴다.
import type { Answer, AssessmentInput, TechItem } from '../../src/diagnosis';
import { activeQuestions } from '../../src/diagnosis';
import { examplesFor } from '../../src/app/examples';

type Level = 'early' | 'growth';
interface Spec {
  key: string;
  bizType: string;
  roadmapField: string;
  techs: [name: string, type: string, earlyTrl: number, growthTrl: number, ownership: string][];
}

const SPECS: Spec[] = [
  { key: 'aisw', bizType: 'AI/SW 중심', roadmapField: 'AI', techs: [['문서 분류·항목 추출 모델', 'AI/알고리즘', 3, 7, '자체'], ['거래처 양식 후처리 규칙', '데이터기술', 2, 6, '자체'], ['ERP 연동 모듈', '통합기술', 4, 7, '혼합']] },
  { key: 'mfg', bizType: '제조 중심', roadmapField: '소재·부품·장비(특화)', techs: [['정밀 금형 설계', '설계기술', 4, 8, '자체'], ['사출 공정 조건 최적화', '공정기술', 3, 7, '자체'], ['비전 검사 자동 판정', '품질기술', 2, 6, '외부']] },
  { key: 'svc', bizType: '서비스 중심', roadmapField: '서비스R&D(특화)', techs: [['요양보호사 매칭 기준', '서비스기술', 3, 6, '자체'], ['돌봄 품질 운영 매뉴얼', '서비스기술', 2, 6, '자체'], ['방문 기록 공유 앱', '응용기술', 4, 7, '혼합']] },
  { key: 'hw', bizType: '하드웨어/IoT 중심', roadmapField: '스마트제조(특화)', techs: [['저전력 센서 회로 설계', '설계기술', 4, 7, '자체'], ['금속 표면 무선 안테나', '설계기술', 3, 6, '자체'], ['게이트웨이 이상 신호 선별', '통합기술', 3, 6, '혼합']] },
  { key: 'deep', bizType: 'R&D/딥테크 중심', roadmapField: '이차전지', techs: [['실리콘-탄소 복합 음극재 합성', '원천기술', 3, 5, '자체'], ['나노 구조 설계', '원천기술', 2, 5, '자체'], ['코인셀 수명 평가', '실증기술', 3, 6, '외부']] },
  { key: 'fusion', bizType: '융합형(제조+SW/AI)', roadmapField: '스마트제조(특화)', techs: [['설비 센서 데이터 정규화', '데이터기술', 3, 6, '자체'], ['이상징후 탐지 모델', 'AI/알고리즘', 3, 6, '혼합'], ['예지보전 플랫폼', '응용기술', 4, 7, '자체']] },
];

/** 초기: 대부분 2~3점·'모름' 2개·근거 약함·TRL 낮음·확인 전 / 성장: 4~5점(외부 의존·인증 3점)·근거 강함·TRL 높음·확인 */
const ANSWERS: Record<Level, Record<string, Answer>> = {
  early: { q1: 3, q2: 2, q3: 2, q4: 3, q5: 2, q6: 2, q7: 2, q8: 3, q9: null, q10: null, q11: 2, q12: 3 },
  growth: { q1: 5, q2: 4, q3: 4, q4: 4, q5: 4, q6: 4, q7: 3, q8: 4, q9: 3, q10: 3, q11: 4, q12: 4 },
};
const EVIDENCE: Record<Level, number> = { early: 1, growth: 3 };

function make(spec: Spec, level: Level): AssessmentInput {
  const ex = examplesFor(spec.bizType);
  const mode = level === 'growth' ? 'deep' : 'quick';
  const qs = activeQuestions(mode, spec.bizType);
  const answers: Record<string, Answer> = { ...ANSWERS[level] };
  for (const q of qs) if (!(q.id in answers)) answers[q.id] = level === 'growth' ? 4 : 2; // 심화 문항
  const inventory: TechItem[] = spec.techs.map(([name, type, e, g, ownership], i) => ({
    id: i + 1, name, type, ownership, status: level === 'growth' ? '확정' : '추정', critical: true,
    trl: level === 'growth' ? g : e, confirmed: level === 'growth',
  }));
  return {
    mode,
    company: { name: `표준사례-${spec.key}-${level}`, roadmapField: spec.roadmapField, bizType: spec.bizType, sectorDetail: ex.sectorDetail, product: ex.product, customer: ex.customer },
    discovery: { hardPart: ex.hardPart, automated: ex.automated, data: ex.data, external: ex.external, people: ex.people, validation: ex.validation },
    inventory,
    answers,
    evidence: Object.fromEntries(qs.map((q) => [q.id, EVIDENCE[level]])),
  };
}

export const GOLDEN: { id: string; label: string; input: AssessmentInput }[] = SPECS.flatMap((s) =>
  (['early', 'growth'] as Level[]).map((l) => ({ id: `${s.key}-${l}`, label: `${s.bizType} · ${l === 'early' ? '초기' : '성장'}`, input: make(s, l) })),
);
