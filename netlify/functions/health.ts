// GET /api/health — 연동 상태 신호등(원문 DB·의미 검색·Claude·작업 저장소). 키 값·주소는 응답에 넣지 않는다.
// 같은 함수 인스턴스에서는 60초 동안 결과를 재사용한다(Claude 확인은 모델 정보 조회라 토큰 비용 없음).
import Anthropic from '@anthropic-ai/sdk';
import { blobJobStore } from '../../src/ai/blob-store';
import { checkHealth, type HealthDeps, type HealthReport } from '../../src/ai/health';

const TTL = 60_000;
let cache: { at: number; report: HealthReport } | null = null;

const defaultDeps: HealthDeps = {
  claudeClient: (key) => new Anthropic({ apiKey: key, timeout: 8_000, maxRetries: 0 }),
  store: blobJobStore,
};

export async function handle(req: Request, env: Record<string, string | undefined>, deps: HealthDeps = defaultDeps, now = Date.now()): Promise<Response> {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'GET만 지원' }), { status: 405 });
  const fresh = new URL(req.url).searchParams.has('refresh');
  // '다시 점검'도 10초에 한 번까지만(외부에서 반복 호출해 API 한도를 쓰지 못하게)
  if (!cache || now - cache.at > TTL || (fresh && now - cache.at > 10_000)) cache = { at: now, report: await checkHealth(env, deps) };
  return new Response(JSON.stringify(cache.report), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** 테스트용 */
export const resetHealthCache = () => {
  cache = null;
};

export default (req: Request) => handle(req, process.env);

export const config = { path: '/api/health' };
