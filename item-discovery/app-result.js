/* ============================================================
   K-ITEM FINDER — Result Render · PDF · About · Sample
   ============================================================ */

// ============================================================
// Result 렌더러
// ============================================================
const Result = {
  render(){
    const R=State.result; if(!R){return;}
    const c=document.getElementById("resultContent");
    c.innerHTML = `
      ${this.head()}
      ${this.execSummary(R)}
      ${this.legend()}
      <div class="section-head"><h3 class="sec-title">📁 발굴된 사업기회 ${R.top5.length}개</h3><p class="sec-sub">각 카드를 펼치면 상세 내용과 '왜 이 아이템인가'를 볼 수 있어요.</p></div>
      ${R.top5.map((o,i)=>this.card(o,i)).join("")}
      ${this.compare(R.comparison)}
      ${this.selectPanel()}
      ${this.disclaimerFull()}
      ${R._debug?`<div style="text-align:center;font-size:11px;color:#B0B8C4;margin-top:16px">진단: CALL B ${R._debug.callB||'?'}</div>`:''}
    `;
    this.bindShortlist();
    // 첫 번째 카드는 자동으로 펼쳐 무엇을 보게 될지 즉시 노출
    const first=R.top5[0];
    if(first){ const el=document.getElementById("card_"+first.opportunityId); if(el) el.classList.add("open"); }
  },
  disclaimerFull(){
    return `<div class="disclaimer-full" id="resultDisclaimer">
      <h4>이 결과를 어떻게 봐야 하나요?</h4>
      <p>이 결과는 <b>사업성을 확정한 것이 아니라</b>, 현재 입력과 시장 신호를 기반으로 추가 검토할 가치가 있는 사업기회입니다.
      성공확률·투자등급·매출·지원사업 선정 가능성을 의미하지 않습니다.
      AI 분석과 외부 데이터에는 오류·시차가 있을 수 있으니, 실제 사업화 전 <b>고객·시장·기술·재무·규제 검증</b>이 필요합니다.
      선택한 아이템은 K-ITEM PMF LAB에서 증거 기반으로 검증하시길 권장합니다.</p>
    </div>`;
  },
  head(){
    const n=State.result.top5.length;
    return `<div class="result-head">
      <div class="result-badge">✨ 탐색 완료</div>
      <h2>당신에게 맞는 ${n}개의 사업기회를 찾았어요</h2>
      <p class="result-lead">각 기회는 서로 다른 강점을 가지고 있어요. 아래에서 비교하고, 검토하고 싶은 것을 골라보세요.
        <button class="lead-info" onclick="Result.scrollDisclaimer()">이 결과는 어떻게 봐야 하나요? ▾</button></p>
    </div>`;
  },
  scrollDisclaimer(){ document.getElementById("resultDisclaimer")?.scrollIntoView({behavior:"smooth"}); },
  execSummary(R){
    return `<div class="exec-summary">
      <h3>🧭 한눈에 보기</h3>
      ${R.marketPerspective?`<div class="market-view"><span class="mv-label">시장을 보는 관점</span><p>${this.esc(this.cleanInsight(R.marketPerspective))}</p></div>`:`<p style="font-size:14px;color:var(--slate);margin-bottom:18px">${R.summary?.disclaimer||"성공 가능성 순위가 아니라, 서로 다른 강점을 가진 5개 후보입니다."}</p>`}
      <div class="exec-list">
        ${R.top5.map((o,i)=>{
          const n=o.narrative||{};
          const tag=n.tagline||n.valueProp||n.problem||'';
          const chips=this.itemChips(o);
          return `<div class="exec-item">
            <div class="ei-num">${i+1}</div>
            <div class="ei-body">
              <div class="ei-name">${this.esc(o.title)}</div>
              ${tag?`<div class="ei-tag">${this.esc(tag)}</div>`:''}
              ${chips?`<div class="ei-chips">${chips}</div>`:''}
            </div>
          </div>`;
        }).join("")}
      </div>
      <p style="font-size:12px;color:var(--slate-weak);margin-top:14px">↓ 각 후보의 차별점과 상세 비교는 아래 카드와 비교표에서 확인하세요.</p>
    </div>`;
  },
  card(o,i){
    const s=o.signals; const n=o.narrative||{};
    const sbar=(name,band,raw)=>`<div class="sbar">
      <div class="sname"><span>${name}</span><em class="band-${band}">${BAND_LABEL[band]}</em></div>
      <div class="track"><div class="ticks"><i></i><i></i><i></i></div><div class="fill band-${band}" style="width:${BAND_PCT[band]}%"></div></div></div>`;
    const ff=o.founderFit||{band:"unknown",note:"",misfits:[]};
    const inShort=State.shortlist.includes(o.opportunityId);
    return `<div class="opp-card" id="card_${o.opportunityId}">
      <div class="opp-head" onclick="Result.toggle('${o.opportunityId}')">
        <div class="opp-rank">${i+1}</div>
        <div class="opp-head-main">
          <h3>${this.esc(n.name||o.title)}</h3>
          <div class="who">${this.esc(n.tagline||n.valueProp||n.who||o.customer?.roles?.user||"")}</div>
        </div>
        <svg class="opp-chev" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="signal-bars">
        ${sbar("문제 강도",s.problemSignal.band,s.problemSignal.raw)}
        ${sbar("시장 공백",s.marketGapSignal.band,s.marketGapSignal.raw)}
        ${sbar("타이밍",s.timingSignal.band,s.timingSignal.raw)}
      </div>
      <div class="opp-body">
        <div class="opp-body-inner">
          <div class="grid16">
            ${this.f("이런 문제를 풉니다",n.problem)}
            ${this.f("시장의 빈틈",n.marketGap||o.marketGap?.statement)}
            ${this.f("어떻게 해결하나",n.solutionConcept)}
            ${this.f("왜 지금인가",n.whyNow||(o.whyNow||[]).map(w=>w.signal).filter(Boolean).join(", "))}
            ${this.f("고객이 얻는 가치",n.valueProp)}
            ${this.f("💪 강점",n.strength)}
            ${this.f("⚠️ 유의점",n.caution)}
            ${this.f("📈 지속가능성",n.sustainability)}
            ${this.f("누가 비용을 지불하나",n.buyer||o.buyer)}
            ${this.f("제공 형태",this.solTypeKo(o.solution?.solutionType)+(o.solution?.resourceType?" · "+this.resourceKo(o.solution.resourceType):""))}
            ${this.f("사업화 전 확인할 점",n.unknowns||(o.unknowns||[]).join(", "))}
          </div>

          <!-- Founder Fit (절충안): 회색밴드 + 정성코멘트 + 미스핏 -->
          <div class="founder-fit">
            <div class="ff-top">
              <span class="ff-title">🎯 나와의 적합도</span>
              <span class="ff-band"><span class="g-dot"></span>정밀 평가 전</span>
            </div>
            <div class="ff-note">${this.esc(ff.note||n.founderMatchReason||"당신의 경험·자원이 이 기회에 어떻게 연결되는지는 검증 단계에서 정밀하게 평가됩니다. 현재는 실행 걸림돌만 점검했습니다.")}</div>
            ${(ff.misfits||[]).map(m=>`<div class="misfit"><span class="mi">⚠</span><span class="mt">${this.esc(m.message)}</span></div>`).join("")}
          </div>

          <div class="explain-path show">
            <div class="ep-title">🔦 왜 이 아이템인가 — 고객의 문제에서 이 사업기회까지</div>
            <div class="ep-steps">
            ${(o.explainPath||[]).map((p,idx,arr)=>{
              const raw=String(p||"");
              const m=raw.match(/^\s*\d*\.?\s*([^:：]{1,8})[:：]\s*(.+)$/);
              const label=m?m[1].trim():this.epLabel(idx,arr.length);
              const body=m?m[2].trim():raw;
              const last=idx===arr.length-1;
              return `<div class="ep-step${last?' ep-last':''}"><span class="ep-num">${idx+1}</span>
                <div class="ep-c"><span class="ep-label">${this.esc(label)}</span><span class="ep-text">${this.esc(body)}</span></div></div>`;
            }).join("")}
            </div>
          </div>

          <div class="opp-actions">
            <button class="chip-add ${inShort?'added':''}" id="add_${o.opportunityId}" onclick="Result.toggleShort('${o.opportunityId}')">${inShort?'✓ 담김':'+ Shortlist 담기'}</button>
            <span class="evidence-tag">근거 수준: ${EVIDENCE_LABEL[s.evidenceConfidence]||s.evidenceConfidence}</span>
          </div>
        </div>
      </div>
    </div>`;
  },
  compare(cmp){
    if(!cmp||!cmp.rows)return"";
    const rowMap = [
      ["문제 강도","problem"],["시장 공백","marketGap"],["타이밍","whyNow"],
      ["근거 수준","evidence"],["자원 부담","resourceBurden"],["기술 성숙도","techReadiness"],["적합도","founderFitStatus"],
    ];
    const cell=(r,key)=>{
      if(key==="evidence") return `<span class="evidence-tag">${EVIDENCE_LABEL[r.evidence]||r.evidence}</span>`;
      if(key==="resourceBurden"){const l={low:"낮음",medium:"보통",high:"높음"}[r.resourceBurden]||"-";return `<span class="cmp-band band-${r.resourceBurden==='low'?'high':r.resourceBurden==='high'?'low':'medium'}">${l}</span>`;}
      if(key==="techReadiness"){const l={AVAILABLE_NOW:"바로 가능",INTEGRATION_REQUIRED:"연동 필요",R_AND_D_REQUIRED:"R&D 필요"}[r.techReadiness]||"-";return `<span class="cmp-band band-medium">${l}</span>`;}
      if(key==="founderFitStatus"){return r.founderFitStatus==="misfit"?`<span class="cmp-band band-low">⚠ 걸림돌</span>`:`<span class="cmp-band band-unknown">평가 전</span>`;}
      const b=r[key]; return `<span class="cmp-band band-${b}">${BAND_LABEL[b]}</span>`;
    };
    return `<div class="compare">
      <h3>📊 TOP ${cmp.rows.length} 비교</h3>
      ${State.result.comparisonInsight?`<div class="cmp-insight"><span class="cmp-insight-label">💡 5개를 어떻게 나눠 볼까</span>${this.esc(this.cleanInsight(State.result.comparisonInsight))}</div>`:''}
      ${this.signalChart(cmp)}
      <div class="compare-scroll"><table class="cmp">
        <thead><tr><th></th>${cmp.rows.map((r,i)=>`<th>${i+1}. ${this.esc((r.title||'').slice(0,18))}</th>`).join("")}</tr></thead>
        <tbody>
          ${rowMap.map(([label,key])=>`<tr><th>${label}</th>${cmp.rows.map(r=>`<td>${cell(r,key)}</td>`).join("")}</tr>`).join("")}
          <tr class="cmp-diff-row"><th>차별점</th>${cmp.rows.map(r=>{
            const o=State.result.top5.find(x=>x.opportunityId===(r.id||r.opportunityId));
            const d=o?.narrative?.differentiator||o?.narrative?.valueProp||'—';
            return `<td class="cmp-diff">${this.esc(d)}</td>`;
          }).join("")}</tr>
        </tbody>
      </table></div>
      <p style="font-size:12.5px;color:var(--slate-weak);margin-top:10px">※ 단일 1등을 강요하지 않습니다. 후보마다 서로 다른 강점이 있습니다.</p>
    </div>`;
  },
  signalChart(cmp){
    const R=State.result;
    const solOf=(o)=>o.solution?.solutionType||o._seedSolution||"";
    const axisX=(o)=>{ const map={SaaS:88,Product:82,App:78,Platform:65,Marketplace:55,Content:60,Community:45,Education:30,Service:18,Subscription:70}; return map[solOf(o)]??50; };
    const axisY=(o)=>{ const map={Service:85,Marketplace:78,Subscription:70,Consulting:82,SaaS:55,App:50,Product:45,Platform:40,Community:35,Education:60,Content:25}; return map[solOf(o)]??50; };
    const pts=(R.top5||[]).map((o,i)=>({i,x:axisX(o),y:100-axisY(o),title:o.title}));
    // 겹침 방지: 근접 좌표 그룹을 작은 원형으로 흩뿌림 → 5개가 항상 다 보이게
    const groups={};
    pts.forEach(p=>{ const key=`${Math.round(p.x/7)}_${Math.round(p.y/7)}`; (groups[key]=groups[key]||[]).push(p); });
    Object.values(groups).forEach(g=>{
      if(g.length>1){ const rad=9; g.forEach((p,k)=>{ const a=(2*Math.PI*k)/g.length - Math.PI/2; p.x=Math.max(7,Math.min(93,p.x+rad*Math.cos(a))); p.y=Math.max(9,Math.min(91,p.y+rad*Math.sin(a))); }); }
    });
    const dots=pts.map(p=>`<div class="pm-dot" style="left:${p.x}%;top:${p.y}%" title="${this.esc(p.title)}">${p.i+1}</div>`).join("");
    return `<div class="pos-map">
      <div class="pm-title">📍 ${(R.top5||[]).length}개 후보 성격 지도</div>
      <div class="pm-box">
        <span class="pm-ax pm-ax-t">즉시 수익형</span>
        <span class="pm-ax pm-ax-b">자산 축적형</span>
        <span class="pm-ax pm-ax-l">사람·서비스 중심</span>
        <span class="pm-ax pm-ax-r">제품·자동화 중심</span>
        <div class="pm-grid-x"></div><div class="pm-grid-y"></div>
        ${dots}
      </div>
      <div class="pm-key">${(R.top5||[]).map((o,i)=>`<span class="pm-key-item"><b>${i+1}</b> ${this.esc(o.title)}</span>`).join("")}</div>
      <div class="pm-hint">가로: 사람이 직접 → 제품이 자동으로 · 세로: 오래 키우는 자산 → 바로 버는 수익</div>
    </div>`;
  },
  itemChips(o){
    const t=o.solution?.solutionType||o._seedSolution||"";
    const chips=[];
    const productType={SaaS:"제품형",Product:"제품형",App:"제품형",Platform:"플랫폼형",Marketplace:"플랫폼형",
      Service:"서비스형",Consulting:"서비스형",Education:"교육형",Content:"콘텐츠형",Subscription:"구독형",Community:"커뮤니티형"}[t];
    if(productType) chips.push(["type",productType]);
    const offline=["Education","Consulting","Service"].includes(t);
    chips.push(["place", offline?"온·오프라인":"온라인 중심"]);
    const instant=["Service","Marketplace","Consulting","Subscription"].includes(t);
    chips.push(["rev", instant?"즉시 수익형":"자산 축적형"]);
    const burden={low:"저비용 시작",medium:"보통 투자",high:"초기 투자 필요"}[o.resourceBurden]||"";
    if(burden) chips.push(["cost",burden]);
    return chips.map(([k,v])=>`<span class="ei-chip ei-chip-${k}">${v}</span>`).join("");
  },
  selectPanel(){
    const list=State.shortlist;
    let inner;
    if(!list.length){ inner=`<div class="shortlist-empty">위 카드에서 <b>Shortlist 담기</b>를 눌러 최대 3개까지 담아보세요.</div>`; }
    else {
      inner=list.map(id=>{
        const o=State.result.top5.find(x=>x.opportunityId===id);
        const isP=State.primary===id;
        return `<div class="short-item ${isP?'primary':''}">
          <span class="radio" onclick="Result.setPrimary('${id}')"></span>
          <span class="st-name">${this.esc(o.narrative?.name||o.title)}</span>
          <button class="st-remove" onclick="Result.toggleShort('${id}')">×</button></div>`;
      }).join("");
    }
    return `<div class="select-panel">
      <h3>✅ 검증할 아이템 선택</h3>
      <p>Shortlist(최대 3개) 중 하나를 <b>Primary</b>로 선택해 K-ITEM PMF LAB 검증으로 넘길 수 있습니다.</p>
      ${inner}
      <div class="result-cta">
        <button class="btn btn-primary btn-sm" ${State.primary?'':'disabled'} onclick="Result.handoff()">선택한 아이템 검증하기 →</button>
        <button class="btn btn-ghost btn-sm" onclick="Report.open()">📄 결과보고서 PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="App.restart()">다시 탐색</button>
      </div>
    </div>`;
  },

  // --- interactions ---
  toggle(id){ document.getElementById("card_"+id).classList.toggle("open"); },
  cleanInsight(text){
    if(!text) return "";
    let t=String(text);
    // kif_ops_001 등 내부 ID를 해당 아이템 이름으로 치환
    const R=State.result;
    if(R&&R.top5){
      R.top5.forEach((o,i)=>{
        const id=o.opportunityId;
        if(id){ const re=new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'); t=t.replace(re,`'${o.title}'`); }
      });
      // 남은 kif_ops_00N 패턴은 순번으로
      t=t.replace(/kif_ops_0*(\d+)/gi,(m,n)=>{const o=R.top5[parseInt(n)-1];return o?`'${o.title}'`:`${n}번`;});
    }
    return t;
  },
  legend(){
    return `<div class="sig-legend">
      <div class="sl-title">📖 결과 읽는 법</div>
      <div class="sl-body">
        <div class="sl-group">
          <span class="sl-k">3가지 신호</span>
          <span class="sl-desc"><b>문제 강도</b> 고객이 겪는 고통의 크기 · <b>시장 공백</b> 기존 대안의 부족함 · <b>타이밍</b> 지금 시작하기 좋은 정도</span>
        </div>
        <div class="sl-group">
          <span class="sl-k">막대 색</span>
          <span class="sl-scale">
            <span class="sl-chip band-veryLow">매우 낮음</span>
            <span class="sl-chip band-low">낮음</span>
            <span class="sl-chip band-medium">보통</span>
            <span class="sl-chip band-high">높음</span>
            <span class="sl-chip band-veryHigh">매우 높음</span>
          </span>
        </div>
        <div class="sl-note">※ 이 신호들은 성공 확률이 아니라 '검토할 가치'를 뜻합니다. 실제 사업성은 검증 단계에서 확인하세요.</div>
      </div>
    </div>`;
  },
  epLabel(idx,len){
    // 단계 위치에 따라 의미 라벨 부여 (CALL B가 라벨 없이 준 경우)
    if(idx===0) return "고객";
    if(idx===len-1) return "가치 실현";
    if(idx===len-2) return "사업 기회";
    const mid=["문제","시장 공백","전환점"];
    return mid[(idx-1)%mid.length]||"연결";
  },
  toggleShort(id){
    const i=State.shortlist.indexOf(id);
    if(i>-1){ State.shortlist.splice(i,1); if(State.primary===id)State.primary=null; }
    else { if(State.shortlist.length>=3){ App.toast("Shortlist는 최대 3개입니다"); return; } State.shortlist.push(id); }
    this.refreshSelect();
  },
  setPrimary(id){ State.primary=id; this.refreshSelect(); },
  refreshSelect(){
    // 카드 버튼 상태
    State.result.top5.forEach(o=>{
      const btn=document.getElementById("add_"+o.opportunityId);
      if(btn){ const on=State.shortlist.includes(o.opportunityId); btn.classList.toggle("added",on); btn.textContent=on?'✓ 담김':'+ Shortlist 담기'; }
    });
    // 패널 교체
    const panel=document.querySelector(".select-panel");
    if(panel){ panel.outerHTML=this.selectPanel(); }
  },
  bindShortlist(){},
  handoff(){
    const o=State.result.top5.find(x=>x.opportunityId===State.primary);
    if(!o){App.toast("Primary 아이템을 선택해 주세요");return;}
    const transfer=this.buildTransfer(o);
    // localStorage에도 백업 저장(같은 브라우저 폴백용)
    try{ localStorage.setItem("kif_handoff", JSON.stringify(transfer)); }catch(e){}
    // K-ITEM PMF LAB으로 이관 데이터와 함께 이동
    const PMF_LAB_URL = "https://item-jindan-2026.netlify.app/";
    let url = PMF_LAB_URL;
    try{
      // 핵심 데이터를 URL 파라미터로 전달(용량 큰 경우 대비 title/id만 기본 전달)
      const payload = encodeURIComponent(JSON.stringify(transfer));
      // URL 길이 제한(약 2000자) 고려: 너무 크면 요약본만 전달
      const compact = payload.length < 1800 ? payload
        : encodeURIComponent(JSON.stringify({ source:transfer.source, opportunity:transfer.opportunity,
            customer:transfer.customer, problem:transfer.problem, solution:transfer.solution }));
      url = `${PMF_LAB_URL}?from=finder&data=${compact}`;
    }catch(e){}
    App.toast("K-ITEM PMF LAB으로 이동합니다…");
    setTimeout(()=>{ window.open(url, "_blank", "noopener"); }, 600);
  },
  buildTransfer(o){
    return {
      source:"K-ITEM-FINDER", version:APP_META.promptVersion,
      opportunity:{ id:o.opportunityId, title:o.narrative?.name||o.title },
      customer:o.customer, context:o.context,
      problem:{ statement:o.narrative?.problem||"", severity:o.problem?.severity, frequency:o.problem?.frequency },
      emotion:o.emotions, motives:o.motives, currentAlternative:o.currentAlternative,
      marketGap:o.marketGap?.statement||o.narrative?.marketGap||"",
      whyNow:o.whyNow, solution:o.solution, founderMatch:o.founderFit,
      unknowns:o.unknowns, assumptions:o.assumptions,
      shortlist:State.shortlist,
    };
  },

  // --- helpers ---
  f(k,v){ v=(v==null?"":String(v)).trim(); if(!v||v==="확인 필요") return ""; return `<div class="f16"><div class="k">${k}</div><div class="v">${this.esc(v)}</div></div>`; },
  solTypeKo(t){
    const map={SaaS:"SaaS(구독형 소프트웨어)",Marketplace:"매칭 플랫폼",Platform:"플랫폼",
      Service:"전문 서비스",Education:"교육/클래스",Content:"콘텐츠",Product:"제품/솔루션",
      App:"모바일 앱",Community:"커뮤니티",Subscription:"구독 서비스"};
    return map[t]||t||"";
  },
  resourceKo(t){
    const map={SW:"소프트웨어",HW:"하드웨어",Human:"인적 자원",Hybrid:"복합"};
    return map[t]||t;
  },
  esc(s){ return String(s??"").replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); },
};

