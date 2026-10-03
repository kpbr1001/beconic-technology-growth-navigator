// Phase 5 Task 2: Claude 진단 해석 — 가드레일·입력 구성·서버 함수. 실제 API 없이(가짜 클라이언트) 실행.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { handle, originAllowed, type Deps } from '../../netlify/functions/ai-interpret';
import { JOB_STALE_MS, jobView, processJob, type Job, type JobStore } from '../../src/ai/jobs';
import { applyGuardrail, checkText, type GuardContext } from '../../src/ai/guardrail';
import { buildUserContent, guardContext, interpretAssessment } from '../../src/ai/interpret';
import { InterpretRequest, type Interpretation } from '../../src/ai/schema';
import { evaluate, type AssessmentInput } from '../../src/diagnosis';
import type { EvidenceQuote } from '../../src/rag/evidence';

const input: AssessmentInput = {
  mode: 'quick',
  company: {
    name: '샘플AI 제조솔루션', roadmapField: '스마트제조(특화)', bizType: '융합형(제조+SW/AI)',
    sectorDetail: 'AI 기반 설비 예지보전', product: '설비 센서데이터와 AI로 고장을 예측하는 예지보전 솔루션',
  },
  discovery: { hardPart: '설비별 센서데이터 정규화', automated: '', data: '진동·온도 센서데이터', external: '클라우드 API', people: 'CTO 1인', validation: '고객사 PoC 1회' },
  inventory: [
    { id: 1, name: '이상패턴 탐지 모델', type: '알고리즘', ownership: '자체 가능', status: '확정', critical: true, trl: 5, confirmed: true },
    { id: 2, name: '제품 설계·사양', type: '설계기술', ownership: '확인필요', status: '후보', critical: true, trl: 0, confirmed: false },
  ],
  answers: { q1: 4, q2: 3, q3: 3, q4: 3, q5: 3, q6: 2, q7: 3, q8: 2, q9: 2, q10: 2, q11: 1, q12: null },
  evidence: { q1: 2 },
};
const r = evaluate(input);
const UID = 'SMESTR-2025-B-03-08@p279';
const quote: EvidenceQuote = {
  chunkId: `${UID}#tech2`, quote: '고장 예측 정확도 확보 … 예지보전 알림 자동화', label: '기술개발 목표', technologyName: 'AI 기반 설비 이상 탐지',
  trl: '5', citation: '스마트제조 전략기술로드맵(2026~2028) › AI 설비 예지보전 솔루션 (SMESTR-2025-B-03-08) · 인쇄 p.272 (PDF p.280)',
  printedPage: 272, pdfPage: 280, matchedTerms: ['예지보전'],
};
const evidence = { [UID]: [quote] };
const req: InterpretRequest = { input: input as InterpretRequest['input'], roadmap: [{ uid: UID, name: 'AI 설비 예지보전 솔루션', code: 'SMESTR-2025-B-03-08' }] };
const ctx: GuardContext = guardContext(r, input, evidence);
const risk = Math.round(r.m.risk as number);

const good: Interpretation = {
  headline: `리스크대응 ${risk}/100이 가장 큰 병목입니다.`,
  strengths: [{ text: '이상패턴 탐지 모델이 TRL 5로 실증 기반이 있습니다.', claim_type: 'self_report', basis: '핵심기술 TRL 5' }],
  constraints: [{ text: '클라우드 API 의존이 큽니다.', claim_type: 'verified_fact', basis: '외부 의존 응답' }],
  root_cause_hypotheses: [{ text: 'CTO 1인에게 지식이 집중됐을 가능성', verify_by: '인터뷰' }],
  confirmation_needed: ['대체 API 경로를 시험했습니까?'],
  roadmap_notes: [{ item_uid: UID, text: '원문 p.272의 고장 예측 목표와 기업의 이상패턴 탐지 모델이 맞닿습니다.' }],
};

