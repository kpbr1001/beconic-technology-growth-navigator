// 로드맵 참고 후보(D4): 원문 색인 기반 품목 매칭 원칙 테스트
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadRoadmapIndex, otherFieldCandidates, roadmapCandidates, setRoadmapIndex, terms, ROADMAP_DETAIL, type AppIndex,
} from '../../src/roadmap/candidates';
import raw from '../../src/roadmap/kb-app-index.json';

const index = raw as unknown as AppIndex;

const PDM = ['설비 센서데이터와 AI를 이용해 이상징후를 탐지하고 고장 가능성을 예측하는 예지보전 솔루션', '설비 이상징후 탐지와 정비 우선순위 추천'];

describe('원문 색인 로드 전', () => {
  it('세부분야명 후보로 동작하고 쪽 번호를 만들지 않는다', () => {
    setRoadmapIndex(null);
    const c = roadmapCandidates({ roadmapField: 'AI', texts: PDM });
    expect(c.every((x) => x.evidenceGrade === 'unverified' && x.page === null)).toBe(true);
  });
});

describe('원문 색인 기반 후보', () => {
  beforeAll(async () => {
    await loadRoadmapIndex();
  });
  afterAll(() => setRoadmapIndex(null));

  it('예지보전 기업(스마트제조) → 원문 품목 SMESTR-2025-B-03-08이 1순위, 문서·쪽·핵심기술 TRL 포함', () => {
    const [top] = roadmapCandidates({ roadmapField: '스마트제조(특화)', texts: PDM });
    expect(top.code).toBe('SMESTR-2025-B-03-08');
    expect(top.name).toBe('AI 설비 예지보전 솔루션');
    expect(top.page).toBe(271);
    expect(top.source).toMatch(/스마트제조 전략기술로드맵\(2026~2028\).*인쇄 p\.271 \(PDF p\.279\)/);
    expect(top.matchedTechs?.[0]).toMatchObject({ trl: '5' });
  });

  it('넓은 맥락어(생산·공정)가 섞여도 기업이 밝힌 핵심기술과 맞는 품목이 1순위 (미리보기 피드백)', () => {
    const [top] = roadmapCandidates({
      roadmapField: '스마트제조(특화)',
      texts: [...PDM, '생산 공정 데이터 생산라인'],
      coreTexts: ['AI 기반 설비 예지보전', '이상징후 탐지 모델', '예지보전 플랫폼'],
    });
    expect(top.code).toBe('SMESTR-2025-B-03-08');
  });

  it('적합도 등급·공식근거 표기 금지(키워드 일치 후보일 뿐)', () => {
    for (const f of Object.keys(index.fields)) {
      for (const c of roadmapCandidates({ roadmapField: f, texts: PDM })) {
        expect(`${c.label} ${c.reason} ${c.source}`).not.toMatch(/높음|중간|공식근거|적합도/);
      }
    }
  });

  it('후보의 품목·쪽은 원문 색인에 있는 값만 쓴다(생성 금지)', () => {
    const items = Object.values(index.fields).flatMap((f) => f.items);
    for (const f of Object.keys(index.fields)) {
      for (const c of roadmapCandidates({ roadmapField: f, texts: ['데이터 분석 센서 제어 소재 공정 검사'] })) {
        if (c.hits === 0) continue;
        const src = items.find((i) => i.name === c.name && i.pp === c.page);
        expect(src, `${f}: ${c.name}`).toBeTruthy();
      }
    }
  });

  it('분야 안에서 흔한 단어(AI 분야의 "ai")만으로는 후보가 되지 않는다', () => {
    const c = roadmapCandidates({ roadmapField: 'AI', texts: ['AI'] });
    expect(c.every((x) => x.hits === 0)).toBe(true); // 세부분야 안내로 대체
    expect(c.map((x) => x.name)).toEqual(ROADMAP_DETAIL.AI.slice(0, 3));
  });

  it('일치 단어 1개는 약한 후보로 표시', () => {
    const c = roadmapCandidates({ roadmapField: '화장품(특화)', texts: ['미백'] });
    expect(c[0].weak).toBe(true);
  });

  it('선택 분야보다 다른 분야가 훨씬 잘 맞으면 분야 재검토용 후보 제시', () => {
    const o = otherFieldCandidates({ roadmapField: 'AI', texts: PDM });
    expect(o[0]).toMatchObject({ field: '스마트제조(특화)', code: 'SMESTR-2025-B-03-08' });
    expect(otherFieldCandidates({ roadmapField: '스마트제조(특화)', texts: PDM })).toEqual([]);
  });

  it('2025~2027 판은 연차별 목표 TRL로 구분 표기', () => {
    const c = roadmapCandidates({ roadmapField: '서비스R&D(특화)', texts: ['건강관리 데이터 분석 서비스 생체신호'] });
    expect(c[0].trlNote).toBe('연차별 목표 TRL');
  });

  it('단어 분리: 조사 제거·일반어 제외', () => {
    expect(terms('설비데이터를 이용한 예지보전 기술')).toEqual(['설비데이터', '이용한', '예지보전']);
  });
});
