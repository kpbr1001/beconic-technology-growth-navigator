// 리스크 레드팀(규칙 기반): 리스크 레지스터 + '이 진단이 틀릴 수 있는 지점' + 반증 질문.
// 점수·우선순위는 바꾸지 않는다. 응답·근거수준·입력에서 바로 확인되는 신호만 쓰고, '모름'은 낮은 점수가 아니라 '확인 필요'로 둔다.
import { activeQuestions, AREA_NAME, evidenceLevel, isUnknown } from './questions';
import type { Answer, AssessmentInput, AssessmentResult, Dimension } from './types';
import { qRef, qRefs } from './qref';

/** 1=낮음 2=중간 3=높음 */
export type Level = 1 | 2 | 3;
export const LEVEL_NAME: Record<Level, string> = { 1: '낮음', 2: '중간', 3: '높음' };

export interface RiskEntry {
  id: string;
  category: string;
  name: string;
  /** null = 관련 문항이 '모름'·미응답(확인 필요) */
  likelihood: Level | null;
  impact: Level;
  /** 가능성×영향(1~9). 확인 필요는 null */
  severity: number | null;
  grade: '높음' | '중간' | '낮음' | '확인 필요';
  /** 판단 근거(응답·근거수준·입력) */
  basis: string;
  /** 무엇이 잘못될 수 있나 */
  scenario: string;
  /** 조기경보 신호 */
  earlyWarning: string;
  /** 90일 완화조치 */
  mitigation: string;
  owner: string;
  area: string;
  /** 레드팀 반증 질문 */
  challenge: string;
}

export interface DiagnosticCheck {
  title: string;
  level: '주의' | '확인' | '참고';
  detail: string;
}

export interface RedTeam {
  risks: RiskEntry[];
  counts: { high: number; mid: number; low: number; unknown: number };
  diagnostic: DiagnosticCheck[];
}

interface Def {
  id: string;
  category: string;
  name: string;
  /** 관련 문항(가장 낮은 응답이 가능성을 정한다). 진단 유형에 없는 문항은 건너뜀 */
  qs: string[];
  impact: Level;
  area: Dimension;
  owner: string;
  scenario: string;
  earlyWarning: string;
  mitigation: string;
  challenge: string;
  /** 입력값 근거(예: 외부 의존 응답 문구) */
  input?: (i: AssessmentInput) => string | undefined;
  /** 이 리스크를 볼지(예: 핵심 인력 입력이 있을 때만) */
  when?: (i: AssessmentInput) => boolean;
}

