// 문항·척도·근거수준 정의. v0.9 원문과 동일하게 유지한다(전문가 검증 전 임의 수정 금지).
import type { Dimension, DiagnosisMode, EvidenceLevel, Profile, Question } from './types';

export const ANCHORS: Record<Dimension, string[]> = {
  tech: ['개념·미구현', '일부 구현', '반복 구현 가능', '실제환경 검증', '상용운영·지속개선'],
  rd: ['체계 없음', '프로젝트마다 다름', '기본 절차·산출물 있음', '성과를 반복 관리', '포트폴리오 최적화'],
  exec: ['담당·기준 없음', '개인 중심 수행', '담당·절차·완료기준 있음', 'KPI로 주기 관리', '데이터 기반 지속개선'],
  evidence: ['기록 거의 없음', '개인 기록 중심', '핵심 문서·이력 관리', '운영·고객 근거 연결', '외부도 추적·검증 가능'],
  scale: ['확장 고려 안 함', '병목 일부 인지', '확장 기준·계획 있음', '부하·양산 검증 경험', '확장 최적화·지속개선'],
  strategy: ['기술방향 미정', '필요기술 일부 인지', '목표기술·과제 정의', '시장·정책과 연계', '포트폴리오 지속갱신'],
  risk: ['리스크 미파악', '주요 위험 인지', '대응책·책임자 있음', '대체책·테스트·모니터링', '예방·복원력 체계 운영'],
};

export const EVIDENCE: EvidenceLevel[] = [
  { k: 0, name: '말로만 설명', m: 0.42, desc: '별도 근거 없이 응답자의 설명에 의존' },
  { k: 1, name: '내부 자료', m: 0.62, desc: '회의록·메모·화면·내부문서 등으로 확인' },
  { k: 2, name: '추적 기록', m: 0.78, desc: '버전·시험기록·도면·로그·시제품 등 재확인 가능' },
  { k: 3, name: '운영·고객 근거', m: 0.9, desc: 'PoC·납품·실사용·운영로그 등 실제 적용 근거' },
  { k: 4, name: '외부·공식 검증', m: 1, desc: '시험기관·인증·특허·공공DB 등 독립 확인' },
];

export const CORE: Question[] = [
  { id: 'q1', cat: 'tech', w: 1.3, critical: true, t: '핵심 기능이 실제로 동작하는 형태로 구현되어 있습니까?' },
  { id: 'q2', cat: 'tech', w: 1.3, critical: true, t: '실제 고객 또는 실제와 유사한 환경에서 기술을 검증한 경험이 있습니까?' },
  { id: 'q3', cat: 'rd', w: 1.1, t: '연구개발 인력·예산·장비 등 필요한 자원을 계획하고 확보하고 있습니까?' },
  { id: 'q4', cat: 'rd', w: 1.1, t: '개발→시험→검증→개선 과정을 반복할 수 있는 방식으로 운영합니까?' },
  { id: 'q5', cat: 'exec', w: 1.0, critical: true, t: '기술과제별 담당자·일정·완료기준이 정해져 있습니까?' },
  { id: 'q6', cat: 'evidence', w: 1.1, critical: true, t: '개발 과정과 결과를 다시 확인할 수 있는 기록이 남아 있습니까?' },
  { id: 'q7', cat: 'scale', w: 1.0, t: '고객·생산량·사용량이 늘어나도 품질을 유지할 준비가 되어 있습니까?' },
  { id: 'q8', cat: 'strategy', w: 1.0, t: '향후 1~3년 동안 확보해야 할 핵심기술이 무엇인지 정의되어 있습니까?' },
  { id: 'q9', cat: 'risk', w: 1.0, t: '특정 인력·외주사·API·장비 의존도와 대체방안을 알고 있습니까?' },
  { id: 'q10', cat: 'risk', w: 1.0, critical: true, t: '인증·보안·안전·개인정보 등 필수 기술요건을 확인했습니까?' },
  { id: 'q11', cat: 'strategy', w: 1.1, critical: true, t: '자사 기술과 시장·산업·정부 기술로드맵의 연관성을 설명할 수 있습니까?' },
  { id: 'q12', cat: 'tech', w: 1.1, t: '경쟁사가 쉽게 따라 하기 어려운 기술·공정·데이터·노하우가 구체적으로 있습니까?' },
];

