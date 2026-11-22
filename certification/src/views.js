// 화면 렌더링 — 문자열 템플릿. 사용자 입력·데이터는 모두 esc()/extLink()를 거친다.
import { esc, extLink, badge, ICON, fmtDate, GROUP_LABEL, TYPE_LABEL, MANDATORY_LABEL, TARGET_LABEL, ACCESS_LABEL } from './ui.js';
import { S, leafLabel } from './engine.js';
import { searchSchemes, suggest } from './search.js';
import { TIER_LABEL } from './recommend.js';
import { EVIDENCE, readinessSentence } from './readiness.js';
import { CATEGORY, TIMEFRAME } from './model.js';

export const MAX_SELECT = 3;
const CONTACT = { tel: '02-6124-5960', telHref: 'tel:0261245960', mail: 'start@gven.kr' };

// ── 단계 정의 ──────────────────────────────────────────────
export function needsExport(st, data) {
  const a = st.answers;
  const overseas = (a.markets || []).some((m) => ['EU', 'US', 'OTHER'].includes(m));
  const productTarget = ['product', 'both'].includes(a.target);
  const productScheme = st.selected.some((id) => data.schemeMap[id] && data.schemeMap[id].target === 'product');
  return overseas || productTarget || productScheme;
}
export function steps(st, data) {
  const list = [];
  if (st.flow === 'A') list.push({ key: 'purpose', label: '목적', route: '#/a/purpose' });
  list.push({ key: 'profile', label: '기본정보', route: '#/a/profile' });
  if (needsExport(st, data)) list.push({ key: 'export', label: '제품·시장', route: '#/a/export' });
  if (st.flow === 'A') list.push({ key: 'recommend', label: '후보 추천', route: '#/a/recommend' });
  list.push({ key: 'questions', label: '인증별 질문', route: '#/questions' });
  list.push({ key: 'result', label: '결과', route: '#/result' });
  return list;
}
function progress(st, data, key) {
  const list = steps(st, data);
  const i = list.findIndex((s) => s.key === key);
  const next = list[i + 1];
  return `<div class="pbar" aria-hidden="true">${list.map((s, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>
  <p class="progress"><span><b>${list.length}단계 중 ${i + 1}단계</b> · ${esc(list[i].label)}</span>${next ? `<span>다음: ${esc(next.label)}</span>` : ''}</p>`;
}

// ── 홈 ────────────────────────────────────────────────────
export function home() {
  return `<section class="view wrap">
  <div class="hero">
    <p class="eyebrow">BECONIC 기업인증 준비도 진단</p>
    <h1 class="h1">우리 회사, 어떤 인증부터<br class="br-m"> 준비해야 할까요?</h1>
    <p class="lead">필요한 인증을 찾고, 준비요건·증빙·다음 행동을 확인하세요.</p>
  </div>
  <div class="paths">
    <a class="path primary" href="#/a/purpose" data-act="start-a">
      <span class="path-tag">처음 찾는 분</span>
      <span class="path-title">우리 회사에 맞는 인증 찾기 ${ICON.arrow}</span>
      <span class="path-sub">목적과 기본정보로 후보 인증을 추천받고 진단해요.</span>
    </a>
    <a class="path" href="#/explore" data-act="start-b">
      <span class="path-tag">목표 인증이 있는 분</span>
      <span class="path-title">원하는 인증 바로 진단 ${ICON.arrow}</span>
      <span class="path-sub">국내·해외 인증을 검색하고 바로 진단해요.</span>
    </a>
  </div>
  <form class="searchbar" role="search" data-form="home-search" action="#/explore">
    ${ICON.search}<label class="sr-only" for="home-q">인증 이름이나 목적으로 검색</label>
    <input id="home-q" name="q" type="search" placeholder="예: 벤처, 연구소, ISO, 유럽 수출" autocomplete="off" enterkeyhint="search">
    <button class="btn sm" type="submit">검색</button>
  </form>
  <ul class="values" aria-label="이 진단으로 확인하는 것">
    <li>${ICON.shield}인증 적합성</li><li>${ICON.list}필수요건</li><li>${ICON.doc}준비서류</li><li>${ICON.target}보완 우선순위</li><li>${ICON.route}실행 로드맵</li>
  </ul>
  <p class="trust">입력한 정보는 이 브라우저 안에서만 계산하고 저장하거나 보내지 않아요. 결과는 공식 기관의 최종 판단을 대신하지 않고, 준비 방향을 잡는 데 도움을 드려요.</p>
</section>`;
}

// ── 탐색·검색 ──────────────────────────────────────────────
export function explore(st, data) {
  const e = st.explore;
  const tab = (g, label) => `<button class="tab" role="tab" type="button" aria-selected="${e.group === g}" data-act="tab" data-group="${g}">${label}</button>`;
  return `<section class="view wrap">
  <h1 class="h1">인증 찾기</h1>
  <p class="lead">이름·약어·목적으로 찾아보세요. 진단 없이 내용만 봐도 괜찮아요.</p>
  <div class="searchbar">${ICON.search}<label class="sr-only" for="ex-q">인증 검색</label>
    <input id="ex-q" type="search" value="${esc(e.q)}" placeholder="예: 벤처, R&D, ISO, KC, 미국 의료기기" autocomplete="off" data-input="explore-q"></div>
  <div class="tabs" role="tablist" aria-label="분류">${tab('all', '전체')}${tab('domestic', '국내 인증·확인')}${tab('international', '해외·국제 인증 및 규제')}</div>
  <div class="filters">
    <label>대상 <select data-input="explore-target">
      ${[['all', '전체'], ['company', '회사'], ['product', '제품']].map(([v, l]) => `<option value="${v}"${e.target === v ? ' selected' : ''}>${l}</option>`).join('')}
    </select></label>
    <label><input type="checkbox" data-input="explore-diag"${e.diagOnly ? ' checked' : ''}> 자동 진단 가능만</label>
  </div>
  <div id="ex-results" aria-live="polite">${exploreResults(st, data)}</div>
  ${compareBar(st, data)}
</section>`;
}

