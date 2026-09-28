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

/** 핵심기술 1건의 다음 목표·Gate (v0.9 criticalTechRows 동일) */
export function nextTrlGate(trl: number) {
  const cur = Number(trl || 0);
  const target = cur === 0 ? '확인 필요' : cur <= 4 ? 'TRL 5~6' : cur <= 6 ? 'TRL 7' : cur === 7 ? 'TRL 8' : 'TRL 9';
  const gate =
    cur === 0 ? '현재 TRL 근거 확인'
      : cur <= 4 ? '시제품·유사환경 검증'
        : cur <= 6 ? '실제환경 실증'
          : cur === 7 ? '시스템 완성·성능 검증'
            : '실사용·양산성과 확인';
  return { target, gate };
}
