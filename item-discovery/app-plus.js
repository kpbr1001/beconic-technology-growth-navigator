/* ============================================================
   K-ITEM FINDER — 보강 모듈 (v0.4.0 신설 · v0.5.0 분야·네이밍·PDF)
   - 규칙 기반(결정론) 계산만 한다. AI 호출·서버 전송 없음.
   - ① 타당성: 입력 충실도 · 입력 조건 점검 · 후보 다양성 · 평가 방법 공개
   - ② 실행가치: 후보별 검증 첫 3걸음(먼저·다음·그다음) + 인터뷰 질문
   - ③ 근거: 근거 수준 정의 · 공식 확인처(확인일) · 규칙/AI 구분 표기
   - ⑥⑨ 연계: S2 PMF 진단 연결(주소 수정) · 메일 상담 · BECONIC 31 다음 진단
   - ⑧ 재진단: 이 브라우저 탐색 기록 · 결과 파일 저장/불러오기 · 이전 결과 비교
   ============================================================ */

// ---------- 데이터(규칙) — 코드와 분리된 단일 소스 ----------
const PLUS_DATA = {
  rulesVersion: "R-2026.11.24",
  checked: "2026-11-24",
  rediagnoseDays: 90,
  historyMax: 6,

  // 근거 수준 정의(L0~L3)와 한 단계 올리는 방법
  evidence: {
    L0: { n: "AI 가설", d: "입력과 일반 지식으로 세운 가설. 외부 확인 전입니다.", up: "아래 확인처에서 통계·검색 추이 1건 이상 확인하면 L1" },
    L1: { n: "2차 신호", d: "통계·트렌드 등 간접 신호 1종과 맞아떨어집니다.", up: "서로 다른 출처 2종 이상이 같은 방향이면 L2" },
    L2: { n: "복수 외부신호", d: "서로 다른 외부 신호 2종 이상이 같은 방향입니다.", up: "실제 고객 5명 인터뷰에서 3명 이상 같은 문제를 말하면 L3" },
    L3: { n: "직접 고객근거", d: "실제 고객의 말·행동으로 확인된 근거입니다.", up: "지불 의사(사전신청·가격 수용)로 PMF 검증 단계로" },
  },

  // 공식 확인처 — AI가 조회한 출처가 아니라 '사용자가 직접 확인할 곳'
  sources: {
    KOSIS:   { n: "KOSIS 국가통계포털", url: "https://kosis.kr", what: "대상 고객 수(인구·가구·사업체 수)와 최근 5년 증감" },
    DATALAB: { n: "네이버 데이터랩", url: "https://datalab.naver.com", what: "문제 관련 검색어의 1~3년 검색 추이(관심이 늘고 있는지)" },
    LAW:     { n: "국가법령정보센터", url: "https://www.law.go.kr", what: "관련 법령·인허가·신고 의무와 최근 개정" },
    BIZINFO: { n: "기업마당", url: "https://www.bizinfo.go.kr", what: "이 분야 정부 지원사업 공고(정책 방향·예산 신호)" },
    KSTARTUP:{ n: "K-Startup", url: "https://www.k-startup.go.kr", what: "창업 지원사업·유사 분야 선정 기업" },
    KIPRIS:  { n: "KIPRIS 특허정보검색", url: "https://www.kipris.or.kr", what: "유사 기술·서비스의 특허·상표(이미 누가 하고 있는지)" },
    NTIS:    { n: "NTIS 국가R&D정보", url: "https://www.ntis.go.kr", what: "관련 기술의 국가 R&D 과제·성숙도" },
    SBIZ:    { n: "소상공인365(상권분석)", url: "https://bigdata.sbiz.or.kr", what: "지역 업종 점포 수·매출 추이·개폐업률" },
    DATAGO:  { n: "공공데이터포털", url: "https://www.data.go.kr", what: "서비스에 쓸 수 있는 공개 데이터·API 여부" },
  },
  // 왜 지금(whyNow) 범주 → 확인처
  sourceByCategory: {
    DEMOGRAPHIC: ["KOSIS"], SOCIAL: ["KOSIS", "DATALAB"], BEHAVIOR: ["DATALAB"], CULTURE: ["DATALAB"],
    TECHNOLOGY: ["NTIS", "KIPRIS"], REGULATION: ["LAW", "BIZINFO"], POLICY: ["BIZINFO", "LAW"],
    ECONOMIC: ["KOSIS"], ECONOMY: ["KOSIS"], ENVIRONMENTAL: ["LAW", "KOSIS"], CHANNEL: ["DATAGO", "DATALAB"], MARKET: ["KOSIS", "DATALAB"],
  },

  // BECONIC 31 — 주소 응답 200 확인(2026-11-24)한 진단만 연결
  tools: {
    S2:    { n: "AI 아이템 진단(PMF)", url: "https://beconic-diagnosis-item-pmf.netlify.app/" },
    S3:    { n: "창업·재무 시뮬레이션", url: "https://beconic-diagnosis-startup-finance.netlify.app/" },
    S4:    { n: "AI 사업계획서 진단", url: "https://beconic-business-plan-integrated-ai.netlify.app/" },
    S5:    { n: "창업 준비 가이드", url: "https://beconic-diagnosis-pre-startup.netlify.app/" },
    M5:    { n: "상권·상가 진단", url: "https://beconic-diagnostic-store.netlify.app/" },
    F2:    { n: "대출·보증 진단", url: "https://beconic-diagnosis-funding-readiness.netlify.app/" },
    G:     { n: "기업성장 종합진단", url: "https://beconic-diagnosis-business-growth.netlify.app/" },
    MATCH: { n: "지원사업 MATCH", url: "https://beconic-grant-matching.netlify.app/" },
  },
  // 위에서부터 조건이 맞는 것 최대 maxNext개(같은 진단 중복 없음). 31 규칙: 예비창업자에게 G 추천 안 함.
  maxNext: 4,
  nextRules: [
    { id: "N-PMF",   tool: "S2",    when: "always",   why: "고른 아이템이 실제 고객 문제를 푸는지, 구매 의사가 있는지 PMF 관점으로 검증해요. 이 도구의 바로 다음 단계예요." },
    { id: "N-GROW",  tool: "G",     when: "existing", why: "신사업을 더하기 전에 지금 회사의 성장 단계와 우선순위부터 확인해요." },
    { id: "N-STORE", tool: "M5",    when: "store",    why: "매장·오프라인 형태 후보가 있어요. 상권과 건축물 용도(인허가 가능 여부)를 먼저 확인해요." },
    { id: "N-PRE",   tool: "S5",    when: "pre",      why: "사업자등록 전이라면 업종코드·과세유형·인허가 등 창업 절차를 함께 정리해요." },
    { id: "N-FIN",   tool: "S3",    when: "startup",  why: "고른 아이템의 초기 비용·고정비·손익분기를 숫자로 시뮬레이션해요." },
    { id: "N-FUND",  tool: "F2",    when: "bigBudget",why: "초기 투자 규모(5천만원 이상)가 커요. 정책자금·보증 가능성을 미리 확인해요." },
    { id: "N-PLAN",  tool: "S4",    when: "always",   why: "지원사업에 낼 계획이라면 사업계획서를 공고 평가항목 기준으로 점검해요." },
    { id: "N-MATCH", tool: "MATCH", when: "always",   why: "지금 신청할 수 있는 정부·공공 지원사업을 찾아봐요." },
  ],

  // 서버(CALL A) alternatives 코드 → 한글
  altKo: { Excel: "엑셀", Phone: "전화", Human: "사람에게 직접 의뢰", AI: "범용 AI", Manual: "수작업", Search: "검색", None: "대안 없음(포기)",
    Expert: "전문가 상담", InternalStaff: "내부 인력", Paper: "종이·수기", Messenger: "메신저", App: "기존 앱", Agency: "대행사", Offline: "오프라인 방문", Community: "커뮤니티·지인" },
  dissatKo: { expensive: "비싸다", slow: "느리다", complex: "복잡하다", unreliable: "믿기 어렵다", inaccurate: "부정확하다", inconvenient: "불편하다",
    inaccessible: "접근하기 어렵다", fragmented: "정보가 흩어져 있다", manual: "손이 많이 간다", generic: "내 상황에 안 맞는다", timeConsuming: "시간이 오래 걸린다" },
  // 예산 이름은 app.js budgetName() 한 곳에서 관리
};