// ============================================================
// Report — PDF 생성 (전용 레이아웃 → window.print())
// ============================================================
const Report = {
  open(){ document.getElementById("reportModal").classList.add("show"); },
  close(){ document.getElementById("reportModal").classList.remove("show"); },
  generate(){
    const info={
      org:document.getElementById("rpOrg").value||"—",
      person:document.getElementById("rpPerson").value||"—",
      purpose:document.getElementById("rpPurpose").value,
      conf:document.getElementById("rpConf").value,
      date:new Date().toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"}),
    };
    this.close();
    const html=PDFLayout.build(State.result, info);
    let holder=document.getElementById("pdfHolder");
    if(!holder){ holder=document.createElement("div"); holder.id="pdfHolder"; document.body.appendChild(holder); }
    holder.innerHTML=html;
    document.body.classList.add("printing");
    setTimeout(()=>{ window.print(); }, 150);
    window.onafterprint=()=>{ document.body.classList.remove("printing"); holder.innerHTML=""; window.onafterprint=null; };
  },
};

// ============================================================
// About
// ============================================================
const About = {
  render(){
    document.getElementById("aboutContent").innerHTML=`
      <h2 class="ob-q">서비스 정보</h2>
      <p class="ob-help">${APP_META.productName} · ${APP_META.productDescription}</p>
      <div style="background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:24px;margin-top:20px">
        <div class="grid16" style="grid-template-columns:1fr">
          ${Result.f("제품",APP_META.productName+" ("+APP_META.appVersion+")")}
          ${Result.f("역할","고객문제·시장공백·시장변화·실행역량을 연결해 검토할 가치가 있는 사업기회를 발견 (FIND→COMPARE→SELECT→HANDOFF)")}
          ${Result.f("검증은?","선택한 아이템의 상세 검증은 K-ITEM PMF LAB이 담당합니다. 본 도구는 성공확률·투자등급·매출을 산출하지 않습니다.")}
          ${Result.f("작성기관",COMPANY_INFO.companyName+" · "+COMPANY_INFO.platformName)}
          ${Result.f("인증",COMPANY_INFO.certification)}
          ${Result.f("버전","앱 "+APP_META.appVersion+" · Prompt "+APP_META.promptVersion+" · Updated "+APP_META.updatedAt)}
        </div>
      </div>
      <div class="ob-nav"><button class="btn btn-ghost btn-sm" onclick="App.restart()">← 처음으로</button><span></span></div>`;
  },
};

