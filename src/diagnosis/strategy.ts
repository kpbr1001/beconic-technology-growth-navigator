// 전략 대안 3안(A 안정화·B 제품화·C 차별화)과 리스크 신호. 규칙 기반이며 Claude가 추천안을 바꾸지 않는다.
import { isUnknown } from './questions';
import type { Answer, AssessmentResult } from './types';

export interface StrategicOption {
  name: string;
  score: number | null;
  when: string;
  focus: string;
  trade: string;
  recommended: boolean;
}

export function strategicOptions(r: Pick<AssessmentResult, 'm' | 'confidence'>): StrategicOption[] {
  const { m, confidence } = r;
  const all = (...xs: (number | null)[]) => xs.every((x) => x !== null);
  const n = (x: number | null) => x as number;
  const stabilize = all(m.evidence, m.exec, m.risk)
    ? Math.round((100 - confidence) * 0.45 + (100 - n(m.evidence)) * 0.25 + (100 - n(m.exec)) * 0.15 + (100 - n(m.risk)) * 0.15)
    : null;
  const accelerate = all(m.tech, m.exec, m.scale, m.risk)
    ? Math.round(n(m.tech) * 0.32 + n(m.exec) * 0.22 + n(m.scale) * 0.2 + confidence * 0.16 + n(m.risk) * 0.1)
    : null;
  const differentiate = all(m.tech, m.rd, m.strategy, m.risk)
    ? Math.round(n(m.tech) * 0.25 + n(m.rd) * 0.25 + n(m.strategy) * 0.25 + confidence * 0.15 + n(m.risk) * 0.1)
    : null;
  const opts = [
    { name: 'A. 검증·체계 안정화', score: stabilize, when: '신뢰도·기술기록·실행체계가 약할 때', focus: '근거 확보, 핵심기술 정의, 검증기준, 책임체계', trade: '단기 매출·신규기능보다 기반 정비에 우선순위' },
    { name: 'B. 제품화·Scale-up 가속', score: accelerate, when: '기술기능이 구현되고 외부 검증을 확대할 때', focus: 'PoC 반복, 품질기준, 확장성, 운영표준', trade: '실증·운영비와 고객현장 대응 리소스 필요' },
    { name: 'C. 차별기술·포트폴리오 강화', score: differentiate, when: '기술성숙·R&D·전략정렬 기반이 형성됐을 때', focus: '독자기술, IP, 차세대기술, 데이터 자산화', trade: '중장기 투자와 전문인력·외부협력 필요' },
  ];
  const weakOrUnknown = (x: number | null) => x === null || x < 45;
  let rec = 1;
  // 판단 보류 영역이 추천에 영향을 주면 먼저 '검증·안정화'(A)를 권한다.
  if (confidence < 62 || weakOrUnknown(m.evidence) || weakOrUnknown(m.exec) || m.tech === null) rec = 0;
  else if (m.tech >= 60 && m.scale !== null && m.scale < 65) rec = 1;
  else if (m.tech >= 65 && m.rd !== null && m.rd >= 60 && m.strategy !== null && m.strategy >= 55) rec = 2;
  return opts.map((o, i) => ({ ...o, recommended: i === rec }));
}

export type RiskItem = [name: string, level: string, desc: string];

/** 모름·미응답도 리스크로 표시한다(과소평가 방지). v0.9 동일. */
export function riskItems(a: Record<string, Answer>): RiskItem[] {
  const low = (v: Answer) => isUnknown(v) || v <= 2;
  const r: RiskItem[] = [];
  if (low(a.q2)) r.push(['실증 리스크', '높음', '실제환경 검증 부족은 기술수준을 과대평가하게 만들 수 있습니다.']);
  if (low(a.q9)) r.push(['외부의존 리스크', '높음', '외주·API·장비·핵심인력 중단 시 사업연속성 영향이 큽니다.']);
  if (low(a.q10)) r.push(['규제·인증 리스크', '중간~높음', '인증·보안·안전 요구사항 미확인은 시장진입 지연 요인이 될 수 있습니다.']);
  if (low(a.q6)) r.push(['증빙 리스크', '중간', '기술이 있어도 대외평가·R&D·투자에서 입증력이 낮을 수 있습니다.']);
  if (low(a.q7)) r.push(['확장 리스크', '중간', '현재 규모에서의 성공이 확장 시 유지된다는 근거가 부족합니다.']);
  return r.slice(0, 4);
}
