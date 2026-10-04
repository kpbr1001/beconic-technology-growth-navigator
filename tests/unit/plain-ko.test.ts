// 쉬운 용어 변환: 영어 컨설팅 용어 → 우리말, 꼭 필요한 영어는 한국어 병행표기, 여러 번 적용해도 같음
import { describe, expect, it } from 'vitest';
import { plainKo, TERMS } from '../../src/app/plain-ko';

describe('쉬운 용어 변환', () => {
  it('컨설팅 용어를 우리말로', () => {
    expect(plainKo('핵심기술 Evidence 확보율')).toBe('핵심기술 근거자료 확보율');
    expect(plainKo('P0 과제 Owner·Due Date·KPI 지정')).toBe('P0 과제 담당자·기한·성과지표 지정');
    expect(plainKo('공식 로드맵 Top3 Crosswalk 작성')).toBe('공식 로드맵 상위 3 대조표 작성');
    expect(plainKo('Trade-off 단기 매출 / 핵심 Focus PoC 반복, Scale-up 가속')).toBe('감수할 점 단기 매출 / 중점 과제 PoC(개념검증) 반복, 규모 확대 가속');
    expect(plainKo('TRL Gate 통과율 · 다음 Gate')).toBe('TRL 검증 관문 통과율 · 다음 검증 관문');
    expect(plainKo('Executive Summary')).toBe('경영진 요약');
  });
  it('식별자·약어 일부는 건드리지 않음', () => {
    expect(plainKo('API·LLM API·IPO')).toBe('API·LLM API·IPO');
    expect(plainKo('nextEvidence TRL R&D CTO')).toBe('nextEvidence TRL R&D CTO');
    expect(plainKo('BECONIC TECHNOLOGY GROWTH REPORT · Confidential')).toBe('BECONIC TECHNOLOGY GROWTH REPORT · Confidential');
  });
  it('멱등: 두 번 적용해도 같고, 변환 결과에 다시 걸리는 영어가 없음', () => {
    const s = 'PoC Evidence Gold Set CVI/CVR Gap Governance Pilot Calibration';
    expect(plainKo(plainKo(s))).toBe(plainKo(s));
    for (const [, to] of TERMS) expect(plainKo(to)).toBe(to);
  });
});
