// 점수·해석 엔진 v2 — 순수 함수, 같은 입력이면 같은 결과.
// 문항 1~5점, "모르겠어요"(0)는 1점으로 계산하고 따로 표시한다(투자자 관점에서 확인되지 않은 항목).
// 카테고리 점수 = 문항 평균 × 20 (100점), 종합 = 단계별 가중 평균. 자가진단 기반이며 투자 성공을 예측하지 않는다.
import { CATEGORIES, QUESTIONS, WEIGHTS, GRADES, STAGES, CMAP, qByCat } from './model.js';
import { indicators, balanceCheck, fmtWon, CORE } from './fin.js';

export const SCORE_VERSION = 'SC-2.0';
export const gradeOf = (s) => GRADES.find((g) => s >= g.min) || GRADES[GRADES.length - 1];
const r1 = (x) => Math.round(x * 10) / 10;
const val = (a) => (a && typeof a.v === 'number' ? (a.v === 0 ? 1 : a.v) : null); // 0 = 모르겠어요 → 1점

export function finStatus(st) {
  const f = st.fin || {};
  const has = f.confirmed && CORE.some((k) => typeof f.cur?.[k] === 'number');
  return { has, source: has ? f.source : null, fileName: f.fileName || '' };
}

export function evaluate(st) {
  const stage = st.meta?.stage || 'seed'; const W = WEIGHTS[stage] || WEIGHTS.seed;
  const ans = st.answers || {};
  const answered = QUESTIONS.filter((q) => val(ans[q.id]) !== null);
  const unknown = QUESTIONS.filter((q) => ans[q.id]?.v === 0);
  const cats = {};
  for (const c of CATEGORIES) {
    const qs = qByCat(c.id); const vs = qs.map((q) => val(ans[q.id])).filter((x) => x !== null);
    const avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    cats[c.id] = { id: c.id, name: c.name, weight: W[c.id], n: vs.length, total: qs.length, avg: avg === null ? null : r1(avg), score: avg === null ? null : Math.round(avg * 20),
      unknown: qs.filter((q) => ans[q.id]?.v === 0).length, ev: qs.filter((q) => ans[q.id]?.ev).length };
  }
  const scored = CATEGORIES.filter((c) => cats[c.id].score !== null);
  const wsum = scored.reduce((a, c) => a + W[c.id], 0);
  const overall = wsum ? Math.round(scored.reduce((a, c) => a + cats[c.id].avg * 20 * W[c.id], 0) / wsum) : null;
  const fin = finStatus(st);
  const ind = fin.has ? indicators(st.fin) : [];
  const res = {
    stage, stageLabel: STAGES.find((s) => s.id === stage)?.label || '', weights: W,
    answered: answered.length, total: QUESTIONS.length, complete: answered.length === QUESTIONS.length, unknown: unknown.map((q) => q.id),
    evidence: QUESTIONS.filter((q) => ans[q.id]?.ev).length,
    noEvidenceHigh: QUESTIONS.filter((q) => (ans[q.id]?.v || 0) >= 4 && !ans[q.id]?.ev).map((q) => q.id),
    cats, overall, grade: overall === null ? null : gradeOf(overall), fin, indicators: ind, balance: fin.has ? balanceCheck(st.fin) : null,
  };
  res.evidenceRate = res.answered ? Math.round((res.evidence / res.answered) * 100) : 0;
  res.strengths = strengths(st, res); res.weaknesses = weaknesses(st, res);
  res.roadmap = roadmap(st, res); res.checks = crossChecks(st, res); res.summary = summary(st, res);
  return res;
}

// 목표 단계: 바로 다음 단계, 단 2단계 이하는 최소 3단계(문서화·데이터 수준) — "흩어져 있어요" 같은 약한 상태를 목표로 내지 않기 위해
export const targetOf = (v) => Math.max((v === 0 ? 1 : v) + 1, 3);
const goalText = (q, v) => (v === 0 ? `먼저 현황을 확인하고, "${q.opts[targetOf(v) - 1]}" 수준을 목표로 해요` : q.opts[targetOf(v) - 1]);
// 한 단계 올리면 종합 점수가 오르는 폭(점): 문항 1점 = 카테고리 20/문항수 점 × 가중치 비중
const gainOf = (res, q) => { const c = res.cats[q.cat]; const wsum = Object.values(res.weights).reduce((a, b) => a + b, 0); return r1((20 / c.total) * (res.weights[q.cat] / wsum)); };

export function strengths(st, res) {
  const ans = st.answers || {};
  return QUESTIONS.filter((q) => (ans[q.id]?.v || 0) >= 4)
    .sort((a, b) => ans[b.id].v - ans[a.id].v || res.weights[b.cat] - res.weights[a.cat] || QUESTIONS.indexOf(a) - QUESTIONS.indexOf(b))
    .slice(0, 3).map((q) => ({ q, v: ans[q.id].v, text: q.opts[ans[q.id].v - 1], ev: !!ans[q.id].ev }));
}
export function weaknesses(st, res) {
  const ans = st.answers || {};
  return QUESTIONS.filter((q) => val(ans[q.id]) !== null && val(ans[q.id]) <= 3)
    .map((q) => ({ q, v: ans[q.id].v, impact: (5 - val(ans[q.id])) * gainOf(res, q), gain: gainOf(res, q) }))
    .sort((a, b) => b.impact - a.impact || val(st.answers[a.q.id]) - val(st.answers[b.q.id]) || QUESTIONS.indexOf(a.q) - QUESTIONS.indexOf(b.q))
    .slice(0, 3).map((x) => ({ ...x, now: x.v === 0 ? '잘 모르겠어요' : x.q.opts[x.v - 1], next: goalText(x.q, x.v), gainTo: r1((targetOf(x.v) - val(st.answers[x.q.id])) * x.gain) }));
}

