// 문장 품질 검사기 자체 검증: 잡아야 할 것은 잡고, 정상 문장은 통과
import { describe, expect, it } from 'vitest';
import { duplicateSentences, sentences, textIssues } from '../../src/reports/text-quality';

const kinds = (t: string) => textIssues(t).map((x) => x.kind);

describe('문장 품질 검사', () => {
  it('조사 병기·조사 불일치·문항 코드·영어 용어를 잡음', () => {
    expect(kinds("'플랫폼'이(가) 맞닿아 있습니다.")).toContain('particle-placeholder');
    expect(kinds("'정규화'(TRL 6)과 '센서'만 겹칩니다.")).toContain('particle-mismatch');
    expect(kinds('응답 근거 Q11 로드맵 연관성 2/5')).toContain('question-code');
    expect(kinds('D7 증산 병목')).toContain('question-code');
    expect(kinds('Owner와 Due Date를 지정')).toEqual(['jargon', 'jargon']);
  });
  it('정상 문장·병행표기·위험 코드(R2)·과제 번호(R&D-1)는 통과', () => {
    for (const t of ['가장 먼저 풀 과제는 리스크대응입니다.', 'R2 외부 의존 중단', 'R&D-1 과제', '시범 적용(PoC(개념검증))', '1분기 · 기준 확정', 'BTN-20261010-샘플']) expect(kinds(t)).toEqual([]);
  });
  it('긴 문장·같은 칸 반복', () => {
    expect(kinds(`${'가'.repeat(200)}.`)).toContain('long-sentence');
    const rep = Array(3).fill('원문 해당 쪽의 개발목표와 자사 기술을 대조해 대조표를 작성합니다.').join('\n');
    expect(duplicateSentences(rep)).toHaveLength(1);
    expect(duplicateSentences(rep.split('\n').slice(0, 2).join('\n'))).toHaveLength(0);
  });
  it('문장 나누기: 줄바꿈은 다른 칸', () => {
    expect(sentences('첫 문장입니다. 둘째 문장입니다.\n표 칸')).toEqual(['첫 문장입니다.', '둘째 문장입니다.', '표 칸']);
  });
});
