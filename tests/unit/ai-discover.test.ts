// AI 기술 후보 찾기: 인용 원문 대조 가드레일, 동의 필수, 백그라운드 작업 분기 — 실제 API 없이(가짜 클라이언트)
import { describe, expect, it, vi } from 'vitest';
import { DiscoverRequest, buildDiscoverContent, discoverTechnologies, guardDiscover, type DiscoverOutput } from '../../src/ai/discover';
import { processJob, type Job, type JobStore } from '../../src/ai/jobs';
import { handle } from '../../netlify/functions/ai-interpret';

const req: DiscoverRequest = {
  task: 'discover', consent: true,
  input: {
    company: { bizType: '융합형(제조+SW/AI)', roadmapField: '스마트제조(특화)', sectorDetail: '설비 예지보전 AI SaaS', product: '센서 데이터로 고장을 예측하는 예지보전 SaaS' },
    discovery: { hardPart: '설비별로 형식이 다른 센서 데이터를 표준화하고 이상탐지 알고리즘으로 오탐을 줄임', automated: '정비 우선순위 자동 추천', data: '진동·온도 센서값', external: 'AWS 클라우드, LLM API', validation: '2개 공장 PoC' },
    existing: ['예지보전 플랫폼'],
  },
};
const cand = (o: Partial<DiscoverOutput['candidates'][number]>) => ({
  name: '설비 센서 데이터 표준화', type: '데이터기술', source_field: 'hardPart', quote: '설비별로 형식이 다른 센서 데이터를 표준화하고', why_core: '모델 정확도의 바탕', ownership: '자체', ...o,
});

describe('AI 기술 후보 가드레일', () => {
  it('답변 원문에 있는 인용만 통과(띄어쓰기 차이는 허용), 없는 인용·모르는 칸·중복·TRL 표기 제거', () => {
    const { candidates, removed } = guardDiscover({ candidates: [
      cand({}),
      cand({ name: '이상 탐지 모델', type: 'AI/알고리즘', quote: '이상탐지  알고리즘으로 오탐을 줄임' }),
      cand({ name: '디지털 트윈', quote: '디지털 트윈으로 공정을 모사' }), // 답변에 없음
      cand({ name: '외부 연계', source_field: 'people' }),
      cand({ name: '예지보전 플랫폼', source_field: 'product', quote: '예지보전 SaaS' }), // 기존 목록과 중복
      cand({ name: 'TRL 7 실증 기술', source_field: 'validation', quote: '2개 공장 PoC' }),
      cand({ name: '클라우드 연계', type: '없는유형', source_field: 'external', quote: 'AWS 클라우드', ownership: '모름' }),
    ] }, req);
    expect(candidates.map((c) => c.name)).toEqual(['설비 센서 데이터 표준화', '이상 탐지 모델', '클라우드 연계']);
    expect(candidates[2]).toMatchObject({ type: '핵심기술', ownership: '확인필요', fieldLabel: '외부에 의존하는 부분' });
    expect(removed.sort()).toEqual(['duplicate', 'quote_not_in_answer', 'trl_or_score', 'unknown_field']);
  });
  it('입력 구성: 칸 이름과 내용, 기존 목록 포함', () => {
    const t = buildDiscoverContent(req);
    expect(t).toContain('- hardPart (경쟁사가 따라 하기 가장 어려운 부분): 설비별로');
    expect(t).toContain('- 예지보전 플랫폼');
  });
  it('동의 없거나 작업 종류가 다르면 형식 오류', () => {
    expect(DiscoverRequest.safeParse({ ...req, consent: false }).success).toBe(false);
    expect(DiscoverRequest.safeParse({ ...req, task: 'interpret' }).success).toBe(false);
  });
});

const fake = (parsed: DiscoverOutput | null, stop = 'end_turn') => ({
  beta: { messages: { parse: vi.fn(async () => ({ stop_reason: stop, parsed_output: parsed, model: 'claude-opus-5-5', usage: { input_tokens: 800, output_tokens: 300 } })) } },
}) as never;

describe('discoverTechnologies', () => {
  it('정상 → 후보, 인용이 모두 틀리면 fallback(empty), 거절 → fallback', async () => {
    const ok = await discoverTechnologies(req, { client: fake({ candidates: [cand({})] }), model: 'm' });
    expect(ok).toMatchObject({ status: 'ok', task: 'discover', candidates: [{ name: '설비 센서 데이터 표준화' }] });
    expect(await discoverTechnologies(req, { client: fake({ candidates: [cand({ quote: '없는 문장입니다' })] }), model: 'm' })).toEqual({ status: 'fallback', reason: 'empty' });
    expect(await discoverTechnologies(req, { client: fake(null, 'refusal'), model: 'm' })).toEqual({ status: 'fallback', reason: 'refusal' });
    expect(await discoverTechnologies(req, { client: null, model: 'm' })).toEqual({ status: 'not_configured' });
  });
  it('백그라운드 작업: task=discover면 기술 후보 처리, 처리 후 입력 원문 삭제', async () => {
    const m = new Map<string, Job>();
    const store: JobStore = { get: async (id) => m.get(id) ?? null, set: async (id, j) => void m.set(id, j) };
    const id = '123e4567-e89b-42d3-a456-426614174000';
    m.set(id, { status: 'queued', createdAt: Date.now(), request: req });
    await processJob(id, store, { ANTHROPIC_API_KEY: 'k' }, () => fake({ candidates: [cand({})] }));
    const j = m.get(id)!;
    expect(j.request).toBeUndefined();
    expect(j.result).toMatchObject({ status: 'ok', task: 'discover' });
    expect(JSON.stringify(j.result)).not.toContain('usage');
  });
  it('접수: 동의 없는 요청 400, 정상 요청 202', async () => {
    const deps = { store: () => ({ get: async () => null, set: async () => {} }), trigger: async () => true, newId: () => '123e4567-e89b-42d3-a456-426614174001' };
    const post = (b: unknown) => handle(new Request('https://beconic.example/api/ai-discover', { method: 'POST', headers: { origin: 'https://beconic.example' }, body: JSON.stringify(b) }),
      { ANTHROPIC_API_KEY: 'k' }, deps, DiscoverRequest as never);
    expect((await post({ ...req, consent: false })).status).toBe(400);
    expect((await post(req)).status).toBe(202);
  });
});