const DEFS: Def[] = [
  {
    id: 'R1', category: '기술', name: '실증·재현 리스크', qs: ['q2', 'd13'], impact: 3, area: 'tech', owner: '기술책임자',
    scenario: '실험실·PoC 성능이 고객 현장에서 재현되지 않아 납품·확장 일정이 밀리고 기술수준이 과대평가됩니다.',
    earlyWarning: '현장별 성능 편차, PoC 재작업·일정 연장, 고객 검수 보류',
    mitigation: '현장 성공·실패 기준을 먼저 정의하고 다른 조건의 현장에서 반복 PoC',
    challenge: '다른 고객·설비 조건에서 같은 성능을 재현한 기록이 있습니까?',
    input: (i) => i.discovery.validation,
  },
  {
    id: 'R2', category: '사업연속성', name: '외부 의존 중단 리스크', qs: ['q9', 'd4', 'd8'], impact: 3, area: 'risk', owner: 'CTO/운영',
    scenario: '외주·API·클라우드·장비·핵심 부품의 중단, 가격·정책 변경이 곧바로 서비스·생산 중단으로 이어집니다.',
    earlyWarning: '공급자 공지·요금 변경, 장애 빈도, 단일 공급처 비중',
    mitigation: '의존요소 목록(Dependency Map)과 Top5 대체경로·전환 시험',
    challenge: '핵심 외부 요소가 내일 중단되면 며칠 안에, 어떤 방법으로 복구합니까?',
    input: (i) => i.discovery.external,
  },
  {
    id: 'R3', category: '조직·지식', name: '핵심 인력 의존 리스크', qs: ['q6', 'q5'], impact: 3, area: 'evidence', owner: '대표',
    scenario: '핵심 노하우가 특정 인력에 몰려 있어 이탈·부재 시 개발·운영이 멈추고 기술이 회사 자산으로 남지 않습니다.',
    earlyWarning: '특정인 승인·질문 대기 증가, 문서 없는 변경, 휴가·이탈 시 지연',
    mitigation: '핵심기술 정의서·인수인계 문서, 2인 이상 숙련(백업 담당) 지정',
    challenge: '핵심 인력이 한 달 부재하면 누가 같은 결과를 낼 수 있습니까?',
    input: (i) => i.discovery.people,
    when: (i) => Boolean(i.discovery.people?.trim()),
  },
  {
    id: 'R4', category: '규제·인증', name: '규제·인증 미충족 리스크', qs: ['q10'], impact: 3, area: 'risk', owner: '대표/품질',
    scenario: '인증·보안·안전·개인정보 요건을 늦게 확인해 납품·입찰·출시가 지연되거나 재설계가 필요해집니다.',
    earlyWarning: '고객 보안·인증 요구서 증가, 입찰 자격 미달, 감사 지적',
    mitigation: '목표 시장·고객별 필수 요건 체크리스트와 리드타임 확인',
    challenge: '첫 대형 고객이 요구할 인증·보안 요건과 취득 기간을 알고 있습니까?',
  },
  {
    id: 'R5', category: '지식자산', name: '증빙·IP 공백 리스크', qs: ['q6', 'q12', 'd6', 'd14'], impact: 2, area: 'evidence', owner: '기술담당',
    scenario: '기술이 있어도 기록·특허·시험 근거가 없어 R&D 과제·투자·지원사업 평가에서 입증하지 못하고 모방에 대응하기 어렵습니다.',
    earlyWarning: '평가·실사 자료 요청에 재작성 필요, 버전·시험기록 누락',
    mitigation: '핵심기술 1쪽 정의서, 시험·변경 이력, 출원 가능 항목 검토',
    challenge: '외부 평가자가 요청하면 핵심기술의 개발·시험 기록을 하루 안에 낼 수 있습니까?',
  },
  {
    id: 'R6', category: '확장', name: 'Scale-up 병목 리스크', qs: ['q7', 'd7', 'd10', 'd15'], impact: 2, area: 'scale', owner: '운영/생산',
    scenario: '고객·생산량·사용량이 늘 때 품질·비용·납기 한계가 먼저 드러나 확장 수익성이 떨어집니다.',
    earlyWarning: '처리시간·불량률·장애가 물량과 함께 증가, 수작업 비중',
    mitigation: '물량 2~3배 시나리오 부하·양산 테스트와 병목 Top3 한계치 정의',
    challenge: '고객·물량이 3배가 되면 가장 먼저 깨지는 지점(공정·시스템·운영 인력)은 무엇입니까?',
  },
  {
    id: 'R7', category: '실행', name: '과제 실행 지연 리스크', qs: ['q5'], impact: 2, area: 'exec', owner: '대표/CTO',
    scenario: '담당·기한·완료기준 없이 과제가 진행되어 P0 과제가 90일 안에 끝나지 않습니다.',
    earlyWarning: '주간 회의 이월 과제, 완료 기준 논쟁, 일정 재설정 반복',
    mitigation: 'P0·P1 과제별 Owner·Due Date·완료기준 지정, 주간 점검',
    challenge: '지금 P0 과제의 완료 기준을 한 문장으로 말할 수 있는 사람은 누구입니까?',
  },
  {
    id: 'R8', category: '전략', name: '기술방향 불일치 리스크', qs: ['q8', 'q11'], impact: 2, area: 'strategy', owner: '대표/R&D',
    scenario: '개발 방향이 시장·산업·정책 흐름과 어긋나 R&D 투자가 매몰되거나 지원사업 연계 기회를 놓칩니다.',
    earlyWarning: '고객 요구와 개발 백로그 불일치, 지원사업 공고와 과제 연결 실패',
    mitigation: '공식 로드맵 Top3 Crosswalk와 1~3년 핵심기술 목록 확정',
    challenge: '향후 3년 안에 확보해야 할 핵심기술 3개와 그 근거(시장·로드맵)는 무엇입니까?',
  },
  {
    id: 'R9', category: 'R&D', name: '개발 반복체계 부재 리스크', qs: ['q4', 'q3', 'd12'], impact: 2, area: 'rd', owner: 'R&D 책임자',
    scenario: '개발→시험→개선이 체계 없이 반복되어 같은 실패가 되풀이되고 개발 속도·품질이 예측되지 않습니다.',
    earlyWarning: '같은 결함 재발, 실험 조건 미기록, 자원 부족으로 과제 중단',
    mitigation: '실험·시험 기록 양식과 R&D 과제-산출물 연결표',
    challenge: '최근 실패한 실험의 원인과 조치를 기록에서 바로 찾을 수 있습니까?',
  },
  {
    id: 'R10', category: '경쟁', name: '모방·차별성 약화 리스크', qs: ['q12'], impact: 2, area: 'tech', owner: '대표/CTO',
    scenario: '경쟁사가 쉽게 따라 할 수 있어 가격 경쟁으로 밀리고 기술 프리미엄을 유지하지 못합니다.',
    earlyWarning: '유사 제품 출시, 단가 인하 요구, 영업 시 차별점 설명 실패',
    mitigation: '차별 요소(데이터·공정·노하우) 정의와 보호 방식(특허·영업비밀) 결정',
    challenge: '경쟁사가 같은 제품을 만들려면 무엇이 가장 어렵고, 얼마나 걸립니까?',
    input: (i) => i.discovery.hardPart,
  },
  {
    id: 'R11', category: '데이터', name: '데이터 품질·이력 리스크', qs: ['d2', 'd1'], impact: 2, area: 'tech', owner: '데이터/AI 담당',
    scenario: '데이터 출처·품질·변경 이력이 관리되지 않아 모델 성능 저하 원인을 찾지 못하고 고객 데이터 요구에 대응하지 못합니다.',
    earlyWarning: '재학습 후 성능 변동, 데이터 출처 문의 대응 지연',
    mitigation: '데이터 출처·버전 관리와 품질 점검 기준',
    challenge: '현재 모델이 어떤 데이터 버전으로 학습됐는지 확인할 수 있습니까?',
    input: (i) => i.discovery.data,
  },
];

