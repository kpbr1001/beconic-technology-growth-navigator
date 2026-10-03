// Supabase(PostgREST) 검색기: supabase/migrations/*_roadmap_kb.sql 의 RPC를 HTTP로 호출한다(SDK 없음).
// ⚠️ 서버 전용 — service_role 키를 쓴다. 브라우저 코드에서 import 금지(번들 비밀키 검사 대상).
import { terms } from '../roadmap/terms';
import type { KeywordRetriever, RankedChunk, SearchFilters, VectorRetriever } from './hybrid-search';

export interface SupabaseConfig {
  /** 예: https://xxxx.supabase.co (REST 경로 /rest/v1 은 자동으로 붙인다) */
  url: string;
  /** 서버용 키(service_role 또는 sb_secret_…). 로그·응답에 절대 포함하지 않는다 */
  serviceKey: string;
  /** REST 기본 경로를 직접 지정(로컬 PostgREST 검증용). 생략 시 `${url}/rest/v1` */
  restUrl?: string;
  fetchImpl?: typeof fetch;
}

export type SupabaseEnv = Partial<Record<'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'SUPABASE_REST_URL', string>>;

/** 환경변수가 없으면 null(앱은 원문 색인 후보로 계속 동작) */
export function supabaseConfigFromEnv(env: SupabaseEnv): SupabaseConfig | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  // 붙여넣을 때 흔한 실수(앞뒤 공백·따옴표, 끝의 /rest/v1)를 정리한다
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, '');
  const url = clean(env.SUPABASE_URL).replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  return { url, serviceKey: clean(env.SUPABASE_SERVICE_ROLE_KEY), restUrl: env.SUPABASE_REST_URL };
}

/** 검색 결과 행 + 원문 근거 추적용 메타 */
export interface RoadmapChunkRow {
  chunk_id: string;
  score: number;
  matched_terms: string[] | null;
  chunk_type: 'item' | 'technology';
  item_uid: string;
  item_code: string | null;
  item_no: string | null;
  item_name: string;
  technology_name: string | null;
  trl_raw: string | null;
  trl_basis: string | null;
  source_file: string;
  roadmap_version: string;
  roadmap_type: string;
  strategic_field: string;
  subfield: string | null;
  page_start: number | null;
  printed_page_start: number | null;
  contextual_prefix: string;
  content: string;
}

export interface RoadmapRankedChunk extends RankedChunk {
  row: RoadmapChunkRow;
}

export class SupabaseRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SupabaseRequestError';
  }
}

function headers(cfg: SupabaseConfig): Record<string, string> {
  const h: Record<string, string> = { apikey: cfg.serviceKey, 'content-type': 'application/json' };
  // 기존 JWT 형식 키(service_role)는 Authorization에도 넣는다. 새 sb_secret_ 키는 apikey 헤더만 사용.
  if (cfg.serviceKey.split('.').length === 3) h.authorization = `Bearer ${cfg.serviceKey}`;
  return h;
}

async function rpc(cfg: SupabaseConfig, fn: string, body: unknown): Promise<RoadmapChunkRow[]> {
  const base = cfg.restUrl?.replace(/\/+$/, '') ?? `${cfg.url}/rest/v1`;
  const res = await (cfg.fetchImpl ?? fetch)(`${base}/rpc/${fn}`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // 응답 본문(오류 메시지)만 남기고 요청 헤더·키는 남기지 않는다
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new SupabaseRequestError(`Supabase ${fn} 실패 (HTTP ${res.status}) ${detail}`, res.status);
  }
  return (await res.json()) as RoadmapChunkRow[];
}

function filterArgs(f: SearchFilters) {
  return {
    p_versions: f.roadmapVersion ?? null,
    p_fields: f.strategicField ?? null,
    p_types: f.roadmapType ?? null,
    p_item_uids: f.itemUids ?? null,
    p_active_only: f.activeOnly ?? true,
  };
}

function toRanked(row: RoadmapChunkRow): RoadmapRankedChunk {
  return {
    chunkId: row.chunk_id,
    score: row.score,
    sourceDocument: row.source_file,
    roadmapVersion: row.roadmap_version,
    page: row.printed_page_start,
    matchedTerms: row.matched_terms ?? undefined,
    text: row.content,
    row,
  };
}

export function supabaseKeywordRetriever(cfg: SupabaseConfig): KeywordRetriever {
  return {
    async search(query: string, filters: SearchFilters, limit: number) {
      const t = terms(query);
      if (!t.length) return [];
      const rows = await rpc(cfg, 'search_roadmap_keyword', { p_terms: t, ...filterArgs(filters), p_match_count: limit });
      return rows.map(toRanked);
    },
  };
}

export function supabaseVectorRetriever(cfg: SupabaseConfig): VectorRetriever {
  return {
    async search(embedding: number[], filters: SearchFilters, limit: number) {
      // pgvector 입력 형식: '[0.1,0.2,…]'
      const rows = await rpc(cfg, 'search_roadmap_semantic', {
        p_embedding: `[${embedding.join(',')}]`,
        ...filterArgs(filters),
        p_match_count: limit,
      });
      return rows.map(toRanked);
    },
  };
}

/** 적재: 문단 upsert(같은 chunk_id는 갱신) */
export async function upsertChunks(cfg: SupabaseConfig, rows: Record<string, unknown>[]): Promise<void> {
  const base = cfg.restUrl?.replace(/\/+$/, '') ?? `${cfg.url}/rest/v1`;
  const res = await (cfg.fetchImpl ?? fetch)(`${base}/roadmap_chunks?on_conflict=chunk_id`, {
    method: 'POST',
    headers: { ...headers(cfg), prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new SupabaseRequestError(`Supabase upsert 실패 (HTTP ${res.status}) ${(await res.text()).slice(0, 200)}`, res.status);
}

/** 적재 후 다른 KB 버전 행은 비활성(삭제하지 않고 이력 보존) */
export async function deactivateOtherVersions(cfg: SupabaseConfig, kbVersion: string): Promise<void> {
  const base = cfg.restUrl?.replace(/\/+$/, '') ?? `${cfg.url}/rest/v1`;
  const res = await (cfg.fetchImpl ?? fetch)(`${base}/roadmap_chunks?kb_version=neq.${encodeURIComponent(kbVersion)}&is_active=eq.true`, {
    method: 'PATCH',
    headers: { ...headers(cfg), prefer: 'return=minimal' },
    body: JSON.stringify({ is_active: false }),
  });
  if (!res.ok) throw new SupabaseRequestError(`Supabase 비활성화 실패 (HTTP ${res.status})`, res.status);
}
