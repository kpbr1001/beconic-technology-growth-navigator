// /api/ai-interpret — Claude 진단 해석(Phase 5 Task 2) 접수·조회
// Claude 응답은 일반 함수 제한 시간을 넘기므로 백그라운드 함수(ai-interpret-background)에서 처리한다.
//  - POST: 입력 검증 → 작업 접수(Netlify Blobs) → 백그라운드 함수 호출 → 202 {status:'queued', job}
//  - GET ?job=<id>: {status:'queued'|'running'} 또는 결과({status:'ok'|'fallback'|'not_configured', …})
//  - ANTHROPIC_API_KEY 없음 → 200 {status:'not_configured'} (화면은 규칙 기반 해석만)
// 비밀키는 Netlify 환경변수에서만 읽고, 응답·로그에 키와 입력 원문을 남기지 않는다.
import { blobJobStore } from '../../src/ai/blob-store';
import { JOB_ID, jobView, type JobStore } from '../../src/ai/jobs';
import { InterpretRequest } from '../../src/ai/schema';
import type { DiscoverRequest } from '../../src/ai/discover';

type Env = Record<string, string | undefined>;
const MAX_BODY = 60_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const hostOf = (u: string | undefined) => {
  try {
    return u ? new URL(u).hostname : '';
  } catch {
    return '';
  }
};

/** 이 사이트(운영·배포 미리보기·로컬)에서 온 요청만 받는다. 유료 API를 외부에서 마음대로 부르지 못하게 하는 1차 방어 */
export function originAllowed(origin: string | null, env: Env, requestUrl?: string): boolean {
  const host = hostOf(origin ?? undefined);
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return env.CONTEXT !== 'production';
  // 같은 사이트에서 보낸 요청(요청 주소의 호스트와 같음)
  if (requestUrl && host === hostOf(requestUrl)) return true;
  const sites = [env.URL, env.DEPLOY_PRIME_URL, env.DEPLOY_URL, env.AI_ALLOWED_ORIGIN].map(hostOf).filter(Boolean);
  // 배포 미리보기: deploy-preview-6--<사이트>.netlify.app
  return sites.some((s) => host === s || host.endsWith(`--${s}`));
}

export interface Deps {
  store: () => JobStore;
  /** 백그라운드 함수 호출(성공 여부) */
  trigger: (requestUrl: string, job: string) => Promise<boolean>;
  newId: () => string;
}

const defaultDeps: Deps = {
  store: blobJobStore,
  trigger: async (requestUrl, job) => {
    const res = await fetch(new URL('/.netlify/functions/ai-interpret-background', requestUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job }),
    });
    return res.status === 202 || res.ok;
  },
  newId: () => crypto.randomUUID(),
};

/** 요청 형식(해석·기술 후보 찾기)만 다르고 접수·조회 절차는 같다 */
type RequestSchema = { safeParse: (x: unknown) => { success: true; data: InterpretRequest | DiscoverRequest } | { success: false } };

export async function handle(req: Request, env: Env, deps: Deps = defaultDeps, schema: RequestSchema = InterpretRequest as unknown as RequestSchema): Promise<Response> {
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('job') ?? '';
    if (!JOB_ID.test(id)) return json({ error: '작업 번호 형식 오류' }, 400);
    try {
      return json(jobView(await deps.store().get(id)));
    } catch (e) {
      console.error('ai-interpret 조회 실패', e instanceof Error ? e.message.slice(0, 200) : '');
      return json({ status: 'fallback', reason: 'api_error' });
    }
  }
  if (req.method !== 'POST') return json({ error: 'GET·POST만 지원' }, 405);
  if (!originAllowed(req.headers.get('origin'), env, req.url)) return json({ error: '허용되지 않은 출처' }, 403);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: '요청이 너무 큽니다' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON 본문 필요' }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: '입력 형식 오류' }, 400);
  if (!env.ANTHROPIC_API_KEY?.trim()) return json({ status: 'not_configured' });

  const id = deps.newId();
  try {
    await deps.store().set(id, { status: 'queued', createdAt: Date.now(), request: parsed.data });
    if (!(await deps.trigger(req.url, id))) throw new Error('백그라운드 함수 호출 실패');
    return json({ status: 'queued', job: id }, 202);
  } catch (e) {
    console.error('ai-interpret 접수 실패', e instanceof Error ? e.message.slice(0, 200) : '');
    return json({ status: 'fallback', reason: 'api_error' });
  }
}

export default (req: Request) => handle(req, process.env);

export const config = { path: '/api/ai-interpret' };
