// ============================================================
// K-ITEM FINDER — 탐색 상태 조회  v0.5.0
// jobId 형식 검사(무작위 UUID만), 결과는 그대로 반환.
// ============================================================
import { getStore } from "@netlify/blobs";
import { JOB_ID_RE, json } from "./_guard.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") || "";
  if (!JOB_ID_RE.test(jobId)) return json(400, { status: "error", error: "BAD_JOB_ID" });
  try {
    const data = await getStore("kif-jobs").get(jobId, { type: "json" });
    if (!data) return json(200, { status: "pending" });
    return json(200, data);
  } catch {
    return json(200, { status: "pending" });
  }
};
