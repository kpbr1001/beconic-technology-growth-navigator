// 결과 보고서(HTML → 브라우저 인쇄 PDF) — 약 10쪽. 대표가 읽고 투자자 미팅을 준비하는 순서로 구성한다.
// 1 한눈에 보는 결과 · 2 핵심 진단 · 3 투자자 관점 · 4 영역별 점수 · 5~6 영역별 상세 · 7 재무 · 8 투자자가 물어볼 질문 · 9 로드맵·준비 서류 · 10 부록
import { CATEGORIES, QUESTIONS, STAGES, WEIGHTS, GRADES, CMAP, MODEL_VERSION, SOURCES, N_Q, EFFORT, INDUSTRY_ADJ, ASKS, LENS_VERDICT,
  bandColor, SCALE_MAX, UNKNOWN_AS, SCORE_FACTOR, STRONG_MIN, WEAK_MAX, GOAL_FLOOR, TOP_N, ROADMAP_BUCKETS, qByCat, FIN_YEARS_GOOD } from './model.js';
import { SCORE_VERSION } from './score.js';
import { ACCOUNTS, SLOTS, slotLabel, fmtWon, finBandSummary } from './fin.js';
import { gauge, radar, trend, lineChart } from './charts.js';
import { COMPANY } from './contact.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rdots = (v) => `<span class="r-dots">${Array.from({ length: SCALE_MAX }, (_, i) => `<i class="${i < (v || 0) ? 'on' : ''}"></i>`).join('')}</span>`;
const ROOM = { ready: ['ok', '준비됨'], partial: ['mid', '보완 필요'], todo: ['warn', '준비 전'] };
const pctTxt = (v) => (v === null || v === undefined ? '—' : `${v}%`);

/** 입력 내용의 결정론적 지문(FNV-1a) — 보고서 ID용. 원본 일치 확인용이며 진실성 인증이 아님 */
export function reportId(st) {
  const f = st.fin;
  const s = JSON.stringify({ m: [st.meta.company, st.meta.stage], a: QUESTIONS.map((q) => [st.answers[q.id]?.v ?? null, !!st.answers[q.id]?.ev]), f: f ? [f.y0 || '', f.cur, f.prev, f.pp || {}] : null });
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replaceAll('-', '');
  return `IR-${d}-${h.toString(16).toUpperCase().padStart(8, '0').slice(0, 6)}`;
}

