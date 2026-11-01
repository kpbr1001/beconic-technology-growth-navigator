// 점수·해석 엔진 v2.1 — 순수 함수, 같은 입력이면 같은 결과.
// 문항 1~5점, "모르겠어요"(0)는 1점으로 계산하고 따로 표시한다(투자자 관점에서 확인되지 않은 항목).
// 영역 점수 = 문항 평균 × 20, 종합 = 단계별(업종 보정) 가중 평균. 자가진단 기반이며 투자 성공을 판단·보장하지 않는다.
import { CATEGORIES, QUESTIONS, GRADES, STAGES, CMAP, QMAP, LENSES, LENS_VERDICT, EXPECT, EFFORT, N_Q, weightsFor, qByCat } from './model.js';
import { indicators, balanceCheck, fmtWon, CORE } from './fin.js';

export const SCORE_VERSION = 'SC-2.1';
export const gradeOf = (s) => GRADES.find((g) => s >= g.min) || GRADES[GRADES.length - 1];
export const verdictOf = (s) => LENS_VERDICT.find((v) => s >= v.min);
const r1 = (x) => Math.round(x * 10) / 10;
const val = (a) => (a && typeof a.v === 'number' ? (a.v === 0 ? 1 : a.v) : null); // 0 = 모르겠어요 → 1점
const TECH = ['바이오·헬스케어', '제조·하드웨어', '에너지·환경'];

export function finStatus(st) {
  const f = st.fin || {};
  const has = !!(f.confirmed && CORE.some((k) => typeof f.cur?.[k] === 'number'));
  return { has, source: has ? f.source : null, fileName: f.fileName || '' };
}

// 목표 단계: 바로 다음 단계, 단 2단계 이하는 최소 3단계(문서화·데이터 수준) — 약한 상태 문장을 목표로 내지 않기 위해
export const targetOf = (v) => Math.max((v === 0 ? 1 : v) + 1, 3);
const goalText = (q, v) => (v === 0 ? `먼저 현황을 확인하고, "${q.opts[targetOf(v) - 1]}" 수준을 목표로 해요` : q.opts[targetOf(v) - 1]);

export function evaluate(st) {
  const stage = st.meta?.stage || 'seed'; const industry = st.meta?.industry || '';
  const W = weightsFor(stage, industry); const E = EXPECT[stage] || EXPECT.seed;
  const ans = st.answers || {};
  const answered = QUESTIONS.filter((q) => val(ans[q.id]) !== null);
  const cats = {};
  for (const c of CATEGORIES) {
    const qs = qByCat(c.id); const vs = qs.map((q) => val(ans[q.id])).filter((x) => x !== null);
    const avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    const score = avg === null ? null : Math.round(avg * 20);
    cats[c.id] = { id: c.id, name: c.name, short: c.short, weight: W[c.id], n: vs.length, total: qs.length, avg: avg === null ? null : r1(avg), score,
      expect: E[c.id], gap: score === null ? null : score - E[c.id],
      unknown: qs.filter((q) => ans[q.id]?.v === 0).length, ev: qs.filter((q) => ans[q.id]?.ev).length };
  }
  const scored = CATEGORIES.filter((c) => cats[c.id].score !== null);
  const wsum = scored.reduce((a, c) => a + W[c.id], 0);
  const overall = wsum ? Math.round(scored.reduce((a, c) => a + cats[c.id].avg * 20 * W[c.id], 0) / wsum) : null;
  const fin = finStatus(st);
  const res = {
    stage, stageLabel: STAGES.find((s) => s.id === stage)?.label || '', industry, techIndustry: TECH.includes(industry), weights: W,
    answered: answered.length, total: N_Q, complete: answered.length === N_Q, unknown: QUESTIONS.filter((q) => ans[q.id]?.v === 0).map((q) => q.id),
    evidence: QUESTIONS.filter((q) => ans[q.id]?.ev).length,
    noEvidenceHigh: QUESTIONS.filter((q) => (ans[q.id]?.v || 0) >= 4 && !ans[q.id]?.ev).map((q) => q.id),
    cats, overall, grade: overall === null ? null : gradeOf(overall), fin,
    indicators: fin.has ? indicators(st.fin) : [], balance: fin.has ? balanceCheck(st.fin) : null,
  };
  res.evidenceRate = res.answered ? Math.round((res.evidence / res.answered) * 100) : 0;
  res.gaps = CATEGORIES.map((c) => cats[c.id]).filter((c) => c.gap !== null && c.gap < 0).sort((a, b) => a.gap - b.gap);
  res.lenses = lenses(st, res); res.flags = redFlags(st, res);
  res.strengths = strengths(st, res); res.weaknesses = weaknesses(st, res);
  res.analysis = catAnalysis(st, res); res.roadmap = roadmap(st, res); res.checks = crossChecks(st, res); res.summary = summary(st, res);
  return res;
}

