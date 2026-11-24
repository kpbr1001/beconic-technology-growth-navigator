// ============================================================
// K-ITEM FINDER — Opportunity Discovery Engine
// Netlify Serverless Function  (ESM, export default handler)
// ------------------------------------------------------------
// Flow:  CALL A (구조화·seed) → Rule Engine (점수/필터/다양성/프리모템)
//        → CALL B (서술만) → { top5, comparison, summary }
//
// 설계 원칙 반영:
//  · P7 생성≠검증 : CALL A는 seed만, 후보생성·점수는 Rule Engine, CALL B는 서술만
//  · SUCCESS SCORE 금지 : 5개 신호(Problem/MarketGap/Timing/FounderMatch/Evidence)만
//  · Missing ≠ Negative : sentinel → UNKNOWN, 0점 처리 금지, 가중치 재정규화
//  · Hallucination 차단 : 시장수치 출처 없으면 서버가 "unknown" 강제
//  · Claude는 signals/founderMatch를 덮어쓸 수 없음(explain 필드만 화이트리스트 병합)
//  · API Call ≤ 2회 / 진단
//  · 확장성 : providers(claude/external) 어댑터, external.enrich()는 향후 데이터 연계 자리
//
//  Prompt v1.2.0 · APP_META.appVersion v0.1.0 MVP · Updated 2026.08.08
// ============================================================

// ------------------------------------------------------------
// 0. CONFIG (서버측 단일 소스)
// ------------------------------------------------------------
const APP_META = {
  productName: "K-ITEM FINDER",
  appVersion: "v0.1.0 MVP",
  promptVersion: "v1.2.0",
  updatedAt: "2026.08.08",
  schemaVersion: "kif-opportunity-dna/v1",
};

// 실테스트 후 튜닝 대상. 코드 분산 금지 — 이 한 곳에서만 관리.
const WEIGHT_CONFIG = {
  problemSignal:  { severity: 0.30, frequency: 0.25, cost: 0.20, currentEffort: 0.15, emotion: 0.10 },
  marketGapSignal:{ dissatisfaction: 0.25, underserved: 0.20, nonConsumption: 0.15,
                    switchingFrictionInv: 0.15, competitionInv: 0.15, accessibility: 0.10 },
  timingSignal:   { persistence: { STRUCTURAL: 1.0, EMERGING: 0.8, TEMPORARY: 0.5 } },
  founderMatch:   { experience: 1.5, customerAccess: 1.5, skill: 1.0, network: 1.0,
                    capital: 1.0, time: 1.0, resource: 1.0 },
  softPenalty:    { highSwitching: 8, highResourceBurden: 8, lowFounderFit: 6,
                    weakWhyNow: 6, lowAccessibility: 6, allUnknown: 10 },
};

const FILTER_CONFIG = {
  candidateMin: 50, candidateMax: 150,
  dedupThreshold: 0.82,
  clusterTarget: 20, rankTarget: 10, finalTop: 5,
  diversityMinAxes: 2, // Customer/Problem/SolutionType/Revenue/Resource 중 2축 이상 상이
};

const API_CONFIG = {
  model: "claude-sonnet-4-6",
  maxTokensA: 4000,
  maxTokensB: 5000,
  maxRetries: 1,           // background function이라 재시도 여유 있음
  anthropicVersion: "2023-06-01",
  endpoint: "https://api.anthropic.com/v1/messages",
};

// 출처 없이 오면 서버가 "unknown"으로 강제 치환하는 필드
const HALLUCINATION_GUARDED_NUMERIC = [
  "marketSize", "share", "cagr", "companyCount", "customerCount",
  "price", "investment", "patentCount", "exportVolume", "revenue",
];

// 입력 sentinel — UNKNOWN 처리 대상 (0점 아님)
const SENTINELS = ["__UNKNOWN__", "__NONE__", "__AI_FIND__", "__ANY__", "", null, undefined];

// ------------------------------------------------------------
// 1. UTIL
// ------------------------------------------------------------
const isUnknown = (v) => SENTINELS.includes(v) ||
  (typeof v === "string" && ["unknown", "잘 모르겠습니다", "아직 없습니다", "상관없어요"].includes(v.trim()));

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// 사용자 입력에 기술 역량 근거가 있는지 (하드 미스핏 판정용, 보수적)
function userHasTechCapacity(input) {
  if (!input) return false;
  const sw = input.resources?.sw || [];
  const human = input.resources?.human || [];
  const exp = (input.experience || "").toLowerCase();
  const techWords = ["개발", "엔지니어", "ai", "데이터", "기술", "연구", "r&d", "특허", "제조"];
  return sw.length > 0 || human.some((h) => techWords.some((w) => String(h).toLowerCase().includes(w)))
    || techWords.some((w) => exp.includes(w));
}

