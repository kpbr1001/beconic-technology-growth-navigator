// 진단 신뢰도(Evidence Confidence). 기술점수와 분리해 계산한다.
import { evidenceLevel, isUnknown } from './questions';
import type { Answer, Question, TechItem } from './types';

export interface ConfidenceInput {
  questions: Question[];
  answers: Record<string, Answer>;
  evidence: Record<string, number | undefined>;
  inventory: TechItem[];
}

export function confidenceScore({ questions, answers, evidence, inventory }: ConfidenceInput) {
  let conf = 0, cw = 0, answered = 0, unknown = 0;
  for (const q of questions) {
    if (isUnknown(answers[q.id])) { unknown++; continue; }
    answered++;
    conf += evidenceLevel(evidence, q.id).m * q.w;
    cw += q.w;
  }
  const invRatio = inventory.length
    ? inventory.filter((x) => x.confirmed || x.status === '확정').length / inventory.length
    : 0;
  // 근거강도 75% + 기술확인 25% − 모름 1개당 1.2 (v0.9 동일)
  let confidence = (cw ? (conf / cw) * 100 : 35) * 0.75 + invRatio * 25 - unknown * 1.2;
  confidence = Math.max(10, Math.min(100, confidence));
  return { confidence, answered, unknown };
}
