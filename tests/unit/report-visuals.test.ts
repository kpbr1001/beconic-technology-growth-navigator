// 보고서 시각화: 사분면 판정·간트 일정 계산(값은 Rule Engine 결과만 사용)
import { describe, expect, it } from 'vitest';
import { dateAfter, durationWeeks, ganttRows, ganttSVG, positionMatrixSVG, quadrantOf } from '../../src/reports/visuals';

describe('포지셔닝 매트릭스', () => {
  it('역량 65·신뢰도 60 경계(반올림 후)로 사분면', () => {
    expect(quadrantOf(72, 78)?.key).toBe('scale');
    expect(quadrantOf(72, 40)?.key).toBe('evidence');
    expect(quadrantOf(52, 78)?.key).toBe('focus');
    expect(quadrantOf(52, 40)?.key).toBe('recheck');
    expect(quadrantOf(64.6, 59.5)?.key).toBe('scale');
    expect(quadrantOf(null, 90)).toBeNull();
  });
  it('SVG: 현재 위치 표시, 역량 보류면 위치 미표시', () => {
    expect(positionMatrixSVG(52, 78)).toContain('현재 (78, 52)');
    expect(positionMatrixSVG(null, 30)).toContain('판단 보류');
  });
});

describe('90일 간트', () => {
  it('기간 문구 → 주 수', () => {
    expect([durationWeeks('2~3주'), durationWeeks('4~8주'), durationWeeks('1주'), durationWeeks('수시'), durationWeeks('20주')]).toEqual([3, 8, 1, 2, 12]);
  });
  it('기준확정 → P0 2주차 → P1 4주차 → P2 7주차, 12주 안에서 종료', () => {
    const rows = ganttRows([
      { label: '외부의존도·대체경로 정의', priority: 'P0', duration: '2~3주' },
      { label: 'Scale-up 병목 테스트', priority: 'P1', duration: '4~8주' },
      { label: '정의서', priority: 'P2', duration: '8주' },
      { label: 'Crosswalk', priority: 'P0', duration: '2주' },
    ]);
    expect(rows.map((r) => [r.priority, r.start, r.end])).toEqual([['base', 1, 2], ['P0', 2, 4], ['P0', 2, 3], ['P1', 4, 11], ['P2', 7, 12]]);
    const svg = ganttSVG(rows);
    expect(svg).toContain('90일 재진단');
    expect(svg).toContain('P0 · 외부의존도·대체경로 정의');
  });
  it('라벨은 이스케이프', () => {
    expect(ganttSVG(ganttRows([{ label: '<b>x</b>', priority: 'P0', duration: '1주' }]))).not.toContain('<b>x');
  });
  it('재진단 예정일', () => {
    expect(dateAfter(90, new Date(2026, 9, 4))).toBe('2027.01.02');
  });
});
