// ============================================================
// K-ITEM FINDER — 탐색 제출 (Background Function)
// 파일명이 -background 로 끝나면 Netlify가 최대 15분까지 실행 허용.
// 즉시 202 반환하고, 백그라운드에서 orchestrate 실행 후 결과를 Blobs에 저장.
// ============================================================
import { getStore } from "@netlify/blobs";
import { orchestrate } from "./_core.mjs";

export default async (req) => {
  let payload;
  try { payload = await req.json(); }
  catch { return new Response("bad json", { status: 400 }); }

  const { jobId, input } = payload || {};
  if (!jobId || !input) return new Response("missing jobId/input", { status: 400 });

  const store = getStore("kif-jobs");

  // 처리 시작 표시
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
    await store.setJSON(jobId, {
      status: "error", error: code,
      detail: process.env.KIF_DEBUG === "1" ? msg : undefined,
      raw: process.env.KIF_DEBUG === "1" && e.raw ? e.raw : undefined,
      ts: Date.now(),
    });
  }

  // Background function은 반환값이 무시됨(이미 202 전송됨)
  return new Response("ok");
};
