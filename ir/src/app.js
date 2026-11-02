// BECONIC IR 진단 v2 — 화면. 입력 내용과 업로드한 파일은 이 브라우저 안에서만 처리하며 서버로 보내지 않는다.
import { CATEGORIES, QUESTIONS, STAGES, INDUSTRIES, WEIGHTS, GRADES, CMAP, MODEL_VERSION, SOURCES, N_Q, EFFORT, INDUSTRY_ADJ, LENSES,
  estMinutes, bandColor, SCALE_MAX, UNKNOWN_AS, SCORE_FACTOR, STRONG_MIN, WEAK_MAX, GOAL_FLOOR, TOP_N, ROADMAP_BUCKETS, FIN_YEARS_GOOD } from './model.js';
import { evaluate, SCORE_VERSION } from './score.js';
import { ACCOUNTS, CORE, SLOTS, slotLabel, parseFile, mergeParsed, normalizeFin, filledYears, parseWon, fmtWon } from './fin.js';
import { blank, load, save, clear, hasLegacy, today, validate } from './store.js';
import { sampleState } from './sample.js';
import { gauge, radar, trend, lineChart, dots } from './charts.js';
import { renderReport, reportId } from './report.js';
import { COMPANY, telHref } from './contact.js';

export const APP = { version: 'v2.3.1', updated: '2026-11-02' };
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (t) => esc(t).replace(/·/g, '⁠·⁠');
let st = load();

const PHONE_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z"/></svg>';
const commit = () => { if (st) save(st); };
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };

// ───────────────────────── 화면 전환 — 주소는 항상 '/'로 고정(경로를 붙이지 않음)
// 화면 위치는 history.state.view로만 관리: 뒤로 가기·새로고침(같은 화면 유지)이 동작하고 주소창은 바뀌지 않는다.
// 예전 주소(/result, /#/q/5 등)로 들어와도 해당 화면을 열고 주소는 '/'로 되돌린다.
const legacy = location.hash.startsWith('#/') ? location.hash.slice(2) : location.pathname.replace(/^\/+|\/+$/g, '');
let view = history.state?.view ?? legacy;
history.replaceState({ view }, '', '/');
const route = () => view.split('/');
const go = (h) => { if (h !== view) { view = h; history.pushState({ view }, '', '/'); } render(); window.scrollTo(0, 0); };
window.addEventListener('popstate', (e) => { view = e.state?.view ?? ''; render(); window.scrollTo(0, 0); });
// 앱 안 링크: <a href="/" data-go="화면"> — 주소에는 '/'만 보인다
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-go], a.brand');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault(); go(a.dataset.go || '');
});

