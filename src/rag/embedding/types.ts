// Embedding provider adapter 인터페이스. 공급자(Voyage 등)는 이 인터페이스 뒤에 숨기고 교체 가능하게 한다.
// ⚠️ 서버(Netlify Functions·ingestion 스크립트) 전용. 브라우저 코드에서 import 금지.

export type EmbeddingInputType = 'query' | 'document';

export interface EmbedOptions {
  /** 검색 질의용/문서 청크용 구분 (Voyage 등 비대칭 모델에서 품질 차이) */
  inputType: EmbeddingInputType;
}

export interface EmbeddingProvider {
  /** 'voyage' | 'disabled' | 향후 공급자 id */
  readonly id: string;
  readonly model: string | null;
  readonly dimensions: number | null;
  /** false면 의미 검색을 건너뛰고 키워드 검색만 사용한다 */
  readonly enabled: boolean;
  /** 비활성 사유 (로그·UI 안내용, 키 값은 절대 포함하지 않음) */
  readonly disabledReason?: string;
  embedText(text: string, options: EmbedOptions): Promise<number[]>;
  embedBatch(texts: string[], options: EmbedOptions): Promise<number[][]>;
}

/** 임베딩을 쓸 수 없을 때(키 없음·공급자 미설정·호출 실패) 던지는 오류 */
export class EmbeddingUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}
