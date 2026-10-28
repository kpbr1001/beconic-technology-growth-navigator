// ============================================================================
// K-Startup 어댑터 — 창업진흥원 지원사업 공고 API
// 공공데이터포털 dataset 15125364, operation: getAnnouncementInformation01
// 공식: https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01
//        ?serviceKey=...&returnType=json&numOfRows=...&pageNo=...
// 실제 응답 필드(확인): biz_pbanc_nm(공고명) pbanc_sn(공고ID) pbanc_ctnt(내용)
//   pbanc_rcpt_bgng_dt/pbanc_rcpt_end_dt(접수 시작/종료 YYYYMMDD) supt_regin(지역)
//   aply_trgt(대상) aply_trgt_ctnt(신청대상 상세) biz_enyy(대상 업력) supt_biz_clsfc(분야)
//   rcrt_prgs_yn(모집진행 Y/N) detl_pg_url(상세URL) pbanc_ntrp_nm(주관기관)
// ★ supt_regin 서버필터 부정확 → 클라이언트에서 재판정
// 키는 서버(환경변수)에서만.
// ============================================================================
import { regionsFromText, stripTags, parseYmd } from './normalize.mjs';

const KSTARTUP_URL = 'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01';

const FIELD_MAP = {
  '사업화':'사업화','정책자금':'정책자금/금융','R&D':'R&D/기술','기술개발':'R&D/기술',
  '판로':'판로','해외진출':'수출','마케팅':'마케팅','시설':'시설/공간','공간':'시설/공간',
  '보육':'시설/공간','멘토링':'경영','컨설팅':'경영','창업교육':'창업','행사':'행사/네트워크'
};

export function mapTargets(aplyTrgt, aplyCtnt) {
  const s = `${aplyTrgt || ''} ${aplyCtnt || ''}`;
  const out = new Set();
  if (/예비창업|일반인|대학생|청소년/.test(s)) out.add('예비창업자');
  if (/소상공인/.test(s)) out.add('소상공인');
  if (/1인\s*창조/.test(s)) out.add('개인사업자');
  if (/중소기업|일반기업|창업기업/.test(s)) { out.add('법인'); out.add('개인사업자'); }
  if (/개인사업자/.test(s)) out.add('개인사업자');
  if (/법인/.test(s)) out.add('법인');
  if (out.size === 0) return { list: ['예비창업자', '법인', '개인사업자'], inferred: true };
  return { list: [...out], inferred: false };
}

/**
 * biz_enyy(대상 업력) 해석. 실제 값은 '예비창업자,1년미만,2년미만,3년미만,5년미만,7년미만' 같은 목록이다.
 * - 가장 큰 'N년미만'이 상한 (첫 번째 값을 쓰면 '1년미만'만 잡혀 3년 차 기업이 탈락함)
 * - 목록에 '예비창업'이 있으면 예비창업자 신청 가능, 연차만 있으면 불가
 */
export function mapBusinessAge(bizEnyy) {
  const s = String(bizEnyy || '').trim();
  if (!s || /전체|제한\s*없/.test(s)) return { max: null, min: null, preStartupAllowed: null, preStartupOnly: false };
  const lt = [...s.matchAll(/(\d+)\s*년\s*(미만|이내|이하)/g)].map((m) => ({ n: +m[1], ex: m[2] === '미만' }));
  const ge = [...s.matchAll(/(\d+)\s*년\s*이상/g)].map((m) => +m[1]);
  const pre = /예비/.test(s);
  const top = lt.sort((a, b) => b.n - a.n)[0];
  return {
    max: top ? top.n : null,
    maxExclusive: top ? top.ex : false,
    min: ge.length && !lt.length ? Math.min(...ge) : null,
    preStartupAllowed: lt.length || ge.length ? pre : (pre ? true : null),
    preStartupOnly: pre && !lt.length && !ge.length,
  };
}

export function mapAge(ageStr) {
  const m = String(ageStr || '').match(/만\s*(\d+)\s*세\s*(이하|미만)/);
  if (!m) return null;
  return m[2] === '미만' ? +m[1] - 1 : +m[1];
}