function bandOf(raw) {
  if (raw == null || Number.isNaN(raw)) return "unknown";
  if (raw <= 20) return "veryLow";
  if (raw <= 40) return "low";
  if (raw <= 60) return "medium";
  if (raw <= 80) return "high";
  return "veryHigh";
}

// 결측 변수를 제외하고 남은 가중치를 재정규화하여 가중합
function weightedNormalize(parts) {
  // parts: [{ value:0..100|null, weight:number }]
  const active = parts.filter((p) => p.value != null && !Number.isNaN(p.value));
  if (active.length === 0) return null; // 전부 UNKNOWN → null(회색 표시)
  const wsum = active.reduce((s, p) => s + p.weight, 0) || 1;
  const score = active.reduce((s, p) => s + p.value * (p.weight / wsum), 0);
  return clamp(Math.round(score));
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// ------------------------------------------------------------
// 2. JSON REPAIR / PARSE  (무한 재시도 금지: repair 1회 + retry 1회)
// ------------------------------------------------------------
function repairJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  // 코드펜스 제거
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // 앞뒤 잡텍스트 제거: 첫 { ~ 마지막 }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first > -1 && last > -1) t = t.slice(first, last + 1);
  // 트레일링 콤마 보정
  t = t.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(t); } catch { return null; }
}

function safeParse(text) {
  try { return JSON.parse(text); }
  catch { return repairJSON(text); }
}

// ------------------------------------------------------------
// 3. PROVIDERS (어댑터 — 모델/데이터소스 교체 용이)
// ------------------------------------------------------------
const providers = {
  // 3-1. Claude LLM 어댑터
  claude: {
    async call({ system, user, maxTokens }) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("MISSING_API_KEY");

      const doFetch = async () => {
        const res = await fetch(API_CONFIG.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": API_CONFIG.anthropicVersion,
          },
          body: JSON.stringify({
            model: API_CONFIG.model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`LLM_HTTP_${res.status}:${errText.slice(0, 300)}`);
        }
        const data = await res.json();
        const text = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        if (data.stop_reason === "max_tokens") {
          console.warn("[LLM] response truncated by max_tokens");
        }
        return text;
      };

      // retry 1회
      let lastErr;
      for (let attempt = 0; attempt <= API_CONFIG.maxRetries; attempt++) {
        try { return await doFetch(); }
        catch (e) { lastErr = e; }
      }
      throw lastErr;
    },
  },

  // 3-2. 외부 데이터 커넥터 (향후 확장 자리 — MVP는 no-op)
  //      KOSIS · K-Startup · 검색신호 · 특허 등 연결 시 이 인터페이스만 채우면 됨.
  external: {
    async enrich(dnaList /*, opts */) {
      // TODO(확장): 각 후보에 sources[] 보강 → Evidence Confidence 상향 근거 제공.
      // 현재는 후보를 그대로 반환하여 MVP 동작에 영향 없음.
      return dnaList;
    },
  },
};

// ------------------------------------------------------------
// 4. CALL A — Input Structuring (seed만 반환)
// ------------------------------------------------------------
const SYSTEM_A = `당신은 K-ITEM FINDER의 고객·시장 구조화 엔진이다.
사용자 입력을 구조화하되, 아래 규칙을 반드시 지킨다.

[금지]
- 시장규모, 점유율, CAGR, 가격, 투자금, 특허수, 매출 등 어떤 수치도 생성하지 않는다.
- 완성된 창업 아이디어나 성공확률·투자등급을 만들지 않는다.
- 근거가 없으면 해당 값은 "unknown" 으로 둔다. 빈 문자열 대신 "unknown".

[역할]
- 고객(역할 user/buyer/decisionMaker/beneficiary 분리), 맥락(triggerEvent), JTBD,
  문제(type/severity/frequency), 감정(8종)·동기(8종), 현재대안·불만,
  시장공백(underserved/nonConsumption/switchingFriction), Why Now(problemPersistence)를 도출한다.
- 마지막으로 candidateSeeds 를 8~20개 만든다. 이는 '완성 아이디어'가 아니라
  조합 힌트(customerKey, problemKey, solutionTypeHint, resourceHint)일 뿐이다.

[출력]
- 오직 Strict JSON 하나만 출력한다. 마크다운·설명·코드펜스 금지.
- 응답의 첫 글자는 반드시 { 이고 마지막 글자는 반드시 } 여야 한다. 어떤 서두도 붙이지 마라.`;

