// ============================================================================
// K-Startup 어댑터 — 창업진흥원 지원사업 공고 API
// 공공데이터포털 dataset 15125364
// 2026-11 기준 포털 안내 주소는 2.0: https://apis.data.go.kr/B552735/kisedKstartupService02/getAnnouncementInformation02
//   (?serviceKey=...&returnType=json&page=...&perPage=...). 1.0(Service01/…01)은 아직 응답하지만 종료 대비로
//   2.0을 먼저 부르고, 2.0이 실패(키 미승인·HTTP 오류·오류 응답)하면 1.0으로 자동 전환한다.
// 실제 응답 필드(확인): biz_pbanc_nm(공고명) pbanc_sn(공고ID) pbanc_ctnt(내용)
//   pbanc_rcpt_bgng_dt/pbanc_rcpt_end_dt(접수 시작/종료 YYYYMMDD) supt_regin(지역)
//   aply_trgt(대상) aply_trgt_ctnt(신청대상 상세) biz_enyy(대상 업력) supt_biz_clsfc(분야)
//   rcrt_prgs_yn(모집진행 Y/N) detl_pg_url(상세URL) pbanc_ntrp_nm(주관기관)
// ★ supt_regin 서버필터 부정확 → 클라이언트에서 재판정
// 키는 서버(환경변수)에서만.
// ============================================================================
import { regionsFromText, stripTags, parseYmd } from './normalize.mjs';

export const KSTARTUP_ENDPOINTS = [
  { v: 'v2', url: 'https://apis.data.go.kr/B552735/kisedKstartupService02/getAnnouncementInformation02' },
  { v: 'v1', url: 'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01' },
];
let lastVersion = null;
/** 마지막 수집에 쓰인 API 버전('v2'|'v1'|null) — 응답 메타로 노출해 운영에서 확인 */
export const kstartupApiVersion = () => lastVersion;

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

/**
 * biz_trgt_age(대상 연령, 2.0 필터 항목) 해석. 업력처럼 목록('만 20세 미만,만 20세 이상 ~ 만 39세 이하,만 40세 이상')일 수 있어
 * 가장 큰 상한을 쓰고, 상한 없는 'N세 이상' 구간이 있으면 제한 없음(null). 형식을 모르면 null(기존 본문 해석으로).
 */
export function mapTargetAge(v) {
  const s = String(v || '').trim();
  if (!s || /전체|제한\s*없|무관/.test(s)) return null;
  const parts = s.split(/[,/|]/).map((x) => x.trim()).filter(Boolean);
  let max = null;
  for (const part of parts) {
    const up = part.match(/(\d+)\s*세\s*(이하|미만)/);
    if (!up) { if (/\d+\s*세\s*이상/.test(part)) return null; continue; }
    const n = up[2] === '미만' ? +up[1] - 1 : +up[1];
    max = max == null ? n : Math.max(max, n);
  }
  return max;
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
    representativeAgeMax: mapTargetAge(item.biz_trgt_age) ?? mapAge(item.aply_trgt_ctnt),
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

async function fetchPage(url, key, { count, page, signal }) {
  // 이 API는 page·perPage를 쓴다(numOfRows·pageNo는 무시돼 기본 10건만 옴 — 운영에서 확인). 두 이름을 함께 보낸다.
  // 모집 진행 중 공고만 요청(cond 필터). 무시돼도 isAlive가 한 번 더 거른다.
  const q = `${url}?serviceKey=${encodeURIComponent(key)}&returnType=json&page=${page}&perPage=${count}&pageNo=${page}&numOfRows=${count}&${encodeURIComponent('cond[rcrt_prgs_yn::EQ]')}=Y`;
  const res = await fetch(q, { headers: { accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`kstartup HTTP ${res.status}`);
  const data = await res.json();
  const head = data.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (head) throw new Error(`kstartup ${head.errMsg || head.returnAuthMsg || 'error'}`);
  if (Array.isArray(data.data)) return data.data;
  if (data.response?.body?.items) return [].concat(data.response.body.items.item || data.response.body.items);
  if (Array.isArray(data.items)) return data.items;
  throw new Error('kstartup 응답 형식 불일치');
}

/** 한 페이지 수집. version을 주면 그 버전만, 없으면 2.0 → 1.0 순서로 시도 */
export async function callKstartup(key, { count = 100, page = 1, signal, version } = {}) {
  const eps = version ? KSTARTUP_ENDPOINTS.filter((e) => e.v === version) : KSTARTUP_ENDPOINTS;
  let lastErr;
  for (const ep of eps) {
    try {
      const arr = await fetchPage(ep.url, key, { count, page, signal });
      return { v: ep.v, list: arr.map(normalizeKstartup).filter((p) => p.programName && p.sourceProgramId) };
    } catch (e) { lastErr = e; if (signal?.aborted) break; }
  }
  throw lastErr;
}

export async function collectKstartup(key, { max = 500, perPage = 100, signal } = {}) {
  const pages = Math.min(Math.ceil(max / perPage), 5);
  // 1페이지로 쓸 버전을 정하고(2.0 우선), 나머지 페이지는 같은 버전으로 받는다(버전이 섞이면 중복·누락 위험)
  const first = await callKstartup(key, { count: perPage, page: 1, signal });
  lastVersion = first.v;
  const tasks = [];
  for (let i = 2; i <= pages; i++) tasks.push(callKstartup(key, { count: perPage, page: i, signal, version: first.v }));
  const settled = [{ status: 'fulfilled', value: first }, ...(await Promise.allSettled(tasks))];
  const seen = new Set();
  const out = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const p of s.value.list) if (!seen.has(p.sourceProgramId)) { seen.add(p.sourceProgramId); out.push(p); }
  }
  return out;
}
