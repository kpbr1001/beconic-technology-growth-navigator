// 차원 점수·종합 역량점수. 기업규모·업력은 입력으로 받지 않는다(금지사항 5).
import { DIMENSIONS, isUnknown } from './questions';
import type { Answer, Dimension, DimensionScores, Question } from './types';

/** 종합 역량 가중치 (v0.9 동일, 합 1.00) */
export const CAPABILITY_WEIGHTS: [Dimension, number][] = [
  ['tech', 0.3], ['rd', 0.18], ['exec', 0.17], ['scale', 0.13], ['strategy', 0.1], ['evidence', 0.06], ['risk', 0.06],
];

/** 1~5 응답 → 0~100 */
export const answerToScore = (v: number) => ((v - 1) / 4) * 100;

function weightedAverage(items: { v: number; w: number }[]): number | null {
  if (!items.length) return null; // v0.9는 50을 반환 → 판단 보류로 변경(D2)
  return items.reduce((s, x) => s + x.v * x.w, 0) / items.reduce((s, x) => s + x.w, 0);
}

export function dimensionScores(questions: Question[], answers: Record<string, Answer>): DimensionScores {
  const bucket = Object.fromEntries(DIMENSIONS.map((d) => [d, [] as { v: number; w: number }[]])) as Record<
    Dimension,
    { v: number; w: number }[]
  >;
  for (const q of questions) {
    const v = answers[q.id];
    if (isUnknown(v)) continue; // 모름은 0점이 아니라 결측
    bucket[q.cat].push({ v: answerToScore(v), w: q.w });
  }
  return Object.fromEntries(DIMENSIONS.map((d) => [d, weightedAverage(bucket[d])])) as DimensionScores;
}

/**
 * 응답이 있는 차원끼리 가중치를 재정규화한다. 모든 차원이 있으면 v0.9와 동일한 계산.
 * 모든 차원이 판단 보류면 null.
 */
export function capabilityScore(m: DimensionScores): number | null {
  let raw = 0;
  let wsum = 0;
  let missing = 0;
  for (const [d, w] of CAPABILITY_WEIGHTS) {
    const v = m[d];
    if (v === null) { missing++; continue; }
    raw += v * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  return missing ? raw / wsum : raw;
}

/** 점수 구간 경계(강점·양호·보완 필요) — 화면 색·문구도 이 값을 쓴다 */
export const BAND_CUT = { strong: 80, good: 65, weak: 45 } as const;
export function band(v: number | null): string {
  if (v === null) return '판단 보류';
  return v >= BAND_CUT.strong ? '강점' : v >= BAND_CUT.good ? '양호' : v >= BAND_CUT.weak ? '보완 필요' : '우선 개선';
}
