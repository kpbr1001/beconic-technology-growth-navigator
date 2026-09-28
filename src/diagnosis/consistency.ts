// 응답 일관성 검사. 점수를 바꾸지 않고 해석 경고만 만든다.
import { AREA_NAME, isUnknown } from './questions';
import type { Answer, Dimension, Question } from './types';

const known = (v: Answer): v is number => !isUnknown(v);

export function consistencyAlerts(
  questions: Question[],
  answers: Record<string, Answer>,
  hasExternalDependency: boolean,
  pendingDimensions: Dimension[] = [],
): string[] {
  const a = answers;
  const o: string[] = [];
  if (known(a.q1) && a.q1 >= 4 && known(a.q2) && a.q2 <= 2)
    o.push('구현 수준은 높지만 실제환경 검증은 낮습니다. 상용화 판단은 보수적으로 해석해야 합니다.');
  if (known(a.q12) && a.q12 >= 4 && known(a.q6) && a.q6 <= 2)
    o.push('모방하기 어려운 기술이 있다고 응답했지만 기술기록 수준이 낮습니다.');
  if (hasExternalDependency && known(a.q9) && a.q9 <= 2)
    o.push('외부기술 의존이 있지만 대체방안 관리수준이 낮습니다.');
  const u = questions.filter((q) => isUnknown(answers[q.id]));
  if (u.length >= 4) o.push(`모름·확인필요가 ${u.length}개입니다. 대표 단독진단보다 기술담당자 확인을 권고합니다.`);
  if (pendingDimensions.length)
    o.push(
      `${pendingDimensions.map((d) => AREA_NAME[d]).join('·')} 영역은 응답이 없어 점수를 산정하지 않았습니다(판단 보류). 담당자 확인 후 재진단하세요.`,
    );
  return o;
}