export function renderReport(st, r, { id, date, version }) {
  const stage = STAGES.find((s) => s.id === r.stage)?.label || '';
  const met = CATEGORIES.filter((c) => r.cats[c.id].gap !== null && r.cats[c.id].gap >= 0).length;
  const ready = r.dataRoom.filter((d) => d.state === 'ready').length;
  const pg = (n, title, lead) => `<div class="r-pg${n === 1 ? '' : ' r-break'}"><div class="r-pgh"><span>${String(n).padStart(2, '0')}</span><h2>${title}</h2></div>${lead ? `<p class="r-lead">${lead}</p>` : ''}`;
  const end = '</div>';
  const TOC = ['한눈에 보는 결과', '핵심 진단', '투자자 관점 진단', '영역별 점수', '영역별 상세 진단', '재무 진단', '투자자가 물어볼 질문', '보완 로드맵·준비 서류', '부록: 문항별 응답·진단 방법'];
  const half = Math.ceil(CATEGORIES.length / 2);
  const catBlock = (a) => `<div class="r-cat"><div class="r-cath"><b>${esc(a.c.name)}</b><span class="r-num">${a.score ?? '—'}점 <small>/ 기대 ${a.expect}</small></span><em class="${a.gap !== null && a.gap < 0 ? 'r-gap' : 'r-ok'}">${esc(a.status)}</em></div>
    <p class="r-note"><b>투자자가 보는 포인트</b> ${esc(a.c.view)}</p>
    <p class="r-qs">${qByCat(a.c.id).map((q) => { const v = st.answers[q.id]?.v; return `<span>${esc(q.title)} ${v === 0 ? '<em>모르겠어요</em>' : typeof v === 'number' ? rdots(v) : '<em>미응답</em>'}${st.answers[q.id]?.ev ? ' <small>근거</small>' : ''}</span>`; }).join('')}</p>
    ${a.diag ? `<p><b>지금 상태</b> ${esc(a.diag)}</p>` : ''}
    ${a.actions.length ? `<p><b>보완 목표</b></p><ul class="r-chk">${a.actions.slice(0, TOP_N).map((x) => `<li>${esc(x.q.title)}: ${esc(x.action)} <span class="r-note">(${EFFORT[x.effort]} · ${esc(x.doc)})</span></li>`).join('')}</ul>` : ''}
    <p class="r-q"><b>물어볼 질문</b> ${(ASKS[a.c.id] || []).map(esc).join(' / ')}</p></div>`;
  const rows = r.years.slice().reverse(); // 오래된 해 → 최근 해
  const roadCol = (b) => `<div><h3>${b.label} <span class="r-note">${b.sub}</span></h3>${r.roadmap[b.key].length ? `<ol>${r.roadmap[b.key].map((x) => `<li>${x.q ? `<b>${esc(x.q.title)}</b> — ${esc(x.action)} <span class="r-note">(만들 자료: ${esc(x.doc)} · +${x.gainTo}점)</span>` : `${esc(x.action)} <span class="r-note">(만들 자료: ${esc(x.doc)})</span>`}</li>`).join('')}</ol>` : '<p class="r-note">없음</p>'}</div>`;
  const finFull = () => { const f = st.fin; const slots = SLOTS.map((s, i) => ({ s, i })).filter(({ s }) => Object.values(f[s.k] || {}).some((v) => typeof v === 'number')).reverse();
    return `<table class="r-tbl"><thead><tr><th>계정</th>${slots.map(({ i }) => `<th class="r-r">${esc(slotLabel(f, i))}</th>`).join('')}</tr></thead><tbody>
    ${ACCOUNTS.filter((a) => slots.some(({ s }) => typeof f[s.k]?.[a.k] === 'number')).map((a) => `<tr><td>${esc(a.label)}</td>${slots.map(({ s }) => `<td class="r-r r-num">${typeof f[s.k]?.[a.k] === 'number' ? fmtWon(f[s.k][a.k]) : '—'}</td>`).join('')}</tr>`).join('')}
    ${[['매출 성장률', 'growth'], ['영업이익률', 'opm'], ['순이익률', 'npm'], ['부채비율', 'debt'], ['유동비율', 'current']].map(([l, k]) => `<tr class="r-pri"><td>${l}</td>${rows.map((x) => `<td class="r-r r-num">${pctTxt(x[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`; };

  return `<article class="r-doc">
  ${st.meta.synthetic ? '<div class="r-water">합성 예시 — 실제 기업 자료 아님</div>' : ''}
  <div class="r-head"><img src="/assets/shield.png" alt="" class="r-logo"><div class="r-head-t"><div class="r-brand">BECONIC IR 진단 <span>by Growth Ventures</span></div><h1>IR 진단 결과 보고서</h1></div>
    <div class="r-head-m"><b>${esc(st.meta.company)}</b><span>${esc(stage)} · ${esc(st.meta.industry || '업종 미선택')}</span><span>${esc(date)} · ${esc(id)}</span></div></div>

  ${pg(1, '한눈에 보는 결과', `${esc(st.meta.company)}의 IR 준비 상태를 투자자 관점에서 진단한 결과예요. 점수보다 <b>무엇을 먼저 준비할지</b>에 집중해 읽어 주세요.`)}
  <div class="r-top"><div>${gauge(r.overall, r.grade, { size: 240 })}</div>
    <div><ul class="r-sum">${r.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
  <div class="r-tiles">
    <div><span>종합 IR 준비도</span><b>${r.overall ?? '—'}점</b><small>${r.grade ? `${esc(r.grade.g)}등급 · ${esc(r.grade.label)}` : ''}</small></div>
    <div><span>단계 기대 충족 영역</span><b>${met}/${CATEGORIES.length}</b><small>${esc(stage)} 단계 기준</small></div>
    <div><span>재무제표</span><b>${r.fin.has ? `${r.fin.years}개년` : '미반영'}</b><small>${r.fin.has ? '표준재무제표 반영' : '응답만으로 판단'}</small></div>
    <div><span>투자 준비 서류</span><b>${ready}/${r.dataRoom.length}</b><small>준비됨으로 판단</small></div></div>
  <div class="r-bdg"><span class="${r.complete ? 'ok' : 'warn'}">응답 ${r.answered}/${N_Q}</span><span>근거 자료 ${r.evidenceRate}%</span>${r.unknown.length ? `<span class="warn">모르겠어요 ${r.unknown.length}</span>` : ''}${r.flags.length ? `<span class="warn">경계 신호 ${r.flags.length}</span>` : ''}</div>
  <div class="r-grid"><div><h3>이 보고서 읽는 법</h3><ol class="r-chk"><li>핵심 진단에서 강점과 먼저 보완할 점을 확인해요.</li><li>투자자 관점·영역별 진단에서 투자자가 어떤 눈으로 보는지, 무엇이 부족한지 봐요.</li><li>재무·물어볼 질문·로드맵으로 미팅 전 할 일을 정해요.</li></ol></div>
    <div><h3>목차</h3><ol class="r-toc">${TOC.map((t) => `<li>${t}</li>`).join('')}</ol></div></div>
  ${end}

  ${pg(2, '핵심 진단', '투자자에게 먼저 보여 줄 강점과, 점수에 영향이 가장 큰 보완점이에요.')}
  <div class="r-grid"><div><h3>투자자에게 먼저 보여 줄 강점</h3>${r.strengths.length ? r.strengths.map((s) => `<div class="r-it good"><b>${esc(s.q.title)}</b> <span class="r-note">${esc(CMAP[s.q.cat].name)}</span> ${rdots(s.v)}<p>${esc(s.text)}${s.ev ? '' : ' · 근거 자료를 함께 준비하세요'}</p></div>`).join('') : `<p class="r-note">${STRONG_MIN}점 이상 문항 없음 — 아래 보완점부터 정리하세요.</p>`}</div>
    <div><h3>먼저 보완할 ${TOP_N}가지</h3>${r.weaknesses.map((w) => `<div class="r-it need"><b>${esc(w.q.title)}</b> <span class="r-note">${esc(CMAP[w.q.cat].name)}</span> ${rdots(w.v)}<p>지금: ${esc(w.now)}</p><p class="nx"><em>목표</em> ${esc(w.next)} <span class="r-note">(달성 시 +${w.gainTo}점 · 만들 자료: ${esc(w.doc)})</span></p></div>`).join('') || `<p class="r-note">${WEAK_MAX}점 이하 문항 없음</p>`}</div></div>
  <h3>투자자가 멈칫할 수 있는 부분</h3>${r.flags.length ? `<ul class="r-chk r-flag">${r.flags.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>` : '<p class="r-note">응답·재무제표에서 두드러진 경계 신호는 없어요.</p>'}
  ${r.checks.length ? `<h3>응답과 재무제표 확인</h3><ul class="r-chk">${r.checks.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''}
  ${r.gaps.length ? `<h3>${esc(stage)} 단계 기대에 못 미치는 영역</h3><table class="r-tbl"><thead><tr><th>영역</th><th class="r-c">점수</th><th class="r-c">기대</th><th class="r-c">차이</th><th>투자자가 보는 포인트</th></tr></thead><tbody>${r.gaps.map((c) => `<tr><td class="r-nw"><b>${esc(c.name)}</b></td><td class="r-c r-num">${c.score}</td><td class="r-c">${c.expect}</td><td class="r-c r-gap">${c.gap}</td><td>${esc(CMAP[c.id].view)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${end}

  ${pg(3, '투자자 관점 진단', `투자 심사에서 실제로 묻는 ${r.lenses.length}가지 질문으로 응답을 다시 묶었어요. 각 질문에 답할 근거 자료도 함께 적었어요.`)}
  <table class="r-tbl"><thead><tr><th>투자자 질문</th><th>점수</th><th>판단</th><th>가장 약한 부분</th><th>실사 확인 자료</th></tr></thead><tbody>
  ${r.lenses.map((l) => `<tr><td><b>${esc(l.name)}</b><br><span class="r-note">${esc(l.q)}</span></td><td class="r-nw"><span class="r-bar-t r-bar-s"><span class="r-bar" style="width:${l.score ?? 0}%;background:${bandColor(l.score)}"></span></span><b class="r-num">${l.score ?? '—'}</b></td><td>${l.verdict ? esc(l.verdict.text) : '—'}${l.note ? `<br><span class="r-note">${esc(l.note)}</span>` : ''}</td><td>${l.weakest && l.verdict?.tone !== 'good' ? esc(l.weakest.title) : '—'}</td><td>${esc(l.docs)}</td></tr>`).join('')}
  </tbody></table>
  <div class="r-box"><b>읽는 법</b> ${LENS_VERDICT.map((v) => `${v.min ? `${v.min}점 이상` : '그 아래'}: ${esc(v.text)}`).join(' · ')}. 점수가 낮은 질문부터 "실사 확인 자료"를 준비하세요.</div>
  ${end}

  ${pg(4, '영역별 점수', `${CATEGORIES.length}개 영역 점수를 ${esc(stage)} 단계에서 갖추면 좋은 수준(기대)과 비교했어요.`)}
  <div class="r-grid"><div class="r-radar">${radar(CATEGORIES.map((x) => ({ name: x.short, score: r.cats[x.id].score, expect: r.cats[x.id].expect })), { size: 340, font: 10.5 })}</div>
    <table class="r-tbl"><thead><tr><th>영역</th><th>점수</th><th class="r-c">기대</th><th class="r-c">비중</th><th class="r-c">근거</th></tr></thead><tbody>
    ${CATEGORIES.map((x) => { const cc = r.cats[x.id]; return `<tr><td class="r-nw">${esc(x.name)}</td><td class="r-nw"><span class="r-bar-t"><span class="r-bar" style="width:${cc.score ?? 0}%;background:${bandColor(cc.score)}"></span></span><b class="r-num">${cc.score ?? '—'}</b></td><td class="r-c ${cc.gap !== null && cc.gap < 0 ? 'r-gap' : ''}">${cc.expect}</td><td class="r-c">${cc.weight}%</td><td class="r-c">${cc.ev}/${cc.total}</td></tr>`; }).join('')}
    </tbody></table></div>
  <p class="r-note">기대 = ${esc(stage)} 단계에서 갖추면 좋은 수준(비코닉 기준, 빨간색은 미달). 비중 = 이 단계에서 종합 점수에 반영하는 비율${INDUSTRY_ADJ[r.industry] ? `(${esc(r.industry)} 업종 보정)` : ''}. 근거 = "보여 줄 문서·데이터가 있어요"를 체크한 문항 수.</p>
  <h3>영역별 한 줄 진단</h3>
  <table class="r-tbl"><thead><tr><th>영역</th><th class="r-c">점수 / 기대</th><th>강점 문항</th><th>먼저 보완할 문항</th></tr></thead><tbody>
  ${r.analysis.map((a) => { const vq = (q) => { const v = st.answers[q.id]?.v; return typeof v !== 'number' ? null : v === 0 ? UNKNOWN_AS : v; }; const qs = qByCat(a.c.id).filter((q) => vq(q) !== null).sort((x, y) => vq(y) - vq(x)); const best = qs[0]; const worst = qs[qs.length - 1];
    return `<tr><td class="r-nw"><b>${esc(a.c.name)}</b></td><td class="r-c r-num ${a.gap !== null && a.gap < 0 ? 'r-gap' : ''}">${a.score ?? '—'} / ${a.expect}</td><td>${best && vq(best) >= STRONG_MIN ? `${esc(best.title)} ${rdots(st.answers[best.id].v)}` : '—'}</td><td>${worst && vq(worst) <= WEAK_MAX ? `${esc(worst.title)} ${rdots(st.answers[worst.id].v)}` : '—'}</td></tr>`; }).join('')}
  </tbody></table>
  <div class="r-box"><b>요약</b> 기대 수준을 넘은 영역 ${met}개, 못 미친 영역 ${r.gaps.length}개예요.${r.gaps.length ? ` 차이가 가장 큰 영역은 ${r.gaps.slice(0, TOP_N).map((c) => `${esc(c.name)}(${c.gap})`).join(', ')}이에요.` : ''} 비중이 큰 영역일수록 한 단계만 올려도 종합 점수가 많이 올라요.</div>
  ${end}

  ${pg(5, '영역별 상세 진단 ①', '영역마다 투자자가 보는 포인트, 문항별 응답, 보완 목표와 투자자가 물어볼 질문이에요.')}
  ${r.analysis.slice(0, half).map(catBlock).join('')}
  ${end}
  ${pg(6, '영역별 상세 진단 ②', '')}
  ${r.analysis.slice(half).map(catBlock).join('')}
  ${end}

  ${pg(7, '재무 진단', r.fin.has ? `표준재무제표 ${r.fin.years}개년(${st.fin.source === 'upload' ? '파일에서 읽고 대표가 확인한 값' : '대표가 직접 입력한 값'})을 바탕으로 했어요.` : '재무제표가 반영되지 않아 재무·자금 점수는 대표 응답만으로 계산했어요.')}
  ${r.fin.has ? `${r.finStory.length ? `<ul class="r-story">${r.finStory.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <table class="r-tbl"><thead><tr><th>재무 영역</th><th class="r-c">판단</th><th>의미</th><th>근거 지표(최근 연도)</th></tr></thead><tbody>
    ${r.finAreas.map((a) => `<tr><td class="r-nw"><b>${a.name}</b><br><span class="r-note">${esc(a.q)}</span></td><td class="r-c"><span class="r-st ${a.tone === 'good' ? 'ok' : a.tone === 'warn' ? 'warn' : 'mid'}">${a.tone === 'good' ? '양호' : a.tone === 'warn' ? '주의' : a.tone ? '보통' : '자료 없음'}</span></td><td>${esc(a.verdict)}</td><td>${a.items.map((x) => `${esc(x.label)} ${x.value === null ? esc(x.text || '—') : `${x.value}${x.unit}`}`).join(' · ') || '—'}</td></tr>`).join('')}</tbody></table>
    ${rows.length >= FIN_YEARS_GOOD ? `<div class="r-fin3"><div>${trend(rows.map((x) => ({ label: x.label.replace(/.*\((\d{4})년\)/, '$1'), rev: x.rev, op: x.op, net: x.net })), { width: 380, height: 190 })}</div>
      <div>${lineChart(rows.map((x) => x.label.replace(/.*\((\d{4})년\)/, '$1')), [{ name: '영업이익률', color: '#00a37a', vals: rows.map((x) => x.opm) }, { name: '순이익률', color: '#f0a43a', vals: rows.map((x) => x.npm) }], { width: 300, height: 190, label: '이익률 추이' })}</div>
      <div>${lineChart(rows.map((x) => x.label.replace(/.*\((\d{4})년\)/, '$1')), [{ name: '부채비율', color: '#e5484d', vals: rows.map((x) => x.debt) }, { name: '유동비율', color: '#3182f6', vals: rows.map((x) => x.current) }], { width: 300, height: 190, label: '부채비율·유동비율 추이' })}</div></div>` : ''}
    <h3>연도별 계정·비율</h3>${finFull()}
    <p class="r-note">참고 구간(${finBandSummary()})은 일반적으로 쓰이는 기준선이며 업종별 차이가 커요. 과거 실적이며 전망이 아니에요.</p>`
    : `<div class="r-box warn"><b>투자자는 표준재무제표를 가장 먼저 요청해요.</b> 재무제표가 없으면 매출·이익·부채를 대표 설명으로만 판단하게 되고, 숫자 일관성 확인도 할 수 없어요.</div>
    <div class="r-grid"><div><h3>반영하면 더해지는 내용</h3><ul class="r-chk"><li>최근 연도·전년도·전전년도 매출·영업이익·순이익 추이</li><li>매출 성장률·영업이익률·부채비율·유동비율·자본잠식 여부</li><li>"매출이 있다"·"현금 관리가 된다"는 응답과 재무제표의 교차 확인</li><li>투자 준비 서류 체크리스트의 재무 항목 "준비됨"</li></ul></div>
    <div><h3>준비 방법</h3><ol class="r-chk"><li>국세청 홈택스 로그인(법인은 법인 인증서)</li><li>민원증명 → 표준재무제표증명 선택</li><li>귀속 연도를 하나씩(최근 연도·전년도·전전년도) 발급해 PDF로 저장</li><li>IR 진단 재무 단계에서 올리기 — 파일은 기기 안에서만 읽어요</li></ol></div></div>
    <p class="r-note">설립 첫해라 재무제표가 없다면 월별 매출·지출표와 통장 잔액 기준 현금 현황으로 대신 설명할 수 있어요.</p>`}
  ${end}

  ${pg(8, '투자자가 물어볼 질문', '미팅에서 실제로 자주 나오는 질문이에요. 답을 한두 문장과 숫자로 미리 적어 두면 같은 질문에 늘 같은 답을 할 수 있어요.')}
  <table class="r-tbl r-asks"><thead><tr><th>영역</th><th class="r-c">점수</th><th>물어볼 질문</th><th>함께 보완할 문항</th></tr></thead><tbody>
  ${CATEGORIES.map((c) => { const cc = r.cats[c.id]; const pri = r.asks.some((a) => a.c.id === c.id); const weak = qByCat(c.id).filter((q) => { const v = st.answers[q.id]?.v; return typeof v === 'number' && (v === 0 ? UNKNOWN_AS : v) <= WEAK_MAX; }).map((q) => q.title);
    return `<tr${pri ? ' class="r-pri"' : ''}><td class="r-nw"><b>${esc(c.name)}</b>${pri ? '<br><span class="r-tag">먼저 준비</span>' : ''}</td><td class="r-c r-num">${cc.score ?? '—'}</td><td><ol>${(ASKS[c.id] || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></td><td>${weak.length ? weak.map(esc).join(', ') : '—'}</td></tr>`; }).join('')}
  </tbody></table>
  <div class="r-box"><b>답변 준비 원칙</b> ① 결론부터 한 문장 ② 근거 숫자와 출처 ③ 모르는 것은 확인 계획으로. 덱·재무제표·사업계획서의 숫자가 서로 같아야 해요.</div>
  ${end}

  ${pg(9, '보완 로드맵·투자 준비 서류', `종합 점수에 영향이 큰 순서로 고른 뒤 보완 난이도에 맞춰 기간에 배치했어요. 목표는 현재 응답의 다음 단계(${GOAL_FLOOR - 1}단계 이하는 최소 ${GOAL_FLOOR}단계·문서화 수준)예요.`)}
  <div class="r-road">${ROADMAP_BUCKETS.map(roadCol).join('')}</div>
  <h3>투자 준비 서류 체크리스트 <span class="r-note">준비됨 ${ready}/${r.dataRoom.length} · 응답과 근거 체크로 판단</span></h3>
  <table class="r-tbl"><thead><tr><th>서류</th><th class="r-c">상태</th><th>판단 근거</th><th class="r-c">확인</th></tr></thead><tbody>
  ${r.dataRoom.map((d) => `<tr><td><b>${esc(d.name)}</b></td><td class="r-c"><span class="r-st ${ROOM[d.state][0]}">${ROOM[d.state][1]}</span></td><td>${esc(d.note)}</td><td class="r-c"><span class="r-cb"></span></td></tr>`).join('')}
  </tbody></table>
  ${end}

  ${pg(10, '부록: 문항별 응답·진단 방법', '')}
  <table class="r-tbl r-qtbl"><thead><tr><th>영역</th><th>문항</th><th>응답(가장 가까운 문장)</th><th class="r-c">점수</th><th class="r-c">근거</th></tr></thead><tbody>
  ${QUESTIONS.map((q) => { const a = st.answers[q.id] || {}; return `<tr><td class="r-nw">${esc(CMAP[q.cat].name)}</td><td><b>${esc(q.title)}</b></td><td>${typeof a.v !== 'number' ? '미응답' : a.v === 0 ? `잘 모르겠어요(${UNKNOWN_AS}점으로 계산)` : esc(q.opts[a.v - 1])}</td><td class="r-c r-nw">${rdots(a.v)}</td><td class="r-c">${a.ev ? '있음' : '—'}</td></tr>`; }).join('')}
  </tbody></table>
  <h3>진단 방법</h3>
  <p class="r-note">점수 = 대표 응답(1~${SCALE_MAX}점, 잘 모르겠어요 = ${UNKNOWN_AS}점) 영역 평균 × ${SCORE_FACTOR}, 종합 = 투자 단계별 영역 비중 가중 평균(기술 집약 업종은 기술역량 비중 보정).</p>
  <table class="r-tbl"><thead><tr><th>투자 단계</th>${CATEGORIES.map((x) => `<th class="r-c">${esc(x.short)}</th>`).join('')}</tr></thead><tbody>
  ${STAGES.map((s) => `<tr${s.id === r.stage ? ' class="r-pri"' : ''}><td class="r-nw">${esc(s.label)}</td>${CATEGORIES.map((x) => `<td class="r-c">${WEIGHTS[s.id][x.id]}%</td>`).join('')}</tr>`).join('')}</tbody></table>
  <p class="r-note"><b>등급</b> ${GRADES.map((g) => `${g.g} ${g.min}점 이상(${esc(g.label)})`).join(' · ')}</p>
  <p class="r-note">영역 구성 참고: ${Object.values(SOURCES).map((s) => `${esc(s.publisher)} 「${esc(s.title)}」`).join(' · ')} (기관이 이 진단을 승인·인증한 것이 아님). 가중치·업종 보정·단계 기대 수준·등급 구간은 비코닉 설계값(실증 검증 전), 문항 ${MODEL_VERSION} · 점수 ${SCORE_VERSION} · 앱 ${esc(version)}.</p>
  <div class="r-foot">이 보고서는 대표 응답과 제출한 재무제표를 바탕으로 한 IR 준비도 자가진단 결과입니다. 투자 권유, 투자 유치 여부·기업가치 판단, 회계감사, 법률 의견이 아닙니다. 보고서 ID ${esc(id)}는 입력 내용의 지문으로 원본 일치 확인용입니다.<br>${COMPANY.name} · 중소벤처기업부 인증 중소기업상담회사 ${COMPANY.cert} · ${COMPANY.tel} · ${COMPANY.email} · ${COMPANY.web}</div>
  ${end}
  </article>`;
}
