// BECONIC BM Navigator — 스트리밍 AI 프록시 (/api/claude-stream, Netlify Edge Function · Deno)
//   GET  : 상태 확인(무료) → { ok, keyConfigured }
//   POST : 운영 스위치 → 같은 사이트 출처 → 화면 요청 형식 → 사용량 한도 → Anthropic SSE 중계
// 잠금 규칙은 비스트리밍 함수와 같다(lib/guard.mjs). ANTHROPIC_API_KEY 는 Functions 범위 환경 변수.
import { getStore } from '@netlify/blobs';
import {
  ANTHROPIC_URL, anthropicHeaders, checkOrigin, fail, json, logBlocked, readJson, settings, takeQuota, today, validateBody,
} from '../../lib/guard.mjs';

export function createHandler({
  env = (k) => globalThis.Netlify?.env.get(k),
  store = () => getStore('bm-ai-usage'),
  fetchImpl = (...a) => fetch(...a),
  day = today,
} = {}) {
  return async (req, context) => {
    const s = settings(env);
    if (req.method === 'GET') return json(200, { ok: true, keyConfigured: Boolean(s.key) && !s.disabled });
    if (req.method !== 'POST') return fail(405, 'GET·POST 요청만 가능합니다.', { Allow: 'GET, POST' });
    if (s.disabled) return fail(503, 'AI 기능이 꺼져 있습니다(운영자 설정).');
    if (!s.key) return fail(503, '서버에 API 키가 설정되지 않았습니다.');

    const bad = checkOrigin(req, s.origins);
    if (bad) { logBlocked('edge', bad, req); return fail(403, '허용되지 않은 출처입니다.'); }

    const r = await readJson(req);
    if (r.error === 'too_large') { logBlocked('edge', 'too_large', req); return fail(413, '요청이 너무 큽니다.'); }
    if (r.error) { logBlocked('edge', 'bad_json', req); return fail(400, '요청 형식이 올바르지 않습니다.'); }
    const v = validateBody(r.value);
    if (!v.ok) { logBlocked('edge', v.reason, req); return fail(422, '허용되지 않은 요청 형식입니다.'); }

    const q = await takeQuota(store(), { ip: context?.ip, day: day(), dailyLimit: s.dailyLimit, ipLimit: s.ipLimit });
    if (q) { logBlocked('edge', q.reason, req); return fail(q.status, q.message); }

    let res;
    try {
      res = await fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        headers: anthropicHeaders(s.key),
        body: JSON.stringify({ ...v.body, stream: true }),
      });
    } catch {
      return fail(502, 'AI 서버에 연결하지 못했습니다.');
    }
    if (!res.ok || !res.body) {
      console.warn(`bm-ai-upstream edge status=${res.status}`);
      const status = res.status === 429 || res.status === 529 ? 429 : 502;
      return fail(status, status === 429 ? '요청이 많아 잠시 후 다시 시도해 주세요.' : 'AI 서버 오류가 발생했습니다.');
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}

export default createHandler();

export const config = { path: '/api/claude-stream' };
