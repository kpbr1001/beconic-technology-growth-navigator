// 준비항목·증빙 상태 집계 — 법정 요건 판정(engine.js)과 분리된 '사내 진단 편의용' 체크리스트.
// 자가응답은 '자가신고(있음)'까지만 올라간다. 전문가 검증·파일 확인 상태는 MVP에서 도달 불가.
import { evalExpr } from './conditions.js';

export const EVIDENCE = Object.freeze({
  NOT_REQUESTED: 'NOT_REQUESTED',
  SELF_DECLARED_AVAILABLE: 'SELF_DECLARED_AVAILABLE',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  UNKNOWN: 'UNKNOWN',
  FILE_PROVIDED_LOCAL: 'FILE_PROVIDED_LOCAL', // P1(로컬 파일 확인) 전까지 도달 불가
  EXPERT_VERIFIED: 'EXPERT_VERIFIED',         // 실제 검수 절차가 생기기 전까지 도달 불가
});

// 사용자 응답(have/none/unknown)을 증빙 상태로 변환. 다른 값은 모두 UNKNOWN.
export function evidenceFromUser(v) {
  if (v === 'have') return EVIDENCE.SELF_DECLARED_AVAILABLE;
  if (v === 'none') return EVIDENCE.NOT_AVAILABLE;
  return EVIDENCE.UNKNOWN;
}

// 도달 불가 상태로의 승격을 막는다(테스트 대상).
export function assertReachable(status) {
  if (status === EVIDENCE.EXPERT_VERIFIED || status === EVIDENCE.FILE_PROVIDED_LOCAL) {
    throw new Error(`MVP에서 사용할 수 없는 증빙 상태: ${status}`);
  }
  return status;
}

export const EVIDENCE_LABEL = {
  SELF_DECLARED_AVAILABLE: '있음(자가응답)',
  NOT_AVAILABLE: '없음',
  UNKNOWN: '확인 필요',
  NOT_REQUESTED: '해당 없음',
};

export function computeReadiness(items, answers, docStatus = {}, ctx = {}) {
  const rows = items.map((it) => {
    const applicable = evalExpr(it.applies_when || 'always', answers, ctx);
    const status = applicable ? assertReachable(evidenceFromUser(docStatus[it.item_id])) : EVIDENCE.NOT_REQUESTED;
    return { ...it, applicable, status };
  });
  const app = rows.filter((r) => r.applicable);
  const c = (arr, st) => arr.filter((r) => r.status === st).length;
  const req = app.filter((r) => r.required);
  return {
    rows,
    total: app.length,
    done: c(app, EVIDENCE.SELF_DECLARED_AVAILABLE),
    missing: c(app, EVIDENCE.NOT_AVAILABLE),
    unknown: c(app, EVIDENCE.UNKNOWN),
    required: { total: req.length, done: c(req, EVIDENCE.SELF_DECLARED_AVAILABLE), missing: c(req, EVIDENCE.NOT_AVAILABLE), unknown: c(req, EVIDENCE.UNKNOWN) },
    // 비율은 내부 참고용 범위로만: 확인 필요 항목을 모두 '없음'으로 볼 때 ~ 모두 '있음'으로 볼 때
    range: app.length ? { min: c(app, EVIDENCE.SELF_DECLARED_AVAILABLE) / app.length, max: (c(app, EVIDENCE.SELF_DECLARED_AVAILABLE) + c(app, EVIDENCE.UNKNOWN)) / app.length } : null,
  };
}

export function readinessSentence(r) {
  if (!r || r.total === 0) return '확인할 준비항목이 없어요.';
  return `준비항목 ${r.total}개 중 ${r.done}개 있음 · ${r.unknown}개 확인 필요 · ${r.missing}개 없음`;
}
