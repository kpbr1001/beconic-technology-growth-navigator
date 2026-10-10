// 지원사업 신청 준비도: 관점 판정 규칙·바우처 후보 근거·자격 체크리스트
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reportCore } from '../../src/reports/core';
import { setRoadmapIndex, type AppIndex } from '../../src/roadmap/candidates';
import { eligOf } from '../../src/diagnosis/delta';
import raw from '../../src/roadmap/kb-app-index.json';
import { NAMED } from '../fixtures/assessments';

describe('지원사업 신청 준비도', () => {
  beforeAll(() => setRoadmapIndex(raw as unknown as AppIndex));
  afterAll(() => setRoadmapIndex(null));
  const sample = NAMED.sample;
  it('샘플기업: 4개 관점마다 판정·근거·코멘트, 보완 관점에는 할 일', () => {
    const { ready } = reportCore(sample);
    expect(ready.axes.map((a) => a.label)).toEqual(['기술성', '수행 역량', '사업화·검증', '정책 연계']);
    for (const a of ready.axes) {
      expect(a.evidence.length).toBeGreaterThan(0);
      if (a.status !== '충족') expect(a.actions.length).toBeGreaterThan(0);
    }
    expect(ready.axes[0].evidence[0]).toContain("'이상징후 탐지 모델'");
    expect(ready.axes[3].evidence[0]).toContain('SMESTR-2025-B-03-08');
    expect(JSON.stringify(ready)).not.toMatch(/선정 가능|합격|적합도/);
  });
  it('바우처 후보: 진단 근거(문항·리스크·보완 기술·데이터)가 있을 때만, 최대 4개', () => {
    const { ready, redteam } = reportCore(sample);
    expect(ready.vouchers.length).toBeLessThanOrEqual(4);
    expect(ready.vouchers.map((v) => v.type)).toContain('시험·인증'); // q10 2/5
    for (const v of ready.vouchers) if (v.riskId) expect(redteam.risks.some((x) => x.id === v.riskId)).toBe(true);
  });
  it('자격 체크리스트: 미입력은 확인 필요, 체납 있음은 결격 가능성(종합 선행 조건), 연구전담조직 없음은 수행 역량 미흡', () => {
    expect(reportCore(sample).ready.eligibility.every((e) => e.status === '확인 필요')).toBe(true);
    const bad = reportCore({ ...sample, company: { ...sample.company, elig: { tax: '있음', lab: '없음', cofund: '가능' } } }).ready;
    expect(bad.eligibility.find((e) => e.key === 'tax')!.status).toBe('결격 가능성');
    expect(bad.eligibility.find((e) => e.key === 'cofund')!.status).toBe('충족');
    expect(bad.overall).toBe('선행 조건 필요');
    expect(bad.reason).toContain('국세·지방세 체납');
    expect(bad.axes.find((a) => a.key === 'capacity')!.status).toBe('미흡');
    expect(bad.eligAnswered).toBe(3);
  });
  it('기록 파일의 자격 입력은 허용된 선택지만 보존', () => {
    expect(eligOf({ tax: '있음', lab: '<script>', ongoing: '2건', extra: 'x' })).toEqual({ tax: '있음', ongoing: '2건' });
  });
  it('응답 부족(판단 보류)이면 모든 관점 확인 필요·선행 조건 필요·바우처 없음', () => {
    const { ready } = reportCore({ ...sample, answers: { q1: 5 } });
    expect(ready.overall).toBe('선행 조건 필요');
    expect(ready.axes.every((a) => a.status === '확인 필요')).toBe(true);
    expect(ready.vouchers).toEqual([]);
  });
});
