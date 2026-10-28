// ============================================================================
// programs — 지원사업 목록 BFF (다중 소스 오케스트레이터)
// 소스: 기업마당(bizinfo) + K-Startup. 각각 표준 정규화 후 병합·중복제거.
// [선택] Claude로 자격조건 본문추출(enrich). 키 유무로 소스 자동 on/off.
// 프론트는 fetch('/.netlify/functions/programs')만.
// ============================================================================
import { collectBizinfo } from './bizinfo.mjs';
import { collectKstartup } from './kstartup.mjs';
import { extractEligibility, mergeEligibility } from './ai-analysis.mjs';

// 공고명 정규화(중복판정용): 공백·괄호·연도·부가어 제거
function normalizeName(name){
  return String(name||'')
    .replace(/\s+/g,'')
    .replace(/[\[\](){}]/g,'')
    .replace(/20\d{2}년?/g,'')
    .replace(/(모집|공고|안내|신청|참여기업|추가|재)+/g,'')  // 흔한 부가어 제거
    .replace(/(예비창업자|중소기업|소상공인)/g,'')            // 대상어 제거(공고명 중복 흔함)
    .toLowerCase();
}
function score(x){
  return (x.businessAgeMax!=null?1:0) + (x.applicationEnd?1:0) + (x.supportAmountMax?1:0)
       + (x.recruitInProgress?1:0) + (x.preStartupOnly?1:0) + (x.representativeAgeMax!=null?1:0)
       + (x.source==='kstartup'?0.5:0);  // 동점시 자격정보 풍부한 K-Startup 우선
}
function dedupe(programs){
  // 1) 정규화 완전일치
  const seen=new Map();
  for(const p of programs){
    const key=normalizeName(p.programName);
    if(!key){ seen.set(Math.random().toString(), p); continue; }
    if(!seen.has(key)) seen.set(key,p);
    else if(score(p)>score(seen.get(key))) seen.set(key,p);
  }
  let list=[...seen.values()];
  // 2) 부분일치(한쪽 이름이 다른쪽을 포함, 8자 이상) 병합
  list.sort((a,b)=>normalizeName(a.programName).length-normalizeName(b.programName).length);
  const out=[];
  for(const p of list){
    const pk=normalizeName(p.programName);
    const dup=out.find(o=>{ const ok=normalizeName(o.programName);
      return pk.length>=8 && ok.length>=8 && (pk.includes(ok)||ok.includes(pk)); });
    if(!dup){ out.push(p); }
    else if(score(p)>score(dup)){ out[out.indexOf(dup)]=p; }
  }
  return out;
}

export async function handler(event){
  const bizKey=process.env.BIZINFO_API_KEY;
  const ksKey=process.env.KSTARTUP_API_KEY;
  const aiKey=process.env.ANTHROPIC_API_KEY;
  const providers={
    bizinfo: bizKey?'READY':'NOT_CONFIGURED',
    kstartup: ksKey?'READY':'NOT_CONFIGURED',
    anthropic: aiKey?'READY':'NOT_CONFIGURED'
  };
  const anySource = bizKey || ksKey;
  if(!anySource){
    return json(200,{mode:'not_configured',providers,programs:[]});
  }

  const q=event?.queryStringParameters||{};
  // AI 키가 있으면 자동으로 정밀추출 활성화(명시적 enrich=0으로 끌 수 있음)
  const enrich = aiKey ? (q.enrich!=='0') : false;
  const enrichCount=Math.min(parseInt(q.enrichCount||'12',10)||12,30);
  const max=Math.min(parseInt(q.max||'400',10)||400,500);  // 넉넉히 수집(백그라운드)

  try{
    // 1) 소스별 병렬 대량 수집(하나 실패해도 나머지 사용)
    const tasks=[];
    if(bizKey) tasks.push(collectBizinfo(bizKey,{max}).then(r=>({src:'bizinfo',r})).catch(e=>({src:'bizinfo',r:[],err:String(e.message||e)})));
    if(ksKey)  tasks.push(collectKstartup(ksKey,{max:300}).then(r=>({src:'kstartup',r})).catch(e=>({src:'kstartup',r:[],err:String(e.message||e)})));
    const results=await Promise.all(tasks);

    const sourceCounts={};
    const errors={};
    let programs=[];
    for(const {src,r,err} of results){
      sourceCounts[src]=r.length;
      if(err) errors[src]=err;
      programs=programs.concat(r);
    }

    const totalCollected=programs.length;   // 수집 원본 총계

    // 2) 중복 제거
    const before=programs.length;
    programs=dedupe(programs);

    // 3) 접수중/유효 공고만 남김(마감 지난 것 제외) — '살아있는 공고' 중심
    const NOW=Date.now();
    const isAlive=(p)=>{
      if(p.recruitInProgress===false) return false;
      if(p.applicationEnd){
        const t=Date.parse(p.applicationEnd.replace(/-/g,'/'));
        if(!isNaN(t) && t < NOW) return false; // 마감 지남
      }
      return true; // 마감일 없음(상시)·미래마감·모집중
    };
    const aliveCount = programs.filter(isAlive).length;

    // 4) (선택) AI 자격추출 — 상위 enrichCount건
    let enriched=0;
    if(enrich && aiKey && programs.length){
      const targets=programs.slice(0,enrichCount);
      const settled=await Promise.allSettled(
        targets.map(p=>extractEligibility(aiKey,p).then(e=>({p,e})))
      );
      const map=new Map();
      for(const s of settled){
        if(s.status==='fulfilled'&&s.value?.e){ map.set(s.value.p.sourceProgramId,s.value.e); enriched++; }
      }
      programs=programs.map(p=>map.has(p.sourceProgramId)?mergeEligibility(p,map.get(p.sourceProgramId)):p);
    }

    return json(200,{
      mode:'live', providers,
      fetchedAt:new Date().toISOString(),
      sourceCounts, errors,
      dedupeRemoved: before-programs.length,
      totalCollected,      // 수집 원본 총계(후킹 숫자용)
      aliveCount,          // 현재 접수중/유효 공고 수
      count:programs.length, enriched,
      programs
    });
  }catch(e){
    return json(200,{mode:'error',providers,message:String(e.message||e),programs:[]});
  }
}
const json=(code,body)=>({statusCode:code,headers:{'content-type':'application/json','cache-control':'public, max-age=1800'},body:JSON.stringify(body)});
