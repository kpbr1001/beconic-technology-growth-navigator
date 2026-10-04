// v0.9 회귀 테스트: 신규 Rule Engine이 v0.9 원본과 같은 판정을 내는지 확인한다.
// 의도된 차이(승인된 P0 수정)는 별도 describe에서 '차이가 정확히 그것뿐'임을 고정한다.
import { describe, expect, it } from 'vitest';
import { evaluate, activeQuestions, nextTrlGate } from '../../src/diagnosis';
import { strategicOptions, riskItems } from '../../src/diagnosis/strategy';
import { loadRoadmapIndex, roadmapCandidates, setRoadmapIndex } from '../../src/roadmap/candidates';
import type { AssessmentInput } from '../../src/diagnosis';
import { NAMED, randomInputs } from '../fixtures/assessments';
import { runV09 } from './v09-oracle';
import { TRL_ALERT } from '../../src/diagnosis/consistency';
import { HOLD_ALERT, MIN_CORE_ANSWERS } from '../../src/diagnosis/index';

/** v0.9.3에서 추가된 TRL 대조 경고는 v0.9 원본에 없으므로 비교에서 뺀다(아래 '의도된 차이'에서 따로 고정) */
const v09Alerts = (a: string[]) => a.filter((x) => !x.startsWith(TRL_ALERT) && !x.startsWith(HOLD_ALERT));
/** v0.9.15 TRL 단계별 Gate: 구간으로 묶였던 1~5·9는 바뀌고 0·6·7·8은 v0.9와 같다 */
const SAME_GATE_TRL = new Set([0, 6, 7, 8]);

const cases: [string, AssessmentInput][] = [
  ...Object.entries(NAMED),
  ...randomInputs(300).map((x, i) => [`random#${i}`, x] as [string, AssessmentInput]),
];

const candidateTexts = (x: AssessmentInput) => [
  x.company.product, x.company.sectorDetail, x.discovery.hardPart, x.discovery.automated, x.discovery.data,
  ...x.inventory.filter((t) => t.critical).map((t) => t.name),
];

describe.each(cases)('v0.9 parity · %s', (_name, input) => {
  const old = runV09(input);
  const now = evaluate(input);
  const complete = now.pendingDimensions.length === 0;
  // rule-v1.1 최소 응답 기준으로 전 영역이 보류된 경우는 아래 '의도된 차이'에서 따로 고정
  const held = now.insufficient;

  it('활성 문항 세트 동일', () => {
    expect(activeQuestions(input.mode, input.company.bizType).map((q) => q.id)).toEqual(old.activeIds);
  });

  it('신뢰도·응답수·진단수준·미완료 판정 동일', () => {
    expect(now.confidence).toBe(old.results.confidence);
    expect(now.answered).toBe(old.results.answered);
    expect(now.unknown).toBe(old.results.unknown);
    if (input.mode === 'quick') expect(now.insufficient).toBe(old.results.insufficient);
    expect(now.level).toBe(old.results.level);
  });

  it.runIf(!held)('응답이 있는 차원 점수는 v0.9와 동일, 무응답 차원만 50 → null(D2)', () => {
    for (const [d, v] of Object.entries(now.m)) {
      if (v === null) expect(old.results.m[d]).toBe(50);
      else expect(v).toBe(old.results.m[d]);
    }
  });

  it('리스크 신호·TRL Gate 동일 (로드맵 후보는 D4로 원문 색인 기준 변경 — 아래 의도된 차이 참조)', () => {
    expect(riskItems(input.answers)).toEqual(old.risks);
    const same = (trl: number) => SAME_GATE_TRL.has(Number(trl || 0));
    const crit = input.inventory.filter((t) => t.critical && same(t.trl)).map((t) => ({ id: t.id, ...nextTrlGate(t.trl) }));
    const ids = new Set(crit.map((c) => c.id));
    expect(crit).toEqual(old.crit.filter((c) => ids.has(c.id)).map(({ id, target, gate }) => ({ id, target, gate })));
  });

  it.runIf(complete)('전 차원 응답 시: 역량점수·범위·Gap·우선순위·경고·전략대안 완전 동일', () => {
    expect(now.capability).toBe(old.results.capability);
    expect(now.range).toEqual(old.results.range);
    expect(now.gaps).toEqual(old.results.gaps);
    expect(v09Alerts(now.alerts)).toEqual(old.results.alerts);
    expect(strategicOptions(now).map((o) => [o.name, o.score, o.recommended])).toEqual(
      old.options.map((o) => [o.name, o.score, o.recommended]),
    );
  });

  it.runIf(held)('rule-v1.1 최소 응답 미달: 전 영역·역량 판단 보류, 근거확보 P0, 미달 경고가 맨 앞', () => {
    expect(now.coreAnswered).toBeLessThan(MIN_CORE_ANSWERS);
    expect(Object.values(now.m).every((v) => v === null)).toBe(true);
    expect(now.capability).toBeNull();
    expect(now.gaps).toEqual([{ area: '근거확보', score: null, ps: null, priority: 'P0' }]);
    expect(now.alerts[0].startsWith(HOLD_ALERT)).toBe(true);
  });

  it.runIf(!complete && !held)('무응답 차원 존재 시: Gap에서 제외되고 판단 보류 경고가 추가됨', () => {
    const areas = now.gaps.map((g) => g.area);
    expect(now.alerts.at(-1)).toMatch(/판단 보류/);
    expect(v09Alerts(now.alerts.slice(0, -1))).toEqual(old.results.alerts);
    for (const g of now.gaps) if (g.score !== null) expect(areas).toContain(g.area);
    expect(now.gaps.every((g) => g.score === null || g.area !== '근거확보')).toBe(true);
  });
});