// 한 단계 올리면 종합 점수가 오르는 폭(점): 문항 1점 = 영역 20/문항 수 점 × 가중치 비중
const gainOf = (res, q) => { const wsum = Object.values(res.weights).reduce((a, b) => a + b, 0); return r1((20 / res.cats[q.cat].total) * (res.weights[q.cat] / wsum)); };
const item = (st, res, q) => { const v = st.answers[q.id].v; const g = gainOf(res, q); return { q, v, gain: g, impact: (5 - val(st.answers[q.id])) * g, gainTo: r1((targetOf(v) - val(st.answers[q.id])) * g), action: goalText(q, v), doc: q.doc, effort: q.e }; };

/** 투자자 관점 6가지 질문 */
export function lenses(st, res) {
  const ans = st.answers || {};
  return LENSES.map((l) => {
    const vs = l.qs.map((id) => val(ans[id])).filter((x) => x !== null);
    const score = vs.length ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 20) : null;
    const weakest = l.qs.filter((id) => val(ans[id]) !== null).sort((a, b) => val(ans[a]) - val(ans[b]) || l.qs.indexOf(a) - l.qs.indexOf(b))[0];
    let note = '';
    if (res.fin.has && l.id === 'L5') { const o = res.indicators.find((x) => x.k === 'opm'); if (o && o.value !== null) note = `재무제표 영업이익률 ${o.value}%`; }
    if (res.fin.has && l.id === 'L2') { const g = res.indicators.find((x) => x.k === 'growth'); if (g) note = `재무제표 매출 성장률 ${g.value}%`; }
    if (!res.fin.has && (l.id === 'L5' || l.id === 'L6')) note = '재무제표 미반영 — 응답만으로 판단';
    return { ...l, score, verdict: score === null ? null : verdictOf(score), weakest: weakest ? QMAP[weakest] : null, note };
  });
}

