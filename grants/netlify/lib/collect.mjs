// ============================================================================
// 공고 수집·스냅샷 — programs(BFF)와 수집 함수(백그라운드·예약)가 함께 쓴다.
// 기업마당 500건 응답은 동기 함수 제한(10초) 안에 끝나지 않는 경우가 있어(운영 확인: 7초 시간 초과),
// 수집은 시간 제한이 긴 백그라운드(15분)·예약(30초) 함수에서 하고 결과를 Netlify Blobs에 저장한다.
// programs는 저장된 스냅샷을 읽어 바로 응답한다.
// ============================================================================
import { collectBizinfo } from './bizinfo.mjs';
import { collectKstartup } from './kstartup.mjs';
import { extractEligibility, mergeEligibility } from './eligibility-ai.mjs';
import { dedupe, isPastKst, detectCities } from './normalize.mjs';
import { applyRules } from './rule-extract.mjs';

const BIZINFO_MAX = 2000;           // 운영에서 500건 상한에 정확히 걸림(접수 공고가 더 있음) → 상향
const KSTARTUP_MAX = 500;
const ENRICH_COUNT = 12;
const DESC_MAX = 500;               // 응답 크기 제한(Netlify 6MB) — 본문은 요약만 내려보낸다
export const MIN_REFRESH_MS = 20 * 60 * 1000;  // 이보다 최근 스냅샷이면 다시 수집하지 않음(쿼터 보호)
const RETRY_PARTIAL_MS = 5 * 60 * 1000;          // 일부 소스가 실패한 스냅샷의 재시도 간격
const SNAPSHOT_KEY = 'latest';

export function isAlive(p, now = Date.now()) {
  if (p.recruitInProgress === false) return false;
  if (p.applicationEnd && isPastKst(p.applicationEnd, now)) return false;
  return true;
}

/** AI 없이 하는 보강: 본문 규칙 추출 + 시·군 기관 공고의 대상 시·군 */
export function enrichLocal(p) {
  let q = applyRules(p);
  if (!q.targetRegionsInferred && (q.targetRegions || []).includes('전국')) return q; // 전국으로 명시된 공고는 그대로
  const cities = detectCities(q, q.targetRegionsInferred ? null : q.targetRegions);
  if (!cities.length) return q;
  q = { ...q, targetDistricts: cities.map((c) => c.name) };
  if (q.targetRegionsInferred || (q.targetRegions || []).includes('전국')) {
    q.targetRegions = [...new Set(cities.map((c) => c.sido))];
    q.targetRegionsInferred = false;
  }
  return q;
}

function publicShape(p) {
  const rest = { ...p };
  delete rest.rawSummary;
  const d = rest.supportDescription || '';
  rest.supportDescription = d.length > DESC_MAX ? d.slice(0, DESC_MAX) + '…' : d;
  return rest;
}

/**
 * 수집 1회. timeouts: 소스별 상한, AI 호출 상한, AI 시작 예산(수집이 이보다 오래 걸리면 AI 생략).
 */
export async function build(env, { now = Date.now(), sourceTimeoutMs = 7000, aiTimeoutMs = 6000, aiStartBudgetMs = 3500 } = {}) {
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
  if (bizKey) tasks.push(collectBizinfo(bizKey, { max: BIZINFO_MAX, signal: AbortSignal.timeout(sourceTimeoutMs) }).then((r) => ({ src: 'bizinfo', r }), (e) => ({ src: 'bizinfo', r: [], err: String(e.message || e) })));
  if (ksKey) tasks.push(collectKstartup(ksKey, { max: KSTARTUP_MAX, signal: AbortSignal.timeout(sourceTimeoutMs) }).then((r) => ({ src: 'kstartup', r }), (e) => ({ src: 'kstartup', r: [], err: String(e.message || e) })));
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
  const alive = deduped.filter((p) => isAlive(p, now)).map(enrichLocal);

  // AI 자격추출: 살아 있는 기업마당 공고 중 본문이 있는 것만(K-Startup은 업력·연령을 이미 정형 제공)
  let enriched = 0;
  let list = alive;
  if (aiKey && alive.length && Date.now() - t0 < aiStartBudgetMs) {
    const targets = alive.filter((p) => p.source === 'bizinfo' && (p.rawSummary || '').length >= 40).slice(0, ENRICH_COUNT);
    const settled = await Promise.allSettled(targets.map((p) => extractEligibility(aiKey, p, { signal: AbortSignal.timeout(aiTimeoutMs) }).then((e) => ({ p, e }))));
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

// ---- 스냅샷 저장소(Netlify Blobs). 테스트는 _setStore로 메모리 저장소를 넣는다 ----
let storeOverride = null;
export function _setStore(s) { storeOverride = s; }
async function store() {
  if (storeOverride) return storeOverride;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'grant-programs', consistency: 'strong' });
}
export async function readSnapshot() {
  try { return (await (await store()).get(SNAPSHOT_KEY, { type: 'json' })) || null; } catch { return null; }
}
export async function writeSnapshot(body) {
  try { await (await store()).setJSON(SNAPSHOT_KEY, body); return true; } catch { return false; }
}
export const snapshotAge = (snap, now = Date.now()) => (snap && snap.fetchedAt ? now - Date.parse(snap.fetchedAt) : Infinity);

/**
 * 스냅샷 갱신(백그라운드·예약 함수용). 최근 스냅샷이 오류 없이 MIN_REFRESH_MS 안이면 건너뜀.
 * 새 결과가 이전보다 크게 줄었는데 소스 오류가 있으면(일시 장애) 이전 스냅샷을 유지한다.
 */
export async function refreshSnapshot(env, { now = Date.now(), sourceTimeoutMs = 20000, aiStartBudgetMs = 15000 } = {}) {
  const prev = await readSnapshot();
  // 일부 소스 오류가 있던 스냅샷은 5분 뒤 재시도, 정상 스냅샷은 20분 동안 재수집 안 함(어느 쪽이든 반복 호출로 쿼터를 쓰지 못함)
  const minGap = Object.keys((prev && prev.errors) || {}).length ? RETRY_PARTIAL_MS : MIN_REFRESH_MS;
  if (prev && snapshotAge(prev, now) < minGap) return { skipped: true, reason: 'fresh' };
  const body = await build(env, { now, sourceTimeoutMs, aiStartBudgetMs });
  if (body.mode !== 'live') return { skipped: true, reason: body.mode };
  const degraded = Object.keys(body.errors).length && prev && prev.count && body.count < prev.count * 0.5;
  if (degraded) return { skipped: true, reason: 'degraded', errors: body.errors };
  await writeSnapshot(body);
  return { written: true, count: body.count, sourceCounts: body.sourceCounts, errors: body.errors };
}
