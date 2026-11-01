// 보고서(ReportSnapshot → HTML → 브라우저 인쇄 PDF) — 09_글로벌투자자_PDF_보고서명세 v2 기준.
// 승인 스냅샷에 고정된 입력·결과만 사용한다(화면 값을 다시 해석하지 않음). 승인 전에는 '초안' 워터마크가 붙는다.
// 금지: 점수·등급·확률·순위·전망·원인 단정. 자유 입력 문장은 번역하지 않고 원문 그대로 둔다.
import { QUESTIONS, QMAP, SECTIONS, SOURCES, RULES, questionMeta, REGISTRY_VERSION, SOURCES_CHECKED_AT } from './registry.js';
import { DATA_LABEL, REVIEW_LABEL, RESULT_LABEL, ENGINE_VERSION, parseAmount, parseCount, fmtUnit } from './engine.js';

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
  ko: { brief: '투자자 요약본', detail: '근거 검토 상세본', draft: '승인 전 초안 — 대외 배포용 아님', synthetic: '합성 예시 — 실제 기업 자료 아님',
    disclaimer: '이 보고서는 제출 자료의 존재·범위·자료 간 일치 여부를 확인한 결과입니다. 투자 권유, 회계감사, 법률·지식재산 의견, 사업 전망이 아닙니다.' },
  en: { brief: 'Investor Brief', detail: 'Evidence Review Report', draft: 'DRAFT — not approved, not for external distribution', synthetic: 'SYNTHETIC EXAMPLE — not real company data',
    disclaimer: 'This report records the existence, scope and cross-document consistency of submitted materials. It is not an investment recommendation, audit opinion, legal/IP opinion or business forecast. Free-text answers and finding sentences are reproduced in the original Korean; no translation has been performed.' },
};
const L = (lang, ko) => (lang === 'en' ? EN[ko] || ko : ko);
const H = {
  ko: ['표지·문서 관리', '요약', '검토 범위와 방법', '회사·고객·제품', '시장·영업 실적', '기술·지식재산', '팀·지배구조', '과거 재무·현금', '경영진 제출 조달 요청', '확인 사항과 자료 요청', '검토·승인 기록', '부록'],
  en: ['Cover & Document Control', 'Executive Summary', 'Scope & Method', 'Company, Customer & Product', 'Market & Commercial Evidence', 'Technology & IP', 'Team & Governance', 'Historical Financials & Cash', 'Management-Submitted Funding Request', 'Findings & Information Requests', 'Review & Approval Record', 'Appendix'],
};

/** 스냅샷(또는 초안) 입력 → 보고서 모델 */
export function reportModel(snap, opts = {}) {
  const st = snap.state; const lang = opts.lang || 'ko'; const mask = !!opts.mask;
  const masker = (() => { const m = new Map(); return (name) => { if (!mask) return name; if (!m.has(name)) m.set(name, `주주 ${String.fromCharCode(65 + m.size)}`); return m.get(name); }; })();
  return { st, lang, mask, masker, snap, findings: snap.findings, byQ: snap.byQ, t: T[lang], h: H[lang] };
}

const evName = (st, eid) => st.evidence.find((e) => e.id === eid);
function linksHtml(st, a) {
  const ls = (a.links || []).filter((l) => evName(st, l.eid));
  if (!ls.length) return '<span class="r-muted">—</span>';
  return ls.map((l) => { const e = evName(st, l.eid); return `<a href="#ev-${esc(e.id)}">${esc(e.id)}</a> ${esc(e.name)} v${e.version}${l.loc ? ` · ${esc(l.loc)}` : ' · <i>위치 미기록</i>'}`; }).join('<br>');
}
function answerHtml(m, q) {
  const a = m.st.answers[q.id] || {}; const s = a.status || 'answer';
  if (s === 'na') return `<i>적용 제외 요청</i> — ${esc(a.naReason || '사유 미입력')}${a.naApproved ? ` (승인: ${esc(a.naApprovedBy || '')})` : ' (승인 대기)'}`;
  if (s === 'request') return `<i>담당자 자료 요청 중</i> — ${esc(m.mask ? '담당자' : a.reqTo || '담당자 미지정')}${a.reqDue ? `, 기한 ${esc(a.reqDue)}` : ''}`;
  if (s === 'unknown') return '<i>회사 답변: 아직 모름</i>';
  const parts = [];
  if ((a.text || '').trim()) parts.push(esc(a.text).replace(/\n/g, '<br>'));
  for (const f of q.fields || []) {
    const v = (a.fields || {})[f.k];
    if (f.type === 'rows' || v === undefined || v === '' || v === false) continue;
    parts.push(`<span class="r-kv">${esc(f.label)}: <b>${esc(v === true ? '예' : v)}</b></span>`);
  }
  return parts.join('<br>') || '<span class="r-muted">—</span>';
}
const chip = (cls, txt) => `<span class="r-chip ${cls}">${esc(txt)}</span>`;
const dataChip = (m, s) => chip(`d-${s}`, L(m.lang, DATA_LABEL[s]));
const revChip = (m, s) => chip(`v-${s}`, L(m.lang, REVIEW_LABEL[s]));
const fRef = (m, qid) => m.findings.filter((f) => f.refs.includes(qid)).map((f) => `<a href="#${esc(f.id)}">${esc(f.id)}</a>`).join(', ') || '—';

