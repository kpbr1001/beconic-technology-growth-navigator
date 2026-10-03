// POST /api/roadmap-evidence — 로드맵 후보 품목별 원문 근거(발췌·출처·쪽)
// 비밀키(SUPABASE_SERVICE_ROLE_KEY·VOYAGE_API_KEY)는 Netlify 환경변수에서만 읽는다.
//  - Supabase 미설정 → 200 {status:'not_configured'} (화면은 원문 색인 후보만 표시)
//  - Voyage 키 없음 → 키워드 검색만(mode:'keyword_only')
import { createEmbeddingProvider } from '../../src/rag/embedding';
import { findEvidence } from '../../src/rag/evidence';
import { supabaseConfigFromEnv } from '../../src/rag/supabase';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const UID = /^[A-Za-z0-9가-힣@&\-_.]{3,80}$/;

export async function handle(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST만 지원' }, 405);
  let body: { query?: unknown; itemUids?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON 본문 필요' }, 400);
  }
  const query = typeof body.query === 'string' ? body.query : '';
  const itemUids = Array.isArray(body.itemUids) ? body.itemUids.filter((x): x is string => typeof x === 'string' && UID.test(x)) : [];
  if (!query.trim() || !itemUids.length) return json({ error: 'query와 itemUids 필요' }, 400);
  try {
    const res = await findEvidence({ query, itemUids }, {
      supabase: supabaseConfigFromEnv(env),
      embedder: createEmbeddingProvider(env),
    }, {
      rrfK: Number(env.RAG_RRF_K) || undefined,
      keywordWeight: Number(env.RAG_KEYWORD_WEIGHT) || undefined,
      semanticWeight: Number(env.RAG_SEMANTIC_WEIGHT) || undefined,
    });
    return json(res);
  } catch (e) {
    // 내부 오류 상세(키·URL)는 응답에 넣지 않는다
    console.error('roadmap-evidence 실패', e instanceof Error ? e.message : e);
    return json({ status: 'error', items: {} }, 502);
  }
}

export default (req: Request) => handle(req, process.env);

export const config = { path: '/api/roadmap-evidence' };