function buildUserA(input) {
  return `다음 사용자 입력을 구조화하라. sentinel(__UNKNOWN__ 등)은 "unknown"으로 간주한다.

입력:
${JSON.stringify(input, null, 2)}

다음 JSON 스키마로만 응답하라:
{
  "customer": { "type": "B2C|B2B|B2G|B2B2C", "ageRange": "..|null", "occupation": "..|null",
    "companyIndustry": "..|null", "companySize": "..|null",
    "roles": { "user":"", "buyer":"", "decisionMaker":"", "beneficiary":"", "influencer":"|null" } },
  "contexts": [{ "when":"|null","where":"|null","beforeEvent":"|null","triggerEvent":"|null" }],
  "jobs": [{ "functional":"","emotional":"|null","social":"|null","statement":"WHEN __ I WANT TO __ SO I CAN __" }],
  "problems": [{ "types":["Time|Cost|Complexity|Information|..."], "severity":"1..5|unknown",
    "frequency":"daily|weekly|monthly|rare|unknown",
    "cost":{ "money":"unknown","time":"unknown","labor":"unknown" } }],
  "emotions": [{ "type":"FEAR|ANGER|SADNESS|DISGUST|JOY|TRUST|ANTICIPATION|SURPRISE","intensity":"1..5" }],
  "motives": ["SAVE|AVOID|CONTROL|ACHIEVE|BELONG|EXPRESS|SIMPLIFY|ENJOY"],
  "alternatives": [{ "type":"Excel|Phone|Human|AI|Manual|Search|None|...","dissatisfaction":["expensive|slow|..."] }],
  "gaps": [{ "statement":"", "underserved":["..."], "nonConsumption":[{"segment":"","reason":"TooExpensive|..."}],
    "switchingFriction":["Price|Habit|..."] }],
  "whyNow": [{ "category":"TECHNOLOGY|DEMOGRAPHIC|SOCIAL|ECONOMIC|ENVIRONMENTAL|REGULATION|CHANNEL",
    "signal":"", "trendStrength":"weak|medium|strong|unknown", "problemPersistence":"TEMPORARY|EMERGING|STRUCTURAL" }],
  "candidateSeeds": [{ "customerKey":"", "problemKey":"", "solutionTypeHint":"SaaS|Service|Marketplace|Product|Education|Content|...",
    "resourceHint":"HW|SW|Human|Hybrid" }],
  "uncertainties": ["아직 모르는 것"]
}`;
}

// ------------------------------------------------------------
// 5. MORPHOLOGICAL GENERATION  (seed → DNA 후보, 내부 50~150)
// ------------------------------------------------------------
function toDNA(seed, A, idx, input) {
  const prob = A.problems?.[0] || {};
  const gap = A.gaps?.[0] || {};
  const wn = A.whyNow?.[0] || {};
  return {
    opportunityId: `kif_ops_${String(idx + 1).padStart(3, "0")}`,
    title: `${seed.customerKey || "고객"} · ${seed.problemKey || "문제"} (${seed.solutionTypeHint || "solution"})`,
    clusterId: null,
    customer: A.customer || {},
    context: A.contexts?.[0] || {},
    jobs: A.jobs || [],
    problem: {
      types: prob.types || [],
      severity: isUnknown(prob.severity) ? "unknown" : prob.severity,
      frequency: isUnknown(prob.frequency) ? "unknown" : prob.frequency,
      cost: prob.cost || { money: "unknown", time: "unknown", labor: "unknown" },
    },
    emotions: A.emotions || [],
    motives: A.motives || [],
    currentAlternative: A.alternatives || [],
    switchingFriction: gap.switchingFriction || [],
    underserved: gap.underserved || [],
    nonConsumption: gap.nonConsumption || [],
    marketGap: { statement: gap.statement || "", strength: "unknown" },
    whyNow: A.whyNow || [],
    solution: {
      resourceType: seed.resourceHint || "SW",
      solutionType: seed.solutionTypeHint || "Service",
      concept: "", // CALL B 서술
    },
    dataAvailability: "UNKNOWN",
    technologyReadiness: "AVAILABLE_NOW",
    buyer: A.customer?.roles?.buyer || "",
    channel: "",
    founderMatch: { band: "unknown", reasons: [], gaps: [] },
    founderFit: { band: "unknown", note: "", misfits: [], hasMisfit: false },
    marketAccessibility: {
      reachability: "unknown", identifiability: "unknown",
      channelAvailability: "unknown", initialAcquisition: "unknown",
    },
    signals: null, // Rule Engine이 채움
    explainPath: [],
    resourceBurden: seed.resourceHint === "HW" ? "high" : seed.resourceHint === "Hybrid" ? "medium" : "low",
    unknowns: A.uncertainties || [],
    assumptions: [],
    sources: [],
    _persistence: wn.problemPersistence || "EMERGING",
    _seed: seed,
    _input: input,
  };
}

