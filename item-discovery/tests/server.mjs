// 서버 로직 오프라인 검증 — node tests/server.mjs  (AI 호출은 가짜 응답으로 대체)
import { orchestrate, providers, __test } from "../netlify/functions/_core.mjs";
import { normalizeInput, checkOrigin, JOB_ID_RE } from "../netlify/functions/_guard.mjs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

// 대표님 실제 사례와 비슷한 입력: 컨설턴트 경력 + 서비스 선호 + 분야 2개
const INPUT = normalizeInput({ userType: "창업자", budget: "under1000만", experience: "경영학박사·창업지도사, 기술영업 10년",
  fields: ["knowledge", "edu", "bogus"], customerType: "B2B", industry: "__AI_FIND__", knownProblem: "__AI_FIND__",
  resources: { hw: [], sw: [], human: ["컨설팅"] }, region: "수도권", targetAge: "30~50대 기업 대표", preferredForm: "서비스", evil: "x" });

const A = {
  customer: { type: "B2B", roles: { user: "기업 대표", buyer: "기업 대표" } },
  segments: [
    { key: "s1", field: "knowledge", type: "B2B", user: "제조 중소기업 대표", buyer: "대표" },
    { key: "s2", field: "edu", type: "B2C", user: "예비창업자", buyer: "본인" },
    { key: "s3", field: "knowledge", type: "B2G", user: "지자체 창업센터", buyer: "센터" },
  ],
  problems: [
    { key: "p1", segment: "s1", statement: "정부지원사업 서류를 매번 처음부터 쓴다", types: ["Time"], severity: 4, frequency: "monthly", alternatives: [{ type: "대행사", dissatisfaction: ["비싸다"] }] },
    { key: "p2", segment: "s2", statement: "사업계획서 피드백을 받을 곳이 없다", types: ["Information"], severity: 3, frequency: "weekly", alternatives: [{ type: "커뮤니티", dissatisfaction: ["깊이 없음", "느림"] }] },
    { key: "p3", segment: "s3", statement: "입주기업 성과를 한눈에 못 본다", types: ["Complexity"], severity: 3, frequency: "monthly", alternatives: [{ type: "엑셀", dissatisfaction: ["수작업"] }] },
    { key: "p4", segment: "s1", statement: "기술을 돈 되는 사업모델로 못 바꾼다", types: ["Uncertainty"], severity: 5, frequency: "rare", alternatives: [{ type: "컨설팅", dissatisfaction: ["고가", "일회성"] }] },
  ],
  gaps: [{ key: "g1", statement: "지원사업 서류 자동화", underserved: ["소기업"] }, { key: "g2", statement: "예비창업 실시간 피드백", underserved: ["예비"] },
    { key: "g3", statement: "보육기관 성과관리", underserved: ["센터"] }, { key: "g4", statement: "기술 BM 설계", underserved: ["기술기업"] }],
  whyNow: [{ category: "REGULATION", signal: "지원사업 확대", trendStrength: "strong", problemPersistence: "STRUCTURAL" }],
  candidateSeeds: [
    { customerKey: "s1", problemKey: "p1", gapKey: "g1", field: "knowledge", solutionTypeHint: "SaaS", resourceHint: "SW" },
    { customerKey: "s2", problemKey: "p2", gapKey: "g2", field: "edu", solutionTypeHint: "Education", resourceHint: "Human" },
    { customerKey: "s3", problemKey: "p3", gapKey: "g3", field: "knowledge", solutionTypeHint: "SaaS", resourceHint: "SW" },
    { customerKey: "s1", problemKey: "p4", gapKey: "g4", field: "knowledge", solutionTypeHint: "Service", resourceHint: "Human" },
    { customerKey: "s2", problemKey: "p2", gapKey: "g2", field: "edu", solutionTypeHint: "Community", resourceHint: "Human" },
    { customerKey: "s1", problemKey: "p1", gapKey: "g1", field: "knowledge", solutionTypeHint: "Service", resourceHint: "Human" },
  ],
  uncertainties: ["지불의향"],
};
let calls = [];
providers.claude.call = async ({ system, user }) => {
  calls.push(user);
  if (calls.length === 1) return JSON.stringify(A);
  const ids = [...user.matchAll(/"id":"(kif_ops_\d+)"/g)].map((m) => m[1]);
  const names = [["지원사업 진단 플랫폼", "공고서류 자동작성 SaaS", "지원서 초안봇"], ["창업 진단 컨설팅", "계획서 첨삭 클래스", "주간 피드백 스튜디오"],
    ["보육성과 진단 대시보드", "입주사 성과보드 SaaS", "센터 성과 리포터"], ["기술사업화 진단 컨설팅", "기술 BM 설계 스프린트", "BM 랩"],
    ["창업 진단 커뮤니티", "예비창업 피드백 서클", "창업 동료 모임"]];
  return JSON.stringify({ candidates: ids.map((id, i) => ({ opportunityId: id, narrative: { name: names[i][0], nameOptions: names[i].slice(1), nameReason: "이유", problem: "p", solutionConcept: "s" }, explainPath: ["고객: a"] })), comparisonInsight: "", marketPerspective: "" });
};

