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
  // Task 3 strategic_options(축약): 추천안은 Rule Engine 값 그대로, Claude는 이 기업 맥락의 의미·전제만 쓴다
  option_notes: z
    .array(z.object({
      option: z.string().describe('A, B, C 중 하나(전략 대안 기호)'),
      text: z.string().describe('이 기업의 제품·기술 맥락에서 이 안이 뜻하는 것, 언제 이 안으로 전환할지'),
      prerequisite: z.string().describe('이 안을 실행하기 전에 갖춰야 할 전제 1개'),
    }))
    .describe('전략 대안 A·B·C 각각에 대한 메모 최대 3개'),
  // Task 4 action_plan(축약): 영역·우선순위는 Rule Engine 목록 그대로, Claude는 이 기업에 맞춘 과제 문장만 쓴다
  action_plan: z
    .array(z.object({
      area: z.string().describe('Rule Engine 우선순위 목록의 영역명 그대로(예: 리스크대응)'),
      action: z.string().describe('이 기업의 핵심기술·제품·의존요소를 짚은 90일 내 실행과제 1문장'),
      kpi: z.string().describe('완료기준·KPI 1개(목표 수치는 제안값으로, 현재 값처럼 쓰지 않음)'),
      evidence: z.string().describe('완료 시 남길 증빙자료'),
    }))
    .describe('우선순위 영역별 맞춤 90일 실행과제 최대 5개(우선순위 순서)'),
  // R&D 과제(지원사업) 제안: 유형·목표 TRL은 규칙 초안 그대로, Claude는 기업 맞춤 과제명·요약만
  rnd_notes: z
    .array(z.object({
      id: z.string().describe('R&D 과제 제안 번호 그대로(예: R&D-1)'),
      title: z.string().describe('이 기업의 기술·제품을 드러내는 과제명(40자 이내, 사업명·선정 가능성 표현 금지)'),
      summary: z.string().describe('무엇을 개발해 어떤 성과(제안값)를 낼지 1~2문장'),
    }))
    .describe('R&D 과제 제안별 과제명·요약 최대 3개'),
  // 보완 필요 기술: 대상 기술·경로는 규칙(로드맵 원문 핵심기술 대조) 그대로, Claude는 이 기업에 필요한 이유·첫 단계만
  gap_notes: z
    .array(z.object({
      tech: z.string().describe('제공된 보완 필요 후보의 원문 핵심기술명 그대로'),
      why: z.string().describe('이 기업의 제품·데이터·핵심기술 맥락에서 왜 필요한지 1문장'),
      first_step: z.string().describe('90일 안에 할 첫 단계 1문장(주어진 경로 — 자체 개발 또는 외부 협력 — 를 따름)'),
    }))
    .describe('보완 필요 기술 후보 최대 3개'),
  // 지원사업 신청 준비도: 관점별 판정은 규칙 그대로, Claude는 사업계획서 작성 포인트만
  plan_notes: z
    .array(z.object({
      axis: z.string().describe('관점 이름 그대로: 기술성, 수행 역량, 사업화·검증, 정책 연계 중 하나'),
      point: z.string().describe('이 기업의 사업계획서에서 이 관점을 어떻게 쓸지(어떤 진단 근거를 어떻게 제시하고 무엇을 먼저 보완할지) 1~2문장'),
    }))
    .describe('지원사업 신청 준비도 관점별 작성 포인트 최대 4개'),
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
  /** 사용자가 AI·외부 처리(국외 이전) 고지를 보고 동의함. 동의 없는 요청은 서버가 거부한다 */
  consent: z.literal(true),
  /** 화면에 표시된 로드맵 후보(원문 근거 조회용). 최대 3개 */
  roadmap: z
    .array(z.object({ uid: z.string().regex(/^[A-Za-z0-9가-힣@&\-_.]{3,80}$/), name: str(120), code: str(40).nullable().optional() }))
    .max(3)
    .default([]),
  /** 화면의 R&D 과제 제안(규칙 초안) — Claude가 과제명·요약을 다듬을 대상. 최대 3개 */
  rnd: z
    .array(z.object({
      id: z.string().regex(/^R&D-[1-4]$/), track: z.enum(['upgrade', 'frontier', 'validation', 'convergence']),
      title: str(120), techName: str(120), trlTarget: str(100),
    }))
    .max(3)
    .default([]),
});
export type InterpretRequest = z.infer<typeof InterpretRequest>;