/** 실행 로드맵 — 점수를 올릴 여지가 큰 순(종합 점수 영향 = 남은 단계 × 단계당 상승폭). 위험도 순위가 아님 */
export function roadmap(st, res) {
  const ans = st.answers || {};
  const items = QUESTIONS.filter((q) => val(ans[q.id]) !== null && val(ans[q.id]) <= 3)
    .map((q) => ({ q, v: ans[q.id].v, impact: (5 - val(ans[q.id])) * gainOf(res, q), gain: gainOf(res, q), gainTo: r1((targetOf(ans[q.id].v) - val(ans[q.id])) * gainOf(res, q)), action: goalText(q, ans[q.id].v) }))
    .sort((a, b) => b.impact - a.impact || QUESTIONS.indexOf(a.q) - QUESTIONS.indexOf(b.q));
  const extra = [];
  if (!res.fin.has) extra.push({ q: null, special: 'fin', action: '홈택스에서 표준재무제표증명을 발급해 업로드하세요(재무 지표·교차 확인이 열려요)', gain: null });
  if (res.unknown.length) extra.push({ q: null, special: 'unknown', action: `"모르겠어요"로 답한 ${res.unknown.length}문항(${res.unknown.join(', ')})의 현황부터 확인하세요`, gain: null });
  const all = [...extra, ...items];
  return { now: all.slice(0, 3), d30: all.slice(3, 6), d90: all.slice(6, 10) };
}

/** 응답 ↔ 재무제표 교차 확인(관찰 사실만, 원인 판단 없음) */
export function crossChecks(st, res) {
  const out = []; const ans = st.answers || {}; const c = st.fin?.cur || {};
  if (!res.fin.has) {
    if ((ans.FN1?.v || 0) >= 3) out.push({ type: 'info', qid: 'FN1', text: '재무제표를 갖고 있다고 답했어요. 업로드하면 재무 지표와 응답 교차 확인이 반영돼요.' });
    return out;
  }
  if ((ans.BM2?.v || 0) >= 3 && c.rev === 0) out.push({ type: 'warn', qid: 'BM2', text: '매출이 있다고 답했지만 재무제표 당기 매출은 0원이에요. 기간이나 응답을 확인해 주세요.' });
  if (ans.BM2 && val(ans.BM2) <= 2 && c.rev > 0) out.push({ type: 'warn', qid: 'BM2', text: `재무제표에 당기 매출 ${fmtWon(c.rev, true)}이 있어요. 매출·고객 실적 응답을 다시 확인해 주세요.` });
  if ((ans.FN3?.v || 0) >= 4 && typeof c.equity === 'number' && c.equity <= 0) out.push({ type: 'warn', qid: 'FN3', text: '현금 관리가 잘 되고 있다고 답했지만 재무제표는 완전 자본잠식 상태예요. 투자자가 반드시 묻는 부분이에요.' });
  if (ans.FN1 && val(ans.FN1) <= 2) out.push({ type: 'info', qid: 'FN1', text: '재무제표를 업로드했어요. "재무자료 정비" 응답을 3점 이상으로 다시 확인해 보세요.' });
  if (res.balance && !res.balance.ok) out.push({ type: 'warn', qid: null, text: `자산총계와 부채+자본 합계가 ${fmtWon(Math.abs(res.balance.diff))} 달라요. 추출값을 확인해 주세요.` });
  return out;
}

export function summary(st, res) {
  if (res.overall === null) return ['아직 응답이 없어요.'];
  const sorted = CATEGORIES.map((c) => res.cats[c.id]).filter((c) => c.score !== null).sort((a, b) => b.score - a.score || b.weight - a.weight);
  const top = sorted.slice(0, 2).map((c) => `${c.name}(${c.score})`).join('·');
  const low = sorted.slice(-2).reverse().map((c) => `${c.name}(${c.score})`).join('·');
  const lines = [`종합 IR 준비도 ${res.overall}점(${res.grade.g}등급) — ${res.grade.label}. ${res.stageLabel} 단계 가중치 기준이에요.`,
    `강점은 ${top}, 보완이 가장 필요한 영역은 ${low}이에요.`];
  if (res.fin.has) {
    const g = (k) => res.indicators.find((x) => x.k === k);
    const parts = [`당기 매출 ${fmtWon(st.fin.cur.rev, true)}`];
    if (g('growth')) parts.push(`매출 성장률 ${g('growth').value}%`);
    if (g('opm')) parts.push(`영업이익률 ${g('opm').value}%`);
    if (g('debt')) parts.push(g('debt').value === null ? '자본잠식' : `부채비율 ${g('debt').value}%`);
    lines.push(`재무(표준재무제표 반영): ${parts.join(', ')}.`);
  } else lines.push('재무제표 미반영 — 재무·자금 점수는 대표 응답만으로 계산했어요. 투자자는 표준재무제표를 가장 먼저 요청해요.');
  if (!res.complete) lines.push(`32문항 중 ${res.answered}문항만 답했어요. 남은 문항을 답하면 결과가 정확해져요.`);
  return lines;
}
export { CMAP };