function mapPurposes(clsfc) {
  const out = new Set();
  const s = String(clsfc || '');
  for (const k in FIELD_MAP) if (s.includes(k)) out.add(FIELD_MAP[k]);
  return [...out];
}

export function normalizeKstartup(item) {
  const age = mapBusinessAge(item.biz_enyy);
  const targets = mapTargets(item.aply_trgt, item.aply_trgt_ctnt);
  const regionText = `${item.supt_regin || ''} ${item.biz_pbanc_nm || ''}`;
  const regions = /전국/.test(String(item.supt_regin || '')) ? ['전국'] : regionsFromText(regionText);
  const body = stripTags(item.pbanc_ctnt);
  return {
    source: 'kstartup',
    sourceProgramId: item.pbanc_sn ? `KS_${item.pbanc_sn}` : null,
    programName: (item.biz_pbanc_nm || item.intg_pbanc_biz_nm || '').trim(),
    agency: item.pbanc_ntrp_nm || item.jrsdInsttNm || '창업진흥원',
    executingAgency: '',
    category: item.supt_biz_clsfc || '',
    subCategory: '',
    supportPurposes: mapPurposes(item.supt_biz_clsfc),
    targetBusinessType: targets.list,
    targetBusinessTypeInferred: targets.inferred,
    targetRegions: regions || ['전국'],
    targetRegionsInferred: !regions,
    targetIndustries: [],
    applicationStart: parseYmd(item.pbanc_rcpt_bgng_dt),
    applicationEnd: parseYmd(item.pbanc_rcpt_end_dt),
    applicationEndText: null,
    businessAgeMax: age.max,
    businessAgeMaxExclusive: age.maxExclusive || false,
    businessAgeMin: age.min,
    preStartupAllowed: age.preStartupAllowed,
    preStartupOnly: age.preStartupOnly,
    representativeAgeMax: mapAge(item.aply_trgt_ctnt),
    recruitInProgress: item.rcrt_prgs_yn === 'Y' ? true : item.rcrt_prgs_yn === 'N' ? false : null,
    supportAmountMax: null,
    supportAmountText: null,
    supportDescription: body,
    contact: item.prch_cnpl_no || '',
    originalUrl: item.detl_pg_url || (item.pbanc_sn ? `https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=${encodeURIComponent(item.pbanc_sn)}` : ''),
    registeredDate: '',
    eligibilityDepth: 'listing',
    rawSummary: body,
  };
}

export async function callKstartup(key, { count = 100, page = 1, signal } = {}) {
  // 모집 진행 중 공고만 요청(cond 필터). 지원하지 않는 환경이면 무시되고, isAlive가 한 번 더 거른다.
  const url = `${KSTARTUP_URL}?serviceKey=${encodeURIComponent(key)}&returnType=json&numOfRows=${count}&pageNo=${page}&${encodeURIComponent('cond[rcrt_prgs_yn::EQ]')}=Y`;
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`kstartup HTTP ${res.status}`);
  const data = await res.json();
  let arr = [];
  if (Array.isArray(data.data)) arr = data.data;
  else if (data.response?.body?.items) arr = [].concat(data.response.body.items.item || data.response.body.items);
  else if (Array.isArray(data.items)) arr = data.items;
  return arr.map(normalizeKstartup).filter((p) => p.programName && p.sourceProgramId);
}

export async function collectKstartup(key, { max = 300, perPage = 100, signal } = {}) {
  const pages = Math.min(Math.ceil(max / perPage), 5);
  const tasks = [];
  for (let i = 1; i <= pages; i++) tasks.push(callKstartup(key, { count: perPage, page: i, signal }));
  const settled = await Promise.allSettled(tasks);
  if (settled.every((s) => s.status === 'rejected')) throw settled[0].reason;
  const seen = new Set();
  const out = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const p of s.value) if (!seen.has(p.sourceProgramId)) { seen.add(p.sourceProgramId); out.push(p); }
  }
  return out;
}
