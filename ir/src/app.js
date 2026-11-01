// BECONIC IR 진단 v2 — 화면. 입력 내용과 업로드한 파일은 이 브라우저 안에서만 처리하며 서버로 보내지 않는다.
import { CATEGORIES, QUESTIONS, STAGES, INDUSTRIES, WEIGHTS, GRADES, CMAP, MODEL_VERSION, SOURCES, N_Q, EFFORT, INDUSTRY_ADJ } from './model.js';
import { evaluate, SCORE_VERSION } from './score.js';
import { ACCOUNTS, CORE, parseStatements, parseWon } from './fin.js';
import { blank, load, save, clear, hasLegacy, today, validate } from './store.js';
import { sampleState } from './sample.js';
import { gauge, radar, finBars, dots } from './charts.js';
import { renderReport, reportId } from './report.js';

export const APP = { version: 'v2.1.0', updated: '2026-11-01' };
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (t) => esc(t).replace(/·/g, '⁠·⁠');
let st = load();
let finDraft = null; // 재무 확인 화면의 임시 값

const commit = () => { if (st) save(st); };
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };

// ───────────────────────── 라우팅(일반 경로)
if (location.hash.startsWith('#/')) history.replaceState(null, '', `/${location.hash.slice(2)}`);
const route = () => location.pathname.replace(/^\/+|\/+$/g, '').split('/');
const go = (h) => { const to = `/${h}`; if (location.pathname !== to) history.pushState(null, '', to); render(); window.scrollTo(0, 0); };
window.addEventListener('popstate', () => { render(); window.scrollTo(0, 0); });
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault(); go(a.getAttribute('href').slice(1));
});

// ───────────────────────── 공통
const firstUnanswered = () => QUESTIONS.findIndex((q) => typeof st?.answers?.[q.id]?.v !== 'number');
function headerHtml() {
  const act = st && st.meta.company && Object.keys(st.answers).length ? '<div class="hd-act"><a class="btn white sm" href="/result">결과 보기</a></div>' : '';
  return `<header class="site"><div class="wrap hd"><a class="brand" href="/" aria-label="BECONIC IR 진단 처음으로"><img src="/assets/shield.png" alt="" width="34" height="34"><span class="txt"><b>BECONIC</b><small>IR 진단 · by Growth Ventures</small></span></a>${act}</div></header>`;
}
function footerHtml() {
  return `<footer class="site"><div class="wrap ft"><div class="f-brand"><img src="/assets/shield-white.png" alt="" width="40" height="40"><div><b>BECONIC</b><small>IR 진단 · by Growth Ventures</small></div></div>
  <p class="f-info">그로스벤처스 주식회사 · 서울시 구로구 디지털로27길 24, 209호<br>전화 <a href="tel:070-4103-4177">070-4103-4177</a> · 이메일 <a href="mailto:start@gven.kr">start@gven.kr</a> · <a href="https://www.beconic.kr/" target="_blank" rel="noopener">www.beconic.kr</a></p>
  <p class="f-cert">중소벤처기업부 공식 인증 중소기업상담회사 (제2025-684호)</p>
  <p class="f-legal">IR 준비도 점수는 대표 응답과 제출한 재무제표를 바탕으로 한 자가진단 결과예요. 투자 유치 여부나 기업가치를 판단·보장하지 않아요. 입력 내용과 파일은 이 브라우저에만 저장돼요.</p>
  <p class="f-ver">${APP.version} · 문항 ${MODEL_VERSION} · 점수 ${SCORE_VERSION}</p></div></footer>`;
}
const barColor = (s) => (s >= 80 ? '#3182f6' : s >= 60 ? '#5aa0ff' : s >= 40 ? '#f0a43a' : '#e5484d');
function catBar(c) {
  return `<div class="cbar"><b>${nb(c.name)}</b><div class="track"><i style="width:${c.score ?? 0}%;background:${barColor(c.score ?? 0)}"></i></div><em>${c.score ?? '—'}</em></div>`;
}

