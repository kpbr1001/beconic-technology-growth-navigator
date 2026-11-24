// ============================================================
// K-ITEM FINDER — AI 연결 상태 확인 전용  v0.5.0
// (예전 동기 탐색 경로는 비용 보호를 위해 제거 — 탐색은 /api/discover 만 사용)
// ============================================================
import { APP_META, API_CONFIG } from "./_core.mjs";
import { json } from "./_guard.mjs";

export default async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json(405, { error: "METHOD_NOT_ALLOWED" });
  const ready = !!process.env.ANTHROPIC_API_KEY && process.env.KIF_DISABLED !== "true";
  return json(200, {
    status: ready ? "ready" : "no_key",
    ready,
    models: ready ? { structure: API_CONFIG.modelA, narrative: API_CONFIG.modelB } : null,
    version: APP_META.appVersion,
  });
};
