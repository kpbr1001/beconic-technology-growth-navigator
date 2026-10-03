// 연동 상태 신호등(/api/health): 실제 Supabase·Claude 없이(가짜 fetch·클라이언트) 실행
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle, resetHealthCache } from '../../netlify/functions/health';
import { checkHealth, type HealthDeps } from '../../src/ai/health';

const okStore = () => ({ get: async () => null, set: async () => {} });
const deps = (over: Partial<HealthDeps> = {}): HealthDeps => ({
  claudeClient: () => ({ models: { retrieve: vi.fn(async () => ({})) } }) as never,
  store: okStore,
  ...over,
});
const SB = { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'aaa.bbb.ccc-test' };
const row = { chunk_id: 'a', score: 1, matched_terms: ['예지보전'], chunk_type: 'item', item_uid: 'U', item_code: null, item_no: null, item_name: 'x', technology_name: null, trl_raw: null, trl_basis: null, source_file: 'f', roadmap_version: 'v', roadmap_type: 't', strategic_field: 'f', subfield: null, page_start: 1, printed_page_start: 1, contextual_prefix: '', content: 'c' };

afterEach(() => {
  vi.unstubAllGlobals();
  resetHealthCache();
});

describe('checkHealth', () => {
  it('아무 설정 없음 → 전부 회색(꺼짐), 키 확인 호출 없음', async () => {
    const retrieve = vi.fn();
    const r = await checkHealth({}, deps({ claudeClient: () => ({ models: { retrieve } }) as never }));
    expect([r.evidence.light, r.semantic.light, r.claude.light, r.jobs.light]).toEqual(['gray', 'gray', 'gray', 'gray']);
    expect(retrieve).not.toHaveBeenCalled();
  });
  it('Supabase 조회 성공·임베딩 없음·Claude 확인 성공 → 초록/노랑/초록', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([row]), { status: 200 })));
    const r = await checkHealth({ ...SB, ANTHROPIC_API_KEY: 'sk-test' }, deps());
    expect(r.evidence.light).toBe('green');
    expect(r.semantic).toMatchObject({ light: 'yellow', label: '키워드만' });
    expect(r.claude).toMatchObject({ light: 'green', detail: 'Claude API 키·모델 확인(claude-opus-5-5)' });
    expect(r.jobs.light).toBe('green');
  });
  it('오류는 빨강 + 원인(키 값·주소 미노출)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 401 })));
    const r = await checkHealth({ ...SB, ANTHROPIC_API_KEY: 'sk-test' }, deps({
      claudeClient: () => ({ models: { retrieve: async () => { throw Object.assign(new Error('x'), { status: 401 }); } } }) as never,
      store: () => ({ get: async () => { throw new Error('blobs down'); }, set: async () => {} }),
    }));
    expect([r.evidence.light, r.claude.light, r.jobs.light]).toEqual(['red', 'red', 'red']);
    expect(r.claude.detail).toContain('키 오류');
    expect(JSON.stringify(r)).not.toMatch(/sk-test|aaa\.bbb|demo\.supabase/);
  });
});

describe('GET /api/health', () => {
  it('60초 캐시, 다시 점검은 10초 간격 제한', async () => {
    const retrieve = vi.fn(async () => ({}));
    const d = deps({ claudeClient: () => ({ models: { retrieve } }) as never });
    const env = { ANTHROPIC_API_KEY: 'sk-test' };
    const get = (q = '', t = 0) => handle(new Request(`https://x/api/health${q}`), env, d, 1_000_000 + t);
    expect((await get()).status).toBe(200);
    await get('', 30_000);
    await get('?refresh=1', 5_000);
    expect(retrieve).toHaveBeenCalledTimes(1);
    await get('?refresh=1', 15_000);
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect((await handle(new Request('https://x/api/health', { method: 'POST' }), env, d)).status).toBe(405);
  });
});
