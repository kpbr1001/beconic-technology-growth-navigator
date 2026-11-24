/* ============================================================
   K-ITEM FINDER — Frontend App Logic
   단일 SPA · API(/api/opportunity) 연동 + 샘플 데모 모드
   ============================================================ */

// ---------- CONFIG (중앙 단일 소스) ----------
const APP_META = {
  productName: "K-ITEM FINDER",
  productDescription: "Customer & Market Opportunity Discovery Engine",
  appVersion: "v0.3.0",
  promptVersion: "v1.3.0",
  updatedAt: "2026.08.11",
  copyrightYear: "2023~2026",
};
const COMPANY_INFO = {
  companyName: "그로스벤처스 주식회사",
  address: "서울특별시 구로구 디지털로27길 24, 209호",
  phone: "070-4103-4177",
  phoneTel: "07041034177",
  email: "start@gven.kr",
  platformName: "BECONIC",
  platformUrl: "http://www.beconic.kr",
  certification: "중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호",
  copyright: "© 2023~2026 growthventures Co., Ltd. All rights reserved.",
};
const API_ENDPOINT = "/api/opportunity"; // netlify redirect → /.netlify/functions/opportunity

const BAND_LABEL = { veryHigh:"매우 높음", high:"높음", medium:"보통", low:"낮음", veryLow:"매우 낮음", unknown:"확인 필요" };
const BAND_PCT   = { veryHigh:100, high:80, medium:60, low:40, veryLow:20, unknown:50 };
const EVIDENCE_LABEL = { L0:"AI 가설", L1:"2차 신호", L2:"복수 외부신호", L3:"직접 고객근거" };

// ---------- STATE ----------
const State = {
  step: 0,
  input: {
    userType:"", experience:"", industry:"", knownCustomer:"", knownProblem:"",
    resources:{ hw:[], sw:[], human:[] }, budget:"",
    region:"", targetAge:"", preferredForm:"",
  },
  industryTags:[], customerTags:[],
  result:null, shortlist:[], primary:null, isSample:false, aiReady:null,

  // 이탈 방지: 온보딩 진행 상황을 localStorage에 저장/복원
  save(){
    try{ localStorage.setItem("kif_session", JSON.stringify({
      step:this.step, input:this.input, customerTags:this.customerTags, ts:Date.now(),
    })); }catch(e){}
  },
  load(){
    try{
      const raw=localStorage.getItem("kif_session"); if(!raw)return null;
      const s=JSON.parse(raw);
      // 24시간 지난 세션은 무시
      if(!s.ts || Date.now()-s.ts > 864e5){ this.clear(); return null; }
      return s;
    }catch(e){ return null; }
  },
  restore(s){ this.step=s.step||0; this.input=s.input||this.input; this.customerTags=s.customerTags||[]; },
  clear(){ try{ localStorage.removeItem("kif_session"); }catch(e){} },
};

