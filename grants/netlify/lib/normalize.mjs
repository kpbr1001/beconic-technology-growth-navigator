// ============================================================================
// 공통 정규화 도구 — 기업마당·K-Startup 어댑터와 programs 오케스트레이터가 함께 쓴다.
// 순수 함수만 둔다(테스트: grants/tests/server.test.mjs).
// ============================================================================

export const SIDO = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];

// 정식 명칭에 약칭이 들어 있지 않은 6개 도(예: '경상남도'에는 '경남'이 없음)
const SIDO_ALIAS = [
  [/충청북도/, '충북'], [/충청남도/, '충남'], [/전라북도/, '전북'],
  [/전라남도/, '전남'], [/경상북도/, '경북'], [/경상남도/, '경남'],
];

/** 텍스트에서 시·도를 찾는다. 없으면 null(호출하는 쪽에서 '전국'으로 간주하고 그 사실을 표시). */
export function regionsFromText(text) {
  const s = String(text || '');
  const out = new Set(SIDO.filter((r) => s.includes(r)));
  for (const [re, short] of SIDO_ALIAS) if (re.test(s)) out.add(short);
  if (out.size >= 10) return ['전국']; // 해시태그에 시·도를 전부 나열한 전국 공고(운영 데이터 157건)
  return out.size ? SIDO.filter((r) => out.has(r)) : null;
}

export function stripTags(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseYmd(d) {
  if (!d) return null;
  const s = String(d).replace(/[^\d]/g, '');
  if (s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 'YYYY-MM-DD' 마감일이 한국시간(KST) 기준 오늘 이전이면 true. 마감 당일은 아직 유효. */
export function isPastKst(ymd, now = Date.now()) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  // 마감일 23:59:59 KST = 같은 날 14:59:59 UTC
  const endUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], 14, 59, 59);
  return endUtc < now;
}

// ---- 시·군 기관 공고 ----
// 시·군 산업진흥원·시청 등이 낸 공고는 그 시·군 기업 대상인 경우가 대부분이다(운영 데이터: 시흥·부천·창원·성남·평택·용인·김해 등).
// v3.8까지는 도 전체 공고로 처리해 다른 시·군 기업에도 '충족'이 나왔다. (구 단위는 이름이 여러 시·도에 겹쳐 제외)
export const CITIES = {
  '경기': ['수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시', '남양주시', '화성시', '평택시', '의정부시', '시흥시', '파주시', '광명시', '김포시', '군포시', '광주시', '이천시', '양주시', '오산시', '구리시', '안성시', '포천시', '의왕시', '하남시', '여주시', '동두천시', '과천시', '가평군', '연천군', '양평군'],
  '인천': ['강화군', '옹진군'],
  '부산': ['기장군'],
  '대구': ['달성군', '군위군'],
  '울산': ['울주군'],
  '강원': ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  '충북': ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
  '충남': ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
  '전북': ['전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군'],
  '전남': ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
  '경북': ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
  '경남': ['창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'],
  '제주': ['제주시', '서귀포시'],
};

const CITY_LIST = Object.entries(CITIES).flatMap(([sido, list]) => list.map((name) => ({ sido, name, base: name.replace(/[시군]$/, '') })));
const notHangulBefore = (s, i) => i === 0 || !/[가-힣]/.test(s[i - 1]);
function hasFullName(s, name) {
  let i = s.indexOf(name);
  while (i >= 0) { if (notHangulBefore(s, i)) return true; i = s.indexOf(name, i + 1); }
  return false;
}

// 광역시 자치구: 이름이 여러 광역시에 겹치므로(중구·서구 등) 공고의 광역시가 하나로 정해졌을 때만 찾는다.
export const GUS = {
  '서울': ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'],
  '인천': ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구'],
  '부산': ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구'],
  '대구': ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구'],
  '광주': ['동구', '서구', '남구', '북구', '광산구'],
  '대전': ['동구', '중구', '서구', '유성구', '대덕구'],
  '울산': ['중구', '남구', '동구', '북구'],
};

/** 광역시가 하나로 정해진 공고에서 자치구 찾기: '구로구'(정식명) 또는 '[서울] 구로'(광역시 표기 + 약칭) */
export function detectGus({ programName = '', agency = '', executingAgency = '' }, sido) {
  const list = GUS[sido];
  if (!list) return [];
  const texts = [programName, agency, executingAgency].map((t) => String(t || ''));
  return list.filter((name) => {
    if (texts.some((t) => hasFullName(t, name))) return true;
    const base = name.slice(0, -1);
    if (base.length < 2) return false;
    return new RegExp(`\\[${sido}\\]\\s*${base}(?:구)?(?![가-힣])`).test(programName);
  });
}

/** 공고명·기관명에서 대상 시·군 찾기. regions(시·도)가 정해져 있으면 그 안의 시·군만. */
export function detectCities({ programName = '', agency = '', executingAgency = '' }, regions = null) {
  const found = [];
  for (const c of CITY_LIST) {
    const baseOk = c.base.length >= 2 && !SIDO.includes(c.base);
    const byAgency = [agency, executingAgency].some((a) => a && (hasFullName(a, c.name) || (baseOk && String(a).startsWith(c.base))));
    const byName = hasFullName(programName, c.name) || (baseOk && programName.includes(`[${c.base}]`));
    if (byAgency || byName) found.push(c);
  }
  const inRegion = regions && !regions.includes('전국') ? found.filter((c) => regions.includes(c.sido)) : found;
  // 같은 이름이 여러 시·도에 있으면(고성군) 시·도가 정해진 경우만 인정
  const names = inRegion.map((c) => c.name);
  return inRegion.filter((c) => names.filter((n) => n === c.name).length === 1);
}

