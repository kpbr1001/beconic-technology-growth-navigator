// 응답 일관성 검사. 점수를 바꾸지 않고 해석 경고만 만든다.
import { AREA_NAME, isUnknown } from './questions';
import type { Answer, Dimension, Question } from './types';

const known = (v: Answer): v is number => !isUnknown(v);

/** TRL 대조 경고 머리말(v0.9 원본에 없는 경고 — 회귀 비교에서 구분용) */
export const TRL_ALERT = 'TRL 대조: ';

export function consistencyAlerts(
  questions: Question[],
  answers: Record<string, Answer>,
  hasExternalDependency: boolean,
  pendingDimensions: Dimension[] = [],
  /** 핵심기술의 입력 TRL(0=확인 필요는 제외하고 넘긴다) */
  criticalTrls: number[] = [],
): string[] {
  const a = answers;
  const o: string[] = [];
  if (known(a.q1) && a.q1 >= 4 && known(a.q2) && a.q2 <= 2)
    o.push('구현 수준은 높지만 실제환경 검증은 낮습니다. 상용화 판단은 보수적으로 해석해야 합니다.');
  if (known(a.q12) && a.q12 >= 4 && known(a.q6) && a.q6 <= 2)
    o.push('모방하기 어려운 기술이 있다고 응답했지만 기술기록 수준이 낮습니다.');
  if (hasExternalDependency && known(a.q9) && a.q9 <= 2)
    o.push('외부기술 의존이 있지만 대체방안 관리수준이 낮습니다.');
  // TRL 대조(v0.9.3 추가): 핵심기술 TRL과 구현·실증 응답이 서로 맞지 않으면 확인 요청(점수 불변)
  if (criticalTrls.some((t) => t >= 7) && ((known(a.q1) && a.q1 <= 2) || (known(a.q2) && a.q2 <= 2)))
    o.push(`${TRL_ALERT}핵심기술을 TRL 7 이상(실제환경 실증)으로 입력했지만 핵심 기능 구현·실제환경 검증 응답(1·2번 문항)이 낮습니다. TRL과 응답 중 어느 쪽이 맞는지 담당자와 확인하세요.`);
  if (criticalTrls.length && criticalTrls.every((t) => t <= 4) && known(a.q2) && a.q2 >= 4)
    o.push(`${TRL_ALERT}실제환경 검증(2번 문항)은 높게 응답했지만 핵심기술 TRL은 모두 4 이하(실험·PoC)로 입력했습니다. 실증한 기술이 핵심기술 목록에 있는지 확인하세요.`);
  const u = questions.filter((q) => isUnknown(answers[q.id]));
  if (u.length >= 4) o.push(`모름·확인필요가 ${u.length}개입니다. 대표 단독진단보다 기술담당자 확인을 권고합니다.`);
  if (pendingDimensions.length)
    o.push(
      `${pendingDimensions.map((d) => AREA_NAME[d]).join('·')} 영역은 응답이 없어 점수를 산정하지 않았습니다(판단 보류). 담당자 확인 후 재진단하세요.`,
    );
  return o;
}