// ───────────────────────── 홈
function homeHtml() {
  const demo = evaluate(sampleState());
  const resume = st && st.meta.company;
  const n = resume ? Object.values(st.answers).filter((a) => typeof a.v === 'number').length : 0;
  return `${headerHtml()}<main>
  <section class="hero"><div class="wrap hero-in"><div>
    <p class="eyebrow">근거로 준비하고, 실행으로 연결합니다</p>
    <h1>우리 회사 IR,<br><em>투자자 관점에서</em><br>준비되어 있나요?</h1>
    <p class="lead">9개 영역 36문항에서 "우리 회사에 맞는 문장"을 고르고 표준재무제표를 올리면, IR 준비도 점수와 강점·보완점, 재무 지표, 실행 로드맵을 한눈에 보여 드려요.</p>
    <div class="cta-row">${resume ? `<button class="btn primary lg" data-act="resume">이어서 하기 · ${esc(st.meta.company)} (${n}/${N_Q})</button><button class="btn ghost lg" data-act="new">새로 시작</button>` : '<button class="btn primary lg" data-act="new">IR 진단 시작하기 · 약 10분</button>'}</div>
    <p class="micro">회원가입 없음 · 입력 내용과 파일은 이 브라우저에만 저장 · <button class="link sm" data-act="sample">합성 예시 결과 보기</button></p>
  </div>
  <div class="hero-card" aria-label="결과 화면 예시"><div class="hc-top"><span>IR 진단 결과</span><small>합성 예시</small></div>
    <div class="hc-g">${gauge(demo.overall, demo.grade, { size: 240 })}</div>
    <div class="cbars">${CATEGORIES.slice(0, 4).map((c) => catBar(demo.cats[c.id])).join('')}</div></div></div></section>

  <section class="wrap"><h2 class="sec-t">이렇게 진단해요</h2><div class="cards4">
    ${[['1', '5점 척도 진단', '문제·제품·기술·시장·실적·경쟁·팀·재무·IR 자료 9개 영역, 문항마다 행동 기준 문장 5개 중 하나만 고르면 돼요.'],
       ['2', '표준재무제표 분석', '홈택스 표준재무제표증명 PDF를 올리면 매출·이익·부채를 읽어 지표로 보여 드려요. 파일은 업로드되지 않아요.'],
       ['3', '강점·보완점', '종합 점수에 영향이 큰 순서로 보완할 문항과 다음 단계를 짚어 드려요.'],
       ['4', '실행 로드맵·PDF', '2주·30일·90일 할 일과 결과 보고서 PDF로 바로 실행에 옮길 수 있어요.']]
      .map(([i, t, d]) => `<div class="fcard"><span class="ic">${i}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div></section>

  <section class="wrap two">
    <div class="panel ok-p"><h3>결과에서 볼 수 있는 것</h3><ul><li>종합 IR 준비도 점수·등급(S~D)과 영역별 점수</li><li>강점 3개, 먼저 보완할 3개와 다음 단계</li><li>매출 성장률·영업이익률·부채비율 등 재무 지표</li><li>2주·30일·90일 실행 로드맵</li></ul></div>
    <div class="panel no-p"><h3>점수의 의미</h3><ul><li>대표 응답과 제출한 재무제표를 바탕으로 한 자가진단이에요</li><li>투자 유치 여부나 기업가치를 판단·보장하지 않아요</li><li>투자 단계(예비창업~시리즈A 이상)에 따라 영역 비중이 달라요</li><li>근거 자료 확보율을 점수와 함께 보여 드려요</li></ul></div>
  </section>

  <section class="wrap steps"><h2 class="sec-t">진행 순서</h2><ol>
    <li><b>기본 정보 3가지</b><span>회사명·투자 단계·업종 (30초)</span></li><li><b>36문항 진단</b><span>한 화면에 한 문항 (약 10분)</span></li>
    <li><b>재무제표 올리기</b><span>표준재무제표 PDF 또는 직접 입력 (선택)</span></li><li><b>결과·PDF</b><span>대시보드와 결과 보고서</span></li></ol></section>

  <section class="wrap consult"><div class="cbox"><div><b>결과를 보고 IR을 함께 준비하고 싶다면</b><p>그로스벤처스는 중기부 인증 중소기업상담회사(제2025-684호)예요. 15년 경력 컨설턴트가 진단 결과를 바탕으로 IR 자료와 투자 준비를 함께 설계해 드려요.</p></div>
    <div class="cbtn"><a class="btn primary" href="tel:070-4103-4177">070-4103-4177 전화</a><a class="btn ghost" href="mailto:start@gven.kr?subject=IR 진단 상담 문의">이메일 문의</a></div></div></section>
  </main>${footerHtml()}`;
}

// ───────────────────────── 시작(기본 정보 3가지)
function startHtml() {
  const m = (st || blank()).meta;
  return `${headerHtml()}<main class="wrap narrow"><button class="back" data-act="home">← 처음으로</button>
  <h1 class="pg-t">회사 정보 3가지만 알려 주세요</h1><p class="pg-s">투자 단계에 따라 영역별 비중이 달라져요.</p>
  <div class="card">
    <label class="fld">회사명<input id="s-company" maxlength="60" value="${esc(m.company)}" placeholder="예: 주식회사 비코닉" autocomplete="organization"></label>
    <div class="fld">투자 단계<div class="choice c2" role="radiogroup" aria-label="투자 단계">${STAGES.map((s) => `<button role="radio" aria-checked="${m.stage === s.id}" class="${m.stage === s.id ? 'on' : ''}" data-act="stage" data-v="${s.id}"><b>${s.label}</b><span>${s.desc}</span></button>`).join('')}</div></div>
    <div class="fld">업종 <span class="muted" style="font-weight:500">(선택)</span><div class="chips">${INDUSTRIES.map((x) => `<button class="${m.industry === x ? 'on' : ''}" data-act="industry" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
    <p class="err" id="s-err" role="alert"></p>
  </div></main>
  <div class="bottom-bar"><div class="wrap narrow bb"><button class="btn primary lg block" data-act="start-go">${Object.keys(st?.answers || {}).length ? '진단 이어서 하기' : `진단 시작하기 · ${N_Q}문항`}</button></div></div>`;
}

// ───────────────────────── 문항(한 화면 한 문항)
function questionHtml(n) {
  const i = Math.max(1, Math.min(N_Q, n)) - 1; const q = QUESTIONS[i]; const c = CMAP[q.cat];
  const a = st.answers[q.id] || {}; const ci = CATEGORIES.findIndex((x) => x.id === q.cat);
  const inCat = QUESTIONS.filter((x) => x.cat === q.cat); const k = inCat.indexOf(q) + 1;
  const done = Object.values(st.answers).filter((x) => typeof x.v === 'number').length;
  return `${headerHtml()}<main class="wrap narrow">
  <div class="qtop"><div class="qtop-r"><button class="back" style="margin:0" data-act="${i === 0 ? 'to-start' : 'prev'}">← ${i === 0 ? '기본 정보' : '이전'}</button><span>${i + 1} / ${N_Q}</span></div><div class="qbar" aria-hidden="true"><i style="width:${Math.round((done / N_Q) * 100)}%"></i></div></div>
  ${st.meta.synthetic ? '<div class="syn-band">합성 예시 데이터예요.</div>' : ''}
  <span class="qcat">${ci + 1}. ${nb(c.name)} · ${k}/${inCat.length}</span>
  <h1 class="qtitle">${nb(q.q)}</h1><p class="qwhy">${esc(q.why)}</p>
  <label class="evtog"><input type="checkbox" data-act="ev" ${a.ev ? 'checked' : ''}> 이 내용을 보여 줄 문서·데이터가 있어요 <span class="muted" style="font-weight:500">(선택)</span></label>
  <div class="opts" role="radiogroup" aria-label="가장 가까운 문장 고르기">
    ${q.opts.map((t, j) => `<button role="radio" aria-checked="${a.v === j + 1}" class="opt ${a.v === j + 1 ? 'on' : ''}" data-act="pick" data-v="${j + 1}"><span class="n">${j + 1}</span><span class="ot">${esc(t)}</span><span class="ck" aria-hidden="true">${a.v === j + 1 ? '선택됨' : ''}</span></button>`).join('')}
    <button role="radio" aria-checked="${a.v === 0}" class="opt unk ${a.v === 0 ? 'on' : ''}" data-act="pick" data-v="0">잘 모르겠어요${a.v === 0 ? ' · 선택됨' : ''}</button>
  </div>
  <p class="hint">${typeof a.v === 'number' ? '선택했어요. "다음"을 누르거나 같은 보기를 한 번 더 누르면 넘어가요(Enter 키도 돼요).' : '가장 가까운 문장을 골라 주세요. 키보드 1~5로도 고를 수 있어요.'}</p></main>
  <div class="bottom-bar"><div class="wrap narrow bb"><a class="btn ghost" href="/answers">전체 문항</a><button class="btn ${typeof a.v === 'number' ? 'primary' : 'ghost'}" data-act="next">${i === N_Q - 1 ? '재무제표 단계로 ›' : '다음 ›'}</button></div></div>`;
}

// ───────────────────────── 재무
function finRow(a, d) {
  const v = (o) => (typeof o?.[a.k] === 'number' ? o[a.k].toLocaleString('ko-KR') : '');
  const miss = CORE.includes(a.k) && typeof d.cur?.[a.k] !== 'number';
  const src = d.found?.[a.k] && d.found[a.k].replace(/\s/g, '') !== a.label ? `<span class="src">읽은 항목: ${esc(d.found[a.k])}</span>` : '';
  return `<div class="frow ${miss ? 'miss' : ''}"><div class="fl">${esc(a.label)}${CORE.includes(a.k) ? ' <i>*</i>' : ''}${src}</div>
  <label><span>당기</span><input inputmode="numeric" data-fin="cur" data-k="${a.k}" value="${v(d.cur)}" aria-label="${esc(a.label)} 당기"></label><label><span>전기</span><input inputmode="numeric" data-fin="prev" data-k="${a.k}" value="${v(d.prev)}" aria-label="${esc(a.label)} 전기"></label></div>`;
}
function financeHtml() {
  const has = st.fin && st.fin.confirmed;
  const d = finDraft;
  const table = d ? `<div class="card"><h3>읽은 값을 확인해 주세요</h3>
    ${d.status ? `<div class="stat ${d.status.type}">${esc(d.status.text)}</div>` : ''}
    <p class="hint">원 단위 숫자예요. 틀린 값은 고치고, 비어 있는 값은 재무제표를 보고 채워 주세요(* 표시는 핵심 항목). 손실은 앞에 -를 붙여요.</p>
    <div class="fgrid">${ACCOUNTS.map((a) => finRow(a, d)).join('')}</div>
    <div class="res-act"><button class="btn primary" data-act="fin-save">이 값으로 반영하고 결과 보기</button><button class="btn ghost" data-act="fin-cancel">취소</button></div></div>` : '';
  return `${headerHtml()}<main class="wrap narrow"><button class="back" data-act="to-last">← 문항으로</button>
  <h1 class="pg-t">재무제표를 올려 주세요</h1><p class="pg-s">투자자가 가장 먼저 요청하는 자료예요. 올리면 재무 지표와 응답 교차 확인이 결과에 반영돼요.</p>
  ${has && !d ? `<div class="stat ok">재무 정보가 반영돼 있어요 (${esc(st.fin.source === 'upload' ? st.fin.fileName : '직접 입력')}). 다시 올리거나 수정할 수 있어요.</div>` : ''}
  ${d ? '' : `<label class="drop" id="drop"><input type="file" accept="application/pdf,.pdf" data-act="fin-file" hidden><b>표준재무제표증명 PDF 선택</b><span>여기로 끌어다 놓거나 눌러서 고르세요 · 파일은 업로드되지 않고 이 기기 안에서만 읽어요</span></label>
  <details class="how"><summary>표준재무제표증명은 어디서 받나요?</summary><ol>
    <li>국세청 홈택스(www.hometax.go.kr)에 로그인해요(법인은 법인 인증서).</li><li>민원증명 → <b>표준재무제표증명</b>을 선택해요.</li>
    <li>귀속 연도를 고르고 발급한 뒤, 인쇄 화면에서 <b>PDF로 저장</b>해요.</li><li>저장한 PDF를 위에 올려 주세요. 스캔한 이미지 PDF는 글자를 읽을 수 없어 직접 입력으로 안내해요.</li></ol></details>
  <div class="res-act"><button class="btn white" data-act="fin-manual">숫자 직접 입력하기</button>${has ? '<button class="link danger" data-act="fin-clear">재무 정보 지우기</button>' : ''}</div>`}
  ${table}</main>
  <div class="bottom-bar"><div class="wrap narrow bb"><span class="sm muted">${has ? '재무 반영됨' : '없어도 결과는 볼 수 있어요'}</span><button class="btn primary" data-act="to-result">${has ? '결과 보기 ›' : '건너뛰고 결과 보기 ›'}</button></div></div>`;
}

// ───────────────────────── 결과
function resultHtml() {
  const r = evaluate(st);
  if (!r.answered) return `${headerHtml()}<main class="wrap narrow"><div class="card" style="margin-top:24px;text-align:center"><h3>아직 응답이 없어요</h3><p class="hint">${N_Q}문항에 답하면 결과를 보여 드려요.</p><a class="btn primary" href="/q/1">진단 시작하기</a></div></main>`;
  const stage = r.stageLabel;
  const ind = r.indicators; const c = st.fin?.cur || {}; const p = st.fin?.prev || {};
  const qn = (id) => QUESTIONS.findIndex((q) => q.id === id) + 1;
  const adj = INDUSTRY_ADJ[r.industry] ? ` · ${esc(r.industry)} 업종 보정` : '';
  const roadCol = (t, sub, list) => `<div><h4>${t} <span class="muted sm">${sub}</span></h4>${list.length ? `<ol>${list.map((x) => `<li>${x.q ? `<b>${esc(x.q.title)}</b> — ${esc(x.action)}<small>산출물: ${esc(x.doc)} · ${x.q.id} · 달성 시 +${x.gainTo}점</small>` : `${esc(x.action)}<small>산출물: ${esc(x.doc)}</small>`}</li>`).join('')}</ol>` : '<p class="sm muted">없음</p>'}</div>`;
  const ansText = (q) => { const a = st.answers[q.id] || {}; return typeof a.v !== 'number' ? '미응답' : a.v === 0 ? '잘 모르겠어요' : esc(q.opts[a.v - 1]); };
  return `${headerHtml()}<main class="wrap">
  ${st.meta.synthetic ? '<div class="syn-band">합성 예시 결과예요. 실제 기업 자료가 아니에요.</div>' : ''}
  <div class="res-h"><div><small>${esc(stage)} · ${esc(st.meta.industry || '업종 미선택')} · ${today()}</small><h1>${esc(st.meta.company)} IR 진단 결과</h1></div>
    <div class="res-act" style="margin:0"><button class="btn primary" data-act="print">결과 보고서 PDF</button><a class="btn white" href="/answers">답변 수정</a></div></div>

  <section class="card"><div class="sum-card"><div class="ch-wrap">${gauge(r.overall, r.grade, { size: 250 })}</div>
    <div><ul class="sum-lines">${r.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="badges"><span class="bdg ${r.complete ? 'ok' : 'warn'}">응답 ${r.answered}/${N_Q}</span><span class="bdg info">근거 자료 ${r.evidenceRate}%</span><span class="bdg ${r.fin.has ? 'ok' : 'warn'}">${r.fin.has ? '재무제표 반영' : '재무제표 미반영'}</span>${r.unknown.length ? `<span class="bdg warn">모르겠어요 ${r.unknown.length}</span>` : ''}${r.flags.length ? `<span class="bdg bad">경계 신호 ${r.flags.length}</span>` : ''}</div></div></div></section>

  ${r.flags.length ? `<section class="card flags"><h3>투자자 경계 신호</h3><p class="hint">투자 검토에서 멈칫하게 되는 지점이에요. 미팅 전에 먼저 정리하세요.</p><ul class="chk-l">${r.flags.map((f) => `<li class="warn">${esc(f.text)}${f.qid ? ` <a href="/q/${qn(f.qid)}">응답 보기</a>` : ''}</li>`).join('')}</ul></section>` : ''}

  <section class="card"><h3>투자자 관점 진단</h3><p class="hint">투자 심사에서 묻는 6가지 질문으로 다시 묶어 봤어요. 질문마다 실사에서 확인하는 자료도 함께 적었어요.</p>
    <div class="lenses">${r.lenses.map((l) => `<div class="lens ${l.verdict?.tone || ''}"><div class="lh"><b>${esc(l.name)}</b><em>${l.score ?? '—'}</em></div><p class="lq">${esc(l.q)}</p>
      <div class="track"><i style="width:${l.score ?? 0}%;background:${barColor(l.score ?? 0)}"></i></div>
      <p class="lv">${l.verdict ? esc(l.verdict.text) : '응답 없음'}${l.note ? ` · <span class="muted">${esc(l.note)}</span>` : ''}</p>
      ${l.weakest && (l.score ?? 100) < 80 ? `<p class="lw">가장 약한 부분: <a href="/q/${qn(l.weakest.id)}">${esc(l.weakest.title)}</a></p>` : ''}<p class="ld">실사 확인 자료: ${esc(l.docs)}</p></div>`).join('')}</div></section>

  <div class="grid2">
    <section class="card"><h3>영역별 점수</h3><div class="ch-wrap">${radar(CATEGORIES.map((x) => ({ name: x.short, score: r.cats[x.id].score })), { size: 320 })}</div></section>
    <section class="card"><h3>단계 기대 수준 대비</h3><p class="hint">세로선은 ${esc(stage)} 단계에서 갖추면 좋은 수준(비코닉 기준)이에요. 비중으로 종합 점수를 계산해요${adj}.</p><div class="cbars">
      ${CATEGORIES.map((x) => { const cc = r.cats[x.id]; return `<div class="cbar"><b>${nb(x.name)}</b><div class="track"><i style="width:${cc.score ?? 0}%;background:${barColor(cc.score ?? 0)}"></i><s style="left:${cc.expect}%"></s></div><em>${cc.score ?? '—'}</em><small>비중 ${cc.weight}% · 기대 ${cc.expect} · ${cc.gap === null ? '미응답' : cc.gap >= 0 ? '충족' : `<span class="gap">${cc.gap}</span>`} · 근거 ${cc.ev}/${cc.total}</small></div>`; }).join('')}</div></section>
  </div>

  <div class="grid2">
    <section class="card"><h3>강점</h3><div class="lst">${r.strengths.length ? r.strengths.map((s) => `<div class="it good"><div class="h"><span>${esc(s.q.title)} <span class="muted sm">${esc(CMAP[s.q.cat].name)}</span></span>${dots(s.v)}</div><p>${esc(s.text)}${s.ev ? '' : ' · 근거 자료 확인 필요'}</p></div>`).join('') : '<p class="hint">4점 이상인 문항이 아직 없어요.</p>'}</div></section>
    <section class="card"><h3>먼저 보완할 3가지</h3><p class="hint">점수를 올릴 여지가 크고 비중이 높은 순서예요.</p><div class="lst">${r.weaknesses.map((w) => `<div class="it need"><div class="h"><span>${esc(w.q.title)} <span class="muted sm">${esc(CMAP[w.q.cat].name)}</span></span>${dots(w.v)}</div><p>지금: ${esc(w.now)}</p><p class="nx"><b>목표</b> ${esc(w.next)} <span class="muted sm">(달성 시 +${w.gainTo}점)</span></p><p class="sm muted">산출물: ${esc(w.doc)}</p></div>`).join('') || '<p class="hint">3점 이하 문항이 없어요.</p>'}</div></section>
  </div>

  ${r.checks.length ? `<section class="card"><h3>응답과 재무제표 확인</h3><ul class="chk-l">${r.checks.map((x) => `<li class="${x.type}">${esc(x.text)}${x.qid ? ` <a href="/q/${qn(x.qid)}">응답 보기</a>` : ''}</li>`).join('')}</ul></section>` : ''}

  <section class="card"><h3>재무</h3>${r.fin.has ? `<p class="hint">${st.fin.source === 'upload' ? `표준재무제표에서 읽은 값(${esc(st.fin.fileName)})` : '직접 입력한 값'} 기준이에요. 참고 구간은 일반적인 기준선이며 업종별 차이가 커요.</p>
    <div class="kpis">${ind.map((x) => `<div class="kpi ${x.band || ''}"><span>${esc(x.label)}</span><b>${x.value === null ? esc(x.text || '계산 불가') : `${x.value}${x.unit}`}</b><small>${esc(x.note)}</small></div>`).join('')}</div>
    <div class="ch-wrap" style="margin-top:12px">${finBars([{ label: '매출액', prev: p.rev, cur: c.rev }, { label: '영업이익', prev: p.op, cur: c.op }, { label: '당기순이익', prev: p.net, cur: c.net }])}</div>
    <div class="res-act"><a class="btn white sm" href="/finance">재무 수정</a></div>`
    : `<div class="stat warn">재무제표가 반영되지 않았어요. 재무·자금 점수는 대표 응답만으로 계산했어요.</div><p class="hint">투자자는 표준재무제표를 가장 먼저 요청해요. 올리면 매출 성장률·영업이익률·부채비율·유동비율·현금 보유 개월 수와 응답 교차 확인이 추가돼요.</p><a class="btn primary" href="/finance">표준재무제표 올리기</a>`}</section>

  <section class="card"><h3>보완 로드맵</h3><p class="hint">종합 점수에 영향이 큰 순서로 고른 뒤, 보완 난이도에 맞춰 기간에 배치했어요. 항목마다 만들어야 할 산출물을 적었어요.</p>
    <div class="road">${roadCol('지금 ~ 2주', '빠르게 정리', r.roadmap.now)}${roadCol('30일 안에', '자료·실적 보강', r.roadmap.d30)}${roadCol('90일 안에', '구조·실적 만들기', r.roadmap.d90)}</div></section>

  <section class="card"><h3>영역별 상세 진단</h3><p class="hint">영역마다 투자자가 보는 포인트, 지금 상태, 보완 목표와 준비할 자료예요.</p>
  ${r.analysis.map((a) => `<details class="qd"><summary><span>${nb(a.c.name)} <span class="bdg ${a.gap === null ? '' : a.gap >= 0 ? 'ok' : 'warn'}">${esc(a.status)}</span></span><span>${a.score ?? '—'}점 ›</span></summary>
    <div class="ana"><p class="av"><b>투자자가 보는 포인트</b> ${esc(a.c.view)}</p>${a.diag ? `<p><b>지금 상태</b> ${esc(a.diag)}</p>` : ''}
    ${a.actions.length ? `<p><b>보완 목표</b></p><ul>${a.actions.map((x) => `<li>${esc(x.q.title)} — ${esc(x.action)} <span class="muted sm">(${EFFORT[x.effort]} · 산출물: ${esc(x.doc)})</span></li>`).join('')}</ul>` : ''}
    ${qByCatLocal(a.c.id).map((q) => `<div class="qrow"><div><b>${esc(q.title)} ${dots(st.answers[q.id]?.v)}</b><span>${ansText(q)}${st.answers[q.id]?.ev ? ' · 근거 있음' : ''}</span></div><a href="/q/${qn(q.id)}">수정</a></div>`).join('')}</div></details>`).join('')}</section>

  <section class="card method"><h3>점수는 이렇게 계산해요</h3>
    <p>문항은 1~5점(잘 모르겠어요 = 1점), 영역 점수 = 문항 평균 × 20, 종합 = 투자 단계별 영역 비중(기술 집약 업종은 기술역량 비중 보정)으로 가중 평균해요. 대표 응답과 제출한 재무제표 기반의 자가진단이며, 투자 유치 여부나 기업가치를 판단·보장하지 않아요.</p>
    <div class="tw"><table><thead><tr><th>등급</th>${GRADES.map((g) => `<th>${g.g}</th>`).join('')}</tr></thead><tbody><tr><td>기준</td>${GRADES.map((g) => `<td>${g.min}+</td>`).join('')}</tr></tbody></table></div>
    <p class="sm">영역 구성은 ${Object.values(SOURCES).slice(0, 2).map((s) => `${esc(s.publisher)} 「${esc(s.title)}」`).join(', ')}의 투자 설명 항목을 참고했어요. 가중치·단계 기대 수준·업종 보정은 비코닉 설계값(실증 검증 전)이에요.</p></section>

  <div class="res-act"><button class="btn primary" data-act="print">결과 보고서 PDF</button><a class="btn white" href="/finance">재무 ${r.fin.has ? '수정' : '올리기'}</a><button class="btn white" data-act="export">결과 파일 저장</button><label class="btn white file">결과 파일 열기<input type="file" accept="application/json,.json" data-act="import" hidden></label><button class="link danger" data-act="reset">모두 지우기</button></div>
  <section class="consult" style="margin-top:24px"><div class="cbox"><div><b>보완 항목을 함께 준비하고 싶다면</b><p>진단 결과를 바탕으로 IR 덱·재무 자료·투자 전략을 함께 설계해 드려요.</p></div><div class="cbtn"><a class="btn primary" href="tel:070-4103-4177">070-4103-4177</a><a class="btn ghost" href="mailto:start@gven.kr?subject=IR 진단 결과 상담">이메일 상담</a></div></div></section>
  </main>${footerHtml()}`;
}
const qByCatLocal = (cid) => QUESTIONS.filter((q) => q.cat === cid);

function answersHtml() {
  const r = evaluate(st);
  return `${headerHtml()}<main class="wrap narrow"><button class="back" data-act="result-or-home">← 돌아가기</button><h1 class="pg-t">전체 문항</h1><p class="pg-s">${r.answered}/${N_Q} 응답 · 누르면 해당 문항으로 가요.</p>
  ${CATEGORIES.map((c) => `<section class="card"><h3>${nb(c.name)} <span class="muted sm">${r.cats[c.id].score ?? '—'}점</span></h3>${QUESTIONS.filter((q) => q.cat === c.id).map((q) => { const a = st.answers[q.id] || {};
    return `<div class="qrow"><div><b>${esc(q.title)} ${dots(a.v)}</b><span>${typeof a.v !== 'number' ? '<b style="color:var(--warn);display:inline">미응답</b>' : a.v === 0 ? '잘 모르겠어요' : esc(q.opts[a.v - 1])}</span></div><a href="/q/${QUESTIONS.indexOf(q) + 1}">${typeof a.v === 'number' ? '수정' : '답하기'}</a></div>`; }).join('')}</section>`).join('')}
  </main><div class="bottom-bar"><div class="wrap narrow bb"><a class="btn ghost" href="/finance">재무제표</a><a class="btn primary" href="/result">결과 보기 ›</a></div></div>`;
}

// ───────────────────────── 렌더
function render() {
  const [r0, r1] = route();
  const ok = st && st.meta.company;
  let html; let page = r0;
  if (r0 === 'start') html = startHtml();
  else if (r0 === 'q' && ok) html = questionHtml(Number(r1) || 1);
  else if (r0 === 'finance' && ok) html = financeHtml();
  else if (r0 === 'result' && ok) html = resultHtml();
  else if (r0 === 'answers' && ok) html = answersHtml();
  else { page = 'home'; html = homeHtml(); if (r0) history.replaceState(null, '', '/'); }
  $('#app').innerHTML = html;
  document.body.dataset.route = page || 'home';
  bindDrop();
}
function bindDrop() {
  const d = $('#drop'); if (!d) return;
  ['dragenter', 'dragover'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove('over'); }));
  d.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) handlePdf(f); });
}

