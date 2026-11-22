// 앱 상태·라우팅·이벤트. 입력값은 메모리(state)에만 있다 — 저장소·서버 전송 없음.
import { loadData } from './data.js';
import { buildReport, APP_VERSION } from './model.js';
import { recommend } from './recommend.js';
import { evalExpr } from './conditions.js';
import { parseDate } from './engine.js';
import * as V from './views.js';
import { renderPrint } from './print.js';

const CANONICAL = 'https://beconic-diagnosis-certification.netlify.app/';

function todayKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

const st = {
  data: null,
  answers: {},
  selected: [],
  compare: [],
  docStatus: {},
  flow: 'A',
  asOf: todayKST(),
  explore: { group: 'all', q: '', target: 'all', diagOnly: false },
  showLow: false,
  started: false,
};
// QA용 읽기 전용 노출(입력값은 이 창 메모리 안에만 존재)
window.__beconic = { get state() { return JSON.parse(JSON.stringify({ answers: st.answers, selected: st.selected, docStatus: st.docStatus, flow: st.flow, asOf: st.asOf })); } };

const $app = () => document.getElementById('app');
const live = (msg) => { const el = document.getElementById('live'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); };
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
const report = () => buildReport(st.data, { answers: st.answers, selected: st.selected, docStatus: st.docStatus, asOf: st.asOf, flow: st.flow });

