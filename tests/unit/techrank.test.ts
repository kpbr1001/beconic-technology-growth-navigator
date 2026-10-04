// 핵심기술 우선순위: 5개 확인 항목(같은 비중)·이유 표시·결과 미반영 기술 구분
import { describe, expect, it } from 'vitest';
import { excludedTechs, nameTokens, rankTechs, relatesToDiff } from '../../src/diagnosis/techrank';

const hardPart = '설비별 센서데이터 정규화와 이상패턴 탐지';
const link = { name: 'AI 설비 예지보전 솔루션', code: 'B-03-08', page: 271, source: '스마트제조' };
const techs = [
  { name: '데이터 수집·정규화 기술', trl: 2, critical: true, ownership: '확인필요' },
  { name: '이상징후 탐지 알고리즘·모델', trl: 2, critical: true, ownership: '확인필요' },
  { name: '고장 가능성 예측 모델', trl: 2, critical: true, ownership: '확인필요' },
  { name: '설비 이벤트 로그 연계 분석', trl: 3, critical: true, ownership: '자체' },
  { name: '정비 우선순위 자동 추천', trl: 0, critical: false, ownership: '확인필요' },
];

describe('핵심기술 우선순위', () => {
  it('넓은 말(데이터·기술·설비)은 차별 요소 판단에서 뺌', () => {
    expect(nameTokens('데이터 수집·정규화 기술')).toEqual(['수집', '정규화']);
    expect(relatesToDiff({ name: '설비 이벤트 로그 연계 분석' }, hardPart)).toBe(false);
    expect(relatesToDiff({ name: '이상징후 탐지 알고리즘·모델' }, hardPart)).toBe(true);
    expect(relatesToDiff({ name: '전혀 다른 이름', src: 'hardPart' }, '')).toBe(true);
  });
  it('핵심기술만 순위에 넣고, 충족 수 → 차별 요소 → TRL 순으로 정렬, 항목별 이유를 남김', () => {
    const rows = rankTechs(techs, { hardPart, linkOf: () => link });
    expect(rows.map((r) => [r.rank, r.tech.name, r.met])).toEqual([
      [1, '데이터 수집·정규화 기술', 3],
      [2, '이상징후 탐지 알고리즘·모델', 3],
      [3, '설비 이벤트 로그 연계 분석', 3],
      [4, '고장 가능성 예측 모델', 2],
    ]);
    expect(rows[0].checks).toEqual({ diff: true, roadmap: true, own: null, trl: true, confirmed: false });
    expect(rows[0].reasons[1]).toContain('원문 p.271');
    expect(rows[2].checks.own).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/적합도|선정 가능|높음/);
  });
  it('외부 의존은 자체 보유 ✗, 기업 확인·TRL 입력은 각각 1항목', () => {
    const [a, b] = rankTechs([
      { name: 'A 외부 엔진', trl: 5, critical: true, ownership: '외부' },
      { name: 'B 정규화 엔진', trl: 4, critical: true, ownership: '자체', confirmed: true },
    ], { hardPart, linkOf: () => null });
    expect(a.tech.name).toBe('B 정규화 엔진');
    expect(a.met).toBe(4);
    expect(b.checks.own).toBe(false);
    expect(b.reasons[2]).toContain('외부 의존');
  });
  it('핵심기술로 체크하지 않은 기술은 결과 미반영 목록으로', () => {
    expect(excludedTechs(techs).map((t) => t.name)).toEqual(['정비 우선순위 자동 추천']);
  });
});
