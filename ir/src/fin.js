// 재무 — 표준재무제표증명(홈택스) 텍스트에서 주요 계정을 읽고, 3개년(최근 연도·전년도·전전년도) 지표·참고 구간·응답 교차 확인을 만든다.
// 파일은 브라우저 안에서만 읽는다(서버 전송 없음). 추출값은 사용자가 확인·수정한 뒤 반영한다.
// 참고 구간은 일반적으로 쓰이는 참고선이며 업종별 차이가 크다(공식 기준 아님).

// alt = 정규화한 계정명(공백·번호·괄호·기호 제거, finance/와 같은 규칙). lossAlt = 손실 표기(양수도 손실)
export const ACCOUNTS = [
  { k: 'rev', label: '매출액', alt: ['매출액', '수익매출액', '영업수익'] },
  { k: 'cogs', label: '매출원가', alt: ['매출원가'] },
  { k: 'op', label: '영업이익', alt: ['영업이익', '영업이익손실', '영업손익', '영업손실'], lossAlt: ['영업손실'] },
  { k: 'net', label: '당기순이익', alt: ['당기순이익', '당기순이익손실', '당기순손익', '당기순손실'], lossAlt: ['당기순손실'] },
  { k: 'assets', label: '자산총계', alt: ['자산총계'] },
  { k: 'liab', label: '부채총계', alt: ['부채총계'] },
  { k: 'equity', label: '자본총계', alt: ['자본총계'] },
  { k: 'capital', label: '자본금', alt: ['자본금'] },
  { k: 'ca', label: '유동자산', alt: ['유동자산'] },
  { k: 'cl', label: '유동부채', alt: ['유동부채'] },
  { k: 'cash', label: '현금및현금성자산', alt: ['현금및현금성자산', '현금및현금등가물', '현금및예금'] },
];
// 국세청 표준재무제표(일반법인용) 코드 — finance/에서 실제 발급 증명서로 확인한 코드만 사용
export const NTS_CODES = {
  bs: { '001': 'ca', '003': 'cash', '228': 'assets', '229': 'cl', '333': 'liab', '334': 'capital', '382': 'equity' },
  is: { '001': 'rev', '035': 'cogs', '129': 'op', '219': 'net' },
};
export const AMAP = Object.fromEntries(ACCOUNTS.map((a) => [a.k, a]));
export const CORE = ['rev', 'op', 'net', 'assets', 'liab', 'equity'];
// 3개년 칸: cur = 최근 연도, prev = 전년도, pp = 전전년도
export const SLOTS = [{ k: 'cur', label: '최근 연도' }, { k: 'prev', label: '전년도' }, { k: 'pp', label: '전전년도' }];
export const slotLabel = (fin, i) => { const y = fin?.y0 ? Number(fin.y0) - i : null; return y ? `${SLOTS[i].label}(${y}년)` : SLOTS[i].label; };

