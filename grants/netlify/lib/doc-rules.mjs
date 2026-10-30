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
// 시·군 이름만 있는 표현('과천시에 사업장', '창원특례시에 소재', '구미지역 내 소재') → 시·도 추론용
const CITY_LIST = Object.entries(CITIES).flatMap(([sido, list]) => list.map((name) => ({ sido, name, base: name.replace(/[시군]$/, '') })));
const cityRe = (c) => `(?<![가-힣])(?:${c.name}|${c.base}(?:특례시|\\s*지역))`;
function sidoFromCities(win) {
  const hits = [...new Set(CITY_LIST.filter((c) => new RegExp(cityRe(c)).test(win)).map((c) => c.sido))];
  return hits.length === 1 ? hits : null; // 고성군(강원·경남)처럼 겹치면 판단 보류
}
function sidosIn(elig) {
  for (const line of String(elig || '').split('\n')) {
    for (const m of line.matchAll(LOC)) {
      const win = line.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
      if (/제외|아닌|이외|외\s*지역|타\s*지역|전국|제한\s*없/.test(win)) continue;
      const old = win.match(OLD_DO);
      const r = regionsFromText(old ? old[1] : win) || sidoFromCities(win);
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
      // 시·군은 '창원특례시', '구미지역' 표기도 인정(구는 이름이 짧아 정식 명칭만)
      const head = /[시군]$/.test(name) ? cityRe({ name, base: name.replace(/[시군]$/, '') }) : `(?<![가-힣])${name}`;
      const re = new RegExp(`${head}\\s*(?:관내|내에|내|에)?\\s*(?:소재|본사|주\\s*사업장|사업장|주소|거주)`);
      if (re.test(s)) names.push(name);
    }
  }
  return [...new Set(names)];
}

// 시·군 나열: '14개 시군 : 포항, 경주, 안동 …', '신청가능 지역: 창원, 진주, 통영 …', '신청지역 ○ 안동, 구미 …'
// 대상 지역을 알리는 말(신청·모집·지원 지역, N개 시·군) 바로 뒤에서 같은 시·도의 시·군 이름이 3개 이상 이어질 때만
const LIST_CUE = /(?:신청|모집|지원|대상|참여)\s*(?:가능\s*)?(?:지역|시\s*[·ㆍ]?\s*군)|\d+\s*개\s*시\s*[·ㆍ]?\s*군/g;
function cityListIn(text, regions) {
  const s = String(text || '').replace(/\s+/g, ' ');
  for (const sido of (regions || []).filter((r) => r !== '전국')) {
    const list = (CITIES[sido] || []).map((name) => ({ name, base: name.replace(/[시군]$/, '') }));
    if (!list.length) continue;
    const alt = list.map((c) => `${c.base}(?:시|군)?`).sort((a, b) => b.length - a.length).join('|');
    const run = new RegExp(`(?<![가-힣])(?:${alt})(?![가-힣])(?:\\s*[,，·ㆍ]\\s*(?:${alt})(?![가-힣])){2,}`, 'g');
    for (const cue of s.matchAll(LIST_CUE)) {
      run.lastIndex = cue.index + cue[0].length;
      const m = run.exec(s);
      if (!m || m.index - (cue.index + cue[0].length) > 40) continue;
      const names = m[0].split(/\s*[,，·ㆍ]\s*/).map((x) => list.find((c) => c.name === x || c.base === x)?.name).filter(Boolean);
      if (names.length >= 3) return { names: [...new Set(names)], evidence: `${cue[0]} ${m[0]}`.slice(0, 80) };
    }
  }
  return null;
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
  if (!out.districts) {
    const known = (regions || []).filter((r) => r !== '전국');
    const listed = cityListIn(text, known.length ? known : out.regions);
    if (listed) { out.districts = listed.names; out.districtEvidence = listed.evidence; }
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
  // 목록상 '전국'(지역 표기 없음, 또는 해시태그에 시·도 전부 나열) 공고만 공고문의 소재 시·도로 바로잡는다
  // 미리보기 실측: 공고문 소재지 156건 중 목록 지역과 일치 143, 충돌 0, '전국' 13(대부분 실제 지역 한정 공고)
  // 목록이 여러 시·도(해시태그·'전남광주' 기관명 등)인데 공고문 소재지가 그 일부면 좁힌다(검증 세트 지역 오류 4건)
  const tr = q.targetRegions || [];
  const nationwide = q.targetRegionsInferred || !tr.length || (tr.length === 1 && tr[0] === '전국');
  const narrower = tr.length > 1 && doc.regions?.length && doc.regions.length < tr.length && doc.regions.every((r) => tr.includes(r));
  if (doc.regions?.length && (nationwide || narrower)) {
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
  // 자격 절을 찾아 읽었는데 숫자 제한(업력·매출·근로자·연령)이 없으면 '제한 없음'도 분석 결과로 쓴다.
  // 검증 세트 180건 실측: 자격 절 찾음 88%, 그중 제한을 못 뽑은 138건에서 실제 제한을 놓친 공고 4건(2.9%)
  if (doc.sectionFound && !Object.keys(ev).length) ev.eligibility = '공고문 신청자격 절 확인 — 업력·매출·근로자 수 제한 문구 없음';
  if (!Object.keys(ev).length) return q;
  q._docEvidence = ev;
  if (q.eligibilityDepth === 'listing' || q.eligibilityDepth === 'rule') q.eligibilityDepth = 'doc';
  return q;
}
