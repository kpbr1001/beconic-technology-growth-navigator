// Rule Engine 진입점: 입력 JSON → 결과 JSON (순수 함수, 브라우저·서버 공용)
import { capabilityScore, dimensionScores } from './scoring';
import { confidenceScore } from './confidence';
import { consistencyAlerts } from './consistency';
import { priorityGaps } from './priority';
import { activeQuestions, DIMENSIONS } from './questions';
import { trlSummary } from './trl';
import { VERSIONS } from './versions';
import type { AssessmentInput, AssessmentResult } from './types';

export function evaluate(input: AssessmentInput): AssessmentResult {
  const questions = activeQuestions(input.mode, input.company.bizType);
  const m = dimensionScores(questions, input.answers);
  const pendingDimensions = DIMENSIONS.filter((d) => m[d] === null);
  const { confidence, answered, unknown } = confidenceScore({
    questions, answers: input.answers, evidence: input.evidence, inventory: input.inventory,
  });
  const capability = capabilityScore(m);

  let level: AssessmentResult['level'] = '잠정진단';
  if (confidence >= 72) level = '근거기반 진단';
  if (confidence >= 88 && m.evidence !== null && m.evidence >= 70) level = '외부검증 준비';

  const uncertainty = Math.round((100 - confidence) * 0.18);
  const range: AssessmentResult['range'] =
    capability === null
      ? null
      : [Math.max(0, Math.round(capability) - uncertainty), Math.min(100, Math.round(capability) + uncertainty)];

  return {
    versions: { ...VERSIONS },
    m,
    pendingDimensions,
    confidence,
    capability,
    trl: trlSummary(input.inventory),
    level,
    answered,
    unknown,
    gaps: priorityGaps(m, confidence),
    alerts: consistencyAlerts(
      questions, input.answers, Boolean(input.discovery.external), pendingDimensions,
      input.inventory.filter((t) => t.critical && t.trl > 0).map((t) => t.trl),
    ),
    insufficient: answered < 8,
    range,
  };
}

export * from './types';
export * from './questions';
export { band, CAPABILITY_WEIGHTS } from './scoring';
export { nextTrlGate } from './trl';
export { EVIDENCE_FIRST_AREA } from './priority';
export { VERSIONS } from './versions';
