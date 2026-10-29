// ============================================================================
// 공고 본문 규칙 추출(AI 없이) — "창업 7년 이내", "상시근로자 10인 미만", "매출액 10억원 이하",
// "대표자 만 39세 이하" 같은 정형 문구를 패턴으로 읽어 자격조건 숫자로 바꾼다.
// 원칙
// - 근거 문구를 함께 저장(_ruleEvidence)해 화면에 그대로 보여 준다.
// - '우대·가점' 문맥은 필수 조건이 아니므로 버린다.
// - 같은 항목에 서로 다른 값이 나오면(예: 일반 7년·신산업 10년) 단정하지 않고 버린다.
// - 대표자 연령은 대표·창업자·신청자·청년 문맥일 때만(고령 근로자 채용 조건 '만 60세 이상' 오인 방지).
// - 이미 정형값이 있으면(K-Startup 업력 등) 덮어쓰지 않는다.
// - 선택지·우대 문맥은 필수 조건이 아니므로 버린다(검증 세트 오류 3건, docs/ACCURACY_2026-10-28.md):
//   · '아래 하나에 해당'처럼 여러 요건 중 하나만 충족하면 되는 목록 안의 숫자
//   · '창업 5년이내 기업(3%)'처럼 지원율 가산(%) 항목
//   · '기술창업기업(업력 7년미만), 중소벤처기업, …'처럼 나열된 유형 정의 괄호 안의 숫자
// ============================================================================

const PREF = /우대|가점|가산점|가산|추가\s*지원|우선\s*지원|우선\s*선정/;
// 여러 요건 중 하나만 충족하면 되는 목록의 머리말(앞 400자 안에 있으면 그 목록의 숫자는 필수 아님)
const ALT_HEAD = /(?:다음|아래)\s*(?:각\s*호\s*)?중\s*(?:어느\s*)?(?:하나|1개|한\s*가지)|하나\s*이상(?:을|에)?\s*(?:충족|해당)|(?:어느\s*)?하나에\s*해당|중\s*(?:택\s*)?1\s*(?:개|가지)?\s*이상/;
// 구간표(평가 점수표·지원율 구간표)의 표지: 'N점', 'N% 지원/할인', 범위 '~'
const TIER_MARK = /\d+\s*점(?![가-힣])|\d+(?:\.\d+)?\s*%\s*(?:지원|할인)|\d\s*[~∼]\s*\d|[이상|초과]\s*[~∼]/;
const THRESH = /\d+(?:\.\d+)?\s*(?:억|천만|인|명|년|세)\s*원?\s*(?:이상|이하|미만|초과)/g;
// 목록이 끝났다고 볼 경계(다음 큰 항목 시작)
const SECTION_BREAK = /(?:^|\s)(?:\d{1,2}\s*[.)]|[가-하]\s*[.)]|[□■◆◇◼])\s*\S/;

function inAltList(text, idx) {
  const from = Math.max(0, idx - 400);
  const before = text.slice(from, idx);
  const m = [...before.matchAll(new RegExp(ALT_HEAD.source, 'g'))].pop();
  if (!m) return false;
  // 머리말 뒤에 새 큰 항목(번호·□)이 시작됐으면 목록은 끝난 것
  return !SECTION_BREAK.test(before.slice(m.index + m[0].length));
}

// '○○기업(업력 7년미만), △△기업, …' 나열 속 괄호 정의
function inListedParen(text, idx, len) {
  const open = text.lastIndexOf('(', idx), close = text.lastIndexOf(')', idx);
  if (open < 0 || open < close || idx - open > 12) return false;
  const end = text.indexOf(')', idx + len);
  if (end < 0 || end - idx > 20) return false;
  return /^\s*[,，·]/.test(text.slice(end + 1, end + 4));
}
const CLAUSE_SPLIT = /[.;·•\n]|\s-\s|※|○|◦|▶/;

function clauseAround(text, idx, len) {
  // 일치 위치가 속한 구절(앞뒤 구분자 사이)
  let a = idx, b = idx + len;
  while (a > 0 && !CLAUSE_SPLIT.test(text[a - 1])) a--;
  while (b < text.length && !CLAUSE_SPLIT.test(text[b])) b++;
  return text.slice(a, b).trim();
}

