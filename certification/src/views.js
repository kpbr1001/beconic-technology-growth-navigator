// 화면 렌더링(v2 · 3단계) — 문자열 템플릿. 사용자 입력·데이터는 모두 esc()/extLink()를 거친다.
import { esc, extLink, badge, ICON, fmtDate, TYPE_LABEL, MANDATORY_LABEL, TARGET_LABEL, ACCESS_LABEL, LEVEL_LABEL, levelOf, FIELDS, fieldOf, FIELD_TONE, won } from './ui.js';
import { S, leafLabel, rdRatioThresholds, questionsUsedBy } from './engine.js';
import { searchSchemes } from './search.js';
import { TIMEFRAME, prepItems } from './model.js';
import { SITE } from './site.js';

export const MAX_SELECT = 3;
// 목적 필터 목록은 데이터(questions.json purposes의 short 라벨)에서 만든다
const purposeOpts = (data) => ((data.questionMap.purposes && data.questionMap.purposes.response_options) || []).filter((o) => o.short).map((o) => [o.value, o.short]);

// ── 공통 ──────────────────────────────────────────────────
const STEPS = [['select', '인증 고르기', '#/select'], ['answer', '우리 회사 답하기', '#/answer'], ['result', '결과·할 일', '#/result']];
export function stepper(cur, st) {
  const ci = STEPS.findIndex((s) => s[0] === cur);
  return `<ol class="stepper" aria-label="진행 단계">${STEPS.map(([, label, href], i) => {
    const state = i < ci ? 'done' : i === ci ? 'on' : '';
    const can = i < ci || (i === 1 && st.selected.length) || (i === 2 && st.selected.length && st.visitedAnswer);
    const inner = `<i>${i < ci ? '✓' : i + 1}</i>${esc(label)}`;
    return `<li class="st ${state}"${i === ci ? ' aria-current="step"' : ''}>${i ? '<span class="line" aria-hidden="true"></span>' : ''}${can && i !== ci ? `<a href="${href}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
  }).join('')}</ol>`;
}
const levelTag = (s) => { const l = levelOf(s); return `<span class="lv ${l === 'A' ? 'a' : l === 'B' ? 'b' : ''}">${LEVEL_LABEL[l]}</span>`; };
const fieldTag = (s) => { const f = fieldOf(s); return `<span class="tag ${FIELD_TONE[f] || ''}">${esc(f)}</span>`; };
const shortName = (s) => s.short_name || s.name_ko.replace(/\s*\(.*\)\s*$/, '');

// ── 홈 ────────────────────────────────────────────────────
export function home(data) {
  const all = data.catalog.schemes;
  const auto = all.filter((s) => levelOf(s) === 'A');
  const nSrc = data.sources.sources.length;
  // 보고서 예시: 데이터에서 계산(벤처 연구개발유형) — 숫자를 코드에 쓰지 않는다
  const ven = data.schemeMap.VEN;
  const rd = ven && ven.fees && !ven.fees.unverified ? ven.fees.items.find((x) => /연구개발/.test(x.label)) : null;
  const rdDays = ven && ven.processing && !ven.processing.unverified ? ven.processing.items.find((x) => /연구개발/.test(x.label)) : null;
  const vdocs = ven ? ven.readiness_items : [];
  const sheet = ven ? `<div class="sheet" aria-label="결과 보고서 예시">
      <span class="sheet-tag">결과 보고서 예시</span>
      <div class="sheet-no"><span>BECONIC 기업인증 진단 보고서</span><span>예시</span></div>
      <h3>${esc(ven.name_ko)} · 연구개발유형</h3>
      <p class="sheet-s">입력한 정보로 신청 기본요건을 모두 갖춘 경우 이렇게 보여 드려요.</p>
      <span class="stamp">기본요건 충족</span>
      <div class="sheet-kv">
        <div><span>공식 수수료(기업 부담)</span><b>${rd ? won(rd.company !== undefined ? rd.company : rd.total) : '기관 확인'}</b></div>
        <div><span>확인결과 안내</span><b>${rdDays && rdDays.days ? `${rdDays.days}일 이내` : '기관 확인'}</b></div>
        <div><span>신청서류</span><b>${vdocs.length}개</b> <small>필수 ${vdocs.filter((d) => d.required).length}</small></div>
        <div><span>신청처</span><b>${esc((ven.apply_site && ven.apply_site.name) || ven.issuing_authority)}</b></div>
      </div>
      <p class="sheet-foot">수수료·기간은 공식 안내 원문과 대조한 값이에요. 최종 확인은 기관 심사로 결정돼요.</p>
    </div>` : '';
  // 비교표 수수료는 '신규' 신청 기준(연장·재확인 금액 제외)
  const newFee = (s) => { const f = s.fees; if (!f || f.unverified) return feeSummary(s); const it = f.items.filter((x) => /신규/.test(x.label)); if (!it.length) return feeSummary(s);
    const v = it.map((x) => (x.company !== undefined ? x.company : x.total)); const many = new Set(v).size > 1;
    return { b: `${won(Math.min(...v))}${many ? '~' : ''}`, small: `신규 · VAT ${f.vat}${it.some((x) => x.company !== undefined) ? ' · 기업 부담' : ''}${many ? ' · 유형별' : ''}` }; };
  const rows = auto.map((s) => { const f = newFee(s); const pr = procSummary(s);
    return `<tr><th scope="row">${esc(shortName(s))}</th><td>${esc(LEVEL_LABEL.A)}</td><td><b>${esc(f.b)}</b><small>${esc(f.small)}</small></td><td><b>${esc(pr.b)}</b><small>${esc(pr.small)}</small></td><td>${esc((s.apply_site && s.apply_site.name) || s.issuing_authority)}</td></tr>`; }).join('');
  return `<div class="home-a">
  <section class="wrap home-top">
    <div class="home-hero">
      <div class="hh-l">
        <p class="kicker">${auto.map((s) => esc(shortName(s))).join(' · ')}</p>
        <h1>서류부터 준비하기 전에,<br><em>신청 요건이 되는지</em><br>먼저 확인하세요.</h1>
        <p class="lead">법령·운영규정 원문 기준으로 기본요건을 판정하고, 신청서류·공식 수수료·처리기간·등록 절차·할 일까지 보고서 한 장으로 정리해 드려요.</p>
        <a class="btn lg" href="#/select">기업인증 진단 시작 ${ICON.arrow}</a>
        <p class="hh-meta"><span><b>버튼으로 답하기</b> · 모르면 ‘모름’</span><span><b>회원가입 없음</b> · 입력값 저장 안 함</span></p>
      </div>
      ${sheet}
    </div>
    <div class="nums">
      <div><b>${all.length}</b><span>국내·해외 인증 안내</span></div>
      <div><b>${auto.length}</b><span>법령 원문 기준 자동 판정</span></div>
      <div><b>${nSrc}</b><span>공식 출처 · 확인일 표시</span></div>
      <div><b>0</b><span>서버에 저장되는 입력값</span></div>
    </div>
  </section>
  <section class="wrap home-sec">
    <div class="hs"><p class="hs-n">01 · 왜 먼저 진단하나요</p><div>
      <h2>인증 준비가 늦어지는 이유는<br>대부분 처음 단계에 있어요.</h2>
      <div class="pains">
        <div><b>요건을 잘못 읽고 시작</b><p>업력·연구전담요원·연구공간 기준을 다르게 이해하고 서류부터 준비하는 경우</p></div>
        <div><b>비용·기간을 모르고 일정 수립</b><p>평가비용과 결과 안내 기간을 몰라 사업 일정과 어긋나는 경우</p></div>
        <div><b>무엇부터 할지 모름</b><p>여러 인증 중 어떤 순서로 준비해야 서류를 한 번에 쓸 수 있는지 모르는 경우</p></div>
      </div></div></div>
    <div class="hs"><p class="hs-n">02 · 한눈에 비교</p><div>
      <h2>많이 찾는 인증, 공식 기준으로 비교했어요.</h2>
      <p class="hs-p">금액·기간은 기관 공식 안내 문구와 대조한 값만 보여 드려요. 원문을 확인하지 못한 값은 ‘기관 확인’으로 표시해요.</p>
      <div class="tbl-wrap"><table class="cmp"><thead><tr><th scope="col">인증</th><th scope="col">판정</th><th scope="col">공식 수수료</th><th scope="col">처리기간</th><th scope="col">신청처</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hs-src">전체 ${all.length}개 인증의 수수료·기간·등록 절차는 진단 화면에서 볼 수 있어요. <a href="#/about-data">근거·데이터 기준</a></p>
    </div></div>
    <div class="hs"><p class="hs-n">03 · 진행 방법</p><div>
      <h2>세 단계, 숫자를 몰라도 답할 수 있어요.</h2>
      <div class="steps3">
        <div><i>1</i><b>인증 고르기</b><p>최대 ${MAX_SELECT}개. 업종·목적으로 좁혀 볼 수 있어요.</p></div>
        <div><i>2</i><b>버튼으로 답하기</b><p>법정 기준으로 나눈 구간을 고르면 돼요. 모르면 ‘모름’.</p></div>
        <div><i>3</i><b>보고서 받기</b><p>요건별 판정·신청서류·수수료·등록 절차·할 일. PDF로 저장해 내부 보고에 써요.</p></div>
      </div></div></div>
    <div class="hs"><p class="hs-n">04 · 운영사</p><div>
      <h2>진단 다음 단계까지 함께해요.</h2>
      <div class="trust2">
        <div><h3>${esc(SITE.company)}</h3><ul><li>${esc(SITE.regNo)}</li><li>사업계획·기술사업화·인증 실무 컨설팅</li><li>상담 ${esc(SITE.tel)} · ${esc(SITE.mail)}</li></ul></div>
        <div><h3>판정 원칙</h3><ul><li>공식 원문에 있는 기준만 판정해요</li><li>확률·점수로 표시하지 않아요</li><li>원문 미확보 항목은 ‘확인 필요’로 남겨요</li></ul></div>
      </div></div></div>
  </section>
  <section class="home-cta"><div class="wrap">
    <div><h2>지금 우리 회사 기준으로 확인해 보세요.</h2><p>결과를 받은 뒤 상담이 필요하면 보고서 문서번호로 바로 이어서 안내해 드려요.</p></div>
    <div class="row"><a class="btn lg white" href="#/select">기업인증 진단 시작 ${ICON.arrow}</a><a class="btn lg line" href="${SITE.telHref}">${ICON.phone} 전화 상담</a></div>
  </div></section>
</div>`;
}

// ── 1 인증 고르기 ──────────────────────────────────────────
// 업종 대분류: 'all'이 아닌 인증은 그 업종을 고른 회사에게만 보인다(다른 업종 전용 인증은 뺀다)
export const industryFits = (s, ind) => !ind || ind === 'unknown' || !s.industry_major || s.industry_major.includes('all') || s.industry_major.includes(ind);
const industryOnly = (s, ind) => !!ind && ind !== 'unknown' && !!s.industry_major && !s.industry_major.includes('all') && s.industry_major.includes(ind);
function baseList(st, data, region = st.f.region) {
  const f = st.f;
  return data.catalog.schemes.filter((s) => s.display_group === region && industryFits(s, f.industry) && (!f.purpose || (s.purpose_tags || []).includes(f.purpose)));
}
export function filterSchemes(st, data) {
  const f = st.f;
  let list = f.q ? searchSchemes(data.catalog.schemes, f.q, {}).map((r) => r.scheme) : baseList(st, data);
  if (f.field !== 'all') list = list.filter((s) => fieldOf(s) === f.field);
  const rank = { A: 0, B: 1, C: 2 };
  return f.q ? list : [...list].sort((x, y) => rank[levelOf(x)] - rank[levelOf(y)]);
}
function card(s, st) {
  const sel = st.selected.includes(s.scheme_id);
  const rec = st.f.purpose && (s.purpose_tags || []).includes(st.f.purpose);
  const indFit = industryOnly(s, st.f.industry);
  return `<article class="cc" data-sel="${sel}">
    <button class="cc-hit" type="button" data-act="pick" data-id="${esc(s.scheme_id)}" aria-pressed="${sel}">
      <span class="tags">${fieldTag(s)}${levelTag(s)}${indFit ? '<span class="rec-mark">업종 맞춤</span>' : ''}${rec ? '<span class="rec-mark">목적 추천</span>' : ''}</span>
      <span class="cc-name">${esc(s.name_ko)}</span>
      <span class="cc-what">${esc(s.what)}</span>
      <span class="chk" aria-hidden="true">${sel ? '✓' : ''}</span>
    </button>
    <div class="cc-foot"><span class="muted small">${esc(s.display_group === 'domestic' ? '국내' : '해외·국제')} · ${esc(TARGET_LABEL[s.target])}</span><a href="#/scheme/${esc(s.scheme_id)}">자세히</a></div>
  </article>`;
}
export function cardsHTML(st, data) {
  const list = filterSchemes(st, data);
  if (!list.length) {
    return `<p class="result-count">조건에 맞는 인증이 없어요.</p><div class="more-ask"><span>검색어를 바꾸거나 분야·업종·목적을 ‘전체’로 바꿔 보세요. 찾는 인증이 목록에 없으면 전문가에게 물어보세요.</span><a class="btn sm gh" href="${SITE.telHref}">${ICON.phone} 문의</a></div>`;
  }
  const hidden = !st.f.q && st.f.industry && st.f.industry !== 'unknown' ? data.catalog.schemes.filter((s) => s.display_group === st.f.region && !industryFits(s, st.f.industry)).length : 0;
  return `<p class="result-count" aria-live="polite">${list.length}개 인증${st.f.q ? ` · ‘${esc(st.f.q)}’ 검색 결과(국내·해외 전체, 업종 필터 미적용)` : ''}${hidden ? ` · 다른 업종 전용 ${hidden}개 제외` : ''}</p><div class="cards">${list.map((s) => card(s, st)).join('')}</div>`;
}
export function trayHTML(st, data) {
  const items = st.selected.map((id) => data.schemeMap[id]).filter(Boolean);
  const qn = estimateQuestions(st, data);
  return `<h2>선택한 인증 ${items.length}/${MAX_SELECT}</h2>
    ${items.length ? items.map((s) => `<div class="it"><span>${esc(shortName(s))} <span class="muted small">${LEVEL_LABEL[levelOf(s)]}</span></span><button type="button" data-act="unpick" data-id="${esc(s.scheme_id)}" aria-label="${esc(s.name_ko)} 빼기">빼기</button></div>`).join('') : '<p class="empty-tray">왼쪽 목록에서 진단할 인증을 눌러 고르세요.</p>'}
    ${items.length ? `<p class="note">다음 단계 질문 약 ${qn}개 · 모두 버튼으로 답해요.</p>` : ''}
    <button class="btn w mt8" type="button" data-act="go-answer"${items.length ? '' : ' aria-disabled="true"'}>다음: 우리 회사 답하기 ${ICON.arrow}</button>`;
}
export function mbarSelectHTML(st, data) {
  const names = st.selected.map((id) => shortName(data.schemeMap[id])).join(' · ');
  return `<span class="c">${st.selected.length ? `${st.selected.length}개 선택 · ${esc(names)}` : `최대 ${MAX_SELECT}개까지 고를 수 있어요`}</span><button class="btn" type="button" data-act="go-answer"${st.selected.length ? '' : ' aria-disabled="true"'}>다음 ${ICON.arrow}</button>`;
}
// 분야 목록(개수 포함)·모바일 필터 — 국내/해외 탭을 바꿀 때마다 다시 그린다
export function fieldListHTML(st, data, compact = false) {
  const f = st.f;
  const inRegion = baseList(st, data);
  const items = [['all', '전체', inRegion.length], ...FIELDS.map((x) => [x, x, inRegion.filter((s) => fieldOf(s) === x).length]).filter((x) => x[2])];
  return items.map(([val, l, n]) => `<button type="button" data-act="field" data-v="${esc(val)}" aria-pressed="${f.field === val}">${esc(l)}${compact ? '' : ` <em>${n}</em>`}</button>`).join('');
}
// 국내·해외 탭(업종·목적 필터를 반영한 개수) — 필터가 바뀔 때마다 다시 그린다
export function regionTabsHTML(st, data) {
  const rb = (v, l) => `<button type="button" data-act="region" data-v="${v}" aria-pressed="${st.f.region === v && !st.f.q}">${l}</button>`;
  return `${rb('domestic', `국내 ${baseList(st, data, 'domestic').length}`)}${rb('international', `해외 ${baseList(st, data, 'international').length}`)}`;
}
export function mfiltersHTML(st, data) {
  const dom = baseList(st, data, 'domestic').length;
  const intl = baseList(st, data, 'international').length;
  const rb = (val, l) => `<button type="button" data-act="region" data-v="${val}" aria-pressed="${st.f.region === val && !st.f.q}">${l}</button>`;
  return `${rb('domestic', `국내 ${dom}`)}${rb('international', `해외 ${intl}`)}${fieldListHTML(st, data, true)}`;
}
function industryOpts(data) { return ((data.questionMap.industry_major && data.questionMap.industry_major.response_options) || []).filter((o) => o.value !== 'unknown'); }
export function industryListHTML(st, data) {
  return industryOpts(data).map((o) => `<button type="button" data-act="industry" data-v="${esc(o.value)}" aria-pressed="${st.f.industry === o.value}" title="KSIC ${esc(o.ksic)}">${esc(o.label)}</button>`).join('');
}
// 모바일: 업종·목적은 고르기 상자로(옆 패널이 숨겨지므로)
function mselectsHTML(st, data) {
  const opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`;
  return `<div class="mselects">
    <label><span>업종</span><select data-input="industry">${opt('', '전체 업종', st.f.industry || '')}${industryOpts(data).map((o) => opt(o.value, o.label, st.f.industry)).join('')}</select></label>
    <label><span>목적</span><select data-input="purpose">${opt('', '전체 목적', st.f.purpose || '')}${purposeOpts(data).map(([v, l]) => opt(v, l, st.f.purpose)).join('')}</select></label>
  </div>`;
}
export function selectView(st, data) {
  const f = st.f;
  return `<section class="wrap">
  ${stepper('select', st)}
  <h1 class="h1">어떤 인증을 진단할까요?</h1>
  <p class="lead">최대 ${MAX_SELECT}개까지 고를 수 있어요. 잘 모르겠다면 <b>업종·목적</b>으로 좁혀 보세요.</p>
  <div class="grid g-side">
    <aside class="panel side-f" aria-label="인증 분류">
      <div class="tabs" id="rtabs">${regionTabsHTML(st, data)}</div>
      <h2 class="side-h">분야</h2>
      <div class="flist" id="flist">${fieldListHTML(st, data)}</div>
      <h2 class="side-h">우리 업종</h2>
      <p class="side-n">고르면 다른 업종 전용 인증을 빼고 보여 줘요. 한 번 더 누르면 해제돼요.</p>
      <div class="flist chipset" id="ilist">${industryListHTML(st, data)}</div>
      <h2 class="side-h">목적으로 찾기</h2>
      <div class="flist">${purposeOpts(data).map(([v, l]) => `<button type="button" data-act="purpose" data-v="${v}" aria-pressed="${f.purpose === v}">${esc(l)}</button>`).join('')}</div>
    </aside>
    <section aria-label="인증 목록">
      <div class="searchbox" role="search">${ICON.search}<label class="sr-only" for="q-search">인증 이름·목적으로 검색</label><input id="q-search" type="search" value="${esc(f.q)}" placeholder="인증 이름·목적으로 검색 (예: 벤처, 연구소, ISO, 유럽 수출)" autocomplete="off" enterkeyhint="search" data-input="q"></div>
      <div class="mfilters" id="mfilters" aria-label="분류">${mfiltersHTML(st, data)}</div>
      ${mselectsHTML(st, data)}
      <div id="cards">${cardsHTML(st, data)}</div>
      <div class="more-ask"><span>찾는 인증이 목록에 없나요? 이 앱은 공식 근거를 확인한 인증만 진단해요.</span><a class="btn sm gh" href="${SITE.telHref}">전문가에게 문의</a></div>
    </section>
    <aside class="panel tray sticky" id="tray" aria-label="선택한 인증">${trayHTML(st, data)}</aside>
  </div>
  <div class="mbar" id="mbar">${mbarSelectHTML(st, data)}</div>
</section>`;
}

// ── 2 우리 회사 답하기 ─────────────────────────────────────
export function needsExport(st, data) {
  // 제품·판매 시장 질문은 해외 규정 트리아지(CE·FDA·FCC 등)만 쓴다 — 국내 제품 인증엔 묻지 않는다
  return st.selected.some((id) => data.schemeMap[id] && data.schemeMap[id].triage);
}
const relevantTo = (q, id) => [...q.show_when.matchAll(/scheme in \[([^\]]*)\]/g)].some((m) => m[1].split(',').map((x) => x.trim()).includes(id));
// 고른 인증의 판정 규칙이 실제로 읽는 질문
export function usedQuestions(st, data) {
  const out = new Set();
  st.selected.forEach((id) => { const p = data.packs[id]; if (p) questionsUsedBy(p, data.questionMap).forEach((q) => out.add(q)); });
  return out;
}
export function answerQuestions(st, data) {
  const Q = data.questions.questions;
  const used = usedQuestions(st, data);
  const common = Q.filter((q) => q.group === 'profile' && q.question_id !== 'company_name' && (q.core || used.has(q.question_id)));
  const exp = needsExport(st, data) ? [data.questionMap.markets, ...Q.filter((q) => q.group === 'export')] : [];
  const seen = new Set();
  const per = st.selected.map((id) => {
    const s = data.schemeMap[id];
    const list = Q.filter((q) => q.group === 'scheme' && relevantTo(q, id) && !seen.has(q.question_id));
    list.forEach((q) => seen.add(q.question_id));
    const items = s.self_check ? data.catalog.self_checks[s.self_check].items : s.prep_check ? prepItems(s, (data.catalog.prep_checks || {})[s.prep_check]) : [];
    const checks = items.map((it) => ({ id: `${id}:${it.item_id}`, label: it.label, why: it.why }));
    return { s, list, checks };
  });
  return { common, exp, per };
}
function estimateQuestions(st, data) {
  const { common, exp, per } = answerQuestions(st, data);
  return common.length + exp.length + per.reduce((n, p) => n + p.list.length + p.checks.length, 0);
}
function chipList(q, v, type = 'radio') {
  const vals = Array.isArray(v) ? v : v !== undefined ? [v] : [];
  return `<div class="chips">${q.response_options.map((o) => `<label class="chip${o.value === 'unknown' ? ' u' : ''}"><input type="${type}" name="${esc(q.question_id)}" value="${esc(o.value)}"${vals.includes(o.value) ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
}
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export function dynRatioHTML(q, st, data) {
  const a = st.answers;
  const ths = rdRatioThresholds(data.packs.VEN && data.packs.VEN.tables && data.packs.VEN.tables.rd_ratio, a.industry, a.ven_revenue);
  if (ths.length === 1 && a.ven_revenue && a.ven_revenue !== 'unknown' && a.industry && a.industry !== 'unknown') {
    const x = ths[0];
    const dq = { question_id: q.question_id, response_options: [{ value: `r:${x}:`, label: `네, ${x}% 이상` }, { value: `r:0:${x}`, label: `아니요, ${x}% 미만` }, { value: 'unknown', label: '모름' }] };
    const ind = data.questionMap.industry.response_options.find((o) => o.value === a.industry);
    const rev = data.questionMap.ven_revenue.response_options.find((o) => o.value === a.ven_revenue);
    return `<p class="dyn-note">우리 회사 기준: ${esc(ind ? ind.label : '')} · 매출 ${esc(rev ? rev.label : '')} → 공식 기준 ${x}%</p>${chipList(dq, a[q.question_id])}`;
  }
  const table = data.packs.VEN && data.packs.VEN.tables && data.packs.VEN.tables.rd_ratio;
  const bounds = table ? [...new Set(Object.values(table.rows).flat())].sort((x, y) => x - y).join('·') : '';
  return `<p class="dyn-note">업종과 매출 구간을 고르면 우리 회사 기준 비율 하나로 물어봐요. 지금은 기준 경계(${esc(bounds)}%)로 나눈 구간에서 골라 주세요.</p>${chipList(q, a[q.question_id])}`;
}
export function renderQ(q, st, data) {
  const v = st.answers[q.question_id];
  const id = `q-${q.question_id}`;
  const answered = v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
  const why = q.why_this_matters ? `<details class="why"><summary>왜 묻나요?</summary><p>${esc(q.why_this_matters)}</p>${q.evidence_examples && q.evidence_examples.length ? `<p>확인 자료: ${esc(q.evidence_examples.join(', '))}</p>` : ''}</details>` : '';
  const help = q.help_text ? `<p class="qh">${esc(q.help_text)}</p>` : '<p class="qh"></p>';
  const common = `data-qid="${esc(q.question_id)}" data-show="${esc(q.show_when)}"`;
  if (q.data_type === 'text') {
    return `<div class="q" ${common}><label class="ql" for="${id}">${esc(q.label_plain_ko)}</label>${help}<input class="q-text" id="${id}" type="text" name="${esc(q.question_id)}" value="${esc(v || '')}" maxlength="${esc((q.validation && q.validation.max_length) || 100)}" autocomplete="off"></div>`;
  }
  let body;
  if (q.dynamic === 'rd_ratio') body = `<div id="dyn-${esc(q.question_id)}">${dynRatioHTML(q, st, data)}</div>`;
  else if (q.response_options.some((o) => o.majors) && st.f && st.f.industry && st.f.industry !== 'unknown') {
    const keep = q.response_options.filter((o) => !o.majors || o.majors.includes(st.f.industry) || o.value === v);
    const major = industryOpts(data).find((o) => o.value === st.f.industry);
    body = `${chipList({ ...q, response_options: keep }, v)}<p class="muted small">‘${esc(major ? major.label : '')}’ 업종에 해당하는 항목만 보여 줘요. 맞는 게 없으면 1단계에서 업종을 ‘전체’로 바꿔 주세요.</p>`;
  } else body = chipList(q, isDate(v) ? undefined : v, q.data_type === 'multi' ? 'checkbox' : 'radio');
  const exact = q.allow_date ? `<details class="exact"${isDate(v) ? ' open' : ''}><summary>정확한 날짜로 입력</summary><label class="sr-only" for="${id}-date">${esc(q.label_plain_ko)} 날짜</label><input id="${id}-date" type="date" data-date-for="${esc(q.question_id)}" value="${isDate(v) ? esc(v) : ''}" min="1900-01-01" max="${esc(st.asOf)}"> <span class="muted small">날짜를 넣으면 진단 기준일(${esc(st.asOf)}) 기준 만 나이로 계산해요.</span></details>` : '';
  return `<fieldset class="q${answered ? ' answered' : ''}" ${common}><legend>${esc(q.label_plain_ko)}</legend>${help}${body}${exact}<p class="q-err" id="${id}-err" hidden></p>${why}</fieldset>`;
}
function checkQ(c, st) {
  const v = st.docStatus[c.id];
  const opt = (val, label) => `<label class="chip${val === 'unknown' ? ' u' : ''}"><input type="radio" name="sc-${esc(c.id)}" value="${val}" data-sc="${esc(c.id)}"${v === val ? ' checked' : ''}><span>${label}</span></label>`;
  return `<fieldset class="q${v ? ' answered' : ''}"><legend>${esc(c.label)}</legend><p class="qh">${esc(c.why)}</p><div class="chips">${opt('have', '네')}${opt('none', '아니요')}${opt('unknown', '모름')}</div></fieldset>`;
}
export function previewHTML(st, data, R, prog) {
  const rows = R.schemes.map((x) => `<div class="prev-row"><span>${esc(shortName(x.scheme))}</span>${badge(x.label.key, x.label.text, true)}</div>`).join('');
  const pct = prog.total ? Math.round((prog.done / prog.total) * 10) * 10 : 0;
  return `<h2>답할수록 결과가 바뀌어요</h2>
    <div class="bar" aria-hidden="true"><i class="w${pct}"></i></div><p class="note m0">${prog.total}개 중 ${prog.done}개 답함${prog.unknown ? ` (모름 ${prog.unknown}개)` : ''}</p>
    ${rows}

    <a class="btn w" href="#/result" data-act="to-result">결과 보기 ${ICON.arrow}</a>
    <a class="btn gh w mt8" href="#/select">${ICON.back} 인증 다시 고르기</a>`;
}
export function mbarAnswerHTML(R, prog) {
  const sum = R.schemes.map((x) => `${shortName(x.scheme)} ${x.label.key === 'pass' ? '✓' : x.label.key === 'fail' ? '✕' : x.label.key === 'unknown' ? '?' : '·'}`).join(' · ');
  return `<span class="c">${prog.done}/${prog.total} 답함 · ${esc(sum)}</span><a class="btn" href="#/result" data-act="to-result">결과 ${ICON.arrow}</a>`;
}
export function answerView(st, data, R, prog) {
  const { common, exp, per } = answerQuestions(st, data);
  const sec = (title, tag, inner, id = '') => `<h2 class="sec-t"${id ? ` id="${esc(id)}"` : ''}>${esc(title)}${tag ? ` <span>${esc(tag)}</span>` : ''}</h2>${inner}`;
  const qCount = (p) => p.list.length + p.checks.length;
  const jb = (id, label) => `<button type="button" data-act="jump" data-to="${esc(id)}">${esc(label)}</button>`;
  const jump = `<nav class="q-nav" aria-label="질문 구역 바로가기">${jb('sec-common', `공통 ${common.length}`)}${exp.length ? jb('sec-export', `제품·시장 ${exp.length}`) : ''}${per.filter((p) => qCount(p) > 0).map((p) => jb(`sec-${p.s.scheme_id}`, `${shortName(p.s)} ${qCount(p)}`)).join('')}</nav>`;
  const blocks = per.map(({ s, list, checks }) => {
    let inner = list.map((q) => renderQ(q, st, data)).join('') + checks.map((c) => checkQ(c, st)).join('');
    if (!inner) {
      inner = levelOf(s) === 'A' ? '<p class="note">위 공통 질문으로 판정해요. 추가 질문이 없어요.</p>'
        : s.triage ? '<p class="note">판매 시장·제품 정보(위 질문)로 확인할 규정을 정리해요.</p>'
          : '<p class="note">정보 안내 인증이라 질문이 없어요. 결과에서 무엇·어디서·공식 링크를 정리해 드려요.</p>';
    }
    if (s.prep_check && data.catalog.prep_checks && data.catalog.prep_checks[s.prep_check]) inner = `<p class="note">${esc(data.catalog.prep_checks[s.prep_check].note)}</p>${inner}`;
    if (s.self_check) inner = `<p class="note">${esc(data.catalog.self_checks[s.self_check].note)}</p>${inner}`;
    return sec(shortName(s), `${LEVEL_LABEL[levelOf(s)]} · ${list.length + checks.length}개`, inner, `sec-${s.scheme_id}`);
  }).join('');
  return `<section class="wrap">
  ${stepper('answer', st)}
  <h1 class="h1">우리 회사에 대해 알려 주세요</h1>
  <p class="lead">모두 버튼으로 답해요. 모르면 <b>모름</b>을 누르세요. 공통 질문은 한 번만, 인증별로는 판정에 필요한 핵심 요건만 물어요(여러 인증이 같이 쓰는 정보는 한 번만).</p>
  ${jump}
  <div class="grid g-two">
    <form data-form="answer" novalidate aria-label="진단 질문">
      ${sec('공통 질문', `고른 인증에 필요한 것만 · ${common.length}개`, common.map((q) => renderQ(q, st, data)).join(''), 'sec-common')}
      ${exp.length ? sec('제품·판매 시장', `${exp.length}개`, exp.map((q) => renderQ(q, st, data)).join(''), 'sec-export') : ''}
      ${blocks}
      ${sec('보고서 표지', '선택', renderQ(data.questionMap.company_name, st, data))}
    </form>
    <aside class="side-prev sticky"><div class="panel" id="preview" aria-live="polite">${previewHTML(st, data, R, prog)}</div></aside>
  </div>
  <div class="mbar" id="mbar">${mbarAnswerHTML(R, prog)}</div>
</section>`;
}

// ── 3 결과·할 일 ───────────────────────────────────────────
const STATUS_ICON = { pass: ICON.pass, fail: ICON.fail, unknown: ICON.unknown, na: ICON.na, out: ICON.out };
function leafLi(l, data) {
  const key = l.kind === 'assessment' ? 'out' : leafLabel(l.status).key;
  let sub = '';
  if (l.kind === 'assessment') sub = '공식 평가기관이 평가해요';
  else if (l.status === S.FAIL) sub = l.detail || l.action_fail || '';
  else if (l.status === S.UNKNOWN) sub = l.unverified ? (l.detail || '공식 원문 미확보') : l.missing && l.missing.length ? `확인할 정보: ${l.missing.map((q) => (data.questionMap[q] ? data.questionMap[q].label_plain_ko : q)).join(', ')}` : (l.detail || '');
  else if (l.status === S.PASS) sub = l.detail || '';
  return `<li><span class="c-${key}">${STATUS_ICON[key]}</span><div>${esc(l.label)}${l.is_condition ? ' <span class="muted small">(선행조건)</span>' : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</div></li>`;
}
const reqLeaves = (p) => p.leaves.filter((l) => l.kind !== 'assessment' && !l.inactive && !l.is_condition && l.status !== S.NA);
function bestPathway(r) {
  const order = { PASS: 0, UNKNOWN: 1, FAIL: 2, NOT_APPLICABLE: 3 };
  return [...r.pathways].sort((a, b) => order[a.basic] - order[b.basic] || reqLeaves(b).filter((l) => l.status === S.PASS).length - reqLeaves(a).filter((l) => l.status === S.PASS).length)[0];
}
function reqPanel(x, data) {
  const s = x.scheme; const r = x.result;
  if (r && r.gate.active) {
    if (r.pathways.length === 1) return `<ul class="cl">${r.pathways[0].leaves.filter((l) => !l.inactive && l.status !== S.NA).map((l) => leafLi(l, data)).join('')}</ul>`;
    const best = bestPathway(r);
    return `${s.pathway_note ? `<p class="note m0">${esc(s.pathway_note)}</p>` : ''}${r.pathways.map((p) => {
      const lb = { pass: '기본요건 충족', fail: '기본요건 미충족', unknown: '확인 필요', na: '해당 없음' }[leafLabel(p.basic).key];
      if (p.basic === S.NA) return `<div class="path na">${badge('na', lb, true)} <b>${esc(p.name)}</b> <span class="muted small">이 유형의 신청 대상이 아니에요.</span></div>`;
      const req = reqLeaves(p); const n = (k) => req.filter((l) => l.status === k).length;
      return `<details class="path"${p === best ? ' open' : ''}><summary>${badge(leafLabel(p.basic).key, lb, true)} ${esc(p.name)} <span class="muted">충족 ${n(S.PASS)} · 확인 필요 ${n(S.UNKNOWN)} · 미충족 ${n(S.FAIL)}</span></summary>
        <ul class="cl">${p.leaves.filter((l) => !l.inactive && l.status !== S.NA).map((l) => leafLi(l, data)).join('')}</ul></details>`;
    }).join('')}`;
  }
  if (r && !r.gate.active) return `<p class="notice warn">자동 판정을 멈췄어요: ${esc(r.gate.reason)}</p>`;
  if (x.triage) return `<div class="notice warn"><b>${esc(x.triage.label)}</b><ul>${x.triage.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>${x.triage.missing.length ? `<p class="m0">먼저 정리할 정보: ${esc(x.triage.missing.map((m) => m.text).join(', '))}</p>` : ''}<p class="small m0 mt8">${esc(x.triage.caution)}</p></div>`;
  if (x.selfcheck) {
    const k = { SELF_DECLARED_AVAILABLE: 'pass', NOT_AVAILABLE: 'fail' };
    return `<p class="note m0">${esc(x.selfcheckMeta.note)}</p><ul class="cl mt12">${x.selfcheck.rows.map((d) => { const key = k[d.status] || 'unknown'; return `<li><span class="c-${key}">${STATUS_ICON[key]}</span><div>${esc(d.label)}<small>${key === 'pass' ? '네(자가 응답)' : key === 'fail' ? `아니요 — ${esc(d.why)}` : '모름·미응답'}</small></div></li>`; }).join('')}</ul>`;
  }
  const kv = `<dl class="kv"><dt>무엇인가요?</dt><dd>${esc(s.what)}</dd><dt>언제 필요한가요?</dt><dd>${esc(s.when)}</dd><dt>누가 판단하나요?</dt><dd>${esc(s.who_decides)}</dd><dt>먼저 확인할 것</dt><dd>${esc(s.first_check)}</dd></dl>`;
  if (!x.prep) return kv;
  const k = { SELF_DECLARED_AVAILABLE: 'pass', NOT_AVAILABLE: 'fail' };
  return `${kv}<h3 class="sub-h">${esc(x.prepMeta.title)} <span class="muted small">판정 아님 · 자가 응답</span></h3><ul class="cl">${x.prep.rows.map((d) => { const key = k[d.status] || 'unknown'; return `<li><span class="c-${key}">${STATUS_ICON[key]}</span><div>${esc(d.label)}<small>${key === 'pass' ? '네(확인함)' : key === 'fail' ? '아니요 — 할 일에 넣었어요' : '모름·미응답 — 할 일에 넣었어요'}</small></div></li>`; }).join('')}</ul>`;
}
export function docRows(x) { return x.readiness ? x.readiness.rows.filter((r) => r.applicable) : []; }
// 공식 파일(PDF·HWP) 내려받기는 바로 받지 않고 안내 창(형식·출처·확인일)을 먼저 띄운다
export const isFile = (u) => /\.(pdf|hwp|hwpx|docx?|xlsx?|zip)(\?|$)/i.test(decodeURI(u || '')) || /\/file\/download/.test(u || '');
const fileType = (u, t) => ((decodeURI(u || '').match(/\.(pdf|hwpx?|docx?|xlsx?|zip)(\?|$)/i) || [])[1] || ((t || '').match(/\((PDF|HWP)\)/) || [])[1] || '파일').toUpperCase();
function dlBtn(url, title, checked, label) {
  return `<button type="button" class="dl" data-act="dl" data-url="${esc(url)}" data-title="${esc(title)}" data-type="${esc(fileType(url, title))}" data-checked="${esc(checked || '')}">${ICON.doc} ${esc(label || title)}</button>`;
}
function docsPanel(x) {
  const rows = docRows(x);
  const guides = x.scheme.guides || [];
  if (!rows.length) return `<p class="note">이 인증은 공식 서류 목록을 아직 정리하지 못했어요. ${extLink(x.scheme.official_link, '공식 기관 안내')}에서 확인하세요.</p>`;
  const req = rows.filter((d) => d.required).length;
  const dnote = x.scheme.docs_note ? `<p class="note m0">${esc(x.scheme.docs_note)}</p>` : '';
  return `${dnote}${guides.length ? `<h3 class="sub-h">공식 서식·안내 ${guides.length}개</h3><ol class="guide-list">${guides.map((g) => `<li>${isFile(g.url) ? dlBtn(g.url, g.title, g.checked_at) : extLink(g.url, g.title)}</li>`).join('')}</ol>` : ''}
    <h3 class="sub-h">신청서류 ${rows.length}개 <span class="muted small">필수 ${req}${rows.length > req ? ` · 해당 시 ${rows.length - req}` : ''}</span></h3>
    <table class="dt"><thead><tr><th scope="col" class="no">No.</th><th scope="col">서류</th><th scope="col">왜 필요한가</th><th scope="col">발급·내려받기</th></tr></thead><tbody>
    ${rows.map((d, i) => `<tr><td class="no">${i + 1}</td><td><b>${esc(d.label)}</b>${d.required ? '' : '<small>해당할 때만</small>'}</td><td>${esc(d.why)}</td><td>${d.link ? (isFile(d.link) ? dlBtn(d.link, `${d.label} 양식`, '', d.where || '양식 내려받기') : extLink(d.link, d.where || '바로가기')) : esc(d.where || '-')}${d.link_unverified ? ' <span class="unv">접속 미검증</span>' : ''}</td></tr>`).join('')}
    </tbody></table>`;
}
// 수수료·처리기간 — 공식 원문에서 확인한 값만 숫자로, 나머지는 '기관 확인'
export function feeSummary(s, pathwayName) {
  const f = s.fees;
  if (!f) return { b: '기관 확인', small: '공식 안내 확인 필요' };
  if (f.unverified) return { b: '기관 확인', small: '공식 원문 미확보' };
  const key = (pathwayName || '').replace(/\s/g, '');
  const it = f.items.find((i) => key && i.label.replace(/\s/g, '').startsWith(key)) || (f.items.length === 1 ? f.items[0] : null);
  if (it) return { b: won(it.company !== undefined ? it.company : it.total), small: `${it.company !== undefined ? '기업 부담 · ' : ''}VAT ${f.vat} · ${it.label}` };
  const vals = f.items.map((i) => (i.company !== undefined ? i.company : i.total));
  return { b: `${won(Math.min(...vals))}~`, small: `VAT ${f.vat} · 유형·신규/연장에 따라` };
}
export function procSummary(s, pathwayName) {
  const p = s.processing;
  if (!p || p.unverified) return { b: '기관 확인', small: '공식 원문 미확보' };
  const key = (pathwayName || '').replace(/유형$/, '');
  const it = p.items.find((i) => key && i.label.includes(key)) || (p.items.length === 1 ? p.items[0] : null);
  const fmt = (i) => (i.days ? `${i.days}일 이내` : `${i.weeks}주 이내`);
  if (it) return { b: fmt(it), small: it.label === '현장평가 실시' ? '현장평가까지' : '접수(수수료 납부)부터 결과 안내' };
  return { b: p.items.map(fmt).join(' / '), small: p.text };
}
// ── 등록 절차(인증별) — 단계는 데이터(catalog procedure)에서만. 원문에 없는 단계는 점선·'기관 확인' ──
export function procedureHTML(s, data, { compact = false } = {}) {
  const p = s.procedure;
  if (!p || !p.steps || !p.steps.length) return `<p class="note m0">공식 등록 절차는 아직 정리하지 못했어요. ${extLink(s.official_link, '공식 기관 안내')}에서 확인하세요.</p>`;
  const srcs = (p.source_refs || []).map((r) => data.sourceMap[r]).filter(Boolean);
  return `<ol class="proc n${Math.min(p.steps.length, 8)}${compact ? ' sm' : ''}" aria-label="${esc(p.title)} ${p.steps.length}단계">${p.steps.map((x, i) => `<li class="ps${x.unverified ? ' u' : ''}"><i>${i + 1}</i><b>${esc(x.label)}</b>${x.sub || x.unverified ? `<small>${esc(x.sub || '')}${x.unverified ? ' (원문 미확보)' : ''}</small>` : ''}</li>`).join('')}</ol>
    ${compact ? '' : `<p class="proc-src">${p.note ? `${esc(p.note)} · ` : ''}출처: ${srcs.map((so) => `${extLink(so.official_url, so.title)} <span class="muted">(${esc(ACCESS_LABEL[so.access_status])}, 확인 ${esc(so.checked_at)})</span>`).join(' · ')}</p>`}`;
}
function feePanel(x, data) {
  const s = x.scheme; const f = s.fees; const p = s.processing;
  const procTop = `<h3 class="sub-h">${esc((s.procedure && s.procedure.title) || '등록 절차')}</h3>${procedureHTML(s, data)}`;
  const src = (refs) => [...new Set(refs)].map((r) => data.sourceMap[r]).filter(Boolean).map((so) => `${extLink(so.official_url, so.title)} <span class="muted small">· 확인 ${esc(so.fee_checked_at || so.checked_at)}</span>`).join('<br>');
  let fee = '';
  if (!f) fee = `<p class="note">공식 수수료를 아직 정리하지 못했어요. ${extLink(s.official_link, '공식 기관 안내')}에서 확인하세요.</p>`;
  else if (f.unverified) fee = `<p class="notice warn m0">${esc(f.text)}</p>`;
  else {
    const hasGov = f.items.some((i) => i.gov !== undefined);
    fee = `<table class="dt"><thead><tr><th scope="col">구분</th>${hasGov ? '<th scope="col" class="num">합계</th><th scope="col" class="num">정부지원금</th>' : ''}<th scope="col" class="num">${hasGov ? '기업 부담금' : '금액'}</th></tr></thead><tbody>
      ${f.items.map((i) => `<tr><td class="lbl">${esc(i.label)}</td>${hasGov ? `<td class="num" data-label="합계">${won(i.total)}</td><td class="num" data-label="정부지원금">${won(i.gov)}</td>` : ''}<td class="num" data-label="${hasGov ? '기업 부담금' : '금액'}"><b>${won(i.company !== undefined ? i.company : i.total)}</b></td></tr>`).join('')}
      </tbody></table><p class="note">VAT ${esc(f.vat)}. ${esc(f.note || '')} ${esc(f.renew_note || '')}</p>`;
  }
  let proc = '';
  if (!p) proc = '<p class="note">처리기간을 아직 정리하지 못했어요.</p>';
  else if (p.unverified) proc = `<p class="notice warn m0">${esc(p.text)}</p>`;
  else proc = `<ul class="m0">${p.items.map((i) => `<li><b>${esc(i.label)}</b>: ${i.days ? `${i.days}일 이내` : `${i.weeks}주 이내`}</li>`).join('')}</ul><p class="note">${esc(p.text)}</p>`;
  const refs = [...((f && f.items) || []), ...((p && p.items) || [])].map((i) => i.source_ref);
  return `${procTop}<h3 class="m0">공식 수수료</h3>${fee}
    <h3 class="mt16">접수부터 확인서 발급까지</h3>${proc}
    ${x.ongoing ? `<h3 class="mt16">유효기간·사후관리</h3><p class="m0">${esc(x.ongoing)}</p>` : ''}
    ${refs.length ? `<p class="note mt12">근거: ${src(refs)}</p>` : ''}`;
}
function todoPanel(x, R) {
  const acts = R.actions.filter((a) => a.scheme_id === x.scheme.scheme_id);
  if (!acts.length) return '<p class="note">지금 할 일이 없어요.</p>';
  return `<div class="rm">${acts.map((a) => `<div class="ph"><span class="no2">${esc(TIMEFRAME[a.timeframe])}</span><div><b>${esc(a.title)}</b>${a.detail ? `<p>${esc(a.detail)}</p>` : ''}</div></div>`).join('')}</div>`;
}
function srcPanel(x, data) {
  const s = x.scheme; const r = x.result;
  const meta = r ? `규칙 ${esc(r.meta.rule_pack_id || '-')} v${esc(r.meta.rule_version || '-')} · 엔진 v${esc(r.meta.engine_version)} · 기준일 ${esc(r.meta.as_of)} · 근거 확인 ${esc(r.meta.last_verified_at || '-')}` : `근거 확인 ${esc(s.last_verified_at)}`;
  return `<ul class="m0">${s.sources.map((ref) => data.sourceMap[ref]).filter(Boolean).map((so) => `<li>${extLink(so.official_url, so.title)} <span class="muted small">· ${esc(so.regulator)} · 확인 ${esc(so.checked_at)} · ${esc(ACCESS_LABEL[so.access_status])}</span></li>`).join('')}</ul>
    <p class="note">${meta}</p>
    ${r && r.gate.active ? `<details class="expert"><summary>전문가용: 요건 ID별 판정</summary><p class="mono">${r.pathways.map((p) => `${esc(p.pathway_id)}: ${p.leaves.map((l) => `${esc(l.id)}=${esc(l.status)}`).join(', ')}`).join('<br>')}</p></details>` : ''}`;
}
export function tilesFor(x) {
  const s = x.scheme; const r = x.result;
  let req = { label: '판정 방식', b: LEVEL_LABEL[levelOf(s)], small: '' };
  let pw = null;
  if (r && r.gate.active) {
    pw = bestPathway(r);
    const rq = reqLeaves(pw);
    req = { label: '기본요건 <small>(평가 제외)</small>', b: `${rq.filter((l) => l.status === S.PASS).length} / ${rq.length} 충족`, small: r.pathways.length > 1 ? pw.name : '' };
  } else if (x.selfcheck) {
    const rows = x.selfcheck.rows;
    req = { label: '자가 확인', b: `${rows.filter((d) => d.status === 'SELF_DECLARED_AVAILABLE').length} / ${rows.length}`, small: '자가 응답 기준' };
  } else if (x.prep) {
    req = { label: '판정 방식', b: LEVEL_LABEL[levelOf(s)], small: `준비 점검 ${x.prep.rows.filter((d) => d.status === 'SELF_DECLARED_AVAILABLE').length}/${x.prep.rows.length}` };
  }
  const docs = docRows(x).length;
  const docsReq = docRows(x).filter((d) => d.required).length;
  const fee = feeSummary(s, pw && pw.name);
  const proc = procSummary(s, pw && pw.name);
  const apply = s.apply_site || { name: shortName(s) === s.issuing_authority ? '공식 기관' : s.issuing_authority, url: s.official_link };
  return { req, docs, docsReq, fee, proc, apply, pw };
}
function resultCard(x, data, R) {
  const s = x.scheme; const id = s.scheme_id;
  const t = tilesFor(x);
  // 어떤 인증이든 5개 탭을 항상 같은 순서로 보여 준다(서류 수가 없으면 숫자 없이)
  const tabs = [['req', '요건'], ['docs', t.docs ? `서류 ${t.docs}` : '서류'], ['fee', '비용·기간'], ['todo', '할 일'], ['src', '근거']];
  // 모바일 펼침 제목줄: 열지 않아도 핵심 숫자를 보여 준다
  const nTodo = R.actions.filter((a) => a.scheme_id === id).length;
  const nSrc = s.sources.filter((r) => data.sourceMap[r]).length;
  const accSum = {
    req: t.req.b,
    docs: t.docs ? `${t.docs}개${t.docsReq !== t.docs ? `(필수 ${t.docsReq})` : ''}` : '기관 안내',
    fee: `${t.fee.b} · ${t.proc.b}`,
    todo: `${nTodo}개`,
    src: `공식 출처 ${nSrc}건`,
  };
  const accLabel = { req: '요건', docs: '서류', fee: '비용·기간', todo: '할 일', src: '근거' };
  const panels = { req: () => reqPanel(x, data), docs: () => docsPanel(x), fee: () => feePanel(x, data), todo: () => todoPanel(x, R), src: () => srcPanel(x, data) };
  let sub = x.label.sub || '';
  if (x.result && x.result.gate.active && x.result.basic === S.PASS) sub = `${t.pw.name} 기본요건 충족 · 남은 단계는 기관 평가(결과는 기관이 결정)`;
  return `<article class="rc" id="res-${esc(id)}">
    <div class="rc-h"><div>${badge(x.label.key, x.label.text)}<h2 class="tt">${esc(s.name_ko)}</h2><p class="sub">${esc(sub)}</p></div>${levelTag(s)}</div>
    ${barHTML(x)}
    <div class="tiles">
      <div class="tile"><span>${t.req.label}</span><b>${esc(t.req.b)}</b>${t.req.small ? `<small>${esc(t.req.small)}</small>` : ''}</div>
      <div class="tile"><span>신청서류</span><b>${t.docs ? `${t.docs}개` : '기관 안내'}</b>${t.docs && t.docsReq !== t.docs ? `<small>필수 ${t.docsReq} · 해당 시 ${t.docs - t.docsReq}</small>` : ''}</div>
      <div class="tile"><span>신청처</span><b>${extLink(t.apply.url, t.apply.name)}</b></div>
      <div class="tile"><span>공식 수수료</span><b>${esc(t.fee.b)}</b><small>${esc(t.fee.small)}</small></div>
      <div class="tile"><span>처리기간</span><b>${esc(t.proc.b)}</b><small>${esc(t.proc.small)}</small></div>
    </div>
    <div class="rtabs" role="tablist" aria-label="${esc(shortName(s))} 상세">${tabs.map(([k, l], i) => `<button type="button" role="tab" id="tb-${esc(id)}-${k}" aria-controls="tp-${esc(id)}-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-act="tab" data-card="${esc(id)}" data-k="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="acc">${tabs.map(([k], i) => `<button type="button" class="acc-h" id="ah-${esc(id)}-${k}" data-act="acc" data-card="${esc(id)}" data-k="${k}" aria-expanded="${i === 0}" aria-controls="tp-${esc(id)}-${k}"><span class="acc-l">${esc(accLabel[k])}</span><em>${esc(accSum[k])}</em><i aria-hidden="true">⌄</i></button>
    <div class="tp${i === 0 ? ' on open' : ''}" role="tabpanel" id="tp-${esc(id)}-${k}" aria-labelledby="tb-${esc(id)}-${k}">${panels[k]()}</div>`).join('')}</div>
  </article>`;
}
// 결과 카드 진행 막대: 가장 가까운 경로의 기본요건(기관 평가 제외)을 충족·확인 필요·미충족 칸으로
function barHTML(x) {
  const r = x.result;
  if (!r || !r.gate.active || r.basic === S.NA) return '';
  const pw = bestPathway(r); const req = reqLeaves(pw);
  if (!req.length) return '';
  const cls = { [S.PASS]: 'ok', [S.FAIL]: 'no', [S.UNKNOWN]: 'q' };
  const n = (st) => req.filter((l) => l.status === st).length;
  return `<div class="rbar" aria-hidden="true">${req.map((l) => `<i class="${cls[l.status] || 'q'}"></i>`).join('')}</div>
    <p class="rbar-l">기본요건 ${n(S.PASS)} / ${req.length} 충족${n(S.UNKNOWN) ? ` · 확인 필요 ${n(S.UNKNOWN)}` : ''}${n(S.FAIL) ? ` · 미충족 ${n(S.FAIL)}` : ''}${r.pathways.length > 1 ? ` · ${esc(pw.name)} 기준` : ''}</p>`;
}
export function headline(R) {
  const n = R.schemes.length; const k = R.summary.byKey;
  if (!R.summary.diagnosed) return { h: `고른 ${n}개 인증의 확인 사항을 정리했어요`, p: '자동 판정 대상이 아니어서, 무엇을 어디서 확인할지와 공식 링크를 정리했어요.' };
  const parts = [];
  R.schemes.forEach((x) => {
    if (x.label.key === 'unknown' && x.missing.length) parts.push(`${shortName(x.scheme)}는 확인할 것 ${x.missing.length}가지`);
    if (x.label.key === 'fail') { const f = R.actions.find((a) => a.scheme_id === x.scheme.scheme_id && a.category === 1); parts.push(`${shortName(x.scheme)}는 ${f ? f.title.replace(/ — 미충족$/, ' 보완') : '보완'}이 필요`); }
  });
  const h = k.pass ? `${n}개 중 ${k.pass}개는 신청 기본요건을 갖췄어요` : k.fail && !k.unknown ? `${n}개 모두 지금은 기본요건을 보완해야 해요` : `${n}개 인증, 몇 가지만 확인하면 판정돼요`;
  return { h: n === 1 && k.pass ? '신청 기본요건을 갖췄어요' : h, p: parts.length ? `${parts.join(', ')}해요.` : '아래에서 인증별 요건·서류·비용을 확인하세요.' };
}
export function resultView(st, data, R) {
  const k = R.summary.byKey; const hl = headline(R);
  const kv = [['pass', '기본요건 충족'], ['unknown', '확인 필요'], ['fail', '보완 필요']];
  const order = ['now', 'd30', 'd60', 'd90', 'ongoing'];
  const many = R.schemes.length > 1;
  const steps = order.map((tf) => R.roadmap[tf].slice(0, 1).map((a) => `<div class="ph"><span class="no2">${esc(TIMEFRAME[tf])}</span><div>${many ? `<span class="who">${esc(shortName(data.schemeMap[a.scheme_id]))}</span>` : ''}<b>${esc(a.title)}</b>${a.detail ? `<p>${esc(a.detail.length > 70 ? `${a.detail.slice(0, 70)}…` : a.detail)}</p>` : ''}</div></div>`).join('')).join('');
  const applyLinks = R.schemes.map((x) => tilesFor(x).apply).map((a, i) => `<li>${extLink(a.url, `${shortName(R.schemes[i].scheme)} — ${a.name}`)}</li>`).join('');
  return `<section class="wrap">
  ${stepper('result', st)}
  <div class="hero-r">
    <div><p>진단 결과 · ${esc(fmtDate(R.meta.as_of))} · ${esc(R.meta.doc_id)}</p><h1 id="result-title" tabindex="-1">${esc(hl.h)}</h1><p>${esc(hl.p)}</p></div>
    ${R.summary.diagnosed ? `<div class="k">${kv.map(([key, l]) => `<div><b>${k[key] || 0}</b><span>${l}</span></div>`).join('')}</div>` : ''}
  </div>
  <p class="disc">입력한 정보 기준 사전 진단이에요. 최종 확인·선정·인정은 공식 기관의 평가와 심사로 결정돼요. 확률·점수는 표시하지 않아요.</p>
  <div class="grid g-two">
    <div>
      <section class="zone" aria-labelledby="z1"><h2 class="zone-h" id="z1"><span>1</span>인증별 진단 결과 <em>${R.schemes.length}개</em></h2>
        ${R.schemes.map((x) => resultCard(x, data, R)).join('')}</section>
      ${procZoneHTML(R, data)}
      ${prepHTML(R, 3)}
      ${nextHTML(R, R.connect && (R.connect.strategy.length || R.connect.commonDocs.length) ? 4 : 3)}
    </div>
    <aside class="side-r" aria-label="할 일·신청·저장">
      <div class="panel rm"><h2 class="side-t">무엇부터 할까요? <em>${R.actions.length}개</em></h2>${steps || '<p class="note">지금 할 일이 없어요.</p>'}</div>
      <div class="panel"><h2 class="side-t">공식 신청 바로가기</h2><ul class="links-list">${applyLinks}</ul></div>
      <div class="panel act"><h2 class="side-t">보고서 저장</h2>
        <button class="btn w" type="button" data-act="print">${ICON.print} PDF 보고서 저장</button>
        <a class="btn w sec" href="#/report">${ICON.doc} 문구 수정 · HTML 저장</a>
        <a class="btn w gh" href="#/answer">${ICON.back} 답 고치기</a>
      </div>
      <div class="callout"><h2 class="side-t">인증 준비, 함께 하실까요?</h2><p>신청 순서와 서류 준비를 도와드려요.</p>
        <a class="btn w navy" href="${SITE.telHref}">${ICON.phone} ${esc(SITE.tel)} 상담</a>
        <a class="btn w sec" href="${esc(consultMailto(R))}">${ICON.doc} 결과 담아 메일 상담</a></div>
      <p class="note">문서 ${esc(R.meta.doc_id)} · 앱 v${esc(R.meta.app_version)} · 데이터 ${esc(R.meta.data_versions.catalog)}</p>
    </aside>
  </div>
</section>`;
}
export function consultMailto(R) {
  const lines = ['[기업인증 진단 결과로 상담 요청]', `문서번호: ${R.meta.doc_id} (진단 기준일 ${R.meta.as_of})`, '', '■ 진단 결과', ...R.schemes.map((x) => `- ${x.scheme.name_ko}: ${x.label.text}`), '', '■ 먼저 할 일', ...R.actions.slice(0, 3).map((a, i) => `${i + 1}. [${a.scheme_name}] ${a.title}`), '', '■ 상담받고 싶은 내용:', '■ 회사명·연락처:'];
  return `mailto:${SITE.mail}?subject=${encodeURIComponent(`[기업인증 진단] 상담 요청 ${R.meta.doc_id}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
// 고른 인증의 등록 절차를 한곳에 모아(취합) 단계 수와 함께 보여 준다
function procZoneHTML(R, data) {
  const rows = R.schemes.map((x) => { const s = x.scheme; const n = s.procedure ? s.procedure.steps.length : 0;
    return `<div class="proc-row"><div class="proc-nm"><b>${esc(shortName(s))}</b><span>${n ? `${n}단계` : '기관 안내'}</span></div>${procedureHTML(s, data, { compact: true })}</div>`; }).join('');
  return `<section class="zone" aria-labelledby="proc-h"><h2 class="zone-h" id="proc-h"><span>2</span>등록 절차 한눈에 <em>${R.schemes.length}개 인증</em></h2>
    <div class="proc-all">${rows}</div><p class="note">단계별 출처는 인증 카드의 ‘비용·기간’ 탭에 있어요. 점선 단계는 공식 원문을 확보하지 못한 단계예요.</p></section>`;
}
function prepHTML(R, no = 2) {
  const c = R.connect || { strategy: [], commonDocs: [] };
  if (!c.strategy.length && !c.commonDocs.length) return '';
  return `<section class="zone" aria-labelledby="prep-h"><h2 class="zone-h" id="prep-h"><span>${no}</span>여러 인증 함께 준비</h2><div class="prep">
    ${c.strategy.map((x) => `<p class="m0 mt8">${esc(x.text)}</p>`).join('')}
    ${c.commonDocs.length ? `<p class="m0 mt8"><b>공통 서류 ${c.commonDocs.length}종</b> — 한 번 발급해 같이 쓰면 돼요. 발급일 제한(예: 1개월 이내)이 있는 서류는 신청 직전에 발급하세요.</p>
    <ul class="common-docs">${c.commonDocs.map((d) => `<li><b>${esc(d.name)}</b> <span class="muted small">${esc(d.schemes.join(' · '))}</span></li>`).join('')}</ul>` : ''}</div></section>`;
}
function nextHTML(R, no = 3) {
  const c = R.connect || { next: [] };
  if (!c.next.length) return '';
  return `<section class="zone" aria-labelledby="next-h"><h2 class="zone-h" id="next-h"><span>${no}</span>다음 진단 추천 <em>BECONIC 31</em></h2>
    <p class="note m0">결과에 맞춰 이어서 하면 좋은 진단이에요. 새 창으로 열리고 입력한 정보는 넘어가지 않아요.</p>
    <div class="next-grid">${c.next.map((n, i) => `<div class="next-card"><div class="next-top"><span class="next-no">${i + 1}</span><p class="next-name">${esc(n.name)}</p></div><p class="next-why">${esc(n.why)}</p>${extLink(n.url, '진단 시작하기', 'btn sm sec w')}</div>`).join('')}</div></section>`;
}

// ── 보고서 화면(문구 수정·HTML 저장) ───────────────────────
export function reportView(reportHTML, edited) {
  return `<section class="wrap">
  <div class="rep-bar"><div class="row"><a class="btn sm gh" href="#/result">${ICON.back} 결과로</a><span class="small muted">문구를 고친 뒤 PDF 또는 HTML로 저장하세요. 고친 내용은 이 화면에만 있어요.</span>${edited ? '<span class="edit-flag">편집본</span>' : ''}</div>
    <div class="row"><button class="btn sm sec" type="button" data-act="rep-edit" aria-pressed="false">✎ 문구 수정 켜기</button><button class="btn sm gh" type="button" data-act="rep-html">HTML 저장</button><button class="btn sm" type="button" data-act="print">${ICON.print} PDF 저장</button></div></div>
  <h1 class="sr-only">보고서 미리보기</h1>
  <div class="rep-stage" id="rep-stage">${reportHTML}</div>
</section>`;
}

// ── 인증 상세 ──────────────────────────────────────────────
export function schemeDetail(st, data, id) {
  const s = data.schemeMap[id];
  if (!s) return errorView('해당 인증을 찾지 못했어요.', '#/select', '인증 목록으로');
  const x = { scheme: s, ongoing: s.ongoing && s.ongoing.text ? `${s.ongoing.text}${s.ongoing.unverified ? ' (근거 원문 미확보)' : ''}` : null };
  const sel = st.selected.includes(id);
  return `<section class="wrap narrow">
  <p><a href="#/select">${ICON.back} 인증 목록</a></p>
  <p class="row">${fieldTag(s)}${levelTag(s)}</p>
  <h1 class="h1">${esc(s.name_ko)}</h1>
  <p class="muted">${esc(s.official_name)}</p>
  <div class="card"><dl class="kv">
    <dt>무엇인가요?</dt><dd>${esc(s.what)}</dd><dt>언제 필요한가요?</dt><dd>${esc(s.when)}</dd>
    <dt>누가 판단하나요?</dt><dd>${esc(s.who_decides)}</dd><dt>먼저 확인할 것</dt><dd>${esc(s.first_check)}</dd>
    <dt>의무성</dt><dd>${esc(MANDATORY_LABEL[s.mandatory_status])}</dd><dt>제도 유형</dt><dd>${esc(TYPE_LABEL[s.scheme_type])}</dd>
    <dt>발급·확인</dt><dd>${esc(s.issuing_authority)}</dd>
    <dt>진단 방식</dt><dd>${{ A: '공식 원문으로 검증한 기본요건을 자동 판정', B: '핵심 요건·준비상태를 스스로 확인(판정 아님)', C: '정보 안내(자동 판정 없음)' }[levelOf(s)]}</dd>
  </dl></div>
  ${s.fees || s.processing || s.procedure ? `<div class="card">${feePanel(x, data)}</div>` : ''}
  <p class="notice info">${esc(s.scope_note)}</p>
  ${s.help_text ? `<p class="muted">${esc(s.help_text)}</p>` : ''}
  <h2 class="h2">공식 근거</h2>
  <ul>${s.sources.map((r) => data.sourceMap[r]).filter(Boolean).map((so) => `<li>${extLink(so.official_url, so.title)} <span class="muted">· ${esc(so.regulator)} · 확인 ${esc(fmtDate(so.checked_at))} · ${esc(ACCESS_LABEL[so.access_status])}</span></li>`).join('')}</ul>
  <p class="row mt24"><button class="btn" type="button" data-act="pick-go" data-id="${esc(id)}">${sel ? '선택됨 · 답하러 가기' : '이 인증 진단하기'} ${ICON.arrow}</button>${extLink(s.official_link, '공식 기관 바로가기', 'btn gh')}</p>
  <p class="disc mt16">${esc(s.disclaimer)}</p>
</section>`;
}

// ── 안내·오류 ──────────────────────────────────────────────
export function errorView(msg, href = '#/', cta = '처음으로', extra = '') {
  return `<section class="wrap narrow"><h1 class="h1">${esc(msg)}</h1>${extra}<p class="row"><a class="btn" href="${esc(href)}">${esc(cta)}</a><a class="btn gh" href="${SITE.telHref}">전문가 문의</a></p></section>`;
}
export function noStateView() {
  return errorView('먼저 진단할 인증을 골라 주세요', '#/select', '인증 고르기', '<p class="lead">입력한 내용은 저장하지 않아서, 새로고침하거나 창을 닫으면 사라져요.</p>');
}
export function loadErrorView(detail) {
  return `<section class="wrap narrow"><h1 class="h1">화면을 불러오지 못했어요</h1>
  <p class="lead">네트워크가 불안정하거나 일시적인 문제일 수 있어요. 입력한 정보는 서버로 보내지 않아요.</p>
  <p class="notice err">${esc(detail)}</p>
  <p class="row"><button class="btn" type="button" data-act="reload">다시 시도</button><a class="btn gh" href="${SITE.telHref}">전화 상담 ${esc(SITE.tel)}</a></p></section>`;
}
export function privacyView() {
  return `<section class="wrap narrow prose"><h1 class="h1">개인정보·데이터 안내</h1>
  <p>이 진단은 입력한 정보를 <b>브라우저 메모리 안에서만</b> 계산해요.</p>
  <ul><li>입력 내용을 서버로 보내거나, 브라우저 저장소(localStorage 등)에 저장하지 않아요. 새로고침하면 사라져요.</li>
  <li>외부 분석 도구(애널리틱스)·광고 추적·외부 글꼴 서버를 쓰지 않아요. 글꼴(Pretendard)은 이 사이트에서 직접 제공해요.</li>
  <li>PDF·HTML 보고서는 내 기기에 저장돼요. 저장 여부를 이 서비스가 알 수 없어요. ‘문구 수정’으로 고친 내용도 내 화면에만 있어요.</li>
  <li>상담은 전화·메일로만 받아요. 이 화면에서 연락처를 수집하지 않아요.</li>
  <li>‘결과 담아 메일 상담’은 내 메일 앱에 초안(문서번호·결과 요약)을 열기만 해요. 회사명 등 입력값은 넣지 않고, 보낼지는 직접 정해요.</li>
  <li>‘다음 진단 추천’ 링크로 다른 BECONIC 진단으로 이동해도 입력한 정보는 넘어가지 않아요.</li></ul>
  <p class="muted">운영사의 정식 개인정보 처리방침이 마련되면 이 페이지에서 연결해요. 문의: ${esc(SITE.mail)}</p></section>`;
}
export function aboutDataView(data) {
  const all = data.catalog.schemes;
  const lv = (l) => all.filter((s) => levelOf(s) === l).length;
  const rows = data.sources.sources.map((s) => `<tr><td>${extLink(s.official_url, s.title)}</td><td>${esc(s.regulator)}</td><td>${esc(s.document_identifier || '-')}</td><td>${esc(s.checked_at)}</td><td>${esc(ACCESS_LABEL[s.access_status])}</td></tr>`).join('');
  const packs = Object.values(data.packs).map((p) => `<li><b>${esc(data.schemeMap[p.scheme_id].name_ko)}</b> — 규칙 ${esc(p.rule_pack_id)} v${esc(p.rule_version)} · 적용 ${esc(p.valid_from)}~ · 재확인 기한 ${esc(p.review_due_at)}</li>`).join('');
  const unv = all.filter((s) => (s.fees && s.fees.unverified) || (s.processing && s.processing.unverified)).map((s) => shortName(s));
  return `<section class="wrap prose"><h1 class="h1">근거·데이터 기준</h1>
  <p>인증 ${all.length}개 — <b>자동 판정 ${lv('A')}</b>(공식 원문 규칙) · <b>요건 체크 ${lv('B')}</b>(핵심 요건 자가 확인) · <b>정보 안내 ${lv('C')}</b>(무엇·어디서·공식 링크).</p>
  <p>자동 판정은 <b>공식 원문과 대조한 요건</b>에만 적용해요. 원문을 확인하지 못한 요건은 ‘확인 필요’로 표시하고 판정하지 않아요. 규칙 재확인 기한이 지나면 자동 판정을 스스로 멈춰요. 구간 버튼의 경계는 법정 기준값과 같아서, 구간이 기준에 걸치는 경우에만 ‘확인 필요’가 돼요.</p>
  <p>공식 수수료·처리기간은 기관 공식 안내 문구와 한 글자씩 대조한 값만 숫자로 보여 줘요.${unv.length ? ` 원문을 확보하지 못한 인증(${esc(unv.join(', '))})은 ‘기관 확인’으로 표시해요.` : ''}</p>
  <p class="notice warn">전문가(법률) 검토는 거치지 않았어요. 운영사 대표가 규칙과 근거를 검토하는 구조예요.</p>
  <h2>자동 판정 규칙</h2><ul>${packs}</ul>
  <h2>공식 출처 (${data.sources.sources.length}개)</h2>
  <div class="tbl-wrap" tabindex="0" role="region" aria-label="공식 출처 표"><table class="dt"><thead><tr><th scope="col">출처</th><th scope="col">기관</th><th scope="col">문서</th><th scope="col">확인일</th><th scope="col">접속 상태</th></tr></thead><tbody>${rows}</tbody></table></div>
  <h2>아직 확인하지 못한 부분</h2>
  <ul><li>기업부설연구소·전담부서: 협회 업무편람(접속 불가), 인정 신고 수수료·처리기간 원문 미확보</li>
  <li>이노비즈: 운영규정 별표 2(신청 불가 업종) 원문 미확보, 확인서 발급까지 처리기간 공식 안내 없음</li>
  <li>메인비즈: 업력 기산일 정의 조항 미확보, 현장평가 이후 발급 승인 기간 공식 안내 없음</li>
  <li>벤처: 확인 유효기간·사후관리 기준 미반영</li>
  <li>정보 안내 인증: 자동 판정 없음. 일부 사이트는 접속 차단·불가로 원문 미확인</li></ul></section>`;
}