// ============================================================
// App 컨트롤러
// ============================================================
const App = {
  esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  init(){
    // Footer / Header Config 주입
    document.getElementById("hdrVer").textContent = " · " + APP_META.appVersion;
    document.getElementById("footCert").textContent = COMPANY_INFO.certification;
    const tel=document.getElementById("footTel"); tel.textContent="📞 "+COMPANY_INFO.phone; tel.href="tel:"+COMPANY_INFO.phoneTel;
    const em=document.getElementById("footEmail"); em.textContent="✉ "+COMPANY_INFO.email; em.href="mailto:"+COMPANY_INFO.email;
    const web=document.getElementById("footWeb"); web.textContent="🌐 "+COMPANY_INFO.platformUrl.replace(/^https?:\/\//,''); web.href=COMPANY_INFO.platformUrl; web.target="_blank"; web.rel="noopener noreferrer";
    document.getElementById("footAddr").textContent="📍 "+COMPANY_INFO.address;
    document.getElementById("footPlatform").textContent=COMPANY_INFO.platformName+" · "+COMPANY_INFO.companyName;
    document.getElementById("footCopy").textContent=COMPANY_INFO.copyright;
    document.getElementById("footAppMeta").textContent=`${APP_META.productName} · ${APP_META.appVersion} · Updated ${APP_META.updatedAt}`;
    this.checkAIStatus();
  },
  // AI 연동 상태 확인 (LLM 호출 없는 health 체크)
  async checkAIStatus(){
    const el=document.getElementById("aiStatus");
    try{
      const res=await fetch(API_ENDPOINT,{ method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ action:"health" }) });
      const data=await res.json();
      if(data.ready){
        el.className="ai-status ready"; el.title="AI 연동됨 · 실제 탐색 가능";
        el.innerHTML='<span class="ai-dot"></span><span class="ai-text">AI 연동됨</span>';
        State.aiReady=true;
      }else{
        el.className="ai-status sample"; el.title="API 키 미설정 · 샘플 모드로 동작";
        el.innerHTML='<span class="ai-dot"></span><span class="ai-text">샘플 모드</span>';
        State.aiReady=false;
      }
    }catch(e){
      el.className="ai-status sample"; el.title="AI 서버에 연결할 수 없음 · 샘플 모드";
      el.innerHTML='<span class="ai-dot"></span><span class="ai-text">샘플 모드</span>';
      State.aiReady=false;
    }
  },
  show(id){
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    document.getElementById("screen-"+id).classList.add("active");
    window.scrollTo(0,0);
  },
  startFlow(){
    // AI 미연동 상태면 안내 후 샘플 유도 (실탐색은 API 키 필요)
    if(State.aiReady===false){
      if(confirm("현재 AI가 연동되지 않아 실제 탐색이 어렵습니다.\n(관리자: Netlify에 ANTHROPIC_API_KEY 설정 필요)\n\n먼저 샘플 결과를 보시겠어요?")){
        this.showSample(); return;
      }
    }
    // 이탈 방지: 이전에 진행하던 세션이 있으면 이어하기 제안
    const saved=State.load();
    if(saved && (saved.input?.userType || saved.step>0)){
      if(confirm("이전에 입력하시던 내용이 있어요.\n이어서 진행하시겠어요?\n\n(취소를 누르면 새로 시작합니다)")){
        State.restore(saved); State.isSample=false;
        document.getElementById("sampleBanner").classList.remove("show");
        Onboarding.resume(); return;
      } else { State.clear(); }
    }
    State.isSample=false; document.getElementById("sampleBanner").classList.remove("show"); Onboarding.start();
  },
  restart(){
    State.clear();
    State.step=0; State.input={ userType:"",experience:"",industry:"",knownCustomer:"",knownProblem:"",
      resources:{hw:[],sw:[],human:[]},budget:"",region:"",targetAge:"",preferredForm:"" };
    State.industryTags=[]; State.customerTags=[]; State.result=null; State.shortlist=[]; State.primary=null; State.isSample=false;
    document.getElementById("sampleBanner").classList.remove("show");
    this.show("start");
  },
  showSample(){
    State.isSample=true;
    document.getElementById("sampleBanner").classList.add("show");
    State.result = SAMPLE_RESULT;
    State.shortlist=[]; State.primary=null;
    Result.render();
    this.show("result");
  },
  showAbout(){ About.render(); this.show("about"); },
  toast(msg){
    const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show");
    clearTimeout(this._tt); this._tt=setTimeout(()=>t.classList.remove("show"),2200);
  },
};

// ============================================================
// Onboarding — One question per screen
// ============================================================
const STEPS = [
  { key:"profile", q:"나에 대해 알려주세요", help:"당신의 유형과 강점을 알면 실행 가능한 기회를 더 잘 찾을 수 있어요." },
  { key:"customer", q:"어떤 고객이나 시장에 관심이 있나요?", help:"아직 정하지 않았다면 AI가 함께 찾아드립니다." },
  { key:"problem", q:"알고 있는 불편함이나 문제가 있나요?", help:"떠오르는 게 없어도 괜찮아요. 시장 신호에서 찾아냅니다." },
  { key:"resource", q:"활용할 수 있는 자원은 무엇인가요?", help:"기회를 당신이 실제로 실행할 수 있는지 판단하는 데 씁니다." },
  { key:"optional", q:"조금 더 좁혀볼까요?", help:"모두 선택 사항입니다. 상관없으면 건너뛰어도 됩니다." },
];

