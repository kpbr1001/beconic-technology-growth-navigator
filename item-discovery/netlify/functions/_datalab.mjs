// ============================================================
// K-ITEM FINDER — 네이버 데이터랩 검색어트렌드 연동 (NAVER API HUB)  v0.8.0
// 가이드: Legacy API > Application Services > NAVER API HUB > 검색어 트렌드
//   POST https://naverapihub.apigw.ntruss.com/search-trend/v1/search
//   헤더 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
// 원칙
//   · 탐색 1건 = 호출 1회(문제 5개를 주제어 그룹 5개로 한 번에)
//   · 같은 검색어 묶음은 7일 재사용(Blobs) · 월 사용량 80%(기본 24,000)에서 자동 중단
//   · 실패·시간초과·데이터 부족이면 조용히 건너뜀 → 근거 수준 L0 유지(감점 없음)
//   · 값은 '상대 검색 관심도'일 뿐 구매 수요·시장규모가 아님 — 화면에도 그렇게 표시
// 환경변수: NAVER_HUB_KEY_ID, NAVER_HUB_KEY_SECRET (선택: KIF_DATALAB_MONTHLY_LIMIT, KIF_DATALAB_OFF=true)
// ============================================================
export const DATALAB = {
  endpoint: "https://naverapihub.apigw.ntruss.com/search-trend/v1/search",
  timeoutMs: 6000,
  months: 36,                // 3년 월간
  cacheDays: 7,
  monthlyLimitDefault: 24000, // 무료 30,000의 80%
  minMeanRatio: 0.5,         // 평균 상대값이 이보다 작으면 '데이터 부족'(검색량 거의 없음)
};

const env = (k) => (typeof process !== "undefined" ? process.env[k] : undefined);
export const datalabReady = () => !!(env("NAVER_HUB_KEY_ID") && env("NAVER_HUB_KEY_SECRET")) && env("KIF_DATALAB_OFF") !== "true";

const ymd = (d) => d.toISOString().slice(0, 10);
export function periodRange(now = new Date()) {
  // 지난달 말일까지(이번 달은 미완성이라 제외), 36개월
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - DATALAB.months + 1, 1));
  return { startDate: ymd(start), endDate: ymd(end) };
}

// 검색어 정리: 2~20자, 특수문자 제거, 그룹당 최대 5개
export function cleanKeywords(list) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((k) => String(k || "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim())
    .filter((k) => k.length >= 2 && k.length <= 20))].slice(0, 5);
}

// 시계열 → 지표. ratio 는 호출 내 최대값=100 상대값이므로 같은 그룹 안의 변화율만 의미가 있다.
// 네이버는 검색량이 0인 달을 빼고 돌려줄 수 있다 → 기간의 모든 달을 만들고 빈 달은 0으로 채운다
export function fillMonths(series, range) {
  const arr = Array.isArray(series) ? series : [];
  if (!range) return arr.map((d) => Number(d?.ratio) || 0);
  const map = new Map(arr.map((d) => [String(d?.period || "").slice(0, 7), Number(d?.ratio) || 0]));
  const out = []; const [y0, m0] = range.startDate.split("-").map(Number); const [y1, m1] = range.endDate.split("-").map(Number);
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, m = 1) : m++) out.push(map.get(`${y}-${String(m).padStart(2, "0")}`) ?? 0);
  return out;
}
export function trendMetrics(series, range) {
  const v = fillMonths(series, range);
  if (v.length < 24) return null;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);
  const last12 = v.slice(-12), prev12 = v.slice(-24, -12);
  const m = mean(v);
  if (m < DATALAB.minMeanRatio || mean(prev12) <= 0) return { insufficient: true, mean: round1(m) };
  const yoy = mean(last12) / mean(prev12) - 1;               // 최근 12개월 vs 그 전 12개월
  const recent = mean(v.slice(-3)) / Math.max(mean(v.slice(-6, -3)), 0.0001) - 1; // 최근 3개월 vs 직전 3개월
  // 규칙(0~100): 전년 대비 증감 → 타이밍 점수
  const score = yoy >= 0.3 ? 90 : yoy >= 0.1 ? 75 : yoy >= -0.05 ? 55 : yoy >= -0.2 ? 35 : 20;
  return { yoy: round3(yoy), recent: round3(recent), score, mean: round1(m), spark: v.slice(-24).map(round1) };
}
const round1 = (x) => Math.round(x * 10) / 10;
const round3 = (x) => Math.round(x * 1000) / 1000;