const known = (v: Answer): v is number => !isUnknown(v);
const LIKELIHOOD = (v: number): Level => (v <= 2 ? 3 : v === 3 ? 2 : 1);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 가능성×영향 → 등급. 6 이상 높음, 3~4 중간, 2 이하 낮음 */
export const gradeOf = (severity: number | null): RiskEntry['grade'] =>
  severity === null ? '확인 필요' : severity >= 6 ? '높음' : severity >= 3 ? '중간' : '낮음';

export function redTeam(input: AssessmentInput, r: AssessmentResult): RedTeam {
  const qs = activeQuestions(input.mode, input.company.bizType);
  const active = new Set(qs.map((q) => q.id));
  const qText = Object.fromEntries(qs.map((q) => [q.id, q.t]));
  const risks: RiskEntry[] = [];

  for (const d of DEFS) {
    if (d.when && !d.when(input)) continue;
    const ids = d.qs.filter((id) => active.has(id));
    if (!ids.length) continue;
    const answered = ids.filter((id) => known(input.answers[id]));
    let likelihood: Level | null = null;
    const notes: string[] = [];
    if (answered.length) {
      const low = answered.reduce((a, b) => ((input.answers[a] as number) <= (input.answers[b] as number) ? a : b));
      const v = input.answers[low] as number;
      likelihood = LIKELIHOOD(v);
      // 근거 확인 단계에서 묻지 않은 문항은 '말로만 설명'이 아니라 '근거 미확인'
      const asked = input.evidence[low] !== undefined;
      const ev = evidenceLevel(input.evidence, low);
      notes.push(`${qRef(low)} ${v}/5 · ${asked ? `근거 '${ev.name}'` : '근거 미확인'}`);
      // 높게 응답했지만 근거가 말뿐이라고 확인되면 리스크를 한 단계 높여 본다(과소평가 방지)
      if (v >= 4 && asked && ev.k === 0 && likelihood < 3) {
        likelihood = (likelihood + 1) as Level;
        notes.push('근거가 약해 한 단계 높여 봄');
      }
    }
    const unknownIds = ids.filter((id) => !known(input.answers[id]));
    if (unknownIds.length) notes.push(`${qRefs(unknownIds)} 모름·미응답`);
    const extra = d.input?.(input)?.trim();
    if (extra) notes.push(`입력: "${clip(extra, 40)}"`);
    const severity = likelihood === null ? null : likelihood * d.impact;
    risks.push({
      id: d.id, category: d.category, name: d.name, likelihood, impact: d.impact, severity, grade: gradeOf(severity),
      basis: notes.join(' · ') || qText[ids[0]] || '', scenario: d.scenario, earlyWarning: d.earlyWarning,
      mitigation: d.mitigation, owner: d.owner, area: AREA_NAME[d.area], challenge: d.challenge,
    });
  }

  // 등급 높은 순(확인 필요는 영향이 큰 것부터 중간 뒤에), 같은 등급은 영향 큰 순
  const rank = (x: RiskEntry) => (x.severity ?? (x.impact === 3 ? 4.5 : 2.5));
  risks.sort((a, b) => rank(b) - rank(a) || b.impact - a.impact);

  const counts = {
    high: risks.filter((x) => x.grade === '높음').length,
    mid: risks.filter((x) => x.grade === '중간').length,
    low: risks.filter((x) => x.grade === '낮음').length,
    unknown: risks.filter((x) => x.grade === '확인 필요').length,
  };
  return { risks, counts, diagnostic: diagnosticChecks(input, r, qs.map((q) => q.id)) };
}

