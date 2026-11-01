// 재무 — 표준재무제표증명(홈택스) 텍스트에서 주요 계정을 읽고, 지표·참고 구간·응답 교차 확인을 만든다.
// 파일은 브라우저 안에서만 읽는다(서버 전송 없음). 추출값은 사용자가 확인·수정한 뒤 반영한다.
// 참고 구간은 일반적으로 쓰이는 참고선이며 업종별 차이가 크다(공식 기준 아님).

export const ACCOUNTS = [
  { k: 'rev', label: '매출액', alt: ['매출액', '영업수익', '수익(매출액)'] },
  { k: 'cogs', label: '매출원가', alt: ['매출원가', '영업비용'] },
  { k: 'op', label: '영업이익', alt: ['영업이익(손실)', '영업이익', '영업손실'], lossAlt: ['영업손실'] },
  { k: 'net', label: '당기순이익', alt: ['당기순이익(손실)', '당기순이익', '당기순손실'], lossAlt: ['당기순손실'] },
  { k: 'assets', label: '자산총계', alt: ['자산총계'] },
  { k: 'liab', label: '부채총계', alt: ['부채총계'] },
  { k: 'equity', label: '자본총계', alt: ['자본총계'] },
  { k: 'capital', label: '자본금', alt: ['자본금'] },
  { k: 'ca', label: '유동자산', alt: ['유동자산'] },
  { k: 'cl', label: '유동부채', alt: ['유동부채'] },
  { k: 'cash', label: '현금및현금성자산', alt: ['현금및현금성자산', '현금및현금등가물', '현금및예금'] },
];
export const AMAP = Object.fromEntries(ACCOUNTS.map((a) => [a.k, a]));
export const CORE = ['rev', 'op', 'net', 'assets', 'liab', 'equity'];

const norm = (s) => String(s).replace(/\s+/g, '').replace(/^\d+(?=[^\d,])/, '').replace(/^[(（]?[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX0-9]+[.)）]\s*/, '').replace(/^[·\-•]/, '');
const AMT = /[(（△▲-]?\d{1,3}(?:,\d{3})+[)）]?|[(（△▲-]?\b\d{1,3}\b[)）]?/g;
function toNum(tok) {
  const neg = /^[(（△▲-]/.test(tok) || /[)）]$/.test(tok);
  const v = Number(tok.replace(/[^\d]/g, ''));
  return neg ? -v : v;
}

/** 문서 텍스트 줄 → { cur, prev, found, unit, years } */
export function parseStatements(lines) {
  const text = lines.join('\n');
  const unit = /단위\s*[:：]?\s*천\s*원/.test(text) ? 1000 : /단위\s*[:：]?\s*백만\s*원/.test(text) ? 1000000 : 1;
  const years = [...new Set([...text.matchAll(/(20\d{2})\s*년\s*0?1\s*월\s*0?1\s*일/g)].map((m) => m[1]))];
  const cur = {}; const prev = {}; const found = {};
  for (const a of ACCOUNTS) {
    for (const line of lines) {
      const n = norm(line);
      const hit = a.alt.find((x) => n.startsWith(x));
      if (!hit) continue;
      // 계정명(글자 사이 공백 허용) 뒤에 오는 금액만 사용 — 앞쪽 코드 번호 제외
      const re = new RegExp(hit.split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'));
      const m = re.exec(line); if (!m) continue;
      const tailTxt = line.slice(m.index + m[0].length).replace(/([(（△▲-])\s+(?=\d)/g, '$1').replace(/(\d)\s+([)）])/g, '$1$2');
      const nums = (tailTxt.match(AMT) || []).map(toNum);
      if (!nums.length) continue;
      const loss = (a.lossAlt || []).includes(hit); // '영업손실'처럼 손실 계정명이면 양수도 손실로
      const val = (x) => (loss && x > 0 ? -x : x) * unit;
      cur[a.k] = val(nums[0]);
      if (nums.length > 1) prev[a.k] = val(nums[1]);
      found[a.k] = hit;
      break;
    }
  }
  return { cur, prev, found, unit, years };
}

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

/** 지표 + 참고 구간(일반 참고선, 업종별 차이 큼) */
export function indicators(fin) {
  const c = fin?.cur || {}; const p = fin?.prev || {}; const out = [];
  const has = (o, k) => typeof o[k] === 'number' && !Number.isNaN(o[k]);
  if (has(c, 'rev') && has(p, 'rev') && p.rev > 0) {
    const v = pct(c.rev - p.rev, p.rev);
    out.push({ k: 'growth', label: '매출 성장률', value: v, unit: '%', band: v >= 0 ? 'good' : 'warn', formula: '(당기 매출 - 전기 매출) ÷ 전기 매출', note: '과거 실적이며 전망이 아니에요' });
  }
  if (has(c, 'rev') && has(c, 'op') && c.rev > 0) { const v = pct(c.op, c.rev); out.push({ k: 'opm', label: '영업이익률', value: v, unit: '%', band: v >= 10 ? 'good' : v >= 0 ? 'mid' : 'warn', formula: '영업이익 ÷ 매출액', note: '참고: 10% 이상 양호 · 0% 미만 적자' }); }
  if (has(c, 'rev') && has(c, 'net') && c.rev > 0) { const v = pct(c.net, c.rev); out.push({ k: 'npm', label: '순이익률', value: v, unit: '%', band: v >= 5 ? 'good' : v >= 0 ? 'mid' : 'warn', formula: '당기순이익 ÷ 매출액', note: '참고: 0% 미만은 순손실' }); }
  if (has(c, 'liab') && has(c, 'equity')) {
    if (c.equity > 0) { const v = pct(c.liab, c.equity); out.push({ k: 'debt', label: '부채비율', value: v, unit: '%', band: v <= 100 ? 'good' : v <= 200 ? 'mid' : 'warn', formula: '부채총계 ÷ 자본총계', note: '참고: 100% 이하 양호 · 200% 초과 주의' }); }
    else out.push({ k: 'debt', label: '부채비율', value: null, unit: '', band: 'warn', formula: '부채총계 ÷ 자본총계', note: '자본총계가 0 이하(완전 자본잠식)라 계산하지 않아요' });
  }
  if (has(c, 'ca') && has(c, 'cl') && c.cl > 0) { const v = pct(c.ca, c.cl); out.push({ k: 'current', label: '유동비율', value: v, unit: '%', band: v >= 150 ? 'good' : v >= 100 ? 'mid' : 'warn', formula: '유동자산 ÷ 유동부채', note: '참고: 150% 이상 양호 · 100% 미만 주의' }); }
  if (has(c, 'equity') && has(c, 'capital') && c.capital > 0) {
    const st = c.equity <= 0 ? '완전 자본잠식' : c.equity < c.capital ? '부분 자본잠식' : '자본잠식 없음';
    out.push({ k: 'impair', label: '자본잠식', value: null, text: st, unit: '', band: st === '자본잠식 없음' ? 'good' : 'warn', formula: '자본총계와 자본금 비교', note: '자본총계 < 자본금이면 부분 잠식' });
  }
  return out;
}

/** 재무제표 내부 점검(자산 = 부채 + 자본) */
export function balanceCheck(fin) {
  const c = fin?.cur || {};
  if ([c.assets, c.liab, c.equity].some((x) => typeof x !== 'number')) return null;
  const diff = c.assets - (c.liab + c.equity);
  return { ok: Math.abs(diff) <= 1, diff };
}