// ---- 지원금액 추출 ----
// 공고 본문의 첫 '억'을 그대로 쓰면 '매출 100억 이하'·'총 예산 50억'이 기업당 지원금으로 잡힌다.
// 기업당 한도를 뜻하는 말(최대·한도·이내·기업당 등)이 붙은 금액만 쓰고, 매출·예산·사업비 문맥은 버린다.
// 숫자는 쉼표 포함 전체를 읽는다(v3.9까지 '1,395억'에서 '395억'만 읽어 기업당 395억으로 잡힘)
const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)';
const AMOUNT_RE = new RegExp(`${NUM}\\s*억(?:\\s*(\\d+)\\s*천\\s*만?)?(?:\\s*원)?|${NUM}\\s*천\\s*만\\s*원?|${NUM}\\s*백\\s*만\\s*원|${NUM}\\s*만\\s*원`, 'g');
const PER_UNIT = /(?:기업|업체|개사|팀|과제|건|사업장|프로젝트|기관|개소|인)\s*당|기업별|업체별/; // 기업당 한도가 명시된 금액
const LIMIT = /최대|한도|이내|지원금|지원액|까지/;
// 사업 전체 규모·기업 실적 문맥(예산 규모 1,395억, 총 180억, 융자 지원규모 3,300억, 매출 100억 이하)
const NOT_SUPPORT = /매출|예산|규모|총\s*사업비|사업비\s*총|총\s*$|총액|기금\s*조성|자산|자본금|투자\s*유치|투자\s*실적|수출액|수출\s*실적|부채/;
const num = (x) => parseFloat(String(x).replace(/,/g, ''));
export function wonText(won) {
  if (won >= 1e8) { const e = won / 1e8; return `${Number.isInteger(e) ? e : e.toFixed(1)}억원`; }
  return `${Math.round(won / 1e4).toLocaleString('ko-KR')}만원`;
}

export function extractAmount(text) {
  if (!text) return { max: null, text: null };
  const s = String(text);
  let best = null;
  for (const m of s.matchAll(AMOUNT_RE)) {
    let won = null;
    if (m[1] != null) won = Math.round(num(m[1]) * 1e8 + (m[2] ? parseInt(m[2], 10) * 1e7 : 0));
    else if (m[3] != null) won = Math.round(num(m[3]) * 1e7);
    else if (m[4] != null) won = num(m[4]) * 1e6;
    else if (m[5] != null) won = num(m[5]) * 1e4;
    if (!won) continue;
    // 바로 앞 구절만 본다(구분: 마침표·세미콜론·가운뎃점·줄바꿈·'쉼표+공백'·괄호 시작)
    const before = s.slice(Math.max(0, m.index - 24), m.index).split(/[.;·\n(（]|,\s/).pop();
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (NOT_SUPPORT.test(before)) continue;
    const perUnit = PER_UNIT.test(before);
    if (!perUnit && !LIMIT.test(before) && !LIMIT.test(after)) continue;
    if (won < 1e5 || won > 1e11) continue; // 10만 원 미만·1,000억 초과는 기업당 한도로 보기 어려움
    // '업체당'처럼 단위가 명시된 금액을 우선, 같은 등급이면 큰 값
    const rank = perUnit ? 2 : 1;
    if (!best || rank > best.rank || (rank === best.rank && won > best.won)) best = { won, rank, raw: m[0].trim() };
  }
  return best ? { max: best.won, text: `최대 ${wonText(best.won)}` } : { max: null, text: null };
}

// ---- 공고명 정규화(중복 판정) ----
export function normalizeName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .replace(/[[\](){}<>「」『』【】]/g, '')
    .replace(/20\d{2}년?(도)?/g, '')
    .replace(/(모집|공고|안내|신청|참여기업|추가|재)+/g, '')
    .replace(/(예비창업자|중소기업|소상공인)/g, '')
    .toLowerCase();
}

function richness(x) {
  return (x.businessAgeMax != null ? 1 : 0) + (x.applicationEnd ? 1 : 0) + (x.supportAmountMax ? 1 : 0)
    + (x.recruitInProgress ? 1 : 0) + (x.preStartupAllowed != null ? 1 : 0) + (x.representativeAgeMax != null ? 1 : 0)
    + (x.source === 'kstartup' ? 0.5 : 0);
}

/**
 * 중복 제거.
 * 1) 같은 이름(정규화)은 하나로.
 * 2) 이름 부분일치는 서로 다른 출처(기업마당↔K-Startup)이고 마감일이 같거나 한쪽이 비어 있을 때만 합친다.
 *    같은 출처 안의 '○○사업'과 '○○사업(고도화)'처럼 실제로 다른 공고를 합치지 않기 위함.
 */
export function dedupe(programs) {
  const byKey = new Map();
  const loose = [];
  for (const p of programs) {
    const key = normalizeName(p.programName);
    if (!key) { loose.push(p); continue; }
    const prev = byKey.get(key);
    if (!prev || richness(p) > richness(prev)) byKey.set(key, p);
  }
  const list = [...byKey.values()].sort((a, b) => normalizeName(a.programName).length - normalizeName(b.programName).length);
  const out = [];
  for (const p of list) {
    const pk = normalizeName(p.programName);
    const dupIdx = out.findIndex((o) => {
      if (o.source === p.source) return false;
      const ok = normalizeName(o.programName);
      if (pk.length < 8 || ok.length < 8 || !(pk.includes(ok) || ok.includes(pk))) return false;
      return !o.applicationEnd || !p.applicationEnd || o.applicationEnd === p.applicationEnd;
    });
    if (dupIdx < 0) out.push(p);
    else if (richness(p) > richness(out[dupIdx])) out[dupIdx] = p;
  }
  return out.concat(loose);
}
