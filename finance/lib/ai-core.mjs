// 재무진단 AI 공통 모듈: 입력·출력 스키마, 시스템 프롬프트, Claude 호출 1건 처리.
// 접수 함수(finance-insights)와 백그라운드 함수(finance-insights-background)가 함께 쓴다.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const EFFORTS = ['low', 'medium', 'high'];
export const EFFORT = () => (EFFORTS.includes(process.env.BECONIC_AI_EFFORT) ? process.env.BECONIC_AI_EFFORT : 'medium');
export const defaultClient = () => new Anthropic({ timeout: 300_000, maxRetries: 1 });
export const MAX_OUTPUT = 6000; // 응답 상한(생각 토큰 포함) — 1회 비용 상한을 정한다

// ── 1회 사용료: 응답의 usage(실측 토큰) × 모델 단가(USD/100만 토큰, Anthropic 공개 단가 2026-10 기준) ──
// 단가가 바뀌면 이 표만 고친다. 표에 없는 모델은 비용을 '미상'으로 둔다(추정하지 않음).
export const PRICES = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-fable-5-1': { in: 10, out: 50 },
};
export function costOf(usage, model) {
  const p = PRICES[model];
  const n = (x) => (Number.isFinite(x) ? x : 0);
  const inTok = n(usage?.input_tokens), outTok = n(usage?.output_tokens), cw = n(usage?.cache_creation_input_tokens), cr = n(usage?.cache_read_input_tokens);
  const tokens = { input: inTok + cw + cr, output: outTok };
  if (!p) return { ...tokens, usd: null };
  const usd = (inTok * p.in + cw * p.in * 1.25 + cr * p.in * 0.1 + outTok * p.out) / 1e6; // 캐시 쓰기 1.25배·읽기 0.1배
  return { ...tokens, usd: Math.round(usd * 1e5) / 1e5 };
}

// ── 입력 스키마: 요약 지표·징후만 허용 (회사명·사업자번호·거래내역 키는 거부) ──
const num = z.union([z.number().finite(), z.literal('표시보류'), z.null()]);
export const Input = z
  .object({
    industry: z.string().max(40),
    basis: z.enum(['개별', '별도', '연결']),
    accountingStandard: z.string().max(30),
    years: z.array(z.number().int().min(2000).max(2100)).length(3),
    metrics: z.record(
      z.string().regex(/^[a-zA-Z]{2,30}$/),
      z.object({ label: z.string().max(40), unit: z.string().max(10), values: z.record(z.string().regex(/^\d{4}$/), num) }).strict(),
    ),
    findings: z.array(z.object({ id: z.string().max(20), title: z.string().max(80), fact: z.string().max(300), category: z.string().max(20) }).strict()).max(20),
    scope: z.object({ bankData: z.string().max(30), audit: z.string().max(20), creditRating: z.string().max(40) }).strict(),
  })
  .strict();

// ── 출력 스키마 (구조화 출력) ──
export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['executiveSummary', 'observations', 'risks', 'actions', 'questions', 'limitations'],
  properties: {
    executiveSummary: { type: 'string' },
    observations: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['metricId', 'year', 'fact', 'impact'],
        properties: { metricId: { type: 'string' }, year: { type: 'integer' }, fact: { type: 'string' }, impact: { type: 'string' } },
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['findingIds', 'risk', 'verifyNext'],
        properties: { findingIds: { type: 'array', items: { type: 'string' } }, risk: { type: 'string' }, verifyNext: { type: 'string' } },
      },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['priority', 'ownerRole', 'timeline', 'action', 'kpiFormula', 'neededData'],
        properties: {
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          ownerRole: { type: 'string' },
          timeline: { type: 'string', enum: ['30일', '90일', '6개월', '12개월'] },
          action: { type: 'string' },
          kpiFormula: { type: 'string' },
          neededData: { type: 'string' },
        },
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
};
export const Output = z.object({
  executiveSummary: z.string().max(1200),
  observations: z.array(z.object({ metricId: z.string(), year: z.number().int(), fact: z.string().max(400), impact: z.string().max(400) })).max(12),
  risks: z.array(z.object({ findingIds: z.array(z.string()).max(6), risk: z.string().max(400), verifyNext: z.string().max(400) })).max(8),
  actions: z.array(z.object({ priority: z.enum(['P1', 'P2', 'P3']), ownerRole: z.string().max(40), timeline: z.enum(['30일', '90일', '6개월', '12개월']), action: z.string().max(300), kpiFormula: z.string().max(200), neededData: z.string().max(200) })).max(10),
  questions: z.array(z.string().max(200)).max(10),
  limitations: z.array(z.string().max(300)).max(8),
});

export const FORBID = /(신용\s*등급\s*[은는이가]?\s*[A-D]|(?<![A-Za-z])[A-D]{1,3}[+-]?\s*등급|부도\s*확률|파산\s*확률|업종\s*평균|동종\s*업계\s*평균|산업\s*평균)/;