// ───────────────────────── 재무 처리
async function handlePdf(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast('PDF 파일을 골라 주세요.'); return; }
  toast('재무제표를 읽고 있어요…');
  try {
    const { readPdfLines } = await import('./pdfread.js');
    const { lines, textless } = await readPdfLines(file);
    if (textless) { finDraft = { source: 'manual', fileName: file.name, cur: {}, prev: {}, found: {}, status: { type: 'warn', text: '글자를 읽을 수 없는 PDF예요(스캔 이미지일 수 있어요). 재무제표를 보고 직접 입력해 주세요.' } }; render(); return; }
    const p = parseStatements(lines); const n = Object.keys(p.found).length; const coreN = CORE.filter((k) => typeof p.cur[k] === 'number').length;
    finDraft = { source: 'upload', fileName: file.name, cur: p.cur, prev: p.prev, found: p.found, years: p.years,
      status: n ? { type: coreN === CORE.length ? 'ok' : 'info', text: `${ACCOUNTS.length}개 계정 중 ${n}개를 읽었어요${p.unit > 1 ? ` (단위 ${p.unit === 1000 ? '천원' : '백만원'} → 원으로 바꿈)` : ''}. ${coreN < CORE.length ? '빈 핵심 항목을 채워 주세요.' : '값이 맞는지 확인해 주세요.'}` }
        : { type: 'warn', text: '표준재무제표 형식의 계정을 찾지 못했어요. 직접 입력해 주세요.' } };
    render();
  } catch { finDraft = { source: 'manual', fileName: file.name, cur: {}, prev: {}, found: {}, status: { type: 'warn', text: 'PDF를 여는 중 문제가 생겼어요. 직접 입력해 주세요.' } }; render(); }
}

