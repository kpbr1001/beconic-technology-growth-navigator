// BECONIC BM Navigator — 비스트리밍 AI 프록시 (/.netlify/functions/claude, Netlify Functions v2)
//   GET  : 상태 확인(무료, Anthropic 미호출) → { ok, keyConfigured }
//   POST : 운영 스위치 → 같은 사이트 출처 → 화면 요청 형식 → 사용량 한도 → Anthropic 중계
// 스트리밍(엣지 함수 claude-stream)이 실패했을 때 화면이 이쪽으로 폴백한다. 잠금은 둘이 같다(lib/guard.mjs).
// ANTHROPIC_API_KEY 는 Netlify 환경 변수(Functions 범위)에만 둔다.
import { getStore } from '@netlify/blobs';
import {
  ANTHROPIC_URL, anthropicHeaders, checkOrigin, fail, json, logBlocked, readJson, settings, takeQuota, today, validateBody,
} from '../../lib/guard.mjs';

const UPSTREAM_TIMEOUT_MS = 25_000;

export function createHandler({
  env = (k) => process.env[k],
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
    if (bad) { logBlocked('fn', bad, req); return fail(403, '허용되지 않은 출처입니다.'); }

    const r = await readJson(req);
    if (r.error === 'too_large') { logBlocked('fn', 'too_large', req); return fail(413, '요청이 너무 큽니다.'); }
    if (r.error) { logBlocked('fn', 'bad_json', req); return fail(400, '요청 형식이 올바르지 않습니다.'); }
    const v = validateBody(r.value);
    if (!v.ok) { logBlocked('fn', v.reason, req); return fail(422, '허용되지 않은 요청 형식입니다.'); }

    const q = await takeQuota(store(), { ip: context?.ip || req.headers.get('x-nf-client-connection-ip'), day: day(), dailyLimit: s.dailyLimit, ipLimit: s.ipLimit });
    if (q) { logBlocked('fn', q.reason, req); return fail(q.status, q.message); }

    let res;
    try {
      res = await fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        headers: anthropicHeaders(s.key),
        body: JSON.stringify(v.body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return fail(504, 'AI 응답이 지연되었습니다.');
    }
    if (!res.ok) {
      // 업스트림 오류 본문은 그대로 넘기지 않는다(키·계정 정보 노출 방지). 상태 코드만 화면 분기용으로 전달.
      console.warn(`bm-ai-upstream fn status=${res.status}`);
      const status = res.status === 429 || res.status === 529 ? 429 : 502;
      return fail(status, status === 429 ? '요청이 많아 잠시 후 다시 시도해 주세요.' : 'AI 서버 오류가 발생했습니다.');
    }
    const data = await res.json();
    // 화면이 쓰는 항목만 돌려준다.
    return json(200, { content: (data.content || []).filter((b) => b && b.type === 'text').map((b) => ({ type: 'text', text: String(b.text || '') })), stop_reason: data.stop_reason || null });
  };
}

export default createHandler();
