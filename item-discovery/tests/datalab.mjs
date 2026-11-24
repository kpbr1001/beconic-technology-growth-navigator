// 네이버 데이터랩 연동 오프라인 검증 — node tests/datalab.mjs (가짜 응답, 실제 호출 없음)
import { fetchTrends, trendMetrics, cleanKeywords, periodRange, DATALAB } from "../netlify/functions/_datalab.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };
const series = (fn) => Array.from({ length: 36 }, (_, i) => ({ period: `p${i}`, ratio: fn(i) }));
const memStore = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, setJSON: async (k, v) => { m.set(k, v); }, _m: m }; };

console.log("1. 지표 계산");
const up = trendMetrics(series((i) => 20 + i * 2));
ok(up.yoy > 0.3 && up.score === 90, "꾸준히 증가 → 전년 대비 +, 점수 90 (" + up.yoy + ")");
const down = trendMetrics(series((i) => 90 - i * 2));
ok(down.yoy < -0.2 && down.score === 20, "꾸준히 감소 → 점수 20");
ok(trendMetrics(series(() => 0.1)).insufficient, "검색량 거의 없음 → 판단 안 함");
ok(trendMetrics([]) === null, "데이터 없음 → null");
ok(cleanKeywords(["방문요양 일지", "<script>", "a", "요양보호사!!", "x".repeat(30), "방문요양 일지"]).join("|") === "방문요양 일지|script|요양보호사", "검색어 정리(특수문자·길이·중복)");
const r = periodRange(new Date(Date.UTC(2026, 10, 24)));
ok(r.endDate === "2026-10-31" && r.startDate === "2023-11-01", "기간: 지난달 말까지 36개월 " + JSON.stringify(r));

console.log("2. 호출·캐시·한도 (가짜 응답)");
process.env.NAVER_HUB_KEY_ID = "test-id"; process.env.NAVER_HUB_KEY_SECRET = "test-secret";
let calls = [];
const day = (n) => { const d = new Date(Date.now() - n * 864e5); return d; };
const fakeSearch = (url) => {
  const svc = url.match(/search\/v1\/(\w+)/)[1];
  if (svc === "kin") return { total: 342, items: [{ title: "<b>방문요양</b> 일지 어떻게 쓰나요?", link: "https://kin.naver.com/qna/1" }, { title: "요양 기록 앱 추천", link: "javascript:alert(1)" }] };
  if (svc === "blog") return { total: 5000, items: Array.from({ length: 100 }, (_, i) => ({ postdate: day(i).toISOString().slice(0, 10).replace(/-/g, "") })) };
  return { total: 120, items: Array.from({ length: 10 }, (_, i) => ({ pubDate: day(i * 20).toUTCString(), title: "<b>요양</b> 기사 " + i, link: "https://n.news.naver.com/" + i })) };
};
const fakeFetch = async (url, opt) => { calls.push({ url, opt });
  if (url.includes("/search/v1/")) return { ok: true, json: async () => fakeSearch(url) };
  if (url.includes("/shopping/v1/")) { const b = JSON.parse(opt.body); return { ok: true, json: async () => ({ results: b.category.map(() => ({ data: series((k) => 40 + k) })) }) }; }
  const b = JSON.parse(opt.body);
  return { ok: true, json: async () => ({ results: b.keywordGroups.map((g, i) => ({ title: g.groupName, keywords: g.keywords, data: series((k) => i === 0 ? 20 + k * 2 : i === 1 ? 90 - k * 2 : 0.1) })) }) }; };
