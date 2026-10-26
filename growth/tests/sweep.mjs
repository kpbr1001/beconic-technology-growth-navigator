// 전수 조합 점검: 6단계 × 11업종 × 간이/표준 × 응답 8패턴(1,056개)을 렌더해 예외·깨진 문구·중복·추천 부족을 찾는다.
// 실행: node growth/tests/sweep.mjs http://127.0.0.1:8792/
import { chromium } from 'playwright';
/* global OPT, QUESTIONS, renderResult -- page.evaluate 안에서 앱 전역 호출 */
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }); const pg = await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
await pg.goto(process.argv[2] || "http://127.0.0.1:8792/");
const r = await pg.evaluate(()=>{
  const out={n:0,bad:[],stats:{}}; const pats={
    all0:()=>0, all1:()=>1, all2:()=>2, all3:()=>3, mix:(q,i)=>i%4, rev:(q,i)=>3-(i%4), unk:(q,i)=>i%3?'u':1, na:(q)=>q.na?'na':2 };
  for(const st of OPT.stage.map(o=>o.v)) for(const ind of OPT.industry.map(o=>o.v)) for(const dp of ['quick','standard']) for(const [pn,pf] of Object.entries(pats)){
    const ans={}; QUESTIONS.forEach((q,i)=>{ans[q.id]=pf(q,i)});
    const d={name:'X',depth:dp,stage:st,ctype:'small',industry:ind,revenue:'r15',emp:'e59',customer:'b2b',concern:['org'],prep:[],ans,memo:{}};
    let html, diag;
    try{ diag=renderResult(d,false); html=document.getElementById('resultRoot').innerText; }catch(e){ out.bad.push([st,ind,dp,pn,'EXC '+e.message]); continue; }
    out.n++;
    const key=pn+'/'+dp; const s=out.stats[key]||(out.stats[key]={tot:[],conf:{},acts:[]});
    s.tot.push(diag.score.total); s.conf[diag.score.confidence.label]=(s.conf[diag.score.confidence.label]||0)+1; s.acts.push(diag.activities.length);
    if(/undefined|NaN|\[object|null점/.test(html)) out.bad.push([st,ind,dp,pn,'TXT '+(html.match(/.{20}(undefined|NaN|\[object|null점).{20}/)||[''])[0]]);
    const titles=diag.activities.map(a=>a.title); if(new Set(titles).size!==titles.length) out.bad.push([st,ind,dp,pn,'DUP']);
    if(diag.activities.length<3) out.bad.push([st,ind,dp,pn,'FEWACTS '+diag.activities.length]);
  }
  for(const k in out.stats){ const s=out.stats[k]; s.tot=[Math.min(...s.tot.map(x=>x??-1)),Math.max(...s.tot.map(x=>x??-1))]; s.acts=[Math.min(...s.acts),Math.max(...s.acts)]; }
  return out;
});
console.log('renders',r.n,'bad',r.bad.length); console.log(JSON.stringify(r.bad.slice(0,25))); console.log(JSON.stringify(r.stats,null,0)); console.log('pageerrors',errs.slice(0,3));
await b.close();
process.exit(r.bad.length || errs.length ? 1 : 0);
