// ============================================================
// K-ITEM FINDER — 탐색 제출 (Background Function)  v0.5.0
// 파일명이 -background 로 끝나면 Netlify가 즉시 202를 돌려주고 최대 15분 실행.
// 202가 먼저 나가므로 거부·한도 초과는 jobId 상태(Blobs)에 error로 남겨 화면 폴링이 읽게 한다.
// ============================================================
import { getStore } from "@netlify/blobs";
import { orchestrate } from "./_core.mjs";
import { MAX_BODY, JOB_ID_RE, settings, checkOrigin, normalizeInput, takeQuota, logBlocked } from "./_guard.mjs";

export default async (req, context) => {
  const cfg = settings();
  const blocked = checkOrigin(req, cfg.origins);
  if (blocked) { logBlocked("discover", blocked, req); return new Response("forbidden", { status: 403 }); }

  const raw = await req.text();
  if (raw.length > MAX_BODY) { logBlocked("discover", "too_large", req); return new Response("too large", { status: 413 }); }
  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const jobId = payload?.jobId;
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return new Response("bad jobId", { status: 400 });
  const store = getStore("kif-jobs");

  const fail = async (error, message) => { await store.setJSON(jobId, { status: "error", error, message, ts: Date.now() }); return new Response("ok"); };

  // 이미 쓰인 jobId 재사용 금지(다른 사람 결과 덮어쓰기 방지)
  try { if (await store.get(jobId, { type: "json" })) return new Response("dup", { status: 409 }); } catch { /* noop */ }

  if (cfg.disabled) return fail("DISABLED", "지금은 탐색을 잠시 멈췄어요. 샘플 결과를 먼저 보시거나 잠시 후 다시 시도해 주세요.");
  const input = normalizeInput(payload?.input);
  if (!input) return fail("BAD_INPUT", "필수 항목(유형·초기 투자 범위)을 확인해 주세요.");

  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0];
  const q = await takeQuota(getStore("kif-quota"), { ip, dailyLimit: cfg.dailyLimit, ipLimit: cfg.ipLimit });
  if (q) { logBlocked("discover", q.reason, req); return fail("RATE_LIMIT", q.message); }

  await store.setJSON(jobId, { status: "processing", ts: Date.now() });
  try {
    const result = await orchestrate(input);
    await store.setJSON(jobId, { status: "done", result, ts: Date.now() });
  } catch (e) {
    const msg = String(e.message || e);
    const code =
      msg.includes("MISSING_API_KEY") ? "MISSING_API_KEY" :
      msg.startsWith("PARSE_") ? "AI_PARSE_ERROR" :
      msg.startsWith("LLM_HTTP") ? "AI_UPSTREAM_ERROR" :
      msg.includes("NO_CANDIDATES") ? "NO_CANDIDATES" :
      "DISCOVERY_ERROR";
    const debug = process.env.KIF_DEBUG === "1";
    await store.setJSON(jobId, {
      status: "error", error: code,
      message: code === "NO_CANDIDATES" ? "입력으로 후보를 만들지 못했어요. 관심 분야나 문제를 조금 넓혀 다시 시도해 주세요." : "AI 분석 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
      detail: debug ? msg.slice(0, 300) : undefined,
      raw: debug && e.raw ? String(e.raw).slice(0, 300) : undefined,
      ts: Date.now(),
    });
  }
  return new Response("ok");
};
