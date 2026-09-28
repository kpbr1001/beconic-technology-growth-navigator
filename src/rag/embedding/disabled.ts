// 임베딩 비활성 공급자: 키·공급자 미설정 시 사용. 호출하면 EmbeddingUnavailableError.
import { EmbeddingUnavailableError, type EmbeddingProvider } from './types';

export function disabledEmbeddingProvider(reason: string): EmbeddingProvider {
  const fail = async (): Promise<never> => {
    throw new EmbeddingUnavailableError(reason);
  };
  return { id: 'disabled', model: null, dimensions: null, enabled: false, disabledReason: reason, embedText: fail, embedBatch: fail };
}