describe('가드레일', () => {
  it('입력에 없는 점수·TRL·품목코드·쪽 번호가 들어간 문장은 제거', () => {
    expect(checkText(`리스크대응 ${risk}/100`, ctx)).toBeNull();
    expect(checkText('리스크대응 99/100', ctx)).toBe('score_mismatch');
    expect(checkText('TRL 5 → 6 단계', ctx)).toBeNull(); // 입력 TRL과 다음 단계
    expect(checkText('TRL 9 수준', ctx)).toBe('trl_mismatch');
    expect(checkText('SMESTR-2025-B-03-08 품목', ctx)).toBeNull();
    expect(checkText('SMESTR-2025-B-09-99 품목', ctx)).toBe('unknown_item');
    expect(checkText('원문 p.999 참조', ctx)).toBe('unknown_page');
  });
  it('로드맵 노트의 적합도 등급·근거 없는 품목 제거, 확인된 사실 → 자가응답으로 낮춤', () => {
    const { output, violations } = applyGuardrail({
      ...good,
      roadmap_notes: [
        ...good.roadmap_notes,
        { item_uid: UID, text: '적합도 높음' },
        { item_uid: 'OTHER-1@p1', text: '다른 품목' },
      ],
    }, ctx);
    expect(output.roadmap_notes).toHaveLength(1);
    expect(output.constraints[0].claim_type).toBe('self_report');
    expect(violations.map((v) => v.kind).sort()).toEqual(['claim_downgraded', 'fit_grade', 'unknown_item']);
  });
  it('목록 밖 claim_type은 검증 가설로 낮춤', () => {
    const { output } = applyGuardrail({ ...good, strengths: [{ text: '강점', claim_type: 'fact', basis: 'x' }] }, ctx);
    expect(output.strengths[0].claim_type).toBe('hypothesis');
  });
  it('항목 수·문장 길이 제한', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ text: `강점 ${i} ${'가'.repeat(300)}`, claim_type: 'self_report' as const, basis: 'x' }));
    const { output } = applyGuardrail({ ...good, strengths: many }, ctx);
    expect(output.strengths).toHaveLength(3);
    expect(output.strengths[0].text.length).toBeLessThanOrEqual(220);
  });
});

describe('Claude 입력 구성', () => {
  it('점수는 Rule Engine 값, 원문은 발췌 그대로, 근거 없는 품목은 노트 금지 표시', () => {
    const text = buildUserContent(input, r, { ...req, roadmap: [...req.roadmap, { uid: 'X-1@p2', name: '근거없음', code: null }] }, evidence);
    expect(text).toContain(`리스크대응: ${risk}/100`);
    expect(text).toContain('"고장 예측 정확도 확보 … 예지보전 알림 자동화"');
    expect(text).toContain('이상패턴 탐지 모델 · 자체 가능 · TRL 5');
    expect(text).toContain('원문 근거 없음(이 품목은 roadmap_notes에 쓰지 말 것)');
    expect(text).not.toMatch(/직원|업력/);
  });
});

const fakeClient = (out: Partial<{ stop_reason: string; parsed_output: Interpretation | null }>) => {
  const parse = vi.fn(async () => ({
    stop_reason: 'end_turn', parsed_output: good, model: 'claude-opus-5-5', usage: { input_tokens: 1200, output_tokens: 600 }, ...out,
  }));
  return { client: { beta: { messages: { parse } } } as never, parse };
};

describe('interpretAssessment', () => {
  it('키 없음 → not_configured', async () => {
    expect(await interpretAssessment(req, { client: null })).toEqual({ status: 'not_configured' });
  });
  it('구조화 출력 + 기본 대체모델 + 낮은 effort로 호출하고 가드레일 적용', async () => {
    const { client, parse } = fakeClient({});
    const res = await interpretAssessment(req, { client, evidence });
    const params = (parse.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect((params.output_config as { effort: string }).effort).toBe('low');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.interpretation.constraints[0].claim_type).toBe('self_report');
      expect(res.ruleVersions.scoring).toBe(r.versions.scoring);
    }
  });
  it('거절·토큰 초과·형식 오류 → fallback(규칙 기반 유지)', async () => {
    expect(await interpretAssessment(req, fakeClient({ stop_reason: 'refusal' }))).toEqual({ status: 'fallback', reason: 'refusal' });
    expect(await interpretAssessment(req, fakeClient({ stop_reason: 'max_tokens' }))).toEqual({ status: 'fallback', reason: 'max_tokens' });
    expect(await interpretAssessment(req, fakeClient({ parsed_output: null }))).toEqual({ status: 'fallback', reason: 'invalid_output' });
    const throwing = { beta: { messages: { parse: async () => { throw new SyntaxError('bad json'); } } } } as never;
    expect(await interpretAssessment(req, { client: throwing })).toEqual({ status: 'fallback', reason: 'invalid_output' });
  });
});

