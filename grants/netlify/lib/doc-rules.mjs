// ============================================================================
// 공고문(PDF) 분석 — 기업마당 '본문출력 파일'(printFlpthNm)의 텍스트에서
// '신청자격·지원대상' 절만 잘라 기존 규칙 추출(rule-extract)을 적용한다.
// 원칙
// - 자격 절만 본다(평가 방법·심사위원·제외 대상 절의 숫자를 자격으로 오인하지 않게).
// - '제외·제한' 절은 뜻이 반대라 숫자 규칙에 쓰지 않는다.
// - 근거 문구는 '공고문:' 접두로 보여 준다.
// - 요약문에서 이미 정한 값은 덮어쓰지 않는다.
// ============================================================================
import { extractRules } from './rule-extract.mjs';
import { extractAmount, regionsFromText, CITIES, GUS } from './normalize.mjs';

const BULLET = '(?:\\d{1,2}\\s*[.)]|[가-하]\\s*[.)]|\\(\\s*\\d{1,2}\\s*\\)|[①-⑳]|[Ⅰ-Ⅹ]\\s*\\.?|[□■◆◇●▶◼]|[○◦ㅇ]\\s)';
// 자격 관련 제목(번호·기호로 시작하는 짧은 줄)
const HEAD = new RegExp(`^\\s*${BULLET}?\\s*([^\\n]{0,30})$`);
const ELIG = /(신청|지원|참여|모집|사업|선정)?\s*(자격|대상)(?!\s*(?:사업|기간|품목|분야|과제|경비|비용))|자격\s*요건|신청\s*요건/;
const NOT_ELIG = /제외|제한|불가|평가|심사|선정\s*(?:방법|절차|기준)|추진\s*절차|일정|문의|제출\s*서류|유의/;
const SUPPORT = /지원\s*(?:내용|규모|금액|한도|조건)|사업\s*규모|지원\s*사항/;
// 큰 제목: '1. 개요', 'Ⅰ. 개요', '□ 지원대상', 번호 상자만 글자로 남은 '1 공모개요', 사용자 정의 글리프(PDF 기호 글꼴)
const MAJOR = new RegExp(`^\\s*(?:\\d{1,2}\\s*[.)]|\\d{1,2}\\s+(?=[가-힣])|[Ⅰ-Ⅹ]\\s*\\.?|[□■◆◇◼\\uE000-\\uF8FF])\\s*\\S`);
// 글머리 줄: '❍ 지원대상 : …', 'ㅇ (응모자격) …', 'm 신청자격' (m·o는 PDF 기호 글꼴이 글자로 바뀐 것)
const ITEM = /^\s*(?:[○❍ㅇ◦•▪◎●▶□■◆◇◼\uE000-\uF8FF]|[mo](?=\s))\s*/;
const LABEL = /^(?:신청|지원|참여|모집|응모|참가|사업|선정)?(?:자격|대상)(?:요건|기업|자)?$|^(?:신청|참여)요건$/;

/** 텍스트를 '제목 → 본문' 절로 나눈다. 제목은 번호·기호로 시작하는 짧은 줄 */
export function sections(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  let cur = null;
  for (const line of lines) {
    const isHead = line.length <= 40 && MAJOR.test(line) && HEAD.test(line);
    if (isHead) { cur = { head: line, body: [] }; out.push(cur); }
    else if (cur) cur.body.push(line);
  }
  return out.map((s) => ({ head: s.head, body: s.body.join('\n').slice(0, 3000) }));
}

/** 라벨 붙은 글머리 줄과 이어지는 줄('-', '*', '(' 로 시작하거나 기호 없는 줄, 최대 6줄) */
export function labeledItems(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const rest = lines[i].replace(ITEM, '');
    const m = rest.match(/^\(\s*([^)]{1,16})\)\s*(.*)$/) || rest.match(/^([가-힣][가-힣\s]{0,14}?)\s*[:：]\s*(.*)$/) || rest.match(/^([가-힣][가-힣\s]{1,14})()$/);
    if (!m || !LABEL.test(m[1].replace(/\s/g, ''))) continue;
    const body = m[2] ? [m[2]] : [];
    for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
      if (ITEM.test(lines[j]) || MAJOR.test(lines[j]) || /^-\s*\d+\s*-$/.test(lines[j])) break;
      body.push(lines[j]);
    }
    if (body.length) out.push(body.join('\n'));
  }
  return out;
}

function eligText(text) {
  const secs = sections(text);
  const picked = secs.filter((s) => ELIG.test(s.head) && !NOT_ELIG.test(s.head)).slice(0, 3).map((s) => s.body);
  const items = labeledItems(text).filter((b) => !picked.some((x) => x.includes(b.slice(0, 40))));
  return [...picked, ...items.slice(0, 4)].join('\n');
}

