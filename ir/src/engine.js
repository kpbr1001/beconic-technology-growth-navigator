// 검증 엔진(VerificationEngine) — 순수 함수, 결정론적.
// 자동 처리 범위: 자료 존재, 필수 입력, 같은 정의의 수치 대사, 합계, 날짜·기간·단위 확인.
// 하지 않는 것: 원인 추측, 확률·전망·점수·등급, 통화 환산, 법적 유효성·회계 적정성·기술 우월성 판단.
// 금액은 BigInt(×100, 소수 둘째 자리까지)로 계산해 부동소수 오차가 없다.
import { QUESTIONS, QMAP, RULES } from './registry.js';

export const ENGINE_VERSION = 'VE-1.0.0';
const SCALE = 100n;
const UNIT_WORDS = { '만': 10000n, '백만': 1000000n, '천만': 10000000n, '억': 100000000n, '조': 1000000000000n };

/** 금액·숫자 파싱. 빈 값 → null, 형식 오류 → { err }. "1.5억", "120,000,000원", "-3,000" 허용 */
export function parseAmount(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).replace(/[\s,]/g, '').replace(/원$/, '');
  if (s === '') return null;
  let mul = 1n;
  const m = s.match(/(만|백만|천만|억|조)$/);
  if (m) { mul = UNIT_WORDS[m[1]]; s = s.slice(0, -m[1].length); }
  const n = s.match(/^(-)?(\d+)(?:\.(\d{1,8}))?$/);
  if (!n) return { err: '숫자 형식을 확인해 주세요' };
  const frac = (n[3] || '');
  // ×100 고정소수: 정수부·소수부를 따로 곱해 정확히 계산
  const fracDigits = BigInt(frac.length);
  const whole = BigInt(n[2] + frac); // 소수점 제거한 정수
  const scaled = whole * mul * SCALE; // 10^fracDigits 만큼 커진 상태
  const div = 10n ** fracDigits;
  if (scaled % div !== 0n) return { err: '소수 둘째 자리까지만 입력할 수 있어요' };
  const v = scaled / div;
  return { v: n[1] ? -v : v };
}

/** 개수(고객 수·주식 수) — 0 이상의 정수만 */
export function parseCount(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[\s,]/g, '').replace(/(명|주|건)$/, '');
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return { err: '0 이상의 정수로 입력해 주세요' };
  return { v: BigInt(s) * SCALE };
}

