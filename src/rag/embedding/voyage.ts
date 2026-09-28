// Voyage AI 어댑터 (Phase 3 1차 후보). SDK 의존성 없이 HTTP 호출만 사용한다.
// 키는 서버 환경변수 VOYAGE_API_KEY에서만 주입받는다.
import { EmbeddingUnavailableError, type EmbedOptions, type EmbeddingProvider } from './types';

export interface VoyageConfig {
  apiKey: string;
  model: string;
  dimensions?: number;
  batchSize?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
}

export function voyageEmbeddingProvider(cfg: VoyageConfig): EmbeddingProvider {
  const endpoint = cfg.endpoint ?? 'https://api.voyageai.com/v1/embeddings';
  const batchSize = cfg.batchSize ?? 128;
  const doFetch = cfg.fetchImpl ?? fetch;

  async function call(texts: string[], { inputType }: EmbedOptions): Promise<number[][]> {
    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          input: texts,
          model: cfg.model,
          input_type: inputType,
          ...(cfg.dimensions ? { output_dimension: cfg.dimensions } : {}),
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000),
      });
    } catch (e) {
      throw new EmbeddingUnavailableError('Voyage 호출 실패(네트워크·타임아웃)', e);
    }
    // 응답 본문에 키가 섞일 일은 없지만, 오류 메시지에는 상태코드만 남긴다.
    if (!res.ok) throw new EmbeddingUnavailableError(`Voyage 호출 실패(HTTP ${res.status})`);
    const json = (await res.json()) as VoyageResponse;
    return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  return {
    id: 'voyage',
    model: cfg.model,
    dimensions: cfg.dimensions ?? null,
    enabled: true,
    async embedText(text, options) {
      return (await call([text], options))[0];
    },
    async embedBatch(texts, options) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) out.push(...(await call(texts.slice(i, i + batchSize), options)));
      return out;
    },
  };
}