export function normLabel(v) {
  let t = String(v ?? '').replace(/[\s\u3000\u00a0]/g, '');
  for (let i = 0; i < 3; i++) t = t.replace(/^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+\.?|[IVX]+\.|\(?\d{1,2}[.)]|\(\d{1,2}\)|[가-하]\.|[①-⑳]|[-·•])/, '');
  return t.replace(/[^가-힣A-Za-z]/g, '');
}
const LABEL = new Map(ACCOUNTS.flatMap((a) => a.alt.map((x) => [x, a])));
const SHORT = /^\d{1,3}$/; // 부호·쉼표 없는 1~3자리
function toNum(tok) {
  const neg = /^[(（△▲-]/.test(tok) || /[)）]$/.test(tok);
  const v = Number(tok.replace(/[^\d]/g, ''));
  return neg && v ? -v : v;
}
/** 재무제표인지 판별 — 손익계산서·재무상태표(대차대조표) 표제가 있어야 한다 */
export const isStatement = (text) => /손익계산서|재무상태표|대차대조표/.test(String(text).replace(/\s+/g, ''));
/** 사업연도(당기) 끝 연도 — 기간(…부터 …까지, ~), "…현재"(재무상태표), "…까지"(손익계산서), "~ 2025.12.31"(증명서 1쪽). 발급일은 표시가 없어 제외 */
export function fiscalYear(text) {
  const t = String(text).replace(/\s+/g, '');
  const D = '(20\\d{2})[년.\\-/]0?\\d{1,2}[월.\\-/]0?\\d{1,2}일?';
  const res = [new RegExp(`${D}(?:부터|~|∼|-)${D}`, 'g'), new RegExp(`${D}(?:현재|까지)`, 'g'), new RegExp(`[~∼]${D}`, 'g')];
  const ends = [];
  res.forEach((re, i) => { for (const m of t.matchAll(re)) ends.push(Number(i === 0 ? m[2] : m[1])); });
  const ys = ends.filter((y) => y > 2000 && y < 2100); if (!ys.length) return '';
  const cnt = {}; ys.forEach((y) => { cnt[y] = (cnt[y] || 0) + 1; });
  return String(Object.entries(cnt).sort((x, y) => y[1] - x[1] || y[0] - x[0])[0][0]);
}
/** 한 파일에 여러 사업연도가 들어 있으면(홈택스에서 여러 해를 한 번에 발급) 연도별로 나눠 읽는다 */
export function parseFile(lines) {
  // 표제(손익계산서·재무상태표) 줄마다 구간을 나누고, 구간 머리(표제 아래 몇 줄)의 사업연도로 묶는다
  const segs = [];
  lines.forEach((line, i) => { if (!segs.length || (i > 0 && isStatement(line) && line.replace(/\s+/g, '').length < 40)) segs.push([]); segs[segs.length - 1].push(line); });
  const by = new Map(); let last = '';
  for (const sg of segs) { const y = fiscalYear(sg.slice(0, 8).join(' ')) || last; last = y; const k = y || '?'; by.set(k, [...(by.get(k) || []), ...sg]); }
  const parts = by.size > 1 ? [...by.values()].map((ls) => parseStatements(ls)).filter((p) => p.isFS && Object.keys(p.found).length) : [];
  if (parts.length > 1) return parts.sort((x, y) => Number(y.year || 0) - Number(x.year || 0));
  const whole = parseStatements(lines);
  return whole.isFS ? [whole] : [];
}

const IS_AMT = /^[(（△▲-]?\d{1,3}(?:,\d{3})+[)）]?$|^[(（△▲-]?\d+[)）]?$/;
const tokensOf = (line) => String(line).replace(/([(（△▲-])\s+(?=\d)/g, '$1').replace(/(\d)\s+([)）])/g, '$1$2').split(/\s+/).filter(Boolean);
/** 한 줄 → [{label, code, nums}] — "계정명 [코드] 금액 [금액]"이 한 줄에 여러 번(2단 배치) 나와도 나눠 읽는다 */
export function segmentsOf(line) {
  const toks = tokensOf(line); const segs = []; let lab = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!IS_AMT.test(t)) { lab.push(t); continue; }
    if (!lab.length) continue; // 계정명 앞의 번호·코드
    let j = i; let code = '';
    if ((/^\d{3}$/.test(t) || /^0\d+$/.test(t)) && j + 1 < toks.length && IS_AMT.test(toks[j + 1])) { code = t; j++; } // 코드 뒤에 금액
    else if (/^0\d+$/.test(t)) { lab = []; continue; } // 금액 없는 코드
    const nums = []; while (j < toks.length && IS_AMT.test(toks[j])) nums.push(toks[j++]);
    segs.push({ label: lab.join(''), code, nums }); lab = []; i = j - 1;
  }
  return segs;
}
const stType = (line) => { const c = String(line).replace(/\s+/g, ''); if (c.length > 40) return null; const bs = /재무상태표|대차대조표/.test(c); const is = /손익계산서/.test(c); return bs && !is ? 'bs' : is && !bs ? 'is' : null; };

