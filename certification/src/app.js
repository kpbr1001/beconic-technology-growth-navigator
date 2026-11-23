// 앱 상태·라우팅·이벤트(v2 · 3단계). 입력값은 메모리(state)에만 있다 — 저장소·서버 전송 없음.
import { loadData } from './data.js';
import { buildReport, APP_VERSION } from './model.js';
import { evalExpr } from './conditions.js';
import { parseDate } from './engine.js';
import * as V from './views.js';
import { renderPrint } from './print.js';
import { SITE } from './site.js';

function todayKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

const st = {
  data: null,
  answers: {},
  selected: [],
  docStatus: {}, // 요건 체크(자가 확인) 응답: '인증ID:항목ID' → have/none/unknown
  asOf: todayKST(),
  f: { region: 'domestic', field: 'all', purpose: null, q: '' },
  visitedAnswer: false,
  edited: false,
};
// QA용 읽기 전용 노출(입력값은 이 창 메모리 안에만 존재)
window.__beconic = { get state() { return JSON.parse(JSON.stringify({ answers: st.answers, selected: st.selected, docStatus: st.docStatus, asOf: st.asOf })); } };

const $app = () => document.getElementById('app');
const live = (msg) => { const el = document.getElementById('live'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); };
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}
const report = () => buildReport(st.data, { answers: st.answers, selected: st.selected, docStatus: st.docStatus, asOf: st.asOf, flow: 'B' });

// ── 라우팅 ────────────────────────────────────────────────
const ALIAS = { explore: 'select', a: 'answer', questions: 'answer', docs: 'result', roadmap: 'result', compare: 'select' };
function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, qs] = h.split('?');
  const parts = p.split('/').filter(Boolean);
  if (parts[0] && ALIAS[parts[0]]) parts.splice(0, parts.length, ALIAS[parts[0]]);
  return { parts, params: new URLSearchParams(qs || '') };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function progress() {
  const app = $app();
  const qs = [...app.querySelectorAll('form[data-form="answer"] .q')].filter((el) => !el.hidden && !el.querySelector('.q-text'));
  let unknown = 0;
  const done = qs.filter((el) => {
    const checked = el.querySelector('input:checked');
    const date = el.querySelector('input[type="date"]');
    if (checked && checked.value === 'unknown') unknown += 1;
    return checked || (date && date.value);
  }).length;
  return { total: qs.length, done, unknown };
}

function render() {
  if (!st.data) return;
  const { parts, params } = parseRoute();
  const D = st.data;
  let html; let title = 'BECONIC | 기업인증 진단';
  const [a, b] = parts;
  let after = null;
  try {
    if (!a) html = V.home(D);
    else if (a === 'select') {
      if (params.has('q')) st.f.q = params.get('q').slice(0, 60);
      html = V.selectView(st, D); title = '1 인증 고르기 | BECONIC';
    } else if (a === 'answer') {
      if (!st.selected.length) html = V.noStateView();
      else { st.visitedAnswer = true; html = V.answerView(st, D, report(), { total: 0, done: 0, unknown: 0 }); title = '2 우리 회사 답하기 | BECONIC'; after = refreshAnswerSide; }
    } else if (a === 'result') {
      if (!st.selected.length) html = V.noStateView();
      else { st.visitedAnswer = true; html = V.resultView(st, D, report()); title = '3 결과·할 일 | BECONIC'; }
    } else if (a === 'report') {
      if (!st.selected.length) html = V.noStateView();
      else { html = V.reportView(renderPrint(D, report(), { edited: st.edited }), st.edited); title = '보고서 | BECONIC'; }
    } else if (a === 'scheme') { html = V.schemeDetail(st, D, b); title = `${(D.schemeMap[b] || {}).name_ko || '인증'} | BECONIC`; }
    else if (a === 'privacy') html = V.privacyView();
    else if (a === 'about-data') html = V.aboutDataView(D);
    else html = V.errorView('페이지를 찾지 못했어요');
  } catch (e) {
    console.error('[BECONIC] 화면 오류', e && e.message); // 입력값은 로그에 남기지 않음
    html = V.errorView('화면을 그리는 중 문제가 생겼어요', '#/', '처음으로', '<p class="lead">입력값을 확인하고 다시 시도해 주세요.</p>');
  }
  const app = $app();
  app.innerHTML = html;
  app.setAttribute('aria-busy', 'false');
  document.title = title;
  applyVisibility();
  if (after) after();
  window.scrollTo(0, 0);
  const h1 = app.querySelector('h1');
  if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
}

