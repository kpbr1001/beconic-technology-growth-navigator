// Phase 5 Task 2 interpret_assessment: Claude가 돌려줄 해석의 형식(구조화 출력)과 요청 입력 검증.
// 점수·TRL·로드맵 품목은 Rule Engine·원문 KB 값만 쓰고, Claude는 '해석 문장'만 만든다.
import { z } from 'zod/v4';

/** 모든 문장에 붙는 근거 유형(마스터 프롬프트 claim_type). 화면·PDF에서 색으로 구분 */
export const CLAIM_TYPES = ['verified_fact', 'self_report', 'retrieved_evidence', 'hypothesis', 'recommendation'] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_LABEL: Record<ClaimType, string> = {
  verified_fact: '확인된 사실',
  self_report: '자가응답',
  retrieved_evidence: '원문 근거',
  hypothesis: '검증 가설',
  recommendation: '권고',
};

const Claim = z.object({
  text: z.string().describe('한국어 1~2문장, 220자 이내'),
  // 구조화 출력이 enum을 강제하지 않으므로 문자열로 받고, 목록 밖 값은 가드레일이 '검증 가설'로 낮춘다
  claim_type: z.string().describe(`다음 중 하나: ${CLAIM_TYPES.join(', ')}`),
  basis: z.string().describe('근거로 쓴 입력 항목. 예: "리스크대응 25/100", "핵심기술 설비 이상패턴 탐지 TRL 확인 필요"'),
});

export const Interpretation = z.object({
  headline: z.string().describe('경영진용 핵심 해석 1~2문장. 점수 나열이 아니라 병목과 우선순위의 의미'),
  strengths: z.array(Claim).describe('강점 최대 3개'),
  constraints: z.array(Claim).describe('제약·병목 최대 3개'),
  root_cause_hypotheses: z
    .array(z.object({ text: z.string(), verify_by: z.string().describe('무엇으로 확인하는지(인터뷰·문서·현장데이터)') }))
    .describe('근본원인 검증 가설 최대 4개'),
  confirmation_needed: z.array(z.string()).describe('대표·CTO에게 확인할 질문 최대 4개'),
  roadmap_notes: z
    .array(z.object({ item_uid: z.string(), text: z.string() }))
    .describe('제공된 원문 근거가 있는 로드맵 품목에 대해서만, 기업 기술과의 연결 지점 최대 3개'),
});
export type Interpretation = z.infer<typeof Interpretation>;

// ---- 요청 입력(브라우저 → 서버). 서버가 Rule Engine을 다시 계산하므로 점수는 받지 않는다.
const str = (max: number) => z.string().max(max);
const Answer = z.union([z.number().int().min(1).max(5), z.null()]).optional();

export const InterpretRequest = z.object({
  input: z.object({
    mode: z.enum(['quick', 'deep']),
    company: z.object({
      name: str(80).optional(),
      stage: str(40).optional(),
      roadmapField: str(60),
      bizType: str(60),
      sectorDetail: str(300),
      size: str(40).optional(),
      years: str(40).optional(),
      techKnow: str(40).optional(),
      product: str(600),
      customer: str(300).optional(),
    }),
    discovery: z.object({
      hardPart: str(600), automated: str(600), data: str(600), external: str(600), people: str(600), validation: str(600),
    }),
    inventory: z
      .array(z.object({
        id: z.number(), name: str(120), type: str(40), ownership: str(40), status: str(40),
        critical: z.boolean(), trl: z.number().int().min(0).max(9), confirmed: z.boolean(),
      }))
      .max(20),
    answers: z.record(str(20), Answer),
    evidence: z.record(str(20), z.number().int().min(0).max(4).optional()),
  }),
  /** 화면에 표시된 로드맵 후보(원문 근거 조회용). 최대 3개 */
  roadmap: z
    .array(z.object({ uid: z.string().regex(/^[A-Za-z0-9가-힣@&\-_.]{3,80}$/), name: str(120), code: str(40).nullable().optional() }))
    .max(3)
    .default([]),
});
export type InterpretRequest = z.infer<typeof InterpretRequest>;