/** 이 진단 결과가 틀릴 수 있는 지점(진단 자체에 대한 레드팀) */
export function diagnosticChecks(input: AssessmentInput, r: AssessmentResult, ids: string[]): DiagnosticCheck[] {
  const o: DiagnosticCheck[] = [];
  const high = ids.filter((id) => known(input.answers[id]) && (input.answers[id] as number) >= 4);
  const weak = high.filter((id) => input.evidence[id] !== undefined && evidenceLevel(input.evidence, id).k <= 1);
  const unchecked = high.filter((id) => input.evidence[id] === undefined);
  if (weak.length)
    o.push({
      title: '근거 없는 높은 응답',
      level: '주의',
      detail: `${qRefs(weak)} ${weak.length > 1 ? `${weak.length}개 ` : ''}문항이 4~5점이지만 근거가 '말로만 설명' 또는 '내부 자료'입니다. 해당 영역 점수는 과대평가됐을 수 있습니다.`,
    });
  if (unchecked.length)
    o.push({
      title: '근거 미확인 높은 응답',
      level: '참고',
      detail: `${qRefs(unchecked)} ${unchecked.length > 1 ? `${unchecked.length}개 ` : ''}문항은 4~5점이지만 근거 확인 단계에서 다루지 않았습니다. 재진단 전 자료로 확인하면 신뢰도가 높아집니다.`,
    });
  if (r.unknown > 0)
    o.push({
      title: '모름·미응답',
      level: r.unknown >= 4 ? '주의' : '확인',
      detail: `${r.unknown}개 문항이 확인되지 않았습니다. 0점으로 계산하지 않았으므로 확인 결과에 따라 점수가 오르거나 내릴 수 있습니다.`,
    });
  const crit = input.inventory.filter((t) => t.critical);
  const noTrl = crit.filter((t) => !t.trl).length, unconfirmed = crit.filter((t) => !t.confirmed).length;
  if (!crit.length) o.push({ title: '핵심기술 미지정', level: '주의', detail: '핵심기술이 지정되지 않아 TRL·로드맵 연결 판단의 기준이 없습니다.' });
  else if (noTrl || unconfirmed)
    o.push({
      title: '핵심기술 TRL 미확인',
      level: noTrl === crit.length ? '주의' : '확인',
      detail: `핵심기술 ${crit.length}개 중 TRL 미입력 ${noTrl}개, 담당자 미확인 ${unconfirmed}개입니다. 기술성숙 해석은 TRL 확인 전까지 잠정입니다.`,
    });
  for (const a of r.alerts) o.push({ title: '응답 일관성', level: '확인', detail: a });
  if (r.range && r.capability !== null)
    o.push({
      title: '점수 오차 범위',
      level: '참고',
      detail: `기술역량 ${Math.round(r.capability)}점은 진단 신뢰도(${Math.round(r.confidence)}/100)를 반영하면 ${r.range[0]}~${r.range[1]}점 범위로 보는 것이 안전합니다.`,
    });
  o.push({
    title: '단일 응답자 관점',
    level: '참고',
    detail: '응답자 1인(또는 한 팀) 기준입니다. CTO·개발·생산 담당자 교차 응답과 문서 확인 전에는 인식 차이가 반영되지 않습니다.',
  });
  return o;
}