// ── 1단계: 고르기 ──────────────────────────────────────────
function refreshSelect() {
  const D = st.data;
  const cards = document.getElementById('cards'); if (cards) cards.innerHTML = V.cardsHTML(st, D);
  const tray = document.getElementById('tray'); if (tray) tray.innerHTML = V.trayHTML(st, D);
  const mbar = document.getElementById('mbar'); if (mbar) mbar.innerHTML = V.mbarSelectHTML(st, D);
  document.querySelectorAll('[data-act="region"]').forEach((el) => el.setAttribute('aria-pressed', String(st.f.region === el.dataset.v && !st.f.q)));
  document.querySelectorAll('[data-act="field"]').forEach((el) => el.setAttribute('aria-pressed', String(st.f.field === el.dataset.v)));
  document.querySelectorAll('[data-act="purpose"]').forEach((el) => el.setAttribute('aria-pressed', String(st.f.purpose === el.dataset.v)));
}
function togglePick(id) {
  const D = st.data;
  if (!D.schemeMap[id]) return false;
  if (st.selected.includes(id)) { st.selected = st.selected.filter((x) => x !== id); live(`${D.schemeMap[id].name_ko} 선택을 뺐어요.`); return true; }
  if (st.selected.length >= V.MAX_SELECT) { toast(`최대 ${V.MAX_SELECT}개까지 고를 수 있어요. 하나를 빼고 다시 골라 주세요.`); return false; }
  st.selected.push(id); live(`${D.schemeMap[id].name_ko}을(를) 골랐어요. ${st.selected.length}개 선택.`);
  return true;
}

// ── 2단계: 답하기 ──────────────────────────────────────────
function applyVisibility() {
  const app = $app();
  app.querySelectorAll('.q[data-show]').forEach((el) => {
    el.hidden = !evalExpr(el.dataset.show, st.answers, { schemes: st.selected });
  });
}
function refreshAnswerSide() {
  const D = st.data;
  const R = report(); const prog = progress();
  const pv = document.getElementById('preview'); if (pv) pv.innerHTML = V.previewHTML(st, D, R, prog);
  const mbar = document.getElementById('mbar'); if (mbar) mbar.innerHTML = V.mbarAnswerHTML(R, prog);
}
function refreshDynamic() {
  const q = st.data.questionMap.ven_rd_ratio;
  const box = document.getElementById('dyn-ven_rd_ratio');
  if (q && box) {
    const before = box.innerHTML; const html = V.dynRatioHTML(q, st, st.data);
    if (before !== html) box.innerHTML = html;
  }
}
function setErr(qid, msg) {
  const el = document.getElementById(`q-${qid}-err`);
  if (!el) return;
  el.hidden = !msg; el.textContent = msg || '';
}
function markAnswered(qid) {
  const fs = document.querySelector(`.q[data-qid="${CSS.escape(qid)}"]`);
  if (fs) { const v = st.answers[qid]; fs.classList.toggle('answered', v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)); }
}
function readChoice(input) {
  const qid = input.name; const q = st.data.questionMap[qid];
  if (!q) return;
  if (q.data_type === 'multi') {
    const all = [...document.querySelectorAll(`input[name="${CSS.escape(qid)}"]`)];
    let vals = all.filter((x) => x.checked).map((x) => x.value);
    // '모름'과 다른 값을 함께 고르면 마지막으로 누른 쪽만 남긴다
    if (vals.length > 1 && vals.includes('unknown')) {
      vals = input.value === 'unknown' && input.checked ? ['unknown'] : vals.filter((v) => v !== 'unknown');
      all.forEach((x) => { x.checked = vals.includes(x.value); });
    }
    st.answers[qid] = vals;
  } else {
    st.answers[qid] = input.value;
    const d = document.querySelector(`input[data-date-for="${CSS.escape(qid)}"]`); if (d) d.value = '';
    setErr(qid, '');
  }
  markAnswered(qid);
}
function readDate(input) {
  const qid = input.dataset.dateFor; const v = input.value;
  if (!v) { if (/^\d{4}-/.test(st.answers[qid] || '')) delete st.answers[qid]; setErr(qid, ''); markAnswered(qid); return; }
  if (!parseDate(v) || v < '1900-01-01') { setErr(qid, '날짜를 다시 확인해 주세요.'); return; }
  if (v > st.asOf) { setErr(qid, `진단 기준일(${st.asOf}) 이후 날짜는 넣을 수 없어요.`); return; }
  st.answers[qid] = v; setErr(qid, '');
  document.querySelectorAll(`input[name="${CSS.escape(qid)}"]`).forEach((x) => { x.checked = false; });
  markAnswered(qid);
}

