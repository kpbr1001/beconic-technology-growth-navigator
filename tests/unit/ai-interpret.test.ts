// Phase 5 Task 2: Claude 진단 해석 — 가드레일·입력 구성·서버 함수. 실제 API 없이(가짜 클라이언트) 실행.
import Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handle, originAllowed, type Deps } from '../../netlify/functions/ai-interpret';
import { JOB_STALE_MS, jobView, processJob, type Job, type JobStore } from '../../src/ai/jobs';
import { applyGuardrail, checkText, type GuardContext } from '../../src/ai/guardrail';
import { buildUserContent, byPriority, guardContext, interpretAssessment, techContext } from '../../src/ai/interpret';
import { setRoadmapIndex, type AppIndex } from '../../src/roadmap/candidates';
import { gapCards } from '../../src/roadmap/gaps';
import kbIndex from '../../src/roadmap/kb-app-index.json';
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
const PG = byPriority(r);
const UID = 'SMESTR-2025-B-03-08@p279';
const quote: EvidenceQuote = {
  chunkId: `${UID}#tech2`, quote: '고장 예측 정확도 확보 … 예지보전 알림 자동화', label: '기술개발 목표', technologyName: 'AI 기반 설비 이상 탐지',
  trl: '5', citation: '스마트제조 전략기술로드맵(2026~2028) › AI 설비 예지보전 솔루션 (SMESTR-2025-B-03-08) · 인쇄 p.272 (PDF p.280)',
  printedPage: 272, pdfPage: 280, matchedTerms: ['예지보전'],
};
const evidence = { [UID]: [quote] };
const req: InterpretRequest = { consent: true, input: input as InterpretRequest['input'], roadmap: [{ uid: UID, name: 'AI 설비 예지보전 솔루션', code: 'SMESTR-2025-B-03-08' }], rnd: [{ id: 'R&D-1', track: 'upgrade', title: '이상패턴 탐지 모델 성능·신뢰성 고도화', techName: '이상패턴 탐지 모델', trlTarget: 'TRL 7(실제환경 시제품 실증)' }] };
const ctx: GuardContext = guardContext(r, input, evidence, req);
const risk = Math.round(r.m.risk as number);

