// 지원사업 신청 준비도: 관점 판정 규칙·바우처 후보 근거·자격 체크리스트
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reportCore } from '../../src/reports/core';
import { itemAxis, itemStatus, type AxisItem } from '../../src/reports/readiness';
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
    expect(ready.axes[0].items![0].basis).toContain("'이상징후 탐지 모델'");
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
  it('기술성·수행 역량은 5개 항목(0~100점·상태·근거·보완사항), 관점 점수는 항목 평균', () => {
    const { ready } = reportCore(sample);
    const [tech, cap] = ready.axes;
    expect(tech.items!.map((x) => x.label)).toEqual(['기술 성숙도', '차별성', '핵심 기능 구현', '로드맵 핵심기술 연계', '지식재산 보호']);
    expect(cap.items!.map((x) => x.label)).toEqual(['연구 자원', '개발·검증 반복', '과제 관리', '기술 기록', '연구 조직·인력']);
    for (const ax of [tech, cap]) {
      for (const it of ax.items!) {
        expect(it.status).toBe(itemStatus(it.score));
        if (it.status === '충족') expect(it.fix).toBe('');
        else expect(it.fix.length).toBeGreaterThan(0);
      }
      const known = ax.items!.map((x) => x.score).filter((x): x is number => x !== null);
      expect(ax.score).toBe(Math.round(known.reduce((a, b) => a + b, 0) / known.length));
    }
    // 샘플: TRL 6 → 90점, 연구전담조직 미입력 → 확인 필요(0점 아님)
    expect(tech.items![0].score).toBe(90);
    expect(cap.items![4]).toMatchObject({ score: null, status: '확인 필요' });
    expect(reportCore({ ...sample, company: { ...sample.company, elig: { lab: '연구소', researchers: '3~5명' } } }).ready.axes[1].items![4].score).toBeGreaterThanOrEqual(70);
  });
  it("관점 판정 규칙: 필수 항목 미흡 → 미흡 / 평균 45 미만 → 미흡 / 평균 70↑이고 보완 없음 → 충족 / 확인 가능 3개 미만 → 확인 필요", () => {
    const it = (key: string, score: number | null, gate = false): AxisItem => ({ key, label: key, score, status: itemStatus(score), basis: '', fix: score !== null && score >= 70 ? '' : 'x', gate });
    expect(itemAxis('capacity', [it('a', 90), it('b', 90), it('c', 90), it('d', 90), it('org', 20, true)]).status).toBe('미흡');
    expect(itemAxis('capacity', [it('a', 40), it('b', 40), it('c', 40), it('d', 50), it('e', 40)]).status).toBe('미흡');
    expect(itemAxis('capacity', [it('a', 90), it('b', 80), it('c', 75), it('d', 70), it('e', null)]).status).toBe('충족');
    expect(itemAxis('capacity', [it('a', 95), it('b', 95), it('c', 95), it('d', 60), it('e', 95)]).status).toBe('보완'); // 평균 88이어도 보완 항목 있음
    expect(itemAxis('capacity', [it('a', 90), it('b', 90), it('c', null), it('d', null), it('e', null)]).status).toBe('확인 필요');
    // 기술성은 차별성 '모름'(설명 불가)도 미흡
    expect(itemAxis('tech', [it('trl', 90, true), it('diff', null, true), it('impl', 90), it('roadmap', 90), it('ip', 90)]).status).toBe('미흡');
  });
  it("차별성 '모름'은 0점이 아니라 확인 필요, 근거가 약하면 60점 상한", () => {
    const unk = reportCore({ ...sample, answers: { ...sample.answers, q12: null } }).ready.axes[0].items![1];
    expect(unk).toMatchObject({ score: null, status: '확인 필요' });
    const weak = reportCore({ ...sample, answers: { ...sample.answers, q12: 5 }, evidence: { ...sample.evidence, q12: 0 } }).ready.axes[0].items![1];
    expect(weak.score).toBe(60);
  });
});

