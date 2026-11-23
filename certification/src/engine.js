// 기본요건 판정 엔진 — 4값 논리(PASS/FAIL/UNKNOWN/NOT_APPLICABLE), AND/OR/WHEN 트리.
// 순수 함수만 둔다(DOM·네트워크·저장소 접근 없음). 브라우저와 Node 테스트가 같은 코드를 쓴다.
import { isMissing, band, bandGte } from './conditions.js';

export const ENGINE_VERSION = '2.1.0'; // 2.1: 구간 답 판정
export const S = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', NA: 'NOT_APPLICABLE' });

// ── 4값 결합 ───────────────────────────────────────────────
// AND: 적용 요건 중 FAIL이 하나라도 → FAIL / 그 외 UNKNOWN 있으면 UNKNOWN / 모두 PASS → PASS / 전부 N/A → N/A
export function combineAnd(list) {
  const app = list.filter((s) => s !== S.NA);
  if (app.length === 0) return S.NA;
  if (app.includes(S.FAIL)) return S.FAIL;
  if (app.includes(S.UNKNOWN)) return S.UNKNOWN;
  return S.PASS;
}
// OR(대체 경로): PASS 하나라도 → PASS / PASS 없고 UNKNOWN → UNKNOWN / 적용 경로 전부 FAIL일 때만 FAIL / 전부 N/A → N/A
export function combineOr(list) {
  const app = list.filter((s) => s !== S.NA);
  if (app.length === 0) return S.NA;
  if (app.includes(S.PASS)) return S.PASS;
  if (app.includes(S.UNKNOWN)) return S.UNKNOWN;
  return S.FAIL;
}

// ── 날짜 ───────────────────────────────────────────────────
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(DATE_RE);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // 없는 날짜(2월 30일 등)
  return { y, mo, d };
}
// 만 나이 계산과 같은 방식: 기준일에 '그 해의 같은 월일'이 지났는지로 경과 연수를 센다.
export function fullYearsBetween(from, to) {
  const a = parseDate(from); const b = parseDate(to);
  if (!a || !b) return null;
  let y = b.y - a.y;
  if (b.mo < a.mo || (b.mo === a.mo && b.d < a.d)) y -= 1;
  return y;
}
export function isAfter(a, b) { return a > b; } // YYYY-MM-DD 문자열은 사전순 = 날짜순

// ── 원자 판정 함수(화이트리스트) ───────────────────────────
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : String(n));
const tri = (v) => (v === 'yes' ? true : v === 'no' ? false : null); // null = 모름

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
// 구간 답 표시: 숫자 답과 구분해 '선택'으로 보여 준다
function bandText(b, unit = '') {
  if (b.exact) return `${fmt(b.lo)}${unit}`;
  if (unit === '명') return b.hi === Infinity ? `${fmt(b.lo)}명 이상` : b.hi - b.lo === 1 ? `${fmt(b.lo)}명` : `${fmt(b.lo)}~${fmt(b.hi - 1)}명`;
  if (b.hi === Infinity) return `${fmt(b.lo)}${unit} 이상`;
  if (b.lo === 0 || (unit === '만원' && b.lo === 1)) return `${fmt(b.hi)}${unit} 미만`;
  return `${fmt(b.lo)}${unit} 이상 ${fmt(b.hi)}${unit} 미만`;
}
const STRADDLE = ' — 고른 구간이 기준에 걸쳐 있어 정확한 값 확인이 필요해요';
function bandStatus(g) { return g === null ? S.UNKNOWN : g ? S.PASS : S.FAIL; }
// 벤처 연구개발비 비율 기준(업종×매출 구간)에서 가능한 기준값 목록 — 화면의 '우리 회사 기준' 안내에도 쓴다
export function rdRatioThresholds(table, industry, revenueAnswer) {
  if (!table) return [];
  const [b1, b2] = table.revenue_buckets_manwon;
  const buckets = [[0, b1], [b1, b2], [b2, Infinity]];
  const rb = band(revenueAnswer);
  const idx = buckets.map((bk, i) => i).filter((i) => {
    if (!rb) return true;
    const [lo, hi] = buckets[i];
    return rb.exact ? rb.lo >= lo && rb.lo < hi : rb.lo < hi && rb.hi > lo;
  });
  const rows = table.rows[industry] ? [table.rows[industry]] : Object.values(table.rows);
  return [...new Set(rows.flatMap((r) => idx.map((i) => r[i])))].sort((x, y) => x - y);
}