function generateCandidates(A, input) {
  const seeds = Array.isArray(A.candidateSeeds) ? A.candidateSeeds : [];
  // 조합 확장: seed × solutionType 변주로 후보 증식(Cartesian 전체 아님, guided)
  const solTypes = ["SaaS", "Service", "Marketplace", "Education", "Content", "ProductPlusService"];
  const resTypes = ["SW", "Human", "Hybrid"];
  const out = [];
  for (const s of seeds) {
    out.push(s);
    // 각 seed당 1~2개 변주만 추가하여 폭발 방지
    const altSol = solTypes.find((x) => x !== s.solutionTypeHint);
    const altRes = resTypes.find((x) => x !== s.resourceHint);
    if (altSol) out.push({ ...s, solutionTypeHint: altSol });
    if (altRes) out.push({ ...s, resourceHint: altRes });
    if (out.length >= FILTER_CONFIG.candidateMax) break;
  }
  return out.slice(0, FILTER_CONFIG.candidateMax).map((s, i) => toDNA(s, A, i, input));
}

// ------------------------------------------------------------
// 6. RULE ENGINE — 점수/필터/클러스터/다양성/프리모템
// ------------------------------------------------------------
const RuleEngine = {
  // 6-1. Hard Filter
  hardFilter(list) {
    return list.filter((c) => {
      if (!c.customer?.roles?.user) return false;          // 고객 없음
      if (!c.problem?.types?.length) return false;          // 문제 정의 없음
      if (c.technologyReadiness === "R_AND_D_REQUIRED" &&
          ["veryLow", "low"].includes(c.founderMatch.band)) return false;
      const t = (c.title || "").toLowerCase();
      if (/wrapper|gpt\s*wrapper/.test(t)) return false;    // 단순 AI 래퍼
      return true;
    });
  },

  // 6-2. Semantic Dedup (임베딩 없이 룰 키)
  dedup(list) {
    const seen = new Set();
    const out = [];
    for (const c of list) {
      const key = [
        c.customer?.type,
        c.problem?.types?.slice().sort().join(","),
        c.solution?.solutionType,
      ].join("|");
      if (!seen.has(key)) { seen.add(key); out.push(c); }
    }
    return out;
  },

  // 6-3. Cluster → 대표 후보 (customerType × problemType × solutionType)
  //   의미 유사군은 묶되, 최종 다양성/5개 확보를 위해 풀을 과도하게 줄이지 않는다.
  //   각 클러스터에서 대표 1개를 우선 확보하고, 남는 슬롯은 잔여 후보로 채운다.
  cluster(list) {
    const groups = {};
    for (const c of list) {
      const key = [c.customer?.type, c.problem?.types?.[0], c.solution?.solutionType].join("|");
      c.clusterId = key;
      (groups[key] ||= []).push(c);
    }
    const reps = Object.values(groups).map((g) => g[0]);            // 대표
    const rest = Object.values(groups).flatMap((g) => g.slice(1));  // 잔여
    const pool = [...reps, ...rest].slice(0, FILTER_CONFIG.clusterTarget);
    return pool;
  },

  // 6-4. Score (5 신호) — Deliverable D
  score(c) {
    const W = WEIGHT_CONFIG;

    // Problem Signal
    const sev = isUnknown(c.problem.severity) ? null : Number(c.problem.severity) * 20;
    const freqMap = { daily: 100, weekly: 70, monthly: 40, rare: 15 };
    const freq = isUnknown(c.problem.frequency) ? null : (freqMap[c.problem.frequency] ?? null);
    const costKnown = Object.values(c.problem.cost || {}).some((v) => !isUnknown(v));
    const cost = costKnown ? 60 : null; // 정성 존재 시 중간값(수치 임의생성 금지)
    const effort = c.currentAlternative?.length ? 60 : null;
    const emoMax = c.emotions?.length ? Math.max(...c.emotions.map((e) => Number(e.intensity) || 0)) * 20 : null;
    const problemSignal = weightedNormalize([
      { value: sev, weight: W.problemSignal.severity },
      { value: freq, weight: W.problemSignal.frequency },
      { value: cost, weight: W.problemSignal.cost },
      { value: effort, weight: W.problemSignal.currentEffort },
      { value: emoMax, weight: W.problemSignal.emotion },
    ]);

    // Market Gap Signal
    const dissat = c.currentAlternative?.reduce((s, a) => s + (a.dissatisfaction?.length || 0), 0);
    const gapMarket = weightedNormalize([
      { value: dissat ? clamp(dissat * 25) : null, weight: W.marketGapSignal.dissatisfaction },
      { value: c.underserved?.length ? clamp(c.underserved.length * 40) : null, weight: W.marketGapSignal.underserved },
      { value: c.nonConsumption?.length ? clamp(c.nonConsumption.length * 40) : null, weight: W.marketGapSignal.nonConsumption },
      { value: c.switchingFriction?.length != null ? clamp(100 - c.switchingFriction.length * 20) : null, weight: W.marketGapSignal.switchingFrictionInv },
      { value: null, weight: W.marketGapSignal.competitionInv }, // 경쟁강도 미연결 → UNKNOWN
      { value: null, weight: W.marketGapSignal.accessibility },  // 접근성 미연결 → UNKNOWN
    ]);

    // Timing Signal: whyNow 신호 강도 평균 × persistence 계수
    // (카테고리 개수가 아니라 각 신호의 trendStrength 강도를 반영 — 과소평가 방지)
    const strMap = { strong: 100, medium: 65, weak: 35 };
    const wnSignals = (c.whyNow || []).filter((w) => w.category);
    const timingBase = wnSignals.length
      ? clamp(Math.round(wnSignals.reduce((s, w) => s + (strMap[w.trendStrength] ?? 50), 0) / wnSignals.length))
      : null;
    const pCoef = W.timingSignal.persistence[c._persistence] ?? 0.8;
    const timingSignal = timingBase == null ? null : clamp(Math.round(timingBase * pCoef));

    // ── Founder Match (절충안) ──────────────────────────────
    //   점수 밴드는 UNKNOWN 유지 → 거짓 정밀도 방지 (실테스트 후 활성화).
    //   대신 '명백한 하드 미스핏'만 근거가 확실한 실행가능성 경고로 표기하고,
    //   정성 코멘트(founderFitNote)는 CALL B 서술이 채운다.
    //   ※ 이는 '적합도 점수'가 아니라 '실행 불가 경고'이므로 P3/P6와 충돌하지 않음.
    const founderMatchRaw = null; // 밴드 미표시(회색). 실입력 매핑 검증 후 튜닝.
    const misfits = [];
    if (c.technologyReadiness === "R_AND_D_REQUIRED" && !userHasTechCapacity(c._input)) {
      misfits.push({ type: "R_AND_D_GAP", message: "R&D가 필요하나 기술 역량 근거가 확인되지 않습니다." });
    }
    if (c.resourceBurden === "high" && (c._input?.budget === "under1000만")) {
      misfits.push({ type: "CAPITAL_GAP", message: "초기 자원 부담이 높은 편이라 예산 범위를 확인해야 합니다." });
    }
    if (c.solution?.resourceType === "HW" && !(c._input?.resources?.hw?.length)) {
      misfits.push({ type: "HW_GAP", message: "하드웨어 기반이나 관련 자원 보유 근거가 없습니다." });
    }

    // Evidence Confidence
    const srcCount = c.sources?.length || 0;
    const types = new Set((c.sources || []).map((s) => s.evidenceType));
    let evidence = "L0";
    if (srcCount >= 1) evidence = "L1";
    if (srcCount >= 2 && types.size >= 2) evidence = "L2";
    if ([...types].some((t) => ["review", "community", "customer"].includes(t))) evidence = "L3";

    c.signals = {
      problemSignal:   { raw: problemSignal, band: bandOf(problemSignal) },
      marketGapSignal: { raw: gapMarket, band: bandOf(gapMarket) },
      timingSignal:    { raw: timingSignal, band: bandOf(timingSignal) },
      founderMatch:    { raw: founderMatchRaw, band: bandOf(founderMatchRaw), status: "pending" },
      evidenceConfidence: evidence,
    };
    // 절충안 구조: 밴드와 분리된 미스핏 경고 + 정성 코멘트 자리
    c.founderFit = {
      band: "unknown",          // 회색 표시
      note: "",                 // CALL B가 정성 코멘트로 채움 ("왜 나와 맞는지")
      misfits,                  // 근거 확실한 실행가능성 경고만
      hasMisfit: misfits.length > 0,
    };
    return c;
  },

  // 6-5. Soft Filter (감점)
  softPenalty(c) {
    const P = WEIGHT_CONFIG.softPenalty;
    let pen = 0;
    if ((c.switchingFriction?.length || 0) >= 4) pen += P.highSwitching;
    if (c.resourceBurden === "high") pen += P.highResourceBurden;
    // Founder Match 밴드는 UNKNOWN이므로 밴드 대신 '근거 확실한 하드 미스핏'만 감점
    if (c.founderFit?.hasMisfit) pen += P.lowFounderFit * (c.founderFit.misfits.length);
    if (c._persistence === "TEMPORARY") pen += P.weakWhyNow;
    const allUnknown = ["problemSignal", "marketGapSignal", "timingSignal"]
      .every((k) => c.signals[k].raw == null);
    if (allUnknown) pen += P.allUnknown;
    c._softPenalty = pen;
    return c;
  },

  // 6-6. Rank (compositeOrder): Problem→Gap→Timing, 동점 softPenalty↓, Evidence↑
  rank(list) {
    const evOrder = { L3: 3, L2: 2, L1: 1, L0: 0 };
    const val = (s) => (s?.raw ?? -1);
    return list.slice().sort((a, b) => {
      return (
        val(b.signals.problemSignal) - val(a.signals.problemSignal) ||
        val(b.signals.marketGapSignal) - val(a.signals.marketGapSignal) ||
        val(b.signals.timingSignal) - val(a.signals.timingSignal) ||
        (a._softPenalty || 0) - (b._softPenalty || 0) ||
        (evOrder[b.signals.evidenceConfidence] - evOrder[a.signals.evidenceConfidence])
      );
    }).slice(0, FILTER_CONFIG.rankTarget);
  },

  // 6-7. Diversity → TOP 5 (2축 이상 상이)
  diversitySelect(list) {
    const axes = (c) => [
      c.customer?.type, c.problem?.types?.[0],
      c.solution?.solutionType, c.solution?.resourceType, c.buyer || "?",
    ];
    const distinct = (c, set) =>
      set.every((s) => {
        const a = axes(c), b = axes(s);
        const diff = a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
        return diff >= FILTER_CONFIG.diversityMinAxes;
      });
    const picked = list.length ? [list[0]] : [];
    for (const c of list.slice(1)) {
      if (picked.length >= FILTER_CONFIG.finalTop) break;
      if (distinct(c, picked)) picked.push(c);
    }
    // 부족 시 최고점 순 보충
    for (const c of list) {
      if (picked.length >= FILTER_CONFIG.finalTop) break;
      if (!picked.includes(c)) picked.push(c);
    }
    return picked.slice(0, FILTER_CONFIG.finalTop);
  },

  // 6-8. Premortem (치명결함 표시 — 배치 후 가드에서 사용)
  premortem(c) {
    const flags = [];
    if (!c.problem.types?.length) flags.push("ProblemWrong");
    if (!c.customer?.roles?.user) flags.push("CustomerWrong");
    if (c._persistence === "TEMPORARY") flags.push("FalseTrend");
    if (c.signals.evidenceConfidence === "L0") flags.push("PoorEvidence");
    if ((c.switchingFriction?.length || 0) >= 5) flags.push("HighSwitchingCost");
    c._premortem = { flags, fatal: flags.includes("ProblemWrong") || flags.includes("CustomerWrong") };
    return c;
  },

  // 6-9. Post-guard (실패모드 차단)
  postGuard(top5) {
    const solTypes = new Set(top5.map((c) => c.solution?.solutionType));
    // 전부 동일 solutionType이면 다양성 실패 → 경고 플래그(호출측에서 재구성 가능)
    return { ok: solTypes.size > 1, solTypeVariety: solTypes.size };
  },
};

