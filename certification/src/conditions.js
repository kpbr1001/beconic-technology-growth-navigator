// 데이터(JSON)에 적힌 표시·적용 조건식을 안전하게 해석한다. eval 사용 금지.
// 문법: always | never | <절> [and <절>]... [or <절> [and <절>]...]   (and가 or보다 먼저 묶인다)
//   x in [a, b]   단일값이 목록 중 하나(배열 답변이면 교집합)
//   x has [a, b]  배열 답변과 목록의 교집합이 있음
//   x == v / x != v / x > n / x >= n / x < n / x <= n
//   scheme in [VEN, INNO]  현재 진단 대상 제도에 포함
const CLAUSE_LIST = /^([a-z_]+)\s+(in|has)\s+\[([^\]]*)\]$/i;
const CLAUSE_CMP = /^([a-z_]+)\s*(==|!=|>=|<=|>|<)\s*([\w.-]+)$/i;

export function isMissing(v) {
  if (v === undefined || v === null || v === '' || v === 'unknown') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'number') return Number.isNaN(v);
  return false;
}

// 구간 답: 'r:lo:hi' = lo 이상 hi 미만(hi 생략 = 상한 없음), lo와 hi가 같으면 정확히 그 값.
// 숫자 답은 정확한 값. 구간 버튼(칩)으로 받은 답을 판정·조건식이 같은 방식으로 다룬다.
const BAND = /^r:(\d+(?:\.\d+)?)?:(\d+(?:\.\d+)?)?$/;
export function band(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return { lo: v, hi: v, exact: true };
  if (typeof v !== 'string') return null;
  const m = v.match(BAND);
  if (!m) return null;
  const lo = m[1] === undefined ? 0 : Number(m[1]);
  const hi = m[2] === undefined ? Infinity : Number(m[2]);
  if (hi < lo) return null;
  return { lo, hi, exact: lo === hi };
}
export const isBand = (v) => typeof v === 'string' && BAND.test(v);
// 구간 안의 모든 값이 t 이상이면 true, 모두 t 미만이면 false, 걸치면 null
export function bandGte(b, t) {
  if (b.lo >= t) return true;
  if (b.exact ? b.lo < t : b.hi <= t) return false;
  return null;
}

function listOf(raw) {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function clause(c, answers, ctx) {
  if (c === 'always') return true;
  if (c === 'never') return false;
  let m = c.match(CLAUSE_LIST);
  if (m) {
    const [, key, op, raw] = m;
    const list = listOf(raw);
    const v = key === 'scheme' ? (ctx.schemes || []) : answers[key];
    if (v === undefined || v === null || v === '') {
      return list.includes('unknown') && op === 'in';
    }
    const arr = Array.isArray(v) ? v : [v];
    return arr.some((x) => list.includes(String(x)));
  }
  m = c.match(CLAUSE_CMP);
  if (m) {
    const [, key, op, rhs] = m;
    const v = answers[key];
    if (op === '==' || op === '!=') {
      const eq = v !== undefined && v !== null && String(v) === rhs;
      return op === '==' ? eq : !eq;
    }
    const n = Number(rhs);
    if (isBand(v)) {
      // 구간 답: 모든 값이 조건을 만족하거나 일부라도 만족하면 참(구간이 걸치면 보수적으로 포함 — 서류·질문을 빠뜨리지 않기 위해)
      const b = band(v);
      if (op === '>') return b.exact ? b.lo > n : b.hi > n;
      if (op === '>=') return b.exact ? b.lo >= n : b.hi > n;
      if (op === '<') return b.lo < n;
      return b.lo <= n;
    }
    if (typeof v !== 'number' || Number.isNaN(v)) return false;
    if (op === '>') return v > n;
    if (op === '>=') return v >= n;
    if (op === '<') return v < n;
    return v <= n;
  }
  throw new Error(`조건식 해석 불가: ${c}`);
}

export function evalExpr(expr, answers = {}, ctx = {}) {
  if (!expr) return true;
  return String(expr).split(/\s+or\s+/).some((part) => part.split(/\s+and\s+/).every((c) => clause(c.trim(), answers, ctx)));
}

// 데이터 검증용: 조건식 문법만 확인
export function assertExpr(expr) {
  String(expr).split(/\s+(?:and|or)\s+/).forEach((c) => {
    const t = c.trim();
    if (t === 'always' || t === 'never' || CLAUSE_LIST.test(t) || CLAUSE_CMP.test(t)) return;
    throw new Error(`조건식 문법 오류: ${expr}`);
  });
}
