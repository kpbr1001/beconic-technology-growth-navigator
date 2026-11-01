// BECONIC IR 진단 — 화면. 입력값은 이 브라우저에만 저장되며 서버로 보내지 않는다.
import { QUESTIONS, Q_ORDER, QMAP, SECTIONS, SMAP, EVIDENCE_KINDS, REGISTRY_VERSION } from './registry.js';
import { evaluate, parseAmount, parseCount, fmtUnit, canonical, sha256Hex, DATA_LABEL, DATA_HELP, REVIEW_LABEL, RESULT_LABEL, TODO_LABEL, TODO_ORDER, ENGINE_VERSION } from './engine.js';
import { blank, load, save, clear, validate, nextEvidenceId, nowIso, today } from './store.js';
import { sampleState } from './sample.js';
import { renderBrief, renderDetail, esc, fmtDate } from './report.js';

export const APP = { version: 'v1.0.0', updated: '2026-11-01' };
const $ = (s, el = document) => el.querySelector(s);
const root = () => $('#app');
const CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY', 'SGD', 'CNY'];

let st = load();
let saveTimer = null;
let lastSaved = null;
let draftNew = {}; // 화면 임시 입력(새 자료 등록 등)

// ───────────────────────── 저장
function commit(immediate) {
  clearTimeout(saveTimer);
  const run = () => { if (st && save(st)) { lastSaved = new Date(); const el = $('#save-ind'); if (el) el.textContent = `자동 저장됨 ${lastSaved.toTimeString().slice(0, 5)}`; } };
  if (immediate) run(); else saveTimer = setTimeout(run, 350);
}
const who = () => (st.role === 'ceo' ? (st.meta.ceo || '대표') : (st.meta.consultant || '컨설턴트'));
const ans = (qid) => {
  const a = (st.answers[qid] ||= { status: 'answer', text: '', review: 'none' });
  a.fields ||= {}; a.links ||= []; a.suggestions ||= []; a.history ||= [];
  return a;
};
function hist(qid, what) { const a = ans(qid); a.history = [...(a.history || []), { at: nowIso(), by: who(), what }].slice(-60); }
/** 내용 변경 → 검토 완료·승인 상태였으면 재검토 대상으로 */
function touched(qid, what) {
  const a = ans(qid); hist(qid, what); a.updatedAt = nowIso();
  if (['reviewer', 'approved'].includes(a.review)) { a.review = 'none'; a.stale = true; a.staleNote = `검토 후 변경: ${what}`; }
  else if (st.snapshots.length && !a.stale && a.approvedIn) { a.stale = true; a.staleNote = `승인본(v${a.approvedIn}) 이후 변경: ${what}`; }
}