// ------------------------------------------------------------
// 7. CALL B — Candidate Description (서술만)
// ------------------------------------------------------------
const SYSTEM_B = `당신은 K-ITEM FINDER의 후보 서술 엔진이다.
전달된 후보(top5)의 16개 항목을 한국어로 서술하고 explainPath를 5~8단계로 구성한다.

[절대 금지]
- signals(점수), founderMatch, 시장 수치를 변경하거나 새로 생성하지 않는다.
- 근거 없는 시장규모/가격/투자금 등 수치를 만들지 않는다. 필요하면 "확인 필요"로 표기.

[Founder Match 서술 규칙]
- narrative.founderMatchReason 은 '점수'가 아니라 정성 코멘트다.
- "높음/보통/80점" 같은 등급·수치 표현을 쓰지 말 것.
- 사용자의 경험·자원이 이 후보의 어느 지점(고객접근/신뢰/실행)에 유리 또는 불리할 수 있는지
  1~2문장으로만 서술한다. 단정하지 말고 "~할 수 있습니다" 형태로 쓴다.

[출력]
- 오직 Strict JSON 하나만. 마크다운·설명 금지.
- 응답의 첫 글자는 반드시 { 이고 마지막 글자는 반드시 } 여야 한다. 어떤 서두도 붙이지 마라.`;

