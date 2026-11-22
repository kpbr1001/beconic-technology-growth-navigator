// 데이터(JSON)에 적힌 표시·적용 조건식을 안전하게 해석한다. eval 사용 금지.
// 문법: always | never | <절> [and <절>]...
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
    if (typeof v !== 'number' || Number.isNaN(v)) return false;
    const n = Number(rhs);
    if (op === '>') return v > n;
    if (op === '>=') return v >= n;
    if (op === '<') return v < n;
    return v <= n;
  }
  throw new Error(`조건식 해석 불가: ${c}`);
}

export function evalExpr(expr, answers = {}, ctx = {}) {
  if (!expr) return true;
  return String(expr).split(/\s+and\s+/).every((c) => clause(c.trim(), answers, ctx));
}

// 데이터 검증용: 조건식 문법만 확인
export function assertExpr(expr) {
  String(expr).split(/\s+and\s+/).forEach((c) => {
    const t = c.trim();
    if (t === 'always' || t === 'never' || CLAUSE_LIST.test(t) || CLAUSE_CMP.test(t)) return;
    throw new Error(`조건식 문법 오류: ${expr}`);
  });
}