/** 경계 신호 — 투자 검토에서 멈칫하게 되는 지점(관찰 사실, 원인 판단 없음) */
export function redFlags(st, res) {
  const a = st.answers || {}; const v = (id) => a[id]?.v; const out = []; const c = st.fin?.cur || {};
  const add = (id, text, qid) => out.push({ id, text, qid });
  if (v('CO1') === 1) add('no-competitor', '"경쟁자가 없다"는 답은 시장 조사가 부족하다는 신호로 읽혀요.', 'CO1');
  if (v('TM3') !== undefined && val(a.TM3) <= 2) add('cap-table', '지분·창업자 계약이 정리되지 않았어요. 실사에서 반드시 확인하는 항목이에요.', 'TM3');
  if (v('FN1') !== undefined && val(a.FN1) <= 2 && !res.fin.has) add('no-fs', '재무제표를 바로 낼 수 없어요. 투자 검토의 첫 요청 자료예요.', 'FN1');
  if (v('FN3') !== undefined && val(a.FN3) <= 2) add('cash-unknown', '현금과 월 지출을 모르면 투자 시점과 금액을 설명하기 어려워요.', 'FN3');
  if (v('IR2') !== undefined && val(a.IR2) <= 2) add('numbers', '자료마다 숫자가 다를 수 있어요. 숫자 불일치는 신뢰를 크게 떨어뜨려요.', 'IR2');
  if (res.stage !== 'pre' && v('PC2') !== undefined && val(a.PC2) <= 1) add('no-customer', '아직 타깃 고객을 직접 만나지 않았어요.', 'PC2');
  if (res.techIndustry && v('TC3') !== undefined && val(a.TC3) <= 2) add('tech-outsourced', '기술 집약 업종인데 핵심 기술을 외부에 의존해요.', 'TC3');
  if (res.fin.has) {
    if (typeof c.equity === 'number' && c.equity <= 0) add('impair-full', '재무제표상 완전 자본잠식 상태예요(자본총계 0 이하).', null);
    else if (typeof c.equity === 'number' && typeof c.capital === 'number' && c.capital > 0 && c.equity < c.capital) add('impair-part', '재무제표상 부분 자본잠식 상태예요(자본총계 < 자본금).', null);
    const g = res.indicators.find((x) => x.k === 'growth'); if (g && g.value < 0) add('rev-down', `재무제표상 매출이 전기 대비 ${Math.abs(g.value)}% 줄었어요.`, null);
    const b = res.indicators.find((x) => x.k === 'burn'); if (b && b.value !== null && b.value < 6) add('cash-short', `직전 연도 영업손실 기준으로 현금이 약 ${b.value}개월분이에요(참고 계산).`, null);
  }
  if (res.unknown.length >= 5) add('unknown', `"잘 모르겠어요"가 ${res.unknown.length}개예요. 투자자 질문에 답하기 어려운 부분이 많아요.`, null);
  if (res.noEvidenceHigh.length >= 8) add('no-evidence', `근거 자료 없이 4~5점으로 답한 문항이 ${res.noEvidenceHigh.length}개예요. 실사에서 자료로 확인돼야 해요.`, null);
  return out;
}

export function strengths(st, res) {
  const ans = st.answers || {};
  return QUESTIONS.filter((q) => (ans[q.id]?.v || 0) >= 4)
    .sort((a, b) => ans[b.id].v - ans[a.id].v || res.weights[b.cat] - res.weights[a.cat] || QUESTIONS.indexOf(a) - QUESTIONS.indexOf(b))
    .slice(0, 3).map((q) => ({ q, v: ans[q.id].v, text: q.opts[ans[q.id].v - 1], ev: !!ans[q.id].ev }));
}
export function weaknesses(st, res) {
  const ans = st.answers || {};
  return QUESTIONS.filter((q) => val(ans[q.id]) !== null && val(ans[q.id]) <= 3).map((q) => item(st, res, q))
    .sort((a, b) => b.impact - a.impact || val(ans[a.q.id]) - val(ans[b.q.id]) || QUESTIONS.indexOf(a.q) - QUESTIONS.indexOf(b.q))
    .slice(0, 3).map((x) => ({ ...x, now: x.v === 0 ? '잘 모르겠어요' : x.q.opts[x.v - 1], next: x.action }));
}

/** 영역별 상세 진단 */
export function catAnalysis(st, res) {
  const ans = st.answers || {};
  return CATEGORIES.map((c) => {
    const cc = res.cats[c.id]; const qs = qByCat(c.id).filter((q) => val(ans[q.id]) !== null);
    const sorted = [...qs].sort((a, b) => val(ans[b.id]) - val(ans[a.id]) || qByCat(c.id).indexOf(a) - qByCat(c.id).indexOf(b));
    const best = sorted[0]; const worst = sorted[sorted.length - 1];
    const status = cc.score === null ? '미응답' : cc.gap >= 0 ? '단계 기대 충족' : `단계 기대보다 ${-cc.gap}점 낮음`;
    let diag = '';
    if (cc.score !== null) {
      diag = best && val(ans[best.id]) >= 4 ? `강점은 ${best.title}(${ans[best.id].v}점)이에요. ` : '';
      diag += worst && val(ans[worst.id]) <= 3 ? `가장 먼저 보완할 문항은 ${worst.title}(${ans[worst.id].v === 0 ? '모르겠어요' : `${ans[worst.id].v}점`})이에요.` : '모든 문항이 4점 이상이에요.';
    }
    const actions = qs.filter((q) => val(ans[q.id]) <= 3).map((q) => item(st, res, q)).sort((a, b) => b.impact - a.impact);
    return { c, ...cc, status, diag, actions, docs: actions.map((x) => x.doc) };
  });
}