const abs = (v) => (v < 0n ? -v : v);
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** BigInt(×100) → 표시 문자열 */
export function fmtNum(v) {
  const neg = v < 0n; const a = abs(v);
  const i = a / SCALE; const f = a % SCALE;
  return (neg ? '-' : '') + group(i.toString()) + (f ? '.' + f.toString().padStart(2, '0').replace(/0$/, '') : '');
}
export function fmtUnit(v, unit) {
  if (v === null || v === undefined) return '—';
  const n = fmtNum(v);
  if (unit === 'KRW') return `${n}원`;
  if (['명', '건', '주'].includes(unit)) return `${n}${unit}`;
  if (unit === '%') return `${n}%`;
  return `${unit} ${n}`;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const monthIndex = (m) => { const x = MONTH.exec(m || ''); return x ? Number(x[1]) * 12 + Number(x[2]) - 1 : null; };
export const isDate = (d) => DATE.test(d || '');
/** 시작·종료 월 포함 개월 수 */
export const monthsInclusive = (a, b) => { const x = monthIndex(a), y = monthIndex(b); return x === null || y === null ? null : y - x + 1; };

/** 덱 기간 문자열 정규화: 2025 → 2025-01~2025-12, 2025-01~2025-12, 2025-12-31 */
export function normPeriod(raw) {
  const s = String(raw || '').replace(/\s/g, '').replace(/[.／/]/g, '-').replace(/[–—]/g, '~');
  if (/^\d{4}$/.test(s)) return `${s}-01~${s}-12`;
  const r = s.match(/^(\d{4}-\d{2})~(\d{4}-\d{2})$/);
  if (r && monthIndex(r[1]) !== null && monthIndex(r[2]) !== null) return `${r[1]}~${r[2]}`;
  if (isDate(s)) return s;
  return null;
}

/** 과거 증감률(%) — 소수 첫째 자리, 0에서 먼 쪽으로 반올림. 분모 ≤ 0 이면 null */
export function growthPct(prev, cur) {
  if (prev <= 0n) return null;
  const num = (cur - prev) * 1000n; // 0.1% 단위
  let q = num / prev; const r = num % prev;
  if (abs(r) * 2n >= prev) q += num < 0n ? -1n : 1n;
  return q * 10n; // ×100 고정소수(%)로 반환
}
export function ratioPct(n, d) { return d > 0n ? growthPct(d, n + d) : null; } // n/d ×100 (같은 반올림 규칙)

// ───────────────────────── 입력 접근
const ansOf = (st, qid) => (st.answers && st.answers[qid]) || {};
const active = (st, qid) => { const a = ansOf(st, qid); return (a.status || 'answer') === 'answer'; };
const F = (st, qid) => (active(st, qid) ? (ansOf(st, qid).fields || {}) : {});
const fieldDef = (qid, k) => (QMAP[qid].fields || []).find((f) => f.k === k);
const label = (qid, k) => fieldDef(qid, k)?.label || k;

function readMoney(st, qid, k, issues) {
  const raw = F(st, qid)[k]; const p = parseAmount(raw);
  if (p && p.err) { issues.push(`${label(qid, k)}: ${p.err}`); return undefined; }
  return p ? p.v : null;
}
function readCount(st, qid, k, issues) {
  const raw = F(st, qid)[k]; const p = parseCount(raw);
  if (p && p.err) { issues.push(`${label(qid, k)}: ${p.err}`); return undefined; }
  return p ? p.v : null;
}
const cur = (st, qid) => F(st, qid).currency || st.meta?.currency || 'KRW';

function finding(rule, qid, result, o) {
  return { id: `F-${rule.replace('R-', '').replace('-', '')}-${qid}${o.suffix || ''}`, rule, ruleV: RULES[rule].v, qid, refs: o.refs || [qid], result,
    title: o.title || RULES[rule].name, fact: o.fact || [], calc: o.calc || '', scope: o.scope || RULES[rule].desc,
    unconfirmed: o.unconfirmed || '', request: o.request || '', inputs: o.inputs || {} };
}
const incomplete = (rule, qid, missing, o = {}) => finding(rule, qid, 'incomplete', { ...o, fact: [`계산에 필요한 값이 비어 있거나 형식이 맞지 않습니다: ${missing.join(', ')}.`], request: '빈 값을 입력하거나 해당 자료를 연결해 주세요.' });
const hasAny = (st, qid, keys) => keys.some((k) => String(F(st, qid)[k] ?? '').trim() !== '');

// ───────────────────────── 규칙
function ruleCF(st) {
  const q = 'Q22'; const keys = ['open', 'op', 'inv', 'fin', 'close'];
  if (!hasAny(st, q, keys)) return [];
  const iss = []; const v = Object.fromEntries([...keys, 'fx'].map((k) => [k, readMoney(st, q, k, iss)]));
  const miss = keys.filter((k) => v[k] === null || v[k] === undefined).map((k) => label(q, k));
  if (miss.length || iss.length) return [incomplete('R-CF-01', q, [...miss, ...iss])];
  const u = cur(st, q); const fx = v.fx ?? 0n;
  const sum = v.open + v.op + v.inv + v.fin + fx; const diff = v.close - sum;
  const calc = `${fmtUnit(v.open, u)} + (${fmtUnit(v.op, u)}) + (${fmtUnit(v.inv, u)}) + (${fmtUnit(v.fin, u)})${v.fx !== null ? ` + (${fmtUnit(fx, u)})` : ''} = ${fmtUnit(sum, u)}`;
  const fxNote = v.fx === null ? ' 환율변동효과는 입력되지 않아 계산식에 넣지 않았습니다.' : '';
  const inputs = { 기간: `${F(st, q).start || '—'} ~ ${F(st, q).end || '—'}`, 통화: u };
  if (diff === 0n) return [finding('R-CF-01', q, 'match', { calc, inputs, fact: [`기초 현금에 세 활동의 순현금흐름을 더한 값 ${fmtUnit(sum, u)}은 입력된 기말 현금 ${fmtUnit(v.close, u)}과 같습니다.${fxNote}`], unconfirmed: '활동 분류가 회계기준에 맞는지는 확인하지 않았습니다.' })];
  return [finding('R-CF-01', q, 'mismatch', { calc, inputs, fact: [`기초 현금에 세 활동의 순현금흐름을 더한 값은 ${fmtUnit(sum, u)}이고, 입력된 기말 현금은 ${fmtUnit(v.close, u)}입니다.`, `${fmtUnit(abs(diff), u)} 차이가 확인되었습니다. 차이의 원인은 확인되지 않았습니다.${fxNote}`], unconfirmed: '차이의 원인, 활동 분류의 회계 적정성', request: '현금흐름표 원문과 각 입력값을 대조해 주세요.' })];
}

function ruleCash(st) {
  const q = 'Q21'; const out = [];
  if (!hasAny(st, q, ['total', 'restricted'])) return out;
  const iss = []; const total = readMoney(st, q, 'total', iss); const rs = readMoney(st, q, 'restricted', iss);
  const miss = [];
  if (total === null) miss.push(label(q, 'total'));
  if (rs === null) miss.push(`${label(q, 'restricted')}(없으면 0)`);
  if (miss.length || iss.length) { out.push(incomplete('R-CASH-01', q, [...miss, ...iss])); return out; }
  const u = cur(st, q); const inputs = { 기준일: F(st, q).asOf || '—', 통화: u };
  if (total < 0n || rs < 0n) out.push(finding('R-CASH-01', q, 'blocked', { inputs, fact: ['음수 금액이 입력되어 가용 현금을 계산하지 않았습니다.'], request: '잔액증명서의 금액과 부호를 확인해 주세요.' }));
  else if (rs > total) out.push(finding('R-CASH-01', q, 'mismatch', { inputs, fact: [`사용 제한 금액 ${fmtUnit(rs, u)}이 총잔액 ${fmtUnit(total, u)}보다 큽니다. 차이의 원인은 확인되지 않았습니다.`], request: '사용 제한 내역과 잔액 자료의 기준일·범위를 확인해 주세요.' }));
  else out.push(finding('R-CASH-01', q, 'calc', { inputs, calc: `${fmtUnit(total, u)} − ${fmtUnit(rs, u)} = ${fmtUnit(total - rs, u)}`, fact: [`${F(st, q).asOf || '기준일 미입력'} 기준 총잔액 ${fmtUnit(total, u)} 중 사용 제한 금액 ${fmtUnit(rs, u)}을 뺀 가용 현금은 ${fmtUnit(total - rs, u)}입니다.`], unconfirmed: '외부 잔액 확인(은행 조회)은 수행하지 않았습니다.' }));
  return out;
}

function ruleCash2(st) {
  const a = F(st, 'Q21'), b = F(st, 'Q22');
  const iss = []; const total = readMoney(st, 'Q21', 'total', iss); const close = readMoney(st, 'Q22', 'close', iss);
  if (total === null || close === null || total === undefined || close === undefined) return [];
  const o = { refs: ['Q21', 'Q22'], inputs: { 'Q21 기준일': a.asOf || '—', 'Q22 종료일': b.end || '—', 통화: `${cur(st, 'Q21')} / ${cur(st, 'Q22')}` } };
  if (cur(st, 'Q21') !== cur(st, 'Q22')) return [finding('R-CASH-02', 'Q21', 'blocked', { ...o, fact: ['두 자료의 통화가 달라 비교하지 않았습니다. 통화는 환산하지 않습니다.'] })];
  if (!a.asOf || !b.end || a.asOf !== b.end) return [finding('R-CASH-02', 'Q21', 'blocked', { ...o, fact: [`잔액 기준일(${a.asOf || '미입력'})과 현금흐름 종료일(${b.end || '미입력'})이 같지 않아 비교하지 않았습니다.`], request: '같은 날짜 기준의 잔액 자료가 있으면 연결해 주세요.' })];
  const u = cur(st, 'Q21');
  if (total === close) return [finding('R-CASH-02', 'Q21', 'match', { ...o, calc: `${fmtUnit(total, u)} = ${fmtUnit(close, u)}`, fact: [`${a.asOf} 기준 잔액 자료의 총잔액과 현금흐름의 기말 현금이 ${fmtUnit(total, u)}으로 같습니다.`] })];
  return [finding('R-CASH-02', 'Q21', 'mismatch', { ...o, calc: `${fmtUnit(total, u)} − ${fmtUnit(close, u)} = ${fmtUnit(total - close, u)}`, fact: [`${a.asOf} 기준 잔액 자료의 총잔액은 ${fmtUnit(total, u)}, 현금흐름의 기말 현금은 ${fmtUnit(close, u)}입니다.`, `${fmtUnit(abs(total - close), u)} 차이의 원인은 확인되지 않았습니다.`], request: '두 자료의 현금 범위(현금성자산 포함 여부)와 기준일을 확인해 주세요.' })];
}

function ruleCap(st) {
  const q = 'Q17'; const f = F(st, q); const rows = (f.holders || []).filter((r) => Object.values(r).some((x) => String(x ?? '').trim()));
  if (!rows.length && !String(f.issued ?? '').trim()) return [];
  const iss = []; const issued = readCount(st, q, 'issued', iss);
  const miss = []; if (issued === null) miss.push(label(q, 'issued'));
  if (!rows.length) miss.push('주주별 보유 주식');
  let sum = 0n;
  rows.forEach((r, i) => { const p = parseCount(r.shares); if (!p) miss.push(`${i + 1}번째 주주 주식 수`); else if (p.err) iss.push(`${i + 1}번째 주주 주식 수: ${p.err}`); else sum += p.v; });
  if (miss.length || iss.length) return [incomplete('R-CAP-01', q, [...miss, ...iss])];
  const inputs = { 기준일: f.asOf || '—', '주주 행 수': String(rows.length) };
  const calc = `주주별 합계 ${fmtUnit(sum, '주')} / 발행주식 총수 ${fmtUnit(issued, '주')}`;
  if (sum === issued) return [finding('R-CAP-01', q, 'match', { inputs, calc, fact: [`${f.asOf || '기준일 미입력'} 기준 주주별 보유 주식 합계 ${fmtUnit(sum, '주')}가 발행주식 총수와 같습니다.`], unconfirmed: '옵션·전환증권 행사 후 지분, 등기부와의 외부 대조는 수행하지 않았습니다.' })];
  return [finding('R-CAP-01', q, 'mismatch', { inputs, calc, fact: [`주주별 보유 주식 합계는 ${fmtUnit(sum, '주')}, 입력된 발행주식 총수는 ${fmtUnit(issued, '주')}입니다.`, `${fmtUnit(abs(sum - issued), '주')} 차이의 원인은 확인되지 않았습니다.`], request: '같은 기준일의 주주명부와 등기 자료를 확인해 주세요.' })];
}

function ruleFund(st) {
  const q = 'Q24'; const f = F(st, q); const rows = (f.uses || []).filter((r) => Object.values(r).some((x) => String(x ?? '').trim()));
  if (!rows.length && !String(f.amount ?? '').trim()) return [];
  const iss = []; const amt = readMoney(st, q, 'amount', iss); const miss = [];
  if (amt === null) miss.push(label(q, 'amount'));
  if (!rows.length) miss.push('용도별 금액');
  let sum = 0n;
  rows.forEach((r, i) => { const p = parseAmount(r.amt); if (!p) miss.push(`${i + 1}번째 용도 금액`); else if (p.err) iss.push(`${i + 1}번째 용도 금액: ${p.err}`); else sum += p.v; });
  if (miss.length || iss.length) return [incomplete('R-FUND-01', q, [...miss, ...iss])];
  const u = cur(st, q); const inputs = { 작성일: f.written || '—', 승인: f.approvedBy || '미입력', 구분: '경영진 제출 계획(실적 아님)' };
  const calc = `용도별 합계 ${fmtUnit(sum, u)} / 요청 금액 ${fmtUnit(amt, u)}`;
  if (sum === amt) return [finding('R-FUND-01', q, 'match', { inputs, calc, fact: [`경영진이 제출한 요청 금액 ${fmtUnit(amt, u)}과 용도별 금액 합계가 같습니다.`], unconfirmed: '계획의 달성 가능성과 성과는 판단하지 않습니다.' })];
  return [finding('R-FUND-01', q, 'mismatch', { inputs, calc, fact: [`경영진이 제출한 요청 금액은 ${fmtUnit(amt, u)}, 용도별 금액 합계는 ${fmtUnit(sum, u)}입니다.`, `${fmtUnit(abs(sum - amt), u)} 차이가 확인되었습니다.`], request: '자금 사용 계획표의 최신본을 확인해 주세요.' })];
}

function ruleRev(st) {
  const a = F(st, 'Q07'), b = F(st, 'Q20'); const iss = [];
  const led = readMoney(st, 'Q07', 'ledger', iss); const rev = readMoney(st, 'Q20', 'cRev', iss);
  if (led === null || rev === null || led === undefined || rev === undefined) return [];
  const o = { refs: ['Q07', 'Q20'], inputs: { 'Q07 기간': `${a.start || '—'}~${a.end || '—'}`, 'Q20 당기': `${b.cStart || '—'}~${b.cEnd || '—'}`, 통화: `${cur(st, 'Q07')} / ${cur(st, 'Q20')}` } };
  if (cur(st, 'Q07') !== cur(st, 'Q20')) return [finding('R-REV-01', 'Q07', 'blocked', { ...o, fact: ['두 자료의 통화가 달라 비교하지 않았습니다. 통화는 환산하지 않습니다.'] })];
  if (!a.start || !a.end || a.start !== b.cStart || a.end !== b.cEnd) return [finding('R-REV-01', 'Q07', 'blocked', { ...o, fact: ['매출원장 집계 기간과 재무자료 당기 기간이 같지 않아 비교하지 않았습니다.'] })];
  const u = cur(st, 'Q07');
  if (led === rev) return [finding('R-REV-01', 'Q07', 'match', { ...o, calc: `${fmtUnit(led, u)} = ${fmtUnit(rev, u)}`, fact: [`${a.start}~${a.end} 매출원장 합계와 재무자료 당기 매출이 ${fmtUnit(led, u)}으로 같습니다.`] })];
  return [finding('R-REV-01', 'Q07', 'mismatch', { ...o, calc: `${fmtUnit(led, u)} − ${fmtUnit(rev, u)} = ${fmtUnit(led - rev, u)}`, fact: [`${a.start}~${a.end} 매출원장 합계는 ${fmtUnit(led, u)}, 재무자료 당기 매출은 ${fmtUnit(rev, u)}입니다.`, `${fmtUnit(abs(led - rev), u)} 차이의 원인은 확인되지 않았습니다.`], request: '매출 정의(부가세·총액/순액)와 자료 기준일을 확인해 주세요.' })];
}

function ruleGrowth(st) {
  const q = 'Q20'; const f = F(st, q);
  if (!hasAny(st, q, ['pRev', 'pStart', 'pEnd'])) return [];
  const iss = []; const p = readMoney(st, q, 'pRev', iss); const c = readMoney(st, q, 'cRev', iss);
  const miss = ['pStart', 'pEnd', 'cStart', 'cEnd'].filter((k) => monthIndex(f[k]) === null).map((k) => label(q, k));
  if (p === null) miss.push(label(q, 'pRev')); if (c === null) miss.push(label(q, 'cRev'));
  if (miss.length || iss.length) return [incomplete('R-GROW-01', q, [...miss, ...iss])];
  const lp = monthsInclusive(f.pStart, f.pEnd), lc = monthsInclusive(f.cStart, f.cEnd); const u = cur(st, q);
  const inputs = { 전기: `${f.pStart}~${f.pEnd} (${lp}개월)`, 당기: `${f.cStart}~${f.cEnd} (${lc}개월)`, 통화: u };
  if (lp !== lc || lp <= 0) return [finding('R-GROW-01', q, 'blocked', { inputs, fact: ['전기와 당기의 기간 길이가 같지 않아 증감률을 계산하지 않았습니다.'] })];
  if (monthIndex(f.pEnd) >= monthIndex(f.cStart)) return [finding('R-GROW-01', q, 'blocked', { inputs, fact: ['전기 기간이 당기와 겹치거나 뒤에 있어 증감률을 계산하지 않았습니다.'] })];
  const g = growthPct(p, c);
  if (g === null) return [finding('R-GROW-01', q, 'blocked', { inputs, fact: ['전기 매출이 0 이하라 증감률을 계산하지 않았습니다.'] })];
  return [finding('R-GROW-01', q, 'calc', { inputs, calc: `(${fmtUnit(c, u)} − ${fmtUnit(p, u)}) ÷ ${fmtUnit(p, u)} × 100 = ${g > 0n ? '+' : ''}${fmtNum(g)}%`, fact: [`같은 길이(${lc}개월)의 전기 매출 ${fmtUnit(p, u)}, 당기 매출 ${fmtUnit(c, u)}의 과거 증감률은 ${g > 0n ? '+' : ''}${fmtNum(g)}%입니다. 이 값은 과거 실적 계산이며 사업 전망이 아닙니다.`], unconfirmed: `감사 상태: ${f.audit || '미입력'}` })];
}

function ruleCust(st) {
  const q = 'Q09'; const f = F(st, q);
  if (!hasAny(st, q, ['paid', 'free', 'total'])) return [];
  const iss = []; const paid = readCount(st, q, 'paid', iss); const free = readCount(st, q, 'free', iss); const total = readCount(st, q, 'total', iss);
  if (iss.length) return [incomplete('R-CUST-01', q, iss)];
  const inputs = { 기준일: f.asOf || '—', '겹침 없이 집계': f.exclusive ? '예' : '표시 안 함' };
  if (paid !== null && total !== null && paid > total) return [finding('R-CUST-01', q, 'mismatch', { inputs, fact: [`유료 고객 수(${fmtUnit(paid, '명')})가 전체 고객 수(${fmtUnit(total, '명')})보다 큽니다.`], request: '고객 수 집계 기준(중복 제거·기준일)을 확인해 주세요.' })];
  if (!f.exclusive) return [];
  const miss = [['paid', paid], ['free', free], ['total', total]].filter(([, v]) => v === null).map(([k]) => label(q, k));
  if (miss.length) return [incomplete('R-CUST-01', q, miss)];
  const calc = `${fmtUnit(paid, '명')} + ${fmtUnit(free, '명')} = ${fmtUnit(paid + free, '명')} / 전체 ${fmtUnit(total, '명')}`;
  if (paid + free === total) return [finding('R-CUST-01', q, 'match', { inputs, calc, fact: [`${f.asOf || '기준일 미입력'} 기준 유료·무료 고객 수의 합(${fmtUnit(total, '명')})이 전체 고객 수와 같습니다.`] })];
  return [finding('R-CUST-01', q, 'mismatch', { inputs, calc, fact: [`유료·무료 고객 수의 합은 ${fmtUnit(paid + free, '명')}, 전체 고객 수는 ${fmtUnit(total, '명')}입니다.`, `${fmtUnit(abs(paid + free - total), '명')} 차이의 원인은 확인되지 않았습니다.`], request: '집계표의 고객 정의와 중복 제거 기준을 확인해 주세요.' })];
}

function ruleRet(st) {
  const q = 'Q10'; const f = F(st, q);
  if (!hasAny(st, q, ['base', 'kept'])) return [];
  const iss = []; const base = readCount(st, q, 'base', iss); const kept = readCount(st, q, 'kept', iss);
  const miss = []; if (base === null) miss.push(label(q, 'base')); if (kept === null) miss.push(label(q, 'kept'));
  if (miss.length || iss.length) return [incomplete('R-RET-01', q, [...miss, ...iss])];
  const inputs = { 기간: `${f.start || '—'}~${f.end || '—'}` };
  if (base === 0n) return [finding('R-RET-01', q, 'blocked', { inputs, fact: ['분모(시작 시점 고객 수)가 0이라 비율을 계산하지 않았습니다.'] })];
  if (kept > base) return [finding('R-RET-01', q, 'mismatch', { inputs, fact: [`갱신·재구매 고객 수(${fmtUnit(kept, '명')})가 분모(${fmtUnit(base, '명')})보다 큽니다. 대상과 분모의 정의를 확인해야 합니다.`], request: '코호트 정의(같은 고객 집단인지)를 확인해 주세요.' })];
  const r = ratioPct(kept, base);
  return [finding('R-RET-01', q, 'calc', { inputs, calc: `${fmtUnit(kept, '명')} ÷ ${fmtUnit(base, '명')} × 100 = ${fmtNum(r)}%`, fact: [`${f.start || '—'}~${f.end || '—'} 동안 시작 시점 고객 ${fmtUnit(base, '명')} 중 갱신·재구매 고객은 ${fmtUnit(kept, '명')}입니다(${fmtNum(r)}%). 과거 기록이며 앞으로의 유지율이 아닙니다.`] })];
}

const DECK_SOURCES = {
  '매출(Q07 원장)': (st) => { const f = F(st, 'Q07'); const p = parseAmount(f.ledger); return { q: 'Q07', v: p && !p.err ? p.v : null, unit: cur(st, 'Q07'), period: f.start && f.end ? `${f.start}~${f.end}` : null }; },
  '고객 수(Q09)': (st) => { const f = F(st, 'Q09'); const p = parseCount(f.total); return { q: 'Q09', v: p && !p.err ? p.v : null, unit: '명', period: f.asOf || null }; },
  '현금 잔액(Q21)': (st) => { const f = F(st, 'Q21'); const p = parseAmount(f.total); return { q: 'Q21', v: p && !p.err ? p.v : null, unit: cur(st, 'Q21'), period: f.asOf || null }; },
};

function ruleDeck(st) {
  const q = 'Q23'; const rows = (F(st, q).rows || []); const out = [];
  rows.forEach((r, i) => {
    if (!Object.values(r).some((x) => String(x ?? '').trim())) return;
    const sfx = `-${i + 1}`; const name = r.label || r.metric || `${i + 1}번째 숫자`;
    const deck = parseAmount(r.deck); const dp = normPeriod(r.period);
    let src;
    if (DECK_SOURCES[r.metric]) src = DECK_SOURCES[r.metric](st);
    else { const p = parseAmount(r.src); src = { q: null, v: p && !p.err ? p.v : null, unit: r.unit, period: normPeriod(r.srcPeriod) ? r.srcPeriod : null }; }
    const refs = src.q ? [q, src.q] : [q];
    const inputs = { '덱 쪽': r.page || '미기록', '덱 기간': r.period || '—', '원자료 기간': src.period || '—', 단위: `${r.unit || '—'} / ${src.unit || '—'}` };
    const miss = [];
    if (!deck) miss.push('덱 숫자'); else if (deck.err) miss.push(`덱 숫자(${deck.err})`);
    if (!r.unit) miss.push('단위');
    if (src.v === null) miss.push(src.q ? `${src.q}의 원자료 숫자` : '원자료 숫자');
    if (miss.length) { out.push({ ...incomplete('R-DECK-01', q, miss, { refs, inputs }), id: `F-DECK01-Q23${sfx}`, title: `덱 숫자 대사 — ${name}` }); return; }
    const base = { suffix: sfx, refs, inputs, title: `덱 숫자 대사 — ${name}` };
    if (r.unit !== src.unit) { out.push(finding('R-DECK-01', q, 'blocked', { ...base, fact: [`덱 단위(${r.unit})와 원자료 단위(${src.unit})가 달라 비교하지 않았습니다. 통화·단위는 환산하지 않습니다.`] })); return; }
    const sp = normPeriod(src.period);
    if (!dp || !sp || dp !== sp) { out.push(finding('R-DECK-01', q, 'blocked', { ...base, fact: [`덱 기간(${r.period || '미입력'})과 원자료 기간(${src.period || '미입력'})이 같은 형식·범위로 확인되지 않아 비교하지 않았습니다.`], request: '덱 숫자의 기간을 원자료와 같은 형식(예: 2025-01~2025-12)으로 입력해 주세요.' })); return; }
    const d = deck.v - src.v; const calc = `덱 ${fmtUnit(deck.v, r.unit)} − 원자료 ${fmtUnit(src.v, r.unit)} = ${fmtUnit(d, r.unit)}`;
    if (d === 0n) { out.push(finding('R-DECK-01', q, 'match', { ...base, calc, fact: [`덱 ${r.page ? r.page + '쪽 ' : ''}"${name}" ${fmtUnit(deck.v, r.unit)}이 같은 기간(${dp}) 원자료와 같습니다.`] })); return; }
    out.push(finding('R-DECK-01', q, 'mismatch', { ...base, calc, fact: [`같은 기간(${dp}) 원자료${src.q ? `(${src.q})` : ''}는 ${fmtUnit(src.v, r.unit)}입니다. 덱 ${r.page ? r.page + '쪽' : ''}에는 ${fmtUnit(deck.v, r.unit)}이 기재되어 있습니다.`, `${fmtUnit(abs(d), r.unit)} 차이의 원인은 확인되지 않았습니다.`], unconfirmed: '차이의 원인', request: '숫자 정의(예: 매출 인식 기준)와 자료 기준일을 확인해 주세요.' }));
  });
  return out;
}

function ruleDates(st) {
  const base = st.meta?.baseDate; const out = [];
  for (const q of QUESTIONS) {
    if (!q.fields || !active(st, q.id)) continue;
    const f = F(st, q.id); const probs = [];
    for (const [a, b] of [['start', 'end'], ['pStart', 'pEnd'], ['cStart', 'cEnd']]) {
      if (f[a] && f[b] && String(f[a]) > String(f[b])) probs.push(`${label(q.id, a)}(${f[a]})이 ${label(q.id, b)}(${f[b]})보다 늦습니다.`);
    }
    if (isDate(base)) {
      for (const fd of q.fields) {
        const v = f[fd.k]; if (!v) continue;
        if (fd.type === 'date' && isDate(v) && v > base) probs.push(`${fd.label}(${v})이 보고서 기준일(${base}) 이후입니다.`);
        if (fd.type === 'month' && monthIndex(v) !== null && monthIndex(v) > monthIndex(base.slice(0, 7))) probs.push(`${fd.label}(${v})이 보고서 기준일(${base}) 이후입니다.`);
      }
    }
    if (probs.length) out.push(finding('R-DATE-01', q.id, 'mismatch', { title: '날짜·기간 확인 필요', fact: probs, request: '날짜를 다시 확인하거나 보고서 기준일을 조정해 주세요.' }));
  }
  return out;
}

/** 모든 규칙 실행 — 같은 입력이면 같은 결과(정렬 고정) */
export function runRules(st) {
  const all = [...ruleDates(st), ...ruleRev(st), ...ruleCust(st), ...ruleRet(st), ...ruleCap(st), ...ruleGrowth(st), ...ruleCash(st), ...ruleCash2(st), ...ruleCF(st), ...ruleDeck(st), ...ruleFund(st)];
  return all.sort((a, b) => (a.qid === b.qid ? a.id.localeCompare(b.id) : a.qid.localeCompare(b.qid)));
}

// ───────────────────────── 상태
export const DATA_LABEL = { none: '미제출', submitted: '제출됨(자가진술)', linked: '원문 연결 확인', match: '자료 간 일치', mismatch: '자료 간 불일치', na_ok: '적용 제외 승인', na_wait: '적용 제외 승인 대기' };
export const DATA_HELP = {
  none: '아직 답변이나 자료가 없어요.', submitted: '대표님이 입력한 내용이에요. 원문 자료는 아직 연결되지 않았어요.',
  linked: '자료와 문서 내 위치가 기록됐어요. 자료의 진위를 외부에서 확인한 것은 아니에요.',
  match: '비교한 자료·기간 안에서 숫자가 같아요.', mismatch: '비교한 자료 사이에 차이가 있어요. 원인은 판단하지 않아요.',
  na_ok: '사유와 검토자 승인이 기록됐어요.', na_wait: '컨설턴트(검토자)의 승인이 필요해요.',
};
export const REVIEW_LABEL = { none: '미검토', asked: '확인 요청', author: '작성자 확인', reviewer: '검토자 검토', approved: '대표 승인' };
export const RESULT_LABEL = { match: '일치', mismatch: '불일치·확인 필요', blocked: '비교하지 않음', incomplete: '입력 부족', calc: '계산 결과' };

function hasContent(a) {
  if ((a.text || '').trim()) return true;
  if ((a.links || []).length) return true;
  return Object.values(a.fields || {}).some((v) => (Array.isArray(v) ? v.some((r) => Object.values(r || {}).some((x) => String(x ?? '').trim())) : String(v ?? '').trim() !== '' && v !== false));
}

export function dataStatus(st, qid, findings) {
  const a = ansOf(st, qid); const s = a.status || 'answer';
  if (s === 'na') return a.naApproved ? 'na_ok' : 'na_wait';
  if (s !== 'answer' || !hasContent(a)) return 'none';
  const mine = findings.filter((f) => f.refs.includes(qid));
  if (mine.some((f) => f.result === 'mismatch')) return 'mismatch';
  const evIds = new Set((st.evidence || []).map((e) => e.id));
  const linked = (a.links || []).some((l) => evIds.has(l.eid) && String(l.loc || '').trim());
  if (linked && mine.some((f) => f.result === 'match')) return 'match';
  if (linked) return 'linked';
  return 'submitted';
}

export function evaluate(st) {
  const findings = runRules(st);
  const byQ = {};
  for (const q of QUESTIONS) byQ[q.id] = { data: dataStatus(st, q.id, findings), review: ansOf(st, q.id).review || 'none', findings: findings.filter((f) => f.refs.includes(q.id)) };
  const applicable = QUESTIONS.filter((q) => byQ[q.id].data !== 'na_ok');
  const progress = {
    applicable: applicable.length,
    submitted: applicable.filter((q) => !['none', 'na_wait'].includes(byQ[q.id].data)).length,
    reviewed: applicable.filter((q) => ['reviewer', 'approved'].includes(byQ[q.id].review)).length,
  };
  return { findings, byQ, progress, todo: buildTodo(st, byQ, findings) };
}

// '지금 확인할 항목' — 정해진 순서(불일치 → 확인 요청 → 재검토 → 제외 승인 대기 → 입력 부족 → 비교 불가 → 담당자 요청 → 미제출). 위험도 순위가 아님.
export const TODO_ORDER = ['mismatch', 'asked', 'suggest', 'stale', 'na_wait', 'incomplete', 'blocked', 'request', 'none'];
export const TODO_LABEL = { mismatch: '자료 간 차이 확인', asked: '확인 요청 답변', suggest: '수정 제안 응답', stale: '변경 후 재검토', na_wait: '적용 제외 승인', incomplete: '입력 보완', blocked: '비교 조건 맞추기', request: '담당자 자료 요청 중', none: '자료 제출' };
function buildTodo(st, byQ, findings) {
  const items = [];
  for (const f of findings) {
    if (f.result === 'mismatch') items.push({ type: 'mismatch', qid: f.qid, text: f.fact.join(' '), fid: f.id });
    if (f.result === 'incomplete') items.push({ type: 'incomplete', qid: f.qid, text: f.fact.join(' '), fid: f.id });
    if (f.result === 'blocked') items.push({ type: 'blocked', qid: f.qid, text: f.fact.join(' '), fid: f.id });
  }
  for (const q of QUESTIONS) {
    const a = ansOf(st, q.id); const b = byQ[q.id];
    if (b.review === 'asked') items.push({ type: 'asked', qid: q.id, text: a.askNote || '컨설턴트가 확인을 요청했어요.' });
    if ((a.suggestions || []).some((s) => s.status === 'open')) items.push({ type: 'suggest', qid: q.id, text: '컨설턴트 수정 제안이 있어요.' });
    if (a.stale) items.push({ type: 'stale', qid: q.id, text: a.staleNote || '검토 후 내용이 바뀌어 다시 검토가 필요해요.' });
    if (b.data === 'na_wait') items.push({ type: 'na_wait', qid: q.id, text: `적용 제외 사유: ${a.naReason || '(사유 미입력)'}` });
    if ((a.status || 'answer') === 'request') items.push({ type: 'request', qid: q.id, text: `${a.reqTo || '담당자 미지정'}${a.reqDue ? ` · 기한 ${a.reqDue}${st.today && a.reqDue < st.today ? ' (기한 지남)' : ''}` : ''}` });
    else if (b.data === 'none') items.push({ type: 'none', qid: q.id, text: (a.status === 'unknown') ? '"아직 몰라요"로 표시됨' : '답변·자료가 없어요.' });
  }
  return items.sort((x, y) => TODO_ORDER.indexOf(x.type) - TODO_ORDER.indexOf(y.type) || x.qid.localeCompare(y.qid));
}

// ───────────────────────── 스냅샷 해시
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
export async function sha256Hex(input) {
  const buf = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const d = await globalThis.crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