/* ============================================================
   SAMPLE RESULT — API 키 없이 데모 (하드코딩)
   실제 서버 응답과 동일한 구조
   ============================================================ */
const SAMPLE_RESULT = {
  meta:{...APP_META},
  summary:{ generatedCount:5, disclaimer:"사업 성공 가능성 순위가 아니라, 서로 다른 강점을 가진 후보들입니다." },
  top5:[
    {
      opportunityId:"kif_ops_001", title:"퇴직 시니어 소득활동 매칭",
      customer:{ type:"B2C", roles:{ user:"퇴직 직후 시니어", buyer:"본인/자녀", decisionMaker:"본인" } },
      context:{ triggerEvent:"정년퇴직" },
      problem:{ types:["Information","Uncertainty","Trust"], severity:4, frequency:"weekly" },
      motives:["AVOID","CONTROL","ACHIEVE"],
      currentAlternative:[{type:"Search"},{type:"Human"}],
      marketGap:{ statement:"퇴직 시니어 대상 신뢰가능한 소득활동 매칭 서비스가 부족" },
      whyNow:[{signal:"고령화·정년연장",category:"DEMOGRAPHIC"}],
      solution:{ resourceType:"SW", solutionType:"Marketplace", concept:"검증된 시니어 적합 일감/창업을 신뢰도 기반으로 매칭" },
      buyer:"본인 또는 자녀", channel:"지역 커뮤니티·복지관 제휴",
      unknowns:["실제 지불의향","초기 공급자 확보"],
      signals:{ problemSignal:{raw:78,band:"high"}, marketGapSignal:{raw:71,band:"high"}, timingSignal:{raw:83,band:"veryHigh"}, founderMatch:{raw:null,band:"unknown"}, evidenceConfidence:"L1" },
      founderFit:{ band:"unknown", note:"금융·상담 경험이 있다면 시니어의 신뢰 확보에 유리하게 작용할 수 있습니다. 정밀 적합도는 검증 단계에서 평가됩니다.", misfits:[], hasMisfit:false },
      explainPath:["고령화 사회","퇴직 후 소득 필요","정보 파편화·불신","일반 구인앱은 시니어 부적합","미충족 시니어 세그먼트","신뢰 기반 매칭"],
      narrative:{ tagline:"신뢰 검증된 시니어 일감 매칭", differentiator:"일감 검증에 집중해 사기·미스매치 위험을 낮춘 점이 다르다", valueProp:"검증된 일감으로 퇴직 후 소득 공백을 안전하게 메웁니다", strength:"검증된 일감 풀이 신뢰를 만들어 재이용률이 높다", caution:"공급(일감)과 수요(시니어) 양쪽을 동시에 모아야 해 초기 견인이 어렵다", sustainability:"지역별로 복제 확장이 쉽고, 데이터가 쌓일수록 매칭 품질이 좋아진다", name:"퇴직 시니어 소득활동 매칭", who:"정년퇴직 직후 새 수입원을 찾는 55~64세",
        context:"퇴직 직후 고정 수입이 끊기고 재취업 정보는 흩어져 있는 상황",
        problem:"신뢰할 수 있는 시니어 적합 일감·창업 정보를 한곳에서 찾기 어렵다",
        emotionMotive:"노후 불안 회피(AVOID)와 자립 통제(CONTROL) 욕구",
        currentWorkaround:"검색·지인 소개·복지관 방문에 의존",
        whatsBroken:"일반 구인 플랫폼은 연령·신뢰·접근성 측면에서 시니어에 맞지 않음",
        marketGap:"시니어 특화 신뢰 매칭 레이어의 부재",
        whyNow:"고령화·정년연장으로 대상 규모가 구조적으로 확대",
        solutionConcept:"검증된 시니어 적합 일감/창업을 신뢰도 기반으로 매칭하는 마켓플레이스",
        buyer:"본인 또는 지원하는 자녀", channel:"지역 복지관·시니어 커뮤니티 제휴",
        founderMatchReason:"상담·신뢰 형성 경험이 초기 공급자·수요자 확보에 유리하게 작용할 수 있습니다.",
        unknowns:"실제 지불의향과 초기 공급자 확보 경로" },
    },
    {
      opportunityId:"kif_ops_002", title:"제조 소상공인 품질검사 반자동화",
      customer:{ type:"B2B", roles:{ user:"현장 검사인력", buyer:"대표", decisionMaker:"대표" } },
      context:{ triggerEvent:"인건비 상승" },
      problem:{ types:["Labor","Cost","Repetition"], severity:4, frequency:"daily" },
      motives:["SAVE","SIMPLIFY"],
      currentAlternative:[{type:"Manual"},{type:"InternalStaff"}],
      marketGap:{ statement:"대형 스마트팩토리 솔루션은 소상공인 제조사엔 과하고 비쌈" },
      whyNow:[{signal:"저비용 비전 AI",category:"TECHNOLOGY"}],
      solution:{ resourceType:"Hybrid", solutionType:"ProductPlusService", concept:"스마트폰 카메라 기반 경량 검사 보조" },
      buyer:"제조 소상공인 대표", channel:"업종 협회·장비 유통 제휴",
      unknowns:["검사 정확도 수용 기준"],
      signals:{ problemSignal:{raw:82,band:"veryHigh"}, marketGapSignal:{raw:64,band:"high"}, timingSignal:{raw:70,band:"high"}, founderMatch:{raw:null,band:"unknown"}, evidenceConfidence:"L1" },
      founderFit:{ band:"unknown", note:"제조 현장 경험이 있다면 검사 기준 설계와 현장 설득에 유리할 수 있습니다.", misfits:[], hasMisfit:false },
      explainPath:["인건비 상승","반복 검사 노동","스마트팩토리는 과·고가","저비용 비전 AI 등장","소상공인 미충족","경량 검사 보조"],
      narrative:{ tagline:"스마트폰 카메라로 하는 품질검사", differentiator:"전용 장비 없이 기존 스마트폰만으로 시작하는 점이 다르다", valueProp:"비싼 설비 없이 검사 인력을 줄이고 불량을 잡습니다", strength:"기존 장비 대비 도입 문턱이 낮아 소상공인 접근성이 높다", caution:"검사 정확도에 대한 현장 신뢰를 얻기까지 검증 데이터가 필요하다", sustainability:"업종별 검사 모델을 늘려가며 수평 확장할 수 있다", name:"제조 소상공인 품질검사 반자동화", who:"검사에 사람을 많이 쓰는 소규모 제조사",
        context:"인건비는 오르는데 검사 인력 확보가 어려운 상황",
        problem:"반복적 육안검사에 인력·시간이 과다 투입된다",
        emotionMotive:"비용 절감(SAVE)과 업무 단순화(SIMPLIFY)",
        currentWorkaround:"수기 육안검사와 내부 인력에 의존",
        whatsBroken:"기존 스마트팩토리 솔루션은 도입 비용·복잡도가 소상공인에 과함",
        marketGap:"소상공인 규모에 맞는 경량·저비용 검사 보조의 공백",
        whyNow:"스마트폰 수준에서 동작하는 저비용 비전 AI 성숙",
        solutionConcept:"스마트폰 카메라 기반 경량 품질검사 보조 도구+세팅 서비스",
        buyer:"제조 소상공인 대표", channel:"업종 협회·장비 유통 채널",
        founderMatchReason:"제조 도메인 이해가 있으면 현장 검사 기준 설계에 강점이 될 수 있습니다.",
        unknowns:"현장이 수용 가능한 검사 정확도 기준" },
    },
    {
      opportunityId:"kif_ops_003", title:"지역 상권 데이터 기반 소상공인 컨설팅",
      customer:{ type:"B2B", roles:{ user:"소상공인", buyer:"소상공인", decisionMaker:"소상공인" } },
      context:{ triggerEvent:"창업/폐업 결정" },
      problem:{ types:["Information","Risk","Uncertainty"], severity:3, frequency:"monthly" },
      motives:["AVOID","ACHIEVE"],
      currentAlternative:[{type:"Search"},{type:"Expert"}],
      marketGap:{ statement:"고가 컨설팅과 무료 정보 사이, 실행가능한 중간층 부재" },
      whyNow:[{signal:"공공데이터 개방",category:"REGULATION"}],
      solution:{ resourceType:"Human", solutionType:"ProfessionalService", concept:"데이터+전문가 하이브리드 상권 진단" },
      buyer:"예비·기존 소상공인", channel:"지자체·소상공인시장진흥공단 제휴",
      unknowns:["단가 수용 범위"],
      signals:{ problemSignal:{raw:66,band:"high"}, marketGapSignal:{raw:69,band:"high"}, timingSignal:{raw:58,band:"medium"}, founderMatch:{raw:null,band:"unknown"}, evidenceConfidence:"L2" },
      founderFit:{ band:"unknown", note:"컨설팅·상권 분석 경험은 이 기회의 핵심 역량과 직접 맞닿아 있습니다.", misfits:[], hasMisfit:false },
      explainPath:["창업/폐업 리스크","정보는 많지만 실행 어려움","고가 컨설팅 부담","공공데이터 개방","중간층 공백","데이터+전문가 진단"],
      narrative:{ tagline:"상권 데이터 기반 창업 컨설팅", differentiator:"컨설턴트 감이 아닌 지역 데이터를 근거로 삼는 점이 다르다", valueProp:"감이 아니라 데이터로 창업·업종전환을 결정합니다", strength:"공공데이터라는 객관적 근거가 컨설팅 신뢰도를 높인다", caution:"데이터 해석을 실행으로 잇는 후속 서비스가 없으면 일회성에 그친다", sustainability:"컨설팅 사례가 쌓이면 자체 예측모델로 고도화 가능하다", name:"지역 상권 데이터 기반 소상공인 컨설팅", who:"창업·업종전환을 앞둔 소상공인",
        context:"창업/폐업 결정 앞에서 리스크 판단 근거가 부족한 상황",
        problem:"무료 정보는 실행이 어렵고 전문 컨설팅은 비싸다",
        emotionMotive:"실패 회피(AVOID)와 성과 달성(ACHIEVE)",
        currentWorkaround:"검색과 고가 전문가 상담에 의존",
        whatsBroken:"실행가능한 중간 가격대 진단 서비스의 부재",
        marketGap:"데이터 기반 + 전문가 해석의 결합 공백",
        whyNow:"상권·매출 공공데이터 개방 확대",
        solutionConcept:"공공데이터와 전문가 해석을 결합한 상권 진단 서비스",
        buyer:"예비·기존 소상공인", channel:"지자체·공단 제휴",
        founderMatchReason:"컨설팅 경력이 서비스 신뢰도와 직접 연결되는 후보입니다.",
        unknowns:"소상공인이 수용 가능한 단가 범위" },
    },
    {
      opportunityId:"kif_ops_004", title:"중장년 재취업 실무역량 마이크로러닝",
      customer:{ type:"B2C", roles:{ user:"중장년 구직자", buyer:"본인/정부지원", decisionMaker:"본인" } },
      context:{ triggerEvent:"경력 단절" },
      problem:{ types:["Access","Complexity"], severity:3, frequency:"weekly" },
      motives:["ACHIEVE","CONTROL"],
      currentAlternative:[{type:"Search"},{type:"None"}],
      marketGap:{ statement:"청년 중심 에듀테크에 중장년 실무 재교육이 비어있음" },
      whyNow:[{signal:"정부 재취업 지원 확대",category:"REGULATION"}],
      solution:{ resourceType:"SW", solutionType:"Education", concept:"짧은 실무 단위 학습 + 자격연계" },
      buyer:"본인 또는 정부 바우처", channel:"고용센터·평생교육 제휴",
      unknowns:["콘텐츠 제작 자원"],
      signals:{ problemSignal:{raw:61,band:"high"}, marketGapSignal:{raw:73,band:"high"}, timingSignal:{raw:66,band:"high"}, founderMatch:{raw:null,band:"unknown"}, evidenceConfidence:"L1" },
      founderFit:{ band:"unknown", note:"콘텐츠·교육 제작 역량이 없다면 초기 제작 부담이 있을 수 있습니다.", misfits:[{type:"CONTENT_GAP",message:"교육 콘텐츠 제작 자원 확보 여부를 확인해야 합니다."}], hasMisfit:true },
      explainPath:["경력 단절","재취업 실무격차","에듀테크는 청년 중심","정부 지원 확대","중장년 미충족","마이크로러닝+자격연계"],
      narrative:{ tagline:"중장년 실무역량 15분 학습", differentiator:"자격증이 아닌 실무 즉시 투입 역량에 집중한 점이 다르다", valueProp:"짧은 학습으로 재취업 실무 격차를 빠르게 좁힙니다", strength:"짧은 학습 단위로 완주율이 높고 즉시 효과를 체감시킨다", caution:"재취업 성공이라는 최종 성과 입증에 시간이 걸린다", sustainability:"기업 연계 채용까지 확장하면 B2B 매출로 이어진다", name:"중장년 재취업 실무역량 마이크로러닝", who:"경력 단절 후 재취업을 준비하는 중장년",
        context:"재취업 시장이 요구하는 실무 역량과 본인 역량 사이 격차",
        problem:"짧게·실무 중심으로 배울 수 있는 재교육 경로가 부족",
        emotionMotive:"목표 달성(ACHIEVE)과 자기주도 통제(CONTROL)",
        currentWorkaround:"검색으로 산발적 학습하거나 포기",
        whatsBroken:"기존 에듀테크는 청년·이론 중심이라 중장년 실무에 안 맞음",
        marketGap:"중장년 실무 재교육 + 자격연계의 공백",
        whyNow:"정부 재취업·평생교육 지원 확대",
        solutionConcept:"실무 단위 짧은 학습과 자격/일자리 연계 플랫폼",
        buyer:"본인 또는 정부 바우처", channel:"고용센터·평생교육기관 제휴",
        founderMatchReason:"교육 콘텐츠 제작 경험 여부가 초기 실행 속도를 좌우합니다.",
        unknowns:"양질 콘텐츠의 지속 제작 자원" },
    },
    {
      opportunityId:"kif_ops_005", title:"1인 사업자 세무·행정 자동 도우미",
      customer:{ type:"B2B", roles:{ user:"1인 사업자", buyer:"1인 사업자", decisionMaker:"1인 사업자" } },
      context:{ triggerEvent:"사업자 등록" },
      problem:{ types:["Complexity","Time","Uncertainty"], severity:4, frequency:"monthly" },
      motives:["SIMPLIFY","AVOID"],
      currentAlternative:[{type:"Excel"},{type:"Expert"}],
      marketGap:{ statement:"세무사 위임과 셀프 사이, 1인 규모 자동화 부재" },
      whyNow:[{signal:"전자세금계산서·API 확대",category:"CHANNEL"}],
      solution:{ resourceType:"SW", solutionType:"SaaS", concept:"신고 일정·서류 자동 안내 도우미" },
      buyer:"1인 사업자", channel:"업종 커뮤니티·핀테크 제휴",
      unknowns:["세무 규제 준수 범위"],
      signals:{ problemSignal:{raw:69,band:"high"}, marketGapSignal:{raw:60,band:"medium"}, timingSignal:{raw:64,band:"high"}, founderMatch:{raw:null,band:"unknown"}, evidenceConfidence:"L1" },
      founderFit:{ band:"unknown", note:"세무·행정 도메인 지식이 없다면 규제 준수 설계에 외부 협업이 필요할 수 있습니다.", misfits:[], hasMisfit:false },
      explainPath:["사업자 등록 급증","세무·행정 복잡","세무사는 부담·셀프는 불안","전자세금계산서 API 확대","1인 규모 공백","자동 안내 도우미"],
      narrative:{ tagline:"1인 사업자 행정 자동 비서", differentiator:"세무를 넘어 행정 전반을 자동 알림하는 점이 다르다", valueProp:"세무사 없이도 놓치기 쉬운 행정을 자동으로 챙깁니다", strength:"반복 행정을 자동화해 명확한 시간 절약 가치를 준다", caution:"세무·법규 변화에 상시 대응하는 운영 부담이 있다", sustainability:"고객 사업 성장에 따라 상위 요금제로 자연 확장된다", name:"1인 사업자 세무·행정 자동 도우미", who:"막 시작한 프리랜서·1인 사업자",
        context:"사업자 등록 직후 세무·행정 의무가 몰려오는 상황",
        problem:"무엇을 언제 해야 하는지 몰라 실수·과태료 위험",
        emotionMotive:"복잡함 제거(SIMPLIFY)와 실수 회피(AVOID)",
        currentWorkaround:"엑셀 수기 관리 또는 세무사 위임",
        whatsBroken:"위임은 부담스럽고 셀프는 불안한 중간 공백",
        marketGap:"1인 규모에 맞춘 세무·행정 자동 안내의 부재",
        whyNow:"전자세금계산서·금융 API 확대로 자동화 가능",
        solutionConcept:"신고 일정·서류를 자동 안내하는 경량 SaaS",
        buyer:"1인 사업자", channel:"업종 커뮤니티·핀테크 제휴",
        founderMatchReason:"세무·행정 지식이 규제 준수 설계의 핵심 변수입니다.",
        unknowns:"자동화가 커버 가능한 세무 규제 범위" },
    },
  ],
  comparison:null,
  marketPerspective:"경영진단 시장의 승부처는 '진단' 자체가 아니라 '진단 이후 실행으로 이어지는 연결'에 있습니다. 리포트를 파는 순간 끝나는 도구는 반복 매출을 만들기 어렵습니다.",
  comparisonInsight:"AI 저비용화로 '진단'은 누구나 제공할 수 있게 됐고, 그래서 차별점이 진단 정확도에서 '진단 이후'로 옮겨가는 흐름입니다. 5개는 크게 즉시 실행형(1·5: 자동화·자가진단)과 사람·자산 축적형(2·3: 전문가 매칭·역량 이전), 그리고 완성형 서비스(4: 온디맨드)로 나뉩니다. 컨설팅 네트워크가 있다면 2·3이, 빠른 출시·낮은 초기비용이 목표라면 1·5가 유리할 수 있습니다.",
  comparisonNotes:["문제 강도는 전반적으로 높고, 근거 수준은 실검증 전이라 낮은 편입니다."],
};
// 샘플의 comparison/summary.highlights를 서버 로직과 동일 규칙으로 생성
(function(){
  const order={veryHigh:5,high:4,medium:3,low:2,veryLow:1,unknown:0};
  const t=SAMPLE_RESULT.top5;
  const awarded=new Set();
  const badge=(key,band)=>{const r=t.slice().sort((a,b)=>{
    const bv=(order[band(b)]||0)-(order[band(a)]||0); if(bv)return bv;
    return (awarded.has(a.opportunityId)?1:0)-(awarded.has(b.opportunityId)?1:0);
  }); const p=r[0]; if(p&&order[band(p)]>0)awarded.add(p.opportunityId); return {key,opportunityId:order[band(p)]>0?p.opportunityId:null};};
  const cleanFit=t.filter(c=>!c.founderFit.hasMisfit)[0];
  if(cleanFit)awarded.add(cleanFit.opportunityId);
  const burden={low:1,medium:2,high:3};
  const badges=[
    badge("가장 문제가 강함",c=>c.signals.problemSignal.band),
    badge("가장 시장공백이 큼",c=>c.signals.marketGapSignal.band),
    badge("가장 타이밍이 좋음",c=>c.signals.timingSignal.band),
    {key:"실행 걸림돌 없음",opportunityId:cleanFit?cleanFit.opportunityId:null},
    {key:"가장 저비용 시작",opportunityId:t.slice().sort((a,b)=>(burden[a.solution.resourceType==='HW'?'high':a.solution.resourceType==='Hybrid'?'medium':'low'])-(burden[b.solution.resourceType==='HW'?'high':b.solution.resourceType==='Hybrid'?'medium':'low']))[0].opportunityId},
  ];
  const rows=t.map(c=>({id:c.opportunityId,title:c.narrative.name,problem:c.signals.problemSignal.band,
    marketGap:c.signals.marketGapSignal.band,whyNow:c.signals.timingSignal.band,
    founderFitStatus:c.founderFit.hasMisfit?"misfit":"pending",
    evidence:c.signals.evidenceConfidence,
    resourceBurden:c.solution.resourceType==='HW'?'high':c.solution.resourceType==='Hybrid'?'medium':'low',
    techReadiness:"AVAILABLE_NOW"}));
  SAMPLE_RESULT.comparison={rows,badges};
  SAMPLE_RESULT.summary.highlights=badges;
})();
