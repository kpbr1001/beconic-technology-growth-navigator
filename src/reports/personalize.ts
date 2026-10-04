// 결과·보고서 문구 개인화(규칙 기반). 고정 문구 대신 이 기업의 응답·핵심기술·R&D 과제·로드맵 후보·리스크로 채운다.
// 원칙: 입력에 없는 사실을 만들지 않는다(이름·숫자는 모두 입력·진단 결과에서 가져옴). 문항·가중치·점수 공식은 건드리지 않는다.
import { ANCHORS } from '../diagnosis/questions';
import { TRL_LEVELS } from '../diagnosis/trl';
import type { Answer, Dimension, Gap, Question } from '../diagnosis/types';

/** 문항 짧은 이름(보고서 근거 표시용 — 문항 원문은 바꾸지 않음) */
export const Q_SHORT: Record<string, string> = {
  q1: '핵심 기능 구현', q2: '실제환경 검증', q3: 'R&D 자원 확보', q4: '개발·시험·개선 반복', q5: '과제 담당·일정·완료기준',
  q6: '개발 기록', q7: '확장 시 품질 유지', q8: '1~3년 핵심기술 정의', q9: '외부 의존·대체방안', q10: '인증·보안 요건 확인',
  q11: '로드맵 연관성 설명', q12: '모방 어려운 차별 요소',
  d1: '코드·배포 이력', d2: '데이터 품질·이력', d3: '장애 탐지·추적', d4: '외부 AI/API 대체',
  d5: '공정조건·작업표준', d6: 'BOM·도면·검사기록', d7: '증산 병목 확인', d8: '대체 공급원',
  d9: '서비스 표준 프로세스', d10: '고객 증가 시 운영', d11: '서비스 품질 추적',
  d12: '가설·실험 조건 정의', d13: '실험실↔현장 성능 차이', d14: '외부 확인 근거(IP·시험)', d15: '규모 확대 조건 정의',
};
const qNo = (id: string) => id.toUpperCase();
const clip = (s: string, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export interface Driver {
  id: string;
  label: string;
  value: number | null;
  kind: 'low' | 'unknown' | 'weak_evidence';
  text: string;
}

/** 영역 점수를 끌어내린 문항: 낮은 응답(≤2)·'모름' → 높은 응답인데 근거가 약한 문항 순 */
export function areaDrivers(
  dim: Dimension,
  qs: Question[],
  answers: Record<string, Answer>,
  evidenceName: (id: string) => string,
  evidenceRank: (id: string) => number,
  max = 2,
): Driver[] {
  const out: Driver[] = [];
  for (const q of qs.filter((x) => x.cat === dim)) {
    const v = answers[q.id];
    const label = Q_SHORT[q.id] ?? clip(q.t, 18);
    if (v === null || v === undefined) out.push({ id: q.id, label, value: null, kind: 'unknown', text: `${qNo(q.id)} ${label}: '모름'` });
    else if (v <= 2) out.push({ id: q.id, label, value: v, kind: 'low', text: `${qNo(q.id)} ${label}: ${v}/5 '${ANCHORS[dim][v - 1]}' · 근거 '${evidenceName(q.id)}'` });
    else if (v >= 4 && evidenceRank(q.id) <= 1) out.push({ id: q.id, label, value: v, kind: 'weak_evidence', text: `${qNo(q.id)} ${label}: ${v}/5이지만 근거 '${evidenceName(q.id)}'` });
  }
  const order = { low: 0, unknown: 1, weak_evidence: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || (a.value ?? 9) - (b.value ?? 9)).slice(0, max);
}

export interface PlanTech {
  name: string;
  trl: number;
  gate: string;
  target: string;
  confirmed?: boolean;
}
export interface PlanCtx {
  /** 주력 제품·서비스를 가리키는 짧은 이름(세부 업종 첫 구절 → 없으면 제품 설명 앞부분) */
  product: string;
  data: string;
  external: string;
  /** 우선순위(P0→P1→P2) 순 */
  gaps: Gap[];
  /** 핵심기술 우선순위 순 */
  techs: PlanTech[];
  rnd: { id: string; title: string; trackLabel: string; techName: string; roadmapName?: string }[];
  roadmapTop: { name: string; code?: string | null; page: number | null } | null;
  mappedCount: number;
  recommended: 'A' | 'B' | 'C';
  highRisks: { id: string; name: string }[];
}

/** 영역별 표준 과제(제목·설명·담당·기간·성과지표)에 이 기업의 기술·과제·의존요소를 넣는다 */
export function personalAction(area: string, base: string[], c: PlanCtx): string[] {
  const [title, desc, owner, period, kpi] = base;
  const t = c.techs[0];
  const n = c.techs.length;
  const names = c.techs.slice(0, 3).map((x) => `'${clip(x.name, 18)}'`).join('·');
  const nP = (p: string) => c.gaps.filter((g) => g.priority === p).length;
  switch (area) {
    case '기술성숙':
      return t ? [title, `'${clip(t.name, 22)}'(${t.trl ? `TRL ${t.trl}` : 'TRL 확인 필요'})의 현장 PoC 성공·실패 기준을 먼저 확정합니다.`, owner, period, t.trl ? `${t.target} 관문(${t.gate}) 기준 문서화` : kpi] : base;
    case 'R&D 역량':
      return c.rnd[0] ? [title, `${c.rnd[0].id} '${clip(c.rnd[0].title, 26)}' 과제를 실험·산출물·성과지표와 한 흐름으로 묶습니다.`, owner, period, kpi] : base;
    case '실행준비':
      return [title, desc, owner, period, `P0 ${nP('P0')}건·P1 ${nP('P1')}건 담당·기한·완료기준 100% 지정`];
    case '기술기록':
      return n ? [title, `핵심기술 ${n}개(${names}${n > 3 ? ' 등' : ''})의 원리·차별점·현재 TRL·근거를 한 장씩 정리합니다.`, owner, period, `핵심기술 정의서 ${n}건 확보`] : base;
    case '확장준비':
      return c.product ? [title, `'${clip(c.product, 26)}'의 사용량·생산량이 2~3배가 될 때 가장 먼저 깨지는 지점을 검증합니다.`, owner, period, kpi] : base;
    case '전략정렬':
      return c.roadmapTop
        ? [title, `로드맵 품목 '${clip(c.roadmapTop.name, 22)}'(${c.roadmapTop.code ?? '원문'}${c.roadmapTop.page ? ` p.${c.roadmapTop.page}` : ''}) 개발목표와 내부 개발과제를 대조합니다.`, owner, period, n ? `핵심기술 ${Math.min(3, n)}개 매핑(현재 후보 연결 ${c.mappedCount}개)` : kpi]
        : base;
    case '리스크대응':
      return [title, c.external ? `'${clip(c.external, 30)}' 중단·가격 변경 시 대체경로를 준비합니다.` : desc, owner, period, c.highRisks.length ? `'높음' 리스크 ${c.highRisks.length}건(${c.highRisks.slice(0, 3).map((x) => x.id).join('·')}) 대응책 수립` : kpi];
    default:
      return base;
  }
}

const trlStep = (t: PlanTech, add: number) => {
  if (!t.trl) return `'${clip(t.name, 20)}' 현재 TRL 확인·근거자료 확보`;
  const to = Math.min(9, t.trl + add);
  return to === t.trl ? `'${clip(t.name, 20)}' TRL 9 실사용 성과 유지` : `'${clip(t.name, 20)}' TRL ${t.trl}→${to}(${TRL_LEVELS[to]})`;
};
const cap = (xs: (string | false | null | undefined)[], n = 4) => [...new Set(xs.filter((x): x is string => !!x))].slice(0, n);

/** 분기(Q1~Q4)·1년·3년·5년 로드맵 — 우선순위 과제·핵심기술 TRL·R&D 과제·추천 전략·리스크로 구성 */
export function horizonPlan(c: PlanCtx, actionTitle: (area: string) => string) {
  const g = c.gaps;
  const act = (i: number) => (g[i] ? `[${g[i].priority}] ${actionTitle(g[i].area)}` : null);
  const [t1, t2] = c.techs;
  const r1 = c.rnd[0], r2 = c.rnd[1], r3 = c.rnd[2];
  const recLine = { A: '근거자료 확보율 향상·진단 신뢰도 60 이상', B: '외부 고객/현장 검증 반복·운영 표준 수립', C: '차별 기술 지식재산(특허) 출원 검토' }[c.recommended];
  const quarters: [string, string[]][] = [
    ['Q1 · 기준 확정', cap([act(0) && `${act(0)} 완료`, g[1]?.priority === 'P0' && `${act(1)} 착수`, c.techs.length ? `핵심기술 ${c.techs.length}개 TRL·근거자료 기준선 확정` : '핵심기술 지정·TRL 확인'], 3)],
    ['Q2 · 검증', cap([g[1]?.priority !== 'P0' ? act(1) : act(2), t1 && t1.trl ? `'${clip(t1.name, 18)}' ${t1.target} 관문 시험(${t1.gate})` : t1 && `'${clip(t1.name, 18)}' TRL 근거 확인`, r1 && `${r1.id} 과제 기획서 초안·공고 일정 확인`], 3)],
    ['Q3 · 확장 준비', cap([g[1]?.priority !== 'P0' ? act(2) : act(3), recLine, c.highRisks[0] && `${c.highRisks[0].id} ${c.highRisks[0].name} 대응책 시험`], 3)],
    ['Q4 · 재평가', cap(['연간 재진단(같은 기준)·변화 분석', '차년도 P0/P1 재설정', r1 ? 'R&D 과제 신청 결과 반영·기술포트폴리오 갱신' : '기술포트폴리오·예산 갱신'], 3)],
  ];
  const y1 = cap([t1 && trlStep(t1, 1), t2 && trlStep(t2, 1), r1 && `${r1.id} '${clip(r1.title, 24)}' 신청·착수`, recLine, '분기별 성과지표·근거자료 리뷰 정착']);
  const ext = c.highRisks.find((x) => x.id === 'R2');
  const y3 = cap([
    t1 && trlStep(t1, 2),
    c.roadmapTop && `로드맵 '${clip(c.roadmapTop.name, 20)}' 개발목표 대비 성능 대조·격차 해소`,
    r2 && `${r2.id} '${clip(r2.title, 24)}' 수행`,
    ext ? `핵심 외부 의존 대체경로 확보(${ext.id})` : '규모 확대·품질체계 정착',
    '외부 공동R&D·전문기관 검증 확대',
  ]);
  const y5 = cap([
    t1 && (t1.trl && t1.trl + 2 >= 7 ? `'${clip(t1.name, 20)}' 양산·인증·사업화(TRL 9)` : t1 && `'${clip(t1.name, 20)}' 실제환경 실증(TRL 7)`),
    c.data ? `축적 데이터('${clip(c.data, 16)}') 자산화·플랫폼화` : '핵심기술 플랫폼화·데이터 자산화',
    r3 && `${r3.id} ${r3.trackLabel}${r3.roadmapName ? `('${clip(r3.roadmapName, 16)}')` : ''} 성과 사업화`,
    c.external ? '외부 의존 축소·독자기술 비중 확대' : '차세대 핵심기술 확보',
    '재진단 데이터로 기술투자 우선순위 최적화',
  ]);
  return { quarters, y1, y3, y5 };
}

/** AI 해석이 없을 때 확인 질문: '모름'·근거 약한 높은 응답·TRL 대조 경고·확인 전 핵심기술에서 만든다 */
export function confirmQuestions(
  qs: Question[],
  answers: Record<string, Answer>,
  evidenceName: (id: string) => string,
  evidenceRank: (id: string) => number,
  alerts: string[],
  techs: PlanTech[],
  max = 4,
): string[] {
  const out: string[] = [];
  const crit = [...qs].sort((a, b) => Number(!!b.critical) - Number(!!a.critical));
  for (const q of crit) {
    const v = answers[q.id];
    if (v === null || v === undefined) out.push(`${qNo(q.id)} '${Q_SHORT[q.id] ?? clip(q.t, 16)}' 문항을 ${v === null ? "'모름'으로 답했습니다" : '응답하지 않았습니다'}. 누가 확인할 수 있고, 어떤 자료가 있습니까?`);
  }
  for (const a of alerts.filter((x) => x.startsWith('TRL 대조'))) out.push(a.replace(/^TRL 대조:\s*/, ''));
  for (const q of crit) {
    const v = answers[q.id];
    if (typeof v === 'number' && v >= 4 && evidenceRank(q.id) <= 1) out.push(`${qNo(q.id)} '${Q_SHORT[q.id] ?? clip(q.t, 16)}' 문항을 ${v}/5로 답했지만 근거가 '${evidenceName(q.id)}'입니다. 다시 확인할 수 있는 기록은 무엇입니까?`);
  }
  for (const t of techs.filter((x) => x.trl && !x.confirmed).slice(0, 2)) out.push(`핵심기술 '${clip(t.name, 20)}'의 TRL ${t.trl}은 어떤 시험·실증 결과로 확인했습니까?`);
  return [...new Set(out)].slice(0, max);
}

/** 전략 결정 전에 더 필요한 데이터 — 높음 리스크·추천안·R&D 과제에 따라 */
export function decisionData(c: Pick<PlanCtx, 'recommended' | 'highRisks' | 'rnd'>): string[] {
  const ids = new Set(c.highRisks.map((x) => x.id));
  return cap([
    '과제별 예상비용·필요인력',
    ids.has('R4') && '목표 시장 인증·보안 요건과 취득 기간',
    ids.has('R2') && '외부 의존 대체 공급자·전환 비용',
    ids.has('R3') && '핵심 인력 백업·인수인계 계획',
    c.recommended === 'B' && '추가 실증 고객·현장 확보 가능성',
    c.recommended === 'C' && '지식재산·경쟁기술 선행조사',
    c.recommended === 'A' && '근거자료 확보에 필요한 기간·담당',
    c.rnd.length > 0 && 'R&D 지원사업 공고 일정·매칭 비율',
    '고객/현장 확보 가능성',
  ], 4);
}