async function hashKey(s) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return String(s).length + "_" + Buffer.from(s).toString("base64").slice(0, 40).replace(/[^A-Za-z0-9]/g, ""); }
}

/**
 * groups: [{ key, keywords[] }] 최대 5개 → { [key]: metrics|{insufficient} } (실패 시 {})
 * deps: { fetch, store(Blobs: get/setJSON) } — 테스트에서 주입
 */
export async function fetchTrends(groups, deps = {}) {
  const meta = { called: false, cached: false, skipped: null };
  if (!datalabReady()) { meta.skipped = "no_key"; return { data: {}, meta }; }
  const g = groups.map((x) => ({ key: String(x.key), keywords: cleanKeywords(x.keywords) })).filter((x) => x.keywords.length).slice(0, 5);
  if (!g.length) { meta.skipped = "no_keywords"; return { data: {}, meta }; }
  const range = periodRange(deps.now);
  const store = deps.store || null;
  const cacheId = "trend_" + (await hashKey(JSON.stringify([range, g.map((x) => x.keywords)])));
  // 1) 캐시
  if (store) {
    try {
      const hit = await store.get(cacheId, { type: "json" });
      if (hit && Date.now() - hit.ts < DATALAB.cacheDays * 864e5) { meta.cached = true; return { data: remap(hit.byIndex, g), meta, fetchedAt: hit.fetchedAt }; }
    } catch { /* noop */ }
  }
  // 2) 월 사용량 보호
  const month = new Date().toISOString().slice(0, 7);
  const limit = Number(env("KIF_DATALAB_MONTHLY_LIMIT")) > 0 ? Number(env("KIF_DATALAB_MONTHLY_LIMIT")) : DATALAB.monthlyLimitDefault;
  let used = 0;
  if (store) { try { used = (await store.get("usage_" + month, { type: "json" }))?.n || 0; } catch { /* noop */ } }
  if (used >= limit) { meta.skipped = "monthly_limit"; return { data: {}, meta }; }
  // 3) 호출
  const f = deps.fetch || fetch;
  const body = { ...range, timeUnit: "month", keywordGroups: g.map((x, i) => ({ groupName: "g" + i, keywords: x.keywords })) };
  let json;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), DATALAB.timeoutMs);
    const res = await f(DATALAB.endpoint, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "X-NCP-APIGW-API-KEY-ID": env("NAVER_HUB_KEY_ID"), "X-NCP-APIGW-API-KEY": env("NAVER_HUB_KEY_SECRET") },
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    meta.called = true;
    if (store) { try { await store.setJSON("usage_" + month, { n: used + 1 }); } catch { /* noop */ } }
    if (!res.ok) { meta.skipped = "http_" + res.status; console.warn("[datalab] http", res.status); return { data: {}, meta }; }
    json = await res.json();
  } catch (e) { meta.skipped = "error"; console.warn("[datalab]", String(e?.message || e).slice(0, 80)); return { data: {}, meta }; }
  const results = Array.isArray(json?.results) ? json.results : [];
  const byIndex = results.map((r) => trendMetrics(r?.data, range));
  const fetchedAt = new Date().toISOString().slice(0, 10);
  if (store) { try { await store.setJSON(cacheId, { ts: Date.now(), fetchedAt, byIndex }); } catch { /* noop */ } }
  return { data: remap(byIndex, g), meta, fetchedAt };
}
function remap(byIndex, g) {
  const out = {};
  g.forEach((x, i) => { if (byIndex[i]) out[x.key] = { ...byIndex[i], keywords: x.keywords }; });
  return out;
}