function buildUserB(top5, userProfile) {
  const skeleton = top5.map((c) => ({
    opportunityId: c.opportunityId,
    customer: c.customer, context: c.context, problem: c.problem,
    emotions: c.emotions, motives: c.motives, currentAlternative: c.currentAlternative,
    marketGap: c.marketGap, whyNow: c.whyNow, solution: c.solution,
    underserved: c.underserved, buyer: c.buyer,
  }));
  return `사용자 프로필: ${JSON.stringify(userProfile)}

다음 후보들을 서술하라:
${JSON.stringify(skeleton, null, 2)}

응답 스키마(오직 JSON):
{
  "candidates": [{
    "opportunityId": "동일 ID",
    "narrative": {
      "name":"", "who":"", "context":"", "problem":"", "emotionMotive":"",
      "currentWorkaround":"", "whatsBroken":"", "marketGap":"", "whyNow":"",
      "solutionConcept":"", "resourceType":"", "buyer":"", "channel":"",
      "founderMatchReason":"", "unknowns":""
    },
    "explainPath": ["단계1","단계2","...(5~8개)"]
  }],
  "comparisonNotes": ["비교 코멘트"]
}`;
}

// explain 필드만 화이트리스트 병합 (점수/신호 보호)
function mergeExplainOnly(top5, described) {
  const map = {};
  for (const d of described?.candidates || []) map[d.opportunityId] = d;
  return top5.map((c) => {
    const d = map[c.opportunityId];
    if (!d) return c;
    return {
      ...c,
      title: d.narrative?.name || c.title,
      narrative: d.narrative || null,
      explainPath: Array.isArray(d.explainPath) ? d.explainPath.slice(0, 8) : [],
      solution: { ...c.solution, concept: d.narrative?.solutionConcept || c.solution.concept },
      channel: d.narrative?.channel || c.channel,
      // Founder Match: 밴드(unknown)·misfits(근거)는 서버값 보존, 정성 코멘트만 서술로 채움
      founderFit: { ...c.founderFit, note: d.narrative?.founderMatchReason || c.founderFit.note },
      // signals, founderMatch(raw) 는 절대 덮어쓰지 않음
    };
  });
}

