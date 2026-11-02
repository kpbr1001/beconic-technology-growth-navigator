// ============================================================================
// metrics — 이용 측정(이벤트 이름·날짜별 건수만). 입력한 기업 정보·IP·식별자는 받지도 저장하지도 않는다.
//   POST /api/e        본문: 이벤트 이름(허용 목록) → 한국시간 날짜별 건수 +1 (Netlify Blobs 'grant-metrics')
//   GET  /api/metrics  최근 N일 건수(기본 30, 최대 90) — 환경변수 METRICS_TOKEN이 있고 헤더 x-beconic-metrics-token이 같을 때만
// 동시 요청이 겹치면 드물게 1건 덜 셀 수 있다(읽고-더해-쓰기). 흐름 비교용 근사치로 쓴다.
// ============================================================================
import { namedStore, setDeployHost } from '../lib/collect.mjs';

export const EVENTS = ['visit', 'persona_founder', 'persona_retail', 'persona_maker', 'persona_sme', 'results', 'results_link',
  'detail_open', 'help_open', 'call_click', 'kakao_click', 'mail_click', 'help_copy', 'pdf', 'result_copy', 'link_copy', 'more_info', 'search'];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
/** 한국시간 날짜(YYYY-MM-DD) */
export const kstDay = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);

export async function record(event, now = Date.now()) {
  if (!EVENTS.includes(event)) return false;
  const store = await namedStore('grant-metrics');
  const key = kstDay(now);
  const day = (await store.get(key, { type: 'json' })) || {};
  day[event] = (day[event] || 0) + 1;
  await store.setJSON(key, day);
  return true;
}
export async function read(days = 30, now = Date.now()) {
  const store = await namedStore('grant-metrics');
  const out = {};
  for (let i = 0; i < days; i++) { const k = kstDay(now - i * 86400e3); const d = await store.get(k, { type: 'json' }); if (d) out[k] = d; }
  return out;
}

export default async (req, context) => {
  try { setDeployHost(new URL(req.url).host, context?.deploy?.context); } catch { setDeployHost(null, context?.deploy?.context); }
  if (req.method === 'POST') {
    const raw = (await req.text()).slice(0, 64).trim();
    try { await record(raw); } catch { /* 측정 실패는 화면에 영향 없음 */ }
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }
  if (req.method === 'GET') {
    const token = process.env.METRICS_TOKEN;
    if (!token || req.headers.get('x-beconic-metrics-token') !== token) return json({ error: 'not found' }, 404);
    const n = Math.min(90, Math.max(1, parseInt(new URL(req.url).searchParams.get('days') || '30', 10) || 30));
    return json({ days: n, counts: await read(n) });
  }
  return json({ error: 'method not allowed' }, 405);
};

export const config = { path: ['/api/e', '/api/metrics'] };
