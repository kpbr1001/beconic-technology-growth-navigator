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

// ---- 지원금액 추출 ----
// 공고 본문의 첫 '억'을 그대로 쓰면 '매출 100억 이하'·'총 예산 50억'이 기업당 지원금으로 잡힌다.
// 기업당 한도를 뜻하는 말(최대·한도·이내·기업당 등)이 붙은 금액만 쓰고, 매출·예산·사업비 문맥은 버린다.
const AMOUNT_RE = /(\d+(?:\.\d+)?)\s*억(?:\s*(\d+)\s*천\s*만?)?(?:\s*원)?|(\d+(?:\.\d+)?)\s*천\s*만\s*원?|(\d[\d,]*)\s*백\s*만\s*원|(\d[\d,]*)\s*만\s*원/g;
const PER_COMPANY = /최대|한도|이내|기업당|업체당|개사당|팀당|과제당|당\s|지원금|지원액|지원\s*규모|까지/;
const NOT_SUPPORT = /매출|예산|총\s*사업비|사업비\s*총|총\s*\d|자산|자본금|투자\s*유치|투자\s*실적|수출액|수출\s*실적|부채/;

export function extractAmount(text) {
  if (!text) return { max: null, text: null };
  const s = String(text);
  let best = null;
  for (const m of s.matchAll(AMOUNT_RE)) {
    let won = null;
    if (m[1] != null) won = Math.round(parseFloat(m[1]) * 1e8 + (m[2] ? parseInt(m[2], 10) * 1e7 : 0));
    else if (m[3] != null) won = Math.round(parseFloat(m[3]) * 1e7);
    else if (m[4] != null) won = parseInt(m[4].replace(/,/g, ''), 10) * 1e6;
    else if (m[5] != null) won = parseInt(m[5].replace(/,/g, ''), 10) * 1e4;
    if (!won) continue;
    // 바로 앞 구절만 본다(쉼표·마침표 앞의 '총 예산 50억'이 뒤 금액을 막지 않게)
    const before = s.slice(Math.max(0, m.index - 18), m.index).split(/[,.;·\n]/).pop();
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (NOT_SUPPORT.test(before)) continue;
    if (!PER_COMPANY.test(before) && !PER_COMPANY.test(after)) continue;
    if (won < 1e5 || won > 1e11) continue; // 10만 원 미만·1,000억 초과는 기업당 한도로 보기 어려움
    if (!best || won > best.won) best = { won, raw: m[0].trim() };
  }
  return best ? { max: best.won, text: `최대 ${best.raw.replace(/\s+/g, '')}` } : { max: null, text: null };
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
