// Claude 해석 작업(job) — 백그라운드 처리용. Claude 응답이 일반 함수 제한 시간을 넘기므로
// 접수(동기 함수) → 처리(백그라운드 함수, 최대 15분) → 조회(동기 함수)로 나눈다. 저장소는 Netlify Blobs.
import Anthropic from '@anthropic-ai/sdk';
import { createEmbeddingProvider } from '../rag/embedding';
import { findEvidence, type EvidenceQuote } from '../rag/evidence';
import { supabaseConfigFromEnv } from '../rag/supabase';
import { DEFAULT_MODEL, interpretAssessment, type Effort, type InterpretResponse } from './interpret';
import type { InterpretRequest } from './schema';
import { discoverTechnologies, type DiscoverRequest, type DiscoverResponse } from './discover';

type Env = Record<string, string | undefined>;
export type PublicResult =
  | Exclude<InterpretResponse, { status: 'ok' }>
  | Omit<Extract<InterpretResponse, { status: 'ok' }>, 'usage'>
  | Omit<Extract<DiscoverResponse, { status: 'ok' }>, 'usage'>;

export interface Job {
  status: 'queued' | 'running' | 'done';
  createdAt: number;
  /** 처리 전에만 보관. 처리가 끝나면 지운다(입력 원문을 남기지 않음) */
  request?: InterpretRequest | DiscoverRequest;
  result?: PublicResult | { status: 'fallback'; reason: 'api_error' | 'timeout' };
}

export interface JobStore {
  get(id: string): Promise<Job | null>;
  set(id: string, job: Job): Promise<void>;
}

export const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** 이 시간이 지나도 끝나지 않은 작업은 실패로 본다(백그라운드 함수 제한 15분보다 짧게) */
export const JOB_STALE_MS = 5 * 60_000;
const EFFORTS: Effort[] = ['low', 'medium', 'high'];

function evidenceQuery(req: InterpretRequest): string {
  const c = req.input.company;
  const techs = req.input.inventory.filter((t) => t.critical).map((t) => t.name);
  return [c.sectorDetail, ...techs, c.product, req.input.discovery.hardPart].filter(Boolean).join(' ').slice(0, 600);
}

export const defaultClient = (key: string) => new Anthropic({ apiKey: key, timeout: 180_000, maxRetries: 1 });

/** 해석 1건 처리: 원문 근거 조회(실패해도 진행) → Claude → 가드레일. 오류는 fallback으로 바꾼다 */
export async function runInterpretation(
  req: InterpretRequest,
  env: Env,
  makeClient: (key: string) => Pick<Anthropic, 'beta'> = defaultClient,
): Promise<Job['result']> {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { status: 'not_configured' };
  const started = Date.now();
  let evidence: Record<string, EvidenceQuote[]> = {};
  if (req.roadmap.length) {
    try {
      const ev = await findEvidence(
        { query: evidenceQuery(req), itemUids: req.roadmap.map((x) => x.uid) },
        { supabase: supabaseConfigFromEnv(env), embedder: createEmbeddingProvider(env) },
      );
      evidence = ev.items;
    } catch (e) {
      console.error('ai-interpret 원문 근거 조회 실패', e instanceof Error ? e.message : e);
    }
  }
  try {
    const effort = EFFORTS.includes(env.AI_INTERPRET_EFFORT as Effort) ? (env.AI_INTERPRET_EFFORT as Effort) : 'low';
    const res = await interpretAssessment(req, {
      client: makeClient(key),
      model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
      effort,
      evidence,
    });
    const ms = Date.now() - started;
    if (res.status === 'ok') {
      console.log('ai-interpret ok', JSON.stringify({ model: res.model, ms, usage: res.usage, removed: res.removed, kinds: res.violations.map((v) => v.kind) }));
      const { usage: _u, ...pub } = res; // eslint-disable-line @typescript-eslint/no-unused-vars
      return pub;
    }
    console.warn('ai-interpret fallback', JSON.stringify({ ...res, ms }));
    return res;
  } catch (e) {
    console.error('ai-interpret 실패', errorKind(e), `${Date.now() - started}ms`, e instanceof Anthropic.APIError ? e.message.slice(0, 300) : '');
    return { status: 'fallback', reason: 'api_error' };
  }
}

/** 키·요청 본문은 남기지 않는다. 오류 종류·HTTP 상태만 기록 */
function errorKind(e: unknown): string {
  return e instanceof Anthropic.AuthenticationError ? 'auth'
    : e instanceof Anthropic.PermissionDeniedError ? 'permission'
      : e instanceof Anthropic.RateLimitError ? 'rate_limit'
        : e instanceof Anthropic.BadRequestError ? 'bad_request'
          : e instanceof Anthropic.APIConnectionTimeoutError ? 'timeout'
            : e instanceof Anthropic.APIError ? `api_${e.status ?? 'unknown'}`
              : 'unknown';
}

/** 기술 후보 찾기 1건(원문 근거 조회 없음) */
export async function runDiscovery(
  req: DiscoverRequest,
  env: Env,
  makeClient: (key: string) => Pick<Anthropic, 'beta'> = defaultClient,
): Promise<Job['result']> {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { status: 'not_configured' };
  const started = Date.now();
  try {
    const effort = EFFORTS.includes(env.AI_INTERPRET_EFFORT as Effort) ? (env.AI_INTERPRET_EFFORT as Effort) : 'low';
    const res = await discoverTechnologies(req, { client: makeClient(key), model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL, effort });
    const ms = Date.now() - started;
    if (res.status === 'ok') {
      console.log('ai-discover ok', JSON.stringify({ model: res.model, ms, usage: res.usage, n: res.candidates.length, removed: res.removed }));
      const { usage: _u, ...pub } = res; // eslint-disable-line @typescript-eslint/no-unused-vars
      return pub;
    }
    console.warn('ai-discover fallback', JSON.stringify({ ...res, ms }));
    return res;
  } catch (e) {
    console.error('ai-discover 실패', errorKind(e), `${Date.now() - started}ms`, e instanceof Anthropic.APIError ? e.message.slice(0, 300) : '');
    return { status: 'fallback', reason: 'api_error' };
  }
}

/** 백그라운드 함수 본체: 대기 중인 작업만 처리(중복·외부 호출 무시), 끝나면 입력 원문을 지운다 */
export async function processJob(id: string, store: JobStore, env: Env, makeClient?: (key: string) => Pick<Anthropic, 'beta'>): Promise<boolean> {
  if (!JOB_ID.test(id)) return false;
  const job = await store.get(id);
  if (!job || job.status !== 'queued' || !job.request) return false;
  await store.set(id, { ...job, status: 'running' });
  const req = job.request;
  const result = 'task' in req && req.task === 'discover' ? await runDiscovery(req, env, makeClient) : await runInterpretation(req as InterpretRequest, env, makeClient);
  await store.set(id, { status: 'done', createdAt: job.createdAt, result });
  return true;
}

/** 조회 응답: 진행 중이면 상태만, 끝났으면 결과. 너무 오래 걸린 작업은 시간 초과 fallback */
export function jobView(job: Job | null, now = Date.now()): { status: string; [k: string]: unknown } {
  if (!job) return { status: 'not_found' };
  if (job.status === 'done' && job.result) return job.result;
  if (now - job.createdAt > JOB_STALE_MS) return { status: 'fallback', reason: 'timeout' };
  return { status: job.status };
}