function header(m, kind) {
  const s = m.snap; const st = m.st;
  return `<div class="r-band">${s.draft ? `<div class="r-water">${esc(m.t.draft)}</div>` : ''}${st.meta.synthetic ? `<div class="r-water syn">${esc(m.t.synthetic)}</div>` : ''}</div>
  <div class="r-head"><img src="/assets/shield.png" alt="" class="r-logo"><div><div class="r-brand">BECONIC IR 진단 <span>by Growth Ventures</span></div>
  <h1>${esc(kind === 'brief' ? m.t.brief : m.t.detail)}</h1><div class="r-sub">${esc(st.meta.company || '회사명 미입력')} · ${m.lang === 'en' ? 'As of' : '자료 기준일'} ${esc(st.meta.baseDate)} · ${esc(s.reportId)} · v${s.version}</div></div></div>`;
}
const reviewerScope = (m) => {
  const rv = QUESTIONS.filter((q) => ['reviewer', 'approved'].includes(m.byQ[q.id].review)).map((q) => q.id);
  return rv.length ? `${esc(m.st.meta.consultant || '컨설턴트')} 검토 ${rv.length}건(${rv.join(', ')})` : '컨설턴트 검토 기록 없음';
};

function countStrip(m) {
  const c = {}; for (const q of QUESTIONS) { const d = m.byQ[q.id].data; c[d] = (c[d] || 0) + 1; }
  const order = ['match', 'linked', 'submitted', 'mismatch', 'none', 'na_wait', 'na_ok'];
  return `<table class="r-tbl r-count"><thead><tr>${order.map((k) => `<th>${esc(L(m.lang, DATA_LABEL[k]))}</th>`).join('')}</tr></thead><tbody><tr>${order.map((k) => `<td>${c[k] || 0}건</td>`).join('')}</tr></tbody></table>
  <p class="r-note">건수는 문항별 자료 상태의 집계입니다. 투자 준비도·사업성 점수가 아닙니다.</p>`;
}

