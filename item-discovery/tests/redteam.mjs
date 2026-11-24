// 자가부검·레드팀 회귀 — node tests/redteam.mjs (item-discovery 폴더에서)
// 실제 화면을 클릭해 고객 여정을 끝까지 가고, PDF 쪽 넘침·조작 입력·전수 조합을 검사한다.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  try { const b = await readFile(join(ROOT, p === "/" ? "index.html" : p)); res.writeHead(200, { "content-type": TYPES[extname(p === "/" ? "/index.html" : p)] || "text/plain" }); res.end(b); }
  catch { res.writeHead(404); res.end("nf"); }
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };
const browser = await chromium.launch();

// 실제 운영 응답에서 본 '긴 문장' 수준의 결과(대표님 PDF 기준 길이)
const LONG = "기업 대표는 성장 병목을 짚어줄 믿을 만한 진단 전문가를 어디서 어떻게 찾아야 할지 모르고, 기존 컨설팅은 비싸고 결과를 검증하기 어렵다.";
function longResult(page) {
  return page.evaluate((L) => {
    const R = JSON.parse(JSON.stringify(SAMPLE_RESULT));
    R.marketPerspective = "기업진단 시장의 본질은 '분석 능력'이 아니라 '대표가 그 결과를 믿고 행동하게 만드는 신뢰'이며, 그 신뢰를 사람·소프트웨어·교육 중 무엇으로 설계하느냐가 승부를 가른다.";
    R.comparisonInsight = L + " " + L;
    R.top5.forEach((o, i) => {
      const n = o.narrative;
      ["problem", "solutionConcept", "whyNow", "valueProp", "differentiator", "strength", "caution", "sustainability", "founderMatchReason"].forEach(k => n[k] = L);
      n.unknowns = "초기 전문가 풀 확보 방식, 진단 품질 표준화 기준, 수수료 수용도, 경쟁사 현황·진입장벽";
      o.currentAlternative = [{ type: "사람에게 직접 의뢰", dissatisfaction: ["고가", "일반적 조언만 제공", "기술 이해도 낮음", "시간 소모", "객관성 부족", "전문성 결여"] }, { type: "Excel" }, { type: "None" }];
      o.explainPath = ["고객: 성장 정체를 느끼지만 원인을 모르는 기업 대표", "문제: 믿을 전문가 찾기와 비용 검증이 동시에 막힘", "시장 공백: 기존 컨설팅은 비싸고 결과 신뢰가 어려움", "전환점: 투자 전후 객관 진단 요구와 프리랜서 공급 증가", "솔루션: 검증·후기 기반으로 전문가를 저비용 중개", "가치 실현: 적정 비용에 믿을 전문가를 바로 연결"];
      o.founderFit.misfits = [{ message: "초기 자원 부담이 높은 편이라 예산 범위를 확인해야 합니다." }]; o.founderFit.hasMisfit = true;
    });
    return R;
  }, LONG);
}
async function open(width = 1280, accept = false) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  page.on("dialog", d => (accept ? d.accept() : d.dismiss()).catch(() => {}));
  await page.route("**/api/opportunity", r => r.fulfill({ status: 200, contentType: "application/json", body: '{"ready":true}' }));
  await page.route(/jsdelivr/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(BASE);
  return { ctx, page, errs };
}