// ───────────────────────── 라우팅
const route = () => (location.hash.replace(/^#\/?/, '') || '').split('/');
const go = (h) => { if (location.hash === `#/${h}`) render(); else location.hash = `#/${h}`; };
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ───────────────────────── 공통 조각
const chip = (cls, txt, title) => `<span class="chip ${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const dChip = (s) => chip(`d-${s}`, DATA_LABEL[s], DATA_HELP[s]);
const rChip = (s) => chip(`v-${s}`, REVIEW_LABEL[s]);
const fChip = (r) => chip(`f-${r}`, RESULT_LABEL[r]);

function headerHtml(inWork) {
  const roleBtn = inWork && st ? `<button class="role" data-act="role" aria-label="역할 바꾸기">${st.role === 'ceo' ? '대표' : '컨설턴트'}<span>로 보는 중 · 바꾸기</span></button>` : '';
  return `<header class="site"><div class="wrap hd"><a class="brand" href="#/" aria-label="BECONIC IR 진단 처음으로"><img src="assets/shield.png" alt="" width="34" height="34"><span class="txt"><b>BECONIC</b><small>IR 진단 · by Growth Ventures</small></span></a>${roleBtn}</div></header>`;
}
function footerHtml() {
  return `<footer class="site"><div class="wrap ft"><div class="f-brand"><img src="assets/shield-white.png" alt="" width="40" height="40"><div><b>BECONIC</b><small>IR 진단 · by Growth Ventures</small></div></div>
  <p class="f-info">그로스벤처스 주식회사 · 서울시 구로구 디지털로27길 24, 209호<br>전화 <a href="tel:070-4103-4177">070-4103-4177</a> · 이메일 <a href="mailto:start@gven.kr">start@gven.kr</a> · <a href="https://www.beconic.kr/" target="_blank" rel="noopener">www.beconic.kr</a></p>
  <p class="f-cert">중소벤처기업부 공식 인증 중소기업상담회사 (제2025-684호)</p>
  <p class="f-legal">이 서비스는 제출 자료의 존재·범위·자료 간 일치 여부를 정리하는 도구입니다. 투자 권유, 회계감사, 법률·지식재산 의견, 사업 전망을 제공하지 않습니다. 입력한 내용은 이 브라우저에만 저장됩니다.</p>
  <p class="f-ver">${APP.version} · 문항 ${REGISTRY_VERSION} · 엔진 ${ENGINE_VERSION}</p></div></footer>`;
}

// ───────────────────────── 홈
function homeHtml() {
  const resume = st && st.meta.company;
  return `${headerHtml(false)}<main>
  <section class="hero"><div class="wrap hero-in"><div class="hero-txt">
    <p class="eyebrow">근거로 준비하고, 실행으로 연결합니다</p>
    <h1>우리 회사 IR,<br><em>투자자가 묻기 전에</em><br>근거부터 맞춰 두세요</h1>
    <p class="lead">피치덱·사업모델·시장·팀·재무·증빙자료를 24개 질문으로 확인해요. 덱 숫자와 원자료가 맞는지, 빠진 자료가 무엇인지 정리해서 근거가 연결된 보고서(PDF)로 만들어 드려요.</p>
    <div class="cta-row">${resume ? `<button class="btn primary lg" data-act="resume">이어서 하기 · ${esc(st.meta.company)}</button><button class="btn ghost lg" data-act="new">새로 시작</button>` : '<button class="btn primary lg" data-act="new">IR 자료 점검 시작하기</button>'}</div>
    <button class="link" data-act="sample">합성 예시로 먼저 둘러보기 →</button>
    <p class="micro">회원가입 없음 · 입력 내용은 이 브라우저에만 저장 · 파일은 업로드하지 않아요</p>
  </div>
  <div class="hero-card" aria-label="화면 예시"><div class="hc-top"><span>지금 확인할 항목</span><small>화면 예시</small></div>
    <div class="hc-row"><span class="dot bad"></span><div><b>덱 11쪽 매출 ≠ 매출원장</b><small>같은 기간 30,000,000원 차이 · 원인은 확인 전</small></div></div>
    <div class="hc-row"><span class="dot warn"></span><div><b>특허 출원인 명의 확인 요청</b><small>컨설턴트 요청 · 출원서 1쪽 연결</small></div></div>
    <div class="hc-row"><span class="dot ok"></span><div><b>현금흐름 기초+변동=기말</b><small>310,000,000원 일치</small></div></div>
    <div class="hc-row"><span class="dot none"></span><div><b>미제출 6건</b><small>시장 자료 · 보안 기록 · IP 귀속 문서…</small></div></div>
    <div class="hc-prog"><div><span>제출·검토 진행</span><b>16 / 24건</b></div><div class="bar"><i style="width:66%"></i></div><small>업무 진행률이에요. 투자 준비도 점수가 아니에요.</small></div>
  </div></div></section>

  <section class="wrap feat">
    <h2 class="sec-t">이렇게 확인해요</h2>
    <div class="cards4">
      ${[['피치덱 근거 연결', '핵심 메시지와 숫자가 어떤 원자료에서 왔는지 쪽·셀 단위로 연결해요.', 'deck'],
         ['투자자 관점 질문', '시장·고객·팀·지분·현금까지 투자자가 실사에서 묻는 주제를 24문항으로 정리했어요.', 'search'],
         ['증빙 수치 대사', '덱↔원장, 기초+변동=기말, 주주 합계, 자금 용도 합계를 정수 계산으로 맞춰 봐요.', 'check'],
         ['지금 할 일 · 보고서', '차이·요청·미제출을 정해진 순서로 보여 주고, 승인본으로 PDF 2종을 만들어요.', 'flag']]
        .map(([t, d, i]) => `<div class="fcard"><span class="ic ic-${i}" aria-hidden="true"></span><b>${t}</b><p>${d}</p></div>`).join('')}
    </div>
  </section>

  <section class="wrap two">
    <div class="panel ok-p"><h3>확인하는 것</h3><ul>
      <li>제출한 자료가 있는지, 문서의 어느 위치인지</li><li>같은 기간·통화·정의끼리 숫자가 같은지</li><li>합계·기간·날짜가 맞는지</li><li>빠진 자료와 확인이 필요한 항목</li></ul></div>
    <div class="panel no-p"><h3>하지 않는 것</h3><ul>
      <li>투자 준비도 점수·등급·합격 여부를 매기지 않아요</li><li>투자 유치 가능성, 밸류, 매출·현금 전망을 계산하지 않아요</li><li>차이의 원인을 짐작하지 않아요</li><li>회계 적정성·법적 유효성을 판정하지 않아요</li></ul></div>
  </section>

  <section class="wrap steps"><h2 class="sec-t">진행 순서</h2><ol>
    <li><b>기본 정보</b><span>회사명·자료 기준일·통화</span></li>
    <li><b>24개 질문 답하기</b><span>직접 입력 · 자료 연결 · 담당자 요청 · 모름</span></li>
    <li><b>컨설턴트 검토</b><span>검토 파일을 주고받으며 확인 요청·수정 제안</span></li>
    <li><b>대표 승인 · PDF</b><span>투자자 요약본 + 근거 검토 상세본</span></li></ol></section>

  <section class="wrap srcs"><h2 class="sec-t">질문의 근거</h2><p class="sub">아래 공식 자료의 주제를 바탕으로 비코닉이 직접 작성한 질문이에요. 해당 기관이 질문을 승인·인증한 것은 아니에요. 전문가 검토·사용성 시험은 아직 하지 않았어요.</p>
    <div class="src-list">${Object.values(SMAP).map((s) => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener"><b>${s.id}</b><span>${esc(s.title)}</span><small>${esc(s.publisher)} · ${esc(s.kind)}</small></a>`).join('')}</div></section>

  <section class="wrap consult"><div class="cbox"><div><b>IR 자료, 같이 보면 더 빨라요</b><p>그로스벤처스는 중기부 인증 중소기업상담회사(제2025-684호)예요. 15년 경력 컨설턴트가 검토 파일을 받아 확인 요청·수정 제안을 남겨 드려요.</p></div>
    <div class="cbtn"><a class="btn primary" href="tel:070-4103-4177">070-4103-4177 전화</a><a class="btn ghost" href="mailto:start@gven.kr?subject=IR 자료 검토 문의">이메일 문의</a></div></div></section>
  </main>${footerHtml()}`;
}

// ───────────────────────── 기본 정보
function setupHtml() {
  const m = (st || blank()).meta;
  return `${headerHtml(false)}<main class="wrap narrow"><a class="back" href="#/">← 처음으로</a>
  <h1 class="pg-t">기본 정보를 알려 주세요</h1><p class="pg-s">보고서 표지와 모든 숫자 비교의 기준이 돼요. 나중에 바꿀 수 있어요.</p>
  <form id="setup" class="card form" novalidate>
    <label>회사명<input name="company" required maxlength="80" value="${esc(m.company)}" placeholder="예: 주식회사 비코닉"></label>
    <label>자료 기준일<input name="baseDate" type="date" required value="${esc(m.baseDate)}"><small>이 날짜 이후의 자료는 "확인 필요"로 표시돼요.</small></label>
    <div class="grid2"><label>기본 통화<select name="currency">${CURRENCIES.map((c) => `<option ${c === m.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>법인 국가<input name="country" maxlength="40" value="${esc(m.country)}"></label></div>
    <div class="grid2"><label>대표 이름<input name="ceo" maxlength="40" value="${esc(m.ceo)}" placeholder="보고서 작성·승인자"></label>
    <label>컨설턴트 이름 <i>(선택)</i><input name="consultant" maxlength="40" value="${esc(m.consultant)}" placeholder="검토자"></label></div>
    <label>독립성·이해관계 신고 <i>(선택, 컨설턴트 작성)</i><textarea name="disclosure" rows="2" maxlength="400" placeholder="예: 본 검토자는 회사 지분을 보유하지 않습니다.">${esc(m.disclosure)}</textarea></label>
    <p class="err" id="setup-err" role="alert"></p>
  </form></main>
  <div class="bottom-bar"><div class="wrap bb"><button class="btn primary lg block" data-act="setup-save">${st && st.meta.company ? '저장하기' : '시작하기'}</button></div></div>`;
}

// ───────────────────────── 작업 공간
function summaryHtml(ev) {
  const p = ev.progress; const pct = p.applicable ? Math.round((p.submitted / p.applicable) * 100) : 0;
  return `<div class="sum card"><div class="sum-top"><div><small>${esc(st.meta.synthetic ? '합성 예시 · ' : '')}자료 기준일 ${esc(st.meta.baseDate)}</small><h1>${esc(st.meta.company)}</h1></div><a class="link sm" href="#/setup">정보 수정</a></div>
  <div class="prog"><div class="prog-l"><span>제출</span><b>${p.submitted}<i>/${p.applicable}</i></b></div><div class="prog-l"><span>검토 완료</span><b>${p.reviewed}<i>/${p.applicable}</i></b></div><div class="prog-l"><span>확인할 항목</span><b>${ev.todo.filter((t) => t.type !== 'none').length}</b></div></div>
  <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="제출 진행률"><i style="width:${pct}%"></i></div>
  <small class="muted">업무 진행률이에요(적용 문항 중 제출·검토 건수). 투자 준비도나 사업성 점수가 아니에요.</small></div>`;
}
function tabsHtml(cur) {
  const t = [['todo', '지금 할 일'], ['list', '24문항'], ['evidence', '자료함'], ['report', '보고서']];
  return `<nav class="tabs" role="tablist">${t.map(([k, l]) => `<a role="tab" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}" href="#/work/${k}">${l}</a>`).join('')}</nav>`;
}
function workHtml(tab) {
  const ev = evaluate({ ...st, today: today() });
  let body = '';
  if (tab === 'todo') body = todoHtml(ev);
  else if (tab === 'list') body = listHtml(ev);
  else if (tab === 'evidence') body = evidenceHtml();
  else body = reportTabHtml(ev);
  return `${headerHtml(true)}<main class="wrap work">${st.meta.synthetic ? '<div class="syn-band">합성 예시 데이터예요. 실제 기업 자료가 아니에요.</div>' : ''}${summaryHtml(ev)}${tabsHtml(tab)}<div class="tab-body">${body}</div>
  <div class="tools"><span id="save-ind" aria-live="polite">${lastSaved ? `자동 저장됨 ${lastSaved.toTimeString().slice(0, 5)}` : '이 브라우저에 자동 저장돼요'}</span>
  <button class="link sm" data-act="export">검토 파일 내보내기</button><label class="link sm file">검토 파일 불러오기<input type="file" accept="application/json,.json" data-act="import" hidden></label><button class="link sm danger" data-act="reset">모두 지우기</button></div></main>${footerHtml()}`;
}

function todoHtml(ev) {
  // 기한 지남 표시는 오늘 날짜(한국시간)를 입력으로 받는다 — 엔진은 시계를 직접 읽지 않음(결정론)
  if (!ev.todo.length) return '<div class="empty card"><b>지금 확인할 항목이 없어요</b><p>보고서 탭에서 승인하고 PDF를 만들 수 있어요.</p></div>';
  const groups = TODO_ORDER.map((type) => [type, ev.todo.filter((t) => t.type === type)]).filter(([, l]) => l.length);
  return `<p class="hint">정해진 순서(차이 → 요청 → 재검토 → 미제출)로 보여 드려요. 위험도 순위가 아니에요.</p>${groups.map(([type, list]) => `<section class="tgroup"><h3>${TODO_LABEL[type]} <span>${list.length}</span></h3>
  ${list.map((t) => `<a class="trow card" href="#/q/${t.qid}"><span class="tq">${t.qid}</span><div><b>${esc(QMAP[t.qid].q)}</b><small>${esc(t.text)}</small></div><span class="arr" aria-hidden="true">›</span></a>`).join('')}</section>`).join('')}`;
}

function listHtml(ev) {
  return SECTIONS.map((s) => `<section class="qsec"><h3>${s.id}. ${s.title}</h3>${QUESTIONS.filter((q) => q.sec === s.id).map((q) => { const b = ev.byQ[q.id]; const a = st.answers[q.id] || {};
    return `<a class="qrow card" href="#/q/${q.id}"><span class="tq">${q.id}</span><div><b>${esc(q.q)}</b><span class="chips">${dChip(b.data)}${rChip(b.review)}${a.stale ? chip('stale', '재검토 필요') : ''}</span></div><span class="arr" aria-hidden="true">›</span></a>`; }).join('')}</section>`).join('');
}

// ───────────────────────── 자료함
function evidenceHtml() {
  const linkedQs = (eid) => QUESTIONS.filter((q) => ((st.answers[q.id] || {}).links || []).some((l) => l.eid === eid)).map((q) => q.id);
  return `<div class="card form"><h3>자료 등록</h3><p class="hint">파일은 업로드되지 않아요. 파일을 고르면 이 기기 안에서 이름·크기·SHA-256(원본 일치 확인용 지문)만 계산해 기록해요.</p>
  ${evidenceForm('ev')}<button class="btn primary" data-act="ev-add" data-scope="ev" ${st.role !== 'ceo' ? 'disabled' : ''}>자료 등록</button>${st.role !== 'ceo' ? '<p class="hint">자료 등록은 대표 화면에서 해요.</p>' : ''}</div>
  ${st.evidence.length ? st.evidence.map((e) => `<div class="card ev"><div class="ev-h"><span class="tq">${esc(e.id)}</span><div><b>${esc(e.name)}</b><small>${esc(e.kind)} · 작성일 ${esc(e.docDate || '미입력')} · v${e.version}${e.size ? ` · ${(e.size / 1024).toFixed(0)}KB` : ''}</small></div></div>
    <p class="mono sm">${e.sha256 ? `SHA-256 ${esc(e.sha256)}` : '파일 미선택 — 해시 없음'}</p><p class="sm">연결 문항: ${linkedQs(e.id).map((q) => `<a href="#/q/${q}">${q}</a>`).join(', ') || '없음'}</p>
    ${st.role === 'ceo' ? `<label class="link sm file">새 버전 파일로 교체<input type="file" data-act="ev-replace" data-eid="${esc(e.id)}" hidden></label>` : ''}
    <details class="sm"><summary>변경 기록</summary>${(e.history || []).map((h) => `<div>${esc(fmtDate(h.at))} · v${h.v} · ${esc(h.what)}</div>`).join('')}</details></div>`).join('') : '<div class="empty card"><b>아직 등록한 자료가 없어요</b><p>IR 덱, 매출원장, 재무제표, 주주명부부터 등록해 보세요.</p></div>'}`;
}
function evidenceForm(scope) {
  const d = draftNew[scope] || {};
  return `<div class="grid2"><label>자료명<input data-draft="${scope}" data-k="name" maxlength="120" value="${esc(d.name || '')}" placeholder="예: 2025 매출원장.xlsx"></label>
  <label>종류<select data-draft="${scope}" data-k="kind">${EVIDENCE_KINDS.map((k) => `<option ${k === d.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>
  <div class="grid2"><label>자료 작성일<input type="date" data-draft="${scope}" data-k="docDate" value="${esc(d.docDate || '')}"></label>
  <label>파일 선택 <i>(선택 · 업로드 안 됨)</i><input type="file" data-act="ev-file" data-scope="${scope}"></label></div>
  ${d.sha256 ? `<p class="mono sm">SHA-256 ${esc(d.sha256)} · ${(d.size / 1024).toFixed(0)}KB</p>` : ''}`;
}
async function hashFile(file) { const buf = await file.arrayBuffer(); return { sha256: await sha256Hex(new Uint8Array(buf)), size: file.size, fileName: file.name }; }

// ───────────────────────── 문항 화면
function fieldInput(q, f, a, ro) {
  const v = (a.fields || {})[f.k] ?? (f.type === 'currency' ? st.meta.currency : '');
  const attrs = `data-q="${q.id}" data-k="${f.k}" ${ro ? 'disabled' : ''} id="f-${q.id}-${f.k}"`;
  const lab = `${esc(f.label)}${f.optional ? ' <i>(선택)</i>' : ''}`;
  if (f.type === 'rows') return rowsInput(q, f, a, ro);
  if (f.type === 'check') return `<label class="chk"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
  if (f.type === 'select' || f.type === 'currency') { const opts = f.type === 'currency' ? CURRENCIES : f.options; return `<label for="f-${q.id}-${f.k}">${lab}<select ${attrs}><option value="">선택</option>${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`; }
  const type = { month: 'month', date: 'date' }[f.type] || 'text';
  const im = ['money', 'count', 'num'].includes(f.type) ? ' inputmode="decimal" autocomplete="off"' : '';
  const ph = f.type === 'money' ? ' placeholder="예: 120,000,000 또는 1.2억"' : f.type === 'count' ? ' placeholder="예: 248"' : f.type === 'month' ? ' placeholder="YYYY-MM"' : '';
  return `<label for="f-${q.id}-${f.k}">${lab}<input type="${type}" ${attrs}${im}${ph} value="${esc(v)}" maxlength="120"><small class="parsed" data-hint="${q.id}-${f.k}">${hintFor(f.type, v, (a.fields || {}).currency)}</small></label>`;
}
function hintFor(type, v, cur) {
  if (!['money', 'count', 'num'].includes(type) || !String(v ?? '').trim()) return '';
  const p = type === 'count' ? parseCount(v) : parseAmount(v);
  if (!p) return ''; if (p.err) return `<span class="bad">${esc(p.err)}</span>`;
  return `= ${esc(type === 'count' ? fmtUnit(p.v, '') .trim() : type === 'money' ? fmtUnit(p.v, cur || st.meta.currency) : fmtUnit(p.v, ''))}`;
}
function rowsInput(q, f, a, ro) {
  const rows = (a.fields || {})[f.k] || [];
  return `<fieldset class="rows"><legend>${esc(f.label)}</legend>${rows.map((r, i) => `<div class="row-card"><div class="row-h"><b>${i + 1}</b>${ro ? '' : `<button class="link sm danger" data-act="row-del" data-q="${q.id}" data-k="${f.k}" data-i="${i}" aria-label="${i + 1}번째 행 삭제">삭제</button>`}</div><div class="row-g">
  ${f.cols.map((c) => { const id = `r-${q.id}-${f.k}-${i}-${c.k}`; const attrs = `id="${id}" data-q="${q.id}" data-k="${f.k}" data-i="${i}" data-c="${c.k}" ${ro ? 'disabled' : ''}`;
    if (c.type === 'select') return `<label for="${id}">${esc(c.label)}<select ${attrs}><option value="">선택</option>${c.options.map((o) => `<option ${o === r[c.k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    return `<label for="${id}">${esc(c.label)}<input ${attrs} ${['money', 'count', 'num'].includes(c.type) ? 'inputmode="decimal"' : ''} value="${esc(r[c.k] ?? '')}" maxlength="120"></label>`; }).join('')}</div></div>`).join('')}
  ${ro ? '' : `<button class="btn ghost sm" data-act="row-add" data-q="${q.id}" data-k="${f.k}">+ 행 추가</button>`}</fieldset>`;
}
function liveHtml(qid) {
  const ev = evaluate(st); const b = ev.byQ[qid];
  const fs = b.findings;
  return { chips: `${dChip(b.data)}${rChip(b.review)}${(st.answers[qid] || {}).stale ? chip('stale', '재검토 필요') : ''}`,
    calc: fs.length ? fs.map((f) => `<div class="fd f-${f.result}"><div class="fd-h">${fChip(f.result)}<b>${esc(f.title)}</b><small>${esc(f.id)}</small></div><p>${f.fact.map(esc).join('<br>')}</p>${f.calc ? `<p class="mono sm">${esc(f.calc)}</p>` : ''}${f.request ? `<p class="sm req">확인 요청: ${esc(f.request)}</p>` : ''}</div>`).join('') : '' };
}

function questionHtml(qid) {
  const q = QMAP[qid]; if (!q) return null;
  const a = st.answers[qid] || { status: 'answer' }; const s = a.status || 'answer'; const ro = st.role !== 'ceo';
  const idx = Q_ORDER.findIndex((x) => x.id === qid); const prev = Q_ORDER[idx - 1]; const next = Q_ORDER[idx + 1];
  const sec = SECTIONS.find((x) => x.id === q.sec); const live = liveHtml(qid);
  const modes = [['answer', '답변하기'], ['request', '담당자에게 요청'], ['unknown', '아직 몰라요'], ['na', '해당 없음']];
  const evOpts = st.evidence.map((e) => `<option value="${esc(e.id)}">${esc(e.id)} ${esc(e.name)}</option>`).join('');
  let body = '';
  if (s === 'answer') {
    body = `<label for="t-${qid}">답변 <i>(대표 진술)</i><textarea id="t-${qid}" data-q="${qid}" data-k="__text" rows="3" maxlength="2000" ${ro ? 'disabled' : ''} placeholder="자료에 적힌 표현 그대로 쓰면 대조가 쉬워요">${esc(a.text || '')}</textarea></label>
    ${(q.fields || []).length ? `<div class="fields">${q.fields.map((f) => fieldInput(q, f, a, ro)).join('')}</div>` : ''}
    <div class="links"><h4>연결한 자료</h4>${(a.links || []).map((l, i) => { const e = st.evidence.find((x) => x.id === l.eid); return `<div class="lk"><span class="tq">${esc(l.eid)}</span><div><b>${esc(e ? e.name : '삭제된 자료')}</b><label class="inl">문서 내 위치<input data-q="${qid}" data-link="${i}" value="${esc(l.loc || '')}" placeholder="예: 11쪽, 합계 시트 B42" maxlength="80" ${ro ? 'disabled' : ''}></label></div>${ro ? '' : `<button class="link sm danger" data-act="link-del" data-q="${qid}" data-i="${i}">해제</button>`}</div>`; }).join('') || '<p class="hint">아직 연결한 자료가 없어요. 자료와 문서 내 위치를 남기면 "원문 연결 확인" 상태가 돼요.</p>'}
    ${ro ? '' : `<div class="lk-add">${st.evidence.length ? `<select id="link-sel" aria-label="연결할 자료"><option value="">자료함에서 고르기</option>${evOpts}</select><button class="btn ghost sm" data-act="link-add" data-q="${qid}">연결</button>` : ''}
      <details class="newev"${(draftNew.q && (draftNew.q.name || draftNew.q.sha256)) ? ' open' : ''}><summary>새 자료 등록하고 연결</summary>${evidenceForm('q')}<button class="btn ghost sm" data-act="ev-add" data-scope="q" data-q="${qid}">등록하고 연결</button></details></div>`}</div>`;
  } else if (s === 'request') {
    body = `<div class="grid2"><label>담당자<input data-q="${qid}" data-k="__reqTo" value="${esc(a.reqTo || '')}" maxlength="40" placeholder="예: 재무팀장" ${ro ? 'disabled' : ''}></label><label>기한<input type="date" data-q="${qid}" data-k="__reqDue" value="${esc(a.reqDue || '')}" ${ro ? 'disabled' : ''}></label></div>
    <label>요청 메모<textarea data-q="${qid}" data-k="__reqNote" rows="2" maxlength="400" ${ro ? 'disabled' : ''}>${esc(a.reqNote || '')}</textarea></label>
    <button class="btn ghost sm" data-act="copy-req" data-q="${qid}">요청 문구 복사</button><p class="hint">메신저·메일에 붙여 넣어 담당자에게 보내세요. 자료를 받으면 "답변하기"로 바꿔 연결해요.</p>`;
  } else if (s === 'unknown') {
    body = '<p class="hint">"아직 몰라요"는 미제출로 보고서에 그대로 표시돼요. 숨기지 않아요. 자료가 있는 사람이 있다면 "담당자에게 요청"을 써 보세요.</p>';
  } else {
    body = `<label>해당 없는 이유 <i>(필수)</i><textarea data-q="${qid}" data-k="__naReason" rows="2" maxlength="400" ${ro ? 'disabled' : ''} placeholder="예: 외부 오픈소스를 쓰지 않아요">${esc(a.naReason || '')}</textarea></label>
    <p class="hint">${a.naApproved ? `검토자 승인: ${esc(a.naApprovedBy || '')} (${esc(fmtDate(a.naApprovedAt))})` : '컨설턴트(검토자)가 사유를 승인해야 "적용 제외 승인"이 돼요.'}</p>`;
  }
  const sugg = (a.suggestions || []).map((x) => `<div class="sg ${x.status}"><div><b>${esc(x.by)}</b> <small>${esc(fmtDate(x.at))}</small></div><p>${esc(x.text)}</p>${x.proposed ? `<p class="prop">제안 문장: ${esc(x.proposed)}</p>` : ''}
    ${x.status === 'open' ? (st.role === 'ceo' ? `<div class="sg-act"><button class="btn primary sm" data-act="sg-accept" data-q="${qid}" data-id="${esc(x.id)}">수락${x.proposed ? '(문장 반영)' : ''}</button><input id="rj-${esc(x.id)}" placeholder="반려 사유(필수)" maxlength="200"><button class="btn ghost sm" data-act="sg-reject" data-q="${qid}" data-id="${esc(x.id)}">반려</button></div>` : '<small>대표 응답 대기</small>') : `<small>${x.status === 'accepted' ? '대표 수락' : `대표 반려 — ${esc(x.reason || '')}`}</small>`}</div>`).join('');
  const reviewPanel = st.role === 'consultant' ? `<div class="card rv"><h3>컨설턴트 검토</h3><p class="hint">대표의 답변을 직접 고치지 않아요. 제안·요청을 남기면 대표가 수락하거나 사유를 남겨 반려해요.</p>
    <label>수정 제안<textarea id="sg-text" rows="2" maxlength="600" placeholder="무엇을 왜 바꾸면 좋은지"></textarea></label><label>제안 문장 <i>(선택)</i><textarea id="sg-prop" rows="2" maxlength="2000"></textarea></label><button class="btn ghost sm" data-act="sg-add" data-q="${qid}">제안 남기기</button>
    <hr><label>확인 요청<input id="ask-note" maxlength="300" placeholder="예: 출원서 1쪽을 연결해 주세요"></label><button class="btn ghost sm" data-act="ask" data-q="${qid}">확인 요청 보내기</button>
    <hr><fieldset class="scope"><legend>검토 범위</legend>${['원문 대조', '수치 재계산', '서류 존재 확인'].map((x) => `<label class="chk"><input type="checkbox" name="scope" value="${x}"> ${x}</label>`).join('')}</fieldset><button class="btn primary sm" data-act="reviewed" data-q="${qid}">검토 완료로 표시</button>
    ${s === 'na' && !a.naApproved ? `<hr><button class="btn primary sm" data-act="na-approve" data-q="${qid}" ${(a.naReason || '').trim() ? '' : 'disabled'}>적용 제외 승인</button>` : ''}</div>`
    : (a.review === 'asked' ? `<div class="card rv ask"><h3>컨설턴트 확인 요청</h3><p>${esc(a.askNote || '')}</p><label>답변 메모<input id="author-note" maxlength="300" placeholder="무엇을 확인·보완했는지"></label><button class="btn primary sm" data-act="author" data-q="${qid}">확인했어요</button></div>` : '');
  return `${headerHtml(true)}<main class="wrap narrow qpage"><a class="back" href="#/work/list">← 24문항</a>
  ${st.meta.synthetic ? '<div class="syn-band">합성 예시 데이터예요.</div>' : ''}
  <p class="q-meta">${q.id} · ${esc(sec.title)}${q.plan ? ' · 경영진 제출 계획' : ''}</p><h1 class="q-t">${esc(q.q)}</h1><div class="chips" id="q-chips">${live.chips}</div>
  <details class="acc" open><summary>왜 묻나요?</summary><p>${esc(q.why)}</p><ul class="srcs-q">${q.src.map(([sid, loc]) => `<li><a href="${esc(SMAP[sid].url)}" target="_blank" rel="noopener">${sid} ${esc(SMAP[sid].title)}</a> — ${esc(loc)}<br><small>${esc(SMAP[sid].limit)}</small></li>`).join('')}</ul></details>
  <details class="acc"><summary>어떤 자료인가요?</summary><p>${q.ex.map(esc).join(' · ')}</p><p class="sm"><b>앱의 확인 방법</b> ${esc(q.check)}</p>${q.expert ? `<p class="sm">${esc(q.expert)} 분야 전문가 검토가 필요한 항목이에요. 이 앱은 자료 존재·범위만 확인해요.</p>` : ''}</details>
  <details class="acc"><summary>자료가 없어요</summary><p>괜찮아요. 담당자가 있으면 "담당자에게 요청", 아직 모르면 "아직 몰라요"를 고르세요. 미제출도 보고서에 그대로 표시돼요. 해당 사업을 하지 않으면 "해당 없음"과 이유를 남겨 주세요.</p></details>
  <div class="card ans"><div class="seg" role="radiogroup" aria-label="답하는 방법">${modes.map(([k, l]) => `<button role="radio" aria-checked="${k === s}" class="${k === s ? 'on' : ''}" data-act="mode" data-q="${qid}" data-m="${k}" ${ro ? 'disabled' : ''}>${l}</button>`).join('')}</div>
  ${ro ? '<p class="hint">컨설턴트 화면에서는 답변을 읽기만 할 수 있어요.</p>' : ''}${body}</div>
  <div id="live-calc" class="live">${live.calc}</div>
  ${a.stale ? `<div class="card stale-box"><b>재검토 필요</b><p>${esc(a.staleNote || '')}</p></div>` : ''}
  ${sugg ? `<div class="card"><h3>수정 제안</h3>${sugg}</div>` : ''}${reviewPanel}
  <details class="acc"><summary>수정 기록 (${(a.history || []).length})</summary>${(a.history || []).slice().reverse().map((h) => `<div class="sm">${esc(fmtDate(h.at))} · ${esc(h.by)} · ${esc(h.what)}</div>`).join('') || '<p class="sm">기록 없음</p>'}</details>
  </main><div class="bottom-bar"><div class="wrap bb">${prev ? `<a class="btn ghost" href="#/q/${prev.id}">‹ ${prev.id}</a>` : '<span></span>'}<span id="save-ind" class="sm muted" aria-live="polite">${lastSaved ? `자동 저장됨 ${lastSaved.toTimeString().slice(0, 5)}` : ''}</span>${next ? `<a class="btn primary" href="#/q/${next.id}">다음 · ${next.id} ›</a>` : '<a class="btn primary" href="#/work/report">보고서로 ›</a>'}</div></div>`;
}

// ───────────────────────── 보고서 탭
function reportTabHtml(ev) {
  const unresolved = QUESTIONS.filter((q) => ['none', 'mismatch', 'na_wait'].includes(ev.byQ[q.id].data) || ev.byQ[q.id].review === 'asked');
  const last = st.snapshots[st.snapshots.length - 1];
  const vers = st.snapshots.slice().reverse().map((s) => `<div class="card ver"><div class="ver-h"><b>v${s.version}</b><span>${esc(s.reportId)}</span></div><small>${esc(s.approvedBy)} 승인 · ${esc(fmtDate(s.approvedAt))}</small><p class="mono sm">SHA-256 ${esc(s.hash)}</p>
    <div class="ver-act"><button class="btn primary sm" data-act="print" data-kind="brief" data-v="${s.version}">투자자 요약본 PDF</button><button class="btn ghost sm" data-act="print" data-kind="detail" data-v="${s.version}">근거 검토 상세본 PDF</button></div></div>`).join('');
  return `<div class="card"><h3>보고서 옵션</h3><div class="grid2"><label>언어<select id="rp-lang"><option value="ko">한국어</option><option value="en">English (용어만 영문, 서술은 한국어 원문)</option></select></label>
  <label>공유 범위<select id="rp-mask"><option value="0">내부 검토용(마스킹 없음)</option><option value="1">투자자 공유용(주주명·담당자명 마스킹)</option></select></label></div>
  <p class="hint">PDF는 브라우저 인쇄 창에서 "PDF로 저장"을 골라 만들어요. 파일은 대표님 기기에만 저장되고, 외부로 보내지 않아요.</p></div>
  <div class="card"><h3>승인 전 미리보기</h3><p class="hint">현재 입력으로 만든 초안이에요. "승인 전 초안" 표시가 붙어요.</p><div class="ver-act"><button class="btn ghost sm" data-act="print" data-kind="brief" data-v="draft">요약본 초안</button><button class="btn ghost sm" data-act="print" data-kind="detail" data-v="draft">상세본 초안</button></div></div>
  <div class="card approve"><h3>대표 승인하고 보고서 고정</h3>
  <p>미해결 항목 <b>${unresolved.length}건</b>${unresolved.length ? ` (${unresolved.map((q) => q.id).join(', ')})` : ''}은 숨기지 않고 보고서에 그대로 표시돼요.</p>
  ${last ? `<p class="hint">최근 승인본 v${last.version} 이후 변경된 문항: ${QUESTIONS.filter((q) => (st.answers[q.id] || {}).stale).map((q) => q.id).join(', ') || '없음'}</p>` : ''}
  ${st.role === 'ceo' ? `<label class="chk"><input type="checkbox" id="ap1"> 미해결 항목이 보고서에 표시된다는 걸 확인했어요</label>
  <label class="chk"><input type="checkbox" id="ap2"> 대표 승인은 자료의 진실성을 외부에서 인증하는 것이 아니라는 걸 이해했어요</label>
  <label class="chk"><input type="checkbox" id="ap3"> 보고서를 외부에 전달할 때 포함되는 정보(공유 범위)를 확인했어요</label>
  <button class="btn primary lg block" data-act="approve">v${st.snapshots.length + 1} 승인하고 고정하기</button>` : '<p class="hint">승인은 대표 화면에서만 할 수 있어요.</p>'}</div>
  ${vers ? `<h3 class="sub-t">승인된 버전</h3>${vers}` : ''}`;
}

// ───────────────────────── 스냅샷·인쇄
async function makeSnapshot() {
  const ev = evaluate(st); const version = st.snapshots.length + 1;
  const state = JSON.parse(JSON.stringify({ meta: st.meta, answers: st.answers, evidence: st.evidence }));
  const hash = await sha256Hex(canonical({ state, registry: REGISTRY_VERSION, engine: ENGINE_VERSION, version }));
  const d = st.meta.baseDate.replaceAll('-', '');
  return { version, reportId: `IR-${d}-${hash.slice(0, 8).toUpperCase()}`, hash, approvedAt: nowIso(), approvedBy: st.meta.ceo || '대표', appVersion: APP.version,
    state, findings: ev.findings, byQ: ev.byQ, history: st.snapshots.map((s) => ({ version: s.version, approvedAt: s.approvedAt, approvedBy: s.approvedBy, hash: s.hash })) };
}
function draftSnapshot() {
  const ev = evaluate(st);
  return { draft: true, version: st.snapshots.length + 1, reportId: `IR-${st.meta.baseDate.replaceAll('-', '')}-DRAFT`, hash: '', approvedAt: '', approvedBy: '', appVersion: APP.version,
    state: JSON.parse(JSON.stringify({ meta: st.meta, answers: st.answers, evidence: st.evidence })), findings: ev.findings, byQ: ev.byQ, history: st.snapshots.map((s) => ({ version: s.version, approvedAt: s.approvedAt, approvedBy: s.approvedBy, hash: s.hash })) };
}
export function printReport(snap, kind, opts) {
  const pr = $('#print-root');
  const html = kind === 'brief' ? renderBrief(snap, opts) : renderDetail(snap, opts);
  const label = `${snap.reportId} v${snap.version}${snap.draft ? ' 초안' : ''} · 대외비`;
  pr.innerHTML = `<style>@page{@bottom-left{content:"${label.replace(/"/g, '')}";font-size:8pt;color:#6b7684;font-family:'Pretendard Variable','Pretendard',sans-serif}@bottom-right{content:counter(page) " / " counter(pages);font-size:8pt;color:#6b7684;font-family:'Pretendard Variable','Pretendard',sans-serif}}</style>${html}`;
  const safe = (st.meta.company || 'company').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  const prevTitle = document.title;
  document.title = `BECONIC_IR_${kind === 'brief' ? 'Investor_Brief' : 'Evidence_Review'}_${safe}_v${snap.version}${snap.draft ? '_DRAFT' : ''}`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); document.title = prevTitle; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  if (!window.__noPrint) window.print();
}

// ───────────────────────── 렌더
function render() {
  const [r0, r1] = route();
  if (!st && !['', 'setup'].includes(r0)) { go(''); return; }
  let html;
  if (r0 === '' || r0 === 'home') html = homeHtml();
  else if (r0 === 'setup') html = setupHtml();
  else if (r0 === 'work') html = workHtml(['todo', 'list', 'evidence', 'report'].includes(r1) ? r1 : 'todo');
  else if (r0 === 'q') html = questionHtml(r1) || workHtml('list');
  else html = homeHtml();
  root().innerHTML = html;
  document.body.dataset.route = r0 || 'home';
}

// ───────────────────────── 이벤트
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };
const fieldOf = (qid, k) => (QMAP[qid].fields || []).find((f) => f.k === k);

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.draft) { (draftNew[el.dataset.draft] ||= {})[el.dataset.k] = el.value; return; }
  const qid = el.dataset.q; if (!qid || !st || st.role !== 'ceo') return;
  const a = ans(qid);
  if (el.dataset.link !== undefined) { a.links[Number(el.dataset.link)].loc = el.value; }
  else if (el.dataset.c) { const rows = (a.fields[el.dataset.k] ||= []); rows[Number(el.dataset.i)][el.dataset.c] = el.value; }
  else if (el.dataset.k === '__text') a.text = el.value;
  else if (el.dataset.k?.startsWith('__')) a[el.dataset.k.slice(2)] = el.value;
  else if (el.dataset.k) {
    a.fields[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    const f = fieldOf(qid, el.dataset.k); const h = document.querySelector(`[data-hint="${qid}-${el.dataset.k}"]`);
    if (f && h) h.innerHTML = hintFor(f.type, el.value, a.fields.currency);
  } else return;
  const live = liveHtml(qid); const c = $('#q-chips'), lc = $('#live-calc');
  if (c) c.innerHTML = live.chips; if (lc) lc.innerHTML = live.calc;
  commit();
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.act === 'ev-file' && el.files[0]) { const d = (draftNew[el.dataset.scope] ||= {}); Object.assign(d, await hashFile(el.files[0])); if (!d.name) d.name = el.files[0].name; render(); return; }
  if (el.dataset.act === 'ev-replace' && el.files[0]) { await replaceEvidence(el.dataset.eid, el.files[0]); return; }
  if (el.dataset.act === 'import' && el.files[0]) { await importFile(el.files[0]); return; }
  const qid = el.dataset.q; if (!qid || !st || st.role !== 'ceo') return;
  const lab = el.dataset.c ? `${QMAP[qid].fields.find((f) => f.k === el.dataset.k)?.label} ${Number(el.dataset.i) + 1}행` : el.dataset.link !== undefined ? '자료 위치' : el.dataset.k === '__text' ? '답변' : (fieldOf(qid, el.dataset.k)?.label || el.dataset.k?.replace('__', ''));
  touched(qid, `${lab} 수정`); commit(true);
  const live = liveHtml(qid); const c = $('#q-chips'); if (c) c.innerHTML = live.chips;
});

async function replaceEvidence(eid, file) {
  const e = st.evidence.find((x) => x.id === eid); if (!e) return;
  const h = await hashFile(file);
  if (h.sha256 === e.sha256) { toast('같은 파일이에요. 버전을 올리지 않았어요.'); return; }
  e.version += 1; e.sha256 = h.sha256; e.size = h.size; e.history = [...(e.history || []), { at: nowIso(), v: e.version, what: `새 버전 파일(${h.fileName})로 교체` }];
  for (const q of QUESTIONS) if ((st.answers[q.id]?.links || []).some((l) => l.eid === eid)) touched(q.id, `연결 자료 ${eid}가 v${e.version}로 교체됨`);
  commit(true); render(); toast(`${eid}를 v${e.version}로 바꿨어요. 연결 문항은 재검토 대상이에요.`);
}
async function importFile(file) {
  try {
    const data = validate(JSON.parse(await file.text()));
    if (!data) { toast('비코닉 IR 진단 검토 파일이 아니에요.'); return; }
    if (st && st.meta.company && !confirm(`지금 내용을 "${data.meta.company}" 검토 파일로 바꿀까요? 현재 내용은 사라져요. 먼저 내보내기를 권해요.`)) return;
    const keepRole = st ? st.role : 'ceo'; st = data; st.role = keepRole; commit(true); go('work/todo'); toast('검토 파일을 불러왔어요.');
  } catch { toast('파일을 읽을 수 없어요.'); }
}
function exportFile() {
  const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `BECONIC_IR_검토파일_${(st.meta.company || 'company').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)}_${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('검토 파일을 내려받았어요. 증빙 원본 파일은 들어 있지 않아요.');
}
function addEvidence(scope) {
  const d = draftNew[scope] || {};
  if (!(d.name || '').trim()) { toast('자료명을 입력해 주세요.'); return null; }
  const id = nextEvidenceId(st);
  st.evidence.push({ id, name: d.name.trim().slice(0, 120), kind: d.kind || EVIDENCE_KINDS[0], docDate: d.docDate || '', sha256: d.sha256 || '', size: d.size || 0, version: 1, addedAt: nowIso(), history: [{ at: nowIso(), v: 1, what: d.sha256 ? `등록(${d.fileName || ''}, 해시 계산)` : '등록(파일 미선택)' }] });
  draftNew[scope] = {}; return id;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act; const qid = b.dataset.q;
  switch (act) {
    case 'new': if (st && st.meta.company && !confirm('저장된 내용을 지우고 새로 시작할까요? 먼저 검토 파일로 내보내기를 권해요.')) return; st = null; go('setup'); break;
    case 'resume': go('work/todo'); break;
    case 'sample': if (st && st.meta.company && !st.meta.synthetic && !confirm('합성 예시를 열면 지금 내용이 바뀌어요. 계속할까요?')) return; st = sampleState(); commit(true); go('work/todo'); break;
    case 'setup-save': {
      const f = new FormData($('#setup')); const company = String(f.get('company') || '').trim(); const baseDate = String(f.get('baseDate') || '');
      if (!company || !/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) { $('#setup-err').textContent = '회사명과 자료 기준일을 입력해 주세요.'; return; }
      st ||= blank();
      Object.assign(st.meta, { company, baseDate, currency: String(f.get('currency')), country: String(f.get('country') || '').trim(), ceo: String(f.get('ceo') || '').trim(), consultant: String(f.get('consultant') || '').trim(), disclosure: String(f.get('disclosure') || '').trim() });
      commit(true); go('work/todo'); break;
    }
    case 'role':
      st.role = st.role === 'ceo' ? 'consultant' : 'ceo'; commit(true); render();
      toast(st.role === 'consultant' ? '컨설턴트 화면이에요. 같은 기기에서 역할만 바꾸는 방식이라 실제 권한 분리는 아니에요.' : '대표 화면이에요.'); break;
    case 'mode': { const a = ans(qid); if (a.status === b.dataset.m) return; a.status = b.dataset.m; if (b.dataset.m !== 'na') { a.naApproved = false; } touched(qid, `답하는 방법: ${b.textContent}`); commit(true); render(); break; }
    case 'row-add': { const a = ans(qid); (a.fields[b.dataset.k] ||= []).push({}); commit(true); render(); break; }
    case 'row-del': { const a = ans(qid); a.fields[b.dataset.k].splice(Number(b.dataset.i), 1); touched(qid, '행 삭제'); commit(true); render(); break; }
    case 'link-add': { const v = $('#link-sel')?.value; if (!v) { toast('연결할 자료를 골라 주세요.'); return; } const a = ans(qid); if (a.links.some((l) => l.eid === v)) { toast('이미 연결된 자료예요.'); return; } a.links.push({ eid: v, loc: '' }); touched(qid, `자료 ${v} 연결`); commit(true); render(); toast('연결했어요. 문서 내 위치(쪽·셀)를 적어 주세요.'); break; }
    case 'link-del': { const a = ans(qid); const [l] = a.links.splice(Number(b.dataset.i), 1); touched(qid, `자료 ${l.eid} 연결 해제`); commit(true); render(); break; }
    case 'ev-add': { const id = addEvidence(b.dataset.scope); if (!id) return; if (qid) { ans(qid).links.push({ eid: id, loc: '' }); touched(qid, `새 자료 ${id} 등록·연결`); } commit(true); render(); toast(`${id}로 등록했어요.`); break; }
    case 'copy-req': { const a = ans(qid); const q = QMAP[qid];
      const txt = `[IR 자료 요청] ${st.meta.company}\n문항 ${qid}: ${q.q}\n필요한 자료: ${q.ex.join(', ')}\n${a.reqNote ? `메모: ${a.reqNote}\n` : ''}${a.reqDue ? `기한: ${a.reqDue}\n` : ''}자료 기준일: ${st.meta.baseDate}`;
      try { await navigator.clipboard.writeText(txt); toast('요청 문구를 복사했어요.'); } catch { prompt('아래 문구를 복사해 주세요', txt); } break; }
    case 'sg-add': { const text = $('#sg-text').value.trim(); if (!text) { toast('제안 내용을 입력해 주세요.'); return; } const a = ans(qid); a.suggestions = [...(a.suggestions || []), { id: `S${Date.now().toString(36)}`, by: who(), at: nowIso(), text: text.slice(0, 600), proposed: $('#sg-prop').value.trim().slice(0, 2000), status: 'open' }]; hist(qid, '수정 제안'); commit(true); render(); toast('제안을 남겼어요. 대표가 수락하거나 반려해요.'); break; }
    case 'sg-accept': { const a = ans(qid); const s = a.suggestions.find((x) => x.id === b.dataset.id); s.status = 'accepted'; s.decidedAt = nowIso(); if (s.proposed) { a.text = s.proposed; } touched(qid, `컨설턴트 제안 수락${s.proposed ? '(문장 반영)' : ''}`); commit(true); render(); break; }
    case 'sg-reject': { const reason = $(`#rj-${CSS.escape(b.dataset.id)}`).value.trim(); if (!reason) { toast('반려 사유를 입력해 주세요.'); return; } const a = ans(qid); const s = a.suggestions.find((x) => x.id === b.dataset.id); s.status = 'rejected'; s.reason = reason.slice(0, 200); s.decidedAt = nowIso(); hist(qid, `컨설턴트 제안 반려: ${s.reason}`); commit(true); render(); break; }
    case 'ask': { const note = $('#ask-note').value.trim(); if (!note) { toast('무엇을 확인할지 적어 주세요.'); return; } const a = ans(qid); a.review = 'asked'; a.askNote = note.slice(0, 300); hist(qid, `확인 요청: ${a.askNote}`); commit(true); render(); break; }
    case 'author': { const a = ans(qid); a.review = 'author'; a.authorNote = ($('#author-note').value || '').trim().slice(0, 300); hist(qid, `작성자 확인${a.authorNote ? `: ${a.authorNote}` : ''}`); commit(true); render(); break; }
    case 'reviewed': { const scope = [...document.querySelectorAll('input[name=scope]:checked')].map((x) => x.value); if (!scope.length) { toast('검토 범위를 하나 이상 골라 주세요.'); return; } const a = ans(qid); a.review = 'reviewer'; a.reviewScope = scope; a.reviewedBy = who(); a.reviewedAt = nowIso(); a.stale = false; a.staleNote = ''; hist(qid, `검토자 검토(${scope.join(', ')})`); commit(true); render(); break; }
    case 'na-approve': { const a = ans(qid); a.naApproved = true; a.naApprovedBy = who(); a.naApprovedAt = nowIso(); hist(qid, '적용 제외 승인'); commit(true); render(); break; }
    case 'approve': {
      if (!['ap1', 'ap2', 'ap3'].every((id) => $(`#${id}`).checked)) { toast('세 가지 확인 항목을 모두 체크해 주세요.'); return; }
      const snapVersion = st.snapshots.length + 1;
      for (const q of QUESTIONS) { const a = st.answers[q.id]; if (a && a.review === 'reviewer') { a.review = 'approved'; hist(q.id, `대표 승인(v${snapVersion})`); } if (a) { a.approvedIn = snapVersion; a.stale = false; a.staleNote = ''; } }
      const snap = await makeSnapshot(); st.snapshots.push(snap); commit(true); render(); toast(`v${snap.version}을 고정했어요. 이제 PDF를 만들 수 있어요.`); break;
    }
    case 'print': {
      const opts = { lang: $('#rp-lang')?.value || 'ko', mask: $('#rp-mask')?.value === '1' };
      const snap = b.dataset.v === 'draft' ? draftSnapshot() : st.snapshots.find((s) => String(s.version) === b.dataset.v);
      if (snap) printReport(snap, b.dataset.kind, opts); break;
    }
    case 'export': exportFile(); break;
    case 'reset': if (confirm('이 브라우저에 저장된 IR 진단 내용을 모두 지울까요? 되돌릴 수 없어요.')) { clear(); st = null; go(''); } break;
  }
});

render();
window.__IR = { get state() { return st; }, evaluate: () => evaluate(st), APP };
