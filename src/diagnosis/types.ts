// BECONIC Rule Engine 공용 타입. Rule Engine은 DOM·네트워크에 의존하지 않는 순수 함수로만 구성한다.

export type Dimension = 'tech' | 'rd' | 'exec' | 'evidence' | 'scale' | 'strategy' | 'risk';
export type DiagnosisMode = 'quick' | 'deep';
export type Profile = 'AI/SW' | '제조' | '서비스' | '딥테크' | '융합';

export interface Question {
  id: string;
  cat: Dimension;
  w: number;
  critical?: boolean;
  t: string;
}

export interface EvidenceLevel {
  k: 0 | 1 | 2 | 3 | 4;
  name: string;
  m: number;
  desc: string;
}

export interface Company {
  name: string;
  stage: string;
  roadmapField: string;
  bizType: string;
  sectorDetail: string;
  size: string;
  years: string;
  techKnow: string;
  product: string;
  customer: string;
}

export interface Discovery {
  hardPart: string;
  automated: string;
  data: string;
  external: string;
  people: string;
  validation: string;
}

export interface TechItem {
  id: number;
  name: string;
  type: string;
  ownership: string;
  status: string;
  critical: boolean;
  /** 0 = 확인필요 */
  trl: number;
  confirmed: boolean;
  /** 후보를 찾은 기술 발견 답변 칸(예: hardPart) — 핵심기술 우선순위 판단에 씀 */
  src?: string;
}

/** 1~5 척도, null = 모름·확인필요, undefined = 미응답 */
export type Answer = number | null | undefined;

export interface AssessmentInput {
  mode: DiagnosisMode;
  company: Pick<Company, 'bizType' | 'roadmapField' | 'product' | 'sectorDetail'> & Partial<Company>;
  discovery: Discovery;
  inventory: TechItem[];
  answers: Record<string, Answer>;
  evidence: Record<string, number | undefined>;
}

/** 응답이 하나도 없는 차원은 null(판단 보류). 50 같은 중립값으로 채우지 않는다. */
export type DimensionScores = Record<Dimension, number | null>;

export type Priority = 'P0' | 'P1' | 'P2';

export interface Gap {
  area: string;
  /** null = 점수 산정 불가(근거확보 과제) */
  score: number | null;
  ps: number | null;
  priority: Priority;
}

export interface TrlSummary {
  /** 핵심기술별 TRL. 평균으로 합치지 않는다. */
  items: { id: number; name: string; trl: number | null }[];
  confirmedCount: number;
  unknownCount: number;
  min: number | null;
  max: number | null;
  /** 예: "4~7", 확인된 TRL이 없으면 "확인필요" */
  distribution: string;
}

export interface Versions {
  assessment: string;
  question: string;
  scoring: string;
  roadmapKb: string;
}

export interface AssessmentResult {
  versions: Versions;
  m: DimensionScores;
  pendingDimensions: Dimension[];
  confidence: number;
  capability: number | null;
  trl: TrlSummary;
  level: '잠정진단' | '근거기반 진단' | '외부검증 준비';
  answered: number;
  unknown: number;
  gaps: Gap[];
  alerts: string[];
  /** 공통 핵심 12문항 응답 수가 MIN_CORE_ANSWERS 미만이면 true(전 영역 판단 보류) */
  insufficient: boolean;
  coreAnswered: number;
  range: [number, number] | null;
}