export const SYSTEM = `당신은 한국 중소기업 재무 진단을 돕는 분석 보조자입니다. 입력은 회사가 제출하고 사람이 검증한 3개년 재무지표(결정론 코드로 계산된 값)와, 수치 정의로 확인된 징후 목록입니다.
작성 원칙:
- '확인된 사실'(observations), '추가 확인 필요'(risks), '권고사항'(actions)을 분리합니다.
- 수치는 입력에 있는 값만, 입력과 같은 단위·소수 자리로 인용합니다. 새 숫자를 계산하거나 만들지 않습니다. 비율 차이는 %p로 표기합니다.
- 공식 신용등급, 부도·파산 확률, 업종·산업 평균, 금액 목표치를 생성하지 않습니다. 미래 매출·상환능력을 사실처럼 단정하지 않습니다.
- 한계(limitations)는 '업종 비교 자료 없음', '공식 신용등급 미확인'처럼 자료가 없다는 사실로만 적습니다.
- 인과관계는 가능성으로 쓰고, 확인할 자료와 질문을 함께 제시합니다. risks.findingIds 에는 입력 findings 의 id 만 씁니다.
- 실행 과제는 중소기업 대표·재무담당자가 바로 착수할 수 있게 구체적으로, KPI는 산식으로만 씁니다(목표값 없음).
- 한국어, 쉬운 경영 용어, 존댓말로 간결하게 씁니다.`;


// '자료가 없어 비교하지 않았다'처럼 한계를 밝히는 문장은 허용(단정·비교 문장만 제거)
export const NEGATED = /(자료[가는]?\s*없|정보[가는]?\s*없|비교하지\s*않|비교할\s*수\s*없|산출하지\s*않|생성하지\s*않|제공하지\s*않|포함하지\s*않|확인되지\s*않|미확인|불가|제외)/;
const sentences = (s) => String(s ?? '').split(/(?<=[.!?。])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
/** 금지 표현이 든 문장만 제거(한계 설명 문장은 유지). 응답 전체를 버리지 않는다 */
export function scrubText(s) {
  let removed = 0;
  const kept = sentences(s).filter((x) => { const bad = FORBID.test(x) && !NEGATED.test(x); if (bad) removed++; return !bad; });
  return { text: kept.join(' '), removed };
}
export function scrubResult(result) {
  let removed = 0;
  const fix = (s) => { const r = scrubText(s); removed += r.removed; return r.text; };
  const out = {
    executiveSummary: fix(result.executiveSummary),
    observations: result.observations.map((o) => ({ ...o, fact: fix(o.fact), impact: fix(o.impact) })).filter((o) => o.fact),
    risks: result.risks.map((r) => ({ ...r, risk: fix(r.risk), verifyNext: fix(r.verifyNext) })).filter((r) => r.risk),
    actions: result.actions.map((a) => ({ ...a, action: fix(a.action), kpiFormula: fix(a.kpiFormula), neededData: fix(a.neededData) })).filter((a) => a.action),
    questions: result.questions.map(fix).filter(Boolean),
    limitations: result.limitations.map(fix).filter(Boolean),
  };
  return { result: out, removed };
}

/** Claude 1회 호출 → 검증된 결과 또는 오류 코드. 오류 원문(키 등)은 밖으로 내보내지 않는다 */
export async function runInsights(input, client = defaultClient()) {
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL(),
      max_tokens: MAX_OUTPUT,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT(), format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `다음 검증된 재무 요약으로 개선처방 초안을 작성하세요.\n\n${JSON.stringify(input)}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { status: 'error', http: 429, error: 'AI 제공자 요청 한도에 걸렸습니다. 잠시 후 다시 시도하세요.' };
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 'error', http: 504, error: 'AI 응답 시간이 초과되었습니다.' };
    if (err instanceof Anthropic.AuthenticationError) return { status: 'error', http: 502, error: 'AI 제공자 인증 실패(서버 키 확인 필요)' };
    if (err instanceof Anthropic.APIError) return { status: 'error', http: 502, error: `AI 제공자 오류(${err.status ?? '연결'})` };
    return { status: 'error', http: 502, error: 'AI 요청 중 오류가 발생했습니다.' };
  }
  const usage = costOf(response.usage, response.model); // 실패 응답도 과금되므로 함께 돌려준다
  if (response.stop_reason === 'refusal') return { status: 'error', http: 422, error: 'AI가 이 요청에 답하지 않았습니다. 결정론 분석 결과를 사용하세요.', usage };
  if (response.stop_reason === 'max_tokens') return { status: 'error', http: 502, error: 'AI 응답이 길이 제한으로 잘렸습니다. 다시 시도하세요.', usage };
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let result;
  try {
    result = Output.parse(JSON.parse(text));
  } catch {
    return { status: 'error', http: 502, error: 'AI 응답 형식 검증에 실패했습니다.', usage };
  }
  const ids = new Set(input.findings.map((f) => f.id));
  result.risks = result.risks.map((r) => ({ ...r, findingIds: r.findingIds.filter((id) => ids.has(id)) }));
  const scrubbed = scrubResult(result);
  const left = [scrubbed.result.executiveSummary, ...scrubbed.result.actions.map((a) => a.action)].filter(Boolean).length;
  if (!left) return { status: 'error', http: 422, error: '근거 없는 등급·확률·업종 평균 표현만 있어 응답을 사용할 수 없습니다. 다시 시도하세요.', usage };
  return { status: 'ok', result: scrubbed.result, removed: scrubbed.removed, model: response.model, usage };
}
