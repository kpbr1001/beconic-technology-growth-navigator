// ============================================================================
// K-Startup 어댑터 — 창업진흥원 지원사업 공고 API
// 공공데이터포털 dataset 15125364, operation: getAnnouncementInformation01
// 공식: http://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01
//        ?serviceKey=...&returnType=json&numOfRows=...&pageNo=...
// 실제 응답 필드(확인): biz_pbanc_nm(공고명) pbanc_sn(공고ID) pbanc_ctnt(내용)
//   pbanc_rcpt_bgng_dt/pbanc_rcpt_end_dt(접수 시작/종료 YYYYMMDD) supt_regin(지역)
//   aply_trgt(대상) aply_trgt_ctnt(신청대상 상세) biz_enyy(대상 업력) supt_biz_clsfc(분야)
//   rcrt_prgs_yn(모집진행 Y/N) detl_pg_url(상세URL) pbanc_ntrp_nm(주관기관)
// ★ K-Startup은 기업마당에 없는 biz_enyy(업력)·대상연령을 정형 제공 → 창업사업 정밀매칭 유리
// ★ supt_regin 서버필터 부정확 → 클라이언트에서 재필터 필요(가이드 확인)
// 키는 서버(환경변수)에서만.
// ============================================================================

const KSTARTUP_URL = 'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01';

const FIELD_MAP = {
  '사업화':'사업화','정책자금':'정책자금/금융','R&D':'R&D/기술','기술개발':'R&D/기술',
  '판로':'판로','해외진출':'수출','마케팅':'마케팅','시설':'시설/공간','공간':'시설/공간',
  '보육':'시설/공간','멘토링':'경영','컨설팅':'경영','창업교육':'창업','행사':'행사/네트워크'
};

