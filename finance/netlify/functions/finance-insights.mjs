// BECONIC 기업 재무진단 — AI 개선처방 서버 함수 (Netlify Functions v2)
// 브라우저는 검증된 요약 지표만 보낸다. 이 함수는 ① 운영 스위치 ② 승인 코드 ③ IP·일일 사용량 한도
// ④ 입력 스키마 검증 ⑤ 구조화 출력 ⑥ 금지 표현 차단을 거친 뒤에만 결과를 돌려준다.
// ANTHROPIC_API_KEY 는 Netlify 환경변수(Functions 범위)에만 둔다.
import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { z } from 'zod';

export const config = { path: '/api/finance-insights' };

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const DAILY_LIMIT = Number(process.env.BECONIC_AI_DAILY_LIMIT || 200); // 전체 일일 호출 상한(예산 보호)
const IP_LIMIT = Number(process.env.BECONIC_AI_IP_LIMIT || 10); // IP당 일일 상한
const MAX_BODY = 24_000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

// ── 입력 스키마: 요약 지표·징후만 허용 (회사명·사업자번호·거래내역 키는 거부) ──
const num = z.union([z.number().finite(), z.literal('표시보류'), z.null()]);
const Input = z
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
const OUTPUT_SCHEMA = {
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
const Output = z.object({
  executiveSummary: z.string().max(1200),
  observations: z.array(z.object({ metricId: z.string(), year: z.number().int(), fact: z.string().max(400), impact: z.string().max(400) })).max(12),
  risks: z.array(z.object({ findingIds: z.array(z.string()).max(6), risk: z.string().max(400), verifyNext: z.string().max(400) })).max(8),
  actions: z.array(z.object({ priority: z.enum(['P1', 'P2', 'P3']), ownerRole: z.string().max(40), timeline: z.enum(['30일', '90일', '6개월', '12개월']), action: z.string().max(300), kpiFormula: z.string().max(200), neededData: z.string().max(200) })).max(10),
  questions: z.array(z.string().max(200)).max(10),
  limitations: z.array(z.string().max(300)).max(8),
});

const FORBID = /(신용\s*등급\s*[은는이가]?\s*[A-D]|[A-D]{1,3}[+-]?\s*등급|부도\s*확률|파산\s*확률|업종\s*평균|동종\s*업계\s*평균|산업\s*평균)/;

const SYSTEM = `당신은 한국 중소기업 재무 진단을 돕는 분석 보조자입니다. 입력은 회사가 제출하고 사람이 검증한 3개년 재무지표(결정론 코드로 계산된 값)와, 수치 정의로 확인된 징후 목록입니다.
작성 원칙:
- '확인된 사실'(observations), '추가 확인 필요'(risks), '권고사항'(actions)을 분리합니다.
- 수치는 입력에 있는 값만, 입력과 같은 단위·소수 자리로 인용합니다. 새 숫자를 계산하거나 만들지 않습니다. 비율 차이는 %p로 표기합니다.
- 공식 신용등급, 부도·파산 확률, 업종·산업 평균, 금액 목표치를 생성하지 않습니다. 미래 매출·상환능력을 사실처럼 단정하지 않습니다.
- 인과관계는 가능성으로 쓰고, 확인할 자료와 질문을 함께 제시합니다. risks.findingIds 에는 입력 findings 의 id 만 씁니다.
- 실행 과제는 중소기업 대표·재무담당자가 바로 착수할 수 있게 구체적으로, KPI는 산식으로만 씁니다(목표값 없음).
- 한국어, 쉬운 경영 용어, 존댓말로 간결하게 씁니다.`;

function clientIp(req, context) {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function takeQuota(ip) {
  // Netlify Blobs 기반 일일 카운터 (동시 요청 시 소폭 초과 가능 — 예산 상한은 Anthropic 콘솔 한도와 함께 운영)
  const store = getStore('finance-ai-usage');
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}`;
  const usage = (await store.get(key, { type: 'json' })) || { total: 0, ip: {} };
  if (usage.total >= DAILY_LIMIT) return { ok: false, error: '오늘의 AI 사용량 한도에 도달했습니다. 내일 다시 시도하세요.' };
  const ipKey = ip.replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45);
  if ((usage.ip[ipKey] || 0) >= IP_LIMIT) return { ok: false, error: '이 네트워크의 오늘 AI 요청 한도를 넘었습니다.' };
  usage.total += 1;
  usage.ip[ipKey] = (usage.ip[ipKey] || 0) + 1;
  await store.setJSON(key, usage);
  return { ok: true };
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'POST 요청만 가능합니다.' });
  if (process.env.BECONIC_AI_ENABLED !== 'true') return json(503, { error: 'AI 기능이 꺼져 있습니다(운영자 설정 필요).' });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: '서버에 API 키가 설정되지 않았습니다.' });
  const code = process.env.BECONIC_ACCESS_CODE;
  if (!code || code.length < 8) return json(503, { error: '승인 코드가 설정되지 않아 AI 기능을 열 수 없습니다.' });
  if (req.headers.get('x-beconic-access') !== code) return json(401, { error: '이용 코드가 올바르지 않습니다.' });
  const origin = req.headers.get('origin');
  if (origin && process.env.URL && origin !== process.env.URL && origin !== process.env.DEPLOY_PRIME_URL) return json(403, { error: '허용되지 않은 출처입니다.' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: '요청이 너무 큽니다.' });
  let input;
  try {
    input = Input.parse(JSON.parse(raw));
  } catch {
    return json(422, { error: '검증된 요약 지표 형식이 아닙니다.' });
  }

  try {
    const q = await takeQuota(clientIp(req, context));
    if (!q.ok) return json(429, { error: q.error });
  } catch {
    return json(503, { error: '사용량 확인 저장소에 접근할 수 없어 요청을 막았습니다.' });
  }

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 6000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `다음 검증된 재무 요약으로 개선처방 초안을 작성하세요.\n\n${JSON.stringify(input)}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'AI 제공자 요청 한도에 걸렸습니다. 잠시 후 다시 시도하세요.' });
    if (err instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: 'AI 응답 시간이 초과되었습니다.' });
    if (err instanceof Anthropic.APIError) return json(502, { error: `AI 제공자 오류(${err.status ?? '연결'})` });
    return json(502, { error: 'AI 요청 중 오류가 발생했습니다.' });
  }

  if (response.stop_reason === 'refusal') return json(422, { error: 'AI가 이 요청에 답하지 않았습니다. 결정론 분석 결과를 사용하세요.' });
  if (response.stop_reason === 'max_tokens') return json(502, { error: 'AI 응답이 길이 제한으로 잘렸습니다. 다시 시도하세요.' });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let result;
  try {
    result = Output.parse(JSON.parse(text));
  } catch {
    return json(502, { error: 'AI 응답 형식 검증에 실패했습니다.' });
  }
  const ids = new Set(input.findings.map((f) => f.id));
  result.risks = result.risks.map((r) => ({ ...r, findingIds: r.findingIds.filter((id) => ids.has(id)) }));
  const flat = JSON.stringify(result);
  if (FORBID.test(flat)) return json(422, { error: '근거 없는 등급·확률·업종 평균 표현이 포함되어 응답을 차단했습니다.' });

  return json(200, { result, model: response.model, notice: 'AI 작성 초안입니다. 경영진 또는 전문가 검토가 필요합니다.' });
};
