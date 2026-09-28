// Hybrid 검색 조합기: Keyword/FTS + Semantic(vector) → RRF 병합.
// 임베딩이 비활성(키 없음 등)이거나 의미 검색이 실패하면 키워드 결과만으로 응답한다(fallback).
// 저장소(Supabase)는 Phase 3에서 Retriever 구현체로 주입한다. ⚠️ 서버 전용.
import { EmbeddingUnavailableError, type EmbeddingProvider } from './embedding/types';

export interface SearchFilters {
  roadmapVersion?: string[];
  roadmapType?: string[];
  strategicField?: string[];
  activeOnly?: boolean;
}

/** 검색 후보 1건. 출처(문서·버전·페이지)는 원문 근거 추적을 위해 반드시 보존한다. */
export interface RankedChunk {
  chunkId: string;
  score: number;
  sourceDocument: string;
  roadmapVersion: string;
  page: number | null;
  matchedTerms?: string[];
  text: string;
}

export interface KeywordRetriever {
  search(query: string, filters: SearchFilters, limit: number): Promise<RankedChunk[]>;
}

export interface VectorRetriever {
  search(embedding: number[], filters: SearchFilters, limit: number): Promise<RankedChunk[]>;
}

export interface HybridSearchDeps {
  keyword: KeywordRetriever;
  vector?: VectorRetriever;
  embedder: EmbeddingProvider;
}

export interface HybridSearchOptions {
  filters?: SearchFilters;
  /** 각 검색기에서 가져올 후보 수 (RAG_MATCH_COUNT) */
  matchCount?: number;
  /** 최종 반환 수 (RAG_FINAL_COUNT) */
  finalCount?: number;
  rrfK?: number;
  keywordWeight?: number;
  semanticWeight?: number;
}

export interface FusedChunk extends RankedChunk {
  keywordRank: number | null;
  semanticRank: number | null;
  fusedScore: number;
}

export interface HybridSearchResult {
  mode: 'hybrid' | 'keyword_only';
  /** keyword_only일 때 의미 검색을 쓰지 못한 이유 */
  semanticDisabledReason?: string;
  results: FusedChunk[];
}

/** Reciprocal Rank Fusion: score = Σ weight / (k + rank), rank는 1부터 */
export function reciprocalRankFusion(
  keyword: RankedChunk[],
  semantic: RankedChunk[],
  { rrfK = 50, keywordWeight = 1, semanticWeight = 1 } = {},
): FusedChunk[] {
  const map = new Map<string, FusedChunk>();
  const add = (list: RankedChunk[], kind: 'keyword' | 'semantic', w: number) =>
    list.forEach((c, i) => {
      const cur = map.get(c.chunkId) ?? { ...c, keywordRank: null, semanticRank: null, fusedScore: 0 };
      if (kind === 'keyword') cur.keywordRank = i + 1;
      else cur.semanticRank = i + 1;
      cur.fusedScore += w / (rrfK + i + 1);
      map.set(c.chunkId, cur);
    });
  add(keyword, 'keyword', keywordWeight);
  add(semantic, 'semantic', semanticWeight);
  return [...map.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

export async function hybridSearch(
  query: string,
  { keyword, vector, embedder }: HybridSearchDeps,
  opts: HybridSearchOptions = {},
): Promise<HybridSearchResult> {
  const filters = opts.filters ?? {};
  const matchCount = opts.matchCount ?? 30;
  const finalCount = opts.finalCount ?? 8;

  // 의미 검색을 기다리는 동안 키워드 검색이 실패해도 처리되지 않은 오류가 되지 않도록 결과를 감싼다
  const keywordP = keyword.search(query, filters, matchCount).then(
    (r) => ({ ok: true as const, r }),
    (e: unknown) => ({ ok: false as const, e }),
  );

  let semanticDisabledReason: string | undefined;
  let semantic: RankedChunk[] = [];
  if (!embedder.enabled) semanticDisabledReason = embedder.disabledReason ?? '임베딩 공급자 비활성';
  else if (!vector) semanticDisabledReason = '벡터 검색기 미구성';
  else {
    try {
      const qv = await embedder.embedText(query, { inputType: 'query' });
      semantic = await vector.search(qv, filters, matchCount);
    } catch (e) {
      // 의미 검색 실패는 전체 검색 실패가 아니다: 키워드 결과로 계속 진행
      semanticDisabledReason = e instanceof EmbeddingUnavailableError ? e.message : '의미 검색 실패';
    }
  }

  const kw = await keywordP;
  if (!kw.ok) throw kw.e; // 키워드 검색 실패는 대체 수단이 없으므로 그대로 오류
  const fused = reciprocalRankFusion(kw.r, semantic, opts).slice(0, finalCount);
  return semanticDisabledReason
    ? { mode: 'keyword_only', semanticDisabledReason, results: fused }
    : { mode: 'hybrid', results: fused };
}
