// 논리 검증(성질 테스트): 무작위 입력 수백 개로 '항상 성립해야 하는 성질'을 확인한다.
// 공식을 바꾸지 않고 모순만 찾는다 — 실패하면 공식이 아니라 이 성질을 근거로 전문가 검토 대상이 된다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeQuestions, CORE, DIMENSIONS, evaluate, type Answer, type AssessmentInput, type TechItem } from '../../src/diagnosis';
import { strategicOptions } from '../../src/diagnosis/strategy';
import { rankTechs } from '../../src/diagnosis/techrank';
import { orderByPriority, reportCore } from '../../src/reports/core';
import { setRoadmapIndex, type AppIndex } from '../../src/roadmap/candidates';
import options from '../../src/app/options.json';
import raw from '../../src/roadmap/kb-app-index.json';

/** 시드 고정 난수(재현 가능) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const N = 300;
const FIELDS = ['AI', '스마트제조(특화)', '이차전지', '서비스R&D(특화)', '소재·부품·장비(특화)'];
const TECH_NAMES = ['이상징후 탐지 모델', '센서 데이터 정규화', '정밀 사출 공정', '저전력 회로 설계', '돌봄 매칭 운영 매뉴얼', '음극재 합성 공정', '문서 분류 모델', '예지보전 플랫폼'];

function randomInput(seed: number): AssessmentInput {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const bizType = pick(options.BUSINESS_TYPES);
  const mode = r() < 0.5 ? 'quick' : 'deep';
  const answers: Record<string, Answer> = {};
  const evidence: Record<string, number> = {};
  for (const q of activeQuestions(mode, bizType)) {
    const x = r();
    answers[q.id] = x < 0.1 ? null : x < 0.15 ? undefined : 1 + Math.floor(r() * 5);
    evidence[q.id] = Math.floor(r() * 5);
  }
  const inventory: TechItem[] = Array.from({ length: Math.floor(r() * 5) }, (_, i) => ({
    id: i + 1, name: TECH_NAMES[(i + Math.floor(r() * 8)) % 8], type: '핵심기술', ownership: pick(['자체', '외부', '혼합', '확인필요']),
    status: pick(['확정', '추정']), critical: r() < 0.7, trl: Math.floor(r() * 10), confirmed: r() < 0.5,
  }));
  return {
    mode, company: { bizType, roadmapField: pick(FIELDS), product: '설비 데이터 기반 예지보전 솔루션', sectorDetail: pick(['예지보전', '음극재', '돌봄 서비스', '']) },
    discovery: { hardPart: pick(['센서 데이터 정규화와 이상패턴 탐지', '금형 설계 노하우', '']), automated: '', data: pick(['진동 센서 데이터', '']), external: pick(['클라우드 API', '']), people: '', validation: '' },
    inventory, answers, evidence,
  };
}
const cases = Array.from({ length: N }, (_, i) => randomInput(1000 + i));
const answeredIds = (i: AssessmentInput) => Object.entries(i.answers).filter(([, v]) => typeof v === 'number').map(([k]) => k);
const qCat = (i: AssessmentInput, id: string) => activeQuestions(i.mode, i.company.bizType).find((q) => q.id === id)!.cat;

describe('논리 검증 — 점수', () => {
  it('응답을 올리면 그 영역 점수·기술역량이 내려가지 않음', () => {
    for (const inp of cases) {
      const base = evaluate(inp);
      for (const id of answeredIds(inp)) {
        const v = inp.answers[id] as number;
        if (v === 5) continue;
        const up = evaluate({ ...inp, answers: { ...inp.answers, [id]: v + 1 } });
        const d = qCat(inp, id);
        if (base.m[d] !== null) expect(up.m[d]!).toBeGreaterThanOrEqual(base.m[d]!);
        if (base.capability !== null) expect(up.capability!).toBeGreaterThanOrEqual(base.capability - 1e-9);
      }
    }
  });
  it('근거자료 수준을 올리면 진단 신뢰도가 내려가지 않음', () => {
    for (const inp of cases) {
      const base = evaluate(inp);
      for (const id of answeredIds(inp)) {
        if ((inp.evidence[id] ?? 0) >= 4) continue;
        const up = evaluate({ ...inp, evidence: { ...inp.evidence, [id]: (inp.evidence[id] ?? 0) + 1 } });
        expect(up.confidence).toBeGreaterThanOrEqual(base.confidence - 1e-9);
      }
    }
  });
  it('기업규모·업력·단계·기업명은 점수·우선순위·추천안에 영향 없음(가점 금지)', () => {
    for (const inp of cases.slice(0, 120)) {
      const a = evaluate(inp);
      const b = evaluate({ ...inp, company: { ...inp.company, name: '다른 회사', size: '1,000명 이상', years: '10년 이상', stage: '중견기업' } });
      expect(b.m).toEqual(a.m);
      expect([b.capability, b.confidence, b.gaps]).toEqual([a.capability, a.confidence, a.gaps]);
      expect(strategicOptions(b)).toEqual(strategicOptions(a));
    }
  });
  it("'모름'은 0점이 아님: 같은 문항을 1점으로 답한 경우보다 영역 점수가 낮지 않음", () => {
    for (const inp of cases) {
      for (const id of answeredIds(inp)) {
        const unk = evaluate({ ...inp, answers: { ...inp.answers, [id]: null } });
        const one = evaluate({ ...inp, answers: { ...inp.answers, [id]: 1 } });
        const d = qCat(inp, id);
        if (unk.m[d] !== null && one.m[d] !== null) expect(unk.m[d]!).toBeGreaterThanOrEqual(one.m[d]!);
      }
    }
  });
  it('공통 핵심 문항 응답 8개 미만이면 모든 영역·기술역량 판단 보류, 8개 이상이면 산정', () => {
    for (const inp of cases) {
      const r = evaluate(inp);
      const core = CORE.filter((q) => typeof inp.answers[q.id] === 'number').length;
      expect(r.insufficient).toBe(core < 8);
      if (core < 8) expect(DIMENSIONS.every((d) => r.m[d] === null) && r.capability === null).toBe(true);
    }
  });
  it('점수·신뢰도는 범위 안(0~100, 신뢰도 10~100), 오차 범위는 기술역량을 포함', () => {
    for (const inp of cases) {
      const r = evaluate(inp);
      for (const d of DIMENSIONS) {
        if (r.m[d] === null) continue;
        expect(r.m[d]!).toBeGreaterThanOrEqual(0);
        expect(r.m[d]!).toBeLessThanOrEqual(100);
      }
      expect(r.confidence).toBeGreaterThanOrEqual(10);
      expect(r.confidence).toBeLessThanOrEqual(100);
      if (r.range && r.capability !== null) expect(r.range[0] <= Math.round(r.capability) && Math.round(r.capability) <= r.range[1]).toBe(true);
    }
  });
});

describe('논리 검증 — 우선순위·전략', () => {
  it('우선순위 정렬은 P0→P1→P2이고 같은 등급 안에서는 점수 낮은 순', () => {
    for (const inp of cases) {
      const p = orderByPriority(evaluate(inp).gaps);
      for (let k = 1; k < p.length; k++) {
        expect(p[k - 1].priority <= p[k].priority).toBe(true);
        if (p[k - 1].priority === p[k].priority && p[k].score !== null) expect(p[k - 1].score!).toBeLessThanOrEqual(p[k].score!);
      }
    }
  });
  it('어떤 영역의 응답을 올려도 그 영역의 우선순위 등급이 더 급해지지 않음', () => {
    for (const inp of cases.slice(0, 150)) {
      const base = evaluate(inp);
      for (const id of answeredIds(inp)) {
        const v = inp.answers[id] as number;
        const d = qCat(inp, id);
        if (v === 5 || d === 'risk') continue; // 리스크 점수는 모든 영역 우선순위 계산에 쓰임
        const up = evaluate({ ...inp, answers: { ...inp.answers, [id]: v + 1 } });
        const before = base.gaps.find((g) => g.area === AREA(d));
        const after = up.gaps.find((g) => g.area === AREA(d));
        if (before && after) expect(after.priority >= before.priority).toBe(true);
      }
    }
  });
  it('근거자료를 보강해도(신뢰도 상승) 추천안이 B·C에서 A(검증·안정화)로 되돌아가지 않음', () => {
    for (const inp of cases) {
      const base = strategicOptions(evaluate(inp)).findIndex((o) => o.recommended);
      if (base === 0) continue;
      const ev = Object.fromEntries(Object.keys(inp.evidence).map((k) => [k, Math.min(4, (inp.evidence[k] ?? 0) + 1)]));
      expect(strategicOptions(evaluate({ ...inp, evidence: ev })).findIndex((o) => o.recommended)).not.toBe(0);
    }
  });
});
const AREA = (d: string) => ({ tech: '기술성숙', rd: 'R&D 역량', exec: '실행준비', evidence: '기술기록', scale: '확장준비', strategy: '전략정렬', risk: '리스크대응' } as Record<string, string>)[d];

describe('논리 검증 — 핵심기술·R&D·보완 필요', () => {
  beforeAll(() => setRoadmapIndex(raw as unknown as AppIndex));
  afterAll(() => setRoadmapIndex(null));
  it('기술에 확인 항목 하나를 더 채우면(기업 확인) 순위가 내려가지 않음', () => {
    for (const inp of cases) {
      const base = rankTechs(inp.inventory, { hardPart: inp.discovery.hardPart, linkOf: () => null });
      for (const row of base.filter((x) => !x.tech.confirmed)) {
        const inv = inp.inventory.map((t) => (t === row.tech ? { ...t, confirmed: true } : t));
        const after = rankTechs(inv, { hardPart: inp.discovery.hardPart, linkOf: () => null }).find((x) => x.tech.id === row.tech.id && x.tech.name === row.tech.name)!;
        expect(after.rank).toBeLessThanOrEqual(row.rank);
      }
    }
  });
  it('R&D 과제·보완 대조·순위는 핵심기술로 체크한 기술만 쓰고, 보완 후보는 원문 핵심기술 목록 안에서만', () => {
    for (const inp of cases.slice(0, 150)) {
      const c = reportCore(inp);
      const crit = new Set(inp.inventory.filter((t) => t.critical && t.name.trim()).map((t) => t.name));
      expect(c.ranked.every((x) => crit.has(x.tech.name))).toBe(true);
      for (const p of c.rnd) if (crit.size) expect(crit.has(p.techName) || p.track === 'frontier').toBe(true);
      for (const card of c.cards) {
        const src = c.matches.find((m) => m.name === card.item.name)!;
        const names = new Set((src.allTechs ?? []).map((t) => t.name));
        for (const row of card.rows) {
          expect(names.has(row.roadmapTech)).toBe(true);
          if (row.company) expect(crit.has(row.company.name)).toBe(true);
        }
      }
      if (c.r.insufficient) expect([c.rnd.length, c.cards.length]).toEqual([0, 0]);
    }
  });
  it('핵심기술이 3개 이상이면 R&D 과제마다 서로 다른 기술', () => {
    for (const inp of cases) {
      const crit = new Set(inp.inventory.filter((t) => t.critical && t.name.trim()).map((t) => t.name));
      if (crit.size < 3) continue;
      const names = reportCore(inp).rnd.map((p) => p.techName);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