/** 문서 텍스트 줄 → { isFS, year, cur, prev, found, unit } (cur = 문서의 당기, prev = 문서의 전기) */
export function parseStatements(lines) {
  const text = lines.join('\n');
  const isFS = isStatement(text);
  const unit = /단위\s*[:：]?\s*천\s*원/.test(text) ? 1000 : /단위\s*[:：]?\s*백만\s*원/.test(text) ? 1000000 : 1;
  const cur = {}; const prev = {}; const found = {};
  if (!isFS) return { isFS, year: '', cur, prev, found, unit };
  let type = null;
  for (const line of lines) {
    type = stType(line) || type;
    for (const sg of segmentsOf(line)) {
      const n = normLabel(sg.label);
      const a = LABEL.get(n) || (sg.code && type && AMAP[NTS_CODES[type][sg.code]]) || null; // 계정명 우선, 없으면 국세청 코드
      if (!a || typeof cur[a.k] === 'number') continue; // 처음 나온 값(합계 행) 사용
      let nums = sg.nums;
      if (unit === 1) nums = nums.filter((x) => !SHORT.test(x) || x === '0'); // 원 단위 문서의 1~3자리는 금액 아님
      if (!nums.length) continue;
      const loss = (a.lossAlt || []).includes(n);
      const val = (x) => { const v = toNum(x); return (loss && v > 0 ? -v : v) * unit; };
      cur[a.k] = val(nums[0]); if (nums.length > 1) prev[a.k] = val(nums[1]);
      found[a.k] = sg.label + (sg.code ? `(${sg.code})` : '');
    }
  }
  return { isFS, year: fiscalYear(text), cur, prev, found, unit };
}

const hasData = (o) => o && Object.values(o).some((v) => typeof v === 'number');
/** 파일 하나의 추출 결과를 3개년 초안에 넣는다. 연도를 알면 연도 기준, 모르면 빈 칸부터. 문서의 전기 값은 비어 있는 계정만 채운다 */
export function mergeParsed(draft, parsed) {
  const d = { y0: draft.y0 || '', cur: { ...draft.cur }, prev: { ...draft.prev }, pp: { ...draft.pp } };
  const K = SLOTS.map((s) => s.k);
  let idx;
  if (parsed.year) {
    if (!d.y0) d.y0 = parsed.year;
    let shift = Number(parsed.year) - Number(d.y0);
    if (shift > 0) { // 더 최근 연도 파일: 기존 칸을 뒤로 민다
      for (let i = K.length - 1; i >= 0; i--) d[K[i]] = i - shift >= 0 ? d[K[i - shift]] : {};
      d.y0 = parsed.year; shift = 0;
    }
    idx = shift === 0 ? 0 : -shift;
  } else idx = K.findIndex((k) => !hasData(d[k]));
  if (idx < 0 || idx >= K.length) return { draft: d, slot: -1 };
  d[K[idx]] = { ...d[K[idx]], ...parsed.cur };
  if (idx + 1 < K.length) for (const [k, v] of Object.entries(parsed.prev)) if (typeof d[K[idx + 1]][k] !== 'number') d[K[idx + 1]][k] = v;
  return { draft: d, slot: idx };
}
/** 저장 전 정리: 앞쪽 빈 칸을 당겨 가장 최근 자료가 '최근 연도'가 되게 한다 */
export function normalizeFin(f) {
  const K = SLOTS.map((s) => s.k); const out = { ...f, cur: { ...(f.cur || {}) }, prev: { ...(f.prev || {}) }, pp: { ...(f.pp || {}) } };
  let lead = 0; while (lead < K.length && !hasData(out[K[lead]])) lead++;
  if (lead > 0 && lead < K.length) {
    for (let i = 0; i < K.length; i++) out[K[i]] = i + lead < K.length ? out[K[i + lead]] : {};
    if (out.y0) out.y0 = String(Number(out.y0) - lead);
  }
  return out;
}
export const filledYears = (fin) => SLOTS.filter((s) => hasData(fin?.[s.k])).length;

/** 금액 입력(쉼표·억·만·음수) → 원 단위 정수, 빈 값 null, 오류 NaN */
export function parseWon(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[\s,원]/g, '');
  if (!s) return null;
  let mul = 1;
  const m = s.match(/(조|억|천만|백만|만)$/);
  if (m) { mul = { 조: 1e12, 억: 1e8, 천만: 1e7, 백만: 1e6, 만: 1e4 }[m[1]]; s = s.slice(0, -m[1].length); }
  const neg = /^[-△(]/.test(s); s = s.replace(/^[-△(]|\)$/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const v = Math.round(Number(s) * mul);
  return neg ? -v : v;
}
export function fmtWon(n, compact) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const neg = n < 0; const a = Math.abs(n);
  let s;
  if (compact && a >= 1e8) s = `${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '')}억원`;
  else if (compact && a >= 1e4) s = `${Math.round(a / 1e4).toLocaleString('ko-KR')}만원`;
  else s = `${a.toLocaleString('ko-KR')}원`;
  return (neg ? '-' : '') + s;
}
const pct = (a, b) => Math.round((a / b) * 1000) / 10;