// ───────────────────────── 이벤트
document.addEventListener('keydown', (e) => {
  if (route()[0] !== 'q' || e.target.closest('input,textarea,select')) return;
  if (/^[1-5]$/.test(e.key)) { e.preventDefault(); pick(Number(e.key)); }
  else if (e.key === 'Enter' && !e.target.closest('button,a')) { const n = Number(route()[1]) || 1; if (typeof st.answers[QUESTIONS[n - 1].id]?.v === 'number') { e.preventDefault(); go(n < N_Q ? `q/${n + 1}` : 'finance'); } }
});
// 고르면 선택만 표시하고 넘어가지 않는다(자동 이동 시 선택 확인·근거 체크가 어려웠음). 같은 보기를 다시 누르거나 '다음'·Enter로 진행
function pick(v) {
  const n = Number(route()[1]) || 1; const q = QUESTIONS[n - 1];
  if (st.answers[q.id]?.v === v) { go(n < N_Q ? `q/${n + 1}` : 'finance'); return; }
  st.answers[q.id] = { ...(st.answers[q.id] || {}), v }; commit(); render();
  const nx = $('[data-act=next]'); if (nx) nx.focus({ preventScroll: true });
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.fin && finDraft) { const v = parseWon(el.value); finDraft[el.dataset.fin] ||= {}; if (v === null) delete finDraft[el.dataset.fin][el.dataset.k]; else if (!Number.isNaN(v)) finDraft[el.dataset.fin][el.dataset.k] = v; }
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.act === 'ev') { const q = QUESTIONS[(Number(route()[1]) || 1) - 1]; st.answers[q.id] = { ...(st.answers[q.id] || {}), ev: el.checked }; commit(); return; }
  if (el.dataset.act === 'fin-file' && el.files[0]) { await handlePdf(el.files[0]); return; }
  if (el.dataset.act === 'import' && el.files[0]) {
    try { const d = validate(JSON.parse(await el.files[0].text()));
      if (!d) { toast('IR 진단 결과 파일이 아니에요.'); return; }
      if (st?.meta.company && !confirm(`지금 내용을 "${d.meta.company}" 결과로 바꿀까요?`)) return;
      st = d; commit(); go('result'); toast('결과 파일을 열었어요.');
    } catch { toast('파일을 읽을 수 없어요.'); }
  }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act; const n = Number(route()[1]) || 1;
  switch (act) {
    case 'home': go(''); break;
    case 'new': if (st?.meta.company && Object.keys(st.answers).length && !confirm('저장된 진단을 지우고 새로 시작할까요? 먼저 "결과 파일 저장"을 권해요.')) return; st = blank(); finDraft = null; go('start'); break;
    case 'resume': { const i = firstUnanswered(); go(i === -1 ? 'result' : `q/${i + 1}`); break; }
    case 'sample': st = sampleState(); commit(); go('result'); break;
    case 'stage': st ||= blank(); st.meta.company = ($('#s-company')?.value || st.meta.company).slice(0, 60); st.meta.stage = b.dataset.v; render(); break;
    case 'industry': st ||= blank(); st.meta.company = ($('#s-company')?.value || st.meta.company).slice(0, 60); st.meta.industry = st.meta.industry === b.dataset.v ? '' : b.dataset.v; render(); break;
    case 'start-go': {
      st ||= blank(); const name = ($('#s-company')?.value || '').trim();
      if (!name) { $('#s-err').textContent = '회사명을 입력해 주세요.'; $('#s-company').focus(); return; }
      if (!st.meta.stage) { $('#s-err').textContent = '투자 단계를 골라 주세요.'; return; }
      st.meta.company = name.slice(0, 60); st.meta.synthetic = false; commit();
      const i = firstUnanswered(); go(i === -1 ? 'result' : `q/${i + 1}`); break;
    }
    case 'to-start': go('start'); break;
    case 'pick': pick(Number(b.dataset.v)); break;
    case 'prev': go(`q/${Math.max(1, n - 1)}`); break;
    case 'next': go(n < N_Q ? `q/${n + 1}` : 'finance'); break;
    case 'to-last': go(`q/${N_Q}`); break;
    case 'to-result': go('result'); break;
    case 'result-or-home': go(Object.keys(st.answers).length ? 'result' : ''); break;
    case 'fin-manual': finDraft = { source: 'manual', fileName: '', cur: { ...(st.fin?.cur || {}) }, prev: { ...(st.fin?.prev || {}) }, found: {} }; render(); break;
    case 'fin-cancel': finDraft = null; render(); break;
    case 'fin-clear': if (confirm('재무 정보를 지울까요?')) { st.fin = null; commit(); render(); } break;
    case 'fin-save': {
      const d = finDraft; const bad = [...document.querySelectorAll('[data-fin]')].filter((i) => Number.isNaN(parseWon(i.value)));
      if (bad.length) { bad[0].focus(); toast('숫자 형식을 확인해 주세요.'); return; }
      if (!CORE.some((k) => typeof d.cur?.[k] === 'number')) { toast('당기 값을 하나 이상 입력해 주세요.'); return; }
      st.fin = { source: d.source, fileName: d.fileName, cur: d.cur, prev: d.prev, years: d.years || [], confirmed: true };
      finDraft = null; commit(); go('result'); toast('재무 정보를 반영했어요.'); break;
    }
    case 'print': printReport(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `BECONIC_IR진단_${(st.meta.company || 'company').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)}_${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('결과 파일을 저장했어요.'); break;
    }
    case 'reset': if (confirm('이 브라우저에 저장된 IR 진단을 모두 지울까요? 되돌릴 수 없어요.')) { clear(); st = null; finDraft = null; go(''); } break;
  }
});

export function printReport() {
  const r = evaluate(st); const id = reportId(st);
  const pr = $('#print-root');
  pr.innerHTML = `<style>@page{@bottom-left{content:"${id} · BECONIC IR 진단";font-size:8pt;color:#6b7684;font-family:'Pretendard',sans-serif}@bottom-right{content:counter(page) " / " counter(pages);font-size:8pt;color:#6b7684;font-family:'Pretendard',sans-serif}}</style>${renderReport(st, r, { id, date: today(), version: APP.version })}`;
  const prev = document.title; const safe = (st.meta.company || 'company').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  document.title = `BECONIC_IR진단_결과보고서_${safe}_${today()}`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); document.title = prev; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  if (!window.__noPrint) window.print();
}

render();
window.__IR = { get state() { return st; }, evaluate: () => evaluate(st), go, APP, hasLegacy, WEIGHTS };