// ------------------------------------------------------------
// 8. HALLUCINATION SWEEP (출처 없는 수치 → "unknown")
// ------------------------------------------------------------
function sweepNumbers(obj) {
  if (Array.isArray(obj)) return obj.map(sweepNumbers);
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      if (HALLUCINATION_GUARDED_NUMERIC.includes(k)) {
        const hasSource = Array.isArray(obj.sources) && obj.sources.length > 0;
        if (!hasSource) obj[k] = "unknown";
      } else {
        obj[k] = sweepNumbers(obj[k]);
      }
    }
  }
  return obj;
}

// ------------------------------------------------------------
// 9. COMPARISON MATRIX & EXEC SUMMARY
// ------------------------------------------------------------
function buildComparison(top5) {
  const rows = top5.map((c) => ({
    id: c.opportunityId,
    title: c.title,
    problem: c.signals.problemSignal.band,
    marketGap: c.signals.marketGapSignal.band,
    whyNow: c.signals.timingSignal.band,
    founderMatch: c.signals.founderMatch.band,        // "unknown" (회색)
    founderFitStatus: c.founderFit?.hasMisfit ? "misfit" : "pending", // 절충안 상태
    founderFitNote: c.founderFit?.note || "",
    accessibility: c.marketAccessibility.reachability,
    resourceBurden: c.resourceBurden,
    techReadiness: c.technologyReadiness,
    evidence: c.signals.evidenceConfidence,
  }));
  // 강점 배지 (단일 1등 강요 금지 — 축별 최고).
  // 동점 시 아직 배지를 못 받은 후보를 우선 선택해 비교표 정보성을 살린다.
  const order = { veryHigh: 5, high: 4, medium: 3, low: 2, veryLow: 1, unknown: 0 };
  const awarded = new Set();
  const badge = (key, rawPath, bandPath) => {
    // 1순위: 밴드 최고값, 2순위: 미수상 후보, 3순위: raw 높은 순
    const ranked = top5.slice().sort((a, b) => {
      const bv = (order[bandPath(b)] ?? 0) - (order[bandPath(a)] ?? 0);
      if (bv !== 0) return bv;
      const aw = (awarded.has(a.opportunityId) ? 1 : 0) - (awarded.has(b.opportunityId) ? 1 : 0);
      if (aw !== 0) return aw;
      return (rawPath(b) ?? -1) - (rawPath(a) ?? -1);
    });
    const pick = ranked[0];
    if (pick && (order[bandPath(pick)] ?? 0) > 0) awarded.add(pick.opportunityId);
    return { key, opportunityId: (order[bandPath(pick)] ?? 0) > 0 ? pick.opportunityId : null };
  };
  const burdenRank = { low: 1, medium: 2, high: 3 };
  const badges = [
    badge("가장 문제가 강함", (c) => c.signals.problemSignal.raw, (c) => c.signals.problemSignal.band),
    badge("가장 시장공백이 큼", (c) => c.signals.marketGapSignal.raw, (c) => c.signals.marketGapSignal.band),
    badge("가장 타이밍이 좋음", (c) => c.signals.timingSignal.raw, (c) => c.signals.timingSignal.band),
    // Founder Match 밴드는 UNKNOWN이므로, 실행 걸림돌(미스핏)이 없는 후보를 "무리 없이 시작 가능"으로 표기.
    // 전부 미스핏이 있으면 null(미표시) — 거짓 배지 방지.
    (() => {
      const clean = top5.filter((c) => !c.founderFit?.hasMisfit);
      const pick = clean[0];
      if (pick) awarded.add(pick.opportunityId);
      return { key: "실행 걸림돌 없음", opportunityId: pick ? pick.opportunityId : null };
    })(),
    { key: "가장 저비용 시작", opportunityId:
      top5.slice().sort((a, b) => (burdenRank[a.resourceBurden] || 2) - (burdenRank[b.resourceBurden] || 2))[0]?.opportunityId },
  ];
  return { rows, badges };
}

