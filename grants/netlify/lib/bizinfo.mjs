// ============================================================================
// 기업마당(bizinfo) 어댑터 — 실제 응답 필드 → BECONIC 표준 스키마 정규화
// 공식: GET https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=...&dataType=json
// 실제 응답 필드(2026-09 확인): jsonArray[] 안에
//   pblancNm(공고명) pblancId(공고ID) jrsdInsttNm(소관기관) excInsttNm(수행기관)
//   reqstBeginEndDe(신청기간) trgetNm(지원대상) pldirSportRealmLclasCodeNm(지원분야)
//   bsnsSumryCn(사업개요) pblancUrl(상세URL) hashtags creatPnttm(등록일) refrncNm(문의)
// 키는 서버(환경변수)에서만. 프론트 노출 금지.
// ============================================================================
import { regionsFromText, stripTags, extractAmount } from './normalize.mjs';

const BIZINFO_URL = 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';

const FIELD_MAP = {
  '금융':'정책자금/금융','기술':'R&D/기술','인력':'인력','수출':'수출',
  '내수':'판로','창업':'창업','경영':'경영','판로':'판로','마케팅':'마케팅','제조혁신':'제조혁신'
};

// 지원대상 문구 → 표준 대상. 아무것도 못 읽으면 inferred=true(엔진이 '대상 아님' 대신 '확인 필요'로 판정)
export function mapTargets(trgetNm) {
  const s = String(trgetNm || '');
  const out = new Set();
  if (/예비창업|예비/.test(s)) out.add('예비창업자');
  if (/소상공인/.test(s)) out.add('소상공인');
  if (/중소기업|중견/.test(s)) { out.add('법인'); out.add('개인사업자'); }
  if (/개인사업자|개인/.test(s)) out.add('개인사업자');
  if (/법인/.test(s)) out.add('법인');
  if (out.size === 0) return { list: ['법인', '개인사업자'], inferred: true };
  return { list: [...out], inferred: false };
}

export function parsePeriod(reqst) {
  if (!reqst) return { start: null, end: null, endText: null };
  const s = String(reqst).trim();
  if (/소진|상시|수시|별도|공고문|참조/.test(s) && !/\d{4}/.test(s)) return { start: null, end: null, endText: s };
  const re = /(\d{4})[.\-/]?\s*(\d{1,2})[.\-/]?\s*(\d{1,2})/g;
  const dates = [...s.matchAll(re)].map((m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  if (dates.length >= 2) return { start: dates[0], end: dates[1], endText: null };
  if (dates.length === 1) {
    if (/까지|마감/.test(s)) return { start: null, end: dates[0], endText: null };
    return { start: dates[0], end: null, endText: s };
  }
  return { start: null, end: null, endText: s };
}

function mapPurposes(lclasNm, hashtags) {
  const out = new Set();
  const add = (k) => { for (const key in FIELD_MAP) if (String(k || '').includes(key)) out.add(FIELD_MAP[key]); };
  add(lclasNm);
  if (hashtags) String(hashtags).split(/[,#\s]+/).forEach(add);
  return [...out];
}

/** 공고문 PDF 주소: 본문출력 파일 우선, 없으면 첨부 중 첫 PDF(첨부는 '@'로 구분) */
export function docUrlOf(item) {
  const ok = (u, n) => /^https:\/\/www\.bizinfo\.go\.kr\//.test(u || '') && /\.pdf$/i.test(String(n || '').trim());
  if (ok(item.printFlpthNm, item.printFileNm)) return item.printFlpthNm;
  const urls = String(item.flpthNm || '').split('@'), names = String(item.fileNm || '').split('@');
  const i = names.findIndex((n, k) => ok(urls[k], n));
  return i >= 0 ? urls[i] : null;
}

export function normalizeBizinfo(item) {
  const period = parsePeriod(item.reqstBeginEndDe);
  const body = stripTags(item.bsnsSumryCn);
  const amt = extractAmount(body);
  const targets = mapTargets(item.trgetNm);
  // 지역: 공고명·해시태그·소관기관(예: '경상남도', '부산광역시')에서 찾는다
  const regions = regionsFromText(`${item.pblancNm || ''} ${item.hashtags || ''} ${item.jrsdInsttNm || ''}`);
  return {
    source: 'bizinfo',
    sourceProgramId: item.pblancId || item.seq || null,
    programName: (item.pblancNm || item.title || '').trim(),
    agency: item.jrsdInsttNm || item.author || '',
    executingAgency: item.excInsttNm || '',
    category: item.pldirSportRealmLclasCodeNm || item.lcategory || '',
    subCategory: '',
    supportPurposes: mapPurposes(item.pldirSportRealmLclasCodeNm || item.lcategory, item.hashtags),
    targetBusinessType: targets.list,
    targetBusinessTypeInferred: targets.inferred,
    targetRegions: regions || ['전국'],
    targetRegionsInferred: !regions,
    targetIndustries: [],
    applicationStart: period.start,
    applicationEnd: period.end,
    applicationEndText: period.endText,
    supportAmountMax: amt.max,
    supportAmountText: amt.text,
    supportDescription: body,
    contact: item.refrncNm || '',
    originalUrl: item.pblancUrl || (item.pblancId ? `https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=${encodeURIComponent(item.pblancId)}` : ''),
    registeredDate: item.creatPnttm || '',
    eligibilityDepth: 'listing', // 목록 정보만. 본문 자격요건은 AI 추출 시 'ai'
    rawSummary: body,
    // 공고문 PDF(기업마당 '본문출력 파일'). 운영 확인: 1,467건 중 1,435건 제공, Netlify에서 내려받기 가능
    docUrl: docUrlOf(item),
  };
}

export async function collectBizinfo(key, { max = 500, signal } = {}) {
  const url = `${BIZINFO_URL}?crtfcKey=${encodeURIComponent(key)}&dataType=json&searchCnt=${max}`;
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`bizinfo HTTP ${res.status}`);
  const data = await res.json();
  const arr = data.jsonArray || data.items || [];
  return arr.map(normalizeBizinfo).filter((p) => p.programName && p.sourceProgramId);
}
