// Phase 3 원문 근거: Supabase 검색기·근거 발췌·서버 함수·적재 변환. 실제 Supabase/Voyage 없이(가짜 fetch) 실행.
import { describe, expect, it, vi } from 'vitest';
import { handle, urlHint } from '../../netlify/functions/roadmap-evidence';
import { embedInput, toRow, withRetry, type Chunk } from '../../scripts/rag/load_kb';
import { createEmbeddingProvider, type EmbeddingProvider } from '../../src/rag/embedding';
import { bestQuote, findEvidence } from '../../src/rag/evidence';
import {
  supabaseConfigFromEnv, supabaseKeywordRetriever, supabaseVectorRetriever, upsertChunks, type RoadmapChunkRow,
} from '../../src/rag/supabase';

const SERVICE_JWT = 'aaa.bbb.ccc-test-only';
const row = (over: Partial<RoadmapChunkRow> = {}): RoadmapChunkRow => ({
  chunk_id: 'SMESTR-2025-B-03-08@p279#tech2', score: 13.6, matched_terms: ['예지보전', '고장'], chunk_type: 'technology',
  item_uid: 'SMESTR-2025-B-03-08@p279', item_code: 'SMESTR-2025-B-03-08', item_no: null, item_name: 'AI 설비 예지보전 솔루션',
  technology_name: 'AI 기반 설비 이상 탐지 및 고장 예측 알고리즘 기술', trl_raw: '5', trl_basis: 'stated',
  source_file: '20260319_보고서_스마트제조 전략기술로드맵(2026~2028).pdf', roadmap_version: '2026-2028',
  roadmap_type: 'specialized', strategic_field: '스마트제조', subfield: '생산관리시스템', page_start: 280, printed_page_start: 272,
  contextual_prefix: '[문서] 스마트제조 전략기술로드맵(2026~2028)\n[전략분야] 스마트제조',
  content: '개요: 설비 센서 데이터 기반 이상 탐지\n기술개발 목표: 고장 예측 정확도 확보  예지보전 알림 자동화  보고서 출력',
  ...over,
});
const okFetch = (rows: unknown) => vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 }));
const cfg = (fetchImpl: unknown) => ({ url: 'https://demo.supabase.co', serviceKey: SERVICE_JWT, fetchImpl: fetchImpl as typeof fetch });

