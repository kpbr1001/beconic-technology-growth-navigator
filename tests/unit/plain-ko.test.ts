// 쉬운 용어 변환: 영어 컨설팅 용어 → 우리말, 꼭 필요한 영어는 한국어 병행표기, 여러 번 적용해도 같음
import { describe, expect, it } from 'vitest';
import { josa, plainKo, TERMS } from '../../src/app/plain-ko';

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
  it('바꾼 말 뒤 조사를 받침에 맞추고, 번역으로 겹친 말을 정리', () => {
    expect(plainKo('핵심기술별 현재 상태와 다음 검증 Gate를 관리합니다.')).toBe('핵심기술별 현재 상태와 다음 검증 관문을 관리합니다.');
    expect(plainKo('실행 전제와 Trade-off를 함께')).toBe('실행 전제와 감수할 점을 함께');
    expect(plainKo('KPI·운영 Governance')).toBe('성과지표·운영 체계');
    expect(plainKo('의존요소 목록(Dependency Map)과 상위 5')).toBe('의존요소 목록과 상위 5');
    expect(plainKo('점수 Calibration')).toBe('점수 보정');
    expect(plainKo('Evidence가 부족 · Gate로 이동 · KPI와 Owner')).toBe('근거자료가 부족 · 검증 관문으로 이동 · 성과지표와 담당자');
    expect(plainKo('Gate이며')).toBe('검증 관문이며');
    for (const s of ['다음 검증 Gate를', 'KPI·운영 Governance', 'Top 3와 핵심기술 Crosswalk']) expect(plainKo(plainKo(s))).toBe(plainKo(s));
  });
  it('조사 고르기', () => {
    expect(josa('정의서 작성', '이', '가')).toBe('정의서 작성이');
    expect(josa('대조표', '이', '가')).toBe('대조표가');
    expect(josa('규칙', '으로', '로')).toBe('규칙으로');
    expect(josa('파일', '으로', '로')).toBe('파일로');
  });
});
