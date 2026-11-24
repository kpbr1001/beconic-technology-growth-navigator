// ============================================================
// K-ITEM FINDER — 네이버 검색(지식iN·블로그·뉴스) + 쇼핑인사이트 연동 (NAVER API HUB)  v0.9.0
// 가이드(대표 제공 PDF): GET /search/v1/{kin|blog|news}?query=&display=&sort=date
//                      POST /shopping/v1/categories (category:[{name,param:[id]}])
// 인증: 데이터랩과 같은 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
// 원칙: 문제당 3회(지식iN·블로그·뉴스) · 7일 재사용 · 하루 한도 80%(20,000)에서 중단 · 실패는 조용히 건너뜀
//       결과는 '사람들이 이 문제를 이야기하는가'의 근거일 뿐, 수요·시장규모가 아님
// ============================================================
import { datalabReady, periodRange } from "./_datalab.mjs";

export const SEARCH = {
  base: "https://naverapihub.apigw.ntruss.com",
  timeoutMs: 6000,
  cacheDays: 7,
  dailyLimitDefault: 20000,   // 검색 API 하루 25,000의 80%
  recentDays: 90,
  // '의미 있는 신호' 기준 — 검색어 핵심 단어가 모두 들어간(관련) 결과만 센다
  min: { kinRelevant: 5, blogRecent: 10, newsRecent: 3 },
  kinDisplay: 20,
};
// 네이버쇼핑 대분류(쇼핑인사이트 category param)
export const SHOP_CATS = {
  "50000000": "패션의류", "50000001": "패션잡화", "50000002": "화장품/미용", "50000003": "디지털/가전",
  "50000004": "가구/인테리어", "50000005": "출산/육아", "50000006": "식품", "50000007": "스포츠/레저",
  "50000008": "생활/건강", "50000009": "여가/생활편의", "50000011": "도서",
};

const env = (k) => (typeof process !== "undefined" ? process.env[k] : undefined);
const headers = () => ({ "X-NCP-APIGW-API-KEY-ID": env("NAVER_HUB_KEY_ID"), "X-NCP-APIGW-API-KEY": env("NAVER_HUB_KEY_SECRET") });
const stripTags = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").trim();
const safeUrl = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? String(u) : "");