const Onboarding = {
  start(){ State.step=0; App.show("onboarding"); this.render(); },
  resume(){ App.show("onboarding"); this.render(); }, // 복원된 step에서 재개
  render(){
    const s=STEPS[State.step];
    // progress
    const prog=document.getElementById("obProgress");
    prog.innerHTML=STEPS.map((_,i)=>`<span class="${i<=State.step?'on':''}"></span>`).join("");
    const remain=STEPS.length-State.step-1;
    document.getElementById("obStepCount").textContent=
      `STEP ${State.step+1} / ${STEPS.length}` + (remain>0?` · 약 ${remain}분 남음`:` · 거의 다 왔어요`);
    let html=`<h2 class="ob-q">${s.q}</h2><p class="ob-help">${s.help}</p>`;
    html += this["render_"+s.key]();
    document.getElementById("obContent").innerHTML=html;
    document.getElementById("obPrev").style.visibility = State.step===0 ? "hidden":"visible";
    document.getElementById("obNext").textContent = State.step===STEPS.length-1 ? "사업기회 탐색하기" : "다음";
    if(s.key==="customer") this.renderTags("customer");
    if(s.key==="problem") this.syncProblem();
    State.save(); // 이탈 방지: 매 스텝 저장
  },

  render_profile(){
    const types=["예비창업자","창업자","기존기업","소상공인","스타트업","중소기업","신사업 담당자","컨설턴트"];
    const budgets=[["under1000만","1천만원 미만"],["1000_5000만","1천~5천만원"],["5000만_1억","5천만~1억"],["1억이상","1억 이상"]];
    return `
      <div class="field"><label>어떤 유형에 가까운가요?</label>
        <div class="opts">${types.map(t=>`<button class="opt ${State.input.userType===t?'sel':''}" onclick="Onboarding.pick('userType','${t}')"><span class="ck"></span>${t}</button>`).join("")}</div></div>
      <div class="field"><label>보유한 경험이나 역량을 알려주세요</label>
        <textarea class="input" id="f_experience" placeholder="예) 금융권 20년 · 영업/기획 · 제조 현장 관리 경험" oninput="Onboarding.setText('experience',this.value)">${State.input.experience}</textarea></div>
      <div class="field"><label>초기 투자 가능 범위</label>
        <div class="opts">${budgets.map(([v,l])=>`<button class="opt ${State.input.budget===v?'sel':''}" onclick="Onboarding.pick('budget','${v}')"><span class="ck"></span>${l}</button>`).join("")}</div></div>`;
  },
  render_customer(){
    const hint = State.input.industry==='__AI_FIND__' ? '🔦 AI가 시장 신호에서 유망한 고객·시장을 대신 찾아드립니다.'
               : State.input.industry==='__UNKNOWN__' ? '🔦 괜찮아요. 시장 신호에서 함께 찾아드릴게요.' : '';
    return `
      <div class="field"><label>관심 있는 고객·산업을 입력해 보세요 (여러 개 가능)</label>
        <input class="input" id="f_customerTag" placeholder="예) 시니어, 제조 중소기업, 로컬 소상공인" onkeydown="if(event.key==='Enter'){Onboarding.addTag('customer',this);}" />
        <div class="tags" id="customerTags"></div>
        <div class="escape-row">
          <button class="escape ${State.input.industry==='__UNKNOWN__'?'sel':''}" onclick="Onboarding.escape('customer','__UNKNOWN__')">잘 모르겠어요</button>
          <button class="escape ${State.input.industry==='__AI_FIND__'?'sel':''}" onclick="Onboarding.escape('customer','__AI_FIND__')">AI가 찾아주세요</button>
        </div>
        <p class="escape-desc">👆 딱 정해두지 않았다면 눌러보세요. 입력을 비워두면 AI가 시장 데이터에서 유망한 고객·시장을 대신 골라줍니다.</p>
        ${hint?`<div class="ai-hint">${hint}</div>`:''}</div>`;
  },
  render_problem(){
    const hint = State.input.knownProblem==='__AI_FIND__' ? '🔦 AI가 고객의 반복되는 문제를 대신 발굴합니다.'
               : State.input.knownProblem==='__NONE__' ? '🔦 아직 없어도 괜찮아요. AI가 문제를 찾아드립니다.' : '';
    return `
      <div class="field"><label>고객이 겪는 불편함이나 문제를 적어주세요</label>
        <textarea class="input" id="f_problem" placeholder="예) 퇴직 후 안정적 수입원을 찾기 어렵다 · 제조사가 품질검사에 사람을 많이 쓴다" oninput="Onboarding.setText('knownProblem',this.value)">${State.input.knownProblem&&!State.input.knownProblem.startsWith('__')?State.input.knownProblem:''}</textarea>
        <div class="escape-row">
          <button class="escape ${State.input.knownProblem==='__AI_FIND__'?'sel':''}" onclick="Onboarding.escape('problem','__AI_FIND__')">AI가 찾아주세요</button>
          <button class="escape ${State.input.knownProblem==='__NONE__'?'sel':''}" onclick="Onboarding.escape('problem','__NONE__')">아직 없습니다</button>
        </div>
        <p class="escape-desc">👆 떠오르는 문제가 없어도 괜찮아요. 눌러두면 AI가 시장에서 자주 언급되는 불편·문제를 대신 찾아냅니다.</p>
        ${hint?`<div class="ai-hint">${hint}</div>`:''}</div>`;
  },
  render_resource(){
    const r=State.input.resources;
    const grp=(title,key,ph)=>`<div class="res-group"><div class="rg-title">${title}</div>
      <input class="input" placeholder="${ph}" onkeydown="if(event.key==='Enter'){Onboarding.addRes('${key}',this);}" />
      <div class="tags" id="res_${key}">${r[key].map((v,i)=>`<span class="tag">${App.esc(v)}<button onclick="Onboarding.rmRes('${key}',${i})">×</button></span>`).join("")}</div></div>`;
    return `<div class="field">
      ${grp("🔧 하드웨어 (Hardware)","hw","예) 센서, 장비, 제조설비 — 입력 후 Enter")}
      ${grp("💻 소프트웨어 (Software)","sw","예) 앱, 데이터, AI 모델 — 입력 후 Enter")}
      ${grp("👤 사람·전문성 (Humanware)","human","예) 개발, 영업, 도메인 전문지식 — 입력 후 Enter")}
    </div>`;
  },
  render_optional(){
    const forms=["상관없어요","SaaS/앱","서비스","마켓플레이스","교육/콘텐츠","제품"];
    return `
      <div class="field"><label>관심 지역</label>
        <input class="input" placeholder="예) 수도권, 지방 소도시 (선택)" value="${State.input.region&&!State.input.region.startsWith('__')?State.input.region:''}" oninput="Onboarding.setText('region',this.value)" /></div>
      <div class="field"><label>관심 연령대</label>
        <input class="input" placeholder="예) 시니어, 2030 (선택)" value="${State.input.targetAge&&!State.input.targetAge.startsWith('__')?State.input.targetAge:''}" oninput="Onboarding.setText('targetAge',this.value)" /></div>
      <div class="field"><label>선호 사업형태</label>
        <div class="opts">${forms.map(f=>`<button class="opt ${State.input.preferredForm===f?'sel':''}" onclick="Onboarding.pick('preferredForm','${f}')"><span class="ck"></span>${f}</button>`).join("")}</div></div>`;
  },

  // --- helpers ---
  pick(key,val){ State.input[key]=val; this.render(); },
  setText(key,val){ State.input[key]=val; },
  escape(step,val){
    if(step==="customer"){ State.input.industry=val; State.customerTags=[]; }
    if(step==="problem"){ State.input.knownProblem=val; }
    this.render();
  },
  addTag(type,el){
    const v=el.value.trim(); if(!v)return;
    State.customerTags.push(v); State.input.industry=""; el.value="";
    this.renderTags(type);
  },
  renderTags(type){
    const box=document.getElementById("customerTags"); if(!box)return;
    box.innerHTML=State.customerTags.map((t,i)=>`<span class="tag">${App.esc(t)}<button onclick="Onboarding.rmTag(${i})">×</button></span>`).join("");
  },
  rmTag(i){ State.customerTags.splice(i,1); this.renderTags("customer"); },
  addRes(key,el){ const v=el.value.trim(); if(!v)return; State.input.resources[key].push(v); el.value=""; this.render(); },
  rmRes(key,i){ State.input.resources[key].splice(i,1); this.render(); },
  syncProblem(){},

  prev(){ if(State.step>0){State.step--; this.render();} },
  next(){
    // 최소 검증: step0 필수
    if(State.step===0){
      if(!State.input.userType){ App.toast("유형을 선택해 주세요"); return; }
      if(!State.input.budget){ App.toast("투자 범위를 선택해 주세요"); return; }
    }
    if(State.step===1 && State.customerTags.length){ State.input.industry=State.customerTags.join(", "); }
    if(State.step<STEPS.length-1){ State.step++; this.render(); }
    else { this.submit(); }
  },
  submit(){
    // sentinel 정리
    const inp=JSON.parse(JSON.stringify(State.input));
    inp.industry = State.customerTags.length ? State.customerTags.join(", ") : (inp.industry||"__UNKNOWN__");
    inp.knownCustomer = inp.knownCustomer || "__NONE__";
    inp.knownProblem = inp.knownProblem || "__AI_FIND__";
    inp.region = inp.region || "__ANY__";
    inp.targetAge = inp.targetAge || "__ANY__";
    inp.preferredForm = (inp.preferredForm && inp.preferredForm!=="상관없어요") ? inp.preferredForm : "__ANY__";
    Discovery.run(inp);
  },
};

