// Rule Engine 진입점: 입력 JSON → 결과 JSON (순수 함수, 브라우저·서버 공용)
import { capabilityScore, dimensionScores } from './scoring';
import { confidenceScore } from './confidence';
import { consistencyAlerts } from './consistency';
import { priorityGaps } from './priority';
import { activeQuestions, CORE, DIMENSIONS, isUnknown } from './questions';
import { trlSummary } from './trl';
import { VERSIONS } from './versions';
import type { AssessmentInput, AssessmentResult, DimensionScores } from './types';

/** 최소 응답 기준(rule-v1.1): 공통 핵심 12문항 중 이 수 미만이면 점수를 내지 않고 '판단 보류' */
export const MIN_CORE_ANSWERS = 8;
/** 최소 응답 미달 경고 머리말(v0.9 원본에 없는 경고 — 회귀 비교에서 구분용) */
export const HOLD_ALERT = '판단 보류(최소 응답 미달): ';

export function evaluate(input: AssessmentInput): AssessmentResult {
  const questions = activeQuestions(input.mode, input.company.bizType);
  // 응답이 너무 적으면(예: 2문항 5점 → 100점) 점수가 과대해 보이므로 영역·역량 점수를 모두 보류한다
  const coreAnswered = CORE.filter((q) => !isUnknown(input.answers[q.id])).length;
  const held = coreAnswered < MIN_CORE_ANSWERS;
  const m: DimensionScores = held
    ? (Object.fromEntries(DIMENSIONS.map((d) => [d, null])) as DimensionScores)
    : dimensionScores(questions, input.answers);
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
    alerts: [
      ...(held ? [`${HOLD_ALERT}공통 핵심 12문항 중 ${coreAnswered}개만 응답되어 점수를 산정하지 않았습니다. ${MIN_CORE_ANSWERS}개 이상 응답하면 영역별 점수와 기술역량을 계산합니다.`] : []),
      ...consistencyAlerts(
        questions, input.answers, Boolean(input.discovery.external), pendingDimensions,
        input.inventory.filter((t) => t.critical && t.trl > 0).map((t) => t.trl),
      ),
    ],
    insufficient: held,
    coreAnswered,
    range,
  };
}

export * from './types';
export * from './questions';
export { band, CAPABILITY_WEIGHTS } from './scoring';
export { nextTrlGate, TRL_LEVELS } from './trl';
export { EVIDENCE_FIRST_AREA } from './priority';
export { VERSIONS } from './versions';
