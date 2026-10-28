// ============================================================================
// programs — 지원사업 목록 BFF. 프론트는 fetch('/.netlify/functions/programs')만.
// 기업 정보는 이 함수로 보내지 않는다.
//
// 1) 수집 함수가 Blobs에 저장한 스냅샷을 읽어 바로 응답(마감 지난 공고는 응답 시점에 다시 거름)
// 2) 스냅샷이 오래됐거나 없으면 백그라운드 수집을 요청하고, 없을 때만 짧은 제한으로 직접 수집
// 쿼리 파라미터로 수집량·AI 호출 수를 늘릴 수 없다.
// ============================================================================
import { build, readSnapshot, writeSnapshot, snapshotAge, isAlive } from '../lib/collect.mjs';

const MEMO_MS = 5 * 60 * 1000;
const STALE_MS = 45 * 60 * 1000;  // 예약 수집(30분)이 한 번 빠져도 버티는 시간

let memo = null;      // { at, body }
let inflight = null;  // 동시 요청이 같은 작업을 공유

async function requestRefresh(env) {
  if (!env.URL) return;
  try {
    await fetch(`${env.URL}/.netlify/functions/refresh-programs-background`, { method: 'POST', signal: AbortSignal.timeout(2000) });
  } catch { /* 다음 요청·예약 수집에서 다시 시도 */ }
}

function serve(snap, now) {
  const programs = (snap.programs || []).filter((p) => isAlive(p, now));
  return { ...snap, programs, count: programs.length, aliveCount: programs.length };
}

async function load(env, now, triggerRefresh) {
  const snap = await readSnapshot();
  if (snap && snap.mode === 'live') {
    if (snapshotAge(snap, now) > STALE_MS || Object.keys(snap.errors || {}).length) await triggerRefresh(env);
    return serve(snap, now);
  }
  // 스냅샷 없음(첫 배포 직후): 백그라운드 수집을 걸어 두고, 이번 응답은 짧은 제한으로 직접 수집
  await triggerRefresh(env);
  const body = await build(env, { now });
  if (body.mode === 'live' && !Object.keys(body.errors).length) await writeSnapshot(body);
  return body;
}

export async function getPrograms(env = process.env, { now = Date.now(), fresh = false, triggerRefresh = requestRefresh } = {}) {
  if (!fresh && memo && now - memo.at < MEMO_MS) return memo.body;
  if (!inflight) {
    inflight = load(env, now, triggerRefresh)
      .then((body) => { if (body.mode === 'live') memo = { at: now, body }; return body; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function _resetCache() { memo = null; inflight = null; }

export default async () => {
  try {
    const body = await getPrograms();
    // 일부 소스가 실패한 결과는 CDN에 오래 두지 않는다
    const complete = body.mode === 'live' && !Object.keys(body.errors || {}).length;
    return new Response(JSON.stringify(body), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': complete ? 'public, max-age=300' : 'no-store',
        ...(complete ? { 'netlify-cdn-cache-control': 'public, durable, s-maxage=600, stale-while-revalidate=600' } : {}),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ mode: 'error', message: String(e.message || e), programs: [] }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
};