// 참고 구간(일반적으로 쓰이는 기준선, 공식 기준 아님) — 계산·설명 문구·보고서 방법론이 모두 여기서 가져간다
// hi=true: 클수록 좋음(good 이상 양호, mid 이상 보통) / hi=false: 작을수록 좋음(good 이하 양호, mid 이하 보통)
export const FIN_BANDS = {
  growth: { hi: true, good: 0, mid: 0, unit: '%' },
  opm: { hi: true, good: 10, mid: 0, unit: '%' },
  npm: { hi: true, good: 5, mid: 0, unit: '%' },
  debt: { hi: false, good: 100, mid: 200, unit: '%' },
  current: { hi: true, good: 150, mid: 100, unit: '%' },
  burn: { hi: true, good: 12, mid: 6, unit: '개월' },
};
export const bandOf = (k, v) => { const b = FIN_BANDS[k]; return b.hi ? (v >= b.good ? 'good' : v >= b.mid ? 'mid' : 'warn') : (v <= b.good ? 'good' : v <= b.mid ? 'mid' : 'warn'); };
const bandNote = (k) => { const b = FIN_BANDS[k]; return b.hi ? `참고: ${b.good}${b.unit} 이상 양호 · ${b.mid}${b.unit} 미만 주의` : `참고: ${b.good}${b.unit} 이하 양호 · ${b.mid}${b.unit} 초과 주의`; };
export const FIN_LABELS = { growth: '매출 성장률', opm: '영업이익률', npm: '순이익률', debt: '부채비율', current: '유동비율', burn: '현금 보유 개월 수' };
/** 보고서 방법론용: 참고 구간 한 줄 요약 */
export const finBandSummary = () => Object.entries(FIN_BANDS).map(([k, b]) => `${FIN_LABELS[k]} ${b.hi ? `${b.good}${b.unit}↑ 양호/${b.mid}${b.unit} 미만 주의` : `${b.good}${b.unit}↓ 양호/${b.mid}${b.unit} 초과 주의`}`).join(', ');
const has = (o, k) => o && typeof o[k] === 'number' && !Number.isNaN(o[k]);

/** 지표 + 참고 구간(최근 연도 기준, 성장률은 전년도·전전년도와 비교) */
export function indicators(fin) {
  const c = fin?.cur || {}; const p = fin?.prev || {}; const pp = fin?.pp || {}; const out = [];
  if (has(c, 'rev') && has(p, 'rev') && p.rev > 0) {
    const v = pct(c.rev - p.rev, p.rev);
    out.push({ k: 'growth', label: FIN_LABELS.growth, value: v, unit: '%', band: bandOf('growth', v), formula: '(최근 연도 매출 - 전년도 매출) ÷ 전년도 매출', note: '전년도 대비 과거 실적이며 전망이 아니에요' });
  }
  if (has(c, 'rev') && has(pp, 'rev') && pp.rev > 0 && c.rev >= 0) {
    const v = Math.round((Math.sqrt(c.rev / pp.rev) - 1) * 1000) / 10;
    out.push({ k: 'cagr', label: '2년 연평균 매출 성장률', value: v, unit: '%', band: bandOf('growth', v), formula: '(최근 연도 매출 ÷ 전전년도 매출)^(1/2) - 1', note: '전전년도→최근 연도 과거 실적이며 전망이 아니에요' });
  }
  if (has(c, 'rev') && has(c, 'op') && c.rev > 0) { const v = pct(c.op, c.rev); out.push({ k: 'opm', label: FIN_LABELS.opm, value: v, unit: '%', band: bandOf('opm', v), formula: '영업이익 ÷ 매출액', note: bandNote('opm') }); }
  if (has(c, 'rev') && has(c, 'net') && c.rev > 0) { const v = pct(c.net, c.rev); out.push({ k: 'npm', label: FIN_LABELS.npm, value: v, unit: '%', band: bandOf('npm', v), formula: '당기순이익 ÷ 매출액', note: bandNote('npm') }); }
  if (has(c, 'liab') && has(c, 'equity')) {
    if (c.equity > 0) { const v = pct(c.liab, c.equity); out.push({ k: 'debt', label: FIN_LABELS.debt, value: v, unit: '%', band: bandOf('debt', v), formula: '부채총계 ÷ 자본총계', note: bandNote('debt') }); }
    else out.push({ k: 'debt', label: FIN_LABELS.debt, value: null, unit: '', band: 'warn', formula: '부채총계 ÷ 자본총계', note: '자본총계가 0 이하(완전 자본잠식)라 계산하지 않아요' });
  }
  if (has(c, 'ca') && has(c, 'cl') && c.cl > 0) { const v = pct(c.ca, c.cl); out.push({ k: 'current', label: FIN_LABELS.current, value: v, unit: '%', band: bandOf('current', v), formula: '유동자산 ÷ 유동부채', note: bandNote('current') }); }
  if (has(c, 'equity') && has(c, 'capital') && c.capital > 0) {
    const st = c.equity <= 0 ? '완전 자본잠식' : c.equity < c.capital ? '부분 자본잠식' : '자본잠식 없음';
    out.push({ k: 'impair', label: '자본잠식', value: null, text: st, unit: '', band: st === '자본잠식 없음' ? 'good' : 'warn', formula: '자본총계와 자본금 비교', note: '자본총계 < 자본금이면 부분 잠식' });
  }
  // 참고 계산: 현금 ÷ (최근 연도 영업손실 ÷ 12) — 과거 기준 산술이며 앞으로의 지출 전망이 아님
  if (has(c, 'cash') && has(c, 'op') && c.op < 0) {
    const v = Math.round((c.cash / (-c.op / 12)) * 10) / 10;
    out.push({ k: 'burn', label: `${FIN_LABELS.burn}(참고)`, value: v, unit: '개월', band: bandOf('burn', v), formula: '현금및현금성자산 ÷ (영업손실 ÷ 12)', note: `최근 연도 영업손실 기준 참고 계산이에요(${bandNote('burn').replace('참고: ', '')}). 앞으로의 지출 전망이 아니에요` });
  }
  return out;
}

