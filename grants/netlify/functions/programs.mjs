// ============================================================================
// programs — 지원사업 목록 BFF (다중 소스 오케스트레이터)
// 소스: 기업마당(bizinfo) + K-Startup. 각각 표준 정규화 → 중복 제거 → 마감 지난 공고 제외.
// [선택] ANTHROPIC_API_KEY가 있으면 기업마당 공고 본문에서 자격조건 추출(상위 ENRICH_COUNT건).
// 프론트는 fetch('/.netlify/functions/programs')만. 기업 정보는 이 함수로 보내지 않는다.
//
// 비용·쿼터 보호(v3.8): 쿼리 파라미터로 수집량·AI 호출 수를 늘릴 수 없고,
// 결과는 인스턴스 메모리(30분)·Netlify CDN(30분)에 캐시해 방문자마다 외부 API·Claude를 다시 부르지 않는다.
// ============================================================================
import { collectBizinfo } from '../lib/bizinfo.mjs';
import { collectKstartup } from '../lib/kstartup.mjs';
import { extractEligibility, mergeEligibility } from '../lib/eligibility-ai.mjs';
import { dedupe, isPastKst } from '../lib/normalize.mjs';

const TTL_MS = 30 * 60 * 1000;
const BIZINFO_MAX = 500;
const KSTARTUP_MAX = 300;
const ENRICH_COUNT = 12;
const SOURCE_TIMEOUT_MS = 7000;   // 동기 함수 기본 제한(10초) 안에 끝내기 위한 소스별 상한
const AI_TIMEOUT_MS = 6000;
const AI_START_BUDGET_MS = 3500;  // 수집에 이보다 오래 걸렸으면 이번 회차는 AI 추출 생략
const DESC_MAX = 500;             // 응답 크기 제한(Netlify 6MB) — 본문은 요약만 내려보낸다

let memo = null;      // { at, body }
let inflight = null;  // 동시 요청이 같은 수집을 공유

export function isAlive(p, now = Date.now()) {
  if (p.recruitInProgress === false) return false;
  if (p.applicationEnd && isPastKst(p.applicationEnd, now)) return false;
  return true;
}

function publicShape(p) {
  const rest = { ...p };
  delete rest.rawSummary;
  const d = rest.supportDescription || '';
  rest.supportDescription = d.length > DESC_MAX ? d.slice(0, DESC_MAX) + '…' : d;
  return rest;
}

async function build(env, now = Date.now()) {
  const bizKey = env.BIZINFO_API_KEY;
  const ksKey = env.KSTARTUP_API_KEY;
  const aiKey = env.ANTHROPIC_API_KEY;
  const providers = {
    bizinfo: bizKey ? 'READY' : 'NOT_CONFIGURED',
    kstartup: ksKey ? 'READY' : 'NOT_CONFIGURED',
    anthropic: aiKey ? 'READY' : 'NOT_CONFIGURED',
  };
  if (!bizKey && !ksKey) return { mode: 'not_configured', providers, programs: [] };

  const t0 = Date.now();
  const tasks = [];
  if (bizKey) tasks.push(collectBizinfo(bizKey, { max: BIZINFO_MAX, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) }).then((r) => ({ src: 'bizinfo', r }), (e) => ({ src: 'bizinfo', r: [], err: String(e.message || e) })));
  if (ksKey) tasks.push(collectKstartup(ksKey, { max: KSTARTUP_MAX, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) }).then((r) => ({ src: 'kstartup', r }), (e) => ({ src: 'kstartup', r: [], err: String(e.message || e) })));
  const results = await Promise.all(tasks);

  const sourceCounts = {};
  const errors = {};
  let programs = [];
  for (const { src, r, err } of results) {
    sourceCounts[src] = r.length;
    if (err) errors[src] = err;
    programs = programs.concat(r);
  }
  const totalCollected = programs.length;
  const deduped = dedupe(programs);
  const alive = deduped.filter((p) => isAlive(p, now));

  // AI 자격추출: 살아 있는 기업마당 공고 중 본문이 충분한 것만(K-Startup은 업력·연령을 이미 정형 제공)
  let enriched = 0;
  let list = alive;
  if (aiKey && alive.length && Date.now() - t0 < AI_START_BUDGET_MS) {
    const targets = alive.filter((p) => p.source === 'bizinfo' && (p.rawSummary || '').length >= 40).slice(0, ENRICH_COUNT);
    const settled = await Promise.allSettled(targets.map((p) => extractEligibility(aiKey, p, { signal: AbortSignal.timeout(AI_TIMEOUT_MS) }).then((e) => ({ p, e }))));
    const map = new Map();
    for (const s of settled) if (s.status === 'fulfilled' && s.value.e) map.set(s.value.p.sourceProgramId, s.value.e);
    list = alive.map((p) => {
      if (!map.has(p.sourceProgramId)) return p;
      const merged = mergeEligibility(p, map.get(p.sourceProgramId));
      if (merged._aiEnriched) enriched++;
      return merged;
    });
  }

  if (!list.length && Object.keys(errors).length === results.length) {
    return { mode: 'error', providers, errors, programs: [] };
  }
  return {
    mode: 'live',
    providers,
    fetchedAt: new Date(now).toISOString(),
    sourceCounts,
    errors,
    totalCollected,
    dedupeRemoved: totalCollected - deduped.length,
    aliveCount: alive.length,
    count: list.length,
    enriched,
    programs: list.map(publicShape),
  };
}

export async function getPrograms(env = process.env, { now = Date.now(), fresh = false } = {}) {
  if (!fresh && memo && now - memo.at < TTL_MS) return memo.body;
  if (!inflight) {
    inflight = build(env, now)
      .then((body) => { if (body.mode === 'live') memo = { at: now, body }; return body; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function _resetCache() { memo = null; inflight = null; }

export async function handler() {
  try {
    const body = await getPrograms();
    const cacheable = body.mode === 'live';
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300',
        ...(cacheable ? { 'netlify-cdn-cache-control': 'public, durable, s-maxage=1800, stale-while-revalidate=600' } : {}),
      },
      body: JSON.stringify(body),
    };
  } catch (e) {
    return { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify({ mode: 'error', message: String(e.message || e), programs: [] }) };
  }
}
