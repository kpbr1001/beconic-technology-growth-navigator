// ============================================================
// K-ITEM FINDER — 서버 잠금(공용)  v0.5.0
//  1) 같은 사이트 출처만(Origin·Sec-Fetch-Site)
//  2) 요청 크기·jobId 형식·입력 항목 화이트리스트(길이 제한) — 프롬프트 주입 표면 축소
//  3) 하루 전체·IP별 탐색 횟수 한도(Netlify Blobs) — AI 비용 보호
// ============================================================
export const MAX_BODY = 12_000;
export const JOB_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

export function settings() {
  const env = (k) => (typeof process !== "undefined" ? process.env[k] : undefined);
  const num = (k, d) => { const n = Number(env(k)); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    dailyLimit: num("KIF_DAILY_LIMIT", 300),   // 하루 전체 탐색 수(1회 ≈ AI 2콜)
    ipLimit: num("KIF_IP_LIMIT", 15),          // IP당 하루 탐색 수
    origins: [env("URL"), env("DEPLOY_PRIME_URL"), env("DEPLOY_URL"), env("KIF_ALLOWED_ORIGIN")].filter(Boolean),
    disabled: env("KIF_DISABLED") === "true",
  };
}

export function checkOrigin(req, extra = []) {
  const origin = req.headers.get("origin");
  if (!origin) return "origin_missing";
  let self = "";
  try { self = new URL(req.url).origin; } catch { /* noop */ }
  const allowed = new Set([self, ...extra].map((u) => { try { return new URL(u).origin; } catch { return ""; } }).filter(Boolean));
  if (!allowed.has(origin)) return "origin_foreign";
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs && sfs !== "same-origin") return "cross_site";
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("application/json")) return "content_type";
  return null;
}

// ---- 입력 정규화: 화면이 보내는 항목만, 길이 제한, 제어문자 제거 ----
const SENT = ["__UNKNOWN__", "__NONE__", "__AI_FIND__", "__ANY__"];
const cleanStr = (v, max) => {
  if (v == null) return "";
  const s = String(v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/\s{3,}/g, "  ").trim();
  return s.slice(0, max);
};
const cleanList = (a, n, max) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => cleanStr(x, max)).filter(Boolean);
const oneOf = (v, list, d = "") => (list.includes(v) ? v : d);

export const FIELD_KEYS = ["mfg", "it", "knowledge", "edu", "health", "food", "commerce", "local", "content", "green",
  "agri", "travel", "care", "pet", "finance", "mobility", "construction", "public"];
export const USER_TYPES = ["예비창업자", "창업자", "기존기업", "소상공인", "스타트업", "중소기업", "신사업 담당자", "컨설턴트"];
// 초기 투자 가능 범위(만원 단위 상한). v0.7.0 9단계 + 예전 4단계 값도 받는다(이전 세션·기록 호환)
export const BUDGET_MAX = {
  "under300만": 300, "300_1000만": 1000, "1000_3000만": 3000, "3000_5000만": 5000, "5000만_1억": 10000,
  "1억_3억": 30000, "3억_5억": 50000, "5억이상": 99999, "undecided": null,
  "under1000만": 1000, "1000_5000만": 5000, "1억이상": 30000,
};
export const BUDGETS = Object.keys(BUDGET_MAX);
// 선호 사업형태(최대 2개) — 화면 FORM_OPTIONS 와 같은 키
export const FORM_KEYS = ["software", "platform", "service", "edu", "product", "hardware", "subscription", "store", "community"];
const LEGACY_FORM = { "SaaS/앱": "software", "서비스": "service", "마켓플레이스": "platform", "교육/콘텐츠": "edu", "제품": "product" };
export const CUSTOMER_TYPES = ["B2B", "B2C", "B2G", "__ANY__"];

export function normalizeInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const keepSent = (v, max) => (SENT.includes(v) ? v : cleanStr(v, max));
  const r = raw.resources && typeof raw.resources === "object" ? raw.resources : {};
  const input = {
    userType: oneOf(raw.userType, USER_TYPES, ""),
    experience: cleanStr(raw.experience, 400),
    budget: oneOf(raw.budget, BUDGETS, ""),
    fields: (Array.isArray(raw.fields) ? raw.fields : []).filter((f) => FIELD_KEYS.includes(f)).slice(0, 3),
    fieldOther: cleanStr(raw.fieldOther, 40),
    customerType: oneOf(raw.customerType, CUSTOMER_TYPES, "__ANY__"),
    industry: keepSent(raw.industry, 200) || "__UNKNOWN__",
    knownCustomer: keepSent(raw.knownCustomer, 120) || "__NONE__",
    knownProblem: keepSent(raw.knownProblem, 400) || "__AI_FIND__",
    resources: { hw: cleanList(r.hw, 8, 40), sw: cleanList(r.sw, 8, 40), human: cleanList(r.human, 8, 40) },
    region: keepSent(raw.region, 60) || "__ANY__",
    targetAge: keepSent(raw.targetAge, 60) || "__ANY__",
    // '다른 방향으로 다시 찾기': 이전 결과의 아이템 이름·문제(최대 15개)
    exclude: cleanList(raw.exclude, 15, 60),
    preferredForms: [...new Set([...(Array.isArray(raw.preferredForms) ? raw.preferredForms : []), LEGACY_FORM[raw.preferredForm]]
      .filter((f) => FORM_KEYS.includes(f)))].slice(0, 2),
  };
  if (!input.userType || !input.budget) return null; // 화면 1단계 필수값
  return input;
}

const ipKeyOf = (ip) => String(ip || "").replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45) || "unknown";
export const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export async function takeQuota(store, { ip, dailyLimit, ipLimit }) {
  const day = today();
  let u;
  try { u = (await store.get(day, { type: "json" })) || { total: 0, ip: {} }; }
  catch { return null; } // 저장소 장애 시 서비스는 계속(한도 확인만 건너뜀)
  u.ip = u.ip || {};
  const k = ipKeyOf(ip);
  if ((u.total || 0) >= dailyLimit) return { reason: "daily_limit", message: "오늘의 탐색 한도에 도달했어요. 내일 다시 시도해 주세요." };
  if ((u.ip[k] || 0) >= ipLimit) return { reason: "ip_limit", message: `이 네트워크의 오늘 탐색 횟수(${ipLimit}회)를 모두 썼어요. 내일 다시 시도해 주세요.` };
  u.total = (u.total || 0) + 1; u.ip[k] = (u.ip[k] || 0) + 1;
  try { await store.setJSON(day, u); } catch { /* noop */ }
  return null;
}

export function logBlocked(where, reason, req) {
  const origin = (req.headers.get("origin") || "-").slice(0, 80);
  console.warn(`kif-blocked ${where} reason=${reason} origin=${origin}`);
}
