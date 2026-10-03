// Phase 5 Task 2 interpret_assessment — 서버 전용(ANTHROPIC_API_KEY 사용).
// 흐름: 입력 검증 → Rule Engine 재계산(점수는 서버가 계산한 값만) → (선택) 원문 근거 조회 → Claude 구조화 출력 → 가드레일.
// Claude는 점수·TRL·우선순위를 바꾸지 못하고, 실패하면 화면은 규칙 기반 해석을 그대로 쓴다.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { evaluate, type AssessmentInput, type AssessmentResult, type Dimension } from '../diagnosis';
import type { EvidenceQuote } from '../rag/evidence';
import { applyGuardrail, type GuardContext, type Violation } from './guardrail';
import { Interpretation, type InterpretRequest } from './schema';
import { SYSTEM_PROMPT, PROMPT_VERSION } from './prompt';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export type Effort = 'low' | 'medium' | 'high';

const DIM_LABEL: Record<Dimension, string> = {
  tech: '기술성숙', rd: 'R&D 역량', exec: '실행준비', evidence: '기술기록', scale: '확장준비', strategy: '전략정렬', risk: '리스크대응',
};

export interface InterpretDeps {
  client: Pick<Anthropic, 'beta'> | null;
  model?: string;
  effort?: Effort;
  /** 품목별 원문 근거(없으면 빈 객체). 서버 함수가 Supabase에서 조회해 넘긴다 */
  evidence?: Record<string, EvidenceQuote[]>;
}

export type InterpretResponse =
  | { status: 'not_configured' }
  | { status: 'fallback'; reason: 'refusal' | 'max_tokens' | 'invalid_output' | 'empty' }
  | {
      status: 'ok';
      interpretation: Interpretation;
      model: string;
      promptVersion: string;
      ruleVersions: AssessmentResult['versions'];
      removed: number;
      violations: Violation[];
      usage: { input: number; output: number };
    };

/** 원문 근거·Rule 결과에서 허용 값 목록을 만든다(가드레일 대조용) */
export function guardContext(r: AssessmentResult, input: AssessmentInput, evidence: Record<string, EvidenceQuote[]>): GuardContext {
  const scores = [...Object.values(r.m), r.capability, r.confidence].filter((x): x is number => x !== null).map((x) => Math.round(x));
  const trls = new Set<number>();
  for (const t of input.inventory) if (t.trl > 0) [t.trl, Math.min(9, t.trl + 1)].forEach((x) => trls.add(x));
  const quotes = Object.values(evidence).flat();
  for (const q of quotes) for (const m of (q.trl ?? '').matchAll(/\d/g)) trls.add(Number(m[0]));
  return {
    scores: [...new Set(scores)],
    trls: [...trls],
    evidenceUids: Object.keys(evidence).filter((k) => evidence[k].length),
    codes: [...new Set(quotes.flatMap((q) => q.citation.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\d{2}-\d{2}\b/g) ?? []))],
    pages: [...new Set(quotes.flatMap((q) => [q.printedPage, q.pdfPage]).filter((x): x is number => x !== null))],
    // 이 POC의 입력은 모두 자가응답이다. 외부검증 Evidence(4단계)가 확인되기 전에는 '확인된 사실' 표기 금지
    allowVerifiedFact: false,
  };
}