export function exploreResults(st, data) {
  const e = st.explore;
  const res = searchSchemes(data.catalog.schemes, e.q, { group: e.group, target: e.target, diagnosable: e.diagOnly || undefined });
  if (!res.length) {
    const sg = suggest(data.catalog.schemes, e.q);
    return `<div class="empty"><p class="h3">입력하신 조건으로 확인된 인증을 찾지 못했습니다.</p>
      <p class="muted">검색 조건을 넓히거나 전문가에게 문의하세요.</p>
      ${sg.length ? `<p>혹시 ${sg.map((s) => `<a href="#/scheme/${esc(s.scheme_id)}">${esc(s.name_ko)}</a>`).join(', ')}를 찾으시나요?</p>` : ''}
      <div class="row jc-center"><button class="btn sm sec" type="button" data-act="reset-filters">필터 초기화</button><a class="btn sm ghost" href="${CONTACT.telHref}">전문가 문의</a></div></div>`;
  }
  return `<p class="muted">${res.length}개 제도</p><div class="cards two">${res.map(({ scheme: s }) => schemeCard(s, st)).join('')}</div>`;
}

function diagChip(s) {
  if (s.diagnosable) return '<span class="chip blue">기본요건 자동 진단</span>';
  if (s.self_check) return '<span class="chip">준비상태 자가점검</span>';
  if (s.triage) return '<span class="chip">적용 규정 확인 안내</span>';
  return '<span class="chip">정보 안내</span>';
}
function schemeCard(s, st) {
  const inCmp = st.compare.includes(s.scheme_id);
  return `<article class="card">
    <div class="card-head"><div><p class="muted m0">${esc(GROUP_LABEL[s.display_group])} · ${esc(TYPE_LABEL[s.scheme_type])}</p>
    <h2 class="card-title">${esc(s.name_ko)}</h2></div></div>
    <p class="m0 mb6">${esc(s.what)}</p>
    <ul class="chips"><li class="chip">대상: ${esc(TARGET_LABEL[s.target])}</li><li class="chip">${esc(MANDATORY_LABEL[s.mandatory_status])}</li>${diagChip(s)}</ul>
    <p class="muted m0">근거 확인 ${esc(fmtDate(s.last_verified_at))} · ${s.verified_status === 'VERIFIED' ? '공식 원문 대조' : '공식 근거 미검증'}</p>
    <div class="card-actions">
      <a class="btn sm ghost" href="#/scheme/${esc(s.scheme_id)}">자세히</a>
      <button class="btn sm" type="button" data-act="diagnose" data-id="${esc(s.scheme_id)}">${s.diagnosable ? '진단하기' : '확인 사항 정리'}</button>
      <label class="check-compare"><input type="checkbox" data-act="compare-toggle" data-id="${esc(s.scheme_id)}"${inCmp ? ' checked' : ''}> 비교</label>
    </div>
  </article>`;
}
export function compareBar(st, data) {
  if (!st.compare.length) return '<div id="cmpbar"></div>';
  return `<div id="cmpbar" class="comparebar"><div class="row jc-between">
    <span>${st.compare.map((id) => esc(data.schemeMap[id].name_ko)).join(', ')} <span class="muted">(최대 ${MAX_SELECT}개)</span></span>
    <a class="btn sm" href="#/compare">비교하기</a></div></div>`;
}

// ── 제도 상세 ──────────────────────────────────────────────
export function schemeDetail(st, data, id) {
  const s = data.schemeMap[id];
  if (!s) return errorView('해당 제도를 찾지 못했어요.', '#/explore', '인증 찾기로');
  const src = s.sources.map((r) => data.sourceMap[r]).filter(Boolean);
  return `<section class="view wrap narrow">
  <p><a href="#/explore">${ICON.back} 인증 찾기</a></p>
  <p class="eyebrow">${esc(GROUP_LABEL[s.display_group])} · ${esc(TYPE_LABEL[s.scheme_type])}</p>
  <h1 class="h1">${esc(s.name_ko)}</h1>
  <p class="muted">${esc(s.official_name)}</p>
  <div class="card flat"><dl class="kv">
    <dt>무엇인가요?</dt><dd>${esc(s.what)}</dd>
    <dt>언제 필요한가요?</dt><dd>${esc(s.when)}</dd>
    <dt>누가 판단하나요?</dt><dd>${esc(s.who_decides)}</dd>
    <dt>먼저 확인할 것</dt><dd>${esc(s.first_check)}</dd>
  </dl></div>
  <dl class="kv">
    <dt>제도 유형</dt><dd>${esc(TYPE_LABEL[s.scheme_type])}</dd>
    <dt>의무성</dt><dd>${esc(MANDATORY_LABEL[s.mandatory_status])}</dd>
    <dt>적용 시장</dt><dd>${esc(s.applicable_markets.map((m) => ({ KR: '대한민국', EU: '유럽연합', US: '미국', GLOBAL: '국가 무관(국제표준)' }[m] || m)).join(', '))}</dd>
    <dt>발급·확인 주체</dt><dd>${esc(s.issuing_authority)}</dd>
    <dt>평가·심사</dt><dd>${esc(s.assessment_body || '-')}</dd>
    <dt>진단 방식</dt><dd>${s.diagnosable ? '공식 근거로 검증한 기본요건만 자동 판정' : s.self_check ? '준비상태 자가점검(신청 적격성 판정 아님)' : s.triage ? '적용 규정 확인 안내(의무 여부 미판정)' : '정보 안내(자동 판정 없음)'}</dd>
  </dl>
  <p class="notice info">${esc(s.scope_note)}</p>
  ${s.help_text ? `<p class="muted">${esc(s.help_text)}</p>` : ''}
  <h2 class="h2">공식 근거</h2>
  <ul>${src.map((x) => `<li>${extLink(x.official_url, x.title)} <span class="muted">· ${esc(x.regulator)} · 확인 ${esc(fmtDate(x.checked_at))} · ${esc(ACCESS_LABEL[x.access_status])}</span></li>`).join('')}</ul>
  <p class="row mt20">
    <button class="btn" type="button" data-act="diagnose" data-id="${esc(s.scheme_id)}">${s.diagnosable ? '이 인증 진단하기' : '확인 사항 정리하기'}</button>
    ${extLink(s.official_link, '공식 기관 바로가기', 'btn ghost')}
  </p>
  <p class="disc">${esc(s.disclaimer)}</p>
</section>`;
}

