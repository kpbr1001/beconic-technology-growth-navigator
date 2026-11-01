// 결과 보고서(HTML → 브라우저 인쇄 PDF). 1쪽 핵심 요약·영역 점수, 2쪽 강점·보완·재무·로드맵, 3쪽~ 문항별 응답·방법론.
import { CATEGORIES, QUESTIONS, STAGES, WEIGHTS, GRADES, CMAP, MODEL_VERSION, SOURCES } from './model.js';
import { SCORE_VERSION } from './score.js';
import { ACCOUNTS, fmtWon } from './fin.js';
import { gauge, radar, finBars } from './charts.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rdots = (v) => `<span class="r-dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= (v || 0) ? 'on' : ''}"></i>`).join('')}</span>`;

/** 입력 내용의 결정론적 지문(FNV-1a) — 보고서 ID용. 원본 일치 확인용이며 진실성 인증이 아님 */
export function reportId(st) {
  const s = JSON.stringify({ m: [st.meta.company, st.meta.stage], a: QUESTIONS.map((q) => [st.answers[q.id]?.v ?? null, !!st.answers[q.id]?.ev]), f: st.fin ? [st.fin.cur, st.fin.prev] : null });
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replaceAll('-', '');
  return `IR-${d}-${h.toString(16).toUpperCase().padStart(8, '0').slice(0, 6)}`;
}