/** Claude에게 넘길 입력: 계산은 끝난 값만, 원문은 발췌 그대로 */
export function buildUserContent(input: AssessmentInput, r: AssessmentResult, req: InterpretRequest, evidence: Record<string, EvidenceQuote[]>): string {
  const c = input.company;
  const dims = (Object.keys(DIM_LABEL) as Dimension[]).map((d) => `- ${DIM_LABEL[d]}: ${r.m[d] === null ? '판단 보류(응답 없음)' : `${Math.round(r.m[d] as number)}/100`}`);
  const techs = input.inventory
    .filter((t) => t.critical)
    .map((t) => `- ${t.name} · ${t.ownership} · ${t.trl > 0 ? `TRL ${t.trl}` : 'TRL 확인 필요'}${t.confirmed ? ' (담당자 확인)' : ' (미확인)'}`);
  const gaps = r.gaps.slice(0, 5).map((g) => `- ${g.priority} ${g.area}: ${g.score === null ? '점수 산정 불가(근거확보 과제)' : `${Math.round(g.score)}/100`}`);
  const rm = req.roadmap.map((it) => {
    const qs = evidence[it.uid] ?? [];
    const body = qs.length
      ? qs.map((q) => `  · [${q.label}${q.technologyName ? ` · ${q.technologyName}` : ''}${q.trl ? ` · TRL ${q.trl}` : ''}] "${q.quote}" (${q.citation})`).join('\n')
      : '  · 원문 근거 없음(이 품목은 roadmap_notes에 쓰지 말 것)';
    return `- item_uid=${it.uid} · ${it.name}${it.code ? ` (${it.code})` : ''}\n${body}`;
  });
  const disc = input.discovery;
  return [
    '## 기업 입력(자가응답)',
    `- 업종·운영유형: ${c.bizType} / 세부: ${c.sectorDetail || '미입력'}`,
    `- 제품·서비스: ${c.product || '미입력'}`,
    `- 고객: ${c.customer || '미입력'}`,
    `- 기술로드맵 분야(기업 선택): ${c.roadmapField}`,
    `- 가장 어려운 기술 부분: ${disc.hardPart || '미입력'}`,
    `- 데이터: ${disc.data || '미입력'} / 외부 의존: ${disc.external || '미입력'} / 핵심 인력: ${disc.people || '미입력'} / 검증 경험: ${disc.validation || '미입력'}`,
    '',
    '## 핵심기술(기업 입력, TRL은 기술별 값 그대로)',
    ...(techs.length ? techs : ['- 핵심기술 미지정']),
    '',
    '## Rule Engine 결과(변경 금지)',
    `- 기술역량: ${r.capability === null ? '판단 보류' : `${Math.round(r.capability)}/100`} · 진단 신뢰도: ${Math.round(r.confidence)}/100 · 진단 단계: ${r.level}`,
    `- 응답 ${r.answered}개, '모름' ${r.unknown}개('모름'은 0점이 아니라 불확실성)`,
    ...dims,
    '- 우선순위(Rule Engine 산정 순서 그대로):',
    ...gaps,
    ...(r.alerts.length ? ['- 일관성 경고:', ...r.alerts.map((a) => `  · ${a}`)] : []),
    '',
    '## 로드맵 참고 후보와 원문 근거(발췌 그대로)',
    ...(rm.length ? rm : ['- 후보 없음']),
  ].join('\n');
}

export async function interpretAssessment(req: InterpretRequest, deps: InterpretDeps): Promise<InterpretResponse> {
  if (!deps.client) return { status: 'not_configured' };
  const input = req.input as AssessmentInput;
  const r = evaluate(input);
  const evidence = deps.evidence ?? {};
  const model = deps.model || DEFAULT_MODEL;

  const call = deps.client.beta.messages.parse({
    model,
    max_tokens: 6000,
    betas: ['server-side-fallback-2026-07-01'],
    // 안전 분류기가 거절하면 서버에서 대체 모델로 자동 재시도(거절 유형별 권장 모델)
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: { effort: deps.effort ?? 'low', format: betaZodOutputFormat(Interpretation) },
    messages: [{ role: 'user', content: buildUserContent(input, r, req, evidence) }],
  });
  let msg: Awaited<typeof call>;
  try {
    msg = await call;
  } catch (e) {
    // API 오류(인증·한도·네트워크)는 호출한 쪽에서 종류별로 기록. 응답 JSON 해석 실패만 여기서 fallback
    if (e instanceof Anthropic.APIError) throw e;
    return { status: 'fallback', reason: 'invalid_output' };
  }

  if (msg.stop_reason === 'refusal') return { status: 'fallback', reason: 'refusal' };
  if (msg.stop_reason === 'max_tokens') return { status: 'fallback', reason: 'max_tokens' };
  const parsed = msg.parsed_output;
  if (!parsed) return { status: 'fallback', reason: 'invalid_output' };

  const { output, violations } = applyGuardrail(parsed, guardContext(r, input, evidence));
  const removed = violations.filter((v) => v.kind !== 'claim_downgraded' && v.kind !== 'trimmed').length;
  if (!output.headline && !output.strengths.length && !output.constraints.length) return { status: 'fallback', reason: 'empty' };
  return { status: 'ok', interpretation: output, model: msg.model, promptVersion: PROMPT_VERSION, ruleVersions: r.versions, removed, violations,
    usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}