describe('Supabase 설정', () => {
  it('URL·서비스키가 없으면 null(앱은 원문 색인 후보로 계속)', () => {
    expect(supabaseConfigFromEnv({})).toBeNull();
    expect(supabaseConfigFromEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(supabaseConfigFromEnv({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'k' })?.url).toBe('https://x.supabase.co');
    const c = supabaseConfigFromEnv({ SUPABASE_URL: ' "https://x.supabase.co/rest/v1/" ', SUPABASE_SERVICE_ROLE_KEY: ' k\n' });
    expect([c?.url, c?.serviceKey]).toEqual(['https://x.supabase.co', 'k']);
  });
});

describe('Supabase 검색기 (가짜 fetch)', () => {
  it('키워드: 검색어 분리 후 RPC 호출, 품목 필터 전달, 출처·쪽 보존', async () => {
    const f = okFetch([row()]);
    const out = await supabaseKeywordRetriever(cfg(f)).search('설비데이터를 이용한 예지보전', { itemUids: ['U1'] }, 5);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.co/rest/v1/rpc/search_roadmap_keyword');
    expect(JSON.parse(String(init.body))).toMatchObject({ p_terms: ['설비데이터', '이용한', '예지보전'], p_item_uids: ['U1'], p_active_only: true, p_match_count: 5 });
    const h = init.headers as Record<string, string>;
    expect([h.apikey, h.authorization]).toEqual([SERVICE_JWT, `Bearer ${SERVICE_JWT}`]);
    expect(out[0]).toMatchObject({ chunkId: row().chunk_id, page: 272, roadmapVersion: '2026-2028' });
  });
  it('새 sb_secret 키는 apikey 헤더에만', async () => {
    const f = okFetch([]);
    await supabaseKeywordRetriever({ ...cfg(f), serviceKey: 'sb_secret_test' }).search('예지보전 설비', {}, 5);
    const h = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(h.apikey).toBe('sb_secret_test');
    expect(h.authorization).toBeUndefined();
  });
  it('검색어가 일반어뿐이면 호출하지 않음', async () => {
    const f = okFetch([]);
    expect(await supabaseKeywordRetriever(cfg(f)).search('기술 개발 시스템', {}, 5)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it('벡터: pgvector 문자열 형식으로 전달', async () => {
    const f = okFetch([row({ score: 0.81, matched_terms: null })]);
    await supabaseVectorRetriever(cfg(f)).search([0.1, 0.2], {}, 3);
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.p_embedding).toBe('[0.1,0.2]');
  });
  it('HTTP 오류 메시지에 키가 들어가지 않음', async () => {
    const f = vi.fn(async () => new Response('permission denied', { status: 401 }));
    const err = await supabaseKeywordRetriever(cfg(f)).search('예지보전', {}, 5).catch((e) => e);
    expect(String(err.message)).toMatch(/HTTP 401/);
    expect(String(err.message)).not.toContain(SERVICE_JWT);
  });
  it('적재 upsert: 중복 시 갱신 헤더', async () => {
    const f = vi.fn(async () => new Response('', { status: 201 }));
    await upsertChunks(cfg(f), [{ chunk_id: 'a' }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/rest/v1/roadmap_chunks?on_conflict=chunk_id');
    expect((init.headers as Record<string, string>).prefer).toContain('resolution=merge-duplicates');
  });
});

describe('원문 발췌', () => {
  it('일치어가 많은 줄·항목만 원문 그대로 발췌', () => {
    const q = bestQuote(row().content, ['예지보전', '고장']);
    expect(q.label).toBe('기술개발 목표');
    expect(q.quote).toBe('고장 예측 정확도 확보 … 예지보전 알림 자동화');
    expect(row().content).toContain('고장 예측 정확도 확보');
  });
});

describe('findEvidence', () => {
  const disabled = createEmbeddingProvider({});
  it('Supabase 미설정 → not_configured (오류 아님)', async () => {
    expect(await findEvidence({ query: '예지보전', itemUids: ['U1'] }, { supabase: null, embedder: disabled })).toEqual({ status: 'not_configured', items: {} });
  });
  it('임베딩 없음 → keyword_only, 품목별 인용·인쇄 쪽 인용표기', async () => {
    const f = okFetch([row()]);
    const r = await findEvidence({ query: '설비 고장 예지보전', itemUids: ['SMESTR-2025-B-03-08@p279', 'SMESTR-2025-B-03-08@p279'] }, { supabase: cfg(f), embedder: disabled });
    expect(r.status).toBe('ok');
    expect(r.mode).toBe('keyword_only');
    expect(f).toHaveBeenCalledTimes(1); // 같은 품목은 한 번만
    const [q] = r.items['SMESTR-2025-B-03-08@p279'];
    expect(q.citation).toBe('스마트제조 전략기술로드맵(2026~2028) › AI 설비 예지보전 솔루션 (SMESTR-2025-B-03-08) · 인쇄 p.272 (PDF p.280)');
    expect([q.printedPage, q.trl]).toEqual([272, '5']);
  });
  it('임베딩 있음 → hybrid(키워드+의미), 의미 검색은 질의용 입력으로', async () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('semantic') ? [row({ chunk_id: 'X#tech1', score: 0.9, matched_terms: null })] : [row()]), { status: 200 }));
    const embedText = vi.fn(async () => [0.5, 0.5]);
    const embedder = { id: 'fake', model: 'm', dimensions: 2, enabled: true, embedText, embedBatch: vi.fn() } as unknown as EmbeddingProvider;
    const r = await findEvidence({ query: '예지보전 고장', itemUids: ['U1'] }, { supabase: cfg(f), embedder });
    expect(r.mode).toBe('hybrid');
    expect(embedText).toHaveBeenCalledWith('예지보전 고장', { inputType: 'query' });
    expect(r.items.U1.map((q) => q.chunkId)).toEqual(expect.arrayContaining([row().chunk_id, 'X#tech1']));
  });
  it('품목은 최대 3개, 질의는 600자로 제한', async () => {
    const f = okFetch([]);
    await findEvidence({ query: '예지보전 '.repeat(200), itemUids: ['a1x', 'b2x', 'c3x', 'd4x'] }, { supabase: cfg(f), embedder: disabled });
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe('서버 함수 /api/roadmap-evidence', () => {
  const req = (body: unknown, method = 'POST') => new Request('http://x/api/roadmap-evidence', { method, body: method === 'POST' ? JSON.stringify(body) : undefined });
  it('POST만, 입력 검증(잘못된 품목키 차단)', async () => {
    expect((await handle(req(null, 'GET'), {})).status).toBe(405);
    expect((await handle(req({ query: '', itemUids: ['U1x'] }), {})).status).toBe(400);
    expect((await handle(req({ query: '예지보전', itemUids: ['<script>'] }), {})).status).toBe(400);
  });
  it('SUPABASE_URL 형식 진단(주소는 로그에 남기지 않음)', () => {
    expect(urlHint('https://abcd1234.supabase.co')).toBe('[SUPABASE_URL 형식 정상]');
    expect(urlHint('postgresql://postgres:pw@db.abcd1234.supabase.co:5432/postgres')).toMatch(/postgresql: 주소/);
    expect(urlHint('abcd1234.supabase.co')).toMatch(/형식 오류/);
    expect(urlHint('https://supabase.com/dashboard/project/abcd1234')).toMatch(/확인 필요/);
    expect(urlHint('https://abcd1234.supabase.co')).not.toContain('abcd1234');
  });
  it('환경변수 없으면 200 not_configured', async () => {
    const res = await handle(req({ query: '예지보전', itemUids: ['SMESTR-2025-B-03-08@p279'] }), {});
    expect([res.status, (await res.json()).status]).toEqual([200, 'not_configured']);
  });
  it('검색 실패 시 502, 응답에 키·URL 미포함', async () => {
    const env = { SUPABASE_URL: 'https://secret-project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: SERVICE_JWT };
    const orig = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await handle(req({ query: '예지보전', itemUids: ['SMESTR-2025-B-03-08@p279'] }), env);
      const text = await res.text();
      expect(res.status).toBe(502);
      expect(text).not.toContain(SERVICE_JWT);
      expect(text).not.toContain('secret-project');
    } finally {
      globalThis.fetch = orig;
      err.mockRestore();
    }
  });
});

describe('적재 변환', () => {
  const c: Chunk = { chunk_id: 'A#item', chunk_type: 'item', kb_version: 'kb-v2', contextual_prefix: '[문서] X', content: '', technology_no: 3, trl_by_year: [1] };
  it('DB 컬럼만, 품목 문단의 기술번호 제거, 빈 내용 허용', () => {
    const r = toRow(c);
    expect(r).not.toHaveProperty('trl_by_year');
    expect([r.technology_no, r.content, r.is_active, r.roadmap_role]).toEqual([null, '', true, 'primary']);
  });
  it('적재 재시도: 실패하면 대기 후 다시, 한도 넘으면 오류', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const waits: number[] = [];
      let n = 0;
      const ok = await withRetry(async () => { if (++n < 3) throw new Error('HTTP 429'); return 'done'; }, { baseMs: 10, wait: async (ms) => void waits.push(ms) });
      expect([ok, waits]).toEqual(['done', [10, 20]]);
      await expect(withRetry(async () => { throw new Error('HTTP 401'); }, { tries: 2, baseMs: 1, wait: async () => {} })).rejects.toThrow('401');
    } finally {
      warn.mockRestore();
    }
  });
  it('임베딩 입력 = 문맥 머리말 + 내용', () => {
    expect(embedInput({ ...c, content: '본문' })).toBe('[문서] X\n본문');
  });
});