export const CHECKS = {
  yes({ q }, ctx) {
    const v = ctx.answers[q];
    if (v === 'yes') return { status: S.PASS, inputs: [q] };
    if (v === 'no') return { status: S.FAIL, inputs: [q] };
    return { status: S.UNKNOWN, missing: [q], inputs: [q] };
  },
  no({ q }, ctx) {
    const v = ctx.answers[q];
    if (v === 'no') return { status: S.PASS, inputs: [q] };
    if (v === 'yes') return { status: S.FAIL, inputs: [q] };
    return { status: S.UNKNOWN, missing: [q], inputs: [q] };
  },
  enum({ q, pass = [], fail = [] }, ctx) {
    const v = ctx.answers[q];
    if (pass.includes(v)) return { status: S.PASS, inputs: [q] };
    if (fail.includes(v)) return { status: S.FAIL, inputs: [q] };
    return { status: S.UNKNOWN, missing: [q], inputs: [q] };
  },
  gte({ q, min, unit = '' }, ctx) {
    const b = band(ctx.answers[q]);
    if (b && !b.exact) {
      const g = bandGte(b, min);
      return { status: bandStatus(g), inputs: [q], ...(g === null ? { missing: [q] } : {}), detail: `선택 ${bandText(b, unit)} / 기준 ${fmt(min)}${unit} 이상${g === null ? STRADDLE : ''}` };
    }
    const v = b ? b.lo : null; // 숫자 답 또는 정확한 값 구간(예: '받은 적 없음' = r:0:0)
    if (v === null) return { status: S.UNKNOWN, missing: [q], inputs: [q], detail: `기준 ${fmt(min)}${unit} 이상` };
    const how = typeof ctx.answers[q] === 'string' ? '선택' : '입력';
    return { status: v >= min ? S.PASS : S.FAIL, inputs: [q], detail: `${how} ${fmt(v)}${unit} / 기준 ${fmt(min)}${unit} 이상` };
  },
  lt({ q, max, unit = '' }, ctx) {
    const b = band(ctx.answers[q]);
    if (b && !b.exact) {
      const g = bandGte(b, max);
      return { status: g === null ? S.UNKNOWN : g ? S.FAIL : S.PASS, inputs: [q], ...(g === null ? { missing: [q] } : {}), detail: `선택 ${bandText(b, unit)} / 기준 ${fmt(max)}${unit} 미만${g === null ? STRADDLE : ''}` };
    }
    const v = b ? b.lo : null;
    if (v === null) return { status: S.UNKNOWN, missing: [q], inputs: [q], detail: `기준 ${fmt(max)}${unit} 미만` };
    return { status: v < max ? S.PASS : S.FAIL, inputs: [q], detail: `${typeof ctx.answers[q] === 'string' ? '선택' : '입력'} ${fmt(v)}${unit} / 기준 ${fmt(max)}${unit} 미만` };
  },
  years_since_gte({ q, years }, ctx) {
    const raw = ctx.answers[q];
    const b = band(raw);
    if (b && typeof raw === 'string') { // 업력 구간(년)
      const g = bandGte(b, years);
      return { status: bandStatus(g), inputs: [q], ...(g === null ? { missing: [q] } : {}), detail: `업력 ${bandText(b, '년')}(선택) / 기준 ${years}년 이상${g === null ? STRADDLE : ''}` };
    }
    if (isMissing(raw)) return { status: S.UNKNOWN, missing: [q], inputs: [q] };
    const y = fullYearsBetween(raw, ctx.asOf);
    if (y === null || y < 0) return { status: S.UNKNOWN, missing: [q], inputs: [q], detail: '날짜를 다시 확인해 주세요(없는 날짜이거나 기준일 이후 날짜).' };
    return { status: y >= years ? S.PASS : S.FAIL, inputs: [q], detail: `기준일 ${ctx.asOf} 기준 만 ${y}년 / 기준 ${years}년 이상` };
  },
  // 업력: 휴업기간 제외·법인전환 업력 승계(운영규정 제5조) 가능성을 반영해 섣불리 FAIL/PASS 하지 않는다.
  biz_age_gte({ years, conversion = false, suspension = false }, ctx) {
    const base = CHECKS.years_since_gte({ q: 'founded_on', years }, ctx);
    const a = ctx.answers;
    if (base.status === S.PASS && suspension) {
      if (a.suspended_period === 'yes') return { ...base, status: S.UNKNOWN, inputs: ['founded_on', 'suspended_period'], detail: `${base.detail} · 휴업기간을 빼고 다시 계산해야 해요.` };
      if (a.suspended_period !== 'no') return { ...base, status: S.UNKNOWN, missing: ['suspended_period'], inputs: ['founded_on', 'suspended_period'], detail: `${base.detail} · 휴업 이력 확인이 필요해요(휴업기간은 업력에서 빠져요).` };
    }
    if (base.status === S.FAIL && conversion && a.biz_status === 'corporation' && a.converted_from_individual !== 'no') {
      return { ...base, status: S.UNKNOWN, missing: a.converted_from_individual === 'yes' ? [] : ['converted_from_individual'], inputs: ['founded_on', 'converted_from_individual'], detail: `${base.detail} · 개인사업자 업력을 이어받을 수 있는지(법인전환 요건) 확인이 필요해요.` };
    }
    return base;
  },
  venture_invest_ratio({ invest, capital, culture, pct, pct_culture, ratio_q }, ctx) {
    const a = ctx.answers; const i = num(a[invest]); const c = num(a[capital]);
    if (i === null && ratio_q) { // 구간 답: 자본금 대비 투자금 비율을 바로 고른다
      const rb = band(a[ratio_q]);
      if (!rb) return { status: S.UNKNOWN, missing: [ratio_q], inputs: [ratio_q], detail: `기준 ${pct}% 이상(문화산업 제작자 법인 ${pct_culture}%)` };
      const shown = `선택 ${bandText(rb, '%')}`;
      const hiTh = Math.max(pct, pct_culture); const loTh = Math.min(pct, pct_culture);
      if (bandGte(rb, hiTh) === true) return { status: S.PASS, inputs: [ratio_q], detail: `${shown} / 기준 ${pct}% 이상` };
      if (bandGte(rb, loTh) === false) return { status: S.FAIL, inputs: [ratio_q], detail: `${shown} / 기준 ${pct}% 이상` };
      const cul = a[culture];
      if (cul === 'yes' || cul === 'no') {
        const th = cul === 'yes' ? pct_culture : pct;
        const g = bandGte(rb, th);
        return { status: bandStatus(g), inputs: [ratio_q, culture], ...(g === null ? { missing: [ratio_q] } : {}), detail: `${shown} / ${cul === 'yes' ? '문화산업 제작자 법인 ' : ''}기준 ${th}% 이상${g === null ? STRADDLE : ''}` };
      }
      return { status: S.UNKNOWN, missing: [culture], inputs: [ratio_q, culture], detail: `${shown} — 문화산업 제작자 법인이면 ${pct_culture}%, 아니면 ${pct}% 기준이에요.` };
    }
    const missing = [];
    if (i === null) missing.push(invest);
    if (c === null) missing.push(capital);
    if (missing.length) return { status: S.UNKNOWN, missing, inputs: [invest, capital] };
    if (c <= 0) return { status: S.UNKNOWN, missing: [capital], inputs: [invest, capital], detail: '자본금을 다시 확인해 주세요.' };
    const r = (i / c) * 100;
    const shown = `투자금 비율 ${r.toFixed(1)}%`;
    const cul = a[culture];
    const th = cul === 'yes' ? pct_culture : pct;
    if (r >= Math.max(pct, pct_culture)) return { status: S.PASS, inputs: [invest, capital], detail: `${shown} / 기준 ${th}% 이상` };
    if (r < Math.min(pct, pct_culture)) return { status: S.FAIL, inputs: [invest, capital], detail: `${shown} / 기준 ${th}% 이상` };
    if (cul === 'yes') return { status: S.PASS, inputs: [invest, capital, culture], detail: `${shown} / 문화산업 제작자 법인 기준 ${pct_culture}% 이상` };
    if (cul === 'no') return { status: S.FAIL, inputs: [invest, capital, culture], detail: `${shown} / 기준 ${pct}% 이상` };
    return { status: S.UNKNOWN, missing: [culture], inputs: [invest, capital, culture], detail: `${shown} — 문화산업 제작자 법인이면 7%, 아니면 10% 기준이에요.` };
  },
  venture_rd_ratio({ spend, revenue, industry, ratio_q }, ctx) {
    const a = ctx.answers; const sp = num(a[spend]); const rv = num(a[revenue]);
    const table = ctx.tables && ctx.tables.rd_ratio;
    if (!table) return { status: S.UNKNOWN, detail: '업종별 기준표가 없어요.', unverified: true };
    if ((sp === null || rv === null) && ratio_q) { // 구간 답: 매출 구간 + 비율 구간
      const rb = band(a[revenue]);
      if (!rb) return { status: S.UNKNOWN, missing: [revenue], inputs: [revenue, ratio_q, industry], detail: '매출 규모에 따라 기준 비율이 달라요.' };
      if (rb.exact && rb.lo === 0) return { status: S.UNKNOWN, missing: [], inputs: [revenue], detail: '매출액이 0원이면 비율 산정 방식을 확인기관에 확인해야 해요.' };
      const ths = rdRatioThresholds(table, a[industry], a[revenue]);
      const lo = ths[0]; const hi = ths[ths.length - 1];
      const need = lo === hi ? `기준 ${lo}% 이상` : `기준 ${lo}~${hi}%(업종·매출 규모에 따라)`;
      const qb = band(a[ratio_q]);
      if (!qb) return { status: S.UNKNOWN, missing: [ratio_q], inputs: [revenue, ratio_q, industry], detail: need };
      const shown = `선택 ${bandText(qb, '%')} / ${need}`;
      const ins = [revenue, ratio_q, industry];
      if (bandGte(qb, hi) === true) return { status: S.PASS, inputs: ins, detail: shown };
      if (bandGte(qb, lo) === false) return { status: S.FAIL, inputs: ins, detail: shown };
      const miss = [];
      if (lo !== hi && !table.rows[a[industry]]) miss.push(industry);
      if (lo !== hi && (rb.exact ? false : rdRatioThresholds(table, a[industry], `r:${rb.lo}:${rb.lo}`).length !== ths.length)) miss.push(revenue);
      if (!miss.length) miss.push(ratio_q);
      return { status: S.UNKNOWN, missing: miss, inputs: ins, detail: `${shown}${STRADDLE}` };
    }
    const missing = [];
    if (sp === null) missing.push(spend);
    if (rv === null) missing.push(revenue);
    if (missing.length) return { status: S.UNKNOWN, missing, inputs: [spend, revenue, industry] };
    if (rv <= 0) return { status: S.UNKNOWN, missing: [revenue], inputs: [spend, revenue], detail: '매출액이 0원이면 비율 산정 방식을 확인기관에 확인해야 해요.' };
    const r = (sp / rv) * 100;
    const [b1, b2] = table.revenue_buckets_manwon;
    const bi = rv < b1 ? 0 : rv < b2 ? 1 : 2;
    const ind = a[industry];
    const row = table.rows[ind];
    const shown = `연구개발비 비율 ${r.toFixed(2)}% (${table.bucket_labels[bi]})`;
    if (row) {
      const th = row[bi];
      return { status: r >= th ? S.PASS : S.FAIL, inputs: [spend, revenue, industry], detail: `${shown} / 업종 기준 ${th}% 이상` };
    }
    const all = Object.values(table.rows).map((x) => x[bi]);
    const lo = Math.min(...all); const hi = Math.max(...all);
    if (r >= hi) return { status: S.PASS, inputs: [spend, revenue], detail: `${shown} / 모든 업종 기준(${lo}~${hi}%) 이상` };
    if (r < lo) return { status: S.FAIL, inputs: [spend, revenue], detail: `${shown} / 모든 업종 기준(${lo}~${hi}%) 미만` };
    return { status: S.UNKNOWN, missing: [industry], inputs: [spend, revenue, industry], detail: `${shown} — 업종에 따라 ${lo}~${hi}% 기준이 달라요. 업종을 선택해 주세요.` };
  },
  // 시행령 제6조①1호: 규모·벤처·연구원창업·창업3년·중기업 전환 1년에 따른 연구전담요원 기준 인원
  // 기준 인원은 규칙팩 args.staff(근거 문구와 DATA-05로 대조)에서만 읽는다
  rnd_institute_staff(args, ctx) {
    const a = ctx.answers;
    const K = args && args.staff;
    if (!K) return { status: S.UNKNOWN, inputs: [], detail: '규칙 데이터에 기준 인원표가 없어 판정하지 않아요.' };
    const cq = args.q || 'rnd_researchers';
    const count = num(a[cq]);
    const cband = typeof a[cq] === 'string' ? band(a[cq]) : null;
    const sizes = ['small', 'medium', 'midsize', 'large'].includes(a.company_size) ? [a.company_size] : ['small', 'medium', 'midsize', 'large'];
    const opts = (v) => (v === true ? [true] : v === false ? [false] : [true, false]);
    const V = opts(tri(a.rnd_is_venture));
    const F = opts(tri(a.rnd_founder_researcher));
    const fb = typeof a.founded_on === 'string' ? band(a.founded_on) : null;
    const yrs = fb || isMissing(a.founded_on) ? null : fullYearsBetween(a.founded_on, ctx.asOf);
    const underStartup = fb ? (bandGte(fb, K.startup_years) === null ? null : !bandGte(fb, K.startup_years)) : (yrs === null || yrs < 0 ? null : yrs < K.startup_years);
    const Y = opts(underStartup);
    const B = opts(tri(a.rnd_became_medium_1y));
    const T = new Set();
    for (const size of sizes) for (const v of V) for (const f of F) for (const y of Y) for (const b of B) {
      if ((size === 'small' || size === 'medium') && (v || f)) T.add(K.venture_or_founder);
      else if (size === 'small') T.add(y ? K.small_startup : K.small);
      else if (size === 'medium') T.add(b ? K.medium_transition : K.medium);
      else if (size === 'midsize') T.add(K.midsize);
      else T.add(K.large);
    }
    const lo = Math.min(...T); const hi = Math.max(...T);
    const need = lo === hi ? `기준 ${lo}명 이상` : `기준 ${lo}~${hi}명(규모·벤처 여부 등에 따라 결정)`;
    const inputs = ['rnd_researchers', 'company_size', 'rnd_is_venture', 'rnd_founder_researcher', 'founded_on', 'rnd_became_medium_1y'];
    if (count === null && !cband) return { status: S.UNKNOWN, missing: ['rnd_researchers'], inputs, detail: need };
    const shown = cband ? `선택 ${bandText(cband, '명')} / ${need}` : `입력 ${count}명 / ${need}`;
    const allHi = cband ? bandGte(cband, hi) === true : count >= hi;
    const allLo = cband ? bandGte(cband, lo) === false : count < lo;
    if (allHi) return { status: S.PASS, inputs, detail: shown };
    if (allLo) return { status: S.FAIL, inputs, detail: shown };
    const miss = [];
    if (sizes.length > 1) miss.push('company_size');
    if (V.length > 1) miss.push('rnd_is_venture');
    if (F.length > 1) miss.push('rnd_founder_researcher');
    if (Y.length > 1) miss.push('founded_on');
    if (B.length > 1 && sizes.includes('medium')) miss.push('rnd_became_medium_1y');
    if (cband && lo === hi) return { status: S.UNKNOWN, missing: [cq], inputs, detail: `${shown}${STRADDLE}` };
    if (cband && !miss.length) miss.push(cq);
    return { status: S.UNKNOWN, missing: miss, inputs, detail: `${shown} — 기준 인원을 정하려면 추가 정보가 필요해요.` };
  },
  // 시행규칙 제2조②1호: 독립 연구공간 원칙 + 칸막이·2m 벽체 예외
  rnd_space({ unit, partition_industries: inds }, ctx) {
    const a = ctx.answers; const sp = a.rnd_space;
    const inputs = ['rnd_space'];
    if (sp === 'independent') return { status: S.PASS, inputs, detail: '고정 벽체·별도 출입문 독립 공간' };
    if (sp === 'none') return { status: S.FAIL, inputs, detail: '연구공간 없음' };
    if (sp === 'partial_wall') return { status: S.UNKNOWN, inputs, detail: '2m 이상 벽체 예외는 ① 2m 이상 고정 벽체·별도 출입문 ② 전용 공간으로 명확히 식별 ③ 건축 관계 법령 적합을 모두 갖춰야 하고, 벽체로 천장까지 구분할 수 없는 사유(환기·소방 등)가 있어야 해요. 현장 확인이 필요해요.' };
    if (sp !== 'partition') return { status: S.UNKNOWN, missing: ['rnd_space'], inputs };
    // 칸막이: (중소기업 | 연구개발형 중소기업·벤처 | 전담부서이면서 정보서비스·SW개발공급업) AND 50㎡ 초과 확보 불가
    const elig = [tri(a.is_sme), tri(a.rnd_is_venture), tri(a.rnd_founder_researcher)];
    if (unit === 'dept') elig.push(isMissing(a.industry) || !Array.isArray(inds) ? null : inds.includes(a.industry));
    const e = elig.includes(true) ? true : elig.every((x) => x === false) ? false : null;
    const o = tri(a.rnd_space_over50_impossible);
    const allInputs = ['rnd_space', 'is_sme', 'rnd_is_venture', 'rnd_space_over50_impossible'];
    if (e === false) return { status: S.FAIL, inputs: allInputs, detail: '칸막이 예외는 중소기업·벤처기업 등에만 인정돼요.' };
    if (o === false) return { status: S.FAIL, inputs: allInputs, detail: '50㎡ 초과 면적을 확보할 수 있으면 칸막이 예외가 인정되지 않아요.' };
    if (e === true && o === true) return { status: S.PASS, inputs: allInputs, detail: '칸막이 구분 예외(50㎡ 초과 확보 불가) 해당' };
    const miss = [];
    if (e === null) miss.push('is_sme');
    if (o === null) miss.push('rnd_space_over50_impossible');
    return { status: S.UNKNOWN, missing: miss, inputs: allInputs, detail: '칸막이 예외 해당 여부 확인이 필요해요.' };
  },
  assessment() {
    return { status: S.UNKNOWN, detail: '공식 평가기관의 평가·심사 단계예요. 이 앱은 판정하지 않아요.' };
  },
  unverified() {
    return { status: S.UNKNOWN, unverified: true };
  },
};