async function withTimeout(f, url, opt) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), SEARCH.timeoutMs);
  try { return await f(url, { ...opt, signal: ctrl.signal }); } finally { clearTimeout(t); }
}
const daysAgo = (d, now) => (now - d) / 864e5;
// 관련도: 검색어의 2자 이상 단어가 제목+요약에 모두 들어가야 '관련'으로 본다(띄어쓰기 무시)
export function tokensOf(q) { return String(q || "").split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}]/gu, "")).filter((x) => x.length >= 2).slice(0, 4); }
// 제목+요약에 모든 단어가 있고, 제목에도 절반 이상이 있어야 관련(요약에만 흩어진 경우 제외)
export function isRelevant(item, tokens) {
  if (!tokens.length) return false;
  const norm = (s) => stripTags(s).replace(/\s+/g, "").toLowerCase();
  const title = norm(item?.title || ""), text = title + norm(item?.description || "");
  const inTitle = tokens.filter((t) => title.includes(t.toLowerCase())).length;
  return tokens.every((t) => text.includes(t.toLowerCase())) && inTitle >= Math.ceil(tokens.length / 2);
}
// blog postdate "20261120", news pubDate "Mon, 23 Nov 2026 10:00:00 +0900"
const parseBlogDate = (s) => { const m = String(s || "").match(/^(\d{4})(\d{2})(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const parseNewsDate = (s) => { const t = Date.parse(String(s || "")); return isFinite(t) ? t : NaN; };

/** 한 검색어에 대해 지식iN·블로그·뉴스 3회 */
export async function searchOne(query, deps = {}) {
  const f = deps.fetch || fetch; const now = deps.now ? +deps.now : Date.now();
  const q = encodeURIComponent(query);
  const get = async (svc, extra) => {
    try {
      const r = await withTimeout(f, `${SEARCH.base}/search/v1/${svc}?query=${q}${extra}`, { method: "GET", headers: headers() });
      if (!r.ok) return { err: "http_" + r.status };
      return await r.json();
    } catch (e) { return { err: "error" }; }
  };
  const tokens = tokensOf(query);
  const [kin, blog, news] = await Promise.all([
    get("kin", `&display=${SEARCH.kinDisplay}&sort=sim&format=json`),
    get("blog", "&display=100&sort=date&format=json"),
    get("news", "&display=100&sort=date&format=json"),
  ]);
  const out = { query, calls: 3 };
  if (!kin.err) {
    const items = kin.items || [];
    const rel = items.filter((it) => isRelevant(it, tokens));
    out.kin = {
      total: Number(kin.total) || 0, sampled: items.length, relevant: rel.length,
      samples: rel.slice(0, 3).map((it) => ({ title: stripTags(it.title).slice(0, 80), link: safeUrl(it.link) })).filter((x) => x.title),
    };
  }
  if (!blog.err) {
    const items = blog.items || [];
    const ds = items.filter((it) => isRelevant(it, tokens)).map((it) => parseBlogDate(it.postdate)).filter(isFinite);
    out.blog = { total: Number(blog.total) || 0, recent: ds.filter((d) => daysAgo(d, now) <= SEARCH.recentDays).length, relevant: ds.length, sampled: items.length };
  }
  if (!news.err) {
    const items = (news.items || []).filter((it) => isRelevant(it, tokens)).map((it) => ({ t: parseNewsDate(it.pubDate), title: stripTags(it.title).slice(0, 80), link: safeUrl(it.link || it.originallink) }));
    out.news = { total: Number(news.total) || 0, relevant: items.length, recent: items.filter((x) => isFinite(x.t) && daysAgo(x.t, now) <= SEARCH.recentDays).length,
      sampled: items.length, latest: items.filter((x) => isFinite(x.t)).slice(0, 2).map((x) => ({ title: x.title, link: x.link, date: new Date(x.t).toISOString().slice(0, 10) })) };
  }
  return out;
}

/** groups: [{key, query}] (최대 5) → { data:{[key]:signals}, meta } */
export async function fetchSearchSignals(groups, deps = {}) {
  const meta = { calls: 0, cached: 0, skipped: null };
  if (!datalabReady()) { meta.skipped = "no_key"; return { data: {}, meta }; }
  const store = deps.store || null;
  const day = new Date().toISOString().slice(0, 10);
  const limit = Number(env("KIF_SEARCH_DAILY_LIMIT")) > 0 ? Number(env("KIF_SEARCH_DAILY_LIMIT")) : SEARCH.dailyLimitDefault;
  let used = 0;
  if (store) { try { used = (await store.get("susage_" + day, { type: "json" }))?.n || 0; } catch { /* noop */ } }
  const data = {};
  const g = groups.filter((x) => x.query && String(x.query).length >= 2).slice(0, 5);
  await Promise.all(g.map(async (x) => {
    const ck = "s_" + encodeURIComponent(x.query).slice(0, 200);
    if (store) { try { const hit = await store.get(ck, { type: "json" }); if (hit && Date.now() - hit.ts < SEARCH.cacheDays * 864e5) { data[x.key] = hit.v; meta.cached++; return; } } catch { /* noop */ } }
    if (used + meta.calls + 3 > limit) { meta.skipped = "daily_limit"; return; }
    meta.calls += 3;
    const v = await searchOne(x.query, deps);
    if (v.kin || v.blog || v.news) { data[x.key] = v; if (store) { try { await store.setJSON(ck, { ts: Date.now(), v }); } catch { /* noop */ } } }
  }));
  if (store && meta.calls) { try { await store.setJSON("susage_" + day, { n: used + meta.calls }); } catch { /* noop */ } }
  return { data, meta };
}

/** 쇼핑인사이트: 대분류 최대 3개, 3년 월간 → { [catId]: {yoy, name} } */
export async function fetchShopping(catIds, deps = {}) {
  const ids = [...new Set(catIds.filter((c) => SHOP_CATS[c]))].slice(0, 3);
  if (!datalabReady() || !ids.length) return {};
  const f = deps.fetch || fetch;
  const range = periodRange(deps.now);
  try {
    const r = await withTimeout(f, `${SEARCH.base}/shopping/v1/categories`, {
      method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...range, timeUnit: "month", category: ids.map((id) => ({ name: SHOP_CATS[id], param: [id] })) }),
    });
    if (!r.ok) return {};
    const j = await r.json();
    const out = {};
    (j.results || []).forEach((res, i) => {
      const v = (res.data || []).map((d) => Number(d.ratio) || 0);
      if (v.length < 24) return;
      const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);
      const prev = mean(v.slice(-24, -12)); if (prev <= 0) return;
      out[ids[i]] = { name: SHOP_CATS[ids[i]], yoy: Math.round((mean(v.slice(-12)) / prev - 1) * 1000) / 1000 };
    });
    return out;
  } catch { return {}; }
}

/** 신호 → 의미 있는 근거 종류 목록 */
export function meaningfulTypes(sig) {
  const t = [];
  if (!sig) return t;
  if (sig.kin && sig.kin.relevant >= SEARCH.min.kinRelevant) t.push("qna");
  if (sig.blog && sig.blog.recent >= SEARCH.min.blogRecent) t.push("blog");
  if (sig.news && sig.news.recent >= SEARCH.min.newsRecent) t.push("news");
  return t;
}