// ============================================================
const n_def = (o) => String(o?.narrative?.definition || "");
const Plus = {
  esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  str(v, max = 400) { return (v == null ? "" : String(v)).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); },
  isReal() { return !State.isSample; },

  // ---------- 보안: 결과 정규화(ID 화이트리스트, 밴드·근거 값 화이트리스트) ----------
  BANDS: ["veryHigh", "high", "medium", "low", "veryLow", "unknown"],
  sanitizeResult(R) {
    if (!R || !Array.isArray(R.top5)) return R;
    const seen = new Set();
    const idMap = {};
    R.top5.forEach((o, i) => {
      let id = String(o.opportunityId ?? "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || seen.has(id)) id = "opp_" + (i + 1);
      seen.add(id); idMap[o.opportunityId] = id; o.opportunityId = id;
      o.signals = o.signals || {};
      ["problemSignal", "marketGapSignal", "timingSignal"].forEach(k => {
        const s = o.signals[k] || {}; if (!this.BANDS.includes(s.band)) s.band = "unknown";
        if (typeof s.raw !== "number" || !isFinite(s.raw)) s.raw = null; else s.raw = Math.max(0, Math.min(100, Math.round(s.raw)));
        o.signals[k] = s;
      });
      if (!PLUS_DATA.evidence[o.signals.evidenceConfidence]) o.signals.evidenceConfidence = "L0";
      if (!o.title) o.title = o.narrative?.name || ("후보 " + (i + 1));
    });
    if (R.comparison?.rows) R.comparison.rows.forEach(r => { const k = r.id || r.opportunityId; if (idMap[k]) { r.id = idMap[k]; r.opportunityId = idMap[k]; } });
    if (R.comparison?.badges) R.comparison.badges.forEach(b => { if (b.opportunityId && idMap[b.opportunityId]) b.opportunityId = idMap[b.opportunityId]; });
    return R;
  },

  // ---------- 문서번호·기준일 ----------
  docNo(R) {
    if (R._docNo) return R._docNo;
    const src = (R.top5 || []).map(o => o.title).join("|") + (R._createdAt || "");
    let h = 2166136261; for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
    const d = new Date(R._createdAt || Date.now());
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    R._docNo = (State.isSample ? "KIF-SAMPLE-" : "KIF-") + ymd + "-" + (h >>> 0).toString(36).toUpperCase().slice(0, 5);
    return R._docNo;
  },
  dateKo(ts) { return new Date(ts || Date.now()).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }); },

  // ---------- ① 입력 충실도 ----------
  inputQuality(inp) {
    inp = inp || State.input || {};
    const real = v => v && !String(v).startsWith("__") && String(v).trim().length >= 2;
    const res = inp.resources || {};
    const resCount = (res.hw || []).length + (res.sw || []).length + (res.human || []).length;
    const items = [
      { k: "관심 분야 선택", ok: (inp.fields || []).length > 0 || real(inp.fieldOther), tip: "분야를 고르면 그 분야 안에서 서로 다른 후보를 찾습니다." },
      { k: "경험·역량 서술", ok: real(inp.experience) && String(inp.experience).trim().length >= 10, tip: "경험·역량을 한 줄 이상 적으면 적합도 코멘트와 걸림돌 점검이 구체적이 됩니다." },
      { k: "관심 고객·산업 직접 입력", ok: real(inp.industry) || (inp === State.input && (State.customerTags || []).length > 0), tip: "관심 고객을 적으면 시장 신호를 그 고객 기준으로 좁힙니다." },
      { k: "알고 있는 문제 직접 입력", ok: real(inp.knownProblem), tip: "직접 겪거나 들은 문제를 적으면 AI 가설 의존도가 낮아집니다." },
      { k: "활용 자원 1개 이상", ok: resCount > 0, tip: "보유 자원을 적으면 실행 가능성 점검이 정확해집니다." },
      { k: "지역·연령·형태 중 1개 이상", ok: real(inp.region) || real(inp.targetAge) || (inp.preferredForms || []).length > 0, tip: "선택 조건이 있으면 후보가 내 상황에 더 맞춰집니다." },
    ];
    const n = items.filter(i => i.ok).length;
    const level = n >= 5 ? { k: "충실", c: "ok", d: "입력이 충분해 결과가 내 상황을 잘 반영합니다." }
      : n >= 3 ? { k: "보통", c: "mid", d: "일부 항목은 AI가 시장 신호로 채웠습니다. 결과를 가설로 읽어 주세요." }
      : { k: "AI 가설 위주", c: "low", d: "대부분을 AI가 채웠습니다. 결과는 출발점(가설)으로만 쓰고, 아래 항목을 채워 다시 탐색하길 권장합니다." };
    return { items, n, total: items.length, level };
  },

  // ---------- ① 입력 조건 점검(결정론 규칙) ----------
  fitChecks(o, inp) {
    inp = inp || State.input || {};
    const out = [];
    const rt = o.solution?.resourceType, st = o.solution?.solutionType || o._seedSolution || "";
    const bmax = typeof budgetMax === "function" ? budgetMax(inp.budget) : null;
    const small = bmax != null && bmax <= 1000, bname = typeof budgetName === "function" ? budgetName(inp.budget) : "";
    if (small && rt === "HW") out.push({ lv: "warn", t: `하드웨어 중심 후보예요. 입력한 초기 예산(${bname})으로는 시제품·장비 비용이 부담될 수 있어요.` });
    else if (small && st === "Product") out.push({ lv: "info", t: `실물 제품은 시제품·초도 생산 비용이 들어요. ${bname}이면 소량 제작·사전 판매(크라우드펀딩 등)로 수요부터 확인하세요.` });
    else if (small && rt === "Hybrid" && st !== "Product") out.push({ lv: "info", t: `제품+서비스 복합형이에요. ${bname} 예산이면 서비스부터 시작하는 순서를 검토하세요.` });
    const FO = typeof FORM_OPTIONS !== "undefined" ? FORM_OPTIONS : [];
    const pfs = (inp.preferredForms || []).filter(k => FO.some(f => f.k === k));
    const pfTypes = pfs.flatMap(k => FO.find(f => f.k === k).t);
    // 실물 제품·기기를 고른 경우 '제품(기기)+서비스' 복합형은 같은 계열로 본다
    if (pfs.some(k => k === "product" || k === "hardware")) pfTypes.push("ProductPlusService");
    const pf = pfs.map(k => FORM_NAME[k]).join("·");
    if (pfs.length && st && FO.some(f => f.t.includes(st)) && !pfTypes.includes(st)) out.push({ lv: "info", t: `선호 형태(${pf})와 다른 형태(${Result.solTypeKo(st) || st})예요. 형태를 바꿔도 같은 문제를 풀 수 있는지 검토해 보세요.` });
    if (["Product", "Hardware"].includes(st) && n_def(o) && !/(키트|세트|박스|교구|기기|장비|디바이스|센서|용품|제품|식품|굿즈|카드|워크북|책|패키지|하드웨어|단말|부품|소재)/.test(n_def(o))) out.push({ lv: "info", t: "실물 제품 후보인데 정의에 물건이 드러나지 않아요. 무엇을 손에 쥐어 파는지 먼저 정해 보세요." });
    if (o.founderFit?.hasMisfit) out.push({ lv: "warn", t: "실행 걸림돌이 있어요(위 적합도 참고). 보완 계획 없이 바로 시작하기는 어려워요." });
    return out;
  },

  // ---------- ① 후보 다양성(결정론) ----------
  diversity(R) {
    const t = R.top5 || [];
    const uniq = a => new Set(a.filter(Boolean)).size;
    const forms = uniq(t.map(o => o.solution?.solutionType || o._seedSolution));
    const custs = uniq(t.map(o => o.customer?.type));
    const cats = uniq(t.flatMap(o => (o.whyNow || []).map(w => w.category)));
    const probs = uniq(t.map(o => [o.signals?.problemSignal?.raw, o.signals?.marketGapSignal?.raw, o.narrative?.problem ? String(o.narrative.problem).slice(0, 12) : ""].join("|")));
    const sameProblem = t.length > 1 && custs <= 1 && probs <= 2;
    const ok = forms >= 3 && !sameProblem;
    return { forms, custs, cats, ok, sameProblem, n: t.length };
  },

  // ---------- ③ 근거 확인처 ----------
  sourcesFor(o, inp) {
    inp = inp || State.input || {};
    const ids = [];
    (o.whyNow || []).forEach(w => (PLUS_DATA.sourceByCategory[String(w.category || "").toUpperCase()] || []).forEach(id => ids.push(id)));
    ids.push("DATALAB");                 // 문제 관심 추이는 항상
    ids.push("KIPRIS");                  // 시장 공백(유사 서비스)은 항상
    if (this.isStoreLike(o, inp)) ids.unshift("SBIZ");
    if (!ids.includes("KOSIS")) ids.push("KOSIS");
    return [...new Set(ids)].slice(0, 4).map(id => ({ id, ...PLUS_DATA.sources[id] }));
  },
  isStoreLike(o, inp) {
    // 이름(예: "AI부품가게")은 비유일 수 있어 제외 — 해결 방식·채널·관심 고객으로만 판단
    const txt = [o.narrative?.solutionConcept, o.narrative?.channel, o.channel, (inp || State.input || {}).industry].join(" ");
    if (["food", "local"].includes(o.field) || o.solution?.solutionType === "Store") return true;
    return /매장|카페|음식점|식당|외식|점포|가게|공방|학원|오프라인 ?(매장|점)/.test(txt);
  },

  // 시장의 빈틈 — 후보별 문장(서술 > explainPath '시장 공백' 단계 > 공통 gap)
  gapText(o) {
    const n = o.narrative || {};
    if (n.marketGap) return this.str(n.marketGap, 200);
    const step = (o.explainPath || []).map(String).find(p => /^\s*\d*\.?\s*시장\s*공백\s*[:：]/.test(p));
    if (step) return this.str(step.replace(/^[^:：]*[:：]\s*/, ""), 200);
    return this.str(o.marketGap?.statement, 200);
  },
  fieldName(o) { return (typeof FIELD_NAME !== "undefined" && FIELD_NAME[o.field]) || ""; },

  // 고객의 현재 대안 — narrative 문장이 없으면 서버 코드값을 한글로
  altText(o) {
    const n = o.narrative || {};
    if (n.currentWorkaround) return { how: this.str(n.currentWorkaround, 200), broken: this.str(n.whatsBroken, 200) };
    const alts = Array.isArray(o.currentAlternative) ? o.currentAlternative : [];
    const how = [...new Set(alts.map(a => PLUS_DATA.altKo[a?.type] || (a?.type && /^[A-Za-z]+$/.test(a.type) ? null : this.str(a?.type, 20))).filter(Boolean))].join(" · ");
    const dis = [...new Set(alts.flatMap(a => Array.isArray(a?.dissatisfaction) ? a.dissatisfaction : []).map(d => PLUS_DATA.dissatKo[d] || (/^[A-Za-z]+$/.test(String(d)) ? null : this.str(d, 30))).filter(Boolean))].slice(0, 4).join(" · ");
    return { how, broken: dis ? "불만: " + dis : "" };
  },

  shortProblem(t) {
    t = this.str(t, 200);
    const cut = t.split(/(?<=[,.])\s|(?<=고)\s|(?<=며)\s/)[0];
    const x = (cut && cut.length >= 8 ? cut : t).replace(/[,.]$/, "");
    return x.length > 45 ? x.slice(0, 44) + "…" : x;
  },

  // ---------- ② 검증 첫 3걸음 ----------
  validationPlan(o) {
    const n = o.narrative || {};
    const who = this.str(n.who || o.customer?.roles?.user || "대상 고객", 60);
    // 문장이 자연스러운 서술(narrative)을 먼저, 없으면 구조화 문장
    const prob = this.shortProblem(n.problem || o.problem?.statement || "이 문제");
    const alt = this.str(this.altText(o).how || "지금 쓰는 방법", 60);
    const buyer = this.str(n.buyer || o.buyer || o.customer?.roles?.buyer || who, 50);
    const b2b = o.customer?.type === "B2B";
    // 후보별 서술(narrative.unknowns)을 먼저, 없으면 공통 불확실성
    const unknowns = n.unknowns ? String(n.unknowns).split(/[,·]/) : (Array.isArray(o.unknowns) ? o.unknowns : []);
    const ev = o.signals?.evidenceConfidence || "L0";
    return {
      ev,
      steps: [
        { when: "먼저", t: `고객 문제 인터뷰 ${b2b ? "(실무자 3명 + 결정권자 2명)" : "5명"}`,
          how: `${who}에게 아래 질문을 그대로 물어보세요. 아이템 설명은 마지막까지 하지 않습니다.`,
          qs: [`(상황을 보여 주며) ‘${prob}’ — 최근 3개월 안에 이런 일을 겪은 적이 있나요? 마지막이 언제였나요?`,
               `그때 어떻게 해결했나요? (${alt}) 시간·비용은 얼마나 들었나요?`,
               `그 방법에서 가장 아쉬운 점 하나만 꼽는다면 무엇인가요?`],
          done: "5명 중 3명 이상이 최근 3개월 안에 같은 문제를 구체적 사례로 말함 → 근거 수준 L3" },
        { when: "다음", t: "현재 대안·유사 서비스 3개 비교",
          how: `고객이 지금 쓰는 방법(${alt})과 검색·앱스토어·KIPRIS에서 찾은 유사 서비스 3개를 가격·대상·한계로 표를 만드세요.`,
          qs: [], done: "3개 이상 비교했고, 결과의 '시장의 빈틈' 문장이 여전히 맞는지 예/아니오로 판단함" },
        { when: "그다음", t: "지불 의사 확인(사전신청·가격 질문)",
          how: `${buyer}에게 한 줄 소개 + 예상 가격을 보여 주고 사전신청(연락처 남기기)을 받거나, "이 가격이면 쓰겠다/안 쓰겠다"를 묻습니다.`,
          qs: [], done: "관심을 보인 10명 중 3명 이상이 사전신청 또는 가격 수용 → AI 아이템 진단(PMF)으로" },
      ],
      unknowns: unknowns.map(u => this.str(u, 60)).filter(u => u && u !== "확인 필요").slice(0, 4),
    };
  },

  // ---------- ⑨ BECONIC 31 다음 진단 ----------
  nextDiagnoses(R, inp) {
    inp = inp || State.input || {};
    const ut = inp.userType || "";
    const existing = ["기존기업", "중소기업", "신사업 담당자", "스타트업"].includes(ut);
    const pre = ut === "예비창업자" || (!ut && !existing);
    const cond = {
      always: true, existing, pre,
      startup: ["예비창업자", "창업자", "소상공인", "스타트업"].includes(ut) || !ut,
      bigBudget: (typeof budgetMax === "function" ? budgetMax(inp.budget) : 0) >= 10000,
      store: (R.top5 || []).some(o => this.isStoreLike(o, inp)) || (inp.preferredForms || []).includes("store"),
    };
    const out = [], used = new Set();
    for (const r of PLUS_DATA.nextRules) {
      if (out.length >= PLUS_DATA.maxNext) break;
      if (!cond[r.when] || used.has(r.tool)) continue;
      if (r.tool === "G" && pre) continue;             // 31 규칙: 예비창업자에게 G 추천 안 함
      used.add(r.tool); out.push({ ...r, ...PLUS_DATA.tools[r.tool] });
    }
    return out;
  },

  // ---------- ⑧ 탐색 기록(이 브라우저) ----------
  snapshot(R) {
    const inp = State.input || {};
    return {
      v: 1, docNo: this.docNo(R), ts: R._createdAt || Date.now(), app: APP_META.appVersion,
      input: { userType: this.str(inp.userType, 20), industry: this.str(String(inp.industry || "").startsWith("__") ? "" : inp.industry, 60), budget: this.str(inp.budget, 20) },
      items: (R.top5 || []).map(o => ({
        title: this.str(o.narrative?.name || o.title, 60),
        p: o.signals.problemSignal.band, g: o.signals.marketGapSignal.band, t: o.signals.timingSignal.band,
        e: o.signals.evidenceConfidence,
      })),
    };
  },
  cleanSnapshot(s) {
    if (!s || typeof s !== "object" || !Array.isArray(s.items)) return null;
    const band = b => this.BANDS.includes(b) ? b : "unknown";
    const ts = Number(s.ts); if (!isFinite(ts) || ts < 1.6e12 || ts > Date.now() + 864e5) return null;
    return {
      v: 1, docNo: this.str(s.docNo, 40).replace(/[^A-Za-z0-9-]/g, ""), ts, app: this.str(s.app, 12),
      input: { userType: this.str(s.input?.userType, 20), industry: this.str(s.input?.industry, 60), budget: this.str(s.input?.budget, 20) },
      items: s.items.slice(0, 8).map(i => ({ title: this.str(i?.title, 60), p: band(i?.p), g: band(i?.g), t: band(i?.t), e: PLUS_DATA.evidence[i?.e] ? i.e : "L0" })).filter(i => i.title),
    };
  },
  history() {
    try { const a = JSON.parse(localStorage.getItem("kif_history") || "[]"); return Array.isArray(a) ? a.map(s => this.cleanSnapshot(s)).filter(Boolean) : []; } catch (e) { return []; }
  },
  saveHistory(R) {
    if (!this.isReal() || !R?.top5?.length) return;
    try {
      const snap = this.snapshot(R);
      const h = this.history().filter(s => s.docNo !== snap.docNo);
      h.unshift(snap);
      localStorage.setItem("kif_history", JSON.stringify(h.slice(0, PLUS_DATA.historyMax)));
    } catch (e) {}
  },
  previousOf(R) {
    if (State.compareWith) return State.compareWith;
    const cur = this.docNo(R);
    return this.history().find(s => s.docNo !== cur) || null;
  },
  bigrams(s) { s = String(s).replace(/\s+/g, ""); const a = new Set(); for (let i = 0; i < s.length - 1; i++) a.add(s.slice(i, i + 2)); return a; },
  similar(a, b) {
    const A = this.bigrams(a), B = this.bigrams(b); if (!A.size || !B.size) return a === b;
    let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter) >= 0.45;
  },
  compareSnapshots(prev, cur) {
    const kept = [], added = [], dropped = [];
    const used = new Set();
    cur.items.forEach(c => {
      const j = prev.items.findIndex((p, k) => !used.has(k) && this.similar(p.title, c.title));
      if (j > -1) { used.add(j); kept.push({ cur: c, prev: prev.items[j] }); } else added.push(c);
    });
    prev.items.forEach((p, k) => { if (!used.has(k)) dropped.push(p); });
    return { kept, added, dropped };
  },
  exportFile(R) {
    try {
      const snap = this.snapshot(R);
      const blob = new Blob([JSON.stringify({ kind: "K-ITEM-FINDER-RESULT", ...snap }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `${snap.docNo}.json`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      App.toast("결과 파일을 저장했어요. 다음 탐색 때 불러와 비교할 수 있어요.");
    } catch (e) { App.toast("저장에 실패했어요."); }
  },
  importFile(input) {
    const f = input.files && input.files[0]; input.value = "";
    if (!f) return;
    if (f.size > 200000) { App.toast("파일이 너무 커요(200KB 이하)."); return; }
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const raw = JSON.parse(String(rd.result));
        if (raw.kind !== "K-ITEM-FINDER-RESULT") throw new Error("kind");
        const s = this.cleanSnapshot(raw); if (!s) throw new Error("shape");
        State.compareWith = s; Result.render(); App.toast("이전 결과와 비교했어요.");
        document.getElementById("sec-history")?.scrollIntoView({ behavior: "smooth" });
      } catch (e) { App.toast("K-ITEM FINDER 결과 파일이 아니에요."); }
    };
    rd.readAsText(f);
  },
  icsReminder(R) {
    const d = new Date(Date.now() + PLUS_DATA.rediagnoseDays * 864e5);
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const url = location.origin + location.pathname;
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BECONIC//K-ITEM FINDER//KO", "BEGIN:VEVENT",
      `UID:${this.docNo(R)}@k-item-finder`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${ymd}`, "SUMMARY:K-ITEM FINDER 90일 재탐색",
      `DESCRIPTION:지난 탐색(${this.docNo(R)})과 비교해 보세요. 결과 파일을 불러오면 변화를 볼 수 있어요. ${url}`,
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "k-item-finder-90days.ics"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },

  // ---------- ⑥ 연계: S2 이관 · 메일 상담 ----------
  handoffText(o) {
    const n = o.narrative || {};
    const L = [`[K-ITEM FINDER 선택 아이템] ${n.name || o.title}${n.definition ? " — " + n.definition : ""}`];
    const add = (k, v) => { v = this.str(v, 300); if (v && v !== "확인 필요") L.push(`- ${k}: ${v}`); };
    add("대상 고객", n.who || o.customer?.roles?.user);
    add("고객 문제", n.problem);
    add("현재 대안", this.altText(o).how);
    add("분야", this.fieldName(o));
    add("시장의 빈틈", this.gapText(o));
    add("왜 지금", n.whyNow);
    add("해결 방식", n.solutionConcept);
    add("비용 지불자", n.buyer || o.buyer);
    add("확인할 점", n.unknowns || (o.unknowns || []).join(", "));
    L.push(`- 근거 수준: ${PLUS_DATA.evidence[o.signals.evidenceConfidence]?.n || "-"} · 문서번호 ${this.docNo(State.result)}`);
    return L.join("\n");
  },
  async copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      try { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e2) { return false; }
    }
  },
  mailHref(R) {
    const prim = State.primary ? R.top5.find(o => o.opportunityId === State.primary) : null;
    const body = [
      "안녕하세요. K-ITEM FINDER 결과로 상담을 요청합니다.", "",
      `문서번호: ${this.docNo(R)}`, `탐색일: ${this.dateKo(R._createdAt)}`,
      `발굴 후보: ${(R.top5 || []).map((o, i) => `${i + 1}) ${o.narrative?.name || o.title}`).join(" / ")}`,
      prim ? `검토하려는 아이템: ${prim.narrative?.name || prim.title}` : "검토하려는 아이템: (선택 전)",
      "", "상담받고 싶은 내용:", "", "성함 / 연락처 (직접 적어 주세요):", "",
      "※ 이 메일은 고객님 메일 앱에서 직접 보내는 초안입니다. 입력하신 경험·자원 정보는 자동으로 담기지 않습니다.",
    ].join("\n");
    return `mailto:${COMPANY_INFO.email}?subject=${encodeURIComponent(`[K-ITEM FINDER 상담] ${this.docNo(R)}`)}&body=${encodeURIComponent(body)}`;
  },
};
