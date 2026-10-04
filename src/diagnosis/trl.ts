// 핵심기술별 TRL. 기업 전체 TRL이나 평균 TRL을 만들지 않는다(D3).
import type { TechItem, TrlSummary } from './types';

export function trlSummary(inventory: TechItem[]): TrlSummary {
  const crit = inventory.filter((x) => x.critical);
  const items = crit.map((t) => ({ id: t.id, name: t.name, trl: Number(t.trl) > 0 ? Number(t.trl) : null }));
  const known = items.map((x) => x.trl).filter((x): x is number => x !== null);
  const min = known.length ? Math.min(...known) : null;
  const max = known.length ? Math.max(...known) : null;
  return {
    items,
    confirmedCount: known.length,
    unknownCount: items.length - known.length,
    min,
    max,
    distribution: min === null ? '확인필요' : min === max ? `${min}` : `${min}~${max}`,
  };
}

/** TRL 1~9 단계 이름(선택 목록·보고서 공용). 값 0은 '확인 필요' */
export const TRL_LEVELS: Record<number, string> = {
  1: '기초 원리 발견', 2: '기술 개념 정립', 3: '개념 실험 검증', 4: '실험실 시제품 검증', 5: '유사환경 부품 검증',
  6: '유사환경 시스템 시연', 7: '실제환경 시제품 실증', 8: '시스템 완성·인증', 9: '실사용·양산',
};

/** 다음 단계로 올라가기 위해 통과할 검증(현재 TRL 기준) */
const NEXT_GATE: Record<number, string> = {
  0: '현재 TRL 근거 확인', 1: '기술 개념·적용 분야 정리', 2: '핵심 원리 실험 검증', 3: '실험실 시제품 검증',
  4: '유사환경 부품 검증', 5: '유사환경 시스템 시연', 6: '실제환경 실증', 7: '시스템 완성·성능 검증', 8: '실사용·양산성과 확인',
  9: '실사용 성과 유지·개선',
};

/** 핵심기술 1건의 다음 목표·검증 관문. v0.9.15부터 TRL 1~9 단계별(이전엔 1~4·5~6 구간 묶음) */
export function nextTrlGate(trl: number) {
  const cur = Math.max(0, Math.min(9, Math.round(Number(trl || 0))));
  const target = cur === 0 ? '확인 필요' : cur === 9 ? 'TRL 9 유지' : `TRL ${cur + 1}`;
  return { target, gate: NEXT_GATE[cur] };
}
