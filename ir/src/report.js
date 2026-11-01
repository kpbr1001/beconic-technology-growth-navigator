// 보고서(ReportSnapshot → HTML → 브라우저 인쇄 PDF) — 09_글로벌투자자_PDF_보고서명세 v2 기준.
// 승인 스냅샷에 고정된 입력·결과만 사용한다(화면 값을 다시 해석하지 않음). 승인 전에는 '초안' 워터마크가 붙는다.
// 금지: 점수·등급·확률·순위·전망·원인 단정. 자유 입력 문장은 번역하지 않고 원문 그대로 둔다.
// v1.1 레이아웃: 요약본 1쪽 목표(상태 카드·실적표·자본/조달 2단), 상세본은 표지 분리·중첩 표 전폭·일치 결과 압축표.
import { QUESTIONS, QMAP, SECTIONS, SOURCES, RULES, Q_ORDER, questionMeta, REGISTRY_VERSION, SOURCES_CHECKED_AT } from './registry.js';
import { DATA_LABEL, REVIEW_LABEL, RESULT_LABEL, ENGINE_VERSION, parseAmount, parseCount, fmtUnit, evaluate } from './engine.js';
import { guideFor, QUESTION_GUIDE, nextActions, sectionSummary, GUIDE_VERSION, GUIDE_NOTE } from './guide.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 용어집(glossary) — 영문판 고정 용어. 문장형 결과는 한국어 원문을 유지한다.
export const GLOSSARY = [
  ['미제출', 'Not submitted', '답변·자료가 없는 상태'],
  ['제출됨(자가진술)', 'Submitted (self-reported)', '회사가 입력했으나 원문 자료가 연결되지 않은 상태'],
  ['원문 연결 확인', 'Source document linked', '자료와 문서 내 위치가 기록된 상태. 진위 확인이 아님'],
  ['자료 간 일치', 'Consistent across documents', '비교한 자료·기간·정의 범위 안에서 숫자가 같음'],
  ['자료 간 불일치', 'Inconsistent across documents', '비교한 자료 사이에 차이가 있음. 원인은 판단하지 않음'],
  ['적용 제외 승인', 'Not applicable (approved)', '사유와 검토자 승인이 기록됨'],
  ['적용 제외 승인 대기', 'Not applicable (pending approval)', '사유는 있으나 검토자 승인이 없음'],
  ['미검토', 'Not reviewed', '검토자가 아직 보지 않음'],
  ['확인 요청', 'Information requested', '검토자가 회사에 확인을 요청함'],
  ['작성자 확인', 'Confirmed by preparer', '회사가 요청에 답함'],
  ['검토자 검토', 'Reviewed by consultant', '표시된 범위 안에서 컨설턴트가 검토함. 외부 감사·인증이 아님'],
  ['대표 승인', 'Approved by CEO', '대표가 보고서 고정을 승인함. 자료 진실성의 외부 인증이 아님'],
  ['경영진 제출 계획', 'Management-submitted plan', '실적이 아닌 회사 제출 계획. 달성 가능성은 판단하지 않음'],
  ['스냅샷 해시', 'Snapshot hash (SHA-256)', '승인 시점 입력의 지문. 원본과의 일치 확인용이며 외부 진실성 인증이 아님'],
];
const EN = Object.fromEntries(GLOSSARY.map(([k, e]) => [k, e]));
const T = {
  ko: { brief: '투자자 요약본', detail: '근거 검토 상세본', sub: 'Evidence Review Report', draft: '승인 전 초안 — 대외 배포용 아님', synthetic: '합성 예시 — 실제 기업 자료 아님',
    disclaimer: '이 보고서는 제출 자료의 존재·범위·자료 간 일치 여부를 확인한 결과입니다. 투자 권유, 회계감사, 법률·지식재산 의견, 사업 전망이 아닙니다.' },
  en: { brief: 'Investor Brief', detail: 'Evidence Review Report', sub: '근거 검토 상세본', draft: 'DRAFT — not approved, not for external distribution', synthetic: 'SYNTHETIC EXAMPLE — not real company data',
    disclaimer: 'This report records the existence, scope and cross-document consistency of submitted materials. It is not an investment recommendation, audit opinion, legal/IP opinion or business forecast. Free-text answers and finding sentences are reproduced in the original Korean; no translation has been performed.' },
};
const L = (lang, ko) => (lang === 'en' ? EN[ko] || ko : ko);
const H = {
  ko: ['표지·문서 관리', '요약', '검토 범위와 방법', '회사·고객·제품', '시장·영업 실적', '기술·지식재산', '팀·지배구조', '과거 재무·현금', '경영진 제출 조달 요청', '확인 사항과 자료 요청', '검토·승인 기록', '부록'],
  en: ['Cover & Document Control', 'Executive Summary', 'Scope & Method', 'Company, Customer & Product', 'Market & Commercial Evidence', 'Technology & IP', 'Team & Governance', 'Historical Financials & Cash', 'Management-Submitted Funding Request', 'Findings & Information Requests', 'Review & Approval Record', 'Appendix'],
};
const ORD = Object.fromEntries(Q_ORDER.map((q, i) => [q.id, i]));
const byOrder = (a, b) => ORD[a] - ORD[b];