// ============================================================
// Discovery — API 호출 + 로딩 서사
// ============================================================
const DISC_STEPS = [
  "고객의 상황을 구조화하고 있어요",
  "반복되는 문제를 찾고 있어요",
  "현재 해결방법의 빈틈을 살펴보고 있어요",
  "시장 변화와 연결하고 있어요",
  "실행 가능한 후보를 비교하고 있어요",
];
const Discovery = {
  async run(input){
    App.show("discovery");
    this.animate();
    const jobId = (crypto.randomUUID?.() || ("job_"+Date.now()+"_"+Math.random().toString(36).slice(2)));
    try{
      // 1) 탐색 제출 (background function → 즉시 202)
      const submit = await fetch("/api/discover", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ jobId, input }),
      });
      // background 함수는 202 Accepted 반환. 4xx/5xx면 제출 실패.
      if(submit.status>=400){
        const e=await submit.json().catch(()=>({}));
        throw new Error(e.message||"탐색 요청에 실패했습니다");
      }
      // 2) 상태 폴링 (최대 ~3분, 3초 간격)
      const data = await this.poll(jobId);
      await this._minWait();
      State.result=data; State.shortlist=[]; State.primary=null; State.isSample=false; State.clear();
      Result.render(); App.show("result");
    }catch(err){
      this.error(err.message);
    }
  },
  async poll(jobId){
    const maxTries = 150;     // 150회 × 2초 = 최대 5분
    const interval = 2000;    // 3초→2초: 완료 감지 지연 단축
    for(let i=0;i<maxTries;i++){
      await new Promise(r=>setTimeout(r, interval));
      let data;
      try{
        const res = await fetch(`/api/status?jobId=${encodeURIComponent(jobId)}`);
        data = await res.json();
      }catch(e){ continue; } // 일시 오류는 계속 폴링
      if(data.status==="done") return data.result;
      if(data.status==="error"){
        let detail = data.detail ? `\n[${data.error||''}] ${data.detail}` : (data.error?`\n(${data.error})`:'');
        if(data.raw) detail += `\n\n[AI 응답 일부]\n${String(data.raw).slice(0,300)}`;
        throw new Error("사업기회 탐색 중 문제가 발생했습니다."+detail);
      }
      // pending / processing → 계속 폴링
    }
    throw new Error("탐색이 예상보다 오래 걸립니다. 잠시 후 다시 시도해 주세요.");
  },
  animate(){
    const box=document.getElementById("discSteps");
    box.innerHTML=DISC_STEPS.map((t,i)=>`<div class="disc-step" id="ds${i}"><span class="ico">${i+1}</span>${t}</div>`).join("");
    this._t0=Date.now(); let i=0;
    const tick=()=>{
      document.querySelectorAll(".disc-step").forEach((el,idx)=>{
        el.classList.toggle("done", idx<i); el.classList.toggle("active", idx===i);
        if(idx<i) el.querySelector(".ico").textContent="✓";
      });
      i++;
      // 마지막 단계는 완료 전까지 active 유지(폴링 동안 멈춘 느낌 방지)
      if(i<DISC_STEPS.length) this._anim=setTimeout(tick, 2500);
      else document.querySelector("#ds"+(DISC_STEPS.length-1))?.classList.add("active");
    };
    tick();
  },
  _minWait(){ const el=Math.max(0, 3200-(Date.now()-this._t0)); return new Promise(r=>setTimeout(r,el)); },
  error(msg){
    clearTimeout(this._anim);
    document.getElementById("discSteps").innerHTML=`
      <div style="text-align:center">
        <p style="font-size:16px;color:var(--navy);font-weight:700;margin-bottom:8px">탐색 중 문제가 발생했어요</p>
        <p style="font-size:14px;color:var(--slate);margin-bottom:20px">${msg||"잠시 후 다시 시도해 주세요."}</p>
        <button class="btn btn-primary btn-sm" onclick="Onboarding.submit()">다시 시도</button>
        <button class="btn btn-ghost btn-sm" onclick="App.showSample()" style="margin-left:8px">샘플 결과 보기</button>
        <p style="font-size:12px;color:var(--slate-weak);margin-top:16px">문의 ${COMPANY_INFO.email}</p>
      </div>`;
  },
};

App.init();