// ── 이벤트 ────────────────────────────────────────────────
function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case 'pick': if (togglePick(el.dataset.id)) refreshSelect(); break;
    case 'unpick': togglePick(el.dataset.id); refreshSelect(); break;
    case 'pick-go': if (!st.selected.includes(el.dataset.id)) togglePick(el.dataset.id); go(st.selected.length ? '#/answer' : '#/select'); break;
    case 'region': st.f.region = el.dataset.v; st.f.field = 'all'; st.f.q = ''; { const s = document.getElementById('q-search'); if (s) s.value = ''; } refreshSelect(); break;
    case 'field': st.f.field = el.dataset.v; refreshSelect(); break;
    case 'purpose': st.f.purpose = st.f.purpose === el.dataset.v ? null : el.dataset.v; refreshSelect(); break;
    case 'go-answer':
      if (!st.selected.length) { toast('진단할 인증을 하나 이상 골라 주세요.'); return; }
      go('#/answer'); break;
    case 'tab': {
      const card = el.dataset.card; const k = el.dataset.k;
      document.querySelectorAll(`[data-act="tab"][data-card="${CSS.escape(card)}"]`).forEach((t) => { const on = t.dataset.k === k; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      document.querySelectorAll(`[id^="tp-${CSS.escape(card)}-"]`).forEach((p) => { p.hidden = p.id !== `tp-${card}-${k}`; });
      break;
    }
    case 'print': printReport(); break;
    case 'rep-edit': {
      const doc = document.querySelector('#rep-stage .p-doc'); if (!doc) return;
      const on = doc.getAttribute('contenteditable') !== 'true';
      doc.setAttribute('contenteditable', on ? 'true' : 'false');
      el.setAttribute('aria-pressed', String(on)); el.textContent = on ? '✓ 수정 끝내기' : '✎ 문구 수정 켜기';
      if (on) { st.edited = true; markEdited(doc); toast('점선 안의 문구를 바로 고칠 수 있어요. 고친 내용은 이 화면에만 있어요.'); }
      break;
    }
    case 'rep-html': saveHtml(); break;
    case 'share': share(); break;
    case 'reload': location.reload(); break;
    default: break;
  }
}
// 방향키로 탭 이동(접근성)
function onKey(e) {
  const t = e.target;
  if (!t.matches || !t.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = [...t.parentElement.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(t); const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  n.focus(); n.click(); e.preventDefault();
}
function onChange(e) {
  const t = e.target;
  if (t.matches('[data-sc]')) { st.docStatus[t.dataset.sc] = t.value; t.closest('.q').classList.add('answered'); refreshAnswerSide(); return; }
  if (t.matches('[data-date-for]')) { readDate(t); applyVisibility(); refreshAnswerSide(); return; }
  if (t.closest('form[data-form="answer"]') && t.name && (t.type === 'radio' || t.type === 'checkbox')) {
    readChoice(t); applyVisibility();
    if (['industry', 'ven_revenue'].includes(t.name)) refreshDynamic();
    refreshAnswerSide();
  }
}
let qTimer;
function onInput(e) {
  const t = e.target;
  if (t.matches('[data-input="q"]')) { clearTimeout(qTimer); qTimer = setTimeout(() => { st.f.q = t.value.trim().slice(0, 60); refreshSelect(); }, 150); }
  if (t.matches('.q-text')) { const q = st.data.questionMap[t.name]; st.answers[t.name] = t.value.slice(0, (q && q.validation && q.validation.max_length) || 100); }
}
function onSubmit(e) { if (e.target.matches('form[data-form="answer"]')) e.preventDefault(); }

// ── 보고서: PDF(인쇄)·HTML 저장 ────────────────────────────
function markEdited(doc) {
  const flag = doc.querySelector('[data-edit-flag]');
  if (flag) flag.hidden = false;
}
async function printReport() {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const root = document.getElementById('print-root');
    const stage = document.querySelector('#rep-stage .p-doc');
    // 보고서 화면에서 고친 문구가 있으면 그 내용을 그대로 인쇄
    root.innerHTML = stage ? stage.outerHTML.replace(/ contenteditable="(true|false)"/, '') : renderPrint(st.data, report(), { edited: st.edited });
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    window.print();
  } catch {
    toast('인쇄 화면을 준비하지 못했어요. 다시 시도해 주세요.');
  }
}
async function saveHtml() {
  try {
    const doc = document.querySelector('#rep-stage .p-doc');
    if (!doc) return;
    const css = await (await fetch('src/print.css', { cache: 'no-cache' })).text();
    const body = doc.outerHTML.replace(/ contenteditable="(true|false)"/, '').replace(/src="assets\//g, `src="${SITE.url}assets/`);
    const R = report();
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BECONIC 기업인증 진단 보고서 ${R.meta.doc_id}</title><style>body{margin:0;background:#DDE3EA;font-family:'Pretendard Variable',Pretendard,system-ui,sans-serif}.p-doc{background:#fff;max-width:820px;margin:24px auto;padding:48px 52px}${css.replace(/@media print\s*{/, '@media all {')}</style></head><body>${body}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `BECONIC_certification_report_${R.meta.doc_id}${st.edited ? '_edited' : ''}.html`; // 영문 파일명: 일부 브라우저가 한글 파일명을 무시함
    a.hidden = true; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 3000);
    toast('HTML 보고서를 내 기기에 저장했어요.');
  } catch {
    toast('HTML을 저장하지 못했어요. PDF 저장을 이용해 주세요.');
  }
}

// ── 공유(서비스 랜딩 URL만) ────────────────────────────────
async function share() {
  const data = { title: 'BECONIC | 기업인증 진단', text: '인증을 고르고 버튼으로 답하면 신청 기본요건·서류·공식 수수료와 기간을 확인할 수 있어요.', url: SITE.url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(SITE.url);
    toast('서비스 링크를 복사했어요. (진단 결과는 링크에 담기지 않아요)');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast(`링크: ${SITE.url}`);
  }
}

// ── 시작 ──────────────────────────────────────────────────
async function boot() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', render);
  // 브라우저 메뉴(Ctrl+P)로 인쇄해도 진단이 있으면 보고서를, 없으면 현재 화면을 인쇄
  window.addEventListener('beforeprint', () => {
    const ready = st.data && st.selected.length && st.visitedAnswer;
    document.body.dataset.print = ready ? 'report' : 'screen';
    if (ready && !document.getElementById('print-root').innerHTML) document.getElementById('print-root').innerHTML = renderPrint(st.data, report(), { edited: st.edited });
  });
  window.addEventListener('afterprint', () => { document.getElementById('print-root').innerHTML = ''; });
  const ver = document.getElementById('ver'); if (ver) ver.textContent = `· v${APP_VERSION}`;
  const yr = document.getElementById('year'); if (yr) yr.textContent = st.asOf.slice(0, 4);
  try {
    st.data = await loadData('');
  } catch (e) {
    $app().innerHTML = V.loadErrorView(e && e.message ? e.message : '데이터 오류');
    $app().setAttribute('aria-busy', 'false');
    return;
  }
  render();
}
boot();