describe('작업 처리(백그라운드)', () => {
  const memStore = () => {
    const m = new Map<string, Job>();
    return { m, store: { get: async (id: string) => m.get(id) ?? null, set: async (id: string, j: Job) => void m.set(id, j) } as JobStore };
  };
  const ID = '123e4567-e89b-42d3-a456-426614174000';
  const env = { ANTHROPIC_API_KEY: 'sk-test-only' };

  it('대기 중인 작업만 처리하고, 끝나면 입력 원문을 지운다', async () => {
    const { m, store } = memStore();
    m.set(ID, { status: 'queued', createdAt: Date.now(), request: req });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(await processJob(ID, store, env, () => fakeClient({}).client)).toBe(true);
      const done = m.get(ID)!;
      expect(done.status).toBe('done');
      expect(done.request).toBeUndefined();
      expect(done.result?.status).toBe('ok');
      expect(JSON.stringify(done.result)).not.toMatch(/usage|sk-test-only/);
      // 이미 끝난 작업·없는 작업·형식 오류는 무시(외부에서 백그라운드 함수를 직접 불러도 비용 없음)
      expect(await processJob(ID, store, env)).toBe(false);
      expect(await processJob('123e4567-e89b-42d3-a456-426614174999', store, env)).toBe(false);
      expect(await processJob('../etc', store, env)).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
  it('API 오류는 fallback으로 저장', async () => {
    const { m, store } = memStore();
    m.set(ID, { status: 'queued', createdAt: Date.now(), request: req });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = { beta: { messages: { parse: async () => { throw new Anthropic.APIConnectionError({ message: 'boom' }); } } } } as never;
    try {
      await processJob(ID, store, env, () => boom);
      expect(m.get(ID)?.result).toEqual({ status: 'fallback', reason: 'api_error' });
    } finally {
      err.mockRestore();
    }
  });
  it('조회: 진행 중이면 상태만, 5분 넘은 미완료는 시간 초과', () => {
    const t = Date.now();
    expect(jobView(null)).toEqual({ status: 'not_found' });
    expect(jobView({ status: 'running', createdAt: t, request: req }, t + 1000)).toEqual({ status: 'running' });
    expect(jobView({ status: 'running', createdAt: t }, t + JOB_STALE_MS + 1)).toEqual({ status: 'fallback', reason: 'timeout' });
  });
});

describe('서버 함수 /api/ai-interpret', () => {
  const env = { URL: 'https://beconic-diagnosis-tech.netlify.app', ANTHROPIC_API_KEY: 'sk-test-only' };
  const SITE = 'https://beconic-diagnosis-tech.netlify.app';
  const call = (body: unknown, origin = SITE, method = 'POST', url = `${SITE}/api/ai-interpret`) =>
    new Request(url, { method, headers: origin ? { origin } : {}, body: method === 'POST' ? JSON.stringify(body) : undefined });
  const deps = (over: Partial<Deps> = {}) => {
    const m = new Map<string, Job>();
    const triggered: string[] = [];
    const d: Deps = {
      store: () => ({ get: async (id) => m.get(id) ?? null, set: async (id, j) => void m.set(id, j) }),
      trigger: async (_u, id) => (triggered.push(id), true),
      newId: () => '123e4567-e89b-42d3-a456-426614174000',
      ...over,
    };
    return { d, m, triggered };
  };

  it('출처 확인: 운영·배포 미리보기·같은 사이트만 허용', () => {
    expect(originAllowed(SITE, env)).toBe(true);
    expect(originAllowed('https://deploy-preview-6--beconic-diagnosis-tech.netlify.app', env)).toBe(true);
    expect(originAllowed('https://custom.example', {}, 'https://custom.example/api/ai-interpret')).toBe(true); // 사이트 주소 변수가 없어도 같은 호스트면 허용
    expect(originAllowed('https://evil.example', env, `${SITE}/api/ai-interpret`)).toBe(false);
    expect(originAllowed(`${SITE}.evil.example`, env)).toBe(false);
    expect(originAllowed(null, env)).toBe(false);
  });
  it('외부 출처 403, 입력 형식 오류 400, 키 없으면 not_configured(접수 안 함)', async () => {
    const { d, m } = deps();
    expect((await handle(call(null, undefined, 'DELETE'), env, d)).status).toBe(405);
    expect((await handle(call(req, 'https://evil.example'), env, d)).status).toBe(403);
    expect((await handle(call({ input: {} }), env, d)).status).toBe(400);
    expect(await (await handle(call(req), { URL: env.URL }, d)).json()).toEqual({ status: 'not_configured' });
    expect(m.size).toBe(0);
  });
  it('접수 → 202 queued, 백그라운드 함수 호출, 조회는 상태·결과만', async () => {
    const { d, m, triggered } = deps();
    const res = await handle(call(req), env, d);
    expect(res.status).toBe(202);
    const { job } = await res.json();
    expect(triggered).toEqual([job]);
    expect(m.get(job)?.status).toBe('queued');
    const get = (id: string) => handle(new Request(`${SITE}/api/ai-interpret?job=${id}`), env, d);
    expect(await (await get(job)).json()).toEqual({ status: 'queued' });
    expect((await get('nope')).status).toBe(400);
    m.set(job, { status: 'done', createdAt: Date.now(), result: { status: 'fallback', reason: 'refusal' } });
    expect(await (await get(job)).json()).toEqual({ status: 'fallback', reason: 'refusal' });
  });
  it('백그라운드 호출 실패 → fallback(키 비노출)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { d } = deps({ trigger: async () => false });
      const body = await (await handle(call(req), env, d)).text();
      expect(JSON.parse(body)).toEqual({ status: 'fallback', reason: 'api_error' });
      expect(body).not.toContain('sk-test-only');
    } finally {
      err.mockRestore();
    }
  });
});