function buildSummary(top5) {
  return {
    generatedCount: top5.length,
    disclaimer: "사업 성공 가능성 순위가 아니라, 추가 검토 가치가 있는 후보입니다.",
    highlights: buildComparison(top5).badges,
  };
}

// ------------------------------------------------------------
// 10. ORCHESTRATION
// ------------------------------------------------------------
async function orchestrate(input) {
  // STAGE 1: CALL A
  const rawA = await providers.claude.call({
    system: SYSTEM_A, user: buildUserA(input), maxTokens: API_CONFIG.maxTokensA,
  });
  let A = safeParse(rawA);
  if (!A || !A.customer) {
    const err = new Error("PARSE_A_FAILED");
    err.raw = String(rawA).slice(0, 500); // 디버그용 원본 일부
    throw err;
  }
  A = sweepNumbers(A);

  // STAGE 2~3: 후보 생성
  let candidates = generateCandidates(A, input);
  if (candidates.length < 1) throw new Error("NO_CANDIDATES");

  // STAGE 4~6: 필터 → dedup → cluster
  candidates = RuleEngine.hardFilter(candidates);
  candidates = RuleEngine.dedup(candidates);
  let pool = RuleEngine.cluster(candidates);

  // [확장지점] 외부 데이터 보강 (현재 no-op)
  pool = await providers.external.enrich(pool);

  // STAGE 7~8: score + softPenalty
  pool = pool.map((c) => RuleEngine.softPenalty(RuleEngine.score(c)));

  // STAGE 9~10: rank → diversity → TOP5
  const top10 = RuleEngine.rank(pool);
  let top5 = RuleEngine.diversitySelect(top10);

  // STAGE 11: premortem + post-guard
  top5 = top5.map((c) => RuleEngine.premortem(c));
  const guard = RuleEngine.postGuard(top5);
  if (!guard.ok && top10.length > 5) {
    // 다양성 실패 시 offender 제외하고 1회 재구성
    const offenderType = top5[top5.length - 1]?.solution?.solutionType;
    const alt = top10.filter((c) => c.solution?.solutionType !== offenderType);
    if (alt.length >= 3) top5 = RuleEngine.diversitySelect(alt).map((c) => RuleEngine.premortem(c));
  }

  // STAGE 12: CALL B (서술)
  let described = null;
  try {
    const rawB = await providers.claude.call({
      system: SYSTEM_B, user: buildUserB(top5, input), maxTokens: API_CONFIG.maxTokensB,
    });
    described = safeParse(rawB);
    described = sweepNumbers(described);
  } catch { /* 서술 실패해도 신호/구조는 유효 → fallback */ }

  const merged = described ? mergeExplainOnly(top5, described) : top5;

  // 내부 필드(_) 제거 후 반환
  const clean = merged.map(({ _seed, _persistence, _softPenalty, _premortem, _input, ...rest }) => rest);

  return {
    meta: { ...APP_META, sessionId: input.__sessionId || null },
    top5: clean,
    comparison: buildComparison(clean),
    summary: buildSummary(clean),
    comparisonNotes: described?.comparisonNotes || [],
  };
}

// ------------------------------------------------------------
// 11. HANDLER
// ------------------------------------------------------------
export default async (req) => {
  // Netlify (v2, Web API Request/Response)
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }});

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405 });
  }

  let payload;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "BAD_JSON" }), { status: 400 }); }

  const { action, input, meta } = payload || {};

  // ── Health Check (LLM 호출 없이 API 키 설정 여부만 반환) ──
  if (action === "health") {
    const ready = !!process.env.ANTHROPIC_API_KEY;
    return new Response(JSON.stringify({
      status: ready ? "ready" : "no_key",
      ready,
      model: ready ? API_CONFIG.model : null,
      version: APP_META.appVersion,
    }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (action !== "discover" || !input) {
    return new Response(JSON.stringify({ error: "INVALID_ACTION" }), { status: 400 });
  }

  try {
    input.__sessionId = meta?.sessionId || null;
    const result = await orchestrate(input);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = String(e.message || e);
    console.error("[orchestrate error]", msg, e.raw ? "| raw: " + e.raw : "");
    const code =
      msg.includes("MISSING_API_KEY") ? "MISSING_API_KEY" :
      msg.startsWith("PARSE_") ? "AI_PARSE_ERROR" :
      msg.startsWith("LLM_HTTP") ? "AI_UPSTREAM_ERROR" :
      msg.includes("NO_CANDIDATES") ? "NO_CANDIDATES" :
      "DISCOVERY_ERROR";
    const debug = process.env.KIF_DEBUG === "1";
    return new Response(JSON.stringify({
      error: code,
      message: "사업기회 탐색 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      detail: debug ? msg : undefined,
      raw: debug && e.raw ? e.raw : undefined,
    }), { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
};