// 자격 문구의 소재 시·도: '충북 소재', '강원특별자치도 내에 본사', '본사가 전남광주통합특별시 내 舊 전라남도 지역에 소재'
const LOC = /소재|본사|주\s*사업장|사업장|주소지|거주/g;
const OLD_DO = /(?:舊|구)\s*(충청북도|충청남도|전라북도|전라남도|경상북도|경상남도)/;
function sidosIn(elig) {
  for (const line of String(elig || '').split('\n')) {
    for (const m of line.matchAll(LOC)) {
      const win = line.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
      if (/제외|아닌|이외|외\s*지역|제한\s*없/.test(win)) continue;
      const old = win.match(OLD_DO);
      const r = regionsFromText(old ? old[1] : win);
      if (r && !r.includes('전국') && r.length <= 3) return { regions: r, evidence: win.trim() };
    }
  }
  return null;
}

// 예비창업자 허용: 자격 문구에 '예비창업자'가 있고 같은 구절에 제외·불가가 없을 때
function preStartupIn(elig, text) {
  if (/예비\s*창업자?[^.\n]{0,12}(?:제외|불가|신청할\s*수\s*없)/.test(text)) return { allowed: false, evidence: text.match(/예비\s*창업자?[^.\n]{0,12}(?:제외|불가|신청할\s*수\s*없)/)[0] };
  const m = String(elig || '').match(/[^\n]{0,24}예비\s*창업자[^\n]{0,12}/);
  if (m && !/제외|불가/.test(m[0])) return { allowed: true, evidence: m[0].trim() };
  return null;
}
function supportText(text) {
  return sections(text).filter((s) => SUPPORT.test(s.head)).slice(0, 2).map((s) => s.body).join('\n');
}

// 자격 절 안의 "○○구 소재", "○○시에 본사" 표현
function districtsIn(text, regions) {
  const s = String(text || '');
  const names = [];
  const sidos = (regions || []).filter((r) => r !== '전국');
  for (const sido of sidos) {
    for (const name of [...(CITIES[sido] || []), ...(GUS[sido] || [])]) {
      const re = new RegExp(`(?<![가-힣])${name}\\s*(?:내|에)?\\s*(?:소재|본사|주\\s*사업장|사업장|주소|거주)`);
      if (re.test(s)) names.push(name);
    }
  }
  return [...new Set(names)];
}

/** 공고문 텍스트 분석 결과(캐시에 저장되는 형태) */
export function analyzeDocText(text, { regions = null } = {}) {
  const elig = eligText(text);
  const out = { textLen: String(text || '').length, sectionFound: !!elig };
  if (elig) {
    const r = extractRules(elig);
    if (r) { out.fields = r.fields; out.evidence = r.evidence; }
    const sido = sidosIn(elig);
    if (sido) { out.regions = sido.regions; out.regionEvidence = sido.evidence; }
    const pre = preStartupIn(elig, text);
    if (pre) { out.preStartupAllowed = pre.allowed; out.preStartupEvidence = pre.evidence; }
    const known = (regions || []).filter((r) => r !== '전국');
    const d = districtsIn(elig, known.length ? known : sido?.regions);
    if (d.length) { out.districts = d; out.districtEvidence = d.map((n) => `${n} 소재`).join(', '); }
  }
  const sup = supportText(text);
  if (sup) {
    const a = extractAmount(sup);
    if (a.max) { out.amount = a.max; out.amountText = a.text; }
  }
  return out;
}

/** 캐시된 공고문 분석을 program에 병합(요약문에서 정한 값은 유지) */
export function applyDoc(p, doc) {
  if (!doc || doc.status !== 'ok') return p;
  const q = { ...p };
  const ev = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    if (k === 'businessAgeMaxExclusive' || q[k] != null) continue;
    q[k] = v;
    if (k === 'businessAgeMax') q.businessAgeMaxExclusive = !!doc.fields.businessAgeMaxExclusive;
    ev[k] = `공고문: ${doc.evidence?.[k] || ''}`.trim();
  }
  // 목록에 지역 표기가 없어 '전국'으로 간주한 공고만 공고문의 소재 시·도로 바로잡는다
  if (doc.regions?.length && q.targetRegionsInferred) {
    q.targetRegions = doc.regions;
    q.targetRegionsInferred = false;
    ev.targetRegions = `공고문: ${doc.regionEvidence}`;
  }
  if (doc.preStartupAllowed != null && q.preStartupAllowed == null && !q.preStartupOnly) {
    q.preStartupAllowed = doc.preStartupAllowed;
    if (doc.preStartupAllowed && !(q.targetBusinessType || []).includes('예비창업자')) q.targetBusinessType = [...(q.targetBusinessType || []), '예비창업자'];
    ev.preStartupAllowed = `공고문: ${doc.preStartupEvidence}`;
  }
  if (doc.districts?.length && !(q.targetDistricts || []).length && (q.targetRegions || []).some((r) => r !== '전국')) {
    q.targetDistricts = doc.districts;
    ev.targetDistricts = `공고문: ${doc.districtEvidence}`;
  }
  if (doc.amount && q.supportAmountMax == null) { q.supportAmountMax = doc.amount; q.supportAmountText = doc.amountText; ev.supportAmountMax = `공고문: ${doc.amountText}`; }
  if (!Object.keys(ev).length) return q;
  q._docEvidence = ev;
  if (q.eligibilityDepth === 'listing' || q.eligibilityDepth === 'rule') q.eligibilityDepth = 'doc';
  return q;
}
