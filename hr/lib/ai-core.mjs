// HR 진단 AI 공통 모듈: 입력·출력 스키마, 시스템 프롬프트, Claude 호출 1건 처리.
// 접수 함수(hr-insights)와 백그라운드 함수(hr-insights-background)가 함께 쓴다. 재무진단(finance/lib/ai-core.mjs)과 같은 구조.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const EFFORTS = ['low', 'medium', 'high'];
export const EFFORT = () => (EFFORTS.includes(process.env.BECONIC_AI_EFFORT) ? process.env.BECONIC_AI_EFFORT : 'medium');
export const defaultClient = () => new Anthropic({ timeout: 300_000, maxRetries: 1 });
export const MAX_OUTPUT = 6000; // 응답 상한(생각 토큰 포함) — 1회 비용 상한을 정한다

// ── 입력 스키마: 점수·제도 상태·객관 지표 요약만 허용 (회사명·자유서술·개인 응답은 받지 않음) ──
const score = z.union([z.number().int().min(0).max(100), z.null()]);
export const SIZE_BANDS = ['1~4명', '5~9명', '10~29명', '30~49명', '50~99명', '100~299명', '300명+'];
export const Input = z
  .object({
    industry: z.string().max(40),
    sizeBand: z.enum(SIZE_BANDS),
    worktype: z.string().max(20),
    indices: z.object({ ohi: score, outcome: score, hrMaturity: score, confidence: z.enum(['높음', '보통', '낮음']) }).strict(),
    drivers: z.array(z.object({ id: z.string().regex(/^D\d{2}$/), name: z.string().max(30), score }).strict()).length(10),
    outcomes: z.array(z.object({ id: z.string().regex(/^O\d{2}$/), name: z.string().max(30), score }).strict()).length(4),
    gaps: z.array(z.object({ label: z.string().max(30), exp: score, sys: score, quadrant: z.union([z.enum(['A', 'B', 'C', 'D']), z.null()]) }).strict()).max(8),
    risks: z.array(z.object({ id: z.string().regex(/^(H\d{2}|X[A-Z]{2,4})$/), category: z.string().max(30), status: z.string().max(30), legal: z.string().max(120) }).strict()).max(20),
    objective: z.array(z.object({ id: z.string().regex(/^[a-z][A-Za-z]{1,30}$/), label: z.string().max(30), value: z.union([z.number().finite(), z.null()]), unit: z.string().max(10) }).strict()).max(8),
    signals: z.array(z.object({ id: z.string().regex(/^[A-Z]{2,6}$/), note: z.string().max(200) }).strict()).max(10),
    problem: z.string().max(160),
  })
  .strict();

// ── 출력 스키마 (구조화 출력) ──
const TIMELINES = ['30일', '60일', '90일', '120일'];
export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['executiveSummary', 'insights', 'interviewQuestions', 'actions', 'limitations'],
  properties: {
    executiveSummary: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['refIds', 'insight', 'soWhat'],
        properties: { refIds: { type: 'array', items: { type: 'string' } }, insight: { type: 'string' }, soWhat: { type: 'string' } },
      },
    },
    interviewQuestions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['refId', 'askWhom', 'question'],
        properties: { refId: { type: 'string' }, askWhom: { type: 'string' }, question: { type: 'string' } },
      },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['priority', 'ownerRole', 'timeline', 'action', 'firstStep', 'kpiFormula'],
        properties: {
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          ownerRole: { type: 'string' },
          timeline: { type: 'string', enum: TIMELINES },
          action: { type: 'string' },
          firstStep: { type: 'string' },
          kpiFormula: { type: 'string' },
        },
      },
    },
    limitations: { type: 'array', items: { type: 'string' } },
  },
};
export const Output = z.object({
  executiveSummary: z.string().max(1200),
  insights: z.array(z.object({ refIds: z.array(z.string()).max(6), insight: z.string().max(400), soWhat: z.string().max(400) })).max(6),
  interviewQuestions: z.array(z.object({ refId: z.string().max(10), askWhom: z.string().max(30), question: z.string().max(200) })).max(8),
  actions: z.array(z.object({ priority: z.enum(['P1', 'P2', 'P3']), ownerRole: z.string().max(40), timeline: z.enum(TIMELINES), action: z.string().max(300), firstStep: z.string().max(200), kpiFormula: z.string().max(200) })).max(8),
  limitations: z.array(z.string().max(300)).max(6),
});

// 근거 없는 외부 비교·확률·법 위반 단정·개인 인사조치 권고는 금지
export const FORBID = /(업종\s*평균|산업\s*평균|동종\s*업계\s*평균|업계\s*평균|벤치마크\s*대비|상위\s*\d+\s*%|하위\s*\d+\s*%|이직\s*확률|퇴사\s*확률|(법|법률|법령)\s*위반(입니다|이다|에\s*해당합니다)|위법(입니다|이다)|불법(입니다|이다)|해고(하십시오|하세요|해야)|징계(하십시오|하세요|해야))/;
// '외부 평균 자료가 없어 비교하지 않았다'처럼 한계를 밝히는 문장은 허용
export const NEGATED = /(자료[가는]?\s*없|정보[가는]?\s*없|비교하지\s*않|비교할\s*수\s*없|산출하지\s*않|판단하지\s*않|단정하지\s*않|제공하지\s*않|포함하지\s*않|확인되지\s*않|미확인|불가|제외|아닙니다)/;