describe('의도된 차이 고정 (승인된 P0 수정)', () => {
  it('rule-v1.1: 공통 핵심 12문항 중 8개 미만 응답이면 전 영역·역량 판단 보류, 근거확보 P0', () => {
    const r = evaluate(NAMED.partial); // 7문항 응답
    expect(r.coreAnswered).toBeLessThan(MIN_CORE_ANSWERS);
    expect(r.insufficient).toBe(true);
    expect(Object.values(r.m).every((v) => v === null)).toBe(true);
    expect(r.capability).toBeNull();
    expect(r.gaps).toEqual([{ area: '근거확보', score: null, ps: null, priority: 'P0' }]);
    expect(r.alerts[0].startsWith(HOLD_ALERT)).toBe(true);
    expect(runV09(NAMED.partial).results.capability).toBeGreaterThan(0); // v0.9는 7문항으로도 점수 산정
    const eight = evaluate({ ...NAMED.partial, answers: { ...NAMED.partial.answers, q7: 3 } });
    expect(eight.coreAnswered).toBe(8);
    expect(eight.capability).not.toBeNull();
  });

  it('v0.9.15: TRL 1~9 단계별 다음 목표·검증 관문', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => nextTrlGate(t).target)).toEqual(['TRL 2', 'TRL 3', 'TRL 4', 'TRL 5', 'TRL 6', 'TRL 7', 'TRL 8', 'TRL 9', 'TRL 9 유지']);
    expect(nextTrlGate(4).gate).toBe('유사환경 부품 검증');
    expect(nextTrlGate(5).gate).toBe('유사환경 시스템 시연');
    expect(nextTrlGate(0)).toEqual({ target: '확인 필요', gate: '현재 TRL 근거 확인' });
  });

  it('v0.9.3: 핵심기술 TRL과 구현·실증 응답이 어긋나면 TRL 대조 경고(점수·우선순위 불변)', () => {
    const base = NAMED.sample;
    const hi = { ...base, inventory: base.inventory.map((t) => (t.critical ? { ...t, trl: 9 } : t)), answers: { ...base.answers, q1: 1 } };
    const r = evaluate(hi);
    expect(r.alerts.some((x) => x.startsWith(TRL_ALERT) && x.includes('TRL 7 이상'))).toBe(true);
    const plain = evaluate({ ...hi, inventory: hi.inventory.map((t) => ({ ...t, critical: false })) });
    expect(r.capability).toBe(plain.capability);
    expect(r.gaps).toEqual(plain.gaps);
    const lo = { ...base, inventory: base.inventory.map((t) => (t.critical ? { ...t, trl: 3 } : t)), answers: { ...base.answers, q2: 5 } };
    expect(evaluate(lo).alerts.some((x) => x.startsWith(TRL_ALERT) && x.includes('4 이하'))).toBe(true);
  });
  it('D3: TRL 평균 필드가 없고 핵심기술별 값과 분포만 제공', () => {
    const { trl } = evaluate(NAMED.sample);
    expect(trl).not.toHaveProperty('avg');
    expect(trl.items.map((x) => x.trl)).toEqual([6, 6, 7]);
    expect(trl.distribution).toBe('6~7');
    expect(runV09(NAMED.sample).results.trl).toBe(6); // v0.9는 (6+6+7)/3 반올림 = 6
  });

  it('D4: 로드맵 후보가 세부분야명 → 원문 색인의 전략품목(문서·쪽 포함)으로 바뀜', async () => {
    await loadRoadmapIndex();
    const input = NAMED.sample;
    const now = roadmapCandidates({ roadmapField: input.company.roadmapField, texts: candidateTexts(input) });
    const old = runV09(input).candidates.map((c) => c.name);
    expect(now.map((c) => c.name)).not.toEqual(old);
    for (const c of now) {
      expect(c.evidenceGrade).toBe('retrieved');
      expect(c.page).toBeGreaterThan(0);
      expect(`${c.label} ${c.reason} ${c.source}`).not.toMatch(/높음|중간|공식근거/);
    }
    setRoadmapIndex(null);
  });

  it('D1: 로드맵 후보에 적합도 등급·공식근거 표기가 없음', () => {
    const c = roadmapCandidates({ roadmapField: 'AI', texts: ['AI 에이전트 컨텐츠'] });
    for (const x of c) {
      expect(x.evidenceGrade).toBe('unverified');
      expect(x.page).toBeNull();
      expect(`${x.label} ${x.reason} ${x.source}`).not.toMatch(/높음|중간|공식근거/);
    }
  });

  it('D2: 전부 모름이면 모든 차원 판단 보류, 역량점수 null, 근거확보가 P0', () => {
    const r = evaluate(NAMED.allUnknown);
    expect(Object.values(r.m).every((v) => v === null)).toBe(true);
    expect(r.capability).toBeNull();
    expect(r.range).toBeNull();
    expect(r.gaps).toEqual([{ area: '근거확보', score: null, ps: null, priority: 'P0' }]);
    expect(runV09(NAMED.allUnknown).results.capability).toBe(50); // v0.9는 50점으로 표시
  });
});