// ── 설문 ──────────────────────────────────────────────────
function questionsFor(data, group) {
  return data.questions.questions.filter((q) => q.group === group);
}
function renderQ(q, a) {
  const v = a[q.question_id];
  const id = `q-${q.question_id}`;
  const why = `<details class="more"><summary>왜 필요한가요? · 어디서 확인하나요?</summary><p>${esc(q.why_this_matters)}</p>${q.evidence_examples.length ? `<p><b>확인 자료</b>: ${esc(q.evidence_examples.join(', '))}</p>` : ''}</details>`;
  const help = q.help_text ? `<p class="muted q-help">${esc(q.help_text)}</p>` : '';
  const common = `data-qid="${esc(q.question_id)}" data-show="${esc(q.show_when)}"`;
  if (q.data_type === 'single' || q.data_type === 'multi') {
    const type = q.data_type === 'single' ? 'radio' : 'checkbox';
    const vals = Array.isArray(v) ? v : v !== undefined ? [v] : [];
    const cols = q.response_options.length >= 4 ? ' cols' : '';
    return `<fieldset class="q" ${common}><legend>${esc(q.label_plain_ko)}</legend>${help}
      <div class="opts${cols}">${q.response_options.map((o) => `<label class="opt${o.value === 'unknown' ? ' unknown-opt' : ''}"><input type="${type}" name="${esc(q.question_id)}" value="${esc(o.value)}"${vals.includes(o.value) ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>
      <p class="q-err" id="${id}-err" hidden></p>${why}</fieldset>`;
  }
  const isUnknown = v === 'unknown';
  const shown = isUnknown || v === undefined || v === null ? '' : q.data_type === 'number' ? Number(v).toLocaleString('ko-KR') : v;
  const input = q.data_type === 'date'
    ? `<input id="${id}" type="date" name="${esc(q.question_id)}" value="${esc(shown)}" min="1900-01-01"${isUnknown ? ' disabled' : ''} aria-describedby="${id}-err">`
    : q.data_type === 'number'
      ? `<input id="${id}" type="text" inputmode="decimal" name="${esc(q.question_id)}" value="${esc(shown)}" autocomplete="off"${isUnknown ? ' disabled' : ''} aria-describedby="${id}-err">${q.units ? `<span class="unit">${esc(q.units)}</span>` : ''}`
      : `<input id="${id}" type="text" name="${esc(q.question_id)}" value="${esc(shown)}" maxlength="${esc((q.validation && q.validation.max_length) || 100)}" autocomplete="off">`;
  return `<div class="q" role="group" aria-labelledby="${id}-l" ${common}><label class="q-label" id="${id}-l" for="${id}">${esc(q.label_plain_ko)}</label>${help}
    <div class="field${q.data_type === 'text' ? ' text' : ''}">${input}</div>
    ${q.unknown_allowed && q.data_type !== 'text' ? `<label class="unknown-toggle"><input type="checkbox" data-unknown="${esc(q.question_id)}"${isUnknown ? ' checked' : ''}> 모름·확인 필요</label>` : ''}
    <p class="q-err" id="${id}-err" hidden></p>${why}</div>`;
}

export function questionStep(st, data, key) {
  const titles = {
    purpose: ['어디에 쓸 인증을 찾고 계세요?', '목적에 맞춰 먼저 볼 인증을 골라 드려요.'],
    profile: ['회사 기본정보를 알려 주세요', '모르는 항목은 "모름"을 골라도 돼요. 결과에서 "확인 필요"로 표시돼요.'],
    export: ['해외에 팔 제품 정보를 알려 주세요', '해외 규제는 판매국·제품 종류·사용 목적으로 정해져요.'],
  };
  const [h, sub] = titles[key];
  const qs = questionsFor(data, key);
  // B경로(인증 먼저)는 목적 단계를 건너뛰므로, 제품·시장 단계에서 판매 시장을 함께 묻는다
  if (key === 'export' && (st.flow === 'B' || !(st.answers.markets || []).length)) qs.unshift(data.questionMap.markets);
  return `<section class="view wrap narrow">
  ${progress(st, data, key)}
  <h1 class="h1">${esc(h)}</h1><p class="lead">${esc(sub)}</p>
  <div id="dep-note" class="dep-note" hidden></div>
  <form data-form="step" data-step="${esc(key)}" novalidate>${qs.map((q) => renderQ(q, st.answers)).join('')}
  ${navBar(key === 'purpose' ? '#/' : null, '다음')}</form>
</section>`;
}

export function schemeQuestions(st, data) {
  const qs = data.questions.questions.filter((q) => q.group === 'scheme');
  const relevantTo = (q, id) => { const m = q.show_when.match(/scheme in \[([^\]]*)\]/); return !!m && m[1].split(',').map((x) => x.trim()).includes(id); };
  // 여러 제도가 같은 질문을 쓰면 처음 한 번만(공통 답변 재사용). 숨김/표시는 applyVisibility가 답에 따라 즉시 바꾼다.
  const used = new Set();
  const blocks = st.selected.map((id) => {
    const s = data.schemeMap[id];
    const list = qs.filter((q) => relevantTo(q, id) && !used.has(q.question_id));
    list.forEach((q) => used.add(q.question_id));
    const note = !s.diagnosable ? `<p class="notice info">${esc(s.name_ko)}은(는) ${s.self_check ? '준비상태 자가점검' : s.triage ? '적용 규정 확인 안내' : '정보 안내'} 대상이라 추가 질문이 없어요. 결과에서 확인 사항을 정리해 드려요.</p>` : '';
    return `<div class="scheme-sec"><p class="eyebrow">${esc(s.name_ko)}</p>${note}${list.map((q) => renderQ(q, st.answers)).join('') || (s.diagnosable ? '<p class="muted">앞에서 답한 공통 정보로 판단해요.</p>' : '')}</div>`;
  });
  return `<section class="view wrap narrow">
  ${progress(st, data, 'questions')}
  <h1 class="h1">인증별 확인 질문</h1>
  <p class="lead">앞에서 답한 내용은 다시 묻지 않아요. 모르는 항목은 "모름"으로 두세요.</p>
  <div id="dep-note" class="dep-note" hidden></div>
  <form data-form="step" data-step="questions" novalidate>${blocks.join('')}${navBar(null, '결과 보기')}</form>
</section>`;
}

function navBar(backHref, nextLabel) {
  return `<div class="stickybar"><div class="row">
    ${backHref ? `<a class="btn ghost" href="${esc(backHref)}">${ICON.back}<span class="sr-only">이전</span></a>` : `<button class="btn ghost" type="button" data-act="back">${ICON.back}<span class="sr-only">이전</span></button>`}
    <button class="btn" type="submit">${esc(nextLabel)} ${ICON.arrow}</button></div>
    <p class="muted tc m0 mt8"><button type="button" class="linkbtn" data-act="quit">저장 없이 끝내기</button></p></div>`;
}

// ── 후보 추천 ──────────────────────────────────────────────
export function recommendView(st, data, recs) {
  const visible = recs.filter((r) => st.showLow || r.tier !== 'low');
  const anyGood = recs.some((r) => r.tier === 'high' || r.tier === 'consider');
  return `<section class="view wrap">
  ${progress(st, data, 'recommend')}
  <h1 class="h1">검토해 볼 인증 후보예요</h1>
  <p class="lead">관련성 순서예요. 인증 가능성이나 확률이 아니에요. 최대 ${MAX_SELECT}개를 골라 상세 진단하세요.</p>
  ${anyGood ? '' : `<div class="notice warn"><b>현재 정보로는 관련성이 높은 인증을 찾지 못했어요.</b> 조건에 맞는 인증이 없다는 뜻은 아니에요. 목적이나 판매 시장을 더 고르거나, <a href="#/explore">인증 찾기</a>에서 직접 골라 보세요.</div>`}
  <p class="muted" id="sel-count" aria-live="polite">${st.selected.length}개 선택됨 (최대 ${MAX_SELECT}개)</p>
  <div class="cards two">${visible.map((r) => recCard(r, st)).join('')}</div>
  <p class="mt14"><button class="linkbtn" type="button" data-act="toggle-low">${st.showLow ? '관련성 낮은 제도 숨기기' : `관련성 낮은 제도도 보기 (${recs.filter((r) => r.tier === 'low').length}개)`}</button></p>
  <div class="stickybar"><div class="row">
    <a class="btn ghost" href="${esc(steps(st, data).find((s) => s.key === 'recommend') ? prevRoute(st, data, 'recommend') : '#/')}">${ICON.back}<span class="sr-only">이전</span></a>
    <button class="btn" type="button" data-act="go-questions"${st.selected.length ? '' : ' aria-disabled="true"'}>선택한 인증 상세진단 ${ICON.arrow}</button></div></div>
</section>`;
}
function recCard(r, st) {
  const s = r.scheme; const checked = st.selected.includes(s.scheme_id);
  return `<article class="card">
    <div class="card-head"><span class="tier tier-${esc(r.tier)}">${esc(TIER_LABEL[r.tier])}</span><span class="muted">${esc(GROUP_LABEL[s.display_group])}</span></div>
    <h2 class="card-title">${esc(s.name_ko)}</h2>
    <ul class="chips"><li class="chip">${esc(TYPE_LABEL[s.scheme_type])}</li>${diagChip(s)}</ul>
    ${r.reasons.length ? `<p class="small m0 mt4"><b>추천 이유</b></p><ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p class="small m0 mt8"><b>먼저 확인할 조건</b>: ${esc(s.first_check)}</p>
    <div class="card-actions"><label class="check-compare"><input type="checkbox" data-act="select-toggle" data-id="${esc(s.scheme_id)}"${checked ? ' checked' : ''}> 상세진단에 포함</label>
    <a class="btn sm ghost" href="#/scheme/${esc(s.scheme_id)}">자세히</a> ${extLink(s.official_link, '공식자료', 'small')}</div>
  </article>`;
}
export function prevRoute(st, data, key) {
  const list = steps(st, data); const i = list.findIndex((s) => s.key === key);
  return i > 0 ? list[i - 1].route : '#/';
}

// ── 결과 ──────────────────────────────────────────────────
function leafRow(l, data) {
  const lb = leafLabel(l.status);
  const src = (l.source_refs || []).map((r) => data.sourceMap[r]).filter(Boolean);
  const stText = l.kind === 'assessment' ? '기관 평가' : l.unverified ? '확인 필요(미검증)' : lb.text;
  const stKey = l.kind === 'assessment' ? 'out' : lb.key;
  let next = '';
  if (l.inactive) next = '이 유형에는 해당 없음';
  else if (l.kind === 'assessment') next = '공식 평가기관이 판단';
  else if (l.status === S.FAIL) next = l.action_fail || '';
  else if (l.status === S.UNKNOWN) next = l.unverified ? (l.detail || '') : (l.missing && l.missing.length ? `확인할 정보: ${l.missing.map((q) => (data.questionMap[q] ? data.questionMap[q].label_plain_ko : q)).join(', ')}` : (l.detail || ''));
  else next = '-';
  return `<tr class="${l.inactive ? 'inactive' : ''}">
    <td data-th="요건">${esc(l.label)}${l.is_condition ? ' <span class="muted">(선행조건)</span>' : ''}</td>
    ${(() => { const t = l.kind === 'assessment' ? '평가·심사 단계' : (l.detail && !l.unverified ? l.detail : (l.status === S.PASS || l.status === S.FAIL ? '입력값 기준' : '')); return `<td data-th="판단 근거" class="basis${t ? '' : ' empty'}">${esc(t || '-')}</td>`; })()}
    <td data-th="판정" class="st">${badge(stKey, stText, true)}</td>
    <td data-th="공식 근거" class="src">${src.map((x) => extLink(x.official_url, x.title.length > 24 ? `${x.title.slice(0, 24)}…` : x.title)).join('<br>')}</td>
    <td data-th="다음 확인" class="${next === '-' || !next ? 'empty' : ''}">${esc(next || '-')}</td></tr>`;
}
function pathwayBlock(p, data) {
  const lb = { pass: { key: 'pass', text: '기본요건 확인' }, fail: { key: 'fail', text: '기본요건 미충족' }, unknown: { key: 'unknown', text: '추가 확인 필요' }, na: { key: 'na', text: '해당 없음' } }[leafLabel(p.basic).key];
  if (p.basic === S.NA) return `<div class="pathway pathway-na"><span class="pathway-name">${esc(p.name)}</span> ${badge(lb.key, lb.text, true)} <span class="muted small">공식 기준상 이 신청 유형의 대상이 아니에요.</span></div>`;
  const rows = p.leaves;
  const req = rows.filter((l) => l.kind !== 'assessment' && !l.inactive && !l.is_condition && l.status !== S.NA);
  const n = (st) => req.filter((l) => l.status === st).length;
  const counts = `충족 ${n(S.PASS)} · 확인 필요 ${n(S.UNKNOWN)} · 미충족 ${n(S.FAIL)}`;
  return `<details class="pathway"${p.basic === S.FAIL || p.basic === S.PASS ? ' open' : ''}><summary class="pathway-head"><span class="pathway-name">${esc(p.name)}</span>${badge(lb.key, lb.text, true)}<span class="muted small">${counts} · 요건별 판정 보기</span></summary>
  <p class="muted small m0">평가: ${esc(p.evaluator)}</p>
  <table class="req-table"><thead><tr><th scope="col">요건</th><th scope="col">판단 근거</th><th scope="col">판정</th><th scope="col">공식 근거</th><th scope="col">다음 확인</th></tr></thead><tbody>${rows.map((l) => leafRow(l, data)).join('')}</tbody></table></details>`;
}
function schemeResultCard(x, data, st) {
  const s = x.scheme;
  let body = '';
  if (x.result && x.result.gate.active) {
    body = x.result.pathways.map((p) => pathwayBlock(p, data)).join('');
    if (s.scheme_id === 'VEN') body = `<p class="small muted m0 mt8">벤처는 4개 신청 유형 중 하나만 갖추면 돼요. 한 유형이 미충족이어도 다른 유형으로 신청할 수 있어요.</p>${body}`;
  } else if (x.result && !x.result.gate.active) {
    body = `<p class="notice warn">자동 판정을 멈췄어요: ${esc(x.result.gate.reason)}</p>`;
  }
  if (x.triage) {
    body += `<div class="notice warn"><b>${esc(x.triage.label)}</b><ul class="missing-list">${x.triage.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      ${x.triage.missing.length ? `<p class="m0 mt8">먼저 정리할 정보: ${esc(x.triage.missing.map((m) => m.text).join(', '))}</p>` : ''}<p class="small m0 mt8">${esc(x.triage.caution)}</p></div>`;
  }
  if (x.selfcheck) body += `<p class="notice info">${esc(x.selfcheckMeta.note)} 현재 ${esc(readinessSentence(x.selfcheck))}. <a href="#/docs">자가점검 하기</a></p>`;
  if (!x.result && !x.triage && !x.selfcheck) body += `<p class="notice info">정보 안내 제도예요. 신청 요건은 공식 기관에서 확인하세요. ${extLink(s.official_link, '공식 기관 바로가기')}</p>`;
  const meta = x.result ? `규칙 ${esc(x.result.meta.rule_pack_id || '-')} v${esc(x.result.meta.rule_version || '-')} · 엔진 v${esc(x.result.meta.engine_version)} · 기준일 ${esc(x.result.meta.as_of)} · 근거 확인 ${esc(x.result.meta.last_verified_at || '-')}` : `정보형 · 근거 확인 ${esc(s.last_verified_at)}`;
  return `<article class="card scheme-res" id="res-${esc(s.scheme_id)}">
    <div class="card-head"><div><p class="muted m0">${esc(TYPE_LABEL[s.scheme_type])}${x.rec ? ` · ${esc(TIER_LABEL[x.rec.tier])}` : ''}</p><h2 class="card-title">${esc(s.name_ko)}</h2></div>${badge(x.label.key, x.label.text)}</div>
    <p class="small muted m0">${esc(x.label.sub)}</p>
    ${x.rec && x.rec.reasons.length && st.flow === 'A' ? `<ul class="reasons">${x.rec.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${body}
    ${x.readiness ? `<p class="small m0 mt12">${ICON.doc} ${esc(readinessSentence(x.readiness))} · <a href="#/docs">서류 체크</a></p>` : ''}
    <details class="expert"><summary>전문가용 정보 (규칙 ID·근거·검증일)</summary><p class="mono">${meta}</p>
    ${x.result && x.result.gate.active ? `<p class="mono">${x.result.pathways.map((p) => `${esc(p.pathway_id)}: ${p.leaves.map((l) => `${esc(l.id)}=${esc(l.status)}`).join(', ')}`).join('<br>')}</p>` : ''}
    <p>${s.sources.map((r) => data.sourceMap[r]).filter(Boolean).map((src) => `${extLink(src.official_url, src.title)} — ${esc(src.excerpt_or_section_ref.slice(0, 160))}${src.excerpt_or_section_ref.length > 160 ? '…' : ''} (${esc(ACCESS_LABEL[src.access_status])}, ${esc(src.checked_at)})`).join('<br>')}</p></details>
  </article>`;
}

export function resultView(st, data, R) {
  const s = R.summary;
  const first = s.firstAction;
  return `<section class="view wrap">
  ${progress(st, data, 'result')}
  <p class="eyebrow">진단 결과 · 기준일 ${esc(fmtDate(R.meta.as_of))}</p>
  <h1 class="h1" id="result-title">${esc(s.headline)}</h1>
  <div class="summary">
    <section class="sum-card"><h2>기본요건 상태</h2>
      <ul class="sum-list">
        ${R.schemes.map((x) => `<li>${badge(x.label.key, x.label.text, true)} ${esc(x.scheme.name_ko)}</li>`).join('')}
      </ul></section>
    <section class="sum-card"><h2>준비해야 할 증빙</h2>
      ${s.docCounts.total ? `<p class="sum-big">${s.docCounts.total}개 중 ${s.docCounts.done}개 있음</p><p class="small m0">확인 필요 ${s.docCounts.unknown}개 · 없음 ${s.docCounts.missing}개 <span class="muted">(자가응답 기준)</span></p>` : '<p class="small">선택한 제도에 공식 서류 목록이 없어요.</p>'}
      <p class="m0 mt8"><a href="#/docs">서류 체크하기</a></p></section>
    <section class="sum-card"><h2>가장 먼저 할 행동</h2>
      ${first ? `<p class="sum-big fs18">${esc(first.title)}</p><p class="small m0">${esc(first.detail || '')}</p>` : '<p class="small">지금 바로 할 일은 없어요.</p>'}
      <p class="m0 mt8"><a href="#/roadmap">실행 로드맵 보기</a></p></section>
  </div>
  <p class="disc">공식 기관의 최종 판단이 아니에요. '기본요건 확인'은 입력한 정보 기준이며, 실제 확인·선정·인정은 기관 평가와 심사로 결정돼요.</p>
  ${R.unknownInputs.length ? `<div class="notice warn"><b>확인하면 정확해지는 정보 ${R.unknownInputs.length}가지</b><ul class="missing-list">${R.unknownInputs.slice(0, 6).map((m) => `<li>${esc(m.label)}</li>`).join('')}</ul><p class="m0 mt8"><button class="btn sm sec" type="button" data-act="edit">입력 수정하기</button></p></div>` : ''}
  <h2 class="h2">검토한 인증·제도</h2>
  ${R.schemes.map((x) => schemeResultCard(x, data, st)).join('')}
  ${connectView(R)}
  <div class="result-actions">
    <button class="btn" type="button" data-act="print">${ICON.print} PDF 저장</button>
    <a class="btn sec" href="#/docs">서류 체크</a>
    <a class="btn sec" href="#/roadmap">실행 로드맵</a>
    <button class="btn ghost" type="button" data-act="compare-selected">다른 인증 비교</button>
    <button class="btn ghost" type="button" data-act="edit">입력 수정</button>
    <a class="btn ghost" href="#/explore">인증 추가 찾기</a>
    <a class="btn ghost" href="${CONTACT.telHref}">${ICON.phone} 전문가 상담(선택)</a>
    <a class="btn ghost" href="mailto:${CONTACT.mail}">메일 문의</a>
  </div>
  <p class="muted small">결과 범위: 선택한 ${R.schemes.length}개 제도 · 앱 v${esc(R.meta.app_version)} · 데이터 ${esc(R.meta.data_versions.catalog)} · 문서 ${esc(R.meta.doc_id)}. 미검증 데이터와 근거는 <a href="#/about-data">근거·데이터 기준</a>에서 볼 수 있어요.</p>
</section>`;
}

// ── 연결: 함께 준비하기 · 다음 진단(BECONIC 31) · 상담 ─────────────
export function consultMailto(R) {
  const lines = [
    '[기업인증 진단 결과로 상담 요청]',
    `문서번호: ${R.meta.doc_id} (진단 기준일 ${R.meta.as_of})`,
    '',
    '■ 진단 결과',
    ...R.schemes.map((x) => `- ${x.scheme.name_ko}: ${x.label.text}`),
    '',
    '■ 먼저 할 일',
    ...R.actions.slice(0, 3).map((a, i) => `${i + 1}. ${a.title}`),
    '',
    '■ 상담받고 싶은 내용:',
    '■ 회사명·연락처:',
  ];
  const subject = `[기업인증 진단] 상담 요청 ${R.meta.doc_id}`;
  return `mailto:${CONTACT.mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
function connectView(R) {
  const c = R.connect || { next: [], strategy: [], commonDocs: [] };
  const prep = c.strategy.length || c.commonDocs.length ? `<section class="card my14" aria-labelledby="prep-h"><h2 class="card-title" id="prep-h">${ICON.route} 여러 인증을 함께 준비할 때</h2>
    ${c.strategy.map((x) => `<p class="m0 mt8">${esc(x.text)}</p>`).join('')}
    ${c.commonDocs.length ? `<p class="m0 mt8"><b>공통 서류 ${c.commonDocs.length}종</b> — 한 번 발급해 같이 쓰면 돼요. 발급일 제한(예: 1개월 이내)이 있는 서류는 신청 직전에 발급하세요.</p>
      <ul class="common-docs">${c.commonDocs.map((d) => `<li><b>${esc(d.name)}</b> <span class="muted small">${esc(d.schemes.join(' · '))}</span></li>`).join('')}</ul>` : ''}
  </section>` : '';
  const next = c.next.length ? `<section class="my14" aria-labelledby="next-h"><h2 class="h2" id="next-h">다음 진단 추천 <span class="muted small">BECONIC 31</span></h2>
    <p class="muted small m0">이번 결과와 답한 내용을 보고 이어서 하면 좋은 진단을 골랐어요. 새 창으로 열리고, 입력한 정보는 넘어가지 않아요.</p>
    <div class="next-grid">${c.next.map((n, i) => `<div class="next-card"><span class="next-no">${i + 1}</span><div><p class="next-name">${esc(n.name)}</p><p class="small m0">${esc(n.why)}</p>
      <p class="m0 mt8">${extLink(n.url, '진단 시작하기', 'btn sm sec')}</p></div></div>`).join('')}</div></section>` : '';
  const consult = `<section class="consult" aria-labelledby="consult-h"><div><h2 class="consult-h" id="consult-h">이 결과로 전문가 상담 받기</h2>
    <p class="small m0">진단 결과와 먼저 할 일을 정리한 메일 초안을 열어 드려요. 회사명·연락처는 직접 적어 보내 주세요. 그로스벤처스는 중소벤처기업부 공식 인증 중소기업상담회사(제2025-684호)예요.</p></div>
    <div class="row"><a class="btn" href="${esc(consultMailto(R))}">${ICON.doc} 결과 담아 메일 상담</a><a class="btn sec" href="${CONTACT.telHref}">${ICON.phone} ${CONTACT.tel}</a></div></section>`;
  return prep + next + consult;
}

// ── 서류 체크 ──────────────────────────────────────────────
function docRow(r) {
  const cur = r.status === EVIDENCE.SELF_DECLARED_AVAILABLE ? 'have' : r.status === EVIDENCE.NOT_AVAILABLE ? 'none' : 'unknown';
  const name = `doc-${r.item_id}`;
  const opt = (v, l) => `<label><input type="radio" name="${esc(name)}" value="${v}" data-doc="${esc(r.item_id)}"${cur === v ? ' checked' : ''}>${l}</label>`;
  return `<div class="doc"><div><div class="doc-name">${esc(r.label)}${r.required ? '<span class="req-tag">필수</span>' : '<span class="opt-tag">선택</span>'}</div>
    <div class="doc-why">${esc(r.why)}${r.where ? ` · 확인처: ${esc(r.where)}` : ''}</div></div>
    <div class="seg" role="radiogroup" aria-label="${esc(r.label)} 보유 여부">${opt('have', '있음')}${opt('none', '없음')}${opt('unknown', '모름')}</div></div>`;
}
export function docsView(st, data, R) {
  const blocks = R.schemes.filter((x) => x.readiness || x.selfcheck).map((x) => {
    const r = x.readiness || x.selfcheck;
    const rows = r.rows.filter((row) => row.applicable);
    return `<section class="card my14"><div class="card-head"><h2 class="card-title">${esc(x.scheme.name_ko)} ${x.selfcheck ? '<span class="muted small">준비상태 자가점검</span>' : ''}</h2></div>
      <p class="small" id="cnt-${esc(x.scheme.scheme_id)}" aria-live="polite">${esc(readinessSentence(r))}</p>
      ${x.selfcheck ? `<p class="muted small">${esc(x.selfcheckMeta.note)}</p>` : ''}
      ${rows.map(docRow).join('')}</section>`;
  });
  return `<section class="view wrap narrow">
  <p><a href="#/result">${ICON.back} 결과로</a></p>
  <h1 class="h1">서류 준비 체크</h1>
  <p class="lead">가지고 있는 서류를 표시하세요. 표시한 내용은 '자가응답'으로만 기록되고, 서류를 실제로 확인했다는 뜻이 아니에요.</p>
  ${blocks.length ? blocks.join('') : '<div class="empty"><p>선택한 제도에 공식 서류 목록이 없어요. 공식 기관 안내를 확인하세요.</p></div>'}
  <p class="row mt16"><a class="btn" href="#/roadmap">실행 로드맵 보기</a><a class="btn ghost" href="#/result">결과로</a></p>
</section>`;
}

// ── 로드맵 ────────────────────────────────────────────────
export function roadmapView(st, data, R) {
  const lanes = Object.entries(TIMEFRAME).map(([k, label]) => {
    const items = R.roadmap[k];
    if (!items.length) return '';
    return `<section class="lane"><h3>${ICON.flag} ${esc(label)} <span class="count">${items.length}개</span></h3>${items.map((a) => `<div class="act">
      <div class="act-top"><span class="chip">${esc(a.order)}순위</span><span class="chip">${esc(CATEGORY[a.category])}</span><span>${esc(a.scheme_name)}</span></div>
      <p class="act-title">${esc(a.title)}</p>${a.detail ? `<p class="act-detail">${esc(a.detail)}</p>` : ''}
      <p class="act-detail">담당(예시): ${esc(a.owner)} · 완료 판단: ${esc(a.done_when)}</p></div>`).join('')}</section>`;
  }).join('');
  return `<section class="view wrap narrow">
  <p><a href="#/result">${ICON.back} 결과로</a></p>
  <h1 class="h1">실행 로드맵</h1>
  <p class="lead">신청 장애 요인 제거 → 필수 증빙 → 평가·신청 준비 → 선택 강화 순서로 정리했어요.</p>
  <p class="disc">일정은 준비 순서를 보여 주는 예시예요. 기관의 심사 처리기간이나 취득 시점을 보장하지 않아요. 우선순위는 '신청 장애 여부 → 선행 관계 → 선택한 목적과의 관련성' 순으로 정한 내부 기준이에요.</p>
  ${lanes || '<div class="empty"><p>지금 할 일이 없어요.</p></div>'}
  <p class="row mt16"><button class="btn" type="button" data-act="print">${ICON.print} PDF 저장</button><a class="btn ghost" href="#/result">결과로</a></p>
</section>`;
}

// ── 비교 ──────────────────────────────────────────────────
export function compareView(st, data) {
  const list = st.compare.map((id) => data.schemeMap[id]).filter(Boolean);
  if (!list.length) return `<section class="view wrap narrow"><h1 class="h1">인증 비교</h1><div class="empty"><p>비교할 인증을 골라 주세요(최대 ${MAX_SELECT}개).</p><a class="btn sm" href="#/explore">인증 찾기</a></div></section>`;
  const row = (label, fn) => `<tr><th scope="row">${esc(label)}</th>${list.map((s) => `<td>${fn(s)}</td>`).join('')}</tr>`;
  return `<section class="view wrap">
  <p><a href="#/explore">${ICON.back} 인증 찾기</a></p>
  <h1 class="h1">인증 비교</h1>
  <div class="cmp-wrap" tabindex="0" role="region" aria-label="인증 비교표(가로로 밀어 보기)"><table class="cmp">
    <thead><tr><th scope="col">항목</th>${list.map((s) => `<th scope="col">${esc(s.name_ko)}</th>`).join('')}</tr></thead>
    <tbody>
      ${row('제도 유형', (s) => esc(TYPE_LABEL[s.scheme_type]))}
      ${row('적용 대상', (s) => esc(TARGET_LABEL[s.target]))}
      ${row('의무성', (s) => esc(MANDATORY_LABEL[s.mandatory_status]))}
      ${row('판정 방식', (s) => (s.diagnosable ? '기본요건 자동 진단' : s.self_check ? '준비상태 자가점검' : s.triage ? '적용 규정 확인 안내' : '정보 안내'))}
      ${row('먼저 확인할 것', (s) => esc(s.first_check))}
      ${row('발급·확인 주체', (s) => esc(s.issuing_authority))}
      ${row('공식 근거', (s) => extLink(s.official_link, '바로가기'))}
      ${row('', (s) => `<button class="btn sm" type="button" data-act="diagnose" data-id="${esc(s.scheme_id)}">${s.diagnosable ? '진단' : '확인 사항 정리'}</button> <button class="linkbtn" type="button" data-act="compare-remove" data-id="${esc(s.scheme_id)}">빼기</button>`)}
    </tbody></table></div>
</section>`;
}

// ── 안내·오류 ──────────────────────────────────────────────
export function errorView(msg, href = '#/', cta = '처음으로', extra = '') {
  return `<section class="view wrap narrow"><h1 class="h1">${esc(msg)}</h1>${extra}<p class="row"><a class="btn" href="${esc(href)}">${esc(cta)}</a><a class="btn ghost" href="${CONTACT.telHref}">전문가 문의</a></p></section>`;
}
export function noStateView() {
  return errorView('진단 정보가 없어요', '#/', '처음부터 시작하기', '<p class="lead">입력한 내용은 저장하지 않아서, 새로고침하거나 창을 닫으면 사라져요. 처음부터 다시 진행해 주세요.</p>');
}
export function loadErrorView(detail) {
  return `<section class="view wrap narrow"><h1 class="h1">화면을 불러오지 못했어요</h1>
  <p class="lead">네트워크가 불안정하거나 일시적인 문제일 수 있어요. 입력한 정보는 서버로 보내지 않아요.</p>
  <p class="notice err">${esc(detail)}</p>
  <p class="row"><button class="btn" type="button" data-act="reload">다시 시도</button><a class="btn ghost" href="${CONTACT.telHref}">전화 상담 ${CONTACT.tel}</a></p></section>`;
}
export function privacyView() {
  return `<section class="view wrap narrow prose"><h1 class="h1">개인정보·데이터 안내</h1>
  <p>이 진단은 입력한 정보를 <b>브라우저 메모리 안에서만</b> 계산해요.</p>
  <ul><li>입력 내용을 서버로 보내거나, 브라우저 저장소(localStorage 등)에 저장하지 않아요. 새로고침하면 사라져요.</li>
  <li>외부 분석 도구(애널리틱스)·광고 추적·외부 글꼴 서버를 쓰지 않아요. 글꼴(Pretendard)은 이 사이트에서 직접 제공해요.</li>
  <li>PDF는 브라우저 인쇄 기능으로 내 기기에 저장돼요. 저장 여부를 이 서비스가 알 수 없어요.</li>
  <li>상담은 전화·메일로만 받아요. 이 화면에서 연락처를 수집하지 않아요.</li>
  <li>‘결과 담아 메일 상담’은 내 메일 앱에 초안(문서번호·결과 요약)을 열기만 해요. 회사명 등 입력값은 넣지 않고, 보낼지는 직접 정해요.</li>
  <li>‘다음 진단 추천’ 링크로 다른 BECONIC 진단으로 이동해도 입력한 정보는 넘어가지 않아요.</li></ul>
  <p class="muted">운영사의 정식 개인정보 처리방침이 마련되면 이 페이지에서 연결해요. 문의: start@gven.kr</p></section>`;
}
export function aboutDataView(data) {
  const rows = data.sources.sources.map((s) => `<tr><td>${extLink(s.official_url, s.title)}</td><td>${esc(s.regulator)}</td><td>${esc(s.document_identifier || '-')}</td><td>${esc(s.effective_from || '미기재')}</td><td>${esc(s.checked_at)}</td><td>${esc(ACCESS_LABEL[s.access_status])}</td></tr>`).join('');
  const packs = Object.values(data.packs).map((p) => `<li><b>${esc(data.schemeMap[p.scheme_id].name_ko)}</b> — 규칙 ${esc(p.rule_pack_id)} v${esc(p.rule_version)} · 적용 ${esc(p.valid_from)}~ · 재확인 기한 ${esc(p.review_due_at)}<br><span class="muted">${esc(p.verification_basis)}</span></li>`).join('');
  return `<section class="view wrap prose"><h1 class="h1">근거·데이터 기준</h1>
  <p>자동 판정은 <b>공식 원문과 대조한 요건</b>에만 적용해요. 원문을 확인하지 못한 요건은 '확인 필요'로 표시하고 판정하지 않아요. 규칙 재확인 기한이 지나면 자동 판정을 스스로 멈춰요.</p>
  <p class="notice warn">전문가(법률) 검토는 거치지 않았어요. 운영사 대표가 규칙과 근거를 검토하는 구조예요.</p>
  <h2>자동 판정 규칙</h2><ul>${packs}</ul>
  <h2>공식 출처 (${data.sources.sources.length}개)</h2>
  <div class="cmp-wrap" tabindex="0" role="region" aria-label="공식 출처 표"><table class="cmp"><thead><tr><th scope="col">출처</th><th scope="col">기관</th><th scope="col">문서</th><th scope="col">시행</th><th scope="col">확인일</th><th scope="col">접속 상태</th></tr></thead><tbody>${rows}</tbody></table></div>
  <h2>아직 확인하지 못한 부분</h2>
  <ul><li>기업부설연구소: 한국산업기술진흥협회 2026 업무편람(사이트 접속 불가) — 면적 산정·인력 증빙 실무 기준 미반영</li>
  <li>이노비즈: 운영규정 별표 2(신청 불가 업종) 원문 미확보, 내려받은 파일 제목의 '(안)' 표기</li>
  <li>메인비즈: 업력 기산일 정의 조항(운영규정 원문) 미확보</li>
  <li>벤처: 확인 유효기간·사후관리 기준은 미반영</li>
  <li>KC·HACCP·여성·장애인·가족친화·소셜벤처, ISO·CE·FDA·FCC: 정보 안내만 제공(자동 판정 없음). 일부 사이트는 접속 차단·불가로 원문 미확인</li></ul></section>`;
}
