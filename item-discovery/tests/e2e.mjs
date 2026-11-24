// K-ITEM FINDER v0.4.0 E2E — node tests/e2e.mjs (item-discovery 폴더에서)
// 정적 서버를 띄우고 /api/* 는 가짜 응답으로 가로챈다(실제 Claude 호출 없음).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  try { const b = await readFile(join(ROOT, p === "/" ? "index.html" : p)); res.writeHead(200, { "content-type": TYPES[extname(p)] || "text/html; charset=utf-8" }); res.end(b); }
  catch { res.writeHead(404); res.end("nf"); }
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

const browser = await chromium.launch();
async function newPage(width = 1280, apiResult) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  page.on("dialog", d => d.dismiss());
  await page.route("**/api/opportunity", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ready: true }) }));
  await page.route("**/api/discover", r => r.fulfill({ status: 202, body: "" }));
  await page.route("**/api/status**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(apiResult ? apiResult() : { status: "pending" }) }));
  await page.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(BASE);
  return { page, errs, ctx };
}

// 실제 응답 흉내: 샘플 구조 + 위험 문자열
async function realLike(page, mutate) {
  return page.evaluate((m) => {
    const R = JSON.parse(JSON.stringify(SAMPLE_RESULT));
    if (m === "xss") {
      R.top5[0].opportunityId = "x');alert(1);//";
      R.top5[1].narrative.name = '<img src=x onerror="window.__xss=1">';
      R.top5[2].narrative.currentWorkaround = "<script>window.__xss=1</script>";
      R.top5[3].signals.problemSignal.band = "<b>bad</b>";
      R._debug = { callB: '<img src=x onerror="window.__xss=1">' };
    }
    return R;
  }, mutate);
}