/** 연도별 표(있는 해만): 매출·영업이익·순이익·이익률·부채비율·유동비율 */
export function yearRows(fin) {
  return SLOTS.map((s, i) => ({ s, i, v: fin?.[s.k] || {} })).filter((r) => hasData(r.v)).map(({ s, i, v }) => ({
    key: s.k, label: slotLabel(fin, i), rev: v.rev, op: v.op, net: v.net,
    opm: has(v, 'rev') && has(v, 'op') && v.rev > 0 ? pct(v.op, v.rev) : null,
    npm: has(v, 'rev') && has(v, 'net') && v.rev > 0 ? pct(v.net, v.rev) : null,
    growth: (() => { const o = SLOTS[i + 1] && fin?.[SLOTS[i + 1].k]; return has(v, 'rev') && o && has(o, 'rev') && o.rev > 0 ? pct(v.rev - o.rev, o.rev) : null; })(),
    debt: has(v, 'liab') && has(v, 'equity') && v.equity > 0 ? pct(v.liab, v.equity) : null,
    current: has(v, 'ca') && has(v, 'cl') && v.cl > 0 ? pct(v.ca, v.cl) : null,
    equity: v.equity,
  }));
}

// 재무 4대 영역(재무진단 도구 finance/와 같은 구분) — 지표 묶음과 영역 판단 문장
export const FIN_AREAS = [
  { k: 'growth', name: '성장성', q: '매출이 늘고 있나요?', ind: ['growth', 'cagr'],
    text: { good: '매출이 늘고 있어요. 성장 숫자를 IR 첫 장에 보여 주세요.', mid: '성장 폭이 크지 않아요. 성장 동력을 숫자로 설명할 준비가 필요해요.', warn: '매출이 줄었어요. 감소 이유와 회복 계획을 먼저 정리하세요.' } },
  { k: 'profit', name: '수익성', q: '팔아서 남기고 있나요?', ind: ['opm', 'npm'],
    text: { good: '본업에서 이익을 내고 있어요.', mid: '손익분기점 근처예요. 이익이 커지는 시점을 설명할 수 있어야 해요.', warn: '영업손실 상태예요. 손실이 줄어드는 경로(단위 경제성)를 보여 줘야 해요.' } },
  { k: 'stable', name: '안정성', q: '빚과 자본 구조가 건전한가요?', ind: ['debt', 'impair'],
    text: { good: '부채가 자본에 비해 적고 자본잠식이 없어요.', mid: '부채 부담이 보통 수준이에요. 차입 내역을 정리해 두세요.', warn: '부채가 많거나 자본잠식 상태예요. 투자 검토에서 반드시 설명을 요구받아요.' } },
  { k: 'liquid', name: '유동성', q: '1년 안에 갚을 돈과 현금이 충분한가요?', ind: ['current', 'burn'],
    text: { good: '단기 지급 여력이 충분해요.', mid: '단기 지급 여력이 빠듯해요. 월별 현금 계획을 준비하세요.', warn: '단기 부채보다 현금화 자산이 적거나 현금이 빠르게 줄고 있어요. 투자 시점을 앞당겨야 할 수 있어요.' } },
];
export function finAreas(fin) {
  const ind = indicators(fin);
  return FIN_AREAS.map((a) => {
    const items = ind.filter((x) => a.ind.includes(x.k));
    const tone = !items.length ? null : items.some((x) => x.band === 'warn') ? 'warn' : items.every((x) => x.band === 'good') ? 'good' : 'mid';
    return { ...a, items, tone, verdict: tone ? a.text[tone] : '계산할 자료가 없어요(해당 계정을 입력하면 진단해요).' };
  });
}