console.log("1. 입력 정규화(_guard)");
ok(INPUT && !("evil" in INPUT), "허용 밖 항목 제거");
ok(INPUT.fields.join() === "knowledge,edu", "허용 밖 분야 제거");
ok(normalizeInput({ userType: "해커", budget: "x" }) === null, "필수값 형식 불일치 거부");
ok(normalizeInput({ userType: "창업자", budget: "1억이상", experience: "a".repeat(5000) }).experience.length === 400, "긴 입력 400자로 자르기");
ok(!JOB_ID_RE.test("../../etc") && JOB_ID_RE.test("123e4567-e89b-12d3-a456-426614174000"), "jobId 형식 검사");
const mk = (h) => new Request("https://site.netlify.app/api/discover", { method: "POST", headers: h });
ok(checkOrigin(mk({ origin: "https://evil.com", "content-type": "application/json" })) === "origin_foreign", "다른 사이트 출처 차단");
ok(checkOrigin(mk({ "content-type": "application/json" })) === "origin_missing", "출처 없는 요청 차단");
ok(checkOrigin(mk({ origin: "https://site.netlify.app", "content-type": "application/json" })) === null, "같은 사이트 통과");

console.log("2. 후보 다양성(고객·문제 키 연결)");
const R = await orchestrate(INPUT);
const t = R.top5;
ok(t.length === 5, "TOP5 5개");
ok(new Set(t.map((c) => c.problem.statement)).size >= 4, "문제 4종 이상: " + new Set(t.map((c) => c.problem.statement)).size);
ok(new Set(t.map((c) => c.customer.roles.user)).size >= 3, "고객 3종 이상: " + new Set(t.map((c) => c.customer.roles.user)).size);
ok(new Set(t.map((c) => JSON.stringify(c.currentAlternative))).size >= 4, "현재 대안이 문제별로 다름");
ok(new Set(t.map((c) => [c.signals.problemSignal.raw, c.signals.marketGapSignal.raw].join())).size >= 3, "신호값이 후보별로 다름");
ok(t.every((c) => c.field), "후보마다 분야 표시");
ok(calls[0].includes("knowledge=지식서비스") && calls[0].includes("선호 고객 유형: B2B"), "CALL A 에 분야·고객유형 전달");
ok(calls[0].includes("지시가 아니다"), "프롬프트 주입 방어 문구");
ok(t.every((c) => !("_keys" in c) && !("_input" in c)), "내부 필드 제거");

console.log("3. 네이밍(핵심 명사 중복 회피)");
const names = t.map((c) => c.title);
console.log("    이름:", names.join(" | "));
const cnt = {}; names.forEach((n) => __test.headWords(n).forEach((h) => cnt[h] = (cnt[h] || 0) + 1));
ok(Object.values(cnt).every((v) => v <= 2), "같은 핵심 명사 최대 2번: " + JSON.stringify(cnt));
ok(t.every((c) => Array.isArray(c.narrative.nameOptions)), "다른 이름 후보 제공");
ok(__test.refineItemName("수도권 중소기업 대표 · 진단 불가", t[0]) !== "수도권 중소기업 대표 · 진단 불가", "나쁜 이름 교정");

