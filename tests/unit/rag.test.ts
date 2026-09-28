// Embedding adapter·Hybrid 검색 fallback 테스트. 실제 Voyage 호출 없이(키 불필요) 동작해야 한다.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createEmbeddingProvider, EmbeddingUnavailableError, voyageEmbeddingProvider } from '../../src/rag/embedding';
import { hybridSearch, reciprocalRankFusion, type RankedChunk } from '../../src/rag/hybrid-search';

const chunk = (id: string, page = 10): RankedChunk => ({
  chunkId: id, score: 1, sourceDocument: '스마트제조 전략기술로드맵(2026~2028)', roadmapVersion: '2026-2028', page, text: `본문 ${id}`,
});
const keyword = { search: vi.fn(async () => [chunk('k1', 137), chunk('k2', 138), chunk('s1', 40)]) };
const vector = { search: vi.fn(async () => [chunk('s1', 40), chunk('s2', 41)]) };
const FAKE_KEY = 'test-key-for-unit-tests';

describe('Embedding provider 선택 (키 없이도 앱이 동작)', () => {
  it('EMBEDDING_PROVIDER 미설정 → 비활성', () => {
    const p = createEmbeddingProvider({});
    expect(p.enabled).toBe(false);
    expect(p.disabledReason).toMatch(/키워드 검색만 사용/);
  });
  it('voyage 지정 + VOYAGE_API_KEY 없음 → 비활성(오류 아님)', () => {
    const p = createEmbeddingProvider({ EMBEDDING_PROVIDER: 'voyage' });
    expect(p.enabled).toBe(false);
    expect(p.disabledReason).toMatch(/VOYAGE_API_KEY 미설정/);
  });
  it('voyage + 키 → 활성, 기본 모델 voyage-4·1024차원', () => {
    const p = createEmbeddingProvider({ EMBEDDING_PROVIDER: 'voyage', VOYAGE_API_KEY: FAKE_KEY });
    expect([p.id, p.enabled, p.model, p.dimensions]).toEqual(['voyage', true, 'voyage-4', 1024]);
  });
  it('알 수 없는 공급자 → 비활성', () => {
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'foo' }).enabled).toBe(false);
  });
  it('비활성 공급자 호출 시 EmbeddingUnavailableError', async () => {
    await expect(createEmbeddingProvider({}).embedText('x', { inputType: 'query' })).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });
});

describe('Voyage 어댑터 (가짜 fetch)', () => {
  it('요청 형식·배치 분할·index 정렬', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const data = body.input.map((_: string, i: number) => ({ index: i, embedding: [body.input.length, i] })).reverse();
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    const p = voyageEmbeddingProvider({ apiKey: FAKE_KEY, model: 'voyage-4', dimensions: 1024, batchSize: 2, fetchImpl: fetchImpl as typeof fetch });
    const out = await p.embedBatch(['a', 'b', 'c'], { inputType: 'document' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toEqual([[2, 0], [2, 1], [1, 0]]);
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'voyage-4', input_type: 'document', output_dimension: 1024 });
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${FAKE_KEY}`);
  });
  it('HTTP 오류 → EmbeddingUnavailableError, 메시지에 키 미포함', async () => {
    const p = voyageEmbeddingProvider({ apiKey: FAKE_KEY, model: 'voyage-4', fetchImpl: (async () => new Response('no', { status: 401 })) as typeof fetch });
    const err = await p.embedText('x', { inputType: 'query' }).catch((e) => e);
    expect(err).toBeInstanceOf(EmbeddingUnavailableError);
    expect(String(err.message)).not.toContain(FAKE_KEY);
  });
});

describe('Hybrid 검색 fallback', () => {
  it('키 없음 → keyword_only, 키워드 순위·출처·페이지 유지', async () => {
    const r = await hybridSearch('설비 예지보전', { keyword, vector, embedder: createEmbeddingProvider({}) });
    expect(r.mode).toBe('keyword_only');
    expect(r.semanticDisabledReason).toMatch(/미설정/);
    expect(r.results.map((x) => [x.chunkId, x.page, x.sourceDocument])).toEqual([
      ['k1', 137, '스마트제조 전략기술로드맵(2026~2028)'], ['k2', 138, '스마트제조 전략기술로드맵(2026~2028)'], ['s1', 40, '스마트제조 전략기술로드맵(2026~2028)'],
    ]);
  });
  it('임베딩 호출 실패 → keyword_only로 계속', async () => {
    const embedder = { ...createEmbeddingProvider({ EMBEDDING_PROVIDER: 'voyage', VOYAGE_API_KEY: FAKE_KEY }), embedText: async () => { throw new EmbeddingUnavailableError('Voyage 호출 실패(HTTP 429)'); } };
    const r = await hybridSearch('q', { keyword, vector, embedder });
    expect([r.mode, r.semanticDisabledReason]).toEqual(['keyword_only', 'Voyage 호출 실패(HTTP 429)']);
    expect(r.results).toHaveLength(3);
  });
  it('키 있음 → hybrid, 양쪽에 나온 청크가 RRF 상위', async () => {
    const embedder = { ...createEmbeddingProvider({ EMBEDDING_PROVIDER: 'voyage', VOYAGE_API_KEY: FAKE_KEY }), embedText: async () => [0.1, 0.2] };
    const r = await hybridSearch('q', { keyword, vector, embedder });
    expect(r.mode).toBe('hybrid');
    expect(r.results[0].chunkId).toBe('s1');
    expect([r.results[0].keywordRank, r.results[0].semanticRank]).toEqual([3, 1]);
  });
  it('키워드 검색 실패는 오류로 전달', async () => {
    const bad = { search: async () => { throw new Error('db down'); } };
    await expect(hybridSearch('q', { keyword: bad, embedder: createEmbeddingProvider({}) })).rejects.toThrow('db down');
  });
  it('RRF 점수 = Σ w/(k+rank)', () => {
    const [top] = reciprocalRankFusion([chunk('a')], [chunk('a')], { rrfK: 50 });
    expect(top.fusedScore).toBeCloseTo(2 / 51, 12);
  });
});

describe('격리: 브라우저 앱·Rule Engine은 RAG/임베딩에 의존하지 않음', () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  it.each(['src/app', 'src/diagnosis', 'src/reports', 'src/roadmap', 'src/main.ts'])('%s 는 src/rag 를 import 하지 않는다', (p) => {
    const files = p.endsWith('.ts') ? [p] : walk(p).filter((f) => f.endsWith('.ts'));
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/from ['"][./]*\/?rag\//);
  });
});