export const SYSTEM = `당신은 한국 중소기업의 조직·HR 진단을 돕는 분석 보조자입니다. 입력은 대표·인사담당자가 응답한 자가진단을 공개된 규칙(결정론 코드)으로 계산한 점수(0~100 환산지수), HR 제도·노무 점검 상태, 선택 입력된 객관 지표(이직률 등), 응답 신뢰 신호입니다.
작성 원칙:
- 점수·우선순위는 이미 코드가 정했습니다. 점수를 다시 매기거나 새 숫자를 계산·추정하지 않습니다. 수치는 입력에 있는 값만 그대로 인용합니다.
- 외부 벤치마크(업종·업계 평균, 상위 몇 %), 이직·퇴사 확률, 금액 추정치를 만들지 않습니다.
- 노무 항목은 '점검 필요'로만 표현하고 법 위반을 단정하지 않습니다. 특정 개인의 해고·징계 같은 인사조치를 권하지 않습니다.
- 이 진단은 경영자 1인의 관점이라는 한계를 고려해, 인사이트(insights)는 '가능성'으로 쓰고 근거 refIds(D01, O02, H04, 객관지표 id 같은 입력 id)를 붙입니다.
- interviewQuestions 는 구성원·팀장 인터뷰에서 원인을 확인할 질문입니다. 유도 질문이 아닌 열린 질문으로 씁니다.
- actions 는 중소기업이 바로 착수할 수 있는 과제입니다. firstStep 은 이번 주에 할 첫 행동, kpiFormula 는 측정 산식(목표값 없음)입니다.
- limitations 는 '구성원 응답 없음', '외부 비교 자료 없음'처럼 자료가 없다는 사실로만 적습니다.
- 본문 문장에 D01 같은 id를 쓰지 말고 refIds/refId 에만 넣습니다. 한국어 존댓말, 쉬운 경영 용어로 간결하게 씁니다.`;

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
    insights: result.insights.map((o) => ({ ...o, insight: fix(o.insight), soWhat: fix(o.soWhat) })).filter((o) => o.insight),
    interviewQuestions: result.interviewQuestions.map((q) => ({ ...q, question: fix(q.question) })).filter((q) => q.question),
    actions: result.actions.map((a) => ({ ...a, action: fix(a.action), firstStep: fix(a.firstStep), kpiFormula: fix(a.kpiFormula) })).filter((a) => a.action),
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
      messages: [{ role: 'user', content: `다음 규칙 기반 HR 진단 요약으로 해석 초안을 작성하세요.\n\n${JSON.stringify(input)}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { status: 'error', http: 429, error: 'AI 제공자 요청 한도에 걸렸습니다. 잠시 후 다시 시도하세요.' };
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 'error', http: 504, error: 'AI 응답 시간이 초과되었습니다.' };
    if (err instanceof Anthropic.AuthenticationError) return { status: 'error', http: 502, error: 'AI 제공자 인증 실패(서버 키 확인 필요)' };
    if (err instanceof Anthropic.APIError) return { status: 'error', http: 502, error: `AI 제공자 오류(${err.status ?? '연결'})` };
    return { status: 'error', http: 502, error: 'AI 요청 중 오류가 발생했습니다.' };
  }
  if (response.stop_reason === 'refusal') return { status: 'error', http: 422, error: 'AI가 이 요청에 답하지 않았습니다. 규칙 기반 해석을 사용하세요.' };
  if (response.stop_reason === 'max_tokens') return { status: 'error', http: 502, error: 'AI 응답이 길이 제한으로 잘렸습니다. 다시 시도하세요.' };
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let result;
  try {
    result = Output.parse(JSON.parse(text));
  } catch {
    return { status: 'error', http: 502, error: 'AI 응답 형식 검증에 실패했습니다.' };
  }
  // 근거 id는 입력에 있는 것만 남긴다
  const ids = new Set([...input.drivers.map((d) => d.id), ...input.outcomes.map((o) => o.id), ...input.risks.map((r) => r.id), ...input.objective.map((o) => o.id)]);
  result.insights = result.insights.map((r) => ({ ...r, refIds: r.refIds.filter((id) => ids.has(id)) }));
  result.interviewQuestions = result.interviewQuestions.map((q) => ({ ...q, refId: ids.has(q.refId) ? q.refId : '' }));
  const scrubbed = scrubResult(result);
  const left = [scrubbed.result.executiveSummary, ...scrubbed.result.actions.map((a) => a.action)].filter(Boolean).length;
  if (!left) return { status: 'error', http: 422, error: '근거 없는 비교·단정 표현만 있어 응답을 사용할 수 없습니다. 다시 시도하세요.' };
  return { status: 'ok', result: scrubbed.result, removed: scrubbed.removed, model: response.model };
}
