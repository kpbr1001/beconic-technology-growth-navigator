/* ============================================================
   K-ITEM FINDER — Result Render · PDF · About · Sample
   ============================================================ */

// ============================================================
// Result 렌더러
// ============================================================
const Result = {
  render(){
    const R=State.result; if(!R){return;}
    Plus.sanitizeResult(R);
    if(!R._createdAt) R._createdAt=Date.now();
    const c=document.getElementById("resultContent");
    c.innerHTML = `
      ${this.head()}
      ${this.docMeta(R)}
      ${this.resultNav()}
      <div id="sec-summary">${this.execSummary(R)}</div>
      ${this.qualityPanel(R)}
      ${this.legend()}
      <div class="section-head" id="sec-cards"><h3 class="sec-title">📁 발굴된 사업기회 ${R.top5.length}개</h3><p class="sec-sub">각 카드를 펼치면 상세 내용, '왜 이 아이템인가', 근거 확인처와 검증 첫 3걸음을 볼 수 있어요.</p></div>
      ${R.top5.map((o,i)=>this.card(o,i)).join("")}
      <div id="sec-compare">${this.compare(R.comparison)}</div>
      ${this.historyPanel(R)}
      ${this.selectPanel()}
      ${this.nextPanel(R)}
      ${this.disclaimerFull()}
      ${R._debug?`<div style="text-align:center;font-size:11px;color:#B0B8C4;margin-top:16px">진단: CALL B ${this.esc(R._debug.callB||'?')}</div>`:''}
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
      선택한 아이템은 BECONIC <b>AI 아이템 진단(PMF)</b>에서 증거 기반으로 검증하시길 권장합니다.</p>
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
              <div class="ei-name">${this.esc(n.name||o.title)}${n.definition?`<span class="ei-def">— ${this.esc(n.definition)}</span>`:''}</div>
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
      <div class="sname"><span>${name}</span><em class="band-${band}">${BAND_LABEL[band]}${typeof raw==="number"?`<small class="raw" title="규칙 엔진 계산값(0~100) · AI가 매긴 점수가 아님">${raw}</small>`:''}</em></div>
      <div class="track"><div class="ticks"><i></i><i></i><i></i></div><div class="fill band-${band}" style="width:${BAND_PCT[band]}%"></div></div></div>`;
    const ff=o.founderFit||{band:"unknown",note:"",misfits:[]};
    const inShort=State.shortlist.includes(o.opportunityId);
    return `<div class="opp-card" id="card_${o.opportunityId}">
      <div class="opp-head" onclick="Result.toggle('${o.opportunityId}')">
        <div class="opp-rank">${i+1}</div>
        <div class="opp-head-main">
          <h3>${Plus.fieldName(o)?`<span class="opp-field">${this.esc(Plus.fieldName(o))}</span>`:''}${this.esc(n.name||o.title)}${n.definition?`<span class="opp-def">${this.esc(n.definition)}</span>`:''}</h3>
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
            ${this.f("고객은 지금 이렇게 해결해요",Plus.altText(o).how)}
            ${this.f("기존 방식의 한계",Plus.altText(o).broken)}
            ${this.f("시장의 빈틈",Plus.gapText(o))}
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

          ${this.nameAlt(o)}
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

          ${this.fitBlock(o)}
          ${this.evidenceBlock(o)}
          ${this.planBlock(o)}

          <div class="opp-actions">
            <button class="chip-add ${inShort?'added':''}" id="add_${o.opportunityId}" onclick="Result.toggleShort('${o.opportunityId}')">${inShort?'✓ 담김':'+ Shortlist 담기'}</button>
            <span class="evidence-tag" title="${this.esc(PLUS_DATA.evidence[s.evidenceConfidence]?.d||'')}">근거 수준: ${EVIDENCE_LABEL[s.evidenceConfidence]||this.esc(s.evidenceConfidence)}</span>
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
      ${State.result.comparisonInsight?`<div class="cmp-insight"><span class="cmp-insight-label">💡 ${cmp.rows.length}개를 어떻게 나눠 볼까</span>${this.esc(this.cleanInsight(State.result.comparisonInsight))}</div>`:''}
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
    if(Plus.fieldName(o)) chips.push(["field",Plus.fieldName(o)]);
    // 형태 이름표: SaaS를 '제품형'으로 부르던 혼동 제거(실물 제품과 구분)
    const productType={SaaS:"소프트웨어형",App:"앱형",Product:"실물 제품형",ProductPlusService:"제품+서비스형",Hardware:"기기형",
      Platform:"플랫폼형",Marketplace:"플랫폼형",Service:"서비스형",Consulting:"서비스형",ProfessionalService:"서비스형",
      Education:"교육형",Content:"콘텐츠형",Subscription:"구독형",Community:"커뮤니티형",Store:"매장형"}[t];
    if(productType) chips.push(["type",productType]);
    const offline=["Education","Consulting","Service","ProfessionalService","Store","Hardware","Product","ProductPlusService"].includes(t);
    chips.push(["place", offline?"온·오프라인":"온라인 중심"]);
    const instant=["Service","Marketplace","Consulting","Subscription","Store","Product","ProfessionalService"].includes(t);
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
    return `<div class="select-panel" id="sec-select">
      <h3>✅ 검증할 아이템 선택</h3>
      <p>Shortlist(최대 3개) 중 하나를 <b>Primary</b>로 선택하면, 아이템 요약을 복사한 뒤 <b>AI 아이템 진단(PMF)</b>을 새 창으로 엽니다. 진단 화면 입력칸에 붙여넣어 이어서 검증하세요.</p>
      ${inner}
      <div class="result-cta">
        <button class="btn btn-primary btn-sm" ${State.primary?'':'disabled'} onclick="Result.handoff()">선택한 아이템 검증하기 →</button>
        <button class="btn btn-ghost btn-sm" onclick="Report.open()">📄 결과보고서 PDF</button>
        <a class="btn btn-ghost btn-sm" href="${Plus.mailHref(State.result)}">✉ 결과 담아 메일 상담</a>
        <button class="btn btn-ghost btn-sm" onclick="App.restart()">다시 탐색</button>
      </div>
      <p class="consult-note">메일 상담은 고객님 메일 앱에서 초안(문서번호·후보 목록)이 열립니다. 입력하신 경험·자원은 담기지 않고, 서버로 전송되지 않습니다. · ${this.esc(COMPANY_INFO.certification)}</p>
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
  async handoff(){
    const o=State.result.top5.find(x=>x.opportunityId===State.primary);
    if(!o){App.toast("Primary 아이템을 선택해 주세요");return;}
    // 같은 브라우저 백업(입력 원문은 담지 않음)
    try{ localStorage.setItem("kif_handoff", JSON.stringify(this.buildTransfer(o))); }catch(e){}
    const ok=await Plus.copy(Plus.handoffText(o));
    // 개인 입력이 URL·서버 로그에 남지 않도록 데이터는 URL로 넘기지 않음
    const url=PLUS_DATA.tools.S2.url+"?from=finder";
    App.toast(ok?"아이템 요약을 복사했어요. PMF 진단 입력칸에 붙여넣으세요.":"복사가 막혀 있어요. 결과보고서 PDF의 요약을 참고해 입력해 주세요.");
    setTimeout(()=>{ window.open(url, "_blank", "noopener,noreferrer"); }, 700);
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
      Service:"전문 서비스",Education:"교육/클래스",Content:"콘텐츠",Product:"실물 제품",Store:"매장",
      App:"모바일 앱",Community:"커뮤니티",Subscription:"구독 서비스",Dashboard:"대시보드(SaaS)",
      ProfessionalService:"전문 서비스",ProductPlusService:"제품+서비스",Consulting:"컨설팅",Hardware:"하드웨어",Software:"소프트웨어",Tool:"도구",API:"API",AI:"AI 솔루션"};
    return map[t]||t||"";
  },
  resourceKo(t){
    const map={SW:"소프트웨어",HW:"하드웨어",Human:"인적 자원",Hybrid:"복합"};
    return map[t]||t;
  },
  esc(s){ return String(s??"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); },

  // ===================== v0.4.0 보강 섹션 =====================
  nameAlt(o){
    const n=o.narrative||{}; const alts=(Array.isArray(n.nameOptions)?n.nameOptions:[]).filter(Boolean).slice(0,2);
    if(!alts.length && !n.nameReason) return "";
    return `<div class="name-alt">🏷 <b>이름을 이렇게 지은 이유</b> ${this.esc(n.nameReason||"")}
      ${alts.length?`<div style="margin-top:6px">다른 이름 후보 ${alts.map(a=>`<span class="na-chip">${this.esc(a)}</span>`).join("")}</div>`:''}</div>`;
  },
  docMeta(R){
    return `<div class="doc-meta">
      <span>문서번호 <b>${this.esc(Plus.docNo(R))}</b></span>
      <span>탐색일 ${this.esc(Plus.dateKo(R._createdAt))}</span>
      <span>앱 ${this.esc(APP_META.appVersion)} · 규칙 ${PLUS_DATA.rulesVersion} · Prompt ${this.esc(APP_META.promptVersion)}</span>
    </div>`;
  },
  resultNav(){
    const L=[["sec-summary","한눈에"],["sec-quality","결과 신뢰도"],["sec-cards","후보 상세"],["sec-compare","비교"],["sec-history","이전 탐색"],["sec-select","선택·상담"],["sec-next","다음 진단"]];
    return `<nav class="result-nav" aria-label="결과 목차">${L.map(([id,l])=>`<button type="button" onclick="document.getElementById('${id}')?.scrollIntoView({behavior:'smooth',block:'start'})">${l}</button>`).join("")}</nav>`;
  },
  qualityPanel(R){
    const q=Plus.inputQuality(); const d=Plus.diversity(R);
    const sample=State.isSample;
    return `<div class="quality-panel" id="sec-quality">
      <h3>🔎 이 결과를 얼마나 믿을 수 있나요?</h3>
      <div class="qp-grid">
        <div class="qp-box">
          <div class="qp-k">입력 충실도</div>
          ${sample?`<div class="qp-v">샘플 결과 <span class="qp-tag mid">예시</span></div><p class="qp-d">직접 탐색하면 입력 충실도를 함께 보여 드려요.</p>`:
          `<div class="qp-v">${q.n} / ${q.total} <span class="qp-tag ${q.level.c}">${q.level.k}</span></div>
          <p class="qp-d">${q.level.d}</p>
          <ul class="qp-list">${q.items.map(i=>`<li class="${i.ok?'ok':'no'}">${i.ok?'✓':'·'} ${i.k}${i.ok?'':`<span>${i.tip}</span>`}</li>`).join("")}</ul>`}
        </div>
        <div class="qp-box">
          <div class="qp-k">후보 다양성 <small>(규칙 계산)</small></div>
          <div class="qp-v">제공 형태 ${d.forms}종 <span class="qp-tag ${d.ok?'ok':'mid'}">${d.ok?'서로 다름':d.sameProblem?'같은 문제의 다른 해법':'비슷한 형태 많음'}</span></div>
          <p class="qp-d">고객 유형 ${d.custs}종 · 시장 변화 범주 ${d.cats}종. ${d.sameProblem?'이번 후보들은 <b>같은 고객·같은 문제</b>를 서로 다른 방식으로 푸는 안이에요. 문제 자체를 넓혀 보려면 관심 고객을 비우거나 다른 고객을 넣어 다시 탐색해 보세요.':'같은 아이디어의 변형 5개가 아니라, 성격이 다른 후보를 비교하도록 걸러냈어요.'}</p>
        </div>
        <div class="qp-box">
          <div class="qp-k">누가 무엇을 계산했나</div>
          <ul class="qp-list plain">
            <li><b>규칙 엔진(코드)</b> 신호 막대·근거 수준·다양성·입력 조건 점검</li>
            <li><b>AI(Claude)</b> 고객·문제 구조화와 카드 문장 서술</li>
            <li><b>계산하지 않음</b> 성공확률·매출·투자등급·시장규모</li>
          </ul>
        </div>
      </div>
      ${this.methodDetails()}
    </div>`;
  },
  methodDetails(){
    const ev=PLUS_DATA.evidence;
    return `<details class="method">
      <summary>평가 방법 공개 (규칙 ${PLUS_DATA.rulesVersion})</summary>
      <div class="method-body">
        <p><b>1. 3가지 신호</b> — 문제 강도(고통의 크기·빈도), 시장 공백(기존 대안의 부족함), 타이밍(지금 시작하기 좋은 시장 변화). 타이밍은 네이버 검색 추이(최근 12개월 vs 그 전 12개월)가 조회되면 AI 판단과 반반 섞어 계산합니다. AI가 고객·문제·대안·변화를 정해진 항목으로 구조화하면, 규칙 엔진이 항목값으로 0~100 값을 계산합니다(값이 없는 항목은 빼고 남은 가중치로 다시 계산). 막대 옆 작은 숫자가 그 계산값이고, 20 이하 매우 낮음 · 40 이하 낮음 · 60 이하 보통 · 80 이하 높음 · 81 이상 매우 높음으로 표시합니다.</p>
        <p><b>2. 근거 수준</b> — ${Object.entries(ev).map(([k,v])=>`${k} ${v.n}: ${v.d}`).join(" · ")}</p>
        <p><b>3. 모르면 빈칸</b> — 데이터가 없는 항목은 추정하지 않고 '확인 필요'로 둡니다. 확인 필요는 감점이 아닙니다.</p>
        <p><b>4. 나와의 적합도</b> — 점수를 매기지 않고, 입력한 예산·선호 형태·자원과 부딪히는 '걸림돌'만 표시합니다. 정밀 적합도는 PMF 진단 단계에서 봅니다.</p>
        <p><b>5. 다양성 필터</b> — 비슷한 후보가 몰리지 않도록 제공 형태·고객 유형이 겹치는 후보를 걸러 최종 후보를 고릅니다. 순위는 성공 가능성 순서가 아닙니다.</p>
        <p><b>6. 확인처</b> — 카드의 '근거 확인처'는 AI가 조회한 출처가 아니라, 가설을 직접 확인할 공식 사이트입니다(주소 확인일 ${PLUS_DATA.checked}).</p>
      </div>
    </details>`;
  },
  fitBlock(o){
    const fc=Plus.fitChecks(o);
    if(State.isSample) return "";
    return `<div class="fit-check">
      <div class="fc-title">🧩 입력 조건 점검 <small>(규칙 계산)</small></div>
      ${fc.length?fc.map(x=>`<div class="fc-item ${x.lv}">${x.lv==='warn'?'⚠':'ℹ'} ${this.esc(x.t)}</div>`).join(""):
      `<div class="fc-item ok">✓ 입력한 예산·선호 형태와 부딪히는 점이 없어요.</div>`}
    </div>`;
  },
  evidenceBlock(o){
    const ev=PLUS_DATA.evidence[o.signals.evidenceConfidence]||PLUS_DATA.evidence.L0;
    const src=Plus.sourcesFor(o);
    return `<div class="ev-block">
      <div class="ev-title">📚 근거 확인처 <span class="ev-lv">현재 ${this.esc(o.signals.evidenceConfidence)} · ${this.esc(ev.n)}</span></div>
      <p class="ev-d">${this.esc(ev.d)} <b>다음 단계:</b> ${this.esc(ev.up)}.</p>
      ${this.trendRow(o)}
      <ul class="ev-list">${src.map(x=>`<li><a href="${this.esc(x.url)}" target="_blank" rel="noopener noreferrer">${this.esc(x.n)} ↗</a><span>${this.esc(x.what)}</span></li>`).join("")}</ul>
      <p class="ev-note">AI가 이 사이트를 조회한 것이 아니라, 가설을 직접 확인할 공식 확인처예요 · 주소 확인 ${PLUS_DATA.checked}</p>
    </div>`;
  },
  trendRow(o){
    const t=Plus.trendInfo(o); if(!t) return "";
    if(t.insufficient) return `<div class="trend-row flat solo"><b>네이버 검색 추이</b> 검색어(${t.kw.map(k=>this.esc(k)).join(", ")})의 검색량이 너무 적어 판단하지 않았어요. 아직 사람들이 이 말로 찾지 않는 문제일 수 있어요.</div>`;
    return `<div class="trend-row ${t.dir}">
      <div class="tr-main"><b>네이버 검색 추이</b> 최근 12개월이 그 전 12개월보다 <b>${t.yoy}</b> — 관심이 ${t.word}${t.recent?` · 최근 3개월 ${t.recent}`:''}
        <span class="tr-kw">검색어: ${t.kw.map(k=>this.esc(k)).join(", ")} · 조회 ${this.esc(t.date)} · 네이버 데이터랩</span></div>
      ${Plus.sparkSvg(t.spark)}
      <p class="tr-note">검색 관심도는 구매 수요·시장 규모가 아니에요. 같은 시기 다른 문제와 비교한 상대값이에요.</p>
    </div>`;
  },
  planBlock(o){
    const p=Plus.validationPlan(o);
    return `<div class="plan-block">
      <div class="pb-title">🧪 검증 첫 3걸음 <small>2~3주 · 비용 거의 없음</small></div>
      <ol class="pb-steps">${p.steps.map(st=>`<li>
        <span class="pb-when">${st.when}</span>
        <div><b>${this.esc(st.t)}</b><p>${this.esc(st.how)}</p>
        ${st.qs.length?`<ul class="pb-qs">${st.qs.map(q=>`<li>“${this.esc(q)}”</li>`).join("")}</ul>`:''}
        <p class="pb-done">완료 판단: ${this.esc(st.done)}</p></div></li>`).join("")}</ol>
      ${p.unknowns.length?`<p class="pb-unk">이 3걸음에서 함께 확인: ${p.unknowns.map(u=>this.esc(u)).join(" · ")}</p>`:''}
    </div>`;
  },
  historyPanel(R){
    const prev=Plus.previousOf(R);
    const cur=Plus.snapshot(R);
    let body;
    if(!prev){
      body=`<p class="hp-d">${State.isSample?'직접 탐색하면 결과가 이 브라우저에 저장되어 다음 탐색 때 자동으로 비교됩니다.':'첫 탐색이에요. 결과는 이 브라우저에만 저장되고(서버 저장 없음), 다음 탐색 때 변화를 비교해 드려요.'} 다른 기기에서 비교하려면 결과 파일을 저장해 두세요.</p>`;
    }else{
      const c=Plus.compareSnapshots(prev,cur);
      const bandCell=(a,b)=>a===b?`<span class="cmp-band band-${b}">${BAND_LABEL[b]}</span>`:`<span class="cmp-band band-${a}">${BAND_LABEL[a]}</span> → <span class="cmp-band band-${b}">${BAND_LABEL[b]}</span>`;
      body=`<p class="hp-d">비교 대상: <b>${this.esc(Plus.dateKo(prev.ts))}</b> 탐색 (${this.esc(prev.docNo)})${prev.input.industry?` · 관심 시장 ${this.esc(prev.input.industry)}`:''}</p>
        <div class="hp-sum"><span class="ok">유지 ${c.kept.length}</span><span class="new">새로 등장 ${c.added.length}</span><span class="drop">빠짐 ${c.dropped.length}</span></div>
        ${c.kept.length?`<div class="compare-scroll"><table class="cmp hp-table"><thead><tr><th>다시 나온 후보</th><th>문제</th><th>시장 공백</th><th>타이밍</th><th>근거</th></tr></thead><tbody>
          ${c.kept.map(k=>`<tr><th>${this.esc(k.cur.title)}</th><td>${bandCell(k.prev.p,k.cur.p)}</td><td>${bandCell(k.prev.g,k.cur.g)}</td><td>${bandCell(k.prev.t,k.cur.t)}</td><td>${k.prev.e===k.cur.e?this.esc(k.cur.e):this.esc(k.prev.e)+' → '+this.esc(k.cur.e)}</td></tr>`).join("")}
        </tbody></table></div>`:''}
        ${c.added.length?`<p class="hp-line"><b>새로 등장</b> ${c.added.map(a=>this.esc(a.title)).join(" · ")}</p>`:''}
        ${c.dropped.length?`<p class="hp-line"><b>이번엔 빠짐</b> ${c.dropped.map(a=>this.esc(a.title)).join(" · ")}</p>`:''}
        <p class="hp-note">두 번 연속 나온 후보는 입력이 바뀌어도 유지된 기회예요. 우선 검토 후보로 보세요.</p>`;
    }
    return `<div class="history-panel" id="sec-history">
      <h3>🔁 이전 탐색과 비교 <small>재탐색 권장 ${PLUS_DATA.rediagnoseDays}일</small></h3>
      ${body}
      <div class="hp-actions">
        ${State.isSample?'':`<button class="btn btn-ghost btn-sm" onclick="Plus.exportFile(State.result)">💾 결과 파일 저장</button>`}
        <label class="btn btn-ghost btn-sm hp-file">📂 이전 결과 파일 불러와 비교<input type="file" accept="application/json,.json" onchange="Plus.importFile(this)" hidden></label>
        ${State.isSample?'':`<button class="btn btn-ghost btn-sm" onclick="Plus.icsReminder(State.result)">📅 ${PLUS_DATA.rediagnoseDays}일 뒤 알림(캘린더)</button>`}
      </div>
    </div>`;
  },
  nextPanel(R){
    const list=Plus.nextDiagnoses(R);
    return `<div class="next-panel" id="sec-next">
      <h3>🧭 추천 연계 진단 <small>BECONIC 31</small></h3>
      <p class="np-d">이번 결과와 입력한 유형·예산을 기준으로 다음에 이어 볼 진단이에요. 새 창으로 열리며 입력 정보는 넘어가지 않습니다.</p>
      <div class="np-list">${list.map((x,i)=>`<a class="np-item" href="${this.esc(x.url)}" target="_blank" rel="noopener noreferrer">
        <span class="np-n">${i+1}</span><span class="np-b"><b>${this.esc(x.n)} ↗</b><span>${this.esc(x.why)}</span></span></a>`).join("")}</div>
    </div>`;
  },
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
    // 쪽 넘침 자동 맞춤: 화면 밖에서 A4 크기로 그려 측정한 뒤 인쇄
    holder.style.cssText="display:block;position:absolute;left:-10000px;top:0";
    try{ PDFLayout.fit(holder); }catch(e){}
    holder.style.cssText="";
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
          ${Result.f("검증은?","선택한 아이템의 상세 검증은 BECONIC AI 아이템 진단(PMF)이 담당합니다. 본 도구는 성공확률·투자등급·매출을 산출하지 않습니다.")}
          ${Result.f("데이터 처리","입력 내용은 탐색에만 쓰이고, 탐색 기록은 이 브라우저(localStorage)에만 저장됩니다. 결과 파일·메일 상담은 고객님 기기에서 직접 저장·발송합니다.")}
          ${Result.f("평가 규칙",PLUS_DATA.rulesVersion+" · 근거 확인처 주소 확인 "+PLUS_DATA.checked)}
          ${Result.f("작성기관",COMPANY_INFO.companyName+" · "+COMPANY_INFO.platformName)}
          ${Result.f("인증",COMPANY_INFO.certification)}
          ${Result.f("버전","앱 "+APP_META.appVersion+" · Prompt "+APP_META.promptVersion+" · 규칙 "+PLUS_DATA.rulesVersion+" · Updated "+APP_META.updatedAt)}
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
      opportunityId:"kif_ops_001", title:"안심일감",
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
      narrative:{ tagline:"신뢰 검증된 시니어 일감 매칭", differentiator:"일감 검증에 집중해 사기·미스매치 위험을 낮춘 점이 다르다", valueProp:"검증된 일감으로 퇴직 후 소득 공백을 안전하게 메웁니다", strength:"검증된 일감 풀이 신뢰를 만들어 재이용률이 높다", caution:"공급(일감)과 수요(시니어) 양쪽을 동시에 모아야 해 초기 견인이 어렵다", sustainability:"지역별로 복제 확장이 쉽고, 데이터가 쌓일수록 매칭 품질이 좋아진다", name:"안심일감", who:"정년퇴직 직후 새 수입원을 찾는 55~64세",
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
      opportunityId:"kif_ops_002", title:"검사콕",
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
      narrative:{ tagline:"스마트폰 카메라로 하는 품질검사", differentiator:"전용 장비 없이 기존 스마트폰만으로 시작하는 점이 다르다", valueProp:"비싼 설비 없이 검사 인력을 줄이고 불량을 잡습니다", strength:"기존 장비 대비 도입 문턱이 낮아 소상공인 접근성이 높다", caution:"검사 정확도에 대한 현장 신뢰를 얻기까지 검증 데이터가 필요하다", sustainability:"업종별 검사 모델을 늘려가며 수평 확장할 수 있다", name:"검사콕", who:"검사에 사람을 많이 쓰는 소규모 제조사",
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
      opportunityId:"kif_ops_003", title:"상권 나침반",
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
      narrative:{ tagline:"상권 데이터 기반 창업 컨설팅", differentiator:"컨설턴트 감이 아닌 지역 데이터를 근거로 삼는 점이 다르다", valueProp:"감이 아니라 데이터로 창업·업종전환을 결정합니다", strength:"공공데이터라는 객관적 근거가 컨설팅 신뢰도를 높인다", caution:"데이터 해석을 실행으로 잇는 후속 서비스가 없으면 일회성에 그친다", sustainability:"컨설팅 사례가 쌓이면 자체 예측모델로 고도화 가능하다", name:"상권 나침반", who:"창업·업종전환을 앞둔 소상공인",
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
      opportunityId:"kif_ops_004", title:"실무 한입",
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
      narrative:{ tagline:"중장년 실무역량 15분 학습", differentiator:"자격증이 아닌 실무 즉시 투입 역량에 집중한 점이 다르다", valueProp:"짧은 학습으로 재취업 실무 격차를 빠르게 좁힙니다", strength:"짧은 학습 단위로 완주율이 높고 즉시 효과를 체감시킨다", caution:"재취업 성공이라는 최종 성과 입증에 시간이 걸린다", sustainability:"기업 연계 채용까지 확장하면 B2B 매출로 이어진다", name:"실무 한입", who:"경력 단절 후 재취업을 준비하는 중장년",
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
      opportunityId:"kif_ops_005", title:"세무짝꿍",
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
      narrative:{ tagline:"1인 사업자 행정 자동 비서", differentiator:"세무를 넘어 행정 전반을 자동 알림하는 점이 다르다", valueProp:"세무사 없이도 놓치기 쉬운 행정을 자동으로 챙깁니다", strength:"반복 행정을 자동화해 명확한 시간 절약 가치를 준다", caution:"세무·법규 변화에 상시 대응하는 운영 부담이 있다", sustainability:"고객 사업 성장에 따라 상위 요금제로 자연 확장된다", name:"세무짝꿍", who:"막 시작한 프리랜서·1인 사업자",
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

// v0.5.0 — 샘플에 분야·다른 이름 후보(실제 응답 형태와 동일하게)
(function(){
  const extra={
    kif_ops_001:{field:"care",nameOptions:["시니어 안심일감","은퇴 후 일감 연결"],nameReason:"‘검증된 일감’이라는 신뢰 포인트가 이름에서 바로 보이게 했어요."},
    kif_ops_002:{field:"mfg",nameOptions:["폰카 검사 보조","불량 잡는 카메라"],nameReason:"전용 장비 없이 ‘스마트폰’으로 한다는 차별점을 앞세웠어요."},
    kif_ops_003:{field:"local",nameOptions:["동네상권 리포트","창업 전 상권 체크"],nameReason:"감이 아닌 ‘데이터’ 근거라는 점을 이름에 담았어요."},
    kif_ops_004:{field:"edu",nameOptions:["15분 재취업 실무","중장년 실무 스낵러닝"],nameReason:"짧은 학습 단위와 대상(중장년)을 한 번에 떠올리게 했어요."},
    kif_ops_005:{field:"finance",nameOptions:["1인 세무 비서","신고일 알림 도우미"],nameReason:"‘자동으로 챙겨 준다’는 결과를 이름의 중심에 뒀어요."},
  };
  const defs={kif_ops_001:"퇴직 시니어를 위한 검증된 일감 매칭 플랫폼",kif_ops_002:"소규모 제조사를 위한 스마트폰 품질검사 앱",
    kif_ops_003:"창업 전 소상공인을 위한 상권 데이터 진단 서비스",kif_ops_004:"재취업 중장년을 위한 15분 실무 학습 클래스",kif_ops_005:"1인 사업자를 위한 세무·행정 신고 알림 SaaS"};
  SAMPLE_RESULT.top5.forEach(o=>{ const x=extra[o.opportunityId]; if(!x) return; o.field=x.field; o.narrative.nameOptions=x.nameOptions; o.narrative.nameReason=x.nameReason; o.narrative.definition=defs[o.opportunityId]; });
})();