/** 사용자 말로 쓴 재무 해석(관찰 사실 + 의미, 원인 단정 없음) */
export function finStory(fin) {
  const rows = yearRows(fin); if (!rows.length) return [];
  const out = []; const rev = rows.filter((r) => typeof r.rev === 'number');
  if (rev.length >= 2) {
    const ups = rev.slice(0, -1).map((r, i) => r.rev - rev[i + 1].rev);
    out.push(ups.every((d) => d > 0) ? `매출이 ${rev.length}개년 연속 늘었어요(${rev.slice().reverse().map((r) => fmtWon(r.rev, true)).join(' → ')}). 투자자에게 가장 먼저 보여 줄 숫자예요.`
      : ups.every((d) => d < 0) ? `매출이 ${rev.length}개년 연속 줄었어요(${rev.slice().reverse().map((r) => fmtWon(r.rev, true)).join(' → ')}). 감소 이유와 회복 계획을 미리 설명할 수 있어야 해요.`
        : `매출이 해마다 오르내렸어요(${rev.slice().reverse().map((r) => fmtWon(r.rev, true)).join(' → ')}). 변동 이유를 정리해 두세요.`);
  } else if (rev.length === 1) out.push(`${rev[0].label} 매출은 ${fmtWon(rev[0].rev, true)}이에요. 전년도 자료를 함께 올리면 성장 추이를 보여 줄 수 있어요.`);
  const op = rows.filter((r) => typeof r.op === 'number');
  if (op.length) {
    const last = op[0];
    if (op.length >= 2 && last.op > 0 && op[1].op <= 0) out.push(`${last.label}에 영업이익이 흑자로 돌아섰어요. 투자자에게 강한 신호예요.`);
    else if (last.op < 0) out.push(`${last.label} 영업손실은 ${fmtWon(-last.op, true)}이에요. 손실 규모가 ${op.length >= 2 ? (Math.abs(last.op) < Math.abs(op[1].op) ? '전년도보다 줄었어요' : '전년도보다 커졌어요') : '투자금 사용 계획과 함께 설명돼야 해요'}.`);
    else out.push(`${last.label} 영업이익은 ${fmtWon(last.op, true)}이에요.`);
  }
  const d = rows[0];
  if (typeof d.equity === 'number' && d.equity <= 0) out.push('최근 연도 자본총계가 0 이하(완전 자본잠식)예요. 투자 검토에서 반드시 설명을 요구받는 부분이에요.');
  else if (d.debt !== null) out.push(`최근 연도 부채비율은 ${d.debt}%로 ${bandOf('debt', d.debt) === 'good' ? '안정적인 편이에요' : bandOf('debt', d.debt) === 'mid' ? '보통 수준이에요' : '높은 편이라 상환 계획을 함께 보여 주는 게 좋아요'}.`);
  return out;
}

/** 재무제표 내부 점검(자산 = 부채 + 자본, 최근 연도) */
export function balanceCheck(fin) {
  const c = fin?.cur || {};
  if ([c.assets, c.liab, c.equity].some((x) => typeof x !== 'number')) return null;
  const diff = c.assets - (c.liab + c.equity);
  return { ok: Math.abs(diff) <= 1, diff };
}