const SIDO=['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];

// 대상(aply_trgt/biz_enyy) → 표준 targetBusinessType
function mapTargets(aplyTrgt, aplyCtnt){
  const s = `${aplyTrgt||''} ${aplyCtnt||''}`;
  const out=new Set();
  if(/예비창업/.test(s)) out.add('예비창업자');
  if(/소상공인/.test(s)) out.add('소상공인');
  if(/1인\s*창조|1인창조/.test(s)){ out.add('개인사업자'); }
  if(/중소기업|일반기업/.test(s)){ out.add('법인'); out.add('개인사업자'); }
  if(/개인사업자/.test(s)) out.add('개인사업자');
  if(/법인/.test(s)) out.add('법인');
  if(out.size===0){ out.add('예비창업자'); out.add('법인'); out.add('개인사업자'); }
  return [...out];
}

// biz_enyy(대상 업력) → businessAgeMax (창업 N년 이내)
function mapBusinessAge(bizEnyy){
  if(!bizEnyy) return { max:null, preStartupOnly:false };
  const s=String(bizEnyy);
  if(/전체/.test(s)) return { max:null, preStartupOnly:false };
  let max=null;
  const m=s.match(/(\d+)\s*년\s*미만/);
  if(m) max=parseInt(m[1],10);
  const preOnly = /예비창업/.test(s) && !/\d년/.test(s);
  return { max, preStartupOnly: preOnly };
}

// 대상연령 → representativeAgeMax
function mapAge(ageStr){
  if(!ageStr) return null;
  const m=String(ageStr).match(/만\s*(\d+)\s*세\s*이하/);
  return m?parseInt(m[1],10):null;
}

function mapPurposes(clsfc){
  const out=new Set();
  const s=String(clsfc||'');
  for(const k in FIELD_MAP) if(s.includes(k)) out.add(FIELD_MAP[k]);
  return [...out];
}

function mapRegions(suptRegin, pbancNm){
  const text=`${suptRegin||''} ${pbancNm||''}`;
  if(/전국/.test(text)) return ['전국'];
  const found=SIDO.filter(r=>text.includes(r));
  return found.length?found:['전국'];
}

function parseYmd(d){
  if(!d) return null;
  const s=String(d).replace(/[^\d]/g,'');
  if(s.length!==8) return null;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

export function normalizeKstartup(item){
  const age=mapBusinessAge(item.biz_enyy);
  const targets=mapTargets(item.aply_trgt, item.aply_trgt_ctnt);
  return {
    source:'kstartup',
    sourceProgramId: item.pbanc_sn ? `KS_${item.pbanc_sn}` : null,
    programName:(item.biz_pbanc_nm||item.intg_pbanc_biz_nm||'').trim(),
    agency:item.pbanc_ntrp_nm||item.jrsdInsttNm||'창업진흥원',
    executingAgency:item.pbanc_ntrp_nm||'',
    category:item.supt_biz_clsfc||'',
    subCategory:'',
    supportPurposes:mapPurposes(item.supt_biz_clsfc),
    targetBusinessType:targets,
    targetRegions:mapRegions(item.supt_regin, item.biz_pbanc_nm),
    targetIndustries:[],
    applicationStart:parseYmd(item.pbanc_rcpt_bgng_dt),
    applicationEnd:parseYmd(item.pbanc_rcpt_end_dt),
    applicationEndText:null,
    // K-Startup 고유: 업력·연령 정형 제공
    businessAgeMax: age.max,
    preStartupOnly: age.preStartupOnly,
    representativeAgeMax: mapAge(item.aply_trgt_ctnt),
    recruitInProgress: (item.rcrt_prgs_yn === 'Y'),
    supportAmountMax:null,
    supportAmountText:null,
    supportDescription:stripTags(item.pbanc_ctnt)||'',
    contact:item.prch_cnpl_no||'',
    originalUrl:item.detl_pg_url||(item.pbanc_sn?`https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?pbancSn=${item.pbanc_sn}`:''),
    registeredDate:'',
    rawSummary:stripTags(item.pbanc_ctnt)||'',
    _suptReginRaw:item.supt_regin||''   // 클라이언트 재필터용 원본 보존
  };
}

function stripTags(html){
  if(!html) return '';
  return String(html).replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

export async function callKstartup(key,{count=100,page=1}={}){
  const url=`${KSTARTUP_URL}?serviceKey=${encodeURIComponent(key)}&returnType=json&numOfRows=${count}&pageNo=${page}`;
  const res=await fetch(url,{headers:{'accept':'application/json'}});
  if(!res.ok) throw new Error(`kstartup HTTP ${res.status}`);
  const data=await res.json();
  // 응답 구조: { data: [...] } 또는 { response: { body: { items: [...] } } }
  let arr=[];
  if(Array.isArray(data.data)) arr=data.data;
  else if(data.response?.body?.items) arr=data.response.body.items;
  else if(Array.isArray(data.items)) arr=data.items;
  return arr.map(normalizeKstartup).filter(p=>p.programName&&p.sourceProgramId);
}

// 페이지네이션 대량 수집: 여러 페이지를 병렬로 받아 합침
export async function collectKstartup(key,{max=300,perPage=100}={}){
  const pages=Math.min(Math.ceil(max/perPage),5); // 안전상 최대 5페이지
  const tasks=[];
  for(let i=1;i<=pages;i++) tasks.push(callKstartup(key,{count:perPage,page:i}).catch(()=>[]));
  const results=await Promise.all(tasks);
  const all=results.flat();
  // 중복(pbanc_sn) 제거
  const seen=new Set(); const out=[];
  for(const p of all){ if(!seen.has(p.sourceProgramId)){ seen.add(p.sourceProgramId); out.push(p); } }
  return out;
}

export async function handler(){
  const key=process.env.KSTARTUP_API_KEY;
  if(!key) return json(200,{status:'NOT_CONFIGURED',source:'kstartup'});
  try{
    const programs=await callKstartup(key,{count:50});
    return json(200,{status:'READY',source:'kstartup',count:programs.length,programs});
  }catch(e){
    return json(200,{status:'ERROR',source:'kstartup',message:String(e.message||e)});
  }
}
const json=(code,body)=>({statusCode:code,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
