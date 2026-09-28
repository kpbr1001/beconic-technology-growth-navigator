// Gap 우선순위(P0/P1/P2). 점수가 있는 영역만 대상으로 한다.
import { AREA_NAME, DIMENSIONS } from './questions';
import type { DimensionScores, Gap } from './types';

/** 응답 근거가 없어 점수 대신 '근거확보'를 최우선 과제로 두는 가상 영역 */
export const EVIDENCE_FIRST_AREA = '근거확보';

/** 리스크 차원이 판단 보류일 때 우선순위 계산에만 쓰는 중립값(화면 표시 점수 아님) */
const NEUTRAL_RISK = 50;

export function priorityGaps(m: DimensionScores, confidence: number): Gap[] {
  const scored = DIMENSIONS.filter((d) => m[d] !== null).map((d) => [AREA_NAME[d], m[d] as number] as const);
  if (!scored.length) return [{ area: EVIDENCE_FIRST_AREA, score: null, ps: null, priority: 'P0' }];
  const risk = m.risk ?? NEUTRAL_RISK;
  return [...scored]
    .sort((a, c) => a[1] - c[1])
    .slice(0, 5)
    .map(([area, score]) => {
      // Gap 55% + 리스크 20% + 불확실성 15% + 전략정렬 가산 10 (v0.9 동일, 가산 근거는 전문가 검증 대상)
      const ps = Math.round((100 - score) * 0.55 + (100 - risk) * 0.2 + (100 - confidence) * 0.15 + (area === '전략정렬' ? 10 : 0));
      return { area, score: Math.round(score), ps, priority: ps >= 60 ? 'P0' : ps >= 42 ? 'P1' : 'P2' };
    });
}