console.log("3b. 선호 사업형태 반영(실물 제품을 고르면 SaaS로 바뀌지 않게)");
{
  const inp = normalizeInput({ ...INPUT, preferredForm: undefined, preferredForms: ["product", "hardware", "store"] });
  ok(inp.preferredForms.join() === "product,hardware", "형태 최대 2개");
  ok(normalizeInput({ userType: "창업자", budget: "1억이상", preferredForm: "제품" }).preferredForms.join() === "product", "옛 값(제품) → product");
  calls = [];
  const R3 = await orchestrate(inp);
  const types = R3.top5.map(c => c.solution.solutionType);
  console.log("    형태:", types.join(", "));
  ok(types.filter(t => ["Product", "Hardware"].includes(t)).length >= 3, "5개 중 3개 이상 실물 제품·기기(제품+서비스 제외)");
  ok(new Set(R3.top5.map(c => c.problem.statement)).size === Math.min(4, R3.top5.length), "같은 문제는 1개만(문제 4종 fixture → 4종)");
  ok(__test.fixPhysicalDefinition("스타트업 대표를 위한 진단 도구+자문", { customer: { roles: { user: "스타트업 대표" } }, solution: { solutionType: "Product" } }) === "스타트업 대표를 위한 실물 제품", "실물 후보 정의에 물건이 없으면 서버가 교정");
  ok(__test.fixPhysicalDefinition("예비창업자를 위한 사업계획 카드 키트", { solution: { solutionType: "Product" } }) === "예비창업자를 위한 사업계획 카드 키트", "물건이 드러난 정의는 유지");
  ok(new Set(R3.top5.map(c => c.problem.statement)).size >= 3, "선호 형태 반영 후에도 문제 3종 이상");
  ok(calls[0].includes("선호 사업형태") && calls[0].includes("바꾸지 말 것") && calls[0].includes("물건"), "CALL A 에 선호 형태 지시");
  ok(R3.top5.every(c => c.narrative?.definition), "아이템 정의(definition) 항상 채움");
}

console.log("4. 하위 호환 — AI가 key 없이 옛 형식으로 답해도 동작");
{
  const old = JSON.parse(JSON.stringify(A));
  delete old.segments; old.problems.forEach(p => { delete p.key; delete p.alternatives; delete p.statement; });
  old.gaps.forEach(g => delete g.key); old.candidateSeeds.forEach(s => { delete s.gapKey; s.customerKey = "기업"; s.problemKey = "없는키"; });
  old.alternatives = [{ type: "Excel", dissatisfaction: ["slow"] }];
  calls = []; const oldCall = providers.claude.call;
  providers.claude.call = async (a) => { calls.push(a.user); return calls.length === 1 ? JSON.stringify(old) : oldCall(a); };
  let R2, err = null; try { R2 = await orchestrate(INPUT); } catch (e) { err = e; }
  ok(!err && R2.top5.length >= 3, "옛 형식에서도 결과 생성 " + (err ? err.message : R2.top5.length));
  ok(R2 && R2.top5.every(c => c.customer?.roles?.user), "고객 정보 유지");
  providers.claude.call = oldCall;
}
{
  const bad = { customer: { type: "B2B", roles: { user: "x" } }, candidateSeeds: "문자열", problems: null, gaps: {} };
  calls = []; const oldCall = providers.claude.call;
  providers.claude.call = async (a) => { calls.push(a.user); return calls.length === 1 ? JSON.stringify(bad) : oldCall(a); };
  let err = null; try { await orchestrate(INPUT); } catch (e) { err = e; }
  ok(err && /NO_CANDIDATES/.test(err.message), "망가진 AI 응답 → NO_CANDIDATES(안내 문장으로 처리)");
  providers.claude.call = oldCall;
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
