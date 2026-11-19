/* BECONIC 창업 준비 가이드 — 화면 로직
   진단이 아니라 '준비 도구'다: 점수·등급을 매기지 않는다. 업종을 고르면 그 업종의 준비 서류·순서·코드·세금 혜택을
   기준일과 함께 보여 주고, 체크한 진행 상황은 이 기기(localStorage)에만 저장한다. 서버 전송 없음. */
'use strict';
(function(){
const D = window.PS_DATA;
const VERSION = '1.5.1';
const CONTACT = {tel:'02-6124-5960', email:'start@gven.kr', kakao:'https://pf.kakao.com/_WjMxeG/chat', web:'https://www.beconic.kr/',
  addr:'서울시 구로구 디지털로27길 24, 209호', cert:'제2025-684호', company:'그로스벤처스 주식회사'};
const MATCH_URL = 'https://beconic-grant-matching.netlify.app/';
const REGIONS = ['서울','경기','인천','부산','대구','광주','대전','울산','세종','강원','충북','충남','전북','전남','경북','경남','제주'];
const CAPITAL = ['서울','경기','인천'];
const IN_APP = /KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(navigator.userAgent||'');

/* ---------- 데이터 색인 ---------- */
const IND = D.industries;
const BY_ID = Object.create(null); IND.forEach(i=>{ BY_ID[i.id]=i; });
const GROUPS = D.groupOrder.filter(g=>IND.some(i=>i.group===g));
const inGroup = g => IND.filter(i=>i.group===g);
const NTS = D.nts.map(r=>({c:r[0], n:r[1], g:r[2], k:r[3], kn:r[4]||r[1]}));
const NTS_GROUPS = [...new Set(NTS.map(r=>r.g))];
const GUIDE_BY_NTS = Object.create(null); IND.forEach(i=>{ if(/^\d{6}$/.test(i.nts) && !GUIDE_BY_NTS[i.nts]) GUIDE_BY_NTS[i.nts]=i.id; });
const NTS_UNIQUE = new Set(NTS.map(r=>r.c)).size;

/* ---------- 기준일 ---------- */
const fmtDate = s => s.replace(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/, (m,y,mo,d)=> d ? `${y}.${mo}.${d}` : `${y}.${mo}`);
const BASE = fmtDate(D.meta.guideBaseDate);
const TAX_BASE = fmtDate(D.meta.taxBaseDate);
const TAX_NEXT = fmtDate(D.meta.taxNextCheck);
const CODE_Y = D.meta.codeYear;          // 업종코드 연계표 귀속연도
const RULE = D.meta.rules;               // 제도 기준값(사업자등록 기한·간이과세·청년 나이 등) — data.js 한 곳에서만
function taxExpired(now){ const [y,m]=D.meta.taxNextCheck.split('-').map(Number); const n=now||new Date(); return n.getFullYear()>y || (n.getFullYear()===y && n.getMonth()+1>=m); }

/* ---------- 저장(이 기기에만) ---------- */
const STORE = 'beconic_prestartup_v1';
const blank = () => ({me:{}, prog:{}, memo:{}, recent:[], meSkip:false, seen:{}, track:false});
let S = blank();
function load(){
  try{
    const p = JSON.parse(localStorage.getItem(STORE)||'null');
    if(p && typeof p==='object'){
      S.me = (p.me && typeof p.me==='object') ? sanitizeMe(p.me) : {};
      S.prog = {}; S.memo = {};
      for(const id of Object.keys(p.prog||{})) if(BY_ID[id]) S.prog[id] = {d:objBool(p.prog[id].d), s:objBool(p.prog[id].s)};
      for(const id of Object.keys(p.memo||{})) if(BY_ID[id] && typeof p.memo[id]==='string') S.memo[id]=p.memo[id].slice(0,2000);
      S.recent = Array.isArray(p.recent) ? p.recent.filter(id=>BY_ID[id]).slice(0,8) : [];
      S.meSkip = p.meSkip===true;
      S.track = p.track===true;
      S.seen = {};
      for(const id of Object.keys(p.seen||{})) if(BY_ID[id] && p.seen[id] && typeof p.seen[id]==='object') S.seen[id]={benefit:p.seen[id].benefit===true, finish:p.seen[id].finish===true};
    }
  }catch{ /* 저장 사용 불가(사생활 보호 모드 등) — 화면은 그대로 동작 */ }
}
function objBool(o){ const r={}; if(o && typeof o==='object') for(const k of Object.keys(o)) if(/^\d{1,3}$/.test(k) && o[k]===true) r[k]=true; return r; }
function save(){ try{ localStorage.setItem(STORE, JSON.stringify(S)); }catch{ /* 저장 생략 */ } }

/* ---------- 내 상황(선택 입력) ---------- */
const ME_Q = [
  {k:'age', l:'대표자 나이(창업일 기준)', h:`세액감면 청년 기준(만 ${RULE.youthTaxAgeMax}세)과 청년 지원사업 기준(대개 만 ${RULE.youthSupportAgeMax}세)이 달라요.`, o:[['u34',`만 ${RULE.youthTaxAgeMax}세 이하`],['u39',`만 ${RULE.youthTaxAgeMax+1}~${RULE.youthSupportAgeMax}세`],['o40',`만 ${RULE.youthSupportAgeMax+1}세 이상`]]},
  {k:'region', l:'사업장 시·도', h:'수도권은 창업 지역에 따라 세액감면율이 크게 달라요.', o:REGIONS.map(r=>[r,r])},
  {k:'space', l:'사업장 형태', h:'업종에 따라 자택·공유오피스로 등록이 안 될 수 있어요.', o:[['home','자택'],['rent','임차(사무실·점포·공장)'],['shared','공유오피스·비상주'],['own','자가(소유)']]},
  {k:'rev', l:'첫해 예상 매출', h:`간이과세(연 ${RULE.simpleVatLimit} 미만) 가능성을 안내해요.`, o:[['lt1','1억원 미만'],['gt1','1억원 이상'],['na','아직 모름']]},
  {k:'prior', l:'같은 업종으로 사업한 적', h:'같은 업종을 다시 시작하면 \'창업\'으로 보지 않을 수 있어요.', o:[['no','없어요'],['yes','있어요']]},
  {k:'female', l:'여성 대표인가요?', h:'여성기업 확인·여성창업 지원 우대 안내용이에요(선택).', o:[['y','네'],['n','아니요']]}
];
function sanitizeMe(m){
  const r={};
  for(const q of ME_Q){ if(q.o.some(([v])=>v===m[q.k])) r[q.k]=m[q.k]; }
  if(typeof m.open==='string' && /^\d{4}-\d{2}-\d{2}$/.test(m.open)){
    const d=new Date(m.open+'T00:00:00');   // 2026-02-30처럼 없는 날짜는 다른 날로 넘어가므로 왕복 비교로 거른다
    if(!isNaN(d) && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`===m.open) r.open=m.open;
  }
  return r;
}
const hasMe = () => Object.keys(S.me).length>0;

/* ---------- 유틸 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isCode = c => /^\d{6}$/.test(String(c||''));
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'), 2600); }
async function copyText(s){
  try{ await navigator.clipboard.writeText(s); return true; }
  catch{ try{ const ta=document.createElement('textarea'); ta.value=s; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); return ok; }catch{ return false; } }
}
const stripNum = s => String(s).replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
/* 서류 분류(2026-11-19 보완: 64개 업종 중 35개가 '필수 1개 이하'였음 — 영업등록 신청서·위생교육·보건증·신분증·임대차계약서가 '권장'으로 표시)
   해당 시 = 조건부(괄호로 시작·'○○ 시') / 권장 = 계획·실적·도면 등 보완 자료 / 필수 = 등록·신고·자격·사업장 증빙 */
const DOC_OPT = /^\(|\(해당|\(선택\)|해당 시|\(.{1,12} 시\)/;
const DOC_REC = /전문성|포트폴리오|실적|사업계획|평면도|배치도|설비 내역|약관|정책|거래 관련|기술·도면|채용|정산|관련 체계|관련 서류|관련 계약서|전속계약서/;
const DOC_MUST = /사업자등록|영업신고|영업등록|신청서|신고서|신고증|신고확인증|개설|등록증|허가|면허|자격증|자격 증빙|자격·등록|수료증|보건증|건강진단|신분증|임대차|등기부|공제증서|건축물대장|완비증명|구매안전|에스크로|등록기준|등록요건|기술인력|결제대행|품질관리 기준|GMP|품목제조|등급분류|차고지/;
function docTag(doc){
  if(DOC_OPT.test(doc)) return ['opt','해당 시'];
  if(DOC_REC.test(doc)) return ['rec','권장'];
  if(DOC_MUST.test(doc)) return ['must','필수'];
  return ['rec','권장'];
}
function progressOf(id){
  const it=BY_ID[id]; const p=S.prog[id]||{d:{},s:{}};
  const nd=it.docs.length, ns=(it.licenseProcess||[]).length;
  const dd=it.docs.filter((_,i)=>p.d[i]).length, ds=(it.licenseProcess||[]).filter((_,i)=>p.s[i]).length;
  const total=nd+ns, done=dd+ds;
  return {pct: total? Math.round(done/total*100):0, done, total, dd, ds, nd, ns};
}
function nextTodo(id){
  const it=BY_ID[id]; const p=S.prog[id]||{d:{},s:{}};
  const si=(it.licenseProcess||[]).findIndex((_,i)=>!p.s[i]);
  if(si>=0) return {kind:'s', i:si, text:stripNum(it.licenseProcess[si])};
  const di=it.docs.findIndex((d,i)=>!p.d[i] && docTag(d)[0]==='must');
  const dj=di>=0?di:it.docs.findIndex((_,i)=>!p.d[i]);
  if(dj>=0) return {kind:'d', i:dj, text:it.docs[dj]};
  return null;
}
const bizRegDue = open => addDays(open, RULE.bizRegDays);   // 사업자등록 신청 기한(사업 시작일 + N일)
const duePassed = open => { const t=new Date(); t.setHours(0,0,0,0); return bizRegDue(open) < t; };
const LAW = D.meta.deadlineLaws;
const md = mmdd => { const [m,d]=mmdd.split('-').map(Number); return `${m}월 ${d}일`; };
const hasIn = (it,re) => re.test(JSON.stringify([it.license,it.docs,it.licenseProcess]));
/* 법정 기한 — 법령에 정해진 순서·마감만(처리에 며칠 걸리는지 같은 추정 기간은 넣지 않는다) */
const atMD = (y, mmdd) => { const [m,d]=mmdd.split('-').map(Number); return new Date(y, m-1, d); };
const isPast = d => { const t=new Date(); t.setHours(0,0,0,0); return d < t; };
const LIC_NONE = /없음|불요/, LIC_COND = /^\(/;   // '별도 인허가 없음'·'(자격 불요)'는 빼고, '(해당 시)·(선택)·(품목별)…'은 해당될 때만
function deadlines(it){
  const out=[], open=S.me.open, od=open?new Date(open+'T00:00:00'):null, y=od?od.getFullYear():null;
  const lic=it.license.filter(l=>!/통신판매|위생교육/.test(l.name) && !LIC_NONE.test(l.name));   // 통신판매·위생교육은 아래 별도 항목
  const must=lic.filter(l=>!LIC_COND.test(l.name)), cond=lic.filter(l=>LIC_COND.test(l.name));
  if(hasIn(it,/위생교육/)) out.push({t:'위생교육 이수', when:'영업신고 전에 미리', law:/미용|숙박|피부|세탁/.test(it.name)?LAW.publicEdu:LAW.foodEdu});
  if(must.length) out.push({t:`인허가 받기 · ${must[0].name}${must.length>1?` 외 ${must.length-1}건`:''}`, when:'사업자등록 신청 전(신청 때 허가·신고·등록증 사본 제출)', law:LAW.licenseFirst, note: cond.length?`해당되면 함께: ${cond.map(l=>l.name).join(', ')}`:''});
  else if(cond.length) out.push({t:`해당되면 신고·등록 · ${cond.map(l=>l.name).join(', ')}`, when:'해당될 때만 · 사업자등록 신청 전', law:LAW.licenseFirst});
  if(hasIn(it,/통신판매/)) out.push({t:'통신판매업 신고', when:'온라인 판매를 시작하기 전(온라인으로 팔 때)', law:LAW.ecommerce});
  out.push({t:'사업자등록 신청', when: od?`${ymd(bizRegDue(open))}까지`:`사업 시작일부터 ${RULE.bizRegDays}일 안에(시작 전에도 가능)`, law:LAW.bizReg, late: od&&duePassed(open)});
  const simple=S.me.rev==='lt1';
  const genD = od ? (od.getMonth()<6 ? atMD(y, RULE.vatGeneralH1Due) : atMD(y+1, RULE.vatGeneralH2Due)) : null, simD = od ? atMD(y+1, RULE.vatSimpleDue) : null;
  const vatGen = od ? `${genD.getFullYear()}년 ${md(od.getMonth()<6?RULE.vatGeneralH1Due:RULE.vatGeneralH2Due)}(${od.getMonth()<6?'1~6월분':'7~12월분'})` : `반기마다 ${md(RULE.vatGeneralH1Due)}·${md(RULE.vatGeneralH2Due)}`;
  const vatSim = od ? `${y+1}년 ${md(RULE.vatSimpleDue)}(1년분)` : `다음 해 ${md(RULE.vatSimpleDue)}(1년에 한 번)`;
  out.push({t:'첫 부가가치세 확정신고',
    when: simple?`간이과세자 ${vatSim} · 간이과세가 안 되는 업종·지역이면 일반과세자 ${vatGen}`:`일반과세자 ${vatGen} · 간이과세자 ${vatSim}`,
    law:`${LAW.vatGeneral}·${LAW.vatSimple}`, late: od && isPast(simple?simD:genD),
    note:`법인은 확정신고 전 ${RULE.vatCorpPrelimDue.map(md).join('·')} 예정신고도 해요(${LAW.vatPrelim}). 면세 사업자는 부가세 대신 다음 해 ${md(RULE.bizStatusReportDue)}까지 사업장현황신고(${LAW.bizStatus})`});
  out.push({t:'첫 종합소득세 신고(개인사업자)', when: od?`${y+1}년 ${md(RULE.incomeTaxDue)}까지`:`개업 다음 해 ${md(RULE.incomeTaxDue)}까지`, law:LAW.incomeTax, late: od && isPast(atMD(y+1, RULE.incomeTaxDue)),
    note:`성실신고확인 대상은 ${md(RULE.incomeTaxFaithfulDue)}까지 · 법인은 사업연도가 끝나고 ${RULE.corpTaxMonths}개월 안에 법인세(${LAW.corpTax}). 창업 세액감면은 이 신고 때 신청해요`});
  return out;
}
const PASSED_MSG = '이미 지난 기한이에요. 개업했다면 바로 신청하세요(늦으면 가산세가 붙을 수 있어요). 아직 개업 전이면 내 상황에서 개업 예정일을 고쳐 주세요.';
function addDays(iso, n){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return d; }
const ymd = d => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

/* ---------- 검색 ---------- */
const SYN = [[/쇼핑몰|스마트스토어|온라인\s*판매|오픈마켓/,'전자상거래'],[/유튜브|유튜버|인플루언서|크리에이터/,'크리에이터'],[/커피|카페/,'카페'],[/앱|어플|웹\s*개발/,'소프트웨어'],
  [/헬스|피트니스|PT/i,'체력단련'],[/네일|속눈썹|왁싱/,'피부미용'],[/학원|과외|공부방/,'학원'],[/인테리어/,'인테리어'],[/빵|베이커리/,'제과'],[/술집|호프|이자카야/,'주점'],[/라이브\s*커머스|공구|공동구매/,'SNS']];
const norm = s => String(s||'').toLowerCase().replace(/\s+/g,'');
function expandQ(q){ const qs=[norm(q)]; for(const [re,w] of SYN) if(re.test(q)) qs.push(norm(w)); return [...new Set(qs)].filter(Boolean); }
function searchGuides(q){
  const qs=expandQ(q); if(!qs.length) return [];
  return IND.map(it=>{
    const hay=norm(it.name+' '+it.bizItem+' '+it.ksicName); const hay2=norm(it.summary);
    let sc=0; for(const x of qs){ if(norm(it.name).includes(x)) sc+=3; else if(hay.includes(x)) sc+=2; else if(hay2.includes(x)) sc+=1; if(it.nts===x||String(it.ksic)===x) sc+=4; }
    return {it, sc};
  }).filter(r=>r.sc>0).sort((a,b)=>b.sc-a.sc).map(r=>r.it);
}
function searchCodes(q, group){
  const raw=String(q||'').trim(); const digits=/^\d+$/.test(raw);
  const qs=digits?[raw]:expandQ(raw);
  const seen=new Set(); const out=[];
  for(const r of NTS){
    if(group && r.g!==group) continue;
    let hit = !raw;
    if(!hit) hit = digits ? (r.c.startsWith(raw)||r.k.startsWith(raw)) : qs.some(x=>norm(r.n+' '+r.kn).includes(x));
    if(!hit) continue;
    const key=r.c+'|'+r.n; if(seen.has(key)) continue; seen.add(key);
    out.push(r);
  }
  return out;
}

/* ---------- 지원사업 MATCH 연결(예비창업자 유형) ---------- */
const MATCH_IND_GROUP = {'제조업':'제조업','도소매업':'도소매업','정보통신업':'정보통신(ICT)','음식점업':'음식점업(F&B)','숙박업':'관광·MICE·숙박','전문서비스업':'지식서비스(컨설팅·HR)',
  '사업서비스업':'서비스업(기타)','교육서비스업':'교육(에듀테크)','건설업':'건설·건축','운수업':'물류·유통','부동산업':'부동산(프롭테크)','개인서비스업':'서비스업(기타)','보건업':'의료기기·헬스케어','대중문화산업':'문화·예술·미디어'};
const MATCH_IND_ID = {cosmetic_mfg:'뷰티·화장품',cosmetic_retail:'뷰티·화장품',skincare:'뷰티·화장품',health_food_mfg:'기능성식품',health_food_retail:'기능성식품',game_dev:'게임·콘텐츠',
  content:'게임·콘텐츠',creator:'게임·콘텐츠',design:'디자인',data_service:'AI·빅데이터',it_service:'SW·시스템통합',software:'SW·시스템통합',machine_mfg:'기계·장비',metal_fab:'금속·소재 성형가공',
  plastic_mfg:'화학·섬유',medical_device:'의료기기·헬스케어',agri_wholesale:'농림수산업',logistics:'물류·유통',delivery:'물류·유통',clinic:'서비스업(기타)',vet:'서비스업(기타)'};
function matchUrl(it){
  const q=new URLSearchParams({t:'founder'});
  const ind=MATCH_IND_ID[it.id]||MATCH_IND_GROUP[it.group]; if(ind) q.set('i', ind);
  if(S.me.region) q.set('r', S.me.region);
  return MATCH_URL+'?'+q.toString();
}

/* ---------- 내 상황 맞춤 안내 (사실 안내만, 판정·점수 없음) ---------- */
const FACILITY_GROUPS = ['음식점업','제조업','숙박업','교육서비스업','보건업'];
function situationNotes(it){
  const m=S.me, out=[];
  if(m.age==='u34') out.push(['blue','🎯',`<b>세액감면 '청년' 기준(창업일 기준 만 15~${RULE.youthTaxAgeMax}세)</b>에 해당할 수 있어요. ${RULE.startupTaxFrom} 이후 창업분은 창업 지역에 따라 감면율이 ${RULE.startupTaxYouthRange}로 달라져요. 만 ${RULE.youthSupportAgeMax}세 이하 대상 청년 창업지원사업도 함께 살펴보세요.`]);
  if(m.age==='u39') out.push(['','🎯',`세액감면의 청년 기준(만 ${RULE.youthTaxAgeMax}세)은 넘지만 <b>병역을 이행했다면 최대 ${RULE.militaryDeductMaxYears}년을 빼고</b> 나이를 계산해요. 만 ${RULE.youthSupportAgeMax}세 이하 대상 청년 창업지원사업(예: 청년창업사관학교)은 해당될 수 있어요.`]);
  if(m.region && CAPITAL.includes(m.region)) out.push(['warn','📍',`<b>${esc(m.region)}(수도권)</b>은 같은 시·도 안에서도 과밀억제권역인지, 인구감소지역인지에 따라 창업중소기업 세액감면율이 달라요. 사업장 주소를 정하기 전에 세무서·세무사에게 확인하세요.`]);
  else if(m.region) out.push(['','📍',`<b>${esc(m.region)}(비수도권)</b>은 ${RULE.startupTaxFrom} 이후 창업분 기준 청년 창업 세액감면율이 가장 높은 구간(${RULE.startupTaxNonCapitalYouth})이에요. 청년 외에는 율이 낮아요.`]);
  if(m.space==='home' && FACILITY_GROUPS.includes(it.group)) out.push(['warn','🏠',`<b>${esc(it.group)}</b>은 시설 기준이 있어 <b>자택으로는 영업신고·등록이 어려운 경우가 많아요.</b> 사업장 후보부터 정해 주세요.`]);
  else if(m.space==='home') out.push(['','🏠','자택을 사업장으로 등록할 수 있는 업종이에요. 다만 임대주택·오피스텔은 계약상 사업자등록이 제한될 수 있어 집주인 동의를 확인하세요.']);
  if(m.space==='rent') out.push(['warn','📑','<b>임대차 계약 전에 건축물대장 용도</b>(세움터)를 확인하세요. 용도가 업종과 맞지 않으면 영업신고·등록이 반려돼요. 계약서에 \'인허가 불가 시 계약 해제\' 특약을 넣는 것도 방법이에요.']);
  if(m.space==='shared') out.push(['warn','🏢','공유오피스·비상주 사무실은 업종에 따라 사업자등록이 안 되거나 세무서가 실제 사업장 확인을 요구할 수 있어요. 지원사업도 \'사업장 소재지\' 요건을 따로 봐요.']);
  if(m.space==='own') out.push(['','🏠','자가 사업장은 취득세·재산세와 감가상각·이자 비용 처리를 함께 검토하세요. 주거와 함께 쓰면 비용을 나눠 처리해야 해요.']);
  if(m.rev==='lt1') out.push(['','💵',`첫해 매출이 연 ${RULE.simpleVatLimit} 미만이면 <b>간이과세</b>로 시작할 수 있어요. 다만 일부 업종(전문직 서비스·일정 제조업 등)과 지역은 안 되고, 세금계산서를 받는 거래처가 많다면 일반과세가 나을 수 있어요.`]);
  if(m.rev==='gt1') out.push(['','💵','연 매출 1억원 이상이면 <b>일반과세자</b>로 시작하는 게 보통이에요. 매입 세금계산서를 꼼꼼히 받아 두면 부가세를 줄일 수 있어요.']);
  if(m.prior==='yes') out.push(['warn','⚠️','같은 업종 사업 이력이 있으면 <b>창업중소기업 세액감면의 \'창업\'으로 인정되지 않을 수 있어요</b>(사업 승계·이전·같은 업종 재개 등). 등록 전에 세무사에게 확인하세요.']);
  if(m.female==='y') out.push(['','👩‍💼','여성 대표는 사업 개시 후 <b>여성기업 확인</b>(여성기업종합정보포털)을 받으면 여성창업 지원사업·공공구매 우대를 받을 수 있어요.']);
  if(m.open){
    const due=bizRegDue(m.open);
    if(duePassed(m.open)) out.push(['warn','⏰',`<b>사업자등록 기한(${ymd(bizRegDue(m.open))})이 지났어요.</b> ${PASSED_MSG.replace('이미 지난 기한이에요. ','')}`]);
    else out.push(['blue','🗓️',`개업 예정일 <b>${esc(ymd(new Date(m.open+'T00:00:00')))}</b> 기준, 사업자등록은 <b>${ymd(due)}까지</b> 신청하세요(사업 시작일부터 ${RULE.bizRegDays}일 이내 · 시작 전에도 신청 가능). 인허가가 필요한 업종은 허가·신고증을 먼저 받아야 해요.`]);
  }
  return out;
}

/* ---------- 내비 ---------- */
function setTab(tab){
  document.querySelectorAll('[data-tab]').forEach(a=>{ if(a.dataset.tab===tab) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
}
function footer(){
  $('#foot').innerHTML = `<b>${CONTACT.company}</b> · 중소벤처기업부 공식 인증 중소기업상담회사(${CONTACT.cert})<br>
    ${CONTACT.addr} · <a href="tel:${CONTACT.tel.replace(/-/g,'')}">${CONTACT.tel}</a> · <a href="mailto:${CONTACT.email}">${CONTACT.email}</a> · <a href="${CONTACT.web}" target="_blank" rel="noopener">www.beconic.kr</a><br>
    창업 준비 가이드 v${VERSION} · 자료 기준일 ${BASE} · 세제 ${TAX_BASE} 법령 기준 · 업종코드 ${CODE_Y}년 귀속 연계표 · 입력·체크 내용은 이 기기에만 저장돼요.`;
}

/* ---------- 라우터 (해시: 뒤로가기·링크 공유 지원) ---------- */
let scrollSpy=null;
function parse(){
  const h=location.hash.replace(/^#/,'')||'/';
  const [path, qs]=h.split('?');
  const parts=path.split('/').filter(Boolean).map(s=>{ try{ return decodeURIComponent(s); }catch{ return ''; } });
  return {parts, q:new URLSearchParams(qs||'')};
}
function render(){
  if(scrollSpy){ scrollSpy.disconnect(); scrollSpy=null; }
  document.body.classList.remove('has-cta','wizard');
  const {parts, q}=parse();
  const [a,b]=parts;
  if(a==='g' && GROUPS.includes(b)) return renderGroup(b);
  if(a==='start' && BY_ID[b]){ location.replace(`#/me?next=${b}`); return; }   // 업종을 고르면 항상 ② 내 상황(지난 입력은 미리 채워 확인·수정)
  if(a==='guide' && BY_ID[b]) return renderGuide(b, GSTEPS.some(x=>x.k===parts[2])?parts[2]:'prepare');
  if(a==='search') return renderSearch(q.get('q')||'', q.get('g')||'');
  if(a==='finder') return renderFinder(q);
  if(a==='my') return renderMy();
  if(a==='me') return renderMe(BY_ID[q.get('next')] ? q.get('next') : '');
  return renderHome();
}
function mount(html, tab, title){
  setTab(tab);
  $('#view').innerHTML=html;
  document.title = title ? `${title} · BECONIC 창업 준비 가이드` : 'BECONIC 창업 준비 가이드 · 업종별 서류·인허가·세금 혜택 정리';
}
let pendingFocus=null;
function afterNav(){
  if(pendingFocus){
    const t=document.getElementById(pendingFocus); pendingFocus=null;
    if(t){ t.scrollIntoView({block:'start'}); t.classList.add('flash'); setTimeout(()=>t.classList.remove('flash'), 1600); t.setAttribute('tabindex','-1'); t.focus({preventScroll:true}); return; }
  }
  window.scrollTo(0,0);
}
function meChips(){
  const t=ME_Q.filter(q=>S.me[q.k]).map(q=>q.o.find(o=>o[0]===S.me[q.k])[1]);
  if(S.me.open) t.push('개업 예정 '+ymd(new Date(S.me.open+'T00:00:00')));
  return t;
}

/* ---------- 홈 ---------- */
function renderHome(){
  const recent=S.recent.filter(id=>BY_ID[id]);
  mount(`
  ${stepper('pick')}
  <section class="hero">
    <div class="eyebrow">예비창업자용 · 회원가입 없음 · 무료</div>
    <h1 class="h-xl">업종만 고르면<br>창업 준비물을 정리해 드려요</h1>
    <p class="lead">준비 서류, 인허가·신고 순서, 업종코드, 세금 혜택까지 한 화면에. 체크하면서 하나씩 끝내 보세요.</p>
    <div class="basebar" title="세제 정보 ${TAX_BASE} 법령 기준 · 업종코드 ${CODE_Y}년 귀속 연계표"><i></i>자료 기준일 ${BASE}</div>
    <form class="search" role="search" id="homeSearch">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <label class="sr" for="hq">업종 검색</label>
      <input id="hq" type="search" enterkeyhint="search" autocomplete="off" placeholder="업종 검색 (예: 카페, 쇼핑몰, 앱)">
    </form>
    <div class="quick" aria-label="자주 찾는 업종">${['카페','온라인 쇼핑몰','소프트웨어','미용실','음식점','유튜브'].map(w=>`<button type="button" data-q="${esc(w)}">${esc(w)}</button>`).join('')}</div>
    <a class="finder-cta" href="#/finder"><span><b>업종 이름을 모르겠다면</b>질문 3개로 맞는 업종을 찾아 드려요</span><span aria-hidden="true">›</span></a>
    <div id="homeResults"></div>
  </section>

  ${recent.length?`<div class="sec-title"><h2>최근 본 업종</h2><a class="small muted" href="#/my">내 준비함 ›</a></div>
  <div class="recent">${recent.map(id=>recentCard(id)).join('')}</div>`:''}
  <div class="sec-title"><h2>업태에서 고르기</h2><span class="small muted">${IND.length}개 업종 가이드</span></div>
  <div class="groups">${GROUPS.map(g=>`<a class="gcard" href="#/g/${encodeURIComponent(g)}"><span class="gi" aria-hidden="true">${D.groupMeta[g]}</span><b>${esc(g)}</b><span>${inGroup(g).length}개 업종</span></a>`).join('')}</div>
  <div class="sec-title"><h2>이 가이드는 이렇게 달라요</h2></div>
  <div class="values">
    <div class="value"><div class="vn">순서대로</div><b>무엇부터 할지 알려 드려요</b><p>위생교육 → 영업신고 → 사업자등록처럼 업종별 진행 순서와 '지금 할 일'을 보여 줘요.</p></div>
    <div class="value"><div class="vn">기준일 표기</div><b>언제 기준 정보인지 밝혀요</b><p>세제는 ${TAX_BASE} 법령, 업종코드는 ${CODE_Y}년 귀속 연계표 기준. 점검 주기가 지나면 화면에서 알려 드려요.</p></div>
    <div class="value"><div class="vn">이어서 준비</div><b>체크하면 이 기기에 남아요</b><p>가입 없이 진행률이 저장되고, 링크·PDF로 공유할 수 있어요. 입력값은 서버로 보내지 않아요.</p></div>
  </div>
  <div class="card" style="margin-top:12px"><div class="expert">
    <div class="et"><b style="font-size:16px">업종코드만 알고 싶다면</b><p class="small muted" style="margin-top:4px">국세청 업종코드 ${NTS_UNIQUE.toLocaleString()}개를 업종명·코드로 바로 찾아 복사할 수 있어요.</p></div>
    <a class="btn btn-soft" href="#/search">업종코드 찾기</a></div></div>`, 'home');
  const inp=$('#hq'), box=$('#homeResults');
  const run=()=>{ const v=inp.value.trim(); box.innerHTML = v ? homeResults(v) : ''; };
  inp.addEventListener('input', run);
  $('#homeSearch').addEventListener('submit', e=>{ e.preventDefault(); const r=searchGuides(inp.value); if(r.length===1) location.hash='#/start/'+r[0].id; else run(); inp.blur(); });
  document.querySelectorAll('.quick [data-q]').forEach(b=>b.addEventListener('click', ()=>{ inp.value=b.dataset.q; run(); box.scrollIntoView({behavior:'smooth', block:'nearest'}); }));
}
function recentCard(id){
  const p=progressOf(id), tracked=p.done>0;
  return `<div class="rcard"><a href="#/guide/${id}/prepare"><span class="small muted">${esc(BY_ID[id].group)}</span><b>${esc(BY_ID[id].name)}</b><span class="small muted">${tracked?`${p.done}/${p.total} 체크`:'결과 다시 보기'}</span>${tracked?`<div class="bar"><i style="width:${p.pct}%"></i></div>`:''}</a>
    <button type="button" class="rdel" data-del="${id}" aria-label="${esc(BY_ID[id].name)} 목록에서 삭제">✕</button></div>`;
}
function deleteGuide(id){
  const has=(S.prog[id]&&progressOf(id).done)||S.memo[id];
  if(has && !confirm(`${BY_ID[id].name}의 체크·메모도 함께 지울까요?`)) return false;
  S.recent=S.recent.filter(x=>x!==id); delete S.prog[id]; delete S.memo[id]; delete S.seen[id]; save(); return true;
}
function homeResults(v){
  const g=searchGuides(v).slice(0,8);
  const codes=searchCodes(v).slice(0,5);
  if(!g.length && !codes.length) return `<div class="list" style="margin-top:12px"><div class="empty">'${esc(v)}'와 맞는 업종이 없어요.<br>다른 말로 찾거나 아래 업태에서 골라 주세요.</div></div>`;
  return `<div class="list" style="margin-top:12px">
    ${g.length?`<div class="list-h">업종 가이드 ${g.length}개</div>${g.map(itemHTML).join('')}`:''}
    ${codes.length?`<div class="list-h">국세청 업종코드</div>${codes.map(codeRow).join('')}
      <a class="item" href="#/search?q=${encodeURIComponent(v)}"><span class="ib"><b style="color:var(--primary-strong);font-size:15px">업종코드 더 보기</b></span><span class="ar">›</span></a>`:''}
  </div>`;
}
function itemHTML(it){
  const p=S.prog[it.id]?progressOf(it.id):null;
  return `<a class="item" href="#/start/${it.id}"><span class="ii" aria-hidden="true">${D.groupMeta[it.group]||'📄'}</span>
    <span class="ib"><b>${esc(it.name)}</b><span>${p&&p.done?`<span style="color:var(--primary-strong);font-weight:700">${p.pct}% 준비 · </span>`:''}${esc(it.summary)}</span></span><span class="ar" aria-hidden="true">›</span></a>`;
}
function codeRow(r){
  const gid=GUIDE_BY_NTS[r.c];
  return `<div class="code-row"><span class="cn mono">${esc(r.c)}</span><span class="cb"><b>${esc(r.n)}</b><span>KSIC ${esc(r.k)} · ${esc(r.g)}</span></span>
    <span class="acts">${gid?`<a class="btn btn-soft btn-sm" href="#/start/${gid}">가이드</a>`:''}<button class="btn btn-gray btn-sm" type="button" data-copy="${esc(r.c)}" aria-label="업종코드 ${esc(r.c)} 복사">복사</button></span></div>`;
}

/* ---------- 업태 → 업종 ---------- */
function renderGroup(g){
  const list=inGroup(g);
  mount(`${stepper('pick', null, g)}<div class="wrap-narrow">
    <a class="btn btn-gray btn-sm no-print" href="#/">‹ 업태 다시 고르기</a>
    <div style="margin:18px 4px 16px"><div class="eyebrow">${D.groupMeta[g]} ${esc(g)}</div><h1 class="h-lg" style="margin-top:6px">어떤 사업에 가장 가까운가요?</h1>
    <p class="muted" style="margin-top:6px">${list.length}개 업종 중에서 고르면 바로 준비 가이드가 열려요.</p></div>
    <div class="list">${list.map(itemHTML).join('')}</div>
    <div class="card" style="margin-top:12px"><b>찾는 업종이 없나요?</b><p class="small muted" style="margin:4px 0 12px">국세청 업종코드 ${NTS_UNIQUE.toLocaleString()}개에서 직접 찾아보세요. 가이드가 있는 업종은 바로 연결돼요.</p>
    <div class="row"><a class="btn btn-soft btn-sm" href="#/finder">질문으로 찾기</a><a class="btn btn-gray btn-sm" href="#/search">업종코드 찾기</a></div></div></div>`, 'home', g);
}

/* ---------- 가이드 ---------- */

/* 입력은 단계(① 업종 → ② 내 상황 → ③ 결과), 결과는 탭(준비물 · 혜택·지원 · 저장·상담) */
const GSTEPS = [
  {k:'prepare', n:1, l:'준비물', d:'진행 순서 · 준비 서류 · 인허가', secs:['me','deadline','steps','docs','license','ask','pit']},
  {k:'benefit', n:2, l:'혜택·지원', d:'업종코드 · 세금 혜택 · 지원사업', secs:['code','tax','support','expand']},
  {k:'finish',  n:3, l:'저장·상담', d:'PDF · 전문가 확인 · 신청 사이트', secs:['finish','sites','memo','about']}
];
const JOURNEY = [['pick','업종 고르기'],['me','내 상황'],['result','결과 보기']];
function stepState(id){
  return {pick:!!id, me:hasMe()||S.meSkip, result:false};
}
function stepHref(k,id,group){
  if(k==='pick') return group?`#/g/${encodeURIComponent(group)}`:'#/';
  if(!id) return null;
  if(k==='me') return `#/me?next=${id}`;
  return `#/guide/${id}/prepare`;
}
function stepper(cur, id, group){
  const st=stepState(id);
  return `<nav class="jstep no-print" aria-label="진행 단계"><ol>${JOURNEY.map(([k,l],i)=>{
    const href=stepHref(k,id,group), on=k===cur, done=st[k]&&!on;
    const inner=`<b>${done?'✓':i+1}</b><em class="js-l">${l}</em>`;
    return `<li class="${on?'on':''} ${done?'done':''}">${href&&!on?`<a href="${href}">${inner}</a>`:`<span class="js-i" ${on?'aria-current="step"':''}>${inner}</span>`}</li>`;
  }).join('')}</ol><p class="js-cur">${JOURNEY.findIndex(x=>x[0]===cur)+1}/${JOURNEY.length} 단계 · <strong>${JOURNEY.find(x=>x[0]===cur)[1]}</strong></p></nav>`;
}
const NAV_EXTRA = [['me','맞춤 안내']];
const SECS = [
  ['deadline','법정 기한'],['steps','진행 순서'],['docs','준비 서류'],['license','인허가·신고'],['code','업종코드'],['tax','세금 혜택'],['support','지원사업'],
  ['ask','미리 답할 질문'],['pit','놓치기 쉬운 점'],['expand','함께 등록·확장'],['sites','신청 사이트'],['memo','내 메모'],['about','자료 기준']
];
function renderGuide(id, step){
  const it=BY_ID[id];
  const G=GSTEPS.find(x=>x.k===step)||GSTEPS[0];
  S.recent=[id, ...S.recent.filter(x=>x!==id)].slice(0,8);
  if(G.k!=='prepare'){ S.seen[id]={...(S.seen[id]||{}), [G.k]:true}; }
  save();
  const p=S.prog[id]||{d:{},s:{}};
  const pr=progressOf(id);
  const nx=nextTodo(id);
  const notes=hasMe()?situationNotes(it):[];
  const exp=taxExpired();
  const codeOk=isCode(it.nts);
  const related=[...(it.relatedCodes||[]), ...(it.linkedOfficial||[])].filter((x,i,a)=>a.findIndex(y=>y.nts===x.nts)===i && x.nts!==it.nts);
  const n = k => { const g=GSTEPS.find(x=>x.secs.includes(k)); return g ? g.secs.filter(x=>x!=='me'&&x!=='finish').indexOf(k)+1 : ''; };
  const secHead = (k, extra) => `<div class="sec-h"><span class="sn">${n(k)}</span><h2>${SECS[n(k)-1][1]}</h2>${extra||''}</div>`;
  const reviewed = it.reviewStatus==='검수완료';

  mount(`
  ${stepper('result', id, it.group)}
  <div class="guide">
    <aside class="lnav" aria-label="가이드 목차">
      <div class="ln-t">${esc(it.name)}</div>
      ${GSTEPS.map(g=>`<a class="ln-step ${g.k===G.k?'cur':''}" href="#/guide/${id}/${g.k}"><i>${g.n}</i>${g.l}${g.k==='prepare'&&S.track?`<em>${pr.pct}%</em>`:''}</a>${g.k!==G.k?'':[...NAV_EXTRA, ...SECS, ['finish','준비 마무리']].filter(([k])=>g.secs.includes(k)).map(([k,l])=>{
        const done = S.track && (k==='steps'&&pr.ns&&pr.ds===pr.ns)||(S.track && k==='docs'&&pr.nd&&pr.dd===pr.nd);
        const cnt = k==='steps'?(S.track?`${pr.ds}/${pr.ns}`:pr.ns): k==='docs'?(S.track?`${pr.dd}/${pr.nd}`:pr.nd): k==='license'?it.license.length: k==='me'?(hasMe()?notes.length:'선택'): '';
        return `<a class="ln-sub" href="#sec-${k}" data-sec="${k}">${l}${done?`<i class="dn" aria-label="완료">✓</i>`:cnt!==''?`<em>${cnt}</em>`:''}</a>`;
      }).join('')}`).join('')}
      <div class="ln-sep"></div>
      <div class="ln-act">
        <button class="btn btn-gray btn-sm btn-block" type="button" data-act="print">${IN_APP?'요약 복사':'PDF 저장'}</button>
        <a class="btn btn-gray btn-sm btn-block" href="#/g/${encodeURIComponent(it.group)}">다른 업종 고르기</a>
      </div>
    </aside>
    <div class="gbody">
      <div class="print-only phead"><b>BECONIC 창업 준비 체크리스트</b><span>출력 ${ymd(new Date())} · 자료 기준일 ${BASE} · 세제 ${TAX_BASE} 법령 기준 · 업종코드 ${CODE_Y}년 귀속 연계표</span></div>
      <section class="card ghero print-only">
        <div class="eyebrow">${D.groupMeta[it.group]||''} ${esc(it.group)} · 창업 준비 가이드</div>
        <h1 class="h-lg">${esc(it.name)}</h1>
        <p class="lead">${esc(it.summary)}</p>
        <div class="chips">
          ${codeOk?`<span class="chip blue">국세청 <span class="mono">${esc(it.nts)}</span></span>`:`<span class="chip warn">업종코드 홈택스 조회 필요</span>`}
          ${/\d/.test(it.ksic)?`<span class="chip">KSIC <span class="mono">${esc(it.ksic)}</span></span>`:''}
          <span class="chip">업태 · ${esc(it.bizType)}</span>
          <span class="chip ${reviewed?'ok':''}" title="${reviewed?'전문가 검수 완료':'BECONIC 내부 정리 자료 — 업종별 전문가 검수 전'}">${reviewed?'✓ 전문가 검수':'내부 정리 · 검수 전'}</span>
        </div>
        <div class="meta"><span>📅 자료 기준일 <b>${BASE}</b></span><span>세제 <b>${TAX_BASE}</b> 법령 기준</span><span>업종코드 <b>${CODE_Y}년 귀속</b> 연계표</span></div>
      </section>

      ${printSummary(it, pr)}
      ${resultSummary(it, notes)}
      <nav class="rtabs no-print" aria-label="결과 탭" role="tablist">${GSTEPS.map(g=>`<a role="tab" href="#/guide/${id}/${g.k}" class="${g.k===G.k?'on':''}" aria-selected="${g.k===G.k}"><b>${g.l}</b><span>${g.d}</span></a>`).join('')}</nav>
      ${G.k==='finish'?printSummary(it, pr, true):''}
      ${S.track?'':'<!--'}<section class="card no-print" data-only="prepare" aria-label="준비 진행률">
        <div class="prog"><div class="pn">${pr.pct}<small>%</small></div><div class="pt"><b>${pr.pct===100?'준비를 모두 체크했어요':'준비 진행률'}</b><span>순서 ${pr.ds}/${pr.ns} · 서류 ${pr.dd}/${pr.nd} 체크 · 이 기기에 저장돼요</span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.pct}" aria-label="준비 진행률"><i style="width:${pr.pct}%"></i></div></div>
        ${nx?`<div class="next"><span class="nl">지금 할 일</span><span class="nt">${esc(nx.text)}</span><button class="btn btn-primary btn-sm" type="button" data-next="${nx.kind}${nx.i}">완료</button></div>`
          :`<div class="next done"><span class="nl">다음 단계</span><span class="nt">${S.me.open?`사업자등록은 <b>${ymd(bizRegDue(S.me.open))}까지</b> · `:''}지원사업과 전문가 확인으로 마무리하세요</span><a class="btn btn-primary btn-sm" href="#/guide/${id}/benefit">혜택·지원 보기</a></div>`}
        <div class="acts-row">
          <button class="btn btn-gray btn-sm" type="button" data-act="print">${IN_APP?'요약 복사':'PDF 저장'}</button>
        </div>
      </section>${S.track?'':'-->'}

      ${notes.length?`<section class="card sec" id="sec-me" aria-label="내 상황 맞춤 안내"><div class="sec-h"><span class="sn">★</span><h2>내 상황 맞춤 안내</h2><a class="btn btn-soft btn-sm no-print" href="#/me?next=${it.id}">내 상황 수정</a></div>
        <div class="row mechips">${meChips().map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>
        ${notes.map(([c,i,t])=>`<div class="notice ${c}"><span class="ni" aria-hidden="true">${i}</span><span>${t}</span></div>`).join('')}
        <p class="note">입력하신 내용으로 확인할 점을 골라 보여 드리는 안내예요. 적용 여부는 관할 기관·전문가 확인이 필요해요.</p></section>`
      :`<section class="card sec no-print" id="sec-me"><div class="expert"><div class="et"><b style="font-size:16px">내 상황을 넣으면 맞춤 안내가 붙어요</b><p class="small muted" style="margin-top:4px">나이·지역·사업장·예상 매출 — 30초, 전부 선택이에요. 세액감면 청년 기준, 자택 등록 가능 여부, 사업자등록 기한을 알려 드려요.</p></div>
        <a class="btn btn-soft" href="#/me?next=${it.id}">30초 입력</a></div></section>`}

      <section class="card sec" id="sec-deadline" aria-label="법정 기한">${secHead('deadline', S.me.open?`<span class="cnt">개업 ${ymd(new Date(S.me.open+'T00:00:00'))} 기준</span>`:`<a class="link-btn no-print" href="#/me?next=${id}">개업 예정일 넣기</a>`)}
        <p class="sec-d">법령에 정해진 순서와 마감만 담았어요. 처리에 며칠 걸리는지는 기관마다 달라 넣지 않았어요.${S.me.open?'':' 개업 예정일을 넣으면 날짜로 바꿔 드려요.'}</p>
        <ol class="dl">${deadlines(it).map(x=>`<li class="${x.late?'late':''}"><div class="dl-w">${esc(x.when)}${x.late?' · 지남':''}</div><div class="dl-t">${esc(x.t)}</div>${x.note?`<div class="dl-n">${esc(x.note)}</div>`:''}<div class="dl-l">${esc(x.law)}</div></li>`).join('')}</ol>
      </section>

      <section class="card sec" id="sec-steps">${secHead('steps', `<button type="button" class="tgl no-print" data-track aria-pressed="${S.track}"><i></i>체크하며 관리</button>`)}
        <p class="sec-d no-print">${S.track?'끝낸 항목을 눌러 체크하세요. 이 기기에 저장돼요.':'순서대로 읽어 보세요. 진행 상황을 기록하려면 오른쪽 위 <b>체크하며 관리</b>를 켜세요. PDF에는 항상 체크 칸이 있어요.'}</p>
        <div class="steps ${S.track?'':'read'}">${(it.licenseProcess||[]).map((s,i)=>S.track?chk('s',i,`<span class="sn2">STEP ${i+1}</span>${esc(stripNum(s))}`, p.s[i]):readRow(i+1, esc(stripNum(s)), false, p.s[i])).join('')}</div>
        <div class="dueline">사업자등록은 <b>사업 시작일부터 ${RULE.bizRegDays}일 안에</b> 신청해야 해요(시작 전에도 가능). 인허가 업종은 허가·신고증을 먼저 받아 함께 내요.${S.me.open?` 개업 예정일 기준 <b>${ymd(bizRegDue(S.me.open))}까지</b>.${duePassed(S.me.open)?` <b class="late">${PASSED_MSG}</b>`:''}`:''}</div>
      </section>

      <section class="card sec" id="sec-docs">${secHead('docs', `<span class="cnt">${S.track?`${pr.dd}/${pr.nd} 체크`:`${pr.nd}종`}</span>`)}
        <p class="sec-d"><span class="tag must" style="padding:2px 6px;border-radius:6px;font-size:11.5px;font-weight:800">필수</span> 등록·신고에 꼭 필요 · <span class="tag rec" style="padding:2px 6px;border-radius:6px;font-size:11.5px;font-weight:800">권장</span> 상황에 따라 필요 · <span class="tag opt" style="padding:2px 6px;border-radius:6px;font-size:11.5px;font-weight:800">해당 시</span> 해당할 때만</p>
        ${S.track ? it.docs.map((d,i)=>{ const [c,l]=docTag(d); return chk('d',i,esc(c==='opt'?d.replace(/^\(해당 시\)\s*/,''):d),p.d[i],`<span class="tag ${c}">${l}</span>`); }).join('')
          : [['must','필수'],['rec','권장'],['opt','해당 시']].map(([c,l])=>{ const ds=it.docs.map((d,i)=>[d,i]).filter(([d])=>docTag(d)[0]===c); return ds.length?`<div class="dgrp"><div class="dgh"><span class="tag ${c}">${l}</span> ${ds.length}종</div>${ds.map(([d,i])=>readRow('', esc(c==='opt'?d.replace(/^\(해당 시\)\s*/,''):d), true, p.d[i])).join('')}</div>`:''; }).join('')}
      </section>

      <section class="card sec" id="sec-license">${secHead('license', `<span class="cnt">${it.license.length}건</span>`)}
        ${it.license.map(l=>`<div class="box"><div class="bt"><b>${esc(l.name)}</b>${l.org&&l.org!=='-'?`<span class="bo">${esc(l.org)}</span>`:''}</div>${l.note&&l.note!=='-'?`<p>${esc(l.note)}</p>`:''}</div>`).join('')}
      </section>

      <section class="card sec" id="sec-code">${secHead('code')}
        ${codeOk?`<div class="codebig"><span class="cv mono">${esc(it.nts)}</span><span class="cl"><b>${esc(it.bizItem)}</b><span>업태 ${esc(it.bizType)} · KSIC ${esc(it.ksic)} ${esc(it.ksicName)}</span></span>
          <button class="btn btn-primary btn-sm no-print" type="button" data-copy="${esc(it.nts)}">코드 복사</button></div>`
        :`<div class="notice warn"><span class="ni">🔎</span><span><b>${esc(it.bizItem)}</b>은 취급 품목·방식에 따라 코드가 달라져요. 아래 '업종코드 찾기'나 홈택스에서 품목으로 조회해 정하세요.</span></div>`}
        ${related.length?`<div class="sub-h" style="margin-top:18px">함께 등록을 검토할 코드</div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>국세청</th><th>KSIC</th><th>업종</th><th class="no-print"></th></tr></thead><tbody>
          ${related.map(r=>`<tr><td class="c mono">${esc(r.nts)}</td><td class="c mono">${esc(r.ksic)}</td><td>${esc(r.name)}${r.why?`<div class="small muted">${esc(r.why)}</div>`:''}</td><td class="c no-print"><button class="btn btn-gray btn-sm" type="button" data-copy="${esc(r.nts)}" aria-label="${esc(r.nts)} 복사">복사</button></td></tr>`).join('')}
        </tbody></table></div>`:''}
        <p class="note">업종코드는 ${esc(D.meta.codeBase)} 기준이에요. 실제 사업 내용·매출 비중에 따라 달라질 수 있으니 사업자등록 전 홈택스 업종코드 조회나 관할 세무서에서 확정하세요. 여러 업종을 함께 등록하면 매출이 가장 큰 업종(주업종) 기준으로 세금·지원 요건을 봐요.
        <a class="no-print" href="#/search" style="color:var(--primary-strong);font-weight:700;text-decoration:none">다른 코드 찾기 ›</a></p>
      </section>

      <section class="card sec" id="sec-tax">${secHead('tax', `<span class="cnt">${(it.taxDetail||[]).length}개 제도</span>`)}
        <div class="datebar ${exp?'exp':''}"><span>📅 세제 정보 ${TAX_BASE} 법령 기준 · 다음 점검 ${TAX_NEXT}</span><span>${exp?'⚠ 점검 시점이 지났어요. 최신 개정을 꼭 확인하세요':'점검 주기 안'}</span></div>
        ${(it.taxDetail||[]).map(t=>{ const sch=scheme(t.name); return `<div class="box"><div class="bt"><b>${esc(t.name)}${sch?`<span class="law">${esc(sch.law)}</span>`:''}</b></div>
          ${sch?`<p class="rate">${esc(sch.rate)}</p>`:''}
          <p><span class="lbl">적용 조건</span>${esc(t.cond)}</p><p><span class="lbl w">유의</span>${esc(t.note)}${sch&&!similar(t.note,sch.caution)?' '+esc(sch.caution):''}</p></div>`; }).join('')}
        ${it.taxPoints&&it.taxPoints.length?`<div class="sub-h">함께 확인할 세금 포인트</div><ul class="ul">${it.taxPoints.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
        ${D.taxStrategy[it.group]?`<div class="sub-h">${esc(it.group)} 세무 관리 팁</div><ul class="ul">${D.taxStrategy[it.group].map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
        <p class="note">감면율·기준금액은 법령상 일반 기준이에요. 대표자 나이·사업장 지역·창업 시점·업종에 따라 실제 적용이 달라지고 수시로 개정돼요(예: 창업중소기업 세액감면은 ${RULE.startupTaxFrom} 이후 창업분부터 지역별로 달라짐). 국세법령정보시스템에서 원문을 확인하고 세무사와 검토하세요.</p>
      </section>

      <section class="card sec" id="sec-support">${secHead('support')}
        <ul class="ul">${(it.supportPoints||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
        <div class="match no-print"><div class="mt"><b>지금 접수 중인 예비창업자 지원사업 찾기</b><span>BECONIC 지원사업 MATCH에서 ${S.me.region?esc(S.me.region)+' · ':''}이 업종 조건으로 기업마당·K-Startup 공고를 바로 맞춰 봐요.</span></div>
          <a class="btn btn-primary" href="${esc(matchUrl(it))}" target="_blank" rel="noopener">지원사업 찾기 ↗</a></div>
        <p class="note">지원사업은 공고마다 자격(업력·지역·제외 업종)이 달라요. 이 안내는 미리 살펴볼 점이며 선정을 보장하지 않아요.</p>
      </section>

      <section class="card sec" id="sec-ask">${secHead('ask')}
        <p class="sec-d">신청서·상담 전에 스스로 답을 정해 두면 등록이 빨라져요.</p>
        <ul class="ul q">${(it.askClient||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      </section>

      <section class="card sec" id="sec-pit">${secHead('pit')}
        <ul class="ul warn">${(it.pitfalls||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      </section>

      <section class="card sec" id="sec-expand">${secHead('expand')}
        ${(it.linkedOfficial||[]).length?`<div class="sub-h">함께 등록하면 좋은 업종(공식 코드)</div>${it.linkedOfficial.map(l=>`<div class="box"><div class="bt"><b>${esc(l.name)}</b><span class="bo mono">${esc(l.nts)}</span></div><p>${esc(l.why)}</p></div>`).join('')}`:''}
        ${(it.linkedDirection||[]).length?`<div class="sub-h">사업 확장 아이디어 <span style="font-weight:600">(업종코드는 따로 확인)</span></div>${it.linkedDirection.map(l=>`<div class="idea"><b>${esc(l.label)}</b><p>${esc(l.why)}</p>${l.how?`<p><span class="lbl" style="font-size:12px;font-weight:800;color:var(--primary-strong)">실행</span> ${esc(l.how)}</p>`:''}${l.point?`<p><span class="lbl" style="font-size:12px;font-weight:800;color:var(--warn)">핵심</span> ${esc(l.point)}</p>`:''}</div>`).join('')}`:''}
        ${!(it.linkedOfficial||[]).length && !(it.linkedDirection||[]).length?'<p class="muted">이 업종은 아직 정리된 확장 정보가 없어요.</p>':''}
      </section>

      <section class="card sec" id="sec-sites">${secHead('sites')}
        <div class="sub-h">인허가·등록 신청</div><div class="sites">${regSites(it).map(siteHTML).join('')}</div>
        <div class="sub-h">세금·법령 확인</div><div class="sites">${D.refSites.tax_law.map(siteHTML).join('')}</div>
        <div class="sub-h">지원사업 찾기</div><div class="sites">${siteHTML({name:'BECONIC 지원사업 MATCH',url:MATCH_URL,desc:'자격조건부터 맞춰 보는 공고 매칭',brand:true})}${D.refSites.support.map(siteHTML).join('')}</div>
      </section>

      <section class="card sec" id="sec-memo">${secHead('memo')}
        <p class="sec-d no-print">이 기기에만 저장되고 PDF에 함께 나와요.</p>
        <label class="sr" for="memo">내 메모</label>
        <div class="print-only pmemo">${S.memo[id]?esc(S.memo[id]):'<i></i><i></i><i></i><i></i>'}</div>
        <textarea class="ta no-print" id="memo" maxlength="2000" placeholder="예: 상가 계약 전 건축물 용도 확인 / 위생교육 온라인 신청 완료 / 세무사 상담 예약">${esc(S.memo[id]||'')}</textarea>
      </section>

      <section class="card sec finish" id="sec-finish" aria-label="준비 마무리">
        <div class="sec-h"><span class="sn">✓</span><h2>준비 마무리</h2><span class="cnt no-print">${pr.pct}% 체크</span></div>
        <p class="sec-d no-print">체크를 마쳤다면 아래 세 가지로 마무리하세요.</p>
        <div class="fin no-print">
          <button class="fcard" type="button" data-act="print"><b>① ${IN_APP?'체크리스트 복사':'PDF로 저장'}</b><span>${IN_APP?'나와의 채팅에 붙여 넣어 보관':'한눈에 보기 + 남은 할 일 + 전체 체크리스트'}</span></button>
          <a class="fcard" href="${esc(matchUrl(it))}" target="_blank" rel="noopener"><b>② 지원사업 찾기 ↗</b><span>예비창업자·이 업종${S.me.region?'·'+esc(S.me.region):''} 조건으로 접수 중 공고 확인</span></a>
          <a class="fcard" href="${CONTACT.kakao}" target="_blank" rel="noopener"><b>③ 전문가에게 확인</b><span>서류·세금 요건을 카카오톡으로 물어보기 · ${CONTACT.tel}</span></a>
        </div>
        <div class="print-only pcontact"><b>전문가 확인이 필요하면</b> ${CONTACT.company}(중소벤처기업부 인증 중소기업상담회사 ${CONTACT.cert}) · ${CONTACT.tel} · ${CONTACT.email} · 카카오톡 채널 'BECONIC' · www.beconic.kr<br>지원사업 찾기: beconic-grant-matching.netlify.app · 이 가이드 다시 보기: ${esc(shareLink(id).replace(/^https?:\/\//,''))}</div>
      </section>

      <section class="card sec disc" id="sec-about">${secHead('about')}
        <p><b>기준일</b> 이 가이드의 자료 기준일은 <b>${BASE}</b>, 세제 수치는 <b>${TAX_BASE} 법령</b>, 업종코드는 <b>${esc(D.meta.codeBase)}</b> 기준이에요. 다음 세제 점검 예정은 ${TAX_NEXT}이에요.</p>
        <p><b>자료의 성격</b> 업종별 준비 사항을 미리 살펴보도록 정리한 참고 자료예요. 세무·법률·행정상 확정 자문이 아니며, 진단·평가를 하지 않아요. ${reviewed?'':'이 업종 자료는 BECONIC 내부 정리 자료로 업종별 전문가 검수 전이에요. '}</p>
        <p><b>달라질 수 있는 것</b> 인허가 요건·세액감면·지원사업 자격은 사업 형태, 대표자 요건, 소재지, 업력, 관계 법령·공고에 따라 달라지고 수시로 바뀌어요. 중요한 결정 전에는 관할 기관과 세무사·행정사 등 전문가에게 확인하세요.</p>
        <p><b>개인정보</b> 입력한 상황·체크·메모는 이 기기 브라우저에만 저장되고 서버로 보내지 않아요. '내 준비함'에서 언제든 지울 수 있어요.</p>
      </section>

    </div>
  </div>
  ${stepNav(G, id)}
  `, 'home', `${it.name} · ${G.l}`);
  document.body.classList.add('has-cta','wizard');
  document.querySelectorAll('.gbody .sec').forEach(el=>{ if(!G.secs.includes(el.id.replace('sec-',''))) el.classList.add('stepoff'); });
  document.querySelectorAll('.gbody [data-only]').forEach(el=>{ if(el.dataset.only!==G.k) el.classList.add('stepoff'); });

  const memo=$('#memo');
  memo.addEventListener('input', ()=>{ S.memo[id]=memo.value.slice(0,2000); if(!S.memo[id]) delete S.memo[id]; save(); });
  setupSpy();
}
function readRow(num, html, bullet, done){
  return `<div class="rrow">${bullet?'<span class="rb" aria-hidden="true"></span>':`<span class="rn">${num}</span>`}<span class="pbox print-only ${done?'on':''}" aria-hidden="true">${done?'✓':''}</span><span class="rt">${num?`<span class="sn2">STEP ${num}</span>`:''}${html}</span></div>`;
}
function resultSummary(it, notes){
  const reviewed=it.reviewStatus==='검수완료';
  const p=S.prog[it.id]||{d:{},s:{}};
  const tc=it.docs.reduce((a,d)=>{ a[docTag(d)[0]]++; return a; }, {must:0,rec:0,opt:0});
  const must=it.docs.map((d,i)=>[d,i]).filter(([d])=>docTag(d)[0]==='must');
  const tax=(it.taxDetail||[]).map(t=>t.name);
  const gate=it.license[0];
  const steps=(it.licenseProcess||[]).map(stripNum);
  const chips=meChips();
  return `<section class="card rsum no-print" aria-label="결과 요약">
    <div class="rs-h"><div><span class="rs-e">${D.groupMeta[it.group]||''} ${esc(it.group)} · 결과 요약</span><h1 class="h-lg">${esc(it.name)}</h1><p class="rs-s">${esc(it.summary)}</p></div></div>
    ${gate?`<div class="rs-gate"><span>핵심 관문</span><b>${esc(gate.name)}</b>${gate.org&&gate.org!=='-'?`<em>${esc(gate.org)}</em>`:''}${it.license.length>1?`<small>외 인허가·신고 ${it.license.length-1}건</small>`:''}</div>`:''}
    <div class="rs-two">
      <div class="rs-box"><h3>먼저 할 일</h3><ol>${steps.slice(0,3).map((t,i)=>`<li class="${p.s[i]?'done':''}">${esc(t)}</li>`).join('')}</ol>${steps.length>3?`<p class="rs-more">외 ${steps.length-3}단계 · 사업자등록은 사업 시작일부터 ${RULE.bizRegDays}일 안에</p>`:`<p class="rs-more">사업자등록은 사업 시작일부터 ${RULE.bizRegDays}일 안에</p>`}</div>
      <div class="rs-box"><h3>꼭 챙길 서류 <span>필수 ${tc.must}종</span></h3><ul>${must.slice(0,5).map(([d,i])=>`<li class="${p.d[i]?'done':''}">${esc(d)}</li>`).join('')}</ul>${must.length>5||tc.rec+tc.opt?`<p class="rs-more">${[must.length>5?`외 필수 ${must.length-5}종`:'', tc.rec?`권장 ${tc.rec}종`:'', tc.opt?`해당 시 ${tc.opt}종`:''].filter(Boolean).join(' · ')}</p>`:''}</div>
    </div>
    ${it.pitfalls&&it.pitfalls[0]?`<div class="rs-warn"><span aria-hidden="true">⚠️</span><span><b>많이 놓치는 점</b> ${esc(it.pitfalls[0])}</span></div>`:''}
    <div class="rs-g">
      <div><span>업종코드</span><b>${isCode(it.nts)?`<span class="mono">${esc(it.nts)}</span> <button type="button" class="link-btn" data-copy="${esc(it.nts)}">복사</button>`:'홈택스 조회 필요'}</b></div>
      <div><span>세금 혜택 ${tax.length}개</span><b>${tax.map(esc).join(', ')||'—'}</b></div>
      ${S.me.open?`<div class="${duePassed(S.me.open)?'rs-late':''}"><span>사업자등록 기한</span><b>${ymd(bizRegDue(S.me.open))}까지${duePassed(S.me.open)?' · 지남':''}</b></div>`:''}
      <div><span>내 상황 · 맞춤 안내</span><b>${hasMe()?`${chips.slice(0,3).map(esc).join(' · ')}${chips.length>3?' 외':''}<br>안내 ${notes.length}개 <button type="button" class="link-btn" data-go="sec-me">보기</button> · <a class="link-btn" href="#/me?next=${it.id}">수정</a>`:`<a class="link-btn" href="#/me?next=${it.id}">내 상황 넣기</a>`}</b></div>
    </div>
    <p class="rs-m">📅 자료 기준일 <b>${BASE}</b> · 세제 ${TAX_BASE} 법령 · 업종코드 ${CODE_Y}년 귀속 연계표 · <span title="BECONIC 내부 정리 자료">${reviewed?'✓ 전문가 검수':'내부 정리·검수 전'}</span></p>
    <div class="rs-a"><button class="btn btn-primary" type="button" data-act="print">${IN_APP?'체크리스트 복사':'PDF 받기'}</button><a class="btn btn-gray" href="${esc(matchUrl(it))}" target="_blank" rel="noopener">지원사업 찾기 ↗</a></div>
  </section>`;
}
function stepNav(G, id){
  const i=GSTEPS.indexOf(G), prev=GSTEPS[i-1], next=GSTEPS[i+1];
  return `<nav class="stepnav no-print" aria-label="결과 이동">
    <button class="btn btn-gray" type="button" data-act="print">${IN_APP?'요약 복사':'PDF 받기'}</button>
    ${next?`<a class="btn btn-primary" href="#/guide/${id}/${next.k}">다음 탭: ${next.l} ›</a>`:`<a class="btn btn-primary" href="${esc(matchUrl(BY_ID[id]))}" target="_blank" rel="noopener">지원사업 찾기 ↗</a>`}
  </nav>${prev?'':''}`;
}
function printSummary(it, pr, screen){
  const p=S.prog[it.id]||{d:{},s:{}};
  const leftSteps=(it.licenseProcess||[]).map((t,i)=>[t,i]).filter(([,i])=>!p.s[i]).map(([t])=>stripNum(t));
  const leftDocs=it.docs.map((d,i)=>[d,i]).filter(([d,i])=>!p.d[i] && docTag(d)[0]!=='opt').map(([d])=>d);
  const left=[...leftSteps.map(t=>'[순서] '+t), ...leftDocs.map(t=>'[서류] '+t)];
  const chips=meChips();
  return `<section class="${screen?'card no-print psum-screen':'print-only psum'}">${screen?'<div class="sec-h"><span class="sn">✓</span><h2>한눈에 보기</h2></div>':''}
    <div class="ps-top"><div><span class="ps-l">업종</span><b>${esc(it.name)}</b></div>
      <div><span class="ps-l">업종코드</span><b>${isCode(it.nts)?'국세청 '+esc(it.nts)+' · KSIC '+esc(it.ksic):'홈택스 조회 필요'}</b></div>
      <div><span class="ps-l">진행률</span><b>${pr.pct}% (순서 ${pr.ds}/${pr.ns} · 서류 ${pr.dd}/${pr.nd})</b></div>
      <div><span class="ps-l">핵심 관문 · 인허가·신고</span><b>${it.license.map(l=>esc(l.name)+(l.org&&l.org!=='-'?`(${esc(l.org)})`:'')).join(', ')}</b></div>
      ${S.me.open?`<div><span class="ps-l">사업자등록 기한</span><b>${ymd(bizRegDue(S.me.open))}까지 (개업 예정 ${ymd(new Date(S.me.open+'T00:00:00'))} + ${RULE.bizRegDays}일)</b></div>`:''}
      ${chips.length?`<div><span class="ps-l">내 상황</span><b>${chips.map(esc).join(' · ')}</b></div>`:''}
    </div>
    <div class="ps-left"><b>${left.length?`${(pr.ds+pr.dd)?'남은 할 일':'준비할 것(필수·권장)'} ${left.length}개`:'남은 필수·권장 할 일이 없어요'}</b>${left.length?`<ol>${left.slice(0,12).map(t=>`<li>${esc(t)}</li>`).join('')}</ol>${left.length>12?`<span>외 ${left.length-12}개는 아래 체크리스트 참고</span>`:''}`:''}</div>
  </section>`;
}
function chk(kind,i,html,on,tail){
  return `<button type="button" class="chk" role="checkbox" aria-checked="${on?'true':'false'}" data-chk="${kind}${i}"><span class="bx">${CHECK_SVG}</span><span class="ct">${html}</span>${tail||''}</button>`;
}
function scheme(name){
  const map=[['창업중소기업','startup_sme'],['창업벤처','venture_tax'],['벤처','venture_tax'],['통합투자','integrated_invest'],['간이과세','simple_vat'],['연구','rd_credit'],['R&D','rd_credit'],['고용','social_insurance'],['사회보험','social_insurance'],['도서','book_vat_exempt'],['면세','book_vat_exempt'],['의제매입','imputed_purchase']];
  for(const [k,v] of map) if(String(name).includes(k)) return D.taxSchemes[v];
  return null;
}
function similar(a,b){ const A=norm(a); const B=norm(b); for(let i=0;i+6<=B.length;i+=3) if(A.includes(B.slice(i,i+6))) return true; return false; }
function regSites(it){
  const out=[...(it.sites||[])];
  const byGroup={'제조업':[{name:'팩토리온',url:'www.femis.go.kr',desc:'공장설립·등록'}],'건설업':[{name:'키스콘',url:'www.kiscon.net',desc:'건설업 등록정보'}],
    '숙박업':[{name:'세움터',url:'cloud.eais.go.kr',desc:'건축물대장·용도확인'}],'부동산업':[{name:'세움터',url:'cloud.eais.go.kr',desc:'건축물대장·용도확인'}],
    '음식점업':[{name:'세움터',url:'cloud.eais.go.kr',desc:'계약 전 건축물 용도 확인'}]};
  for(const s of [...(byGroup[it.group]||[]), {name:'정부24',url:'www.gov.kr',desc:'인허가·민원 신청'},{name:'홈택스',url:'hometax.go.kr',desc:'사업자등록'}])
    if(!out.some(x=>x.url.replace(/^www\./,'')===s.url.replace(/^www\./,''))) out.push(s);
  return out;
}
function siteHTML(s){
  const href=/^https?:\/\//.test(s.url)?s.url:'https://'+s.url;
  const shown=s.url.replace(/^https?:\/\//,'').replace(/\/$/,'');
  return `<a class="site ${s.brand?'brand':''}" href="${esc(href)}" target="_blank" rel="noopener"><b>${esc(s.name)}</b><span class="${s.desc?'':'print-hide'}">${esc(s.desc||shown)}</span><span class="print-only purl">${esc(shown)}</span></a>`;
}
function setupSpy(){
  const links=[...document.querySelectorAll('.lnav a[data-sec], .tnav a[data-sec]')];
  const mark=k=>{ links.forEach(a=>a.classList.toggle('on', a.dataset.sec===k)); const t=document.querySelector(`.tnav a[data-sec="${k}"]`); if(t&&t.parentElement){ const p=t.parentElement; p.scrollTo({left:t.offsetLeft-p.clientWidth/2+t.clientWidth/2, behavior:'smooth'}); } };
  if(!('IntersectionObserver' in window)) return;
  scrollSpy=new IntersectionObserver(es=>{ const v=es.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0]; if(v) mark(v.target.id.replace('sec-','')); }, {rootMargin:'-120px 0px -60% 0px'});
  document.querySelectorAll('.sec').forEach(s=>scrollSpy.observe(s));
}
function toggleCheck(id, key){
  const kind=key[0], i=key.slice(1);
  S.prog[id]=S.prog[id]||{d:{},s:{}};
  const bag=S.prog[id][kind];
  if(bag[i]) delete bag[i]; else bag[i]=true;
  save();
}
function shareLink(id){ return `${location.origin}${location.pathname}#/guide/${id}`; }
function summary(id){
  const it=BY_ID[id], p=S.prog[id]||{d:{},s:{}}, pr=progressOf(id);
  return [`[BECONIC 창업 준비 가이드] ${it.name} (자료 기준일 ${BASE})`,
    isCode(it.nts)?`업종코드: 국세청 ${it.nts} · KSIC ${it.ksic} ${it.ksicName}`:`업종코드: 홈택스 조회 필요`,
    `진행률 ${pr.pct}%`, '', '■ 진행 순서', ...(it.licenseProcess||[]).map((s,i)=>`${p.s[i]?'✅':'⬜'} ${stripNum(s)}`),
    '', '■ 준비 서류', ...it.docs.map((d,i)=>`${p.d[i]?'✅':'⬜'} ${d}`),
    ...(S.memo[id]?['', '■ 메모', S.memo[id]]:[]),
    '', `가이드 다시 보기: ${shareLink(id)}`].join('\n');
}

/* ---------- 업종 고르기 도우미: 무엇을 → 어디서 → 한 단어 ---------- */
const FINDER = D.finder;
function finderRank(f){
  const what=FINDER.what.find(o=>o.k===f.what), where=FINDER.where.find(o=>o.k===f.where);
  const kw=(f.kw||'').trim(), hits=kw?searchGuides(kw).map(i=>i.id):[];
  let ids = what ? what.ids.slice() : (hits.length ? hits.slice() : []);
  if(what && hits.length){ const inter=ids.filter(i=>hits.includes(i)); if(inter.length) ids=inter.concat(ids.filter(i=>!inter.includes(i))); }
  return ids.map(id=>{
    let sc=0; const why=[];
    if(what && what.ids.includes(id)){ sc+=10; why.push(what.l); }
    if(where && where.ids.includes(id)){ sc+=5; why.push(where.l); }
    const hi=hits.indexOf(id); if(hi>=0){ sc+=8-Math.min(hi,6); why.push(`'${kw}'`); }
    return {it:BY_ID[id], sc, why};
  }).filter(r=>r.it).sort((a,b)=>b.sc-a.sc);
}
function renderFinder(q){
  // 답은 주소(#/finder?w=&p=&k=)에 남겨 뒤로가기·새로고침 후에도 그대로 — 알 수 없는 값은 버림
  const f={what:FINDER.what.some(o=>o.k===q.get('w'))?q.get('w'):'', where:FINDER.where.some(o=>o.k===q.get('p'))?q.get('p'):'', kw:(q.get('k')||'').slice(0,40)};
  mount(`${stepper('pick')}<div class="wrap-narrow">
    <a class="btn btn-gray btn-sm no-print" href="#/">‹ 업종 검색으로</a>
    <section class="card" style="padding:28px;margin-top:14px">
      <div class="eyebrow">업종 고르기 도우미</div><h1 class="h-lg" style="margin:6px 0 6px">업종 이름을 몰라도 괜찮아요</h1>
      <p class="muted" style="margin-bottom:20px">질문에 답하면 맞는 업종을 바로 추천해요. 첫 질문만 답해도 돼요.</p>
      <div class="form-q" role="group" aria-labelledby="fq1"><div class="ql" id="fq1">1. 무엇을 파나요?</div>
        <div class="fopts">${FINDER.what.map(o=>`<button type="button" class="fopt" data-fq="what" data-v="${o.k}" aria-pressed="${o.k===f.what}"><b>${esc(o.l)}</b><span>${esc(o.h)}</span></button>`).join('')}</div></div>
      <div class="form-q" role="group" aria-labelledby="fq2"><div class="ql" id="fq2">2. 주로 어디서 파나요? <span class="opt-l">선택</span></div>
        <div class="opts">${FINDER.where.map(o=>`<button type="button" class="opt" data-fq="where" data-v="${o.k}" aria-pressed="${o.k===f.where}">${esc(o.l)}</button>`).join('')}</div></div>
      <div class="form-q"><label class="ql" for="fkw">3. 한 단어로 말하면? <span class="opt-l">선택</span></label><div class="qh">예: 커피, 화장품, 네일, 앱, 인테리어</div>
        <input class="inp" id="fkw" type="search" autocomplete="off" placeholder="한 단어로 입력" maxlength="40" value="${esc(f.kw)}" style="width:100%"></div>
    </section>
    <section class="card" id="fres" aria-live="polite"></section>
  </div>`, 'home', '업종 고르기 도우미');
  const keep=()=>{ const u=new URLSearchParams(); if(f.what) u.set('w',f.what); if(f.where) u.set('p',f.where); if(f.kw.trim()) u.set('k',f.kw.trim());
    const h='#/finder'+(u.toString()?'?'+u:''); if(location.hash!==h) history.replaceState(null,'',h); };   // replaceState는 hashchange를 일으키지 않음
  const draw=()=>{
    keep();
    const r=finderRank(f).slice(0,5);
    $('#fres').innerHTML = !f.what && !f.kw.trim() ? `<p class="muted">1번 질문에 답하면 추천 업종이 여기에 나와요.</p>`
      : r.length ? `<div class="sec-h"><h2>추천 업종</h2><span class="cnt">맞는 순서</span></div>
        <div class="list" style="padding:0;margin:0 -10px">${r.map((x,i)=>`<a class="item fr" href="#/start/${x.it.id}"><span class="ii" aria-hidden="true">${i===0?'⭐':D.groupMeta[x.it.group]}</span><span class="ib"><b>${esc(x.it.name)}</b><span>${esc(x.it.summary)}</span><span class="fwhy">${x.why.map(w=>`<em>${esc(w)}</em>`).join('')}</span></span><span class="ar" aria-hidden="true">›</span></a>`).join('')}</div>
        <p class="note">딱 맞는 업종이 없으면 <a href="#/search${f.kw.trim()?`?q=${encodeURIComponent(f.kw.trim())}`:''}" class="link-btn">업종코드 ${NTS_UNIQUE.toLocaleString()}개에서 찾기</a></p>`
      : `<p class="muted">맞는 업종을 못 찾았어요. 다른 단어로 바꾸거나 <a class="link-btn" href="#/search?q=${encodeURIComponent(f.kw.trim())}">업종코드에서 찾기</a></p>`;
  };
  document.querySelectorAll('[data-fq]').forEach(b=>b.addEventListener('click', ()=>{
    const k=b.dataset.fq; f[k] = f[k]===b.dataset.v ? '' : b.dataset.v;
    document.querySelectorAll(`[data-fq="${k}"]`).forEach(x=>x.setAttribute('aria-pressed', f[k]===x.dataset.v?'true':'false'));
    draw();
  }));
  $('#fkw').addEventListener('input', e=>{ f.kw=e.target.value; draw(); });
  draw();
}

/* ---------- 업종코드 찾기 ---------- */
let codeLimit=40;
function renderSearch(q, g){
  codeLimit=40;
  mount(`<div class="wrap-narrow">
    <div style="margin:6px 4px 4px"><h1 class="h-lg">업종코드 찾기</h1><p class="muted" style="margin-top:6px">국세청 업종코드 ${NTS_UNIQUE.toLocaleString()}개 · ${esc(D.meta.codeBase)} · 업종명이나 숫자로 찾아요.</p></div>
    <form class="search" role="search" id="cs"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <label class="sr" for="cq">업종명 또는 코드</label><input id="cq" type="search" enterkeyhint="search" autocomplete="off" placeholder="예: 화장품, 커피, 552303, 47912" value="${esc(q)}"></form>
    <div class="filters" role="group" aria-label="대분류">${['', ...NTS_GROUPS].map(x=>`<button type="button" data-g="${esc(x)}" aria-pressed="${x===g?'true':'false'}">${x?esc(x):'전체'}</button>`).join('')}</div>
    <div id="cres"></div>
    <p class="note">코드는 실제 사업 내용·매출 비중에 따라 달라질 수 있어요. 사업자등록 전 홈택스 '업종코드 조회'나 관할 세무서에서 확정하세요. 같은 국세청 코드가 여러 KSIC와 이어진 경우 따로 표시돼요.</p>
  </div>`, 'search', '업종코드 찾기');
  const inp=$('#cq'); let cur=g;
  const draw=()=>{
    const v=inp.value.trim();
    const guides=v?searchGuides(v).slice(0,4):[];
    const all=(v||cur)?searchCodes(v, cur):[];
    $('#cres').innerHTML = (!v && !cur) ? `<div class="list"><div class="empty">업종명이나 코드를 입력하거나<br>위에서 대분류를 골라 보세요.</div></div>` :
      `${guides.length?`<div class="list" style="margin-bottom:10px"><div class="list-h">준비 가이드가 있는 업종</div>${guides.map(itemHTML).join('')}</div>`:''}
      <div class="list">${all.length?`<div class="list-h">${all.length.toLocaleString()}건${all.length>codeLimit?` 중 ${codeLimit}건`:''}</div>${all.slice(0,codeLimit).map(codeRow).join('')}
        ${all.length>codeLimit?`<button class="item" type="button" id="more"><span class="ib"><b style="color:var(--primary-strong);font-size:15px">더 보기</b></span></button>`:''}`
        :`<div class="empty">찾는 코드가 없어요. 더 짧은 말로 찾아보세요(예: '화장품 소매' → '화장품').</div>`}</div>`;
    const m=$('#more'); if(m) m.addEventListener('click', ()=>{ codeLimit+=60; draw(); });
    const qs=new URLSearchParams(); if(v) qs.set('q',v); if(cur) qs.set('g',cur);
    history.replaceState(null,'', '#/search'+(qs.toString()?'?'+qs:''));
  };
  inp.addEventListener('input', ()=>{ codeLimit=40; draw(); });
  $('#cs').addEventListener('submit', e=>{ e.preventDefault(); inp.blur(); });
  document.querySelectorAll('.filters [data-g]').forEach(b=>b.addEventListener('click', ()=>{ cur=b.dataset.g; codeLimit=40; document.querySelectorAll('.filters [data-g]').forEach(x=>x.setAttribute('aria-pressed', x===b?'true':'false')); draw(); }));
  draw();
}

/* ---------- 내 상황 ---------- */
function renderMe(next){
  const m={...S.me};
  const it=next?BY_ID[next]:null;
  const back=it?`#/guide/${next}/prepare`:'#/my';
  const preview=()=>{ if(!it) return ''; const keep=S.me; S.me=sanitizeMe(m); const n=situationNotes(it).length; S.me=keep; return n?`지금 선택으로 <b>${esc(it.name)}</b> 가이드에 맞춤 안내 <b>${n}개</b>가 붙어요.`:`항목을 고르면 <b>${esc(it.name)}</b> 가이드에 맞춤 안내가 붙어요.`; };
  mount(`${it?stepper('me', next, it.group):''}<div class="wrap-narrow">
    ${it?'':`<a class="btn btn-gray btn-sm no-print" href="#/my">‹ 내 준비함으로</a>`}
    <section class="card" style="padding:28px;margin-top:${it?0:14}px">
    <div class="eyebrow">${it?`${esc(it.name)} · `:''}선택 입력 · 이 기기에만 저장</div><h1 class="h-lg" style="margin:6px 0 6px">내 상황을 알려 주세요</h1>
    ${it&&hasMe()?`<div class="notice"><span class="ni" aria-hidden="true">✎</span><span><b>지난번 입력한 내용이에요.</b> 맞는지 확인하고 바뀐 것만 고친 뒤 결과를 보세요.</span></div>`:''}
    <p class="muted" style="margin-bottom:18px">고른 항목만 맞춤 안내에 쓰여요. 모르면 건너뛰어도 돼요. 모든 업종 가이드에 함께 적용돼요.</p>
    ${it?`<div class="notice blue" id="mePreview" role="status" aria-live="polite"><span class="ni" aria-hidden="true">★</span><span>${preview()}</span></div>`:''}
    ${ME_Q.map(q=>`<div class="form-q" role="group" aria-labelledby="ql-${q.k}"><div class="ql" id="ql-${q.k}">${q.l}</div><div class="qh">${q.h}</div>
      <div class="opts">${q.o.map(([v,l])=>`<button type="button" class="opt" data-k="${q.k}" data-v="${esc(v)}" aria-pressed="${m[q.k]===v?'true':'false'}">${esc(l)}</button>`).join('')}</div></div>`).join('')}
    <div class="form-q"><label class="ql" for="open">개업 예정일</label><div class="qh">사업자등록 신청 기한(사업 시작일부터 ${RULE.bizRegDays}일)을 계산해 드려요.</div>
      <input class="inp" id="open" type="date" value="${esc(m.open||'')}"></div>
    </section>
    <p class="small muted" style="margin:10px 4px 0">고른 걸 모두 지우려면 <button class="link-btn" type="button" id="meClear">선택 초기화</button> (저장해야 반영돼요)</p>
    <div class="me-actions">${it?`<a class="btn btn-gray" href="${back}" id="meSkip">${hasMe()?'그대로 결과 보기':'건너뛰기'}</a>`:''}<button class="btn btn-primary" type="button" id="meSave">${it?'저장하고 결과 보기 ›':'저장'}</button></div>
  </div>`, it?'home':'my', '내 상황');
  if(it) document.body.classList.add('wizard');
  const upd=()=>{ const pv=$('#mePreview'); if(pv) pv.lastElementChild.innerHTML=preview(); };
  document.querySelectorAll('.opt').forEach(b=>b.addEventListener('click', ()=>{
    const k=b.dataset.k, v=b.dataset.v; m[k] = m[k]===v ? undefined : v; if(m[k]===undefined) delete m[k];
    document.querySelectorAll(`.opt[data-k="${k}"]`).forEach(x=>x.setAttribute('aria-pressed', m[k]===x.dataset.v?'true':'false'));
    upd();
  }));
  $('#open').addEventListener('change', e=>{ if(e.target.value) m.open=e.target.value; else delete m.open; upd(); });
  const sk=$('#meSkip'); if(sk) sk.addEventListener('click', ()=>{ S.meSkip=true; save(); });
  $('#meSave').addEventListener('click', ()=>{ S.me=sanitizeMe(m); S.meSkip=true; save(); toast(hasMe()?'저장했어요. 맞춤 안내에 반영됐어요.':'내 상황을 비웠어요.'); if(it && hasMe()) pendingFocus='sec-me'; location.hash = back; });
  $('#meClear').addEventListener('click', ()=>{ for(const k of Object.keys(m)) delete m[k]; document.querySelectorAll('.opt').forEach(x=>x.setAttribute('aria-pressed','false')); $('#open').value=''; upd(); toast('선택을 비웠어요. 저장해야 반영돼요.'); });
}

/* ---------- 내 준비함 ---------- */
function renderMy(){
  const ids=[...new Set([...S.recent, ...Object.keys(S.prog)])].filter(id=>BY_ID[id]);
  const meTxt=ME_Q.filter(q=>S.me[q.k]).map(q=>q.o.find(o=>o[0]===S.me[q.k])[1]);
  if(S.me.open) meTxt.push('개업 예정 '+ymd(new Date(S.me.open+'T00:00:00')));
  mount(`<div class="wrap-narrow">
    <div style="margin:6px 4px 14px"><h1 class="h-lg">내 준비함</h1><p class="muted" style="margin-top:6px">가입 없이 이 기기에 저장돼요. 다른 기기에서는 '링크 복사'로 이어 보세요(체크 내용은 기기마다 따로예요).</p></div>
    <section class="card"><div class="sec-h"><h2>내 상황</h2><a class="btn btn-gray btn-sm" href="#/me">${hasMe()?'수정':'입력'}</a></div>
      ${meTxt.length?`<div class="row">${meTxt.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>`:'<p class="muted">아직 입력하지 않았어요. 넣으면 가이드마다 맞춤 안내가 붙어요.</p>'}</section>
    <section class="card"><div class="sec-h"><h2>최근 본 업종</h2><span class="cnt">${ids.length}개</span></div>
      ${ids.length?`<div class="list" style="padding:0;margin:0 -10px">${ids.map(id=>{ const p=progressOf(id); return `<div class="item-row"><a class="item" href="#/guide/${id}/prepare"><span class="ii" aria-hidden="true">${D.groupMeta[BY_ID[id].group]}</span><span class="ib"><b>${esc(BY_ID[id].name)}</b><span>${p.done}/${p.total} 체크 · ${p.pct}%</span><div class="bar"><i style="width:${p.pct}%"></i></div></span><span class="ar">›</span></a><button type="button" class="rdel" data-del="${id}" aria-label="${esc(BY_ID[id].name)} 삭제">✕</button></div>`; }).join('')}</div>`
      :`<p class="muted" style="margin-bottom:12px">아직 열어 본 업종 가이드가 없어요.</p><a class="btn btn-soft btn-sm" href="#/">업종 고르기</a>`}</section>
    <section class="card"><div class="sec-h"><h2>홈 화면에 추가</h2></div><p class="small muted">${IN_APP?'카카오톡 등 앱 안 브라우저에서는 추가가 안 돼요. 오른쪽 위 메뉴의 \'다른 브라우저로 열기\' 후 추가하세요.':'휴대폰 브라우저 메뉴의 \'홈 화면에 추가\'를 누르면 앱처럼 열려요. 한 번 열어 둔 가이드는 인터넷이 약해도 볼 수 있어요.'}</p>
      <button class="btn btn-gray btn-sm hidden" type="button" id="install" style="margin-top:10px">앱으로 설치</button></section>
    <button class="btn btn-gray btn-block" type="button" id="wipe">이 기기에 저장된 내용 모두 지우기</button>
  </div>`, 'my', '내 준비함');
  if(deferredInstall){ const b=$('#install'); b.classList.remove('hidden'); b.addEventListener('click', async()=>{ deferredInstall.prompt(); deferredInstall=null; b.classList.add('hidden'); }); }
  $('#wipe').addEventListener('click', ()=>{ if(confirm('상황·체크·메모를 모두 지울까요? 되돌릴 수 없어요.')){ S=blank(); try{ localStorage.removeItem(STORE); }catch{ /* 무시 */ } toast('모두 지웠어요.'); render(); } });
}

/* ---------- 공통 이벤트(위임) ---------- */
document.addEventListener('click', async e=>{
  const c=e.target.closest('[data-copy]');
  if(c){ const ok=await copyText(c.dataset.copy); toast(ok?`업종코드 ${c.dataset.copy}를 복사했어요.`:'복사가 안 되는 환경이에요. 길게 눌러 복사해 주세요.'); return; }
  const del=e.target.closest('[data-del]');
  if(del){ if(deleteGuide(del.dataset.del)){ toast('목록에서 지웠어요.'); const y=window.scrollY; render(); window.scrollTo(0,y); } return; }
  const {parts}=parse(); const id=parts[0]==='guide'?parts[1]:null; const stp=GSTEPS.some(x=>x.k===parts[2])?parts[2]:'prepare';
  const tg=e.target.closest('[data-track]');
  if(tg && id){ S.track=!S.track; save(); const y=window.scrollY; renderGuide(id, stp); window.scrollTo(0,y); toast(S.track?'체크하며 관리를 켰어요. 끝낸 항목을 눌러 체크하세요.':'읽기 모드로 바꿨어요. 체크한 내용은 그대로 남아 있어요.'); return; }
  const go=e.target.closest('[data-go]');
  if(go && id){ if(stp!=='prepare'){ pendingFocus=go.dataset.go; location.hash=`#/guide/${id}/prepare`; } else { const t=document.getElementById(go.dataset.go); if(t) t.scrollIntoView({behavior:'smooth'}); } return; }
  const k=e.target.closest('[data-chk]');
  if(k && id){
    toggleCheck(id, k.dataset.chk);
    const y=window.scrollY; renderGuide(id, stp); window.scrollTo(0,y);
    const again=document.querySelector(`[data-chk="${k.dataset.chk}"]`); if(again) again.focus({preventScroll:true});
    if(progressOf(id).pct===100) toast('모든 준비를 체크했어요! 사업자등록 기한을 다시 한 번 확인하세요.');
    return;
  }
  const n=e.target.closest('[data-next]');
  if(n && id){ toggleCheck(id, n.dataset.next); const y=window.scrollY; renderGuide(id, stp); window.scrollTo(0,y); toast('완료로 체크했어요.'); return; }
  const a=e.target.closest('[data-act]');
  if(a && id){
    if(a.dataset.act==='share'){ const ok=await copyText(shareLink(id)); toast(ok?'가이드 링크를 복사했어요. 체크 내용은 링크에 담기지 않아요.':'복사가 안 되는 환경이에요.'); }
    if(a.dataset.act==='print'){
      if(IN_APP){ const ok=await copyText(summary(id)); toast(ok?'앱 안 브라우저는 PDF 저장이 안 돼요. 체크리스트를 복사했으니 나와의 채팅에 붙여 넣어 보관하세요.':'다른 브라우저로 열어 PDF로 저장해 주세요.'); }
      else printGuide(id);
    }
    return;
  }
  const sec=e.target.closest('a[href^="#sec-"]');
  if(sec){ e.preventDefault(); const t=document.getElementById(sec.getAttribute('href').slice(1)); if(t){ t.scrollIntoView({behavior:'smooth', block:'start'}); t.setAttribute('tabindex','-1'); t.focus({preventScroll:true}); } }
});

/* 모바일 하단 고정 버튼: 첫 화면(진행률 카드)을 지난 뒤에만 보여 줘 '지금 할 일'을 가리지 않는다 */
window.addEventListener('scroll', ()=>{ const c=document.querySelector('.guide-cta'); if(c) c.classList.toggle('show', window.scrollY>560); }, {passive:true});

function printGuide(id){
  const it=BY_ID[id], prev=document.title, d=new Date();
  document.title=`창업준비체크리스트_${it.name.replace(/[\\/:*?"<>|·\s]+/g,'')}_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const restore=()=>{ document.title=prev; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

/* ---------- 앱(PWA) ---------- */
let deferredInstall=null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredInstall=e; });
if('serviceWorker' in navigator && location.protocol==='https:'){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js?v='+encodeURIComponent(VERSION)).catch(()=>{ /* 오프라인 캐시 생략 */ }); });
}

/* ---------- 시작 ---------- */
load();
footer();
$('#baseChip').textContent = `${BASE} 기준`;
$('#baseChip').title = `자료 기준일 ${BASE} · 세제 ${TAX_BASE} 법령 · 업종코드 ${CODE_Y}년 귀속 연계표`;
window.addEventListener('hashchange', ()=>{ render(); afterNav(); });
render();

/* QA용 읽기 전용 노출 */
window.PS = {finderRank, deadlines, VERSION, RULE, CODE_Y, BY_ID, searchGuides, searchCodes, progressOf, situationNotes, matchUrl, docTag, taxExpired, sanitizeMe, summary, NTS_UNIQUE, get S(){ return S; }};
})();