// ── 라우팅 ────────────────────────────────────────────────
function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, qs] = h.split('?');
  return { parts: p.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function render() {
  if (!st.data) return;
  const { parts, params } = parseRoute();
  const D = st.data;
  let html; let title = 'BECONIC | 우리 회사 기업인증 준비도 진단';
  const [a, b] = parts;
  try {
    if (!a) html = V.home();
    else if (a === 'explore') {
      if (params.has('q')) st.explore.q = params.get('q').slice(0, 60);
      html = V.explore(st, D); title = '인증 찾기 | BECONIC';
    } else if (a === 'scheme') { html = V.schemeDetail(st, D, b); title = `${(D.schemeMap[b] || {}).name_ko || '제도'} | BECONIC`; }
    else if (a === 'a' && ['purpose', 'profile', 'export'].includes(b)) {
      if (b === 'purpose') { st.flow = 'A'; st.started = true; }
      if (b !== 'purpose' && !st.started) html = V.noStateView();
      else html = V.questionStep(st, D, b);
      title = '진단 | BECONIC';
    } else if (a === 'a' && b === 'recommend') {
      if (!st.started) html = V.noStateView();
      else {
        const recs = recommend(D.catalog.schemes, { ...st.answers, desired_schemes: st.selected });
        if (!st._preselected) { st._preselected = true; if (!st.selected.length) st.selected = recs.filter((r) => r.tier === 'high' && (r.scheme.diagnosable || r.scheme.triage || r.scheme.self_check)).slice(0, V.MAX_SELECT).map((r) => r.scheme.scheme_id); }
        html = V.recommendView(st, D, recs);
      }
      title = '후보 추천 | BECONIC';
    } else if (a === 'questions') { html = st.selected.length && st.started ? V.schemeQuestions(st, D) : V.noStateView(); title = '인증별 질문 | BECONIC'; }
    else if (a === 'result') { html = st.selected.length && st.started ? V.resultView(st, D, report()) : V.noStateView(); title = '진단 결과 | BECONIC'; }
    else if (a === 'docs') { html = st.selected.length && st.started ? V.docsView(st, D, report()) : V.noStateView(); title = '서류 체크 | BECONIC'; }
    else if (a === 'roadmap') { html = st.selected.length && st.started ? V.roadmapView(st, D, report()) : V.noStateView(); title = '실행 로드맵 | BECONIC'; }
    else if (a === 'compare') { html = V.compareView(st, D); title = '인증 비교 | BECONIC'; }
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
  window.scrollTo(0, 0);
  const h1 = app.querySelector('h1');
  if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
}

// ── 설문 표시 조건 ─────────────────────────────────────────
let lastHiddenAnswered = 0;
function applyVisibility() {
  const app = $app();
  let hiddenAnswered = 0;
  app.querySelectorAll('.q[data-show]').forEach((el) => {
    const show = evalExpr(el.dataset.show, st.answers, { schemes: st.selected });
    el.hidden = !show;
    const qid = el.dataset.qid;
    if (!show && st.answers[qid] !== undefined && st.answers[qid] !== '') hiddenAnswered += 1;
  });
  const note = document.getElementById('dep-note');
  if (note) {
    if (hiddenAnswered > lastHiddenAnswered && hiddenAnswered > 0) {
      note.hidden = false;
      note.textContent = `방금 선택으로 이전에 답한 질문 ${hiddenAnswered}개가 숨겨졌어요. 답은 지우지 않았고, 다시 바꾸면 그대로 보여요.`;
    } else if (!hiddenAnswered) note.hidden = true;
  }
  lastHiddenAnswered = hiddenAnswered;
}

// ── 입력 처리 ──────────────────────────────────────────────
function setErr(qid, msg) {
  const el = document.getElementById(`q-${qid}-err`);
  if (!el) return;
  el.hidden = !msg; el.textContent = msg || '';
  const input = document.getElementById(`q-${qid}`);
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
function readField(input) {
  const qid = input.name;
  const q = st.data.questionMap[qid];
  if (!q) return;
  if (q.data_type === 'multi') {
    const vals = [...document.querySelectorAll(`input[name="${CSS.escape(qid)}"]:checked`)].map((x) => x.value);
    // '모름'과 다른 값을 함께 고르면 '모름'을 뺀다
    let out = vals;
    if (vals.length > 1 && vals.includes('unknown')) {
      if (input.value === 'unknown' && input.checked) { out = ['unknown']; document.querySelectorAll(`input[name="${CSS.escape(qid)}"]`).forEach((x) => { x.checked = x.value === 'unknown'; }); } else { out = vals.filter((v) => v !== 'unknown'); const u = document.querySelector(`input[name="${CSS.escape(qid)}"][value="unknown"]`); if (u) u.checked = false; }
    }
    st.answers[qid] = out;
  } else if (q.data_type === 'single') {
    st.answers[qid] = input.value;
  } else if (q.data_type === 'number') {
    const raw = input.value.replace(/[,\s]/g, '');
    if (raw === '') { delete st.answers[qid]; setErr(qid, ''); return; }
    const vd = q.validation || {};
    if (!/^\d+(\.\d+)?$/.test(raw)) { delete st.answers[qid]; setErr(qid, '숫자만 입력해 주세요(쉼표는 자동으로 빼요).'); return; }
    const n = Number(raw);
    if (vd.integer && !Number.isInteger(n)) { delete st.answers[qid]; setErr(qid, '정수로 입력해 주세요.'); return; }
    if ((vd.min !== undefined && n < vd.min) || (vd.max !== undefined && n > vd.max)) { delete st.answers[qid]; setErr(qid, `입력 범위를 확인해 주세요(${(vd.min ?? 0).toLocaleString('ko-KR')}~${(vd.max ?? '').toLocaleString('ko-KR')}).`); return; }
    st.answers[qid] = n; setErr(qid, '');
  } else if (q.data_type === 'date') {
    const v = input.value;
    if (!v) { delete st.answers[qid]; setErr(qid, ''); return; }
    if (!parseDate(v) || v < '1900-01-01') { delete st.answers[qid]; setErr(qid, '날짜를 다시 확인해 주세요.'); return; }
    if (v > st.asOf) { delete st.answers[qid]; setErr(qid, `진단 기준일(${st.asOf}) 이후 날짜는 입력할 수 없어요.`); return; }
    st.answers[qid] = v; setErr(qid, '');
  } else {
    const max = (q.validation && q.validation.max_length) || 100;
    st.answers[qid] = input.value.slice(0, max);
  }
  if (q.question_id === 'biz_status' || q.question_id === 'target' || q.question_id === 'markets') st._preselected = false;
  applyVisibility();
}

function stepNext(step) {
  const D = st.data;
  if (step === 'purpose') {
    const miss = [];
    if (!(st.answers.purposes || []).length) miss.push('purposes');
    if (!st.answers.target) miss.push('target');
    if (!(st.answers.markets || []).length) miss.push('markets');
    if (miss.length) {
      miss.forEach((q) => setErr(q, '하나 이상 골라 주세요. 잘 모르면 "모름"을 골라도 돼요.'));
      const first = document.querySelector(`[data-qid="${miss[0]}"]`);
      if (first) first.scrollIntoView({ block: 'center' });
      live('답하지 않은 질문이 있어요.');
      return;
    }
  }
  const list = V.steps(st, D);
  const i = list.findIndex((s) => s.key === step);
  const nxt = list[i + 1];
  if (step === 'questions') live('결과를 계산했어요.');
  go(nxt ? nxt.route : '#/result');
}

function startDiagnosis(id) {
  const D = st.data;
  if (!D.schemeMap[id]) return;
  if (!st.started) { st.started = true; st.flow = 'B'; }
  if (!st.selected.includes(id)) {
    if (st.selected.length >= V.MAX_SELECT) { toast(`상세진단은 최대 ${V.MAX_SELECT}개까지 할 수 있어요. 결과에서 빼고 다시 골라 주세요.`); return; }
    st.selected.push(id);
  }
  // B 경로: 공통 기본정보를 이미 답했으면 바로 인증별 질문으로
  const hasProfile = st.answers.biz_status !== undefined;
  go(hasProfile ? (V.needsExport(st, D) && !st.answers.product_categories ? '#/a/export' : '#/questions') : '#/a/profile');
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const D = st.data;
  switch (act) {
    case 'start-a': st.flow = 'A'; st.started = true; break;
    case 'start-b': break;
    case 'tab': st.explore.group = el.dataset.group; render(); break;
    case 'reset-filters': st.explore = { group: 'all', q: '', target: 'all', diagOnly: false }; go('#/explore'); render(); break;
    case 'diagnose': e.preventDefault(); startDiagnosis(el.dataset.id); break;
    case 'compare-toggle': {
      const id = el.dataset.id;
      if (el.checked) { if (st.compare.length >= V.MAX_SELECT) { el.checked = false; toast(`비교는 최대 ${V.MAX_SELECT}개까지예요.`); return; } st.compare.push(id); } else st.compare = st.compare.filter((x) => x !== id);
      const bar = document.getElementById('cmpbar'); if (bar) bar.outerHTML = V.compareBar(st, D);
      break;
    }
    case 'compare-remove': st.compare = st.compare.filter((x) => x !== el.dataset.id); render(); break;
    case 'compare-selected': st.compare = [...st.selected].slice(0, V.MAX_SELECT); go('#/compare'); break;
    case 'select-toggle': {
      const id = el.dataset.id;
      if (el.checked) { if (st.selected.length >= V.MAX_SELECT) { el.checked = false; toast(`상세진단은 최대 ${V.MAX_SELECT}개까지 고를 수 있어요.`); return; } st.selected.push(id); } else st.selected = st.selected.filter((x) => x !== id);
      const c = document.getElementById('sel-count'); if (c) c.textContent = `${st.selected.length}개 선택됨 (최대 ${V.MAX_SELECT}개)`;
      const btn = document.querySelector('[data-act="go-questions"]'); if (btn) btn.setAttribute('aria-disabled', st.selected.length ? 'false' : 'true');
      break;
    }
    case 'go-questions':
      if (!st.selected.length) { toast('상세진단할 인증을 하나 이상 골라 주세요.'); return; }
      go('#/questions'); break;
    case 'toggle-low': st.showLow = !st.showLow; render(); break;
    case 'back': history.back(); break;
    case 'quit':
      if (confirm('입력한 내용을 모두 지우고 처음으로 갈까요? (저장되지 않아요)')) { resetAll(); go('#/'); }
      break;
    case 'edit': go(st.flow === 'A' ? '#/a/purpose' : '#/a/profile'); break;
    case 'print': printReport(); break;
    case 'share': share(); break;
    case 'reload': location.reload(); break;
    default: break;
  }
}

function resetAll() {
  st.answers = {}; st.selected = []; st.docStatus = {}; st.started = false; st.flow = 'A'; st._preselected = false; st.showLow = false;
}

function onChange(e) {
  const t = e.target;
  if (t.matches('[data-unknown]')) {
    const qid = t.dataset.unknown; const input = document.getElementById(`q-${qid}`);
    if (t.checked) { st.answers[qid] = 'unknown'; if (input) { input.value = ''; input.disabled = true; } setErr(qid, ''); } else { delete st.answers[qid]; if (input) { input.disabled = false; input.focus(); } }
    applyVisibility(); return;
  }
  if (t.matches('[data-doc]')) {
    st.docStatus[t.dataset.doc] = t.value;
    const R = report();
    R.schemes.forEach((x) => { const el = document.getElementById(`cnt-${x.scheme.scheme_id}`); const r = x.readiness || x.selfcheck; if (el && r) el.textContent = `${r.total ? `준비항목 ${r.total}개 중 ${r.done}개 있음 · ${r.unknown}개 확인 필요 · ${r.missing}개 없음` : ''}`; });
    return;
  }
  if (t.matches('[data-input="explore-target"]')) { st.explore.target = t.value; refreshExplore(); return; }
  if (t.matches('[data-input="explore-diag"]')) { st.explore.diagOnly = t.checked; refreshExplore(); return; }
  if (t.closest('form[data-form="step"]') && t.name) readField(t);
}
function refreshExplore() { const box = document.getElementById('ex-results'); if (box) box.innerHTML = V.exploreResults(st, st.data); }
let qTimer;
function onInput(e) {
  const t = e.target;
  if (t.matches('[data-input="explore-q"]')) { clearTimeout(qTimer); qTimer = setTimeout(() => { st.explore.q = t.value.slice(0, 60); refreshExplore(); }, 150); }
  if (t.closest('form[data-form="step"]') && t.name && t.type === 'text' && st.data.questionMap[t.name] && st.data.questionMap[t.name].data_type === 'text') readField(t);
}
function onSubmit(e) {
  const f = e.target;
  if (f.matches('[data-form="home-search"]')) { e.preventDefault(); const q = f.querySelector('input').value.trim().slice(0, 60); st.explore.q = q; go(`#/explore${q ? `?q=${encodeURIComponent(q)}` : ''}`); return; }
  if (f.matches('[data-form="step"]')) {
    e.preventDefault();
    f.querySelectorAll('input[type="text"], input[type="date"]').forEach((i) => { if (i.name && !i.disabled) readField(i); });
    if (f.querySelector('.q-err:not([hidden])')) { live('입력값을 확인해 주세요.'); f.querySelector('.q-err:not([hidden])').closest('.q').scrollIntoView({ block: 'center' }); return; }
    stepNext(f.dataset.step);
  }
}

// ── PDF(인쇄) ─────────────────────────────────────────────
async function printReport() {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const root = document.getElementById('print-root');
    root.innerHTML = renderPrint(st.data, report());
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    window.print();
  } catch (e) {
    toast('인쇄 화면을 준비하지 못했어요. 다시 시도해 주세요.');
  }
}

// ── 공유(서비스 랜딩 URL만) ────────────────────────────────
async function share() {
  const data = { title: 'BECONIC | 우리 회사 기업인증 준비도 진단', text: '국내·해외 기업인증을 찾고, 필수요건·준비서류·보완 우선순위를 확인하세요.', url: CANONICAL };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(CANONICAL);
    toast('서비스 링크를 복사했어요. (진단 결과는 링크에 담기지 않아요)');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast(`링크: ${CANONICAL}`);
  }
}

// ── 시작 ──────────────────────────────────────────────────
async function boot() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  window.addEventListener('hashchange', render);
  // 브라우저 메뉴(Ctrl+P)로 인쇄해도 진단이 있으면 보고서를, 없으면 현재 화면을 인쇄
  window.addEventListener('beforeprint', () => {
    const ready = st.data && st.started && st.selected.length;
    document.body.dataset.print = ready ? 'report' : 'screen';
    if (ready) document.getElementById('print-root').innerHTML = renderPrint(st.data, report());
  });
  const ver = document.getElementById('ver'); if (ver) ver.textContent = `· v${APP_VERSION}`;
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