export function renderReport(st, r, { id, date, version }) {
  const stage = STAGES.find((s) => s.id === r.stage)?.label || '';
  const c = st.fin?.cur || {}; const p = st.fin?.prev || {};
  const roadCol = (t, list) => `<div><h3>${t}</h3>${list.length ? `<ol>${list.map((x) => `<li>${x.q ? `<b>${esc(x.q.title)}</b> — ${esc(x.action)} <span class="r-note">(+${x.gainTo}점)</span>` : esc(x.action)}</li>`).join('')}</ol>` : '<p class="r-note">없음</p>'}</div>`;
  return `<article class="r-doc">
  ${st.meta.synthetic ? '<div class="r-water">합성 예시 — 실제 기업 자료 아님</div>' : ''}
  <div class="r-head"><img src="/assets/shield.png" alt="" class="r-logo"><div class="r-head-t"><div class="r-brand">BECONIC IR 진단 <span>by Growth Ventures</span></div><h1>IR 진단 결과 보고서</h1></div>
    <div class="r-head-m"><b>${esc(st.meta.company)}</b><span>${esc(stage)} · ${esc(st.meta.industry || '업종 미선택')}</span><span>${esc(date)} · ${esc(id)}</span></div></div>

  <h2>핵심 요약</h2>
  <div class="r-top"><div>${gauge(r.overall, r.grade, { size: 240 })}</div>
    <div><ul class="r-sum">${r.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="r-bdg"><span class="${r.complete ? 'ok' : 'warn'}">응답 ${r.answered}/32</span><span>근거 자료 ${r.evidenceRate}%</span><span class="${r.fin.has ? 'ok' : 'warn'}">${r.fin.has ? '재무제표 반영' : '재무제표 미반영'}</span>${r.unknown.length ? `<span class="warn">모르겠어요 ${r.unknown.length}</span>` : ''}</div></div></div>

  <h2>영역별 점수</h2>
  <div class="r-grid"><div class="r-radar">${radar(CATEGORIES.map((x) => ({ name: x.short, score: r.cats[x.id].score })), { size: 300 })}</div>
    <table class="r-tbl"><thead><tr><th>영역</th><th>점수</th><th class="r-c">비중</th><th class="r-c">근거</th></tr></thead><tbody>
    ${CATEGORIES.map((x) => { const cc = r.cats[x.id]; return `<tr><td class="r-nw">${esc(x.name)}</td><td class="r-nw"><span class="r-bar-t"><span class="r-bar" style="width:${cc.score ?? 0}%;background:${(cc.score ?? 0) >= 60 ? '#3182f6' : '#f0a43a'}"></span></span><b class="r-num">${cc.score ?? '—'}</b></td><td class="r-c">${cc.weight}%</td><td class="r-c">${cc.ev}/${cc.total}</td></tr>`; }).join('')}
    </tbody></table></div>
  <p class="r-note">점수 = 대표 응답(1~5점, 잘 모르겠어요 = 1점) 평균 × 20, 종합 = ${esc(stage)} 단계 영역 비중 가중 평균. 자가진단 결과이며 투자 유치 여부나 기업가치를 판단·보장하지 않습니다.</p>

  <h2>강점과 먼저 보완할 점</h2>
  <div class="r-grid"><div><h3>강점</h3>${r.strengths.length ? r.strengths.map((s) => `<div class="r-it good"><b>${esc(s.q.title)}</b> <span class="r-note">${esc(CMAP[s.q.cat].name)}</span> ${rdots(s.v)}<p>${esc(s.text)}${s.ev ? '' : ' · 근거 자료 확인 필요'}</p></div>`).join('') : '<p class="r-note">4점 이상 문항 없음</p>'}</div>
    <div><h3>먼저 보완할 3가지</h3>${r.weaknesses.map((w) => `<div class="r-it need"><b>${esc(w.q.title)}</b> <span class="r-note">${esc(CMAP[w.q.cat].name)}</span> ${rdots(w.v)}<p>지금: ${esc(w.now)}</p><p class="nx"><em>목표</em> ${esc(w.next)} <span class="r-note">(달성 시 +${w.gainTo}점)</span></p></div>`).join('') || '<p class="r-note">3점 이하 문항 없음</p>'}</div></div>
  ${r.checks.length ? `<h3>응답과 재무제표 확인</h3><ul class="r-chk">${r.checks.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''}

  <h2>재무</h2>
  ${r.fin.has ? `<div class="r-grid"><div><div class="r-kpis">${r.indicators.map((x) => `<div class="r-kpi ${x.band || ''}"><span>${esc(x.label)}</span><b>${x.value === null ? esc(x.text || '계산 불가') : `${x.value}${x.unit}`}</b><small>${esc(x.note)}</small></div>`).join('')}</div>
    <p class="r-note">${st.fin.source === 'upload' ? `표준재무제표(${esc(st.fin.fileName)})에서 읽고 대표가 확인한 값` : '대표가 직접 입력한 값'}. 참고 구간은 일반 기준선이며 업종별 차이가 큽니다.</p></div>
    <div class="r-fin">${finBars([{ label: '매출액', prev: p.rev, cur: c.rev }, { label: '영업이익', prev: p.op, cur: c.op }, { label: '당기순이익', prev: p.net, cur: c.net }], { width: 420, height: 190 })}</div></div>
    <table class="r-tbl"><thead><tr><th>계정</th><th class="r-r">당기</th><th class="r-r">전기</th><th>계정</th><th class="r-r">당기</th><th class="r-r">전기</th></tr></thead><tbody>
    ${(() => { const rows = ACCOUNTS.filter((a) => typeof c[a.k] === 'number' || typeof p[a.k] === 'number'); const half = Math.ceil(rows.length / 2); const cell = (a) => (a ? `<td>${esc(a.label)}</td><td class="r-r r-num">${typeof c[a.k] === 'number' ? fmtWon(c[a.k]) : '—'}</td><td class="r-r r-num">${typeof p[a.k] === 'number' ? fmtWon(p[a.k]) : '—'}</td>` : '<td></td><td></td><td></td>');
      return Array.from({ length: half }, (_, i) => `<tr>${cell(rows[i])}${cell(rows[i + half])}</tr>`).join(''); })()}</tbody></table>`
    : '<p><b>재무제표 미반영</b> — 재무·자금 점수는 대표 응답만으로 계산했습니다. 투자자는 표준재무제표를 가장 먼저 요청합니다. 홈택스에서 표준재무제표증명을 발급해 반영하면 매출 성장률·영업이익률·부채비율·유동비율과 응답 교차 확인이 추가됩니다.</p>'}

  <h2>실행 로드맵</h2>
  <div class="r-road">${roadCol('지금 ~ 2주', r.roadmap.now)}${roadCol('30일 안에', r.roadmap.d30)}${roadCol('90일 안에', r.roadmap.d90)}</div>
  <p class="r-note">종합 점수에 영향이 큰 순서(남은 단계 × 단계당 상승폭)이며, 각 항목은 현재 응답의 다음 목표 단계(2단계 이하는 최소 3단계·문서화 수준)입니다.</p>

  <h2>진단 방법</h2>
  <table class="r-tbl"><thead><tr><th>투자 단계</th>${CATEGORIES.map((x) => `<th class="r-c">${esc(x.name)}</th>`).join('')}</tr></thead><tbody>
  ${STAGES.map((s) => `<tr${s.id === r.stage ? ' style="background:#eef5ff;font-weight:700"' : ''}><td class="r-nw">${esc(s.label)}</td>${CATEGORIES.map((x) => `<td class="r-c">${WEIGHTS[s.id][x.id]}%</td>`).join('')}</tr>`).join('')}</tbody></table>
  <table class="r-tbl"><thead><tr><th>등급</th>${GRADES.map((g) => `<th class="r-c">${g.g}</th>`).join('')}</tr></thead><tbody><tr><td>기준</td>${GRADES.map((g) => `<td class="r-c">${g.min}점 이상<br><span class="r-note">${esc(g.label)}</span></td>`).join('')}</tr></tbody></table>
  <p class="r-note">영역 구성 참고: ${Object.values(SOURCES).map((s) => `${esc(s.publisher)} 「${esc(s.title)}」`).join(' · ')} (기관이 이 진단을 승인·인증한 것이 아님). 가중치·등급 구간은 비코닉 설계값(실증 검증 전), 문항 ${MODEL_VERSION} · 점수 ${SCORE_VERSION} · 앱 ${esc(version)}. 재무 참고 구간(부채비율 100%/200%, 유동비율 100%/150%, 영업이익률 0%/10%)은 일반적으로 쓰이는 기준선이며 공식 기준이 아닙니다.</p>

  <h2 class="r-break">문항별 응답</h2>
  <table class="r-tbl r-qtbl"><thead><tr><th>영역</th><th>문항</th><th>응답(가장 가까운 문장)</th><th class="r-c">점수</th><th class="r-c">근거</th></tr></thead><tbody>
  ${QUESTIONS.map((q) => { const a = st.answers[q.id] || {}; return `<tr><td class="r-nw">${esc(CMAP[q.cat].name)}</td><td><b>${esc(q.title)}</b></td><td>${typeof a.v !== 'number' ? '미응답' : a.v === 0 ? '잘 모르겠어요(1점으로 계산)' : esc(q.opts[a.v - 1])}</td><td class="r-c r-nw">${rdots(a.v)}</td><td class="r-c">${a.ev ? '있음' : '—'}</td></tr>`; }).join('')}
  </tbody></table>

  <div class="r-foot">이 보고서는 대표 응답과 제출한 재무제표를 바탕으로 한 IR 준비도 자가진단 결과입니다. 투자 권유, 투자 유치 여부·기업가치 판단, 회계감사, 법률 의견이 아닙니다. 보고서 ID ${esc(id)}는 입력 내용의 지문으로 원본 일치 확인용입니다.<br>그로스벤처스 주식회사 · 중소벤처기업부 인증 중소기업상담회사 제2025-684호 · 02-6124-5960 · start@gven.kr · www.beconic.kr</div>
  </article>`;
}