console.log("1. 고객 여정 — 실제 클릭으로 6단계 끝까지");
{
  const { ctx, page, errs } = await open();
  let sent = null;
  await page.route("**/api/discover", async r => { sent = JSON.parse(r.request().postData()); r.fulfill({ status: 202, body: "" }); });
  await page.route("**/api/status**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "error", error: "RATE_LIMIT", message: "이 네트워크의 오늘 탐색 횟수(15회)를 모두 썼어요. 내일 다시 시도해 주세요." }) }));
  ok((await page.locator("#heroSteps").innerText()) === "6", "시작 화면 질문 수 = 실제 단계 수(6)");
  await page.click("text=사업기회 찾아보기");
  await page.click("button.opt:has-text('창업자')");
  await page.click('.opt:text-is("300만~1천만원")');
  await page.click(".ex-chip:has-text('금융권 20년')");
  ok((await page.inputValue("#f_experience")).includes("금융권 20년"), "예시 눌러 경험 채우기");
  await page.click("#obNext");
  ok(/분야/.test(await page.locator(".ob-q").innerText()), "2단계 = 사업 분야 선택");
  for (const n of ["지식서비스·B2B", "교육·에듀테크", "핀테크·보험", "반려동물"]) await page.click(`.fld:has-text('${n}')`);
  ok((await page.locator(".fld.sel").count()) === 3, "분야 최대 3개 제한");
  await page.click("button.opt:has-text('B2B')");
  await page.click("#obNext");
  await page.fill("#in_customer", "제조 중소기업");          // '추가' 안 누르고 다음
  await page.click("#obNext");
  ok(/문제/.test(await page.locator(".ob-q").innerText()), "고객 입력 후 다음 단계");
  await page.click(".ex-chip:has-text('정부지원사업 서류')");
  await page.click("#obNext");
  await page.fill("#in_human", "강의 경력");
  await page.click("#obNext");
  await page.fill("input[placeholder^='예) 30~50대']", "30~50대 기업 대표");
  await page.click(".fld:has-text('실물 제품')"); await page.click(".fld:has-text('전문 서비스')"); await page.click(".fld:has-text('기기·하드웨어')");
  ok((await page.locator("#screen-onboarding .form-grid .fld.sel").count()) === 2, "사업형태 최대 2개");
  await page.click("#obNext");
  await page.waitForSelector("#screen-discovery.active");
  await page.waitForFunction(() => /탐색 횟수/.test(document.getElementById("discSteps").innerText), null, { timeout: 15000 });
  ok(sent && sent.input.fields.join() === "knowledge,edu,finance", "서버로 분야 3개 전송");
  ok(sent.input.customerType === "B2B" && sent.input.industry === "제조 중소기업", "고객 유형·관심 고객(추가 버튼 없이도) 전송");
  ok(sent.input.resources.human.includes("강의 경력"), "자원 입력(추가 버튼 없이도) 전송");
  ok(sent.input.preferredForms.join() === "product,service", "선호 사업형태 2개 전송");
  ok(/^[A-Za-z0-9_-]{8,64}$/.test(sent.jobId), "jobId 형식");
  ok(/탐색 횟수/.test(await page.locator("#discSteps").innerText()), "한도 초과를 친절한 문장으로 안내");
  ok(errs.length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("1b. 단어 입력 — 한글 조합 Enter·쉼표 여러 개·항목 수정");
{
  const { ctx, page, errs } = await open();
  ok((await page.locator("#hdrVer").count()) === 0, "헤더 버전 표시 없음");
  ok(/v0\.\d/.test(await page.locator("#footAppMeta").innerText()), "버전은 바닥글에만");
  await page.evaluate(() => { State.step = 4; App.show("onboarding"); Onboarding.render(); });
  // 조합 중 Enter(keyCode 229)는 무시되어야 함
  await page.fill("#in_human", "학교강");
  await page.dispatchEvent("#in_human", "keydown", { key: "Enter", keyCode: 229, isComposing: true });
  ok((await page.evaluate(() => State.input.resources.human.length)) === 0, "한글 조합 중 Enter는 추가하지 않음");
  await page.fill("#in_human", "학교강의,  기술영업의 전문가 네트워크, 기관의 심사/평가/컨설턴트/멘토");
  await page.press("#in_human", "Enter");
  ok((await page.evaluate(() => State.input.resources.human.join("|"))) === "학교강의|기술영업의 전문가 네트워크|기관의 심사/평가/컨설턴트/멘토", "쉼표로 3개 한 번에");
  ok((await page.inputValue("#in_human")) === "", "추가 후 입력칸 비움");
  await page.click("#tags_human .tag-t >> nth=1");
  ok((await page.inputValue("#in_human")) === "기술영업의 전문가 네트워크", "항목 눌러 수정(입력칸으로 되돌림)");
  await page.fill("#in_human", "기술영업 네트워크");
  await page.click("#tags_human ~ * >> nth=0").catch(() => {});
  await page.evaluate(() => Onboarding.addFrom("human"));
  ok((await page.evaluate(() => State.input.resources.human.length)) === 3 && (await page.evaluate(() => State.input.resources.human.includes("기술영업 네트워크"))), "수정 후 다시 추가");
  const box = await page.evaluate(() => { const a = document.querySelector(".help-box .hb-k").getBoundingClientRect(), b = document.querySelector(".help-box .hb-v").getBoundingClientRect(); return { gap: b.left - a.right, inBox: !!document.querySelector(".entry-box .eb-add") }; });
  ok(box.inBox && box.gap >= 6, "추가 버튼은 입력 박스 안, 예시는 별도 박스(라벨-내용 정렬)");
  ok(errs.length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("1c. 분야↔형태 충돌 안내");
{
  const { ctx, page, errs } = await open();
  await page.evaluate(() => { Object.assign(State.input, { fields: ["it", "knowledge"], preferredForms: [] }); State.step = 5; App.show("onboarding"); Onboarding.render(); });
  ok((await page.locator(".conflict-box").count()) === 0, "형태 미선택 시 안내 없음");
  await page.click(".fld:has-text('실물 제품')");
  ok(/손에 잡히는 물건/.test(await page.locator(".conflict-box").innerText()), "IT·지식서비스 + 실물 제품 → 안내");
  await page.evaluate(() => { State.input.fields = ["it", "food"]; Onboarding.render(); });
  ok((await page.locator(".conflict-box").count()) === 0, "물건 분야(식품)가 섞이면 안내 없음");
  ok(errs.length === 0, "오류 0");
  await ctx.close();
}

console.log("1d. 분야 필수 · 'AI가 찾아주세요' 버튼 삭제");
{
  const { ctx, page, errs } = await open();
  await page.evaluate(() => { Object.assign(State.input, { userType: "창업자", budget: "under300만", fields: [], fieldOther: "" }); State.step = 1; App.show("onboarding"); Onboarding.render(); });
  await page.click("#obNext");
  ok((await page.evaluate(() => State.step)) === 1, "분야 없이 다음으로 못 감");
  await page.click(".fld:has-text('반려동물')"); await page.click("#obNext");
  ok((await page.evaluate(() => State.step)) === 2, "분야 1개 고르면 진행");
  ok((await page.locator("button.escape").count()) === 0, "고객 단계에 'AI가 찾아주세요' 버튼 없음");
  await page.click("#obNext");
  ok((await page.locator("button.escape").count()) === 0, "문제 단계에도 없음");
  ok(/비워 두세요/.test(await page.locator(".ai-note").innerText()), "비워 두면 AI가 찾는다는 안내");
  const sent = await page.evaluate(() => { let x; const f = window.fetch; window.fetch = (u, o) => { if (String(u).includes("/api/discover")) { x = JSON.parse(o.body); return Promise.resolve({ status: 202, json: async () => ({}) }); } return f(u, o); }; Discovery.poll = () => new Promise(() => {}); Onboarding.submit(); return new Promise(r => setTimeout(() => r(x), 300)); });
  ok(sent.input.industry === "__AI_FIND__" && sent.input.knownProblem === "__AI_FIND__", "빈칸 → AI가 고른 분야 안에서 탐색");
  ok(errs.length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("2. 조작된 이어하기 세션(localStorage) — 입력칸 주입");
{
  const { ctx, page, errs } = await open(1280, true);
  await page.evaluate(() => localStorage.setItem("kif_session", JSON.stringify({ step: 99, ts: Date.now(), customerTags: ['<img src=x onerror="window.__x=1">'],
    input: { userType: "창업자", budget: "under1000만", experience: '</textarea><img src=x onerror="window.__x=1">', fields: ["it", "<b>"], region: '"><img src=x onerror="window.__x=1">', resources: "bad" } })));
  await page.click("text=사업기회 찾아보기");
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) { await page.evaluate(i => { State.step = i; Onboarding.render(); }, i); }
  ok(!(await page.evaluate(() => window.__x)), "세션 값 주입 실행 안 됨(모든 단계)");
  ok((await page.evaluate(() => State.input.fields.join())) === "it", "허용 밖 분야 제거");
  ok((await page.evaluate(() => Array.isArray(State.input.resources.hw))), "깨진 자원 형식 복구");
  ok(errs.length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("3. PDF — 긴 실제 문장에서도 쪽 넘침 없음");
{
  const { ctx, page, errs } = await open();
  const R = await longResult(page);
  await page.evaluate((R) => { State.result = R; State.isSample = false; Object.assign(State.input, { userType: "창업자", budget: "under1000만", fields: ["knowledge", "edu"], experience: "경영학박사·창업지도사·창직지도사, 기술영업 10년, 창업 2회", industry: "AI 탐색", region: "수도권", targetAge: "30~50대 기업 대표", preferredForms: ["service"], resources: { hw: [], sw: [], human: ["컨설팅"] } }); Result.render(); App.show("result"); }, R);
  const pages = await page.evaluate(() => {
    const h = document.createElement("div"); h.id = "pdfPreview"; h.innerHTML = PDFLayout.build(State.result, { org: "", person: "", purpose: "창업아이템 탐색 참고", conf: "일반", date: "2026년 11월 24일" });
    document.body.appendChild(h); window.__fit1 = PDFLayout.fit(h);
    const mm = 96 / 25.4; const limit = 297 * mm + 1;
    return [...h.querySelectorAll(".pdf-page")].map((p, i) => ({ i: i + 1, h: Math.round(p.scrollHeight), over: p.scrollHeight > limit, foot: p.querySelector(".pdf-foot-row") ? Math.round(p.querySelector(".pdf-foot-row").getBoundingClientRect().top - p.getBoundingClientRect().top) : null, contentBottom: Math.round(Math.max(...[...p.children].filter(c => !c.classList.contains("pdf-foot-row")).map(c => c.getBoundingClientRect().bottom)) - p.getBoundingClientRect().top) }));
  });
  console.log("    자동 축소된 쪽(일반 길이):", await page.evaluate(() => window.__fit1));
  console.log("    쪽 수:", pages.length, "· 높이:", pages.map(p => p.h).join(","));
  ok(pages.every(p => !p.over), "모든 쪽 A4 안(넘침 0): " + pages.filter(p => p.over).map(p => p.i).join(","));
  ok(pages.every(p => p.foot == null || p.contentBottom <= p.foot + 2), "본문이 바닥글과 겹치지 않음: " + pages.filter(p => p.foot != null && p.contentBottom > p.foot + 2).map(p => `${p.i}쪽(${p.contentBottom}>${p.foot})`).join(","));
  const txt = await page.evaluate(() => document.getElementById("pdfPreview").innerText);
  ok(!/undefined|NaN|\[object Object\]|Excel\b|None\b/.test(txt), "깨진 값·영어 코드 노출 없음");
  ok(txt.includes("창업자 사업기회 탐색") && txt.includes("지식서비스·B2B"), "분석 대상·관심 분야 표기(빈칸 '—' 없음)");
  ok((txt.match(/Page \d+/g) || []).join() === pages.slice(1).map((p, i) => "Page " + (i + 2)).join(), "쪽 번호 연속");
  await page.locator("#pdfPreview .pdf-page").nth(3).screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + "/pdf_card.png" : "/dev/null" }).catch(() => {});
  ok(errs.length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("3b. PDF — 극단값(모든 문장 200자, 경로 8단계)");
{
  const { ctx, page, errs } = await open();
  const R = await longResult(page);
  const over = await page.evaluate((R) => {
    const X = "가".repeat(30) + " 나다라마바 사아자차카 타파하 ".repeat(8);
    R.top5.forEach(o => { Object.keys(o.narrative).forEach(k => { if (typeof o.narrative[k] === "string") o.narrative[k] = X; }); o.explainPath = Array(8).fill("시장 공백: " + X); o.customer.roles.user = X; });
    R.marketPerspective = X + X; R.comparisonInsight = X + X;
    State.result = R; State.isSample = false; Object.assign(State.input, { userType: "창업자", budget: "1억이상", experience: X, industry: X, knownProblem: X, region: X, targetAge: X, fields: ["it", "mfg", "edu"], fieldOther: X });
    const h = document.createElement("div"); h.innerHTML = PDFLayout.build(R, { date: "x" }); document.body.appendChild(h);
    window.__fit = PDFLayout.fit(h);
    const lim = 297 * 96 / 25.4 + 1;
    return [...h.querySelectorAll(".pdf-page")].map((p, i) => p.scrollHeight > lim ? i + 1 : 0).filter(Boolean);
  }, R);
  ok(over.length === 0, "극단값에서도 넘침 0: " + over.join(","));
  console.log("    자동 축소된 쪽:", await page.evaluate(() => window.__fit));
  ok(errs.length === 0, "오류 0");
  await ctx.close();
}

console.log("3c. 네이버 검색 추이 표시(화면·PDF) + 주입 방어");
{
  const { ctx, page, errs } = await open();
  const r = await page.evaluate(() => {
    const R = JSON.parse(JSON.stringify(SAMPLE_RESULT));
    const sp = Array.from({ length: 24 }, (_, i) => 30 + i * 2);
    R.top5[0].trend = { insufficient: false, yoy: 0.27, recent: 0.08, keywords: ["방문요양 일지", '<img src=x onerror="window.__t=1">'], spark: sp, fetchedAt: "2026-11-24" };
    R.top5[1].trend = { insufficient: true, keywords: ["희귀 검색어"] };
    R.top5[0].voice = { query: "방문요양 일지", kin: { total: 342, samples: [{ title: '<img src=x onerror="window.__t=1">질문', link: "javascript:alert(1)" }, { title: "요양 기록 앱 추천", link: "https://kin.naver.com/qna/1" }] }, blog: { recent: 100, total: 5000 }, news: { recent: 5, latest: [{ title: "요양 기사", link: "https://n.news.naver.com/1", date: "2026-11-20" }] } };
    R.top5[0].shop = { name: "생활/건강", yoy: 0.12 };
    R.top5[2].trend = { yoy: "<b>", keywords: "bad" };
    R.top5[0].signals.evidenceConfidence = "L1";
    State.result = R; State.isSample = false; Result.render(); App.show("result");
    const h = document.createElement("div"); h.innerHTML = PDFLayout.build(R, { date: "x" }); document.body.appendChild(h); PDFLayout.fit(h);
    return { card: document.getElementById("card_kif_ops_001").innerText, card2: document.getElementById("card_kif_ops_002").innerText, card3: document.getElementById("card_kif_ops_003").innerText,
      spark: !!document.querySelector("#card_kif_ops_001 svg.spark"), pdf: h.innerText, over: [...h.querySelectorAll(".pdf-page")].some(p => p.scrollHeight > 297 * 96 / 25.4 + 1) };
  });
  ok(/\+27%/.test(r.card) && /늘고 있어요/.test(r.card) && r.spark, "후보 카드에 검색 추이(+27%·추이선)");
  ok(/검색량이 너무 적어/.test(r.card2), "검색량 부족은 '판단 안 함'으로 표시");
  ok(!/네이버 검색 추이/.test(r.card3), "형식이 깨진 추이 데이터는 표시 안 함");
  ok(/실제 데이터 · 네이버 검색 추이/.test(r.pdf) && /\+27%/.test(r.pdf), "PDF에 데이터 근거 표");
  ok(/구매 수요·시장 규모가 아/.test(r.card) && /구매 수요·시장 규모가 아닌/.test(r.pdf), "한계(관심≠수요) 함께 표시");
  ok(/지식iN 질문 342건/.test(r.card) && /최근 90일 블로그 100건 이상/.test(r.card) && /요양 기사/.test(r.card), "지식iN·블로그·뉴스 근거 표시");
  ok(/생활\/건강' 분야 클릭/.test(r.card) && /\+12%/.test(r.card), "쇼핑 분야 흐름 표시");
  ok((await page.$$eval("#card_kif_ops_001 .voice-row a", as => as.map(a => a.getAttribute("href")))).every(h => h.startsWith("https://")), "외부 링크는 https만");
  ok(/342건/.test(r.pdf), "PDF 표에 지식iN 건수");
  ok(!(await page.evaluate(() => window.__t)), "검색어 주입 실행 안 됨");
  ok(!r.over, "PDF 넘침 없음");
  ok(errs.length === 0, "오류 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("4. 전수 조합 — 유형 8 × 예산 11(신규 9+예전 2) × 형태 6 × 분야 3패턴 = 1,584개 결과 렌더");
{
  const { ctx, page, errs } = await open();
  const r = await page.evaluate(() => {
    const types = ["예비창업자", "창업자", "기존기업", "소상공인", "스타트업", "중소기업", "신사업 담당자", "컨설턴트"];
    const budgets = ["under300만", "300_1000만", "1000_3000만", "3000_5000만", "5000만_1억", "1억_3억", "3억_5억", "5억이상", "undecided", "under1000만", "1억이상"];
    const forms = [[], ["software"], ["service"], ["platform", "edu"], ["product", "hardware"], ["store", "community"]];
    const fieldSets = [[], ["food", "local"], ["it", "mfg", "finance"]];
    let n = 0, bad = 0, gNoPre = 0, minNext = 9, sample;
    for (const t of types) for (const b of budgets) for (const f of forms) for (const fs of fieldSets) {
      Object.assign(State.input, { userType: t, budget: b, preferredForms: f, fields: fs });
      State.result = JSON.parse(JSON.stringify(SAMPLE_RESULT)); State.isSample = false;
      Result.render(); n++;
      const txt = document.getElementById("resultContent").innerText;
      if (/undefined|NaN|\[object Object\]/.test(txt)) { bad++; sample = sample || txt.match(/.{20}(undefined|NaN).{20}/)?.[0]; }
      const nx = Plus.nextDiagnoses(State.result);
      minNext = Math.min(minNext, nx.length);
      if (t === "예비창업자" && nx.some(x => x.tool === "G")) gNoPre++;
      PDFLayout.build(State.result, { date: "x" });
    }
    return { n, bad, gNoPre, minNext, sample };
  });
  ok(r.n === 1584, "조합 수 " + r.n);
  ok(r.bad === 0, "깨진 문구 0건 " + (r.sample || ""));
  ok(r.gNoPre === 0, "예비창업자에게 G 추천 0건(31 규칙)");
  ok(r.minNext >= 3, "다음 진단 항상 3개 이상");
  ok(errs.length === 0, "예외 0 " + (errs[0] || ""));
  await ctx.close();
}

console.log("5. 모바일 390px — 분야 선택 화면 넘침");
{
  const { ctx, page, errs } = await open(390);
  await page.evaluate(() => { State.step = 1; App.show("onboarding"); Onboarding.render(); });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, "가로 넘침 없음 (" + over + "px)");
  ok(errs.length === 0, "오류 0");
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
