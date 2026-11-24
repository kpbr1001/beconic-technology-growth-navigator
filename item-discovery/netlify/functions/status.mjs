// ============================================================
// K-ITEM FINDER — 탐색 상태 조회 (일반 함수)
// 프론트가 jobId로 폴링하여 processing/done/error 확인.
// ============================================================
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return json(400, { status: "error", error: "MISSING_JOB_ID" });

  try {
    const store = getStore("kif-jobs");
    const data = await store.get(jobId, { type: "json" });
    if (!data) return json(200, { status: "pending" }); // 아직 시작 전/기록 없음
    return json(200, data);
  } catch (e) {
    return json(200, { status: "pending" }); // 조회 실패는 pending으로 처리(폴링 계속)
  }
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
