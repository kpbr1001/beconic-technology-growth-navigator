// 인쇄 전용 보고서 DOM — 화면 캡처가 아닌 별도 문서 구조. 표 semantics(table/thead/tbody)를 유지한다.
import { esc, fmtDate, ACCESS_LABEL, LEVEL_LABEL, levelOf, won } from './ui.js';
import { S, leafLabel } from './engine.js';
import { CATEGORY, TIMEFRAME } from './model.js';
import { tilesFor, docRows } from './views.js';
import { SITE } from './site.js';

const STATUS_TXT = { pass: '✓ 기본요건 확인', fail: '✕ 기본요건 미충족', unknown: '? 추가 확인 필요', na: '— 해당 없음', out: 'ⓘ 판정 범위 밖' };
const LEAF_TXT = { pass: '✓ 충족', fail: '✕ 미충족', unknown: '? 확인 필요', na: '— 해당 없음' };

function fmtAnswer(data, q, v) {
  const qd = data.questionMap[q];
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '미입력';
  if (v === 'unknown') return '모름';
  if (!qd) return String(v);
  if (qd.data_type === 'single') { const o = qd.response_options.find((x) => x.value === v); return o ? o.label : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}(날짜 입력)` : String(v); }
  if (qd.data_type === 'multi') return v.map((x) => { const o = qd.response_options.find((y) => y.value === x); return o ? o.label : x; }).join(', ');
  if (typeof v === 'number') return `${v.toLocaleString('ko-KR')}${qd.units || ''}`;
  return String(v);
}

function leafInputs(data, R, l) {
  const ans = R._answers || {};
  const qs = (l.inputs || []).filter((q, i, a) => a.indexOf(q) === i && data.questionMap[q] && ans[q] !== undefined);
  if (l.kind === 'assessment') return '평가·심사 단계';
  if (!qs.length) return '미입력';
  return qs.slice(0, 3).map((q) => fmtAnswer(data, q, ans[q])).join(' / ');
}

// 부록 출처 번호 — 판정표에서는 [번호]로만 참조해 표를 짧게 유지
function sourceIndex(R) {
  const ids = [];
  R.schemes.forEach((x) => x.scheme.sources.forEach((r) => { if (!ids.includes(r)) ids.push(r); }));
  return Object.fromEntries(ids.map((r, i) => [r, i + 1]));
}
function readableUrl(u) { try { return decodeURI(u); } catch { return u; } }

function cover(data, R, opt) {
  const m = R.meta;
  return `<section class="p-cover">
  <div class="p-cover-top"><img src="assets/growth-shield-symbol-navy.png" alt="" class="p-cover-logo"><span class="p-cover-brand">BECONIC</span><span class="p-edit" data-edit-flag${opt.edited ? '' : ' hidden'}>편집본 — 진단 결과 문구를 사용자가 고침</span></div>
  <div class="p-cover-mid">
    <p class="p-kicker">BECONIC Certification Readiness Report</p>
    <h1 class="p-title">기업인증 진단 보고서</h1>
    <p class="p-company">${esc(m.company_name || '기업명 미입력')}</p>
    <table class="p-meta"><tbody>
      <tr><th scope="row">검토 대상</th><td>${R.schemes.map((x) => esc(x.scheme.name_ko)).join(', ') || '-'}</td></tr>
      <tr><th scope="row">진단일·작성기준일</th><td>${esc(fmtDate(m.as_of))}</td></tr>
      <tr><th scope="row">문서 ID</th><td>${esc(m.doc_id)}</td></tr>
      <tr><th scope="row">기준 버전</th><td>앱 v${esc(m.app_version)} · 판정엔진 v${esc(m.engine_version)} · 제도데이터 ${esc(m.data_versions.catalog)}</td></tr>
    </tbody></table>
  </div>
  <div class="p-cover-bot">
    <p>이 문서는 사용자의 브라우저에서 생성되었으며 운영사 서버에 저장되지 않습니다. 입력 정보에 기초한 사전 검토 자료로, 인증·확인·허가 결과를 보장하지 않습니다.</p>
    <p>${esc(SITE.company)} · ${esc(SITE.address)} · ${esc(SITE.tel)} · ${esc(SITE.mail)} · ${esc(SITE.web.replace(/^https:\/\/|\/$/g, ''))}</p>
  </div></section>`;
}

function execSummary(data, R) {
  const s = R.summary;
  const rows = R.schemes.map((x) => {
    let reason = '';
    if (x.result && x.result.gate.active) {
      const pass = x.result.pathways.filter((p) => p.basic === S.PASS).map((p) => p.name);
      const fails = []; x.result.pathways.forEach((p) => { if (p.basic !== S.NA) p.leaves.forEach((l) => { if (l.status === S.FAIL && !l.inactive && !fails.includes(l.label)) fails.push(l.label); }); });
      if (x.result.basic === S.PASS) reason = `${pass.join('·')} 기준 기본요건 확인. 기관 평가 필요`;
      else if (x.result.basic === S.FAIL) reason = `미충족: ${fails.slice(0, 2).join(', ')}`;
      else if (x.result.basic === S.UNKNOWN) reason = `확인할 정보 ${x.missing.length}개${x.result.pathways.some((p) => p.leaves.some((l) => l.unverified)) ? ' · 미검증 요건 포함' : ''}`;
      else reason = '공식 기준상 신청 대상 아님';
    } else if (x.triage) reason = '적용 규정 확인 필요(의무 여부 미판정)';
    else if (x.selfcheck) reason = '준비상태 자가점검 대상';
    else reason = '정보 안내 제도';
    const next = R.actions.find((a) => a.scheme_id === x.scheme.scheme_id);
    return `<tr><td>${esc(x.scheme.name_ko)}</td><td class="nw">${esc(STATUS_TXT[x.label.key])}</td><td>${esc(reason)}</td><td>${esc(next ? next.title : '-')}</td></tr>`;
  }).join('');
  const top = R.actions.slice(0, 3);
  return `<section class="p-page p-exec">
  <h2 class="p-h2"><span class="p-num">01</span> Executive Summary</h2>
  <p class="p-headline">${esc(s.headline)}</p>
  <table class="p-table t-exec"><colgroup><col class="c-22"><col class="c-18"><col class="c-32"><col class="c-28"></colgroup>
    <thead><tr><th scope="col">제도</th><th scope="col">기본요건 상태</th><th scope="col">핵심 사유</th><th scope="col">다음 행동</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="p-grid2">
    <div class="p-box"><h3 class="p-h3">주요 발견</h3><ol class="p-ol">${s.findings.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ol></div>
    <div class="p-box"><h3 class="p-h3">우선 행동</h3><ol class="p-ol">${top.map((a) => `<li><b>[${esc(TIMEFRAME[a.timeframe])}]</b> ${esc(a.title)}</li>`).join('') || '<li>즉시 할 일 없음</li>'}</ol></div>
  </div>
  <div class="p-box p-risk"><h3 class="p-h3">미확인 위험</h3>
    <p>${s.unknown + R.unknownInputs.length === 0 ? '입력한 정보 기준으로 확인되지 않은 요건·정보는 없어요. 다만 입력값 자체가 사실과 다르면 결과가 달라져요.' : `확인되지 않은 요건 ${s.unknown}개(이 중 공식 원문 미검증 ${s.unverified}개), 입력이 필요한 정보 ${R.unknownInputs.length}개가 있어요. 이 항목이 확인되기 전에는 결과가 달라질 수 있어요.`}</p>
    <p class="p-note">‘기본요건 확인’은 입력 정보 기준 사전 판단이며, 최종 확인·선정·인정은 관할기관과 평가기관의 심사로 결정됩니다. 확률·점수는 산출하지 않습니다.</p></div>
</section>`;
}

function comparison(data, R) {
  if (!R.schemes.length) return '';
  const rows = R.schemes.map((x) => {
    const tl = tilesFor(x);
    return `<tr><td><b>${esc(x.scheme.name_ko)}</b><br><span class="p-muted">${esc(LEVEL_LABEL[levelOf(x.scheme)])}</span></td><td>${esc(tl.req.b)}${tl.req.small ? `<br><span class="p-muted">${esc(tl.req.small)}</span>` : ''}</td><td>${tl.docs ? `${tl.docs}개` : '기관 안내'}</td><td>${esc(tl.apply.name)}</td><td>${esc(tl.fee.b)}<br><span class="p-muted">${esc(tl.fee.small)}</span></td><td>${esc(tl.proc.b)}<br><span class="p-muted">${esc(tl.proc.small)}</span></td></tr>`;
  }).join('');
  return `<section class="p-sec">
  <h2 class="p-h2"><span class="p-num">02</span> 인증별 결과 요약 — 기본요건·서류·신청처·수수료·기간</h2>
  <p class="p-p">수수료·처리기간은 기관 공식 안내 문구와 대조한 값만 숫자로 적었고, 원문을 확보하지 못한 값은 ‘기관 확인’으로 표시했습니다. 수수료는 VAT 포함 금액입니다.</p>
  <table class="p-table"><colgroup><col class="c-18"><col class="c-16"><col class="c-10"><col class="c-16"><col class="c-20"><col class="c-20"></colgroup>
  <thead><tr><th scope="col">인증</th><th scope="col">기본요건(평가 제외)</th><th scope="col">신청서류</th><th scope="col">신청처</th><th scope="col">공식 수수료</th><th scope="col">처리기간</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function ruleTables(data, R) {
  const SI = sourceIndex(R);
  const blocks = R.schemes.map((x) => {
    const s = x.scheme;
    let inner = '';
    if (x.result && x.result.gate.active) {
      inner = x.result.pathways.map((p) => {
        const lb = leafLabel(p.basic).key;
        if (p.basic === S.NA) return `<h4 class="p-h4">${esc(p.name)} — ${esc(LEAF_TXT.na)}</h4><p class="p-p p-muted">공식 기준상 이 신청 유형의 대상이 아닙니다.</p>`;
        const rows = p.leaves.map((l) => {
          const k = l.kind === 'assessment' ? null : leafLabel(l.status).key;
          const stx = l.kind === 'assessment' ? 'ⓘ 기관 평가' : l.unverified ? '? 확인 필요(미검증)' : LEAF_TXT[k];
          const src = (l.source_refs || []).filter((r) => SI[r]).map((r) => `[${SI[r]}]`).join(' ');
          let next = '-';
          if (l.inactive) next = '해당 유형 아님';
          else if (l.kind === 'assessment') next = '평가기관 판단';
          else if (l.status === S.FAIL) next = l.action_fail || '';
          else if (l.status === S.UNKNOWN) next = l.unverified ? (l.detail || '') : (l.missing && l.missing.length ? `확인: ${l.missing.map((q) => (data.questionMap[q] ? data.questionMap[q].label_plain_ko : q)).join(', ')}` : (l.detail || ''));
          return `<tr><td>${esc(l.label)}${l.is_condition ? ' (선행조건)' : ''}</td><td>${esc(leafInputs(data, R, l))}${l.detail && !l.unverified && l.kind !== 'assessment' ? `<br><span class="p-muted">${esc(l.detail)}</span>` : ''}</td><td class="nw">${esc(stx)}</td><td class="p-src">${src}</td><td>${esc(next)}</td></tr>`;
        }).join('');
        return `<h4 class="p-h4">${esc(p.name)} — ${esc(LEAF_TXT[lb] || '')} <span class="p-muted">(평가: ${esc(p.evaluator)})</span></h4>
        <table class="p-table t-rule"><colgroup><col class="c-28"><col class="c-24"><col class="c-14"><col class="c-8"><col class="c-26"></colgroup>
        <thead><tr><th scope="col">요건</th><th scope="col">응답·판단 근거</th><th scope="col">판정</th><th scope="col">근거</th><th scope="col">다음 확인</th></tr></thead><tbody>${rows}</tbody></table>`;
      }).join('');
      if (s.pathway_note) inner = `<p class="p-p">${esc(s.pathway_note)}</p>${inner}`;
    } else if (x.result) {
      inner = `<p class="p-p">자동 판정 중지: ${esc(x.result.gate.reason)}</p>`;
    } else if (x.triage) {
      inner = `<p class="p-p"><b>${esc(x.triage.label)}</b> — ${esc(x.triage.caution)}</p><ul class="p-ul">${x.triage.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>${x.triage.missing.length ? `<p class="p-p">먼저 정리할 정보: ${esc(x.triage.missing.map((m) => m.text).join(', '))}</p>` : ''}`;
    } else {
      inner = `<p class="p-p">${esc(s.scope_note)} 자동 판정 대상이 아닌 정보형 제도입니다. 먼저 확인할 것: ${esc(s.first_check)}</p>`;
    }
    return `<div class="p-scheme"><h3 class="p-h3">${esc(s.name_ko)} — ${esc(STATUS_TXT[x.label.key])}</h3>${inner}</div>`;
  }).join('');
  return `<section class="p-sec"><h2 class="p-h2"><span class="p-num">03</span> 개별 인증별 규칙 판정표</h2>
  <p class="p-p">요건 → 응답 → 판정 → 근거 → 다음 확인 순서입니다. 근거 [번호]는 부록(06) ‘참조 규정·공식 근거’의 번호입니다. ‘확인 필요’는 정보 부족 또는 공식 원문 미검증 상태이며, 불합격(미충족)으로 처리하지 않았습니다.</p>${blocks}</section>`;
}

function evidence(data, R) {
  const blocks = R.schemes.map((x) => {
    const s = x.scheme; const rows = docRows(x); const tl = tilesFor(x);
    const guides = (s.guides || []).map((g) => `<p class="p-p">공식 안내: ${esc(g.title)} <span class="p-url">${esc(readableUrl(g.url))}</span></p>`).join('');
    const fees = s.fees && !s.fees.unverified ? s.fees.items.map((i) => `${esc(i.label)} ${won(i.company !== undefined ? i.company : i.total)}${i.company !== undefined ? `(합계 ${won(i.total)} 중 기업 부담)` : ''}`).join(' · ') : '기관 확인(공식 원문 미확보)';
    const proc = s.processing && !s.processing.unverified ? s.processing.items.map((i) => `${esc(i.label)} ${i.days ? `${i.days}일 이내` : `${i.weeks}주 이내`}`).join(' · ') : '기관 확인(공식 원문 미확보)';
    const table = rows.length ? `<table class="p-table"><colgroup><col class="c-30"><col class="c-26"><col class="c-44"></colgroup>
      <thead><tr><th scope="col">서류</th><th scope="col">왜 필요한가</th><th scope="col">발급·내려받기 (공식 주소)</th></tr></thead><tbody>
      ${rows.map((d) => `<tr><td>${esc(d.label)}${d.required ? '' : '<br><span class="p-muted">해당할 때만</span>'}</td><td>${esc(d.why)}</td><td>${esc(d.where || '-')}${d.link ? `<br><span class="p-url">${esc(readableUrl(d.link))}${d.link_unverified ? ' ※접속 미검증' : ''}</span>` : ''}</td></tr>`).join('')}</tbody></table>` : `<p class="p-p">공식 서류 목록을 정리하지 못했습니다. 신청처 안내를 확인하세요.</p>`;
    return `<div class="p-scheme"><div class="p-certbar"><b>${esc(s.name_ko)}${rows.length ? ` · 신청서류 ${rows.length}개` : ''}</b><span>신청: ${esc(tl.apply.name)} <span class="p-url">${esc(readableUrl(tl.apply.url || ''))}</span></span></div>
      ${guides}${table}<p class="p-p"><b>공식 수수료(VAT 포함)</b>: ${fees}<br><b>처리기간</b>: ${proc}${x.ongoing ? `<br><b>유효기간·사후관리</b>: ${esc(x.ongoing)}` : ''}</p></div>`;
  }).join('');
  return `<section class="p-sec"><h2 class="p-h2"><span class="p-num">04</span> 신청서류와 공식 링크 · 수수료 · 처리기간</h2>
  <p class="p-p">인증별로 제출할 서류와 발급처, 공식 서식 내려받기 주소를 정리했습니다. 서식은 바뀔 수 있으니 반드시 공식 주소에서 최신본을 받으세요. 서식 파일은 저작권·최신성 때문에 보고서에 넣지 않습니다.</p>${blocks}</section>`;
}

function plan(data, R) {
  const rows = R.actions.map((a) => `<tr><td class="nw">${esc(TIMEFRAME[a.timeframe])}</td><td>${esc(a.order)}. ${esc(CATEGORY[a.category])}<br><span class="p-muted">${esc(a.scheme_name)}</span></td><td><b>${esc(a.title)}</b>${a.detail ? `<br><span class="p-muted">${esc(a.detail)}</span>` : ''}</td><td>${esc(a.owner)}</td><td>${esc(a.deliverable)}</td><td>${esc(a.done_when)}</td></tr>`).join('');
  return `<section class="p-sec"><h2 class="p-h2"><span class="p-num">05</span> 실행계획 (먼저 → 서류 준비 → 평가 준비 → 신청 → 사후관리)</h2>
  <p class="p-p">우선순위 기준: 신청상 장애 요인 제거 → 신청서류 → 평가·신청 준비 → 선택적 강화 → 사후관리. 준비 순서만 보여 주며 날짜·기간을 정하지 않습니다(기관 처리기간은 04 참조). 담당은 예시입니다.</p>
  ${R.actions.length ? `<table class="p-table t-plan"><colgroup><col class="c-9"><col class="c-17"><col class="c-34"><col class="c-12"><col class="c-12"><col class="c-16"></colgroup>
  <thead><tr><th scope="col">순서</th><th scope="col">순위·구분</th><th scope="col">할 일</th><th scope="col">담당(예시)</th><th scope="col">산출물</th><th scope="col">완료 판단</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="p-p">지금 할 일이 없습니다.</p>'}</section>`;
}

function connectPrint(R) {
  const c = R.connect || { next: [], strategy: [], commonDocs: [] };
  if (!c.next.length && !c.strategy.length && !c.commonDocs.length) return '';
  return `<section class="p-sec"><h3 class="p-h3">여러 인증 함께 준비 · 다음 진단</h3>
  ${c.strategy.map((x) => `<p class="p-p">${esc(x.text)}</p>`).join('')}
  ${c.commonDocs.length ? `<p class="p-p"><b>공통 서류 ${c.commonDocs.length}종</b>: ${c.commonDocs.map((d) => `${esc(d.name)}(${esc(d.schemes.join('·'))})`).join(', ')} — 한 번 발급해 함께 사용(발급일 제한 서류는 신청 직전 발급).</p>` : ''}
  ${c.next.length ? `<table class="p-table"><colgroup><col class="c-22"><col class="c-46"><col class="c-32"></colgroup>
  <thead><tr><th scope="col">다음 진단(BECONIC 31)</th><th scope="col">추천 이유</th><th scope="col">주소</th></tr></thead><tbody>
  ${c.next.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.why)}</td><td class="p-url">${esc(x.url)}</td></tr>`).join('')}</tbody></table>` : ''}
  <p class="p-note">상담: ${esc(SITE.tel)} · ${esc(SITE.mail)} (문서번호 ${esc(R.meta.doc_id)}를 알려 주시면 이 결과로 바로 상담해요)</p></section>`;
}

function appendix(data, R) {
  const SI = sourceIndex(R);
  const srcRows = Object.keys(SI).map((r) => data.sourceMap[r]).filter(Boolean).map((s) => `<tr><td><span class="p-sid">[${SI[s.source_id]}]</span> ${esc(s.title)}</td><td>${esc(s.regulator)}</td><td>${esc(s.document_identifier || '-')}</td><td class="nw">${esc(s.checked_at)}</td><td>${esc(ACCESS_LABEL[s.access_status])}</td><td class="p-url">${esc(readableUrl(s.official_url))}</td></tr>`).join('');
  const packs = R.schemes.filter((x) => x.result).map((x) => `${esc(x.scheme.name_ko)}: ${esc(x.result.meta.rule_pack_id)} v${esc(x.result.meta.rule_version)} (근거 확인 ${esc(x.result.meta.last_verified_at)})`).join(' · ');
  const ans = R._answers || {};
  const asked = new Set();
  R.schemes.forEach((x) => { if (x.result) x.result.pathways.forEach((p) => p.leaves.forEach((l) => (l.inputs || []).forEach((q) => asked.add(q)))); });
  const notEntered = [...asked].filter((q) => data.questionMap[q] && (ans[q] === undefined || ans[q] === '' || ans[q] === 'unknown')).map((q) => data.questionMap[q].label_plain_ko);
  return `<section class="p-sec"><h2 class="p-h2"><span class="p-num">06</span> 한계·법적 고지 및 부록</h2>
  <h3 class="p-h3">결과 활용의 한계</h3>
  <ul class="p-ul">
    <li>본 결과는 사용자가 입력한 정보에 기초한 사전 검토입니다. 인증·허가·신고 결과는 관계 법령과 관할기관의 심사에 따릅니다.</li>
    <li>자동 판정은 공식 원문과 대조한 요건에만 적용했습니다. 원문을 확인하지 못한 요건은 ‘확인 필요’로 표시했습니다. 법률 전문가 검토는 거치지 않았으며 운영사 대표 검토 대상입니다.</li>
    <li>해외 제품 규제(CE·FDA·FCC 등)는 의무 여부·절차를 판정하지 않았습니다.</li>
    <li>이 서비스는 정부·인증기관의 공식 시스템이 아닙니다. 운영사: 그로스벤처스 주식회사(중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호).</li>
  </ul>
  <h3 class="p-h3">적용 알고리즘·가정</h3>
  <p class="p-p">판정엔진 v${esc(R.meta.engine_version)} (4값 논리: 충족·미충족·확인 필요·해당 없음 / 단일 경로 AND, 대체 경로 OR, 선행조건 미확인 시 확인 필요). 규칙: ${packs || '없음'}. 진단 기준일: ${esc(R.meta.as_of)}. ‘모름’ 응답은 미충족으로 바꾸지 않았습니다.</p>
  <h3 class="p-h3">입력되지 않은 값 (${notEntered.length}개)</h3>
  <p class="p-p">${notEntered.length ? esc(notEntered.join(' · ')) : '없음'}</p>
  <h3 class="p-h3">참조 규정·공식 근거</h3>
  <table class="p-table t-src"><colgroup><col class="c-22"><col class="c-14"><col class="c-16"><col class="c-10"><col class="c-12"><col class="c-26"></colgroup>
  <thead><tr><th scope="col">출처</th><th scope="col">기관</th><th scope="col">문서·조항</th><th scope="col">확인일</th><th scope="col">접속 상태</th><th scope="col">URL</th></tr></thead><tbody>${srcRows}</tbody></table>
</section>`;
}

export function renderPrint(data, R, opt = {}) {
  return `<div class="p-doc">
  ${cover(data, R, opt)}${execSummary(data, R)}${comparison(data, R)}${ruleTables(data, R)}${evidence(data, R)}${plan(data, R)}${connectPrint(R)}${appendix(data, R)}
  </div>`;
}
