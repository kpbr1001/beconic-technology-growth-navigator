// 보고서 한국어 다듬기: 조사 병기 제거·따옴표/괄호/숫자 뒤 조사·문항 코드 대신 이름
import { describe, expect, it } from 'vitest';
import { fixParticles, josa, qRef, qRefs } from '../../src/reports/ko';

describe('조사 바로잡기(fixParticles)', () => {
  it("'이(가)'·'은(는)'·'과(와)'·'(으)로' 병기를 앞말에 맞는 하나로", () => {
    expect(fixParticles("'예지보전 플랫폼'이(가) 맞닿아")).toBe("'예지보전 플랫폼'이 맞닿아");
    expect(fixParticles("'이상징후 탐지 모델'은(는) 1위")).toBe("'이상징후 탐지 모델'은 1위");
    expect(fixParticles("'데이터 정규화'과(와) 자사")).toBe("'데이터 정규화'와 자사");
    expect(fixParticles('기술 기록(50점)이(가) 기준')).toBe('기술 기록(50점)이 기준');
    expect(fixParticles('차별성(확인 필요)이(가) 기준')).toBe('차별성(확인 필요)이 기준');
    expect(fixParticles('서울(으)로 이동')).toBe('서울로 이동');
    expect(fixParticles('현장(으)로 이동')).toBe('현장으로 이동');
  });
  it('괄호 설명 뒤 조사는 괄호 앞말 기준, 숫자 뒤 조사는 읽는 소리 기준', () => {
    expect(fixParticles("'설비센서 데이터 정규화'(TRL 6)과 '센서'만")).toBe("'설비센서 데이터 정규화'(TRL 6)와 '센서'만");
    expect(fixParticles("'예지보전 플랫폼'(TRL 7)와 '예지'")).toBe("'예지보전 플랫폼'(TRL 7)과 '예지'");
    expect(fixParticles('병목 상위 3와 한계치')).toBe('병목 상위 3과 한계치');
    expect(fixParticles('TRL 2과 비교')).toBe('TRL 2와 비교');
  });
  it("'이다'·'가지'처럼 조사가 아닌 말과 이미 맞는 문장은 그대로(멱등)", () => {
    for (const s of ['3/5이지만 근거', '2가지 방법', "'모름'으로 답했습니다", '기술역량은 52점입니다.', '(가) 항목', "'AI'가 판단"]) expect(fixParticles(s)).toBe(s);
    const once = fixParticles("'정규화'(TRL 6)과 '센서'이(가) 3와");
    expect(fixParticles(once)).toBe(once);
  });
  it('josa: 숫자·영문 글자 이름 받침까지', () => {
    expect(josa('TRL', '을', '를')).toBe('TRL을');
    expect(josa('API', '을', '를')).toBe('API를');
    expect(josa('상위 3', '과', '와')).toBe('상위 3과');
    expect(josa('서울', '으로', '로')).toBe('서울로');
  });
});

describe('문항 이름(qRef)', () => {
  it('Q9·D1 같은 코드 대신 짧은 문항 이름', () => {
    expect(qRef('q9')).toBe("'외부 의존·대체방안'");
    expect(qRef('d1')).toBe("'코드·배포 이력'");
    expect(qRef('d99')).toBe('심화 99번 문항');
    expect(qRefs(['q1', 'q6'])).toBe("'핵심 기능 구현', '개발 기록'");
  });
});