// 2차 검증 세트(처음 보는 공고)에서 찾은 오인 유형 — 일반 규칙으로 걸러낸다
function notACondition(text, idx, len) {
  const end = idx + len;
  const after = text.slice(end, end + 18);
  // 제외 문맥: '업력 10년 이상 기업 제외', '(업력 1년 미만, … 심사 제외)'
  if (/^[^.;○◦]{0,12}(?:제외|불가|면제)/.test(after)) return true;
  const open = text.lastIndexOf('(', idx), close = text.lastIndexOf(')', idx);
  if (open > close && idx - open < 20) {
    const inner = text.slice(open, text.indexOf(')', end) + 1 || end + 30);
    if (/제외|면제|예외/.test(inner)) return true;
  }
  // 특정 업종에만 붙은 기준: '※ 도·소매업, 음식업, 숙박업: 상시 종업원수 5인 이상 업체'
  if (/[가-힣]+업\s*[,，·‧]\s*(?:[가-힣]+업\s*[,，·‧]\s*)*[가-힣]+업\s*[:：][^.;○◦]{0,30}$/.test(text.slice(Math.max(0, idx - 60), idx))) return true;
  // 업종별로 다른 기준: '5인 미만(제조·건설 10인 미만)'
  if (/^\s*\(\s*[^)]{0,30}\d+\s*(?:인|명)\s*(?:미만|이하|이상)/.test(text.slice(end, end + 40))) return true;
  // 구간표: 같은 종류의 기준값이 둘 이상 더 있고 점수·지원율·범위 표지가 함께 있음
  const win = text.slice(Math.max(0, idx - 60), end + 80);
  if ((win.match(THRESH) || []).length >= 3 && TIER_MARK.test(win)) return true;
  return false;
}

function collect(text, re, toValue, { ctx, notCtx } = {}) {
  const found = [];
  for (const m of text.matchAll(re)) {
    const clause = clauseAround(text, m.index, m[0].length);
    if (PREF.test(clause)) continue;
    if (notACondition(text, m.index, m[0].length)) continue;
    // 지원율 가산 항목: '창업 5년이내 기업(3%)'
    if (/^\s*(?:인\s*)?(?:기업|업체|사업자)?\s*\(\s*\d+(?:\.\d+)?\s*%/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 14))) continue;
    if (inAltList(text, m.index) || inListedParen(text, m.index, m[0].length)) continue;
    // 문맥은 같은 항목(쉼표·글머리표 사이) 안에서만 본다: '상시근로자 50인 미만, 대표자 만 39세 이하'에서 근로자는 다른 항목
    const near = text.slice(Math.max(0, m.index - 20), m.index).split(/[,，○ㅇ◦·•-]/).pop();
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (ctx && !ctx.test(near + m[0] + tail)) continue;
    if (notCtx && notCtx.test(near + m[0] + tail)) continue;
    const v = toValue(m);
    if (v) found.push({ ...v, evidence: m[0].replace(/\s+/g, ' ').trim() });
  }
  return found;
}

/** 같은 키에 값이 하나로 모일 때만 채택 */
function agree(list, key) {
  const vals = [...new Set(list.filter((x) => x[key] != null).map((x) => x[key]))];
  if (vals.length !== 1) return null;
  const hit = list.find((x) => x[key] === vals[0]);
  return { value: vals[0], evidence: hit.evidence, exclusive: !!hit.exclusive };
}