/** 스냅샷(또는 초안) 입력 → 보고서 모델 */
export function reportModel(snap, opts = {}) {
  const st = snap.state; const lang = opts.lang || 'ko'; const mask = !!opts.mask;
  const masker = (() => { const m = new Map(); return (name) => { if (!mask || !name) return name; if (!m.has(name)) m.set(name, `주주 ${String.fromCharCode(65 + m.size)}`); return m.get(name); }; })();
  const todo = snap.todo || evaluate(st).todo; // v1.1 이전 스냅샷 호환: 같은 고정 입력으로 다시 계산
  const ev = { findings: snap.findings, byQ: snap.byQ, todo };
  return { st, lang, mask, masker, snap, findings: snap.findings, byQ: snap.byQ, ev, t: T[lang], h: H[lang] };
}
export const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.toISOString().slice(0, 16).replace('T', ' ')} KST`; };

// ───────────────────────── 공통 조각
const ansOf = (m, qid) => m.st.answers[qid] || {};
const active = (m, qid) => (ansOf(m, qid).status || 'answer') === 'answer';
const evOf = (st, eid) => st.evidence.find((e) => e.id === eid);
const idLink = (id, href = `#${id}`) => `<a class="r-id" href="${esc(href)}">${esc(id)}</a>`;
const chip = (cls, txt) => `<span class="r-chip ${cls}">${esc(txt)}</span>`;
const dataChip = (m, s) => chip(`d-${s}`, L(m.lang, DATA_LABEL[s]));
const revChip = (m, s) => chip(`v-${s}`, L(m.lang, REVIEW_LABEL[s]));
const resChip = (r) => chip(`f-${r}`, RESULT_LABEL[r]);
const fRefs = (m, qid) => m.findings.filter((f) => f.refs.includes(qid)).map((f) => idLink(f.id)).join(' ') || '';
const maskPerson = (m, v, fallback = '미지정') => (m.mask ? '담당자' : v || fallback);