/** 실행 로드맵 — 영향 큰 순으로 정렬한 뒤 난이도(S·M·L)에 따라 2주·30일·90일에 배치. 위험도 순위가 아님 */
export function roadmap(st, res) {
  const ans = st.answers || {};
  const items = QUESTIONS.filter((q) => val(ans[q.id]) !== null && val(ans[q.id]) <= 3).map((q) => item(st, res, q))
    .sort((a, b) => b.impact - a.impact || QUESTIONS.indexOf(a.q) - QUESTIONS.indexOf(b.q));
  const extra = [];
  if (!res.fin.has) extra.push({ q: null, special: 'fin', action: '홈택스에서 표준재무제표증명을 발급해 업로드하세요(재무 지표·교차 확인이 열려요)', doc: '최근 2개년 표준재무제표증명', effort: 'S' });
  if (res.unknown.length) extra.push({ q: null, special: 'unknown', action: `"잘 모르겠어요"로 답한 ${res.unknown.length}문항(${res.unknown.join(', ')})의 현황부터 확인하세요`, doc: '문항별 현황 메모', effort: 'S' });
  const cap = { now: 4, d30: 4, d90: 5 }; const out = { now: [...extra], d30: [], d90: [] };
  const order = ['now', 'd30', 'd90']; const pref = { S: 0, M: 1, L: 2 };
  for (const it of items) {
    for (let k = pref[it.effort] ?? 1; k < 3; k++) { const b = order[k]; if (out[b].length < cap[b] + (b === 'now' ? extra.length : 0)) { out[b].push(it); break; } }
  }
  return out;
}

/** 응답 ↔ 재무제표 교차 확인(관찰 사실만) */
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
  const L = res.lenses.filter((l) => l.score !== null).sort((a, b) => b.score - a.score);
  const lines = [`종합 IR 준비도 ${res.overall}점(${res.grade.g}등급) — ${res.grade.label}. ${res.stageLabel} 단계${res.industry && weightsFor(res.stage, res.industry).TC !== weightsFor(res.stage, '').TC ? `·${res.industry} 업종 보정` : ''} 기준이에요.`];
  if (L.length) lines.push(`투자자 관점에서 가장 설득력 있는 부분은 ${L[0].name}(${L[0].score}), 가장 약한 부분은 ${L[L.length - 1].name}(${L[L.length - 1].score})이에요.`);
  lines.push(res.gaps.length ? `${res.stageLabel} 단계 기대 수준에 못 미치는 영역이 ${res.gaps.length}개예요: ${res.gaps.slice(0, 3).map((c) => `${c.name}(${c.gap})`).join(', ')}${res.gaps.length > 3 ? ' 외' : ''}.` : `모든 영역이 ${res.stageLabel} 단계 기대 수준을 넘었어요.`);
  if (res.fin.has) {
    const g = (k) => res.indicators.find((x) => x.k === k);
    const parts = [`당기 매출 ${fmtWon(st.fin.cur.rev, true)}`];
    if (g('growth')) parts.push(`매출 성장률 ${g('growth').value}%`);
    if (g('opm')) parts.push(`영업이익률 ${g('opm').value}%`);
    if (g('debt')) parts.push(g('debt').value === null ? '자본잠식' : `부채비율 ${g('debt').value}%`);
    lines.push(`재무(표준재무제표 반영): ${parts.join(', ')}.`);
  } else lines.push('재무제표 미반영 — 재무·자금 점수는 대표 응답만으로 계산했어요. 투자자는 표준재무제표를 가장 먼저 요청해요.');
  if (res.flags.length) lines.push(`투자자가 멈칫할 수 있는 경계 신호 ${res.flags.length}개가 있어요. 아래에서 먼저 확인하세요.`);
  if (!res.complete) lines.push(`${N_Q}문항 중 ${res.answered}문항만 답했어요. 남은 문항을 답하면 결과가 정확해져요.`);
  return lines;
}
export { CMAP, EFFORT };