// ── 트리 평가 ─────────────────────────────────────────────
function sourceOk(ref, ctx) {
  const s = ctx.sources && ctx.sources[ref];
  return !!(s && s.official_url && /^https:\/\//.test(s.official_url) && ['OK', 'OK_IMAGE'].includes(s.access_status));
}

export function evaluateNode(node, ctx, opts = {}) {
  if (node.type === 'LEAF') {
    const base = { id: node.id, type: 'LEAF', label: node.label, kind: node.kind || 'requirement', source_refs: node.source_refs || [], action_fail: node.action_fail || null, note: node.note || null };
    if (node.kind === 'assessment' && opts.basicOnly) return { ...base, status: S.NA, excluded: true };
    // 근거 없는 규칙은 자동판정 금지: 출처 미기재·접속 미확인 출처만 있는 원자 요건은 UNKNOWN(미검증)
    const refs = node.source_refs || [];
    const verifiedSource = refs.length > 0 && refs.some((r) => sourceOk(r, ctx));
    if ((node.review_status && node.review_status !== 'VERIFIED') || node.check === 'unverified' || !verifiedSource) {
      return { ...base, status: S.UNKNOWN, unverified: true, detail: node.unverified_note || '공식 근거를 확인하지 못한 요건이라 자동 판정하지 않아요.' };
    }
    const fn = CHECKS[node.check];
    if (!fn) throw new Error(`알 수 없는 판정 함수: ${node.check}`);
    const r = fn(node.args || {}, ctx);
    return { ...base, ...r };
  }
  if (node.type === 'AND' || node.type === 'OR') {
    const children = node.children.map((c) => evaluateNode(c, ctx, opts));
    const st = node.type === 'AND' ? combineAnd(children.map((c) => c.status)) : combineOr(children.map((c) => c.status));
    return { id: node.id, type: node.type, label: node.label, status: st, children };
  }
  if (node.type === 'WHEN') {
    const cond = evaluateNode(node.cond, ctx, { ...opts, basicOnly: false });
    const then = evaluateNode(node.then, ctx, opts);
    let st;
    if (cond.status === S.PASS) st = then.status;
    else if (cond.status === S.FAIL || cond.status === S.NA) st = S.NA; // 선행조건 불해당이 공식 근거로 확인된 경우만
    else st = S.UNKNOWN; // 선행조건 미확인 → 분기 UNKNOWN
    return { id: node.id, type: 'WHEN', label: node.label, status: st, cond, then, na_note: node.na_note || null, branch_active: cond.status === S.PASS };
  }
  throw new Error(`알 수 없는 노드 유형: ${node.type}`);
}

// 트리의 원자 요건을 평평하게(활성 분기만). WHEN이 N/A면 그 아래 요건은 '해당 없음'으로 표시.
export function flattenLeaves(res, out = [], inactive = false) {
  if (res.type === 'LEAF') { out.push(inactive ? { ...res, status: S.NA, inactive: true } : res); return out; }
  if (res.type === 'WHEN') {
    const off = inactive || res.status === S.NA;
    if (res.cond.status !== S.PASS && !off) out.push({ ...res.cond, is_condition: true });
    flattenLeaves(res.then, out, off);
    return out;
  }
  res.children.forEach((c) => flattenLeaves(c, out, inactive));
  return out;
}

// ── 규칙팩 게이트 + 제도 평가 ───────────────────────────────
export function gateRulePack(pack, asOf, sources) {
  if (!pack) return { active: false, code: 'NO_RULES', reason: '자동 판정 규칙이 없는 정보형 제도예요.' };
  if (pack.review_status !== 'VERIFIED') return { active: false, code: pack.review_status || 'UNVERIFIED', reason: `규칙 검증 상태가 '${pack.review_status || '미기재'}'라 자동 판정하지 않아요.` };
  if (!parseDate(asOf)) return { active: false, code: 'BAD_AS_OF', reason: '진단 기준일이 올바르지 않아요.' };
  if (pack.valid_from && asOf < pack.valid_from) return { active: false, code: 'NOT_YET_EFFECTIVE', reason: `규칙 적용 시작일(${pack.valid_from}) 이전 기준일이에요.` };
  if (pack.valid_to && asOf > pack.valid_to) return { active: false, code: 'EXPIRED', reason: `규칙 유효기간(${pack.valid_to})이 지났어요.` };
  if (pack.review_due_at && asOf > pack.review_due_at) return { active: false, code: 'REVIEW_OVERDUE', reason: `공식 근거 재확인 기한(${pack.review_due_at})이 지나 자동 판정을 멈췄어요. 운영자가 근거를 다시 확인해야 해요.` };
  const refs = new Set();
  const walk = (n) => { (n.source_refs || []).forEach((r) => refs.add(r)); if (n.children) n.children.forEach(walk); if (n.cond) walk(n.cond); if (n.then) walk(n.then); };
  pack.pathways.forEach((p) => { (p.source_refs || []).forEach((r) => refs.add(r)); walk(p.root); });
  const missing = [...refs].filter((r) => !sources[r]);
  if (missing.length) return { active: false, code: 'SOURCE_MISSING', reason: `출처 정보가 없는 근거(${missing.join(', ')})가 있어 자동 판정하지 않아요.` };
  return { active: true, code: 'ACTIVE', reason: '' };
}

export function evaluateScheme(pack, answers, { asOf, sources = {} } = {}) {
  const gate = gateRulePack(pack, asOf, sources);
  const meta = { engine_version: ENGINE_VERSION, rule_pack_id: pack ? pack.rule_pack_id : null, rule_version: pack ? pack.rule_version : null, as_of: asOf, last_verified_at: pack ? pack.last_verified_at : null };
  if (!gate.active) return { scheme_id: pack ? pack.scheme_id : null, gate, basic: 'OUT_OF_SCOPE', overall: 'OUT_OF_SCOPE', pathways: [], meta };
  const ctx = { answers: answers || {}, asOf, sources, tables: pack.tables || {} };
  const pathways = pack.pathways.map((p) => {
    const full = evaluateNode(p.root, ctx);
    const basic = evaluateNode(p.root, ctx, { basicOnly: true });
    return {
      pathway_id: p.pathway_id, name: p.name, evaluator: p.evaluator, source_refs: p.source_refs,
      basic: basic.status, overall: full.status, tree: full, leaves: flattenLeaves(full),
    };
  });
  const comb = pack.combine === 'AND' ? combineAnd : combineOr;
  return {
    scheme_id: pack.scheme_id, gate,
    basic: comb(pathways.map((p) => p.basic)),
    overall: comb(pathways.map((p) => p.overall)),
    pathways, meta,
  };
}

// 입력이 비었거나 모름이라 결과가 UNKNOWN이 된 질문 목록(중복 제거)
export function missingInputs(result) {
  const set = new Set();
  result.pathways.forEach((p) => {
    if (p.basic === S.NA) return;
    p.leaves.forEach((l) => { if (l.status === S.UNKNOWN && l.missing) l.missing.forEach((q) => set.add(q)); });
  });
  return [...set];
}

// 화면 표기용 의미 라벨 — PASS를 '인증 취득'으로 번역하지 않는다.
export function schemeLabel(basic) {
  switch (basic) {
    case S.PASS: return { key: 'pass', text: '기본요건 확인', sub: '입력 정보 기준 · 기관 평가·심사 필요' };
    case S.FAIL: return { key: 'fail', text: '기본요건 미충족', sub: '현재 입력한 정보 기준' };
    case S.UNKNOWN: return { key: 'unknown', text: '추가 확인 필요', sub: '정보가 더 있으면 정확해져요' };
    case S.NA: return { key: 'na', text: '해당 없음', sub: '공식 기준상 신청 대상이 아니에요' };
    default: return { key: 'out', text: '판정 범위 밖', sub: '정보 안내만 제공해요' };
  }
}
export function leafLabel(st) {
  switch (st) {
    case S.PASS: return { key: 'pass', text: '충족' };
    case S.FAIL: return { key: 'fail', text: '미충족' };
    case S.UNKNOWN: return { key: 'unknown', text: '확인 필요' };
    default: return { key: 'na', text: '해당 없음' };
  }
}
