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
import { extractAmount, CITIES, GUS } from './normalize.mjs';

const BULLET = '(?:\\d{1,2}\\s*[.)]|[가-하]\\s*[.)]|\\(\\s*\\d{1,2}\\s*\\)|[①-⑳]|[Ⅰ-Ⅹ]\\s*\\.?|[□■◆◇●▶◼]|[○◦ㅇ]\\s)';
// 자격 관련 제목(번호·기호로 시작하는 짧은 줄)
const HEAD = new RegExp(`^\\s*${BULLET}?\\s*([^\\n]{0,30})$`);
const ELIG = /(신청|지원|참여|모집|사업|선정)?\s*(자격|대상)(?!\s*(?:사업|기간|품목|분야|과제|경비|비용))|자격\s*요건|신청\s*요건/;
const NOT_ELIG = /제외|제한|불가|평가|심사|선정\s*(?:방법|절차|기준)|추진\s*절차|일정|문의|제출\s*서류|유의/;
const SUPPORT = /지원\s*(?:내용|규모|금액|한도|조건)|사업\s*규모|지원\s*사항/;
const MAJOR = new RegExp(`^\\s*(?:\\d{1,2}\\s*[.)]|[Ⅰ-Ⅹ]\\s*\\.?|[□■◆◇◼])\\s*\\S`);

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

function eligText(text) {
  const secs = sections(text);
  const picked = secs.filter((s) => ELIG.test(s.head) && !NOT_ELIG.test(s.head));
  return picked.slice(0, 3).map((s) => s.body).join('\n');
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
    const d = districtsIn(elig, regions);
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
  if (doc.districts?.length && !(q.targetDistricts || []).length) {
    q.targetDistricts = doc.districts;
    ev.targetDistricts = `공고문: ${doc.districtEvidence}`;
  }
  if (doc.amount && q.supportAmountMax == null) { q.supportAmountMax = doc.amount; q.supportAmountText = doc.amountText; ev.supportAmountMax = `공고문: ${doc.amountText}`; }
  if (!Object.keys(ev).length) return q;
  q._docEvidence = ev;
  if (q.eligibilityDepth === 'listing' || q.eligibilityDepth === 'rule') q.eligibilityDepth = 'doc';
  return q;
}
