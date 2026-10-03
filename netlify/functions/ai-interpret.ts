// POST /api/ai-interpret — Claude 진단 해석(Phase 5 Task 2)
// 비밀키(ANTHROPIC_API_KEY·SUPABASE_SERVICE_ROLE_KEY)는 Netlify 환경변수에서만 읽는다.
//  - ANTHROPIC_API_KEY 없음 → 200 {status:'not_configured'} (화면은 규칙 기반 해석만)
//  - 거절·형식 오류·API 오류 → 200 {status:'fallback'} (화면은 규칙 기반 해석 유지)
//  - 점수는 서버가 Rule Engine으로 다시 계산한 값만 쓴다(브라우저가 보낸 점수는 받지 않음)
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, interpretAssessment, type Effort } from '../../src/ai/interpret';
import { InterpretRequest } from '../../src/ai/schema';
import { createEmbeddingProvider } from '../../src/rag/embedding';
import { findEvidence } from '../../src/rag/evidence';
import { supabaseConfigFromEnv } from '../../src/rag/supabase';

type Env = Record<string, string | undefined>;
const MAX_BODY = 60_000;
const EFFORTS: Effort[] = ['low', 'medium', 'high'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** 이 사이트(운영·배포 미리보기·로컬)에서 온 요청만 받는다. 유료 API를 외부에서 마음대로 부르지 못하게 하는 1차 방어 */
export function originAllowed(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '127.0.0.1') return env.CONTEXT !== 'production';
  const sites = [env.URL, env.DEPLOY_PRIME_URL, env.DEPLOY_URL, env.AI_ALLOWED_ORIGIN]
    .filter((x): x is string => Boolean(x))
    .map((u) => {
      try {
        return new URL(u).hostname;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  // 배포 미리보기: deploy-preview-6--<사이트>.netlify.app
  return sites.some((s) => host === s || host.endsWith(`--${s}`));
}

function evidenceQuery(req: InterpretRequest): string {
  const c = req.input.company;
  const techs = req.input.inventory.filter((t) => t.critical).map((t) => t.name);
  return [c.sectorDetail, ...techs, c.product, req.input.discovery.hardPart].filter(Boolean).join(' ').slice(0, 600);
}

export async function handle(req: Request, env: Env, makeClient = (key: string) => new Anthropic({ apiKey: key, timeout: 50_000, maxRetries: 1 })): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST만 지원' }, 405);
  if (!originAllowed(req.headers.get('origin'), env)) return json({ error: '허용되지 않은 출처' }, 403);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: '요청이 너무 큽니다' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON 본문 필요' }, 400);
  }
  const parsed = InterpretRequest.safeParse(body);
  if (!parsed.success) return json({ error: '입력 형식 오류' }, 400);
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return json({ status: 'not_configured' });

  const started = Date.now();
  // 원문 근거(설정된 경우): 실패해도 해석은 진행(로드맵 노트만 빠짐)
  let evidence = {};
  if (parsed.data.roadmap.length) {
    try {
      const ev = await findEvidence(
        { query: evidenceQuery(parsed.data), itemUids: parsed.data.roadmap.map((x) => x.uid) },
        { supabase: supabaseConfigFromEnv(env), embedder: createEmbeddingProvider(env) },
      );
      evidence = ev.items;
    } catch (e) {
      console.error('ai-interpret 원문 근거 조회 실패', e instanceof Error ? e.message : e);
    }
  }

  try {
    const effort = EFFORTS.includes(env.AI_INTERPRET_EFFORT as Effort) ? (env.AI_INTERPRET_EFFORT as Effort) : 'low';
    const res = await interpretAssessment(parsed.data, {
      client: makeClient(key),
      model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
      effort,
      evidence,
    });
    const ms = Date.now() - started;
    if (res.status === 'ok') {
      console.log('ai-interpret ok', JSON.stringify({ model: res.model, ms, usage: res.usage, removed: res.removed, kinds: res.violations.map((v) => v.kind) }));
      return json({ ...res, usage: undefined });
    }
    console.warn('ai-interpret fallback', JSON.stringify({ ...res, ms }));
    return json(res);
  } catch (e) {
    // 키·요청 본문은 남기지 않는다. 오류 종류·HTTP 상태만 기록
    const kind =
      e instanceof Anthropic.AuthenticationError ? 'auth'
        : e instanceof Anthropic.PermissionDeniedError ? 'permission'
          : e instanceof Anthropic.RateLimitError ? 'rate_limit'
            : e instanceof Anthropic.BadRequestError ? 'bad_request'
              : e instanceof Anthropic.APIConnectionTimeoutError ? 'timeout'
                : e instanceof Anthropic.APIError ? `api_${e.status ?? 'unknown'}`
                  : 'unknown';
    console.error('ai-interpret 실패', kind, `${Date.now() - started}ms`, e instanceof Anthropic.APIError ? e.message.slice(0, 300) : '');
    return json({ status: 'fallback', reason: 'api_error' });
  }
}

export default (req: Request) => handle(req, process.env);

export const config = { path: '/api/ai-interpret' };