// ───────────────────────── 공통
const firstUnanswered = () => QUESTIONS.findIndex((q) => typeof st?.answers?.[q.id]?.v !== 'number');
function headerHtml() {
  const res = st && st.meta.company && Object.keys(st.answers).length && view !== 'result' ? '<a class="btn white sm" href="/" data-go="result">결과 보기</a>' : '';
  const act = `<div class="hd-act">${res}<a class="btn call sm" href="${telHref}" aria-label="상담전화 ${COMPANY.tel}">${PHONE_ICON}<span>상담전화</span></a></div>`;
  return `<header class="site"><div class="wrap hd"><a class="brand" href="/" aria-label="BECONIC IR 진단 처음으로"><img src="/assets/shield.png" alt="" width="34" height="34"><span class="txt"><b>BECONIC</b><small>IR 진단 · by Growth Ventures</small></span></a>${act}</div></header>`;
}
function footerHtml() {
  return `<footer class="site"><div class="wrap ft"><div class="f-brand"><img src="/assets/shield-white.png" alt="" width="40" height="40"><div><b>BECONIC</b><small>IR 진단 · by Growth Ventures</small></div></div>
  <p class="f-info">${COMPANY.name} · ${COMPANY.addr}<br>전화 <a href="${telHref}">${COMPANY.tel}</a> · 이메일 <a href="mailto:${COMPANY.email}">${COMPANY.email}</a> · <a href="${COMPANY.webUrl}" target="_blank" rel="noopener">${COMPANY.web}</a></p>
  <p class="f-cert">중소벤처기업부 공식 인증 중소기업상담회사 (${COMPANY.cert})</p>
  <p class="f-legal">IR 준비도 점수는 대표 응답과 제출한 재무제표를 바탕으로 한 자가진단 결과예요. 투자 유치 여부나 기업가치를 판단·보장하지 않아요. 입력 내용과 파일은 이 브라우저에만 저장돼요.</p>
  <p class="f-ver">${APP.version} · 문항 ${MODEL_VERSION} · 점수 ${SCORE_VERSION}</p></div></footer>`;
}
const barColor = bandColor; // 점수 막대 색 구간은 model.js BANDS
const START_FIELDS = ['회사명', '투자 단계', '업종']; // 시작 화면에서 묻는 기본 정보
const N_CAT = CATEGORIES.length;
const ROAD_SPAN = ROADMAP_BUCKETS.map((b) => b.label.replace(/^지금 ~ /, '').replace(' 안에', '')).join('·'); // 2주·30일·90일
const GRADE_SPAN = `${GRADES[0].g}~${GRADES[GRADES.length - 1].g}`;
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
    <p class="lead">${N_CAT}개 영역 ${N_Q}문항에서 "우리 회사에 맞는 문장"을 고르고 표준재무제표를 올리면, IR 준비도 점수와 강점·보완점, 재무 지표, 실행 로드맵을 한눈에 보여 드려요.</p>
    <div class="cta-row">${resume ? `<button class="btn primary lg" data-act="resume">이어서 하기 · ${esc(st.meta.company)} (${n}/${N_Q})</button><button class="btn outline lg" data-act="new">처음부터 새로 시작</button>` : `<button class="btn primary lg" data-act="new">IR 진단 시작하기 · 약 ${estMinutes()}분</button>`}</div>
    <p class="micro">회원가입 없음 · 입력 내용과 파일은 이 브라우저에만 저장 · <button class="link sm" data-act="sample">합성 예시 결과 보기</button></p>
  </div>
  <div class="hero-card" aria-label="결과 화면 예시"><div class="hc-top"><span>IR 진단 결과</span><small>합성 예시</small></div>
    <div class="hc-g">${gauge(demo.overall, demo.grade, { size: 240 })}</div>
    <div class="cbars">${CATEGORIES.slice(0, 4).map((c) => catBar(demo.cats[c.id])).join('')}</div></div></div></section>

  <section class="wrap"><h2 class="sec-t">이렇게 진단해요</h2><div class="cards4">
    ${[['1', `${SCALE_MAX}점 척도 진단`, `${CATEGORIES.map((c) => c.short).join('·')} ${N_CAT}개 영역, 문항마다 행동 기준 문장 ${SCALE_MAX}개 중 하나만 고르면 돼요.`],
       ['2', '표준재무제표 분석', '홈택스 표준재무제표증명 PDF를 올리면 매출·이익·부채를 읽어 지표로 보여 드려요. 파일은 업로드되지 않아요.'],
       ['3', '강점·보완점', '종합 점수에 영향이 큰 순서로 보완할 문항과 다음 단계를 짚어 드려요.'],
       ['4', '실행 로드맵·PDF', `${ROAD_SPAN} 할 일과 결과 보고서 PDF로 바로 실행에 옮길 수 있어요.`]]
      .map(([i, t, d]) => `<div class="fcard"><span class="ic">${i}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div></section>

  <section class="wrap two">
    <div class="panel ok-p"><h3>결과에서 볼 수 있는 것</h3><ul><li>종합 IR 준비도 점수·등급(${GRADE_SPAN})과 영역별 점수</li><li>투자자 관점 ${LENSES.length}가지 질문과 경계 신호</li><li>강점 ${TOP_N}개, 먼저 보완할 ${TOP_N}개와 목표 단계</li><li>매출 성장률·영업이익률·부채비율 등 재무 지표</li><li>${ROAD_SPAN} 실행 로드맵(산출물 포함)</li></ul></div>
    <div class="panel no-p"><h3>점수의 의미</h3><ul><li>대표 응답과 제출한 재무제표를 바탕으로 한 자가진단이에요</li><li>투자 유치 여부나 기업가치를 판단·보장하지 않아요</li><li>투자 단계(예비창업~시리즈A 이상)에 따라 영역 비중이 달라요</li><li>근거 자료 확보율을 점수와 함께 보여 드려요</li></ul></div>
  </section>

  <section class="wrap steps"><h2 class="sec-t">진행 순서</h2><ol>
    <li><b>기본 정보 ${START_FIELDS.length}가지</b><span>${START_FIELDS.join('·')} (30초)</span></li><li><b>${N_Q}문항 진단</b><span>한 화면에 한 문항 (약 ${estMinutes()}분)</span></li>
    <li><b>재무제표 올리기</b><span>표준재무제표 PDF 또는 직접 입력 (선택)</span></li><li><b>결과·PDF</b><span>대시보드와 결과 보고서</span></li></ol></section>

  <section class="wrap consult"><div class="cbox"><div><b>결과를 보고 IR을 함께 준비하고 싶다면</b><p>그로스벤처스는 중기부 인증 중소기업상담회사(${COMPANY.cert})예요. 15년 경력 컨설턴트가 진단 결과를 바탕으로 IR 자료와 투자 준비를 함께 설계해 드려요.</p></div>
    <div class="cbtn"><a class="btn primary" href="${telHref}">${PHONE_ICON}상담전화 ${COMPANY.tel}</a><a class="btn ghost" href="mailto:${COMPANY.email}?subject=IR 진단 상담 문의">이메일 문의</a></div></div></section>
  </main>${footerHtml()}`;
}

// ───────────────────────── 시작(기본 정보)
function startHtml() {
  const m = (st || blank()).meta;
  return `${headerHtml()}<main class="wrap narrow"><button class="back" data-act="home">← 처음으로</button>
  <h1 class="pg-t">회사 정보 ${START_FIELDS.length}가지만 알려 주세요</h1><p class="pg-s">투자 단계에 따라 영역별 비중이 달라져요.</p>
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
  <div class="qtop"><div class="qtop-r"><button class="back" style="margin:0" data-act="${i === 0 ? 'to-start' : 'prev'}">← ${i === 0 ? '기본 정보' : '이전'}</button><span>${st.meta.synthetic ? '<em class="syn-tag">합성 예시</em> ' : ''}${i + 1} / ${N_Q}</span></div><div class="qbar" aria-hidden="true"><i style="width:${Math.round((done / N_Q) * 100)}%"></i></div></div>
  <span class="qcat">${ci + 1}. ${nb(c.name)} · ${k}/${inCat.length}</span>
  <h1 class="qtitle">${nb(q.q)}</h1><p class="qwhy">${esc(q.why)}</p>
  <div class="opts" role="radiogroup" aria-label="가장 가까운 문장 고르기">
    ${q.opts.map((t, j) => `<button role="radio" aria-checked="${a.v === j + 1}" class="opt ${a.v === j + 1 ? 'on' : ''}" data-act="pick" data-v="${j + 1}"><span class="n">${j + 1}</span><span class="ot">${esc(t)}</span><span class="ck" aria-hidden="true">${a.v === j + 1 ? '선택됨' : ''}</span></button>`).join('')}
    <button role="radio" aria-checked="${a.v === 0}" class="opt unk ${a.v === 0 ? 'on' : ''}" data-act="pick" data-v="0">잘 모르겠어요${a.v === 0 ? ' · 선택됨' : ''}</button>
  </div>
  <label class="evtog"><input type="checkbox" data-act="ev" ${a.ev ? 'checked' : ''}><span>이 내용을 보여 줄 문서·데이터가 있어요</span><small>선택</small></label>
  <p class="hint qhint">${typeof a.v === 'number' ? '선택했어요. "다음"을 누르거나 같은 보기를 한 번 더 누르면 넘어가요.' : `가장 가까운 문장을 골라 주세요.<span class="pc-only"> 키보드 1~${SCALE_MAX}, Enter로도 돼요.</span>`}</p></main>
  <div class="bottom-bar"><div class="wrap narrow bb"><a class="btn ghost" href="/" data-go="answers">전체 문항</a><button class="btn ${typeof a.v === 'number' ? 'primary' : 'ghost'}" data-act="next">${i === N_Q - 1 ? '재무제표 단계로 ›' : '다음 ›'}</button></div></div>`;
}

// ───────────────────────── 재무(3개년: 최근 연도·전년도·전전년도) — 읽은 값과 고친 값은 바로 이 브라우저에 저장된다
const MAX_FILES = SLOTS.length * 2; // 파일 목록에 남길 개수
const finBlank = (source = 'upload') => ({ source, confirmed: true, y0: '', cur: {}, prev: {}, pp: {}, files: [] });
const slotHas = (f, k) => CORE.some((a) => typeof f?.[k]?.[a] === 'number');
function financeHtml() {
  const f = st.fin; const n = f ? filledYears(f) : 0;
  const cell = (a, s) => { const v = f[s.k]?.[a.k]; return `<td><input inputmode="decimal" data-fin="${s.k}" data-k="${a.k}" value="${typeof v === 'number' ? v.toLocaleString('ko-KR') : ''}" aria-label="${esc(a.label)} ${s.label}" placeholder="—"></td>`; };
  const files = f?.files?.length ? `<ul class="flist">${f.files.map((x) => `<li class="${x.type}"><b>${esc(x.name)}</b><span>${esc(x.text)}</span></li>`).join('')}</ul>` : '';
  const grid = f ? `<section class="card"><div class="fhd"><h3>연도별 값 <span class="muted sm">${n ? `${n}개년 입력됨` : '아직 비어 있어요'}</span></h3>
      <label class="y0">최근 연도<input data-act="fin-y0" inputmode="numeric" maxlength="4" value="${esc(f.y0 || '')}" placeholder="예: ${Number(today().slice(0, 4)) - 1}" aria-label="최근 연도(귀속 연도)">년</label></div>
    <p class="hint">원 단위예요. "1.2억", "3,500만"처럼 써도 되고, 손실은 앞에 -를 붙여요. 고친 값은 바로 저장돼요. <b>*</b> 표시는 꼭 필요한 항목이에요.<span class="m-only"> 표를 옆으로 밀면 전년도·전전년도 칸이 나와요.</span></p>
    <div class="tw ftw"><table class="ftbl3"><thead><tr><th>계정</th>${SLOTS.map((s, i) => `<th>${esc(slotLabel(f, i))}${slotHas(f, s.k) ? '' : '<small>비어 있음</small>'}</th>`).join('')}</tr></thead>
    <tbody>${ACCOUNTS.map((a) => `<tr><th scope="row">${esc(a.label)}${CORE.includes(a.k) ? ' <i>*</i>' : ''}</th>${SLOTS.map((s) => cell(a, s)).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="res-act"><button class="link danger" data-act="fin-clear">재무 정보 모두 지우기</button></div></section>` : '';
  return `${headerHtml()}<main class="wrap narrow"><button class="back" data-act="to-last">← 문항으로</button>
  <h1 class="pg-t">재무제표를 올려 주세요 <span class="muted" style="font-size:.6em;font-weight:600">(선택)</span></h1>
  <p class="pg-s">최근 연도·전년도·전전년도까지 최대 ${SLOTS.length}개년을 넣을 수 있어요. 1개년만 넣어도, 하나도 없어도 결과를 볼 수 있어요 — 넣은 만큼 재무 해석이 더해져요.</p>
  ${n ? `<div class="stat ok">재무제표 ${n}개년이 결과에 반영돼요${n < SLOTS.length ? ` · ${SLOTS.slice(n).map((s) => s.label).join('·')}를 더 넣으면 추이를 볼 수 있어요` : ''}.</div>` : ''}
  <label class="drop" id="drop"><input type="file" accept="application/pdf,.pdf" multiple data-act="fin-file" hidden><b>표준재무제표증명 PDF 고르기</b><span>연도별 파일 여러 개를 한 번에 골라도 돼요 · 연도를 읽어 알맞은 칸에 넣어요 · 파일은 이 기기 안에서만 읽어요</span></label>
  ${files}
  ${f ? '' : '<div class="res-act"><button class="btn white" data-act="fin-manual">숫자 직접 입력하기</button></div>'}
  <details class="how"><summary>표준재무제표증명은 어디서 받나요?</summary><ol>
    <li>국세청 홈택스(www.hometax.go.kr)에 로그인해요(법인은 법인 인증서).</li><li>민원증명 → <b>표준재무제표증명</b>을 선택해요.</li>
    <li>귀속 연도를 하나씩(최근 연도·전년도·전전년도) 발급해 인쇄 화면에서 <b>PDF로 저장</b>해요.</li><li>저장한 PDF를 위에 올려 주세요. 스캔한 이미지 PDF는 글자를 읽을 수 없어 직접 입력으로 안내해요.</li></ol></details>
  ${grid}</main>
  <div class="bottom-bar"><div class="wrap narrow bb"><span class="sm muted">${n ? `${n}개년 반영` : '없어도 결과는 볼 수 있어요'}</span><button class="btn primary" data-act="to-result">${n ? '결과 보기 ›' : '건너뛰고 결과 보기 ›'}</button></div></div>`;
}

// ───────────────────────── 결과 — 대표가 읽는 순서: 결론 → 투자자 눈 → 영역 → 재무 → 물어볼 질문 → 할 일 → 서류 → 상세
const RNAV = [['r-sum', '요약'], ['r-lens', '투자자 관점'], ['r-cat', '영역 점수'], ['r-sw', '강점·보완'], ['r-fin', '재무'], ['r-ask', '나올 질문'], ['r-road', '로드맵'], ['r-room', '준비 서류'], ['r-detail', '영역 상세']];
const ROOM_STATE = { ready: ['ok', '준비됨'], partial: ['info', '보완 필요'], todo: ['warn', '준비 전'] };
const yl = (l) => (l.match(/(\d{4})년/) || [])[1] || l.replace(/\(.*\)/, ''); // 차트용 짧은 연도 라벨
const pctTxt = (v) => (v === null || v === undefined ? '—' : `${v}%`);
function finSection(r) {
  if (!r.fin.has) {
    return `<div class="stat warn">재무제표가 반영되지 않았어요. 재무·자금 점수는 대표 응답만으로 계산했어요.</div>
    <p class="hint">투자자는 미팅 전후로 표준재무제표를 가장 먼저 요청해요. 최근 연도·전년도·전전년도를 올리면 아래 내용이 결과에 더해져요.</p>
    <ul class="plain"><li>연도별 매출·영업이익·순이익 추이 차트와 표</li><li>매출 성장률·영업이익률·부채비율·유동비율·자본잠식 여부</li><li>"매출이 있다"는 응답과 재무제표가 맞는지 교차 확인</li></ul>
    <a class="btn primary" href="/" data-go="finance">표준재무제표 올리기</a>`;
  }
  const rows = r.years; const old = rows.slice().reverse();
  const src = st.fin.source === 'upload' ? `표준재무제표에서 읽고 확인한 값${r.fin.fileName ? `(${esc(r.fin.fileName)})` : ''}` : '직접 입력한 값';
  return `<p class="hint">${src} · ${r.fin.years}개년 반영. 참고 구간은 일반적인 기준선이며 업종별 차이가 커요.</p>
    ${r.finStory.length ? `<ul class="story">${r.finStory.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <h4 class="sub-t">재무 4대 영역 진단</h4>
    <div class="fscore">${r.finAreas.map((a) => `<div class="fs ${a.tone || 'none'}"><div class="lh"><b>${a.name}</b><span class="bdg ${a.tone === 'good' ? 'ok' : a.tone === 'warn' ? 'bad' : a.tone ? 'info' : ''}">${a.tone === 'good' ? '양호' : a.tone === 'warn' ? '주의' : a.tone ? '보통' : '자료 없음'}</span></div><p class="lq">${esc(a.q)}</p><p>${esc(a.verdict)}</p>${a.items.length ? `<p class="sm muted">${a.items.map((x) => `${esc(x.label)} ${x.value === null ? esc(x.text || '—') : `${x.value}${x.unit}`}`).join(' · ')}</p>` : ''}</div>`).join('')}</div>
    ${rows.length >= FIN_YEARS_GOOD ? `<div class="fcharts">
      <figure class="chbox"><figcaption><b>매출·영업이익·순이익</b><small>연도별 금액 · 0선 아래는 손실</small></figcaption>${trend(old.map((x) => ({ label: yl(x.label), rev: x.rev, op: x.op, net: x.net })), { width: 380, height: 230 })}</figure>
      <figure class="chbox"><figcaption><b>이익률 추이</b><small>영업이익률·순이익률 · 높을수록 좋음</small></figcaption>${lineChart(old.map((x) => yl(x.label)), [{ name: '영업이익률', color: '#00a37a', vals: old.map((x) => x.opm) }, { name: '순이익률', color: '#f0a43a', vals: old.map((x) => x.npm) }], { label: '이익률 추이' })}</figure>
      <figure class="chbox"><figcaption><b>부채비율·유동비율 추이</b><small>부채비율은 낮을수록, 유동비율은 높을수록 좋음</small></figcaption>${lineChart(old.map((x) => yl(x.label)), [{ name: '부채비율', color: '#e5484d', vals: old.map((x) => x.debt) }, { name: '유동비율', color: '#3182f6', vals: old.map((x) => x.current) }], { label: '부채비율·유동비율 추이' })}</figure></div>` : ''}
    <div class="tw"><table class="ytbl"><thead><tr><th>구분</th>${old.map((x) => { const m = x.label.match(/^(.+?)\((\d{4})년\)$/); return `<th>${m ? `${esc(m[1])}<small>${m[2]}년</small>` : esc(x.label)}</th>`; }).join('')}</tr></thead><tbody>
      ${[['매출액', 'rev'], ['영업이익', 'op'], ['당기순이익', 'net'], ['자본총계', 'equity']].map(([l, k]) => `<tr><th scope="row">${l}</th>${old.map((x) => `<td class="${typeof x[k] === 'number' && x[k] < 0 ? 'neg' : ''}">${fmtWon(x[k], true)}</td>`).join('')}</tr>`).join('')}
      ${[['매출 성장률', 'growth'], ['영업이익률', 'opm'], ['순이익률', 'npm'], ['부채비율', 'debt'], ['유동비율', 'current']].map(([l, k]) => `<tr><th scope="row">${l}</th>${old.map((x) => `<td>${pctTxt(x[k])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <h4 class="sub-t">최근 연도 지표</h4>
    <div class="kpis">${r.indicators.map((x) => `<div class="kpi ${x.band || ''}"><span>${esc(x.label)}</span><b>${x.value === null ? esc(x.text || '계산 불가') : `${x.value}${x.unit}`}</b><small>${esc(x.note)}</small></div>`).join('')}</div>
    <div class="res-act"><a class="btn white sm" href="/" data-go="finance">재무 ${r.fin.years < SLOTS.length ? '연도 추가·' : ''}수정</a></div>`;
}
// 영역 상세: 행마다 한 줄 요약(강점·보완 문항), 섹션 위 핵심 요약
const vOf = (q) => { const v = st.answers[q.id]?.v; return typeof v !== 'number' ? null : v === 0 ? UNKNOWN_AS : v; };
function catKey(a) {
  const qs = qByCatLocal(a.c.id).filter((q) => vOf(q) !== null).sort((x, y) => vOf(y) - vOf(x));
  if (!qs.length) return '<span class="muted">미응답</span>';
  const best = qs[0]; const worst = qs[qs.length - 1];
  return `${vOf(best) >= STRONG_MIN ? `<em class="kg">강점</em> ${esc(best.title)}` : ''}${vOf(worst) <= WEAK_MAX ? `${vOf(best) >= STRONG_MIN ? ' · ' : ''}<em class="kw">보완</em> ${esc(worst.title)}` : ''}` || '<em class="kg">고르게 양호</em>';
}
function detailSummary(r) {
  const sc = r.analysis.filter((a) => a.score !== null); if (!sc.length) return '';
  const met = sc.filter((a) => a.gap >= 0).length; const best = [...sc].sort((x, y) => y.score - x.score)[0]; const worst = [...sc].sort((x, y) => x.gap - y.gap || x.score - y.score)[0];
  return `<div class="dsum"><div><span>단계 기대 충족</span><b>${met}/${sc.length}</b><small>영역</small></div><div><span>가장 강한 영역</span><b>${nb(best.c.name)}</b><small>${best.score}점</small></div><div><span>가장 시급한 영역</span><b>${nb(worst.c.name)}</b><small>${worst.gap < 0 ? `기대보다 ${-worst.gap}점 낮음` : `${worst.score}점`}</small></div>
  <p>${worst.gap < 0 ? `${esc(worst.c.name)} 영역부터 보완하세요. ${worst.actions[0] ? `첫 할 일은 <b>${esc(worst.actions[0].q.title)}</b>을(를) "${esc(worst.actions[0].action)}" 수준으로 만드는 거예요.` : ''}` : '모든 영역이 단계 기대 수준을 넘었어요. 근거 자료를 갖춰 강점을 증명하세요.'}</p></div>`;
}
function resultHtml() {
  const r = evaluate(st);
  if (!r.answered) return `${headerHtml()}<main class="wrap narrow"><div class="card" style="margin-top:24px;text-align:center"><h3>아직 응답이 없어요</h3><p class="hint">${N_Q}문항에 답하면 결과를 보여 드려요.</p><a class="btn primary" href="/" data-go="q/1">진단 시작하기</a></div></main>`;
  const stage = r.stageLabel;
  const qn = (id) => QUESTIONS.findIndex((q) => q.id === id) + 1;
  const adj = INDUSTRY_ADJ[r.industry] ? ` · ${esc(r.industry)} 업종 보정` : '';
  const roadCol = (t, sub, list) => `<div><h4>${t} <span class="muted sm">${sub}</span></h4>${list.length ? `<ol>${list.map((x) => `<li>${x.q ? `<b>${esc(x.q.title)}</b> — ${esc(x.action)}<small>만들 자료: ${esc(x.doc)} · 달성 시 +${x.gainTo}점</small>` : `${esc(x.action)}<small>만들 자료: ${esc(x.doc)}</small>`}</li>`).join('')}</ol>` : '<p class="sm muted">없음</p>'}</div>`;
  const ansText = (q) => { const a = st.answers[q.id] || {}; return typeof a.v !== 'number' ? '미응답' : a.v === 0 ? '잘 모르겠어요' : esc(q.opts[a.v - 1]); };
  const sec = (id, t, hint, body, cls = '') => `<section class="card ${cls}" id="${id}"><h3>${t}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}${body}</section>`;
  const room = r.dataRoom; const ready = room.filter((d) => d.state === 'ready').length;
  return `${headerHtml()}<main class="wrap">
  ${st.meta.synthetic ? '<div class="syn-band">합성 예시 결과예요. 실제 기업 자료가 아니에요.</div>' : ''}
  <div class="res-h"><div><small>${esc(stage)} · ${esc(st.meta.industry || '업종 미선택')} · ${today()}</small><h1>${esc(st.meta.company)} IR 진단 결과</h1></div>
    <div class="res-act" style="margin:0"><button class="btn primary" data-act="print">결과 보고서 PDF</button><a class="btn white" href="/" data-go="answers">답변 수정</a></div></div>
  <nav class="rnav" aria-label="결과 바로 가기">${RNAV.map(([id, t]) => `<button data-act="jump" data-to="${id}">${t}</button>`).join('')}</nav>

  <section class="card" id="r-sum"><div class="sum-card"><div class="ch-wrap">${gauge(r.overall, r.grade, { size: 250 })}</div>
    <div><ul class="sum-lines">${r.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="badges"><span class="bdg ${r.complete ? 'ok' : 'warn'}">응답 ${r.answered}/${N_Q}</span><span class="bdg info">근거 자료 ${r.evidenceRate}%</span><span class="bdg ${r.fin.has ? 'ok' : 'warn'}">${r.fin.has ? `재무제표 ${r.fin.years}개년 반영` : '재무제표 미반영'}</span><span class="bdg info">준비 서류 ${ready}/${room.length}</span>${r.unknown.length ? `<span class="bdg warn">모르겠어요 ${r.unknown.length}</span>` : ''}${r.flags.length ? `<span class="bdg bad">경계 신호 ${r.flags.length}</span>` : ''}</div></div></div></section>

  ${r.flags.length ? sec('r-flag', '투자자가 멈칫할 수 있는 부분', '투자 검토에서 질문이 몰리는 지점이에요. 미팅 전에 먼저 정리해 두세요.', `<ul class="chk-l">${r.flags.map((f) => `<li class="warn">${esc(f.text)}${f.qid ? ` <a href="/" data-go="q/${qn(f.qid)}">응답 보기</a>` : ''}</li>`).join('')}</ul>`, 'flags') : ''}

  ${sec('r-lens', '투자자 관점 진단', `투자 심사에서 실제로 묻는 ${LENSES.length}가지 질문으로 응답을 다시 묶었어요. 질문마다 실사에서 확인하는 자료도 적었어요.`,
    `<div class="lenses">${r.lenses.map((l) => `<div class="lens ${l.verdict?.tone || ''}"><div class="lh"><b>${esc(l.name)}</b><em>${l.score ?? '—'}</em></div><p class="lq">${esc(l.q)}</p>
      <div class="track"><i style="width:${l.score ?? 0}%;background:${barColor(l.score ?? 0)}"></i></div>
      <p class="lv">${l.verdict ? esc(l.verdict.text) : '응답 없음'}${l.note ? ` · <span class="muted">${esc(l.note)}</span>` : ''}</p>
      ${l.weakest && l.verdict?.tone !== 'good' ? `<p class="lw">가장 약한 부분: <a href="/" data-go="q/${qn(l.weakest.id)}">${esc(l.weakest.title)}</a></p>` : ''}<p class="ld">실사 확인 자료: ${esc(l.docs)}</p></div>`).join('')}</div>`)}

  <div class="grid2" id="r-cat">
    <section class="card"><h3>영역별 점수</h3><p class="hint">파란 면이 우리 점수, 주황 점선이 ${esc(stage)} 단계 기대 수준이에요. 점선 안쪽으로 들어간 영역(빨간 숫자)이 먼저 보완할 곳이에요.</p><div class="ch-wrap radar-wrap">${radar(CATEGORIES.map((x) => ({ name: x.short, score: r.cats[x.id].score, expect: r.cats[x.id].expect })), { size: 440, font: 14 })}</div></section>
    <section class="card"><h3>${esc(stage)} 단계 기대 수준과 비교</h3><p class="hint">세로선은 ${esc(stage)} 단계 투자 검토에서 갖추면 좋은 수준(비코닉 기준)이에요. 비중으로 종합 점수를 계산해요${adj}.</p><div class="cbars">
      ${CATEGORIES.map((x) => { const cc = r.cats[x.id]; return `<div class="cbar"><b>${nb(x.name)}</b><div class="track"><i style="width:${cc.score ?? 0}%;background:${barColor(cc.score ?? 0)}"></i><s style="left:${cc.expect}%"></s></div><em>${cc.score ?? '—'}</em><small>비중 ${cc.weight}% · 기대 ${cc.expect} · ${cc.gap === null ? '미응답' : cc.gap >= 0 ? '충족' : `<span class="gap">${cc.gap}</span>`} · 근거 ${cc.ev}/${cc.total}</small></div>`; }).join('')}</div></section>
  </div>

  <div class="grid2" id="r-sw">
    <section class="card"><h3>투자자에게 먼저 보여 줄 강점</h3><div class="lst">${r.strengths.length ? r.strengths.map((x) => `<div class="it good"><div class="h"><span>${esc(x.q.title)} <span class="muted sm">${esc(CMAP[x.q.cat].name)}</span></span>${dots(x.v)}</div><p>${esc(x.text)}${x.ev ? '' : ' · 근거 자료를 함께 준비하세요'}</p></div>`).join('') : `<p class="hint">${STRONG_MIN}점 이상인 문항이 아직 없어요.</p>`}</div></section>
    <section class="card"><h3>먼저 보완할 ${TOP_N}가지</h3><p class="hint">점수를 올릴 여지가 크고 비중이 높은 순서예요.</p><div class="lst">${r.weaknesses.map((w) => `<div class="it need"><div class="h"><span>${esc(w.q.title)} <span class="muted sm">${esc(CMAP[w.q.cat].name)}</span></span>${dots(w.v)}</div><p>지금: ${esc(w.now)}</p><p class="nx"><b>목표</b> ${esc(w.next)} <span class="muted sm">(달성 시 +${w.gainTo}점)</span></p><p class="sm muted">만들 자료: ${esc(w.doc)}</p></div>`).join('') || `<p class="hint">${WEAK_MAX}점 이하 문항이 없어요.</p>`}</div></section>
  </div>

  ${sec('r-fin', '재무', '', `${finSection(r)}${r.checks.length ? `<h4 class="sub-t">응답과 재무제표 확인</h4><ul class="chk-l">${r.checks.map((x) => `<li class="${x.type}">${esc(x.text)}${x.qid ? ` <a href="/" data-go="q/${qn(x.qid)}">응답 보기</a>` : ''}</li>`).join('')}</ul>` : ''}`)}

  ${sec('r-ask', '투자자가 물어볼 질문', '점수가 낮은 영역부터, 미팅에서 실제로 자주 나오는 질문이에요. 답을 한두 문장과 숫자로 미리 적어 두세요.',
    `<div class="asks">${r.asks.map((a) => `<div class="ask"><div class="lh"><b>${nb(a.c.name)}</b><em>${a.score}</em></div><ol>${a.qs.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${a.weak.length ? `<p class="sm muted">답을 준비하며 함께 보완할 문항: ${a.weak.map(esc).join(', ')}</p>` : ''}</div>`).join('')}</div>`)}

  ${sec('r-road', '보완 로드맵', `종합 점수에 영향이 큰 순서로 고른 뒤, 보완 난이도에 맞춰 기간에 배치했어요. 목표는 바로 다음 단계(최소 ${GOAL_FLOOR}단계·문서화 수준)예요.`,
    `<div class="road">${ROADMAP_BUCKETS.map((b) => roadCol(b.label, b.sub, r.roadmap[b.key])).join('')}</div>`)}

  ${sec('r-room', '투자 준비 서류 체크리스트', `투자자가 실사에서 요청하는 서류예요. 응답과 근거 체크로 준비 상태를 판단했어요(준비됨 ${ready}/${room.length}).`,
    `<div class="room">${room.map((d) => `<div class="rm ${d.state}"><span class="bdg ${ROOM_STATE[d.state][0]}">${ROOM_STATE[d.state][1]}</span><b>${esc(d.name)}</b><small>${esc(d.note)}</small></div>`).join('')}</div>`)}

  ${sec('r-detail', '영역별 상세 진단', '영역마다 투자자가 보는 포인트, 지금 상태, 보완 목표와 투자자가 물어볼 질문이에요. 누르면 펼쳐져요.',
    `${detailSummary(r)}` + r.analysis.map((a) => `<details class="qd"><summary><span class="qn">${nb(a.c.name)}</span><span class="bdg ${a.gap === null ? '' : a.gap >= 0 ? 'ok' : 'warn'}">${esc(a.status)}</span><span class="qk">${catKey(a)}</span><span class="qbar" aria-hidden="true"><i style="width:${a.score ?? 0}%;background:${barColor(a.score ?? 0)}"></i><s style="left:${a.expect}%"></s></span><span class="qsc">${a.score ?? '—'}점 ›</span></summary>
    <div class="ana"><p class="av"><b>투자자가 보는 포인트</b> ${esc(a.c.view)}</p>${a.diag ? `<p><b>지금 상태</b> ${esc(a.diag)}</p>` : ''}
    ${a.actions.length ? `<p><b>보완 목표</b></p><ul>${a.actions.map((x) => `<li>${esc(x.q.title)} — ${esc(x.action)} <span class="muted sm">(${EFFORT[x.effort]} · 만들 자료: ${esc(x.doc)})</span></li>`).join('')}</ul>` : ''}
    ${a.asks.length ? `<p><b>투자자가 물어볼 질문</b></p><ul>${a.asks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${qByCatLocal(a.c.id).map((q) => `<div class="qrow"><div><b>${esc(q.title)} ${dots(st.answers[q.id]?.v)}</b><span>${ansText(q)}${st.answers[q.id]?.ev ? ' · 근거 있음' : ''}</span></div><a href="/" data-go="q/${qn(q.id)}">수정</a></div>`).join('')}</div></details>`).join(''))}

  <section class="card method"><h3>점수는 이렇게 계산해요</h3>
    <p>문항은 1~${SCALE_MAX}점(잘 모르겠어요 = ${UNKNOWN_AS}점), 영역 점수 = 문항 평균 × ${SCORE_FACTOR}, 종합 = 투자 단계별 영역 비중(기술 집약 업종은 기술역량 비중 보정)으로 가중 평균해요. 대표 응답과 제출한 재무제표 기반의 자가진단이며, 투자 유치 여부나 기업가치를 판단·보장하지 않아요.</p>
    <div class="tw"><table><thead><tr><th>등급</th>${GRADES.map((g) => `<th>${g.g}</th>`).join('')}</tr></thead><tbody><tr><td>기준</td>${GRADES.map((g) => `<td>${g.min}+</td>`).join('')}</tr></tbody></table></div>
    <p class="sm">영역 구성은 ${Object.values(SOURCES).slice(0, 2).map((x) => `${esc(x.publisher)} 「${esc(x.title)}」`).join(', ')}의 투자 설명 항목을 참고했어요. 가중치·단계 기대 수준·업종 보정은 비코닉 설계값(실증 검증 전)이에요.</p></section>

  <div class="res-act"><button class="btn primary" data-act="print">결과 보고서 PDF</button><a class="btn white" href="/" data-go="finance">재무 ${r.fin.has ? '수정' : '올리기'}</a><button class="btn white" data-act="export">결과 파일 저장</button><label class="btn white file">결과 파일 열기<input type="file" accept="application/json,.json" data-act="import" hidden></label><button class="link danger" data-act="reset">모두 지우기</button></div>
  <section class="consult" style="margin-top:24px"><div class="cbox"><div><b>보완 항목을 함께 준비하고 싶다면</b><p>진단 결과를 바탕으로 IR 덱·재무 자료·투자 전략을 함께 설계해 드려요.</p></div><div class="cbtn"><a class="btn primary" href="${telHref}">${PHONE_ICON}상담전화 ${COMPANY.tel}</a><a class="btn ghost" href="mailto:${COMPANY.email}?subject=IR 진단 결과 상담">이메일 상담</a></div></div></section>
  </main>${footerHtml()}`;
}
const qByCatLocal = (cid) => QUESTIONS.filter((q) => q.cat === cid);

function answersHtml() {
  const r = evaluate(st);
  return `${headerHtml()}<main class="wrap narrow"><button class="back" data-act="result-or-home">← 돌아가기</button><h1 class="pg-t">전체 문항</h1><p class="pg-s">${r.answered}/${N_Q} 응답 · 누르면 해당 문항으로 가요.</p>
  ${CATEGORIES.map((c) => `<section class="card"><h3>${nb(c.name)} <span class="muted sm">${r.cats[c.id].score ?? '—'}점</span></h3>${QUESTIONS.filter((q) => q.cat === c.id).map((q) => { const a = st.answers[q.id] || {};
    return `<div class="qrow"><div><b>${esc(q.title)} ${dots(a.v)}</b><span>${typeof a.v !== 'number' ? '<b style="color:var(--warn);display:inline">미응답</b>' : a.v === 0 ? '잘 모르겠어요' : esc(q.opts[a.v - 1])}</span></div><a href="/" data-go="q/${QUESTIONS.indexOf(q) + 1}">${typeof a.v === 'number' ? '수정' : '답하기'}</a></div>`; }).join('')}</section>`).join('')}
  </main><div class="bottom-bar"><div class="wrap narrow bb"><a class="btn ghost" href="/" data-go="finance">재무제표</a><a class="btn primary" href="/" data-go="result">결과 보기 ›</a></div></div>`;
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
  else { page = 'home'; html = homeHtml(); if (view) { view = ''; history.replaceState({ view }, '', '/'); } }
  $('#app').innerHTML = html;
  document.body.dataset.route = page || 'home';
  bindDrop();
}
function bindDrop() {
  const d = $('#drop'); if (!d) return;
  ['dragenter', 'dragover'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove('over'); }));
  d.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
}

// ───────────────────────── 재무 처리 — 여러 파일을 차례로 읽어 연도 칸에 넣고 바로 저장
async function handleFiles(list) {
  const files = [...list]; if (!files.length) return;
  toast(`재무제표 ${files.length}개를 읽고 있어요…`);
  st.fin ||= finBlank();
  let { readPdfLines } = {};
  for (const file of files) {
    let note;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') note = { type: 'warn', text: 'PDF 파일이 아니라 읽지 않았어요.' };
    else {
      try {
        readPdfLines ||= (await import('./pdfread.js')).readPdfLines;
        const { lines, textless } = await readPdfLines(file);
        const parts = textless ? [] : parseFile(lines);
        if (textless) note = { type: 'warn', text: '글자를 읽을 수 없는 PDF예요(스캔 이미지일 수 있어요). 아래 표에 직접 입력해 주세요.' };
        else if (!parts.length) note = { type: 'warn', text: '재무제표가 아니에요(손익계산서·재무상태표 표제나 계정을 찾지 못했어요). 표준재무제표증명 PDF인지 확인해 주세요.' };
        else {
          const placed = [];
          for (const p of parts) {
            const { draft, slot } = mergeParsed(st.fin, p); const cnt = Object.keys(p.found).length;
            if (slot < 0) { placed.push(`${p.year ? `${p.year}년` : '연도 미상'} 자료는 ${SLOTS.length}개년 범위를 벗어나 넣지 않았어요`); continue; }
            Object.assign(st.fin, draft);
            placed.push(`${p.year ? `${p.year}년 자료` : `연도 미상 자료(${SLOTS[slot].label} 칸)`} · ${cnt}개 계정 읽음${p.unit !== 1 ? `(${p.unit === 1000 ? '천원' : '백만원'} 단위를 원으로 바꿈)` : ''}`);
          }
          note = { type: placed.some((x) => x.includes('→')) ? 'ok' : 'warn', text: placed.join(' / ') };
        }
      } catch { note = { type: 'warn', text: 'PDF를 여는 중 문제가 생겼어요. 아래 표에 직접 입력해 주세요.' }; }
    }
    st.fin.files = [...(st.fin.files || []).filter((x) => x.name !== file.name), { name: file.name, ...note }].slice(-MAX_FILES);
  }
  st.fin.source = 'upload'; commit(); render();
  const n = filledYears(st.fin); toast(n ? `재무제표 ${n}개년이 저장됐어요. 값을 확인해 주세요.` : '읽은 값이 없어요. 파일 안내를 확인해 주세요.');
}
const finTidy = () => { if (!st?.fin) return; st.fin = filledYears(st.fin) || st.fin.files?.length ? normalizeFin(st.fin) : null; if (st.fin && !filledYears(st.fin) && !st.fin.files?.length) st.fin = null; commit(); };

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
  if (el.dataset.fin && st?.fin) {
    const v = parseWon(el.value); const o = (st.fin[el.dataset.fin] ||= {});
    el.classList.toggle('bad', Number.isNaN(v));
    if (v === null) delete o[el.dataset.k]; else if (!Number.isNaN(v)) o[el.dataset.k] = v;
    commit();
  }
  if (el.dataset.act === 'fin-y0' && st?.fin) { const y = el.value.replace(/\D/g, ''); if (y.length === 4 || !y) { st.fin.y0 = y; commit(); } }
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.act === 'ev') { const q = QUESTIONS[(Number(route()[1]) || 1) - 1]; st.answers[q.id] = { ...(st.answers[q.id] || {}), ev: el.checked }; commit(); return; }
  if (el.dataset.act === 'fin-file' && el.files.length) { const fs = [...el.files]; el.value = ''; await handleFiles(fs); return; } // 같은 파일을 다시 골라도 읽도록 비움
  if (el.dataset.act === 'fin-y0') { render(); return; } // 머리글(연도) 갱신
  if (el.dataset.fin) { const v = parseWon(el.value); if (typeof v === 'number' && !Number.isNaN(v)) el.value = v.toLocaleString('ko-KR'); return; } // 다시 그리지 않음(Tab으로 다음 칸 이동 유지)
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
    case 'new': if (st?.meta.company && Object.keys(st.answers).length && !confirm('저장된 진단을 지우고 새로 시작할까요? 먼저 "결과 파일 저장"을 권해요.')) return; st = blank(); go('start'); break;
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
    case 'to-result': finTidy(); go('result'); break;
    case 'result-or-home': go(Object.keys(st.answers).length ? 'result' : ''); break;
    case 'fin-manual': st.fin = finBlank('manual'); commit(); render(); break;
    case 'fin-clear': if (confirm('재무 정보를 모두 지울까요?')) { st.fin = null; commit(); render(); } break;
    case 'print': printReport(); break;
    case 'jump': { const t = document.getElementById(b.dataset.to); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; } // 주소(#)를 바꾸지 않고 이동
    case 'export': {
      const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `BECONIC_IR진단_${(st.meta.company || 'company').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)}_${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('결과 파일을 저장했어요.'); break;
    }
    case 'reset': if (confirm('이 브라우저에 저장된 IR 진단을 모두 지울까요? 되돌릴 수 없어요.')) { clear(); st = null; go(''); } break;
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
window.__IR = { get view() { return view; }, get state() { return st; }, evaluate: () => evaluate(st), go, APP, hasLegacy, WEIGHTS, N_Q, qids: QUESTIONS.map((q) => q.id) };