const good: Interpretation = {
  headline: `리스크대응 ${risk}/100이 가장 큰 병목입니다.`,
  strengths: [{ text: '이상패턴 탐지 모델이 TRL 5로 실증 기반이 있습니다.', claim_type: 'self_report', basis: '핵심기술 TRL 5' }],
  constraints: [{ text: '클라우드 API 의존이 큽니다.', claim_type: 'verified_fact', basis: '외부 의존 응답' }],
  root_cause_hypotheses: [{ text: 'CTO 1인에게 지식이 집중됐을 가능성', verify_by: '인터뷰' }],
  confirmation_needed: ['대체 API 경로를 시험했습니까?'],
  roadmap_notes: [{ item_uid: UID, text: '원문 p.272의 고장 예측 목표와 기업의 이상패턴 탐지 모델이 맞닿습니다.' }],
  option_notes: [{ option: 'B', text: '고객사 PoC를 반복 현장으로 넓히는 경로입니다.', prerequisite: 'PoC 성공기준 문서화' }],
  action_plan: [{ area: PG[0].area, action: '클라우드 API 중단 시 대체 경로를 시험합니다.', kpi: '대체 경로 시험 1회 완료', evidence: '시험 기록' }],
  rnd_notes: [{ id: 'R&D-1', title: '설비 이상패턴 탐지 모델 현장 실증 고도화', summary: '고객사 현장에서 TRL 7 실증을 목표로 합니다.' }],
  gap_notes: [],
};
const AREA0 = PG[0].area;

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
  it('로드맵 노트의 수치는 원문 발췌에 있는 숫자만(원문에 없는 10ms 등은 제거)', () => {
    const notes = [
      { item_uid: UID, text: '원문 p.272의 고장 예측 목표와 이어집니다.' },
      { item_uid: UID, text: '응답 10ms 이내 목표와 연결됩니다.' },
    ];
    const { output, violations } = applyGuardrail({ ...good, roadmap_notes: notes }, ctx);
    expect(output.roadmap_notes.map((n) => n.text)).toEqual([notes[0].text]);
    expect(violations.map((v) => v.kind)).toContain('number_not_in_source');
  });
  it('전략 메모: 기호 정규화(B안→B)·중복·모르는 기호 제거, A→C 순서', () => {
    const { output, violations } = applyGuardrail({
      ...good,
      option_notes: [
        { option: 'C. 차별기술', text: 'IP 확보 후 검토', prerequisite: '특허 조사' },
        { option: 'B안', text: '현장 확대', prerequisite: 'PoC 기준' },
        { option: 'b', text: '중복', prerequisite: 'x' },
        { option: 'D', text: '없는 안', prerequisite: 'x' },
        { option: 'A', text: '리스크대응 99/100이라 안정화', prerequisite: 'x' },
      ],
    }, ctx);
    expect(output.option_notes.map((o) => o.option)).toEqual(['B', 'C']);
    expect(violations.filter((v) => v.field !== 'constraints').map((v) => v.kind).sort()).toEqual(['score_mismatch', 'unknown_item']);
  });
  it('맞춤 실행과제: Rule 우선순위 영역만·영역당 1개·Rule 순서, 점수 위조 제거', () => {
    const areas = ctx.gapAreas as string[];
    // 화면과 같은 우선순위 순서(P0→P1→P2)
    expect(areas).toEqual(PG.slice(0, 5).map((g) => g.area));
    const act = (area: string, action = `${area} 과제`) => ({ area, action, kpi: '완료 1건', evidence: '기록' });
    const { output, violations } = applyGuardrail({
      ...good,
      action_plan: [act(areas[1]), act(` ${AREA0} `), act(AREA0, '중복'), act('마케팅'), act(areas[2], `${areas[2]} 99/100 개선`)],
    }, ctx);
    expect(output.action_plan.map((a) => a.area)).toEqual([AREA0, areas[1]]);
    expect(violations.filter((v) => v.field !== 'constraints').map((v) => v.kind).sort()).toEqual(['score_mismatch', 'unknown_item']);
  });
  it('R&D 과제 메모: 제안 번호만·선정 가능성 표현 제거, 목표 TRL(+2)은 허용', () => {
    const c2 = ctx;
    const { output, violations } = applyGuardrail({
      ...good,
      rnd_notes: [
        { id: 'R&D-1', title: '이상패턴 탐지 고도화', summary: 'TRL 7 실증을 목표로 합니다.' },
        { id: 'R&D-9', title: '없는 과제', summary: 'x' },
        { id: 'R&D-1', title: '중복', summary: 'x' },
      ],
    }, c2);
    expect(output.rnd_notes.map((n) => n.title)).toEqual(['이상패턴 탐지 고도화']);
    expect(violations.filter((v) => v.field === 'rnd_notes').map((v) => v.kind)).toEqual(['unknown_item']);
    const sel = applyGuardrail({ ...good, rnd_notes: [{ id: 'R&D-1', title: '선정 가능성이 높은 과제', summary: 'x' }] }, c2);
    expect(sel.output.rnd_notes).toEqual([]);
    expect(sel.violations.some((v) => v.kind === 'fit_grade')).toBe(true);
  });
  it('v1 결과(전략 메모·실행과제 없음)도 그대로 통과', () => {
    const { output } = applyGuardrail({ ...good, option_notes: undefined, action_plan: undefined, rnd_notes: undefined } as unknown as Interpretation, ctx);
    expect(output.option_notes).toEqual([]);
    expect(output.action_plan).toEqual([]);
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
    expect(text).toContain(`진단 신뢰도: ${Math.round(r.confidence)}/100 `); // 소수점 없이(화면 표기와 동일)
    expect(text).toContain('"고장 예측 정확도 확보 … 예지보전 알림 자동화"');
    expect(text).toContain('이상패턴 탐지 모델 · 자체 가능 · TRL 5');
    expect(text).toContain('원문 근거 없음(이 품목은 roadmap_notes에 쓰지 말 것)');
    expect(text).not.toMatch(/직원|업력/);
    expect(text).toMatch(/← Rule 추천안 · 규칙 점수 \d+\/100/);
    expect(text).toContain('- R&D-1 · upgrade · 이상패턴 탐지 모델 성능·신뢰성 고도화');
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
    // 동의 표시가 없으면(국외 이전 고지 미확인) 접수하지 않음
    expect((await handle(call({ ...req, consent: undefined }), env, d)).status).toBe(400);
    expect((await handle(call({ ...req, consent: false }), env, d)).status).toBe(400);
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

describe('핵심기술 우선순위·보완 필요 기술(서버 재계산)', () => {
  const cand = {
    name: 'AI 설비 예지보전 솔루션', hits: 3, label: '', reason: '', source: '스마트제조', evidenceGrade: 'retrieved' as const, page: 271, code: 'SMESTR-2025-B-03-08',
    allTechs: [
      { name: 'AI 기반 설비 이상 탐지 및 고장 예측 알고리즘 기술', trl: '5', page: 272 },
      { name: '설비 유지보수 최적화 및 자동 의사결정 기술', trl: '6', page: 272 },
    ],
  };
  const cards = gapCards({ candidates: [cand], techs: input.inventory, answerText: '', dataText: input.discovery.data, rdScore: r.m.rd });
  const c3 = guardContext(r, input, evidence, req, cards);
  it('보완 메모: 후보 목록의 원문 기술만(띄어쓰기 차이 허용), 보유 대조 기술·목록 밖 기술·선정 표현 제거', () => {
    expect(c3.gapTechs).toEqual(['설비 유지보수 최적화 및 자동 의사결정 기술']);
    const { output, violations } = applyGuardrail({
      ...good,
      gap_notes: [
        { tech: '설비 유지보수 최적화 및 자동의사결정 기술', why: '고장 예측 결과를 정비 계획으로 잇는 기술입니다(원문 p.272).', first_step: '외부 협력처 2곳을 조사합니다.' },
        { tech: 'AI 기반 설비 이상 탐지 및 고장 예측 알고리즘 기술', why: '이미 보유', first_step: 'x' },
        { tech: '양자 컴퓨팅', why: 'x', first_step: 'x' },
      ],
    }, c3);
    expect(output.gap_notes.map((n) => n.tech)).toEqual(['설비 유지보수 최적화 및 자동 의사결정 기술']);
    expect(violations.filter((v) => v.field === 'gap_notes').map((v) => v.kind)).toEqual(['unknown_item', 'unknown_item']);
    const sel = applyGuardrail({ ...good, gap_notes: [{ tech: '설비 유지보수 최적화 및 자동 의사결정 기술', why: '선정 가능성이 높습니다', first_step: 'x' }] }, c3);
    expect(sel.output.gap_notes).toEqual([]);
  });
  it('v2.3 결과(보완 메모 없음)도 통과', () => {
    expect(applyGuardrail({ ...good, gap_notes: undefined } as unknown as Interpretation, c3).output.gap_notes).toEqual([]);
  });
  describe('원문 색인 사용', () => {
    beforeAll(() => setRoadmapIndex(kbIndex as unknown as AppIndex));
    afterAll(() => setRoadmapIndex(null));
    it('입력에 우선순위·보완 후보·P0 순서를 넣고, 순위는 화면과 같은 규칙', () => {
      const tc = techContext(input);
      expect(tc.ranked.map((x) => x.tech.name)).toEqual(['이상패턴 탐지 모델', '제품 설계·사양']);
      expect(tc.cards.length).toBeGreaterThan(0);
      const text = buildUserContent(input, r, req, evidence, tc);
      expect(text).toMatch(/## 핵심기술 우선순위[^\n]*\n- 1위 이상패턴 탐지 모델 · 확인 항목 \d\/5.*연결 과제 R&D-1/);
      expect(text).toContain('## 보완 필요 기술·데이터 후보');
      expect(text).toMatch(/보완 필요 후보: '.+'/);
      const pri = [...text.matchAll(/^- (P[012]) /gm)].map((m) => m[1]);
      expect(pri).toEqual([...pri].sort());
    });
  });
});