console.log("1. 샘플 결과 — 보강 섹션 렌더");
{
  const { page, errs, ctx } = await newPage();
  await page.evaluate(() => App.showSample());
  const has = async sel => (await page.locator(sel).count()) > 0;
  ok(await has("#sec-quality"), "결과 신뢰도 패널");
  ok(await has(".method"), "평가 방법 공개");
  ok((await page.locator(".ev-block").count()) === 5, "근거 확인처 카드 5개");
  ok((await page.locator(".plan-block").count()) === 5, "검증 첫 3걸음 5개");
  ok((await page.locator(".pb-qs li").count()) === 15, "인터뷰 질문 15개(후보별 3)");
  ok(await has("#sec-history"), "이전 탐색 비교 패널");
  ok((await page.locator(".np-item").count()) >= 3, "BECONIC 31 다음 진단 3개 이상");
  ok(await page.locator(".np-item").first().getAttribute("href") === "https://beconic-diagnosis-item-pmf.netlify.app/", "첫 다음 진단 = S2 PMF");
  ok(await has(".result-nav"), "결과 목차");
  ok(await has("small.raw"), "신호 계산값 표시");
  ok(/KIF-SAMPLE-/.test(await page.locator(".doc-meta").innerText()), "문서번호(샘플)");
  const allHrefs = await page.$$eval("a[href]", a => a.map(x => x.href));
  ok(!allHrefs.some(h => h.includes("item-jindan-2026")), "깨진 PMF LAB 주소(404) 제거");
  ok((await page.$$eval("a[target=_blank]", a => a.filter(x => !/noopener/.test(x.rel)).length)) === 0, "새 창 링크 모두 noopener");
  // 핸드오프
  await page.evaluate(() => { Result.toggleShort("kif_ops_001"); Result.setPrimary("kif_ops_001"); });
  const opened = [];
  await page.exposeFunction("__open", u => opened.push(u));
  await page.evaluate(() => { window.open = (u) => { window.__open(u); return null; }; Plus.copy = async t => { window.__copied = t; return true; }; });
  await page.evaluate(() => Result.handoff());
  await page.waitForTimeout(900);
  ok(opened[0] === "https://beconic-diagnosis-item-pmf.netlify.app/?from=finder", "검증하기 → S2(입력 데이터 URL 미포함)");
  ok((await page.evaluate(() => window.__copied || "")).includes("퇴직 시니어"), "아이템 요약 클립보드 복사");
  const mail = await page.locator('a[href^="mailto:"]').first().getAttribute("href");
  ok(mail.includes("start%40gven.kr") || mail.startsWith("mailto:start@gven.kr"), "메일 상담 mailto");
  ok(decodeURIComponent(mail).includes("검토하려는 아이템: 퇴직 시니어"), "메일 초안에 선택 아이템");
  // PDF
  const pdf = await page.evaluate(() => { const h = PDFLayout.build(State.result, { org: "테스트", person: "-", purpose: "x", conf: "일반", date: "2026" }); return { n: (h.match(/class="pdf-page/g) || []).length, plan: h.includes("검증 첫 3걸음"), trust: h.includes("평가 방법"), next: h.includes("AI 아이템 진단(PMF)"), lab: h.includes("K-ITEM PMF LAB") }; });
  ok(pdf.plan && pdf.trust && pdf.next, `PDF 부록(검증 계획·평가 방법·다음 진단) · ${pdf.n}쪽`);
  ok(!pdf.lab, "PDF에서 없는 서비스명(K-ITEM PMF LAB) 제거");
  ok(errs.length === 0, "콘솔/페이지 오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("2. 실제 탐색 흐름 + 재탐색 비교");
{
  let call = 0; let R1, R2;
  const { page, errs, ctx } = await newPage(1280, () => ({ status: "done", result: call++ === 0 ? R1 : R2 }));
  R1 = await realLike(page);
  R2 = await realLike(page);
  R2.top5[4].title = R2.top5[4].narrative.name = "반려동물 동반 여행 큐레이션";
  R2.top5[0].signals.problemSignal.band = "veryHigh";
  await page.evaluate(() => { localStorage.clear(); });
  const run = async (inp) => {
    await page.evaluate((inp) => { Object.assign(State.input, inp); State.isSample = false; Discovery._minWait = () => Promise.resolve(); Discovery.poll = async function () { const r = await fetch("/api/status?jobId=x"); return (await r.json()).result; }; Onboarding.submit(); }, inp);
    await page.waitForSelector("#screen-result.active", { timeout: 8000 });
  };
  await run({ userType: "예비창업자", budget: "under1000만", experience: "금융권 20년 영업·기획", knownProblem: "", preferredForm: "SaaS/앱", resources: { hw: [], sw: [], human: ["영업"] } });
  ok(/첫 탐색/.test(await page.locator("#sec-history").innerText()), "첫 탐색 안내");
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem("kif_history")).length)) === 1, "탐색 기록 저장(브라우저)");
  ok((await page.locator(".fc-item.info").count()) >= 1, "입력 조건 점검: 선호 형태 차이 표시");
  ok(!(await page.locator("#sec-next").innerText()).includes("기업성장 종합진단"), "예비창업자에게 G 미추천(31 규칙)");
  const q = await page.locator("#sec-quality").innerText();
  ok(/3 \/ 5|2 \/ 5/.test(q), "입력 충실도 계산 " + (q.match(/\d \/ 5/) || [""])[0]);
  const stored = await page.evaluate(() => localStorage.getItem("kif_history"));
  ok(!stored.includes("금융권"), "기록에 경험 원문 미저장");
  await run({ userType: "중소기업", budget: "1억이상" });
  const h = await page.locator("#sec-history").innerText();
  ok(/유지 4/.test(h) && /새로 등장 1/.test(h) && /빠짐 1/.test(h), "이전 결과 비교: 유지4·신규1·빠짐1");
  ok((await page.locator(".hp-table .band-veryHigh").count()) >= 1, "신호 변화 표시");
  const nx = await page.locator("#sec-next").innerText();
  ok(nx.includes("기업성장 종합진단") && nx.includes("대출·보증 진단"), "기존기업·큰 예산 → G·F2 추천");
  ok(errs.length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("3. 보안 — 악성 결과·오류 메시지·조작 파일");
{
  let R;
  const { page, errs, ctx } = await newPage(1280, () => ({ status: "done", result: R }));
  R = await realLike(page, "xss");
  await page.evaluate(() => { Discovery._minWait = () => Promise.resolve(); Discovery.poll = async function () { const r = await fetch("/api/status?jobId=x"); return (await r.json()).result; }; State.input.userType = "창업자"; State.input.budget = "under1000만"; Onboarding.submit(); });
  await page.waitForSelector("#screen-result.active", { timeout: 8000 });
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => window.__xss)), "AI 결과 문자열 주입 실행 안 됨");
  ok((await page.evaluate(() => State.result.top5[0].opportunityId)) === "opp_1", "위험한 ID 정규화");
  ok((await page.evaluate(() => State.result.top5[3].signals.problemSignal.band)) === "unknown", "허용 밖 밴드 → unknown");
  await page.evaluate(() => Discovery.error('<img src=x onerror="window.__xss2=1">'));
  ok(!(await page.evaluate(() => window.__xss2)), "오류 메시지(AI 원문) 이스케이프");
  await page.evaluate(() => App.show("result"));
  // 조작 파일 불러오기
  const bad = { kind: "K-ITEM-FINDER-RESULT", ts: Date.now() - 864e5, docNo: '"><img src=x onerror=window.__xss3=1>', input: { industry: "<script>window.__xss3=1</script>" }, items: [{ title: '<img src=x onerror="window.__xss3=1">', p: "<b>", g: "high", t: "x", e: "L9" }] };
  await page.setInputFiles(".hp-file input", { name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bad)) });
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => window.__xss3)), "조작된 결과 파일 주입 실행 안 됨");
  ok(/새로 등장|유지/.test(await page.locator("#sec-history").innerText()), "정제된 파일로 비교 표시");
  await page.setInputFiles(".hp-file input", { name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"foo":1}') });
  ok(true, "형식 다른 파일 거부(토스트)");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  ok(/object-src 'none'/.test(csp) && /connect-src 'self'/.test(csp), "CSP 메타(외부 연결 차단)");
  ok(errs.filter(e => !/Content Security Policy|Refused/.test(e)).length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("4. 모바일 390px — 가로 넘침");
{
  const { page, errs, ctx } = await newPage(390);
  await page.evaluate(() => App.showSample());
  await page.evaluate(() => document.querySelectorAll(".opp-card").forEach(c => c.classList.add("open")));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, "가로 넘침 없음 (" + over + "px)");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/mobile.png", fullPage: true });
  ok(errs.length === 0, "오류 0");
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