function findingBlock(m, f) {
  const q = QMAP[f.qid]; const a = m.st.answers[f.qid] || {};
  return `<div class="r-find" id="${esc(f.id)}"><div class="r-find-h"><b>${esc(f.id)}</b> · ${esc(f.title)} ${chip(`f-${f.result}`, RESULT_LABEL[f.result])}</div>
  <table class="r-tbl r-kvt"><tbody>
  <tr><th>질문</th><td>${f.refs.map((r) => `<a href="#q-${r}">${r}</a>`).join(', ')} — ${esc(q.q)}</td></tr>
  <tr><th>관찰 사실</th><td>${f.fact.map(esc).join('<br>')}</td></tr>
  <tr><th>증빙</th><td>${f.refs.map((r) => linksHtml(m.st, m.st.answers[r] || {})).join('<br>')}</td></tr>
  <tr><th>수행 규칙</th><td>${esc(f.rule)} v${esc(f.ruleV)} — ${esc(RULES[f.rule].name)}</td></tr>
  ${f.calc ? `<tr><th>계산</th><td class="r-mono">${esc(f.calc)}</td></tr>` : ''}
  ${Object.keys(f.inputs).length ? `<tr><th>입력 조건</th><td>${Object.entries(f.inputs).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</td></tr>` : ''}
  <tr><th>확인 범위</th><td>${esc(f.scope)}</td></tr>
  <tr><th>미확인 사항</th><td>${esc(f.unconfirmed || '—')}</td></tr>
  <tr><th>확인 요청</th><td>${esc(f.request || '—')}</td></tr>
  <tr><th>담당자</th><td>${esc(m.mask ? '담당자' : a.reqTo || m.st.meta.ceo || '미지정')}</td></tr>
  </tbody></table></div>`;
}

function sectionTable(m, secId) {
  const qs = QUESTIONS.filter((q) => q.sec === secId);
  return `<table class="r-tbl r-qt"><thead><tr><th>문항</th><th>회사 답변(자가진술)</th><th>자료·원문 위치</th><th>상태</th></tr></thead><tbody>
  ${qs.map((q) => { const b = m.byQ[q.id]; const a = m.st.answers[q.id] || {};
    return `<tr id="q-${q.id}"><td><b>${q.id}</b><br>${esc(q.q)}</td><td>${answerHtml(m, q)}${rowsTable(m, q, a)}</td><td>${linksHtml(m.st, a)}</td><td>${dataChip(m, b.data)}<br>${revChip(m, b.review)}<br><span class="r-muted">${fRef(m, q.id)}</span></td></tr>`; }).join('')}
  </tbody></table>`;
}

function rowsTable(m, q, a) {
  const f = (q.fields || []).find((x) => x.type === 'rows'); if (!f || (a.status || 'answer') !== 'answer') return '';
  const rows = ((a.fields || {})[f.k] || []).filter((r) => Object.values(r).some((x) => String(x ?? '').trim()));
  if (!rows.length) return '';
  const cols = f.cols.filter((c) => !['src', 'srcPeriod'].includes(c.k) || rows.some((r) => r[c.k]));
  return `<table class="r-tbl r-inner"><thead><tr>${cols.map((c) => `<th>${esc(c.label.replace(/\s*\(.*\)$/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(c.sensitive ? m.masker(r[c.k] || '') : r[c.k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function infoRequests(m) {
  const rows = [];
  for (const q of QUESTIONS) {
    const a = m.st.answers[q.id] || {}; const b = m.byQ[q.id];
    if (b.data === 'none') rows.push([q.id, (a.status === 'request') ? '자료 요청 중' : '미제출', q.ex.join(', '), m.mask ? '담당자' : a.reqTo || '미지정', a.reqDue || '—']);
    if (b.review === 'asked') rows.push([q.id, '확인 요청', a.askNote || '', m.mask ? '담당자' : a.reqTo || m.st.meta.ceo || '미지정', '—']);
    if (b.data === 'na_wait') rows.push([q.id, '적용 제외 승인 대기', a.naReason || '', m.st.meta.consultant || '검토자', '—']);
  }
  if (!rows.length) return '<p>미해결 자료 요청이 없습니다.</p>';
  return `<table class="r-tbl"><thead><tr><th>문항</th><th>구분</th><th>필요 자료·내용</th><th>담당자</th><th>기한</th></tr></thead><tbody>${rows.map((r) => `<tr><td><a href="#q-${r[0]}">${r[0]}</a></td>${r.slice(1).map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function fundingBox(m) {
  const a = m.st.answers.Q24 || {}; const f = a.fields || {}; const fd = m.findings.find((x) => x.rule === 'R-FUND-01');
  if ((a.status || 'answer') !== 'answer' || !f.amount) return `<p>경영진 제출 조달 요청: ${dataChip(m, m.byQ.Q24.data)}</p>`;
  const p = parseAmount(f.amount);
  return `<div class="r-plan"><b>${esc(L(m.lang, '경영진 제출 계획'))}</b> — 실적이 아니며 달성 가능성·성과를 판단하지 않습니다.<br>
  요청 금액 <b>${p && !p.err ? esc(fmtUnit(p.v, f.currency || m.st.meta.currency)) : esc(f.amount)}</b> · 작성일 ${esc(f.written || '미입력')} · 승인 ${esc(f.approvedBy || '미입력')} ${fd ? `· 합계 확인 <a href="#${fd.id}">${fd.id}</a> ${chip(`f-${fd.result}`, RESULT_LABEL[fd.result])}` : ''}</div>`;
}

// ───────────────────────── 투자자 요약본 (1~2쪽)
export function renderBrief(snap, opts) {
  const m = reportModel(snap, opts); const st = m.st;
  const fact = (rule, qid) => m.findings.find((f) => f.rule === rule && f.qid === qid);
  const num = (qid, k, kind) => { const v = st.answers[qid]?.fields?.[k]; if (!v || (st.answers[qid]?.status || 'answer') !== 'answer') return null; const p = kind === 'count' ? parseCount(v) : parseAmount(v); return p && !p.err ? p.v : null; };
  const q07 = st.answers.Q07?.fields || {}; const q20 = st.answers.Q20?.fields || {}; const q17 = st.answers.Q17?.fields || {};
  const perf = [];
  const led = num('Q07', 'ledger'); if (led !== null) perf.push(['매출원장 합계', `${q07.start || '—'}~${q07.end || '—'}`, fmtUnit(led, q07.currency || st.meta.currency), 'Q07', linksHtml(st, st.answers.Q07)]);
  const crev = num('Q20', 'cRev'); if (crev !== null) perf.push(['재무자료 당기 매출', `${q20.cStart || '—'}~${q20.cEnd || '—'} · ${q20.audit || '감사 상태 미입력'}`, fmtUnit(crev, q20.currency || st.meta.currency), 'Q20', linksHtml(st, st.answers.Q20)]);
  const cust = num('Q09', 'total', 'count'); if (cust !== null) perf.push(['전체 고객 수', st.answers.Q09.fields.asOf || '—', fmtUnit(cust, '명'), 'Q09', linksHtml(st, st.answers.Q09)]);
  const cash = fact('R-CASH-01', 'Q21'); if (cash && cash.result === 'calc') perf.push(['현금 잔액·가용 현금', st.answers.Q21.fields.asOf || '—', cash.calc, 'Q21', esc(cash.id)]);
  const issued = num('Q17', 'issued', 'count');
  const mism = m.findings.filter((f) => f.result === 'mismatch'); const none = QUESTIONS.filter((q) => m.byQ[q.id].data === 'none');
  // 요약본에는 상세 섹션이 없으므로 내부 링크를 텍스트로 바꾼다(끊어진 링크 방지)
  return (`<article class="r-doc r-brief">${header(m, 'brief')}
  <section><h2>${m.lang === 'en' ? 'Company' : '확인된 사업 내용'}</h2><p>${answerHtml(m, QMAP.Q01)}</p><p class="r-muted">근거: ${linksHtml(st, st.answers.Q01 || {})} · 상태 ${dataChip(m, m.byQ.Q01.data)}</p></section>
  <section><h2>${m.lang === 'en' ? 'Status by question' : '문항별 자료 상태'}</h2>${countStrip(m)}</section>
  <section><h2>${m.lang === 'en' ? 'Submitted historical performance' : '제출 실적'}</h2>${perf.length ? `<table class="r-tbl"><thead><tr><th>항목</th><th>기간·기준</th><th>값</th><th>문항</th><th>근거</th></tr></thead><tbody>${perf.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="r-mono">${esc(r[2])}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('')}</tbody></table>` : '<p>제출된 실적 수치가 없습니다.</p>'}</section>
  <section><h2>${m.lang === 'en' ? 'Current capital structure' : '현재 자본 구조'}</h2><p>${issued !== null ? `${esc(q17.asOf || '기준일 미입력')} 기준 발행주식 총수 ${esc(fmtUnit(issued, '주'))}` : '주주 기록 미제출'} ${fact('R-CAP-01', 'Q17') ? `· 합계 확인 ${chip(`f-${fact('R-CAP-01', 'Q17').result}`, RESULT_LABEL[fact('R-CAP-01', 'Q17').result])}` : ''}${m.mask ? ' · 주주명 마스킹' : ''}</p></section>
  <section><h2>${esc(L(m.lang, '경영진 제출 계획'))}</h2>${fundingBox(m)}</section>
  <section><h2>${m.lang === 'en' ? 'Inconsistencies & missing items' : '확인된 차이와 미제출 자료'}</h2>
  ${mism.length ? `<ul>${mism.map((f) => `<li><b>${esc(f.id)}</b> ${f.fact.map(esc).join(' ')}</li>`).join('')}</ul>` : '<p>비교한 범위에서 확인된 차이가 없습니다.</p>'}
  <p>미제출 ${none.length}건${none.length ? `: ${none.map((q) => q.id).join(', ')}` : ''}</p></section>
  <section><h2>${m.lang === 'en' ? 'Review scope' : '검토 범위·검토자'}</h2><p>${reviewerScope(m)} · 대표 승인 ${snap.draft ? '없음(초안)' : `${esc(snap.approvedBy)} ${esc(fmtDate(snap.approvedAt))}`} · 외부 진위 확인·감사·법률 검토 미수행</p>
  <p class="r-muted">상세 근거는 같은 버전의 근거 검토 상세본(${esc(snap.reportId)})을 참조하십시오. 스냅샷 해시 ${esc((snap.hash || '').slice(0, 16))}…</p></section>
  <footer class="r-foot">${esc(m.t.disclaimer)}</footer></article>`).replace(/<a href="#[^"]*">(.*?)<\/a>/g, '$1');
}

export const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.toISOString().slice(0, 16).replace('T', ' ')} KST`; };

// ───────────────────────── 근거 검토 상세본
export function renderDetail(snap, opts) {
  const m = reportModel(snap, opts); const st = m.st; const h = m.h;
  const toc = h.map((t, i) => `<li><a href="#sec-${i + 1}">${i + 1}. ${esc(t)}</a></li>`).join('');
  const sec = (i, body) => `<section class="r-sec" id="sec-${i}"><h2>${i}. ${esc(h[i - 1])}</h2>${body}</section>`;
  const mism = m.findings.filter((f) => f.result === 'mismatch');
  const suggestions = QUESTIONS.flatMap((q) => ((st.answers[q.id] || {}).suggestions || []).map((s) => ({ ...s, qid: q.id })));
  const ruleRuns = Object.keys(RULES).map((r) => [r, m.findings.filter((f) => f.rule === r).length]);
  const unresolved = QUESTIONS.filter((q) => ['none', 'mismatch', 'na_wait'].includes(m.byQ[q.id].data) || m.byQ[q.id].review === 'asked');

  return `<article class="r-doc r-detail">${header(m, 'detail')}
  ${sec(1, `<table class="r-tbl r-kvt"><tbody>
    <tr><th>법인명</th><td>${esc(st.meta.company || '미입력')}</td></tr><tr><th>법인 국가</th><td>${esc(st.meta.country || '미입력')}</td></tr>
    <tr><th>자료 기준일</th><td>${esc(st.meta.baseDate)}</td></tr><tr><th>보고서 ID · 버전</th><td>${esc(snap.reportId)} · v${snap.version}${snap.draft ? ' (승인 전 초안)' : ''}</td></tr>
    <tr><th>언어 · 통화</th><td>${m.lang === 'en' ? 'English labels (Korean narrative, untranslated)' : '한국어'} · ${esc(st.meta.currency)}</td></tr>
    <tr><th>비밀등급</th><td>${m.mask ? '대외비 — 투자 검토 공유용(개인 식별 정보 마스킹)' : '대외비 — 내부 검토용(마스킹 없음)'}</td></tr>
    <tr><th>작성 · 검토 · 승인</th><td>작성 ${esc(st.meta.ceo || '대표(이름 미입력)')} · 검토 ${esc(st.meta.consultant || '미지정')} · 승인 ${snap.draft ? '없음' : `${esc(snap.approvedBy)} (${esc(fmtDate(snap.approvedAt))})`}</td></tr>
    <tr><th>버전 정보</th><td>문항 원장 ${esc(REGISTRY_VERSION)} · 검증 엔진 ${esc(ENGINE_VERSION)} · 앱 ${esc(snap.appVersion || '')}</td></tr>
    <tr><th>${esc(L(m.lang, '스냅샷 해시'))}</th><td class="r-mono">${esc(snap.hash || '(초안 — 미고정)')}</td></tr>
    ${st.meta.synthetic ? `<tr><th>자료 성격</th><td><b>${esc(m.t.synthetic)}</b></td></tr>` : ''}
  </tbody></table><h3>목차</h3><ol class="r-toc">${toc}</ol>`)}
  ${sec(2, `${countStrip(m)}<h3>확인된 자료 간 차이</h3>${mism.length ? `<ul>${mism.map((f) => `<li><a href="#${f.id}">${f.id}</a> ${f.fact.map(esc).join(' ')}</li>`).join('')}</ul>` : '<p>비교한 범위에서 확인된 차이가 없습니다.</p>'}
    <h3>미제출·확인 요청</h3>${infoRequests(m)}<h3>조달 요청(원문 구분)</h3>${fundingBox(m)}`)}
  ${sec(3, `<p>사용 문항: ${QUESTIONS.length}개(${esc(REGISTRY_VERSION)}), 출처 ${SOURCES.length}건(확인일 ${SOURCES_CHECKED_AT}, 08 문서 기준). 제출 자료 ${st.evidence.length}건(부록 C).</p>
    <h3>수행한 검사</h3><table class="r-tbl"><thead><tr><th>규칙</th><th>내용</th><th>실행 건수</th></tr></thead><tbody>${ruleRuns.map(([r, n]) => `<tr><td>${r} v${RULES[r].v}</td><td>${esc(RULES[r].name)} — ${esc(RULES[r].desc)}</td><td>${r === 'R-DOC-01' ? '문항별 상태로 반영' : `${n}건`}</td></tr>`).join('')}</tbody></table>
    <h3>수행하지 않은 검사</h3><ul><li>자료의 외부 진위 확인(은행·등기소·고객 조회)</li><li>회계 적정성·법적 유효성·지식재산 비침해 판단</li><li>시장성·기술 우월성 평가, 미래 실적·현금 전망, 투자 적합성 판단</li><li>문항의 전문가 검토·사용성 시험·예측 타당도 검증(부록 A: 모두 미검증)</li></ul>
    <p>외부 확인: 수행하지 않음. 검토 범위: ${reviewerScope(m)}.</p>`)}
  ${SECTIONS.filter((s) => s.id !== 'F').map((s) => sec(s.report, sectionTable(m, s.id))).join('')}
  ${sec(9, `${fundingBox(m)}${sectionTable(m, 'F')}`)}
  ${sec(10, `${m.findings.length ? m.findings.map((f) => findingBlock(m, f)).join('') : '<p>실행된 검증 결과가 없습니다.</p>'}<h3>자료 요청 목록</h3>${infoRequests(m)}`)}
  ${sec(11, `<h3>컨설턴트 수정 제안</h3>${suggestions.length ? `<table class="r-tbl"><thead><tr><th>문항</th><th>제안</th><th>결과</th></tr></thead><tbody>${suggestions.map((s) => `<tr><td>${s.qid}</td><td>${esc(s.by)}: ${esc(s.text)}</td><td>${s.status === 'accepted' ? '대표 수락' : s.status === 'rejected' ? `대표 반려 — ${esc(s.reason || '')}` : '응답 대기'}</td></tr>`).join('')}</tbody></table>` : '<p>기록된 수정 제안이 없습니다.</p>'}
    <h3>검토 기록</h3><table class="r-tbl"><thead><tr><th>문항</th><th>검토 상태</th><th>검토자·범위</th></tr></thead><tbody>${QUESTIONS.filter((q) => m.byQ[q.id].review !== 'none').map((q) => { const a = st.answers[q.id] || {}; return `<tr><td>${q.id}</td><td>${revChip(m, m.byQ[q.id].review)}</td><td>${esc(a.reviewedBy || '')} ${esc((a.reviewScope || []).join(', '))}${a.askNote && m.byQ[q.id].review === 'asked' ? ` 요청: ${esc(a.askNote)}` : ''}${a.authorNote ? ` 답변: ${esc(a.authorNote)}` : ''}</td></tr>`; }).join('') || '<tr><td colspan="3">검토 기록 없음</td></tr>'}</tbody></table>
    <h3>대표 승인</h3><p>${snap.draft ? '승인 전 초안입니다.' : `${esc(snap.approvedBy)} · ${esc(fmtDate(snap.approvedAt))} · 대표 승인은 보고서 고정에 대한 승인이며 자료 진실성의 외부 인증이 아닙니다.`}</p>
    <h3>미해결 항목</h3><p>${unresolved.length ? `${unresolved.length}건: ${unresolved.map((q) => q.id).join(', ')} — 숨기지 않고 본문에 표시했습니다.` : '없음'}</p>
    <h3>독립성·이해관계 신고</h3><p>${esc(st.meta.disclosure || '입력되지 않음')}</p>`)}
  ${sec(12, appendix(m))}
  <footer class="r-foot">${esc(m.t.disclaimer)}</footer></article>`;
}

function appendix(m) {
  const st = m.st;
  const linked = (eid) => QUESTIONS.filter((q) => ((st.answers[q.id] || {}).links || []).some((l) => l.eid === eid)).map((q) => q.id).join(', ') || '—';
  return `<h3>A. 문항·출처 원장</h3><table class="r-tbl r-small"><thead><tr><th>문항</th><th>출처·위치</th><th>확인 방법·한계</th><th>검증 상태</th></tr></thead><tbody>
  ${QUESTIONS.map((q) => { const meta = questionMeta(q); return `<tr><td>${q.id}</td><td>${esc(meta.source_locator)}</td><td>${esc(q.check)}</td><td>주제 근거 확인 · 전문가 검토 ${meta.expert_review_status}${q.expert ? `(${q.expert})` : ''} · 사용성 ${meta.usability_status}</td></tr>`; }).join('')}</tbody></table>
  <h3>B. 출처 등록부</h3><table class="r-tbl r-small"><thead><tr><th>ID</th><th>문서·발행 주체</th><th>관련 위치</th><th>적용 한계</th></tr></thead><tbody>
  ${SOURCES.map((s) => `<tr id="src-${s.id}"><td>${s.id}</td><td>${esc(s.title)} — ${esc(s.publisher)}<br><span class="r-mono r-url">${esc(s.url)}</span></td><td>${esc(s.locator)}</td><td>${esc(s.limit)}</td></tr>`).join('')}</tbody></table>
  <p class="r-note">출처는 문항 주제의 근거이며, 해당 기관이 비코닉 문항이나 이 보고서를 승인·인증한 것이 아닙니다.</p>
  <h3>C. 자료 색인(Evidence index)</h3>${st.evidence.length ? `<table class="r-tbl r-small"><thead><tr><th>ID</th><th>자료명·종류</th><th>작성일·버전</th><th>SHA-256(원본 일치 확인용)</th><th>연결 문항</th></tr></thead><tbody>
  ${st.evidence.map((e) => `<tr id="ev-${esc(e.id)}"><td>${esc(e.id)}</td><td>${esc(e.name)}<br>${esc(e.kind)}</td><td>${esc(e.docDate || '—')} · v${e.version}</td><td class="r-mono r-url">${esc(e.sha256 || '파일 미선택(해시 없음)')}</td><td>${linked(e.id)}</td></tr>`).join('')}</tbody></table>` : '<p>등록된 자료가 없습니다.</p>'}
  <p class="r-note">원본 파일은 이 보고서·서비스에 업로드되지 않았습니다. 원문은 회사가 보관하며 자료명·버전·문서 내 위치로 찾습니다.</p>
  <h3>D. 규칙·산식</h3><table class="r-tbl r-small"><tbody>${Object.entries(RULES).map(([k, r]) => `<tr><td>${k} v${r.v}</td><td>${esc(r.name)}</td><td>${esc(r.desc)}</td></tr>`).join('')}</tbody></table>
  <p class="r-note">금액은 소수 둘째 자리까지 정수 연산으로 계산합니다. 통화는 환산하지 않습니다. 증감률은 전기·당기 길이가 같고 전기 값이 0보다 클 때만 계산하며 과거 실적입니다.</p>
  <h3>E. 변경 내역</h3><table class="r-tbl r-small"><thead><tr><th>버전</th><th>승인</th><th>해시</th></tr></thead><tbody>${(m.snap.history || []).map((s) => `<tr><td>v${s.version}</td><td>${esc(s.approvedBy)} · ${esc(fmtDate(s.approvedAt))}</td><td class="r-mono">${esc(s.hash.slice(0, 16))}…</td></tr>`).join('') || '<tr><td colspan="3">이전 버전 없음</td></tr>'}</tbody></table>
  <h3>F. 용어집</h3><table class="r-tbl r-small"><thead><tr><th>한국어</th><th>English</th><th>뜻</th></tr></thead><tbody>${GLOSSARY.map((g) => `<tr><td>${esc(g[0])}</td><td>${esc(g[1])}</td><td>${esc(g[2])}</td></tr>`).join('')}</tbody></table>`;
}
