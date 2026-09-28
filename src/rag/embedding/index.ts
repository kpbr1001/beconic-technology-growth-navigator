// 환경변수로 임베딩 공급자를 고른다. 키가 없거나 공급자 미설정이면 '비활성' 공급자를 반환하고
// 애플리케이션은 계속 동작한다(의미 검색만 꺼지고 키워드/FTS 검색은 유지).
import { disabledEmbeddingProvider } from './disabled';
import { voyageEmbeddingProvider } from './voyage';
import type { EmbeddingProvider } from './types';

export type EmbeddingEnv = Partial<Record<'EMBEDDING_PROVIDER' | 'EMBEDDING_MODEL' | 'EMBEDDING_DIMENSIONS' | 'VOYAGE_API_KEY', string>>;

/** 공급자 등록부: 새 공급자는 여기에 한 줄 추가 */
const REGISTRY: Record<string, (env: EmbeddingEnv) => EmbeddingProvider> = {
  voyage: (env) => {
    if (!env.VOYAGE_API_KEY) return disabledEmbeddingProvider('VOYAGE_API_KEY 미설정 — 의미 검색 비활성, 키워드 검색만 사용');
    return voyageEmbeddingProvider({
      apiKey: env.VOYAGE_API_KEY,
      model: env.EMBEDDING_MODEL || 'voyage-4',
      dimensions: env.EMBEDDING_DIMENSIONS ? Number(env.EMBEDDING_DIMENSIONS) : 1024,
    });
  },
};

export function createEmbeddingProvider(env: EmbeddingEnv): EmbeddingProvider {
  const id = (env.EMBEDDING_PROVIDER || '').trim().toLowerCase();
  if (!id || id === 'none') return disabledEmbeddingProvider('EMBEDDING_PROVIDER 미설정 — 의미 검색 비활성, 키워드 검색만 사용');
  const factory = REGISTRY[id];
  if (!factory) return disabledEmbeddingProvider(`알 수 없는 EMBEDDING_PROVIDER '${id}' — 의미 검색 비활성`);
  return factory(env);
}

export * from './types';
export { disabledEmbeddingProvider } from './disabled';
export { voyageEmbeddingProvider } from './voyage';