function linksHtml(st, a) {
  const ls = (a.links || []).filter((l) => evOf(st, l.eid));
  if (!ls.length) return '<span class="r-muted">연결 자료 없음</span>';
  return ls.map((l) => { const e = evOf(st, l.eid); return `<div class="r-ln">${idLink(e.id, `#ev-${e.id}`)} ${esc(e.name)} <span class="r-muted">v${e.version}</span> · ${l.loc ? esc(l.loc) : '<i class="r-warn">위치 미기록</i>'}</div>`; }).join('');
}
function answerHtml(m, q) {
  const a = ansOf(m, q.id); const s = a.status || 'answer';
  if (s === 'na') return `<i>적용 제외 요청</i> — ${esc(a.naReason || '사유 미입력')}${a.naApproved ? ` <span class="r-muted">(승인: ${esc(a.naApprovedBy || '')})</span>` : ' <span class="r-warn">(승인 대기)</span>'}`;
  if (s === 'request') return `<i>담당자 자료 요청 중</i> — ${esc(maskPerson(m, a.reqTo))}${a.reqDue ? ` · 기한 ${esc(a.reqDue)}` : ''}`;
  if (s === 'unknown') return '<i class="r-muted">회사 답변: 아직 모름</i>';
  const parts = [];
  if ((a.text || '').trim()) parts.push(`<div>${esc(a.text).replace(/\n/g, '<br>')}</div>`);
  const kv = (q.fields || []).filter((f) => f.type !== 'rows').map((f) => [f, (a.fields || {})[f.k]]).filter(([, v]) => v !== undefined && v !== '' && v !== false);
  if (kv.length) parts.push(`<div class="r-kvs">${kv.map(([f, v]) => `<span><em>${esc(f.label.replace(/\s*\(.*\)$/, ''))}</em> ${esc(v === true ? '예' : v)}</span>`).join('')}</div>`);
  return parts.join('') || '<span class="r-muted">—</span>';
}
function rowsTable(m, q) {
  const a = ansOf(m, q.id); const f = (q.fields || []).find((x) => x.type === 'rows');
  if (!f || !active(m, q.id)) return '';
  const rows = ((a.fields || {})[f.k] || []).filter((r) => Object.values(r).some((x) => String(x ?? '').trim()));
  if (!rows.length) return '';
  const cols = f.cols.filter((c) => !['src', 'srcPeriod'].includes(c.k) || rows.some((r) => r[c.k]));
  const numeric = (c) => ['money', 'count', 'num'].includes(c.type);
  return `<table class="r-tbl r-inner"><thead><tr>${cols.map((c) => `<th class="${numeric(c) ? 'r-r' : ''}">${esc(c.label.replace(/\s*\(.*\)$/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${numeric(c) ? 'r-r r-num' : ''}">${esc(c.sensitive ? m.masker(r[c.k] || '') : r[c.k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function header(m, kind) {
  const s = m.snap; const st = m.st;
  return `${s.draft ? `<div class="r-water">${esc(m.t.draft)}</div>` : ''}${st.meta.synthetic ? `<div class="r-water syn">${esc(m.t.synthetic)}</div>` : ''}
  <div class="r-head"><img src="/assets/shield.png" alt="" class="r-logo"><div class="r-head-t"><div class="r-brand">BECONIC IR 진단 <span>by Growth Ventures</span></div>
  <h1>${esc(kind === 'brief' ? m.t.brief : m.t.detail)}</h1></div>
  <div class="r-head-m"><b>${esc(st.meta.company || '회사명 미입력')}</b><span>${m.lang === 'en' ? 'As of' : '자료 기준일'} ${esc(st.meta.baseDate)}</span><span>${esc(s.reportId)} · v${s.version}</span></div></div>`;
}

/** 상태 카드(건수) — 점수 아님. 표 대신 고정 격자라 좁은 용지에서도 칸이 깨지지 않는다 */
function statusCards(m) {
  const c = {}; for (const q of QUESTIONS) { const d = m.byQ[q.id].data; c[d] = (c[d] || 0) + 1; }
  const reviewed = QUESTIONS.filter((q) => ['reviewer', 'approved'].includes(m.byQ[q.id].review)).length;
  const applicable = QUESTIONS.length - (c.na_ok || 0);
  const submitted = applicable - (c.none || 0) - (c.na_wait || 0);
  const cards = [
    ['제출', `${submitted}/${applicable}`, ''], ['검토 완료', `${reviewed}/${applicable}`, ''],
    [L(m.lang, DATA_LABEL.match), c.match || 0, 'ok'], [L(m.lang, DATA_LABEL.mismatch), c.mismatch || 0, (c.mismatch ? 'bad' : '')],
    [L(m.lang, DATA_LABEL.linked), c.linked || 0, ''], [L(m.lang, DATA_LABEL.submitted), c.submitted || 0, ''],
    [L(m.lang, DATA_LABEL.none), c.none || 0, (c.none ? 'warn' : '')], ['적용 제외(승인/대기)', `${c.na_ok || 0}/${c.na_wait || 0}`, ''],
  ];
  return `<div class="r-cards">${cards.map(([k, v, cls]) => `<div class="r-card ${cls}"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
  <p class="r-note">문항별 자료 상태의 건수입니다. 투자 준비도·사업성 점수가 아닙니다.</p>`;
}

const reviewerScope = (m) => {
  const rv = QUESTIONS.filter((q) => ['reviewer', 'approved'].includes(m.byQ[q.id].review)).map((q) => q.id).sort(byOrder);
  return rv.length ? `${esc(m.st.meta.consultant || '컨설턴트')} 검토 ${rv.length}건(${rv.join(', ')})` : '컨설턴트 검토 기록 없음';
};

function fundingBox(m, compact) {
  const a = ansOf(m, 'Q24'); const f = a.fields || {}; const fd = m.findings.find((x) => x.rule === 'R-FUND-01');
  if (!active(m, 'Q24') || !f.amount) return `<p>${dataChip(m, m.byQ.Q24.data)} 경영진 제출 조달 요청이 없습니다.</p>`;
  const p = parseAmount(f.amount); const cur = f.currency || m.st.meta.currency;
  const uses = (f.uses || []).filter((r) => r.item || r.amt);
  return `<div class="r-plan"><div class="r-plan-h"><b>${esc(L(m.lang, '경영진 제출 계획'))}</b> <span class="r-muted">실적이 아니며 달성 가능성·성과를 판단하지 않습니다.</span></div>
  <div class="r-plan-a"><span>요청 금액</span><b class="r-num">${p && !p.err ? esc(fmtUnit(p.v, cur)) : esc(f.amount)}</b></div>
  ${compact && uses.length ? `<div class="r-uses">${uses.map((u) => { const x = parseAmount(u.amt); return `<span>${esc(u.item || '용도 미입력')} <b class="r-num">${x && !x.err ? esc(fmtUnit(x.v, cur)) : esc(u.amt || '')}</b></span>`; }).join('')}</div>` : ''}
  <div class="r-muted">작성일 ${esc(f.written || '미입력')} · 승인 ${esc(f.approvedBy || '미입력')}${fd ? ` · 합계 확인 ${resChip(fd.result)} ${idLink(fd.id)}` : ''}</div></div>`;
}

// ───────────────────────── 투자자 요약본 (1쪽 목표)
export function renderBrief(snap, opts) {
  const m = reportModel(snap, opts); const st = m.st;
  const fact = (rule, qid) => m.findings.find((f) => f.rule === rule && f.qid === qid);
  const num = (qid, k, kind) => { const v = ansOf(m, qid).fields?.[k]; if (!v || !active(m, qid)) return null; const p = kind === 'count' ? parseCount(v) : parseAmount(v); return p && !p.err ? p.v : null; };
  const F = (qid) => ansOf(m, qid).fields || {};
  const evShort = (qid) => (ansOf(m, qid).links || []).filter((l) => evOf(st, l.eid)).map((l) => `${l.eid}${l.loc ? ` ${l.loc}` : ''}`).join(', ');
  const perf = [];
  const led = num('Q07', 'ledger'); if (led !== null) perf.push(['매출원장 합계(인식 매출)', `${F('Q07').start || '—'} ~ ${F('Q07').end || '—'}`, fmtUnit(led, F('Q07').currency || st.meta.currency), '', 'Q07', evShort('Q07')]);
  const crev = num('Q20', 'cRev'); if (crev !== null) perf.push(['재무자료 당기 매출', `${F('Q20').cStart || '—'} ~ ${F('Q20').cEnd || '—'}`, fmtUnit(crev, F('Q20').currency || st.meta.currency), F('Q20').audit || '감사 상태 미입력', 'Q20', evShort('Q20')]);
  const g = fact('R-GROW-01', 'Q20'); if (g && g.result === 'calc') perf.push(['과거 매출 증감률', g.inputs['당기'] || '', g.calc.split('=').pop().trim(), '과거 실적 계산(전망 아님)', 'Q20', g.id]);
  const cust = num('Q09', 'total', 'count'); if (cust !== null) perf.push(['전체 고객 수', F('Q09').asOf || '—', fmtUnit(cust, '명'), num('Q09', 'paid', 'count') !== null ? `유료 ${fmtUnit(num('Q09', 'paid', 'count'), '명')}` : '', 'Q09', evShort('Q09')]);
  const cash = fact('R-CASH-01', 'Q21');
  if (cash && cash.result === 'calc') { const tot = num('Q21', 'total'), rs = num('Q21', 'restricted'), cu = F('Q21').currency || st.meta.currency; perf.push(['가용 현금', F('Q21').asOf || '—', fmtUnit(tot - rs, cu), `총잔액 ${fmtUnit(tot, cu)} - 사용 제한 ${fmtUnit(rs, cu)}`, 'Q21', evShort('Q21')]); }
  const issued = num('Q17', 'issued', 'count'); const cap = fact('R-CAP-01', 'Q17');
  const holders = active(m, 'Q17') ? (F('Q17').holders || []).filter((h) => h.name || h.shares) : [];
  const mism = m.findings.filter((f) => f.result === 'mismatch');
  const none = QUESTIONS.filter((q) => m.byQ[q.id].data === 'none').map((q) => q.id).sort(byOrder);
  const asked = QUESTIONS.filter((q) => m.byQ[q.id].review === 'asked').map((q) => q.id).sort(byOrder);
  const q01 = ansOf(m, 'Q01');
  return (`<article class="r-doc r-brief">${header(m, 'brief')}
  <section><h2>${m.lang === 'en' ? 'Business (as submitted)' : '사업 내용(회사 진술)'}</h2><p class="r-lead">${active(m, 'Q01') && (q01.text || '').trim() ? esc(q01.text) : '<span class="r-muted">미제출</span>'}</p>
  <p class="r-muted r-sm">근거 ${esc(evShort('Q01') || '연결 자료 없음')} · ${dataChip(m, m.byQ.Q01.data)}</p></section>
  <section><h2>${m.lang === 'en' ? 'Status by question' : '문항별 자료 상태'}</h2>${statusCards(m)}</section>
  <section><h2>${m.lang === 'en' ? 'Submitted historical performance' : '제출 실적'}</h2>${perf.length ? `<table class="r-tbl r-perf"><thead><tr><th>항목</th><th>기간·기준</th><th class="r-r">값</th><th>비고</th><th>근거</th></tr></thead><tbody>${perf.map((r) => `<tr><td>${esc(r[0])}</td><td class="r-nw">${esc(r[1])}</td><td class="r-r r-num r-nw"><b>${esc(r[2])}</b></td><td class="r-muted">${esc(r[3])}</td><td class="r-muted"><b>${r[4]}</b> ${esc(r[5])}</td></tr>`).join('')}</tbody></table>` : '<p class="r-muted">제출된 실적 수치가 없습니다.</p>'}</section>
  <div class="r-two"><section><h2>${m.lang === 'en' ? 'Capital structure' : '현재 자본 구조'}</h2>
    ${issued !== null ? `<div class="r-plan-a"><span>발행주식 총수 · ${esc(F('Q17').asOf || '기준일 미입력')}</span><b class="r-num">${esc(fmtUnit(issued, '주'))}</b></div>
    ${holders.length ? `<div class="r-uses">${holders.slice(0, 6).map((h) => `<span>${esc(m.masker(h.name || '주주'))} <b class="r-num">${esc(h.shares || '')}주</b></span>`).join('')}</div>` : ''}
    <div class="r-muted">${cap ? `주주 합계 확인 ${resChip(cap.result)} ${idLink(cap.id)}` : '합계 확인 없음'}${m.mask ? ' · 주주명 마스킹' : ''}</div>` : '<p class="r-muted">주주 기록 미제출</p>'}</section>
  <section><h2>${esc(L(m.lang, '경영진 제출 계획'))}</h2>${fundingBox(m, true)}</section></div>
  <section><h2>${m.lang === 'en' ? 'Inconsistencies & open items' : '확인된 차이와 미해결 항목'}</h2>
  ${mism.length ? `<ul class="r-list">${mism.map((f) => `<li><b>${esc(f.id)}</b> ${f.fact.map(esc).join(' ')}</li>`).join('')}</ul>` : '<p>비교한 범위에서 확인된 차이가 없습니다.</p>'}
  <div class="r-next"><b>다음 행동</b> <span class="r-muted r-sm">확인된 차이 → 입력 시 자동 확인이 늘어나는 문항 순 · 위험도 순위 아님</span>${(() => { const acts = nextActions(m.ev).slice(0, 3); return acts.length ? `<ol class="r-ol r-acts">${acts.map((x) => `<li><b>${esc(x.title)}</b> — ${esc(x.text)}</li>`).join('')}</ol>` : '<p>먼저 처리할 항목이 없습니다.</p>'; })()}</div>
  <p class="r-sm"><b>미제출 ${none.length}건</b>${none.length ? ` ${none.join(', ')}` : ''}${asked.length ? ` · <b>확인 요청 ${asked.length}건</b> ${asked.join(', ')}` : ''}</p></section>
  <footer class="r-foot"><div><b>검토 범위</b> ${reviewerScope(m)} · <b>대표 승인</b> ${snap.draft ? '없음(초안)' : `${esc(snap.approvedBy)} ${esc(fmtDate(snap.approvedAt))}`} · 외부 진위 확인·감사·법률 검토 미수행</div>
  <div>상세 근거: 같은 버전의 근거 검토 상세본(${esc(snap.reportId)}) · 스냅샷 해시 ${esc((snap.hash || '미고정').slice(0, 16))}${snap.hash ? '…' : ''}</div>
  <div>${esc(m.t.disclaimer)}</div></footer></article>`).replace(/<a class="r-id" href="#[^"]*">(.*?)<\/a>/g, '<span class="r-id">$1</span>');
}

// ───────────────────────── 근거 검토 상세본
function sectionTable(m, secId) {
  const qs = QUESTIONS.filter((q) => q.sec === secId);
  return `<p class="r-secsum">${esc(sectionSummary(m.ev, secId).sentence)}</p><table class="r-tbl r-qt"><thead><tr><th>문항</th><th>회사 답변(자가진술)</th><th>자료·원문 위치</th><th>상태</th></tr></thead><tbody>
  ${qs.map((q) => { const b = m.byQ[q.id]; const a = ansOf(m, q.id); const sub = rowsTable(m, q);
    return `<tr id="q-${q.id}" class="${sub ? 'r-has-sub' : ''}"><td><b>${q.id}</b><div class="r-q">${esc(q.q)}</div></td><td>${answerHtml(m, q)}</td><td>${linksHtml(m.st, a)}</td><td>${dataChip(m, b.data)} ${revChip(m, b.review)}<div class="r-refs">${fRefs(m, q.id)}</div></td></tr>
    ${sub ? `<tr class="r-sub"><td colspan="4">${sub}</td></tr>` : ''}`; }).join('')}
  </tbody></table>`;
}

function infoRequests(m) {
  const rows = [];
  for (const q of Q_ORDER) {
    const a = ansOf(m, q.id); const b = m.byQ[q.id];
    if (b.data === 'none') rows.push([q.id, a.status === 'request' ? '자료 요청 중' : a.status === 'unknown' ? '미제출(모름)' : '미제출', q.ex.join(', '), maskPerson(m, a.reqTo), a.reqDue || '—', (QUESTION_GUIDE[q.id] || [])[0] || '']);
    if (b.review === 'asked') rows.push([q.id, '확인 요청', a.askNote || '', maskPerson(m, a.reqTo || m.st.meta.ceo), '—']);
    if (b.data === 'na_wait') rows.push([q.id, '적용 제외 승인 대기', a.naReason || '', m.st.meta.consultant || '검토자', '—']);
  }
  if (!rows.length) return '<p>미해결 자료 요청이 없습니다.</p>';
  return `<table class="r-tbl"><thead><tr><th>문항</th><th>구분</th><th>필요 자료·내용</th><th>담당자</th><th>기한</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${idLink(r[0], `#q-${r[0]}`)}</td><td class="r-nw">${esc(r[1])}</td><td>${esc(r[2])}${r[5] ? `<div class="r-muted r-sm">준비: ${esc(r[5])}</div>` : ''}</td><td class="r-nw">${esc(r[3])}</td><td class="r-nw">${esc(r[4])}</td></tr>`).join('')}</tbody></table>`;
}

/** 확인이 필요한 결과(불일치·비교 불가·입력 부족) — 비어 있는 행은 넣지 않는다 */
function findingBlock(m, f) {
  const a = ansOf(m, f.qid);
  const row = (k, v) => (v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '');
  return `<div class="r-find f-${f.result}" id="${esc(f.id)}"><div class="r-find-h">${resChip(f.result)} <b>${esc(f.id)}</b> ${esc(f.title)}</div>
  <table class="r-tbl r-kvt"><tbody>
  ${row('관찰 사실', f.fact.map(esc).join('<br>'))}
  ${row('질문', `${f.refs.map((r) => idLink(r, `#q-${r}`)).join(' ')} ${esc(QMAP[f.qid].q)}`)}
  ${row('증빙', f.refs.map((r) => linksHtml(m.st, ansOf(m, r))).join(''))}
  ${row('계산', f.calc ? `<span class="r-num">${esc(f.calc)}</span>` : '')}
  ${row('입력 조건', Object.entries(f.inputs).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(' · '))}
  ${row('수행 규칙', `${esc(f.rule)} v${esc(f.ruleV)} — ${esc(RULES[f.rule].name)}`)}
  ${row('미확인 사항', esc(f.unconfirmed))}
  ${(() => { const g = guideFor(f); return g ? row('확인할 항목', g.checks.map(esc).join(' · ')) + row('보완 방법', `<ol class="r-ol">${g.fix.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`) : ''; })()}
  ${row('확인 요청', f.request ? `${esc(f.request)} <span class="r-muted">(담당 ${esc(maskPerson(m, a.reqTo || m.st.meta.ceo))})</span>` : '')}
  </tbody></table></div>`;
}
/** 일치·계산 결과 — 한 줄씩 압축 */
function findingTable(m, list) {
  return `<table class="r-tbl r-ft"><thead><tr><th>결과 ID</th><th>결과</th><th>관찰 사실</th><th>계산</th></tr></thead><tbody>${list.map((f) => `<tr id="${esc(f.id)}"><td class="r-nw"><b>${esc(f.id)}</b><div class="r-muted">${esc(f.rule)} v${esc(f.ruleV)}</div></td><td class="r-nw">${resChip(f.result)}</td><td>${f.fact.map(esc).join(' ')}${f.unconfirmed ? `<div class="r-muted">미확인: ${esc(f.unconfirmed)}</div>` : ''}</td><td class="r-num r-calc">${esc(f.calc || '—')}</td></tr>`).join('')}</tbody></table>`;
}

function sectionTableSum(m) {
  return `<table class="r-tbl r-secs"><thead><tr><th>섹션</th><th class="r-r">원문 연결·일치</th><th class="r-r">자가진술</th><th class="r-r">미제출</th><th class="r-r">자료 간 차이</th><th>다음 행동</th></tr></thead><tbody>${SECTIONS.map((s) => { const x = sectionSummary(m.ev, s.id);
    return `<tr><td class="r-nw">${idLink(`${s.id}. ${s.title}`, `#sec-${s.report}`)}</td><td class="r-r">${x.confirmed}</td><td class="r-r">${x.self}</td><td class="r-r ${x.none ? 'r-warn' : ''}">${x.none}</td><td class="r-r ${x.attention ? 'r-bad' : ''}">${x.attention}</td><td>${esc(x.next)}</td></tr>`; }).join('')}</tbody></table>`;
}
function actionsList(m, n) {
  const acts = nextActions(m.ev).slice(0, n);
  if (!acts.length) return '<p>먼저 처리할 항목이 없습니다.</p>';
  return `<ol class="r-ol r-acts">${acts.map((x) => `<li><b>${esc(x.title)}</b> — ${esc(x.text)}</li>`).join('')}</ol><p class="r-note">순서 기준: 확인된 차이 해소 → 입력하면 실행 가능한 자동 확인이 많은 문항. 위험도 순위가 아닙니다.</p>`;
}

export function renderDetail(snap, opts) {
  const m = reportModel(snap, opts); const st = m.st; const h = m.h;
  const sec = (i, body, cls = '') => `<section class="r-sec ${cls}" id="sec-${i}"><h2><span>${i}</span>${esc(h[i - 1])}</h2>${body}</section>`;
  const attention = m.findings.filter((f) => ['mismatch', 'blocked', 'incomplete'].includes(f.result));
  const okList = m.findings.filter((f) => ['match', 'calc'].includes(f.result));
  const mism = m.findings.filter((f) => f.result === 'mismatch');
  const suggestions = QUESTIONS.flatMap((q) => (ansOf(m, q.id).suggestions || []).map((s) => ({ ...s, qid: q.id })));
  const ruleRuns = Object.keys(RULES).map((r) => [r, m.findings.filter((f) => f.rule === r).length]);
  const unresolved = Q_ORDER.filter((q) => ['none', 'mismatch', 'na_wait'].includes(m.byQ[q.id].data) || m.byQ[q.id].review === 'asked').map((q) => q.id);
  const none = Q_ORDER.filter((q) => m.byQ[q.id].data === 'none').map((q) => q.id);

  const cover = `<section class="r-cover">${snap.draft ? `<div class="r-water">${esc(m.t.draft)}</div>` : ''}${st.meta.synthetic ? `<div class="r-water syn">${esc(m.t.synthetic)}</div>` : ''}
    <div class="r-cover-b"><img src="/assets/shield.png" alt="" class="r-cover-logo"><div class="r-brand">BECONIC IR 진단 <span>by Growth Ventures</span></div></div>
    <div class="r-cover-t"><p class="r-cover-k">${esc(m.t.sub)}</p><h1>${esc(m.t.detail)}</h1><p class="r-cover-c">${esc(st.meta.company || '회사명 미입력')}</p></div>
    <table class="r-tbl r-kvt r-cover-m"><tbody>
      <tr><th>자료 기준일</th><td>${esc(st.meta.baseDate)}</td></tr><tr><th>보고서 ID · 버전</th><td>${esc(snap.reportId)} · v${snap.version}${snap.draft ? ' (승인 전 초안)' : ''}</td></tr>
      <tr><th>승인</th><td>${snap.draft ? '없음' : `${esc(snap.approvedBy)} · ${esc(fmtDate(snap.approvedAt))}`}</td></tr>
      <tr><th>비밀등급</th><td>${m.mask ? '대외비 — 투자 검토 공유용(개인 식별 정보 마스킹)' : '대외비 — 내부 검토용(마스킹 없음)'}</td></tr></tbody></table>
    <p class="r-cover-f">${esc(m.t.disclaimer)}<br>그로스벤처스 주식회사 · 중소벤처기업부 인증 중소기업상담회사 제2025-684호 · start@gven.kr · www.beconic.kr</p></section>`;

  return `<article class="r-doc r-detail">${cover}
  ${sec(1, `<table class="r-tbl r-kvt"><tbody>
    <tr><th>법인명 · 국가</th><td>${esc(st.meta.company || '미입력')} · ${esc(st.meta.country || '미입력')}</td></tr>
    <tr><th>자료 기준일</th><td>${esc(st.meta.baseDate)}</td></tr><tr><th>보고서 ID · 버전</th><td>${esc(snap.reportId)} · v${snap.version}${snap.draft ? ' (승인 전 초안)' : ''}</td></tr>
    <tr><th>언어 · 통화</th><td>${m.lang === 'en' ? 'English labels (Korean narrative, untranslated)' : '한국어'} · ${esc(st.meta.currency)}</td></tr>
    <tr><th>작성 · 검토 · 승인</th><td>작성 ${esc(st.meta.ceo || '대표(이름 미입력)')} · 검토 ${esc(st.meta.consultant || '미지정')} · 승인 ${snap.draft ? '없음' : `${esc(snap.approvedBy)} (${esc(fmtDate(snap.approvedAt))})`}</td></tr>
    <tr><th>버전 정보</th><td>문항 원장 ${esc(REGISTRY_VERSION)} · 검증 엔진 ${esc(ENGINE_VERSION)} · 앱 ${esc(snap.appVersion || '')}</td></tr>
    <tr><th>${esc(L(m.lang, '스냅샷 해시'))}</th><td class="r-mono">${esc(snap.hash || '(초안 — 미고정)')}</td></tr>
    ${st.meta.synthetic ? `<tr><th>자료 성격</th><td><b>${esc(m.t.synthetic)}</b></td></tr>` : ''}
  </tbody></table><h3>목차</h3><ul class="r-toc">${h.map((t, i) => `<li><a href="#sec-${i + 1}"><span>${i + 1}</span>${esc(t)}</a></li>`).join('')}</ul>`)}
  ${sec(2, `${statusCards(m)}<h3>핵심 사항</h3><ul class="r-list">
    <li>적용 문항 ${m.findings ? QUESTIONS.length - QUESTIONS.filter((q) => m.byQ[q.id].data === 'na_ok').length : 0}건 중 미제출 ${none.length}건${none.length ? `(${none.join(', ')})` : ''}.</li>
    <li>자동 검증 ${m.findings.length}건 실행: 일치·계산 ${okList.length}건, 확인 필요 ${attention.length}건(불일치 ${mism.length}건).</li>
    ${mism.map((f) => `<li>${idLink(f.id)} ${f.fact.map(esc).join(' ')}</li>`).join('')}
    <li>검토 범위: ${reviewerScope(m)}. 외부 진위 확인·감사·법률 검토는 수행하지 않았습니다.</li></ul>
    <h3>섹션별 정리</h3>${sectionTableSum(m)}
    <h3>먼저 하면 좋은 일</h3>${actionsList(m, 6)}
    <h3>미제출·확인 요청</h3>${infoRequests(m)}<h3>조달 요청(경영진 제출, 실적과 구분)</h3>${fundingBox(m, true)}`)}
  ${sec(3, `<p>사용 문항 ${QUESTIONS.length}개(${esc(REGISTRY_VERSION)}), 출처 ${SOURCES.length}건(확인일 ${SOURCES_CHECKED_AT}, 08 문서 기준), 제출 자료 ${st.evidence.length}건(부록 C).</p>
    <h3>수행한 검사</h3><table class="r-tbl"><thead><tr><th>규칙</th><th>내용</th><th class="r-r">실행</th></tr></thead><tbody>${ruleRuns.map(([r, n]) => `<tr><td class="r-nw">${r} v${RULES[r].v}</td><td>${esc(RULES[r].name)} <span class="r-muted">— ${esc(RULES[r].desc)}</span></td><td class="r-r r-nw">${r === 'R-DOC-01' ? '상태 반영' : `${n}건`}</td></tr>`).join('')}</tbody></table>
    <h3>해석 가이드</h3><p>${esc(GUIDE_NOTE)} 결과별 "확인할 항목·보완 방법", 문항별 "준비 방법", "먼저 하면 좋은 일"(확인된 차이 → 채우면 자동 확인이 늘어나는 문항 순)은 ${GUIDE_VERSION} 고정 문구이며 AI를 사용하지 않았습니다.</p>
    <h3>수행하지 않은 검사</h3><ul class="r-list"><li>자료의 외부 진위 확인(은행·등기소·고객 조회)</li><li>회계 적정성·법적 유효성·지식재산 비침해 판단</li><li>시장성·기술 우월성 평가, 미래 실적·현금 전망, 투자 적합성 판단 — 하지 않음</li><li>문항의 전문가 검토·사용성 시험·예측 타당도 검증 — 수행하지 않음(부록 A)</li></ul>`)}
  ${SECTIONS.filter((s) => s.id !== 'F').map((s) => sec(s.report, sectionTable(m, s.id))).join('')}
  ${sec(9, `${fundingBox(m, false)}${sectionTable(m, 'F')}`)}
  ${sec(10, `<h3>확인이 필요한 결과 (${attention.length}건)</h3>${attention.length ? attention.map((f) => findingBlock(m, f)).join('') : '<p>확인이 필요한 결과가 없습니다.</p>'}
    <h3>일치·계산 결과 (${okList.length}건)</h3>${okList.length ? findingTable(m, okList) : '<p>없음</p>'}
    <h3>자료 요청 목록</h3>${infoRequests(m)}`)}
  ${sec(11, `<h3>컨설턴트 수정 제안</h3>${suggestions.length ? `<table class="r-tbl"><thead><tr><th>문항</th><th>제안</th><th>결과</th></tr></thead><tbody>${suggestions.map((s) => `<tr><td>${s.qid}</td><td>${esc(s.by)}: ${esc(s.text)}</td><td>${s.status === 'accepted' ? '대표 수락' : s.status === 'rejected' ? `대표 반려 — ${esc(s.reason || '')}` : '응답 대기'}</td></tr>`).join('')}</tbody></table>` : '<p>기록된 수정 제안이 없습니다.</p>'}
    <h3>검토 기록</h3><table class="r-tbl"><thead><tr><th>문항</th><th>검토 상태</th><th>검토자·범위·메모</th></tr></thead><tbody>${Q_ORDER.filter((q) => m.byQ[q.id].review !== 'none').map((q) => { const a = ansOf(m, q.id); return `<tr><td>${q.id}</td><td>${revChip(m, m.byQ[q.id].review)}</td><td>${esc(a.reviewedBy || '')} ${esc((a.reviewScope || []).join(', '))}${a.askNote && m.byQ[q.id].review === 'asked' ? ` 요청: ${esc(a.askNote)}` : ''}${a.authorNote ? ` 답변: ${esc(a.authorNote)}` : ''}</td></tr>`; }).join('') || '<tr><td colspan="3">검토 기록 없음</td></tr>'}</tbody></table>
    <h3>대표 승인</h3><p>${snap.draft ? '승인 전 초안입니다.' : `${esc(snap.approvedBy)} · ${esc(fmtDate(snap.approvedAt))} — 대표 승인은 보고서 고정에 대한 승인이며 자료 진실성의 외부 인증이 아닙니다.`}</p>
    <h3>미해결 항목</h3><p>${unresolved.length ? `${unresolved.length}건: ${unresolved.join(', ')} — 숨기지 않고 본문에 표시했습니다.` : '없음'}</p>
    <h3>독립성·이해관계 신고</h3><p>${esc(st.meta.disclosure || '입력되지 않음')}</p>`)}
  ${sec(12, appendix(m), 'r-break')}
  <footer class="r-foot">${esc(m.t.disclaimer)}</footer></article>`;
}

function appendix(m) {
  const st = m.st;
  const linked = (eid) => Q_ORDER.filter((q) => (ansOf(m, q.id).links || []).some((l) => l.eid === eid)).map((q) => q.id).join(', ') || '—';
  return `<h3>A. 문항·출처 원장</h3><p class="r-note">모든 문항: 공식 자료의 주제 근거 확인(08 문서) · 비코닉 자체 작성 · 전문가 검토 ${questionMeta(QUESTIONS[0]).expert_review_status} · 사용성 시험 ${questionMeta(QUESTIONS[0]).usability_status} · 예측 타당도 검증하지 않음.</p>
  <table class="r-tbl r-small"><thead><tr><th>문항</th><th>출처·위치</th><th>앱의 확인 방법·한계</th><th>전문 검토 필요</th></tr></thead><tbody>
  ${Q_ORDER.map((q) => `<tr><td class="r-nw">${q.id}</td><td>${esc(questionMeta(q).source_locator)}</td><td>${esc(q.check)}</td><td class="r-nw">${esc(q.expert || '—')}</td></tr>`).join('')}</tbody></table>
  <h3>B. 출처 등록부</h3><table class="r-tbl r-small"><thead><tr><th>ID</th><th>문서·발행 주체</th><th>관련 위치</th><th>적용 한계</th></tr></thead><tbody>
  ${SOURCES.map((s) => `<tr id="src-${s.id}"><td class="r-nw">${s.id}</td><td>${esc(s.title)} — ${esc(s.publisher)}<div class="r-mono r-url">${esc(s.url)}</div></td><td>${esc(s.locator)}</td><td>${esc(s.limit)}</td></tr>`).join('')}</tbody></table>
  <p class="r-note">출처는 문항 주제의 근거이며, 해당 기관이 비코닉 문항이나 이 보고서를 승인·인증한 것이 아닙니다.</p>
  <h3>C. 자료 색인(Evidence index)</h3>${st.evidence.length ? `<table class="r-tbl r-small"><thead><tr><th>ID</th><th>자료명·종류</th><th>작성일·버전</th><th>SHA-256(원본 일치 확인용)</th><th>연결 문항</th></tr></thead><tbody>
  ${st.evidence.map((e) => `<tr id="ev-${esc(e.id)}"><td class="r-nw">${esc(e.id)}</td><td>${esc(e.name)}<div class="r-muted">${esc(e.kind)}</div></td><td class="r-nw">${esc(e.docDate || '—')} · v${e.version}</td><td class="r-mono r-url">${esc(e.sha256 || '파일 미선택(해시 없음)')}</td><td>${linked(e.id)}</td></tr>`).join('')}</tbody></table>` : '<p>등록된 자료가 없습니다.</p>'}
  <p class="r-note">원본 파일은 이 보고서·서비스에 업로드되지 않았습니다. 원문은 회사가 보관하며 자료명·버전·문서 내 위치로 찾습니다.</p>
  <h3>D. 규칙·산식</h3><table class="r-tbl r-small"><tbody>${Object.entries(RULES).map(([k, r]) => `<tr><td class="r-nw">${k} v${r.v}</td><td>${esc(r.name)}</td><td>${esc(r.desc)}</td></tr>`).join('')}</tbody></table>
  <p class="r-note">금액은 소수 둘째 자리까지 정수 연산으로 계산합니다. 통화는 환산하지 않습니다. 증감률은 전기·당기 길이가 같고 전기 값이 0보다 클 때만 계산하며 과거 실적입니다.</p>
  <h3>E. 변경 내역</h3><table class="r-tbl r-small"><thead><tr><th>버전</th><th>승인</th><th>해시</th></tr></thead><tbody>${(m.snap.history || []).map((s) => `<tr><td>v${s.version}</td><td>${esc(s.approvedBy)} · ${esc(fmtDate(s.approvedAt))}</td><td class="r-mono">${esc(s.hash.slice(0, 16))}…</td></tr>`).join('') || '<tr><td colspan="3">이전 버전 없음</td></tr>'}</tbody></table>
  <h3>F. 용어집</h3><table class="r-tbl r-small"><thead><tr><th>한국어</th><th>English</th><th>뜻</th></tr></thead><tbody>${GLOSSARY.map((g) => `<tr><td class="r-nw">${esc(g[0])}</td><td class="r-nw">${esc(g[1])}</td><td>${esc(g[2])}</td></tr>`).join('')}</tbody></table>`;
}
