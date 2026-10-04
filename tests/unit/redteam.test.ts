// 리스크 레드팀(규칙 기반): 레지스터 가능성·영향·등급, 모름=확인 필요, 진단 검토 항목
import { describe, expect, it } from 'vitest';
import { evaluate, type AssessmentInput } from '../../src/diagnosis';
import { gradeOf, redTeam } from '../../src/diagnosis/redteam';
import { riskHeatmapSVG } from '../../src/reports/visuals';

const base: AssessmentInput = {
  mode: 'quick',
  company: { name: 'x', roadmapField: '스마트제조(특화)', bizType: 'AI/SW 중심', sectorDetail: '', product: '' },
  discovery: { hardPart: '센서 정규화', automated: '', data: '', external: '클라우드 API', people: '', validation: '' },
  inventory: [{ id: 1, name: '탐지 모델', type: '알고리즘', ownership: '자체', status: '확정', critical: true, trl: 0, confirmed: false }],
  answers: { q1: 5, q2: 3, q3: 3, q4: 3, q5: 4, q6: 4, q7: 3, q8: 2, q9: 2, q10: null, q11: 2, q12: 3 },
  evidence: { q1: 0, q5: 2, q6: 2 },
};
const run = (over: Partial<AssessmentInput> = {}) => {
  const input = { ...base, ...over };
  return redTeam(input, evaluate(input));
};
const byId = (rt: ReturnType<typeof run>, id: string) => rt.risks.find((x) => x.id === id);

describe('리스크 레지스터', () => {
  it('응답 1~2 → 가능성 높음, 3 → 중간, 4~5 → 낮음 / 등급 = 가능성×영향', () => {
    const rt = run();
    expect(byId(rt, 'R2')).toMatchObject({ likelihood: 3, impact: 3, severity: 9, grade: '높음' });
    expect(byId(rt, 'R2')!.basis).toContain('Q9 2/5');
    expect(byId(rt, 'R2')!.basis).toContain('입력: "클라우드 API"');
    expect(byId(rt, 'R6')).toMatchObject({ likelihood: 2, impact: 2, grade: '중간' });
    expect(byId(rt, 'R7')).toMatchObject({ likelihood: 1, impact: 2, grade: '낮음' });
    expect([gradeOf(9), gradeOf(6), gradeOf(4), gradeOf(3), gradeOf(2), gradeOf(null)]).toEqual(['높음', '높음', '중간', '중간', '낮음', '확인 필요']);
  });
  it("'모름'은 낮은 점수가 아니라 확인 필요(가능성 미판단)", () => {
    expect(byId(run(), 'R4')).toMatchObject({ likelihood: null, severity: null, grade: '확인 필요' });
    expect(byId(run(), 'R4')!.basis).toContain('Q10 모름·미응답');
  });
  it('높게 응답했지만 근거가 말뿐이면 가능성을 한 단계 높여 봄', () => {
    const rt = run({ answers: { ...base.answers, q12: 5 }, evidence: { ...base.evidence, q12: 0 } });
    expect(byId(rt, 'R10')).toMatchObject({ likelihood: 2 });
    expect(byId(rt, 'R10')!.basis).toContain('한 단계 높여');
  });
  it('여러 문항이면 가장 낮은 응답 기준, 핵심 인력 리스크는 입력이 있을 때만', () => {
    expect(byId(run(), 'R8')!.likelihood).toBe(3); // q8=2, q11=2
    expect(byId(run(), 'R3')).toBeUndefined();
    expect(byId(run({ discovery: { ...base.discovery, people: 'CTO 1인' } }), 'R3')).toBeDefined();
  });
  it('정밀진단 문항 리스크는 해당 유형·모드에서만(간편 진단엔 데이터 리스크 없음)', () => {
    expect(byId(run(), 'R11')).toBeUndefined();
    expect(byId(run({ mode: 'deep', answers: { ...base.answers, d1: 4, d2: 2 } }), 'R11')).toMatchObject({ likelihood: 3 });
  });
  it('높은 등급부터 정렬, 점수·우선순위는 바꾸지 않음', () => {
    const input = base;
    const before = JSON.stringify(evaluate(input));
    const rt = redTeam(input, evaluate(input));
    expect(JSON.stringify(evaluate(input))).toBe(before);
    expect(rt.risks[0].grade).toBe('높음');
    const sev = rt.risks.filter((x) => x.severity !== null).map((x) => x.severity as number);
    expect(sev[0]).toBe(Math.max(...sev));
    expect(rt.counts.high + rt.counts.mid + rt.counts.low + rt.counts.unknown).toBe(rt.risks.length);
  });
});

describe('진단 검토(이 진단이 틀릴 수 있는 지점)', () => {
  it('근거 없는 높은 응답·모름·TRL 미확인·오차 범위·단일 응답자', () => {
    const titles = run().diagnostic.map((d) => d.title);
    expect(titles).toEqual(expect.arrayContaining(['근거 없는 높은 응답', '모름·미응답', '핵심기술 TRL 미확인', '점수 오차 범위', '단일 응답자 관점']));
    expect(run().diagnostic.find((d) => d.title === '근거 없는 높은 응답')!.detail).toContain('Q1');
    expect(titles.at(-1)).toBe('단일 응답자 관점');
  });
});

describe('히트맵', () => {
  it('리스크 ID를 칸에 표시, 확인 필요 열 포함', () => {
    const svg = riskHeatmapSVG(run().risks);
    expect(svg).toContain('>R2<');
    expect(svg).toContain('확인 필요');
  });
});
