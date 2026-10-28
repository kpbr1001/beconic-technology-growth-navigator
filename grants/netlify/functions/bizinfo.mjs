// ============================================================================
// 기업마당(bizinfo) 어댑터 — 실제 응답 필드 → BECONIC 표준 스키마 정규화
// 공식: GET https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=...&dataType=json
// 실제 응답 필드(2026-09 확인): jsonArray[] 안에
//   pblancNm(공고명) pblancId(공고ID) jrsdInsttNm(소관기관) excInsttNm(수행기관)
//   reqstBeginEndDe(신청기간) trgetNm(지원대상) pldirSportRealmLclasCodeNm(지원분야)
//   bsnsSumryCn(사업개요) pblancUrl(상세URL) hashtags creatPnttm(등록일) refrncNm(문의)
// 키는 서버(환경변수)에서만. 프론트 노출 금지.
// ============================================================================

const BIZINFO_URL = 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';

const FIELD_MAP = {
  '금융':'정책자금/금융','기술':'R&D/기술','인력':'인력','수출':'수출',
  '내수':'판로','창업':'창업','경영':'경영','판로':'판로','마케팅':'마케팅','제조혁신':'제조혁신'
};

function mapTargets(trgetNm){
  if(!trgetNm) return [];
  const s=String(trgetNm); const out=new Set();
  if(/예비창업|예비/.test(s)) out.add('예비창업자');
  if(/소상공인/.test(s)) out.add('소상공인');
  if(/중소기업|중견/.test(s)){ out.add('법인'); out.add('개인사업자'); }
  if(/개인사업자|개인/.test(s)) out.add('개인사업자');
  if(/법인/.test(s)) out.add('법인');
  if(out.size===0){ out.add('법인'); out.add('개인사업자'); }
  return [...out];
}

function parsePeriod(reqst){
  if(!reqst) return {start:null,end:null,endText:null};
  const s=String(reqst).trim();
  if(/소진|상시|수시|별도|공고문|참조/.test(s) && !/\d{4}/.test(s)) return {start:null,end:null,endText:s};
  const dates=s.match(/(\d{4})[.\-\/]?(\d{2})[.\-\/]?(\d{2})/g)||[];
  const norm=d=>{ const m=d.match(/(\d{4})[.\-\/]?(\d{2})[.\-\/]?(\d{2})/); return m?`${m[1]}-${m[2]}-${m[3]}`:null; };
  if(dates.length>=2) return {start:norm(dates[0]),end:norm(dates[1]),endText:null};
  if(dates.length===1){ if(/까지|마감/.test(s)) return {start:null,end:norm(dates[0]),endText:null}; return {start:norm(dates[0]),end:null,endText:s}; }
  return {start:null,end:null,endText:s};
}

function mapPurposes(lclasNm,hashtags){
  const out=new Set();
  const add=k=>{ for(const key in FIELD_MAP) if(String(k||'').includes(key)) out.add(FIELD_MAP[key]); };
  add(lclasNm);
  if(hashtags) String(hashtags).split(/[,#\s]+/).forEach(add);
  return [...out];
}

const SIDO=['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
function mapRegions(pblancNm,hashtags){
  const text=`${pblancNm||''} ${hashtags||''}`;
  const found=SIDO.filter(r=>text.includes(r));
  return found.length?found:['전국'];
}

function extractAmount(text){
  if(!text) return {max:null};
  const s=String(text); let max=null;
  const eok=s.match(/(\d+(?:\.\d+)?)\s*억/);
  const man=s.match(/(\d[\d,]*)\s*만\s*원/);
  if(eok) max=Math.round(parseFloat(eok[1])*100000000);
  else if(man) max=parseInt(man[1].replace(/,/g,''),10)*10000;
  return {max};
}

function stripTags(html){
  if(!html) return '';
  return String(html).replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

export function normalizeBizinfo(item){
  const period=parsePeriod(item.reqstBeginEndDe);
  const amt=extractAmount(item.bsnsSumryCn);
  return {
    source:'bizinfo',
    sourceProgramId:item.pblancId||item.seq||null,
    programName:(item.pblancNm||item.title||'').trim(),
    agency:item.jrsdInsttNm||item.author||'',
    executingAgency:item.excInsttNm||'',
    category:item.pldirSportRealmLclasCodeNm||item.lcategory||'',
    subCategory:'',
    supportPurposes:mapPurposes(item.pldirSportRealmLclasCodeNm||item.lcategory,item.hashtags),
    targetBusinessType:mapTargets(item.trgetNm),
    targetRegions:mapRegions(item.pblancNm,item.hashtags),
    targetIndustries:[],
    applicationStart:period.start,
    applicationEnd:period.end,
    applicationEndText:period.endText,
    supportAmountMax:amt.max,
    supportAmountText:null,
    supportDescription:stripTags(item.bsnsSumryCn)||'',
    contact:item.refrncNm||'',
    originalUrl:item.pblancUrl||(item.pblancId?`https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=${item.pblancId}`:''),
    registeredDate:item.creatPnttm||'',
    rawSummary:stripTags(item.bsnsSumryCn)||''
  };
}

export async function callBizinfo(key,{count=200}={}){
  const url=`${BIZINFO_URL}?crtfcKey=${encodeURIComponent(key)}&dataType=json&searchCnt=${count}`;
  const res=await fetch(url,{headers:{'accept':'application/json'}});
  if(!res.ok) throw new Error(`bizinfo HTTP ${res.status}`);
  const data=await res.json();
  const arr=data.jsonArray||data.items||[];
  return arr.map(normalizeBizinfo).filter(p=>p.programName&&p.sourceProgramId);
}

// 대량 수집: 기업마당은 searchCnt로 한 번에 많이 받을 수 있음(최대 넉넉히)
export async function collectBizinfo(key,{max=500}={}){
  // searchCnt를 max로 한 번에 요청(기업마당은 단일 호출로 대량 지원)
  return await callBizinfo(key,{count:max});
}

export async function handler(){
  const key=process.env.BIZINFO_API_KEY;
  if(!key) return json(200,{status:'NOT_CONFIGURED',source:'bizinfo'});
  try{
    const programs=await callBizinfo(key,{count:50});
    return json(200,{status:'READY',source:'bizinfo',count:programs.length,programs});
  }catch(e){
    return json(200,{status:'ERROR',source:'bizinfo',message:String(e.message||e)});
  }
}
const json=(code,body)=>({statusCode:code,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