const store = memStore();
const groups = [{ key: "p1", keywords: ["방문요양 일지"] }, { key: "p2", keywords: ["학원 출결"] }, { key: "p3", keywords: ["희귀 검색어"] }];
const a = await fetchTrends(groups, { fetch: fakeFetch, store });
ok(calls.length === 1, "탐색 1건 = 호출 1회(그룹 3개 한 번에)");
ok(calls[0].url === DATALAB.endpoint && calls[0].opt.headers["X-NCP-APIGW-API-KEY-ID"] === "test-id" && calls[0].opt.headers["X-NCP-APIGW-API-KEY"] === "test-secret", "가이드대로 주소·인증 헤더");
const body = JSON.parse(calls[0].opt.body);
ok(body.timeUnit === "month" && body.keywordGroups.length === 3 && body.startDate && body.endDate, "요청 본문 형식");
ok(a.data.p1.score === 90 && a.data.p2.score === 20 && a.data.p3.insufficient, "그룹별 결과 매핑");
const b2 = await fetchTrends(groups, { fetch: fakeFetch, store });
ok(calls.length === 1 && b2.meta.cached, "같은 검색어 7일 재사용(재호출 없음)");
const month = new Date().toISOString().slice(0, 7);
await store.setJSON("usage_" + month, { n: DATALAB.monthlyLimitDefault });
const c = await fetchTrends([{ key: "x", keywords: ["새 검색어"] }], { fetch: fakeFetch, store });
ok(calls.length === 1 && c.meta.skipped === "monthly_limit", "월 한도 80% 도달 → 호출 중단(탐색은 계속)");
const err = await fetchTrends([{ key: "y", keywords: ["오류 검색어"] }], { fetch: async () => ({ ok: false, status: 401 }), store: memStore() });
ok(err.meta.skipped === "http_401" && Object.keys(err.data).length === 0, "인증 실패 → 조용히 건너뜀");
const slow = await fetchTrends([{ key: "z", keywords: ["느린 검색어"] }], { fetch: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted")))), store: memStore() });
ok(slow.meta.skipped === "error", "6초 시간초과 → 건너뜀");
delete process.env.NAVER_HUB_KEY_ID;
const nokey = await fetchTrends(groups, { fetch: fakeFetch });
ok(nokey.meta.skipped === "no_key", "키 없으면 호출 안 함");

console.log("3. 전체 흐름 — 근거 수준·타이밍 반영");
process.env.NAVER_HUB_KEY_ID = "test-id";
const { orchestrate, providers } = await import("../netlify/functions/_core.mjs");
const { normalizeInput } = await import("../netlify/functions/_guard.mjs");
const A = { customer: { type: "B2B", roles: { user: "x" } },
  segments: [{ key: "s1", field: "care", type: "B2B", user: "방문요양센터", buyer: "센터장" }, { key: "s2", field: "edu", type: "B2B", user: "학원 원장", buyer: "원장" }],
  problems: [{ key: "p1", segment: "s1", statement: "요양 기록이 수기라 느리다", searchKeywords: ["방문요양 일지", "요양 기록"], types: ["Time"], severity: 4, frequency: "daily", alternatives: [{ type: "수기", dissatisfaction: ["느림"] }] },
    { key: "p2", segment: "s2", statement: "출결 문자 보내기가 번거롭다", searchKeywords: ["학원 출결"], types: ["Time"], severity: 3, frequency: "daily", alternatives: [{ type: "문자", dissatisfaction: ["번거로움"] }] }],
  gaps: [{ key: "g1", statement: "소형 기관용 자동화", underserved: ["소형"] }],
  whyNow: [{ category: "TECHNOLOGY", signal: "x", trendStrength: "medium", problemPersistence: "STRUCTURAL" }],
  candidateSeeds: [{ customerKey: "s1", problemKey: "p1", gapKey: "g1", field: "care", solutionTypeHint: "SaaS", resourceHint: "SW" }, { customerKey: "s2", problemKey: "p2", gapKey: "g1", field: "edu", solutionTypeHint: "App", resourceHint: "SW" }] };
const origFetch = globalThis.fetch;
globalThis.fetch = fakeFetch; calls = [];
providers.claude.call = async ({ user }) => user.includes("구조화하라") ? JSON.stringify(A) : JSON.stringify({ candidates: [] });
const R = await orchestrate(normalizeInput({ userType: "창업자", budget: "under300만", fields: ["care", "edu"] }));
globalThis.fetch = origFetch;
const c1 = R.top5.find((x) => x.problem.statement.includes("요양"));
const c2 = R.top5.find((x) => x.problem.statement.includes("출결"));
ok(calls.filter((x) => x.url === DATALAB.endpoint).length === 1, "탐색 1건에 데이터랩 1회");
ok(calls.filter((x) => x.url.includes("/search/v1/")).length === 6, "문제 2개 × 지식iN·블로그·뉴스 = 검색 6회");
ok(c1.signals.evidenceConfidence === "L2" && c1.trend && c1.trend.yoy > 0, "검색 추이 + 지식iN·블로그·뉴스 → 근거 L2 (L3는 자동 부여 안 함)");
ok(c1.voice.kin.total === 342 && c1.voice.kin.samples[0].title === "방문요양 일지 어떻게 쓰나요?", "지식iN 질문 수·실제 질문 제목(태그 제거)");
ok(c1.voice.kin.samples[1].link === "", "위험한 링크(javascript:) 제거");
ok(c1.voice.blog.recent >= 90 && c1.voice.news.recent === 5, "최근 90일 블로그·뉴스 건수 (" + c1.voice.blog.recent + "," + c1.voice.news.recent + ")");
ok(c2.trend && c2.signals.timingSignal.raw < c1.signals.timingSignal.raw, "검색이 줄면 타이밍 점수도 낮아짐 (" + c1.signals.timingSignal.raw + " > " + c2.signals.timingSignal.raw + ")");
ok(R.dataSources.datalab === "called", "결과에 데이터 출처 상태");
ok(calls.every((x) => !x.url.includes(encodeURIComponent("창업자")) && !String(x.opt.body || "").includes("창업자")), "네이버로는 검색어만 전송(사용자 입력 원문 미전송)");

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
