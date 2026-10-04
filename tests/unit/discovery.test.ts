// 기술 발견(규칙 기반): 답변 문장에서 기술 후보, 근거 구절 원문 유지, 외부 의존은 연계 기술로
import { describe, expect, it } from 'vitest';
import { discoverCandidates, toTechItems } from '../../src/diagnosis/discovery';

const company = { bizType: '융합형(제조+SW/AI)', roadmapField: '스마트제조(특화)', sectorDetail: '산업용 설비 예지보전 AI SaaS', product: '설비 센서 데이터를 분석해 고장을 예측하는 예지보전 SaaS입니다.' };
const discovery = {
  hardPart: '설비별로 형식이 다른 센서 데이터를 표준화하고, 고장 직전의 미세한 패턴을 학습해 오탐을 줄이는 이상탐지 알고리즘',
  automated: '설비 이상 여부를 시스템이 실시간으로 탐지하고 정비 우선순위를 자동 추천합니다.',
  data: '1초 단위 진동·온도 센서값, 설비 알람 로그',
  external: 'AWS 클라우드, LLM API, 센서 게이트웨이 공급사',
  people: 'CTO 1명', validation: '2개 공장 PoC',
};

describe('기술 발견(규칙)', () => {
  const c = discoverCandidates({ company, discovery });
  it('답변에서 후보를 찾고 근거 구절은 답변 원문의 일부', () => {
    expect(c.length).toBeGreaterThanOrEqual(3);
    for (const x of c) {
      const src = { ...discovery, product: company.product, sectorDetail: company.sectorDetail }[x.field];
      expect(src.replace(/\s+/g, '')).toContain(x.quote.replace(/\s+/g, ''));
    }
    expect(c.find((x) => x.type === 'AI/알고리즘')?.name).toMatch(/알고리즘·모델$/);
  });
  it('차별 요소 답변에서 나온 후보는 핵심기술로 제안, 외부 의존은 외부 연계 기술', () => {
    expect(c.filter((x) => x.critical).every((x) => x.field === 'hardPart')).toBe(true);
    expect(c.find((x) => x.field === 'external')).toMatchObject({ type: '통합기술', ownership: '외부', critical: false });
  });
  it('이미 있는 기술명·같은 유형은 중복 제외, 최대 6개', () => {
    const again = discoverCandidates({ company, discovery }, c.map((x) => ({ name: x.name, type: x.type })));
    expect(again).toEqual([]);
    expect(new Set(c.map((x) => x.type)).size).toBe(c.length);
    expect(c.length).toBeLessThanOrEqual(6);
  });
  it('답변이 비어 있으면 후보 없음(업종 기본 후보로 대체)', () => {
    expect(discoverCandidates({ company: { ...company, product: '', sectorDetail: '' }, discovery: { hardPart: '', automated: '', data: '', external: '', people: '', validation: '' } })).toEqual([]);
  });
  it('목록 행: 추정·미확인·TRL 확인 필요', () => {
    const rows = toTechItems(c, 5);
    expect(rows[0]).toMatchObject({ id: 5, status: '추정', confirmed: false, trl: 0 });
    expect(rows.some((r) => r.critical)).toBe(true);
  });
});