export function extractRules(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ');
  if (text.length < 10) return null;
  const out = {};
  const ev = {};

  // 업력: 창업·업력·설립 (후) N년 이내/미만/이하 · 이상/초과
  // '사업 개시 3년 미만', '사업개시일로부터 7년 이내'도 업력. 'N개월'은 연 단위로 판정할 수 없어 같은 항목을 보류
  const age = [
    ...collect(text, /(?:창업|업력|설립|사업\s*개시(?:일)?|개업)\s*(?:후|일로부터|로부터|한\s*지)?\s*(\d{1,2})\s*(년|개월)\s*(이내|미만|이하|이상|초과)/g, (m) => {
      const n = +m[1];
      if (m[2] === '개월') return m[3] === '이상' || m[3] === '초과' ? { min: -1 } : { max: -1 };
      if (n < 1 || n > 30) return null;
      if (m[3] === '이상') return { min: n };
      if (m[3] === '초과') return { min: n + 1 };
      return { max: n, exclusive: m[3] === '미만' };
    }),
    ...collect(text, /(\d{1,2})\s*년\s*이상\s*(?:사업을|기업을)\s*(?:운영|영위)/g, (m) => (+m[1] >= 1 && +m[1] <= 30 ? { min: +m[1] } : null)),
  ];
  const aMax = agree(age, 'max'), aMin = agree(age, 'min');
  if (aMax && aMax.value < 0) aMax.value = null;
  if (aMin && aMin.value < 0) aMin.value = null;
  if (aMax?.value != null) { out.businessAgeMax = aMax.value; out.businessAgeMaxExclusive = aMax.exclusive; ev.businessAgeMax = aMax.evidence; }
  if (aMin?.value != null) { out.businessAgeMin = aMin.value; ev.businessAgeMin = aMin.evidence; }

  // 상시근로자
  const NUMS = '(\\d{1,3}(?:,\\d{3})+|\\d{1,4})';
  const empVal = (n, op) => (op === '이하' ? { max: n } : op === '미만' ? { max: n - 1 } : op === '이상' ? { min: n } : { min: n + 1 });
  const num = (x) => +String(x).replace(/,/g, '');
  const WORKER = '(?:상시\\s*근로자|상시\\s*종업원|종업원|(?:고용보험\\s*)?피보험자)\\s*(?:수)?\\s*(?:가|는)?\\s*';
  const emp = [
    ...collect(text, new RegExp(`${WORKER}${NUMS}\\s*(?:인|명)\\s*(이하|미만|이상|초과)`, 'g'), (m) => empVal(num(m[1]), m[2])),
    // '상시근로자 5인 이상 300인 미만'의 두 번째 경계
    ...collect(text, new RegExp(`${WORKER}${NUMS}\\s*(?:인|명)\\s*(?:이상|초과)\\s*[~∼]?\\s*${NUMS}\\s*(?:인|명)\\s*(이하|미만)`, 'g'), (m) => empVal(num(m[2]), m[3])),
    // 규모로 정한 대상: '50인 미만 중소사업장', '1,000인 이상 의무대상기업'
    ...collect(text, new RegExp(`(?<![\\d,])${NUMS}\\s*(?:인|명)\\s*(이하|미만|이상|초과)\\s*(?:의\\s*)?(?:중소\\s*)?(?:사업장|기업|업체|사업자|소기업|의무대상기업)`, 'g'), (m) => empVal(num(m[1]), m[2])),
    ...collect(text, /(?:상시\s*)?근로자가\s*없는\s*1인/g, () => ({ max: 0 })),
  ];
  const eMax = agree(emp, 'max'), eMin = agree(emp, 'min');
  if (eMax && eMax.value >= 0) { out.employeeMax = eMax.value; ev.employeeMax = eMax.evidence; }
  if (eMin) { out.employeeMin = eMin.value; ev.employeeMin = eMin.evidence; }

  // 매출(연매출·매출액): N억 / N천만 원
  const rev = collect(text, /(?:연\s*)?매출(?:액)?\s*(?:이|은|규모)?\s*(?:가)?\s*(\d+(?:\.\d+)?)\s*(억|천만)\s*원?\s*(이하|미만|이상|초과)/g, (m) => {
    const won = Math.round(parseFloat(m[1]) * (m[2] === '억' ? 1e8 : 1e7));
    if (m[3] === '이하' || m[3] === '미만') return { max: won };
    return { min: won };
  });
  const rMax = agree(rev, 'max'), rMin = agree(rev, 'min');
  if (rMax) { out.revenueMax = rMax.value; ev.revenueMax = rMax.evidence; }
  if (rMin) { out.revenueMin = rMin.value; ev.revenueMin = rMin.evidence; }

  // 대표자 연령: 대표·창업자·신청자·청년 문맥만
  const REP_CTX = { ctx: /대표|창업|신청자|청년/, notCtx: /근로자|고령자|채용|직원|인력|구직|취업|참여자|학생/ };
  const rep = [
    ...collect(text, /만\s*(\d{2})\s*세\s*(이하|미만|이상)/g, (m) => {
      const n = +m[1];
      if (m[2] === '이하') return { max: n };
      if (m[2] === '미만') return { max: n - 1 };
      return n >= 20 ? { min: n } : null; // '만 19세 이상'은 성인 일반 조건이라 판정에 쓰지 않음
    }, REP_CTX),
    // 범위: '18~39세 이하의 청년이 대표', '청년농업인(만18~39세)이 대표'
    ...collect(text, /(?:만\s*)?(\d{2})\s*세?\s*[~∼]\s*(?:만\s*)?(\d{2})\s*세/g, (m) => ({ max: +m[2], ...(+m[1] >= 20 ? { min: +m[1] } : {}) }), REP_CTX),
  ];
  const pMax = agree(rep, 'max'), pMin = agree(rep, 'min');
  if (pMax && pMax.value >= 19 && pMax.value <= 70) { out.representativeAgeMax = pMax.value; ev.representativeAgeMax = pMax.evidence; }
  if (pMin && pMin.value <= 80) { out.representativeAgeMin = pMin.value; ev.representativeAgeMin = pMin.evidence; }

  return Object.keys(out).length ? { fields: out, evidence: ev } : null;
}

/** 규칙 추출값을 program에 병합. 이미 값이 있는 항목은 그대로 둔다. */
export function applyRules(program) {
  const r = extractRules(program.rawSummary || program.supportDescription);
  if (!r) return program;
  const out = { ...program };
  const kept = {};
  for (const [k, v] of Object.entries(r.fields)) {
    if (k === 'businessAgeMaxExclusive') continue;
    if (out[k] != null) continue;
    out[k] = v;
    if (k === 'businessAgeMax') out.businessAgeMaxExclusive = r.fields.businessAgeMaxExclusive;
    kept[k] = r.evidence[k];
  }
  if (!Object.keys(kept).length) return program;
  out._ruleEvidence = kept;
  if (out.eligibilityDepth === 'listing') out.eligibilityDepth = 'rule';
  return out;
}