export const DEEP: Record<Exclude<Profile, '융합'>, Question[]> = {
  'AI/SW': [
    { id: 'd1', cat: 'tech', w: 1.1, t: '소스코드·버전·배포 이력을 추적할 수 있습니까?' },
    { id: 'd2', cat: 'tech', w: 1.1, t: '데이터 출처·품질·변경이력을 관리하고 있습니까?' },
    { id: 'd3', cat: 'exec', w: 1.0, t: '장애·오류·성능저하를 탐지하고 원인을 추적할 수 있습니까?' },
    { id: 'd4', cat: 'risk', w: 1.0, t: '외부 AI/API가 변경·중단되어도 대체할 방법이 있습니까?' },
  ],
  제조: [
    { id: 'd5', cat: 'tech', w: 1.1, t: '핵심 공정조건·작업표준으로 동일 품질을 반복 생산할 수 있습니까?' },
    { id: 'd6', cat: 'evidence', w: 1.0, t: 'BOM·도면·공정·검사기록을 추적할 수 있습니까?' },
    { id: 'd7', cat: 'scale', w: 1.1, t: '생산량 증가 시 병목공정·설비능력·외주 리스크를 확인했습니까?' },
    { id: 'd8', cat: 'risk', w: 1.0, t: '핵심 부품·원재료·장비의 대체 공급원을 확보했습니까?' },
  ],
  서비스: [
    { id: 'd9', cat: 'tech', w: 1.1, t: '서비스 품질이 특정 개인이 아니라 표준 프로세스로 재현됩니까?' },
    { id: 'd10', cat: 'scale', w: 1.1, t: '고객이 늘어나도 동일 품질과 납기를 유지할 운영 구조가 있습니까?' },
    { id: 'd11', cat: 'evidence', w: 1.0, t: '서비스 품질과 고객성과를 수치 또는 기록으로 추적합니까?' },
  ],
  딥테크: [
    { id: 'd12', cat: 'rd', w: 1.2, t: '핵심 가설과 실험 조건이 반복 검증 가능한 형태로 정의되어 있습니까?' },
    { id: 'd13', cat: 'tech', w: 1.2, t: '실험실 성능과 실제 적용환경 성능의 차이를 검증한 적이 있습니까?' },
    { id: 'd14', cat: 'evidence', w: 1.0, t: '핵심기술의 IP·시험·논문·인증 등 외부 확인 근거가 있습니까?' },
    { id: 'd15', cat: 'scale', w: 1.0, t: '시제품에서 양산·현장 적용으로 넘어갈 때 필요한 Scale-up 조건을 정의했습니까?' },
  ],
};

export const DIMENSIONS: Dimension[] = ['tech', 'rd', 'exec', 'evidence', 'scale', 'strategy', 'risk'];

/** 문항 화면용 차원명 */
export const DIMENSION_NAME: Record<Dimension, string> = {
  tech: '기술성숙', rd: 'R&D 역량', exec: '실행준비', evidence: '기술기록',
  scale: '확장준비', strategy: '전략정렬', risk: '리스크대응',
};

/** 결과·보고서용 영역명(문항 화면과 같은 표기) */
export const AREA_NAME: Record<Dimension, string> = { ...DIMENSION_NAME };

export function profile(bizType: string): Profile {
  const t = bizType;
  if (t.includes('AI/SW')) return 'AI/SW';
  if (t.includes('제조') && !t.includes('융합')) return '제조';
  if (t.includes('서비스')) return '서비스';
  if (t.includes('R&D/딥테크')) return '딥테크';
  if (t.includes('하드웨어')) return '제조';
  if (t.includes('융합')) return '융합';
  return 'AI/SW';
}

export function deepQuestions(bizType: string): Question[] {
  const p = profile(bizType);
  if (p === '융합') return [...DEEP['AI/SW'].slice(0, 2), ...DEEP['제조'].slice(0, 3)];
  return DEEP[p] || [];
}

export function activeQuestions(mode: DiagnosisMode, bizType: string): Question[] {
  return mode === 'deep' ? CORE.concat(deepQuestions(bizType)) : CORE.slice();
}

export function evidenceLevel(evidence: Record<string, number | undefined>, id: string): EvidenceLevel {
  return EVIDENCE[Math.max(0, Math.min(4, Number(evidence[id] ?? 0)))];
}

export const isUnknown = (v: unknown): v is null | undefined => v === null || v === undefined;
