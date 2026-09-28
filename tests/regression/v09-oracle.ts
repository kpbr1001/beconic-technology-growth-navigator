// v0.9 원본 HTML의 스크립트를 그대로 실행하는 '오라클'. 신규 Rule Engine과 결과를 비교하는 기준선이다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import type { AssessmentInput } from '../../src/diagnosis';

const html = readFileSync(new URL('../../reference/BECONIC_Technology_Growth_Navigator_v0.9.html', import.meta.url), 'utf8');
let script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
script = script.replace('loadState();render();', '');
script += `
;globalThis.__oracle = (input) => {
  state = { ...fresh(), ...JSON.parse(input) };
  calc();
  return JSON.parse(JSON.stringify({
    results: state.results,
    options: strategicOptions(state.results),
    risks: riskItems(),
    candidates: roadmapCandidates(),
    crit: criticalTechRows(),
    activeIds: activeQs().map((q) => q.id),
  }));
};`;
const ctx: Record<string, unknown> = { document: { getElementById: () => null }, localStorage: {}, window: {} };
vm.createContext(ctx);
vm.runInContext(script, ctx);

export interface OracleOutput {
  results: {
    m: Record<string, number>; confidence: number; capability: number; trl: number | null; trlRange: string;
    level: string; answered: number; unknown: number; gaps: { area: string; score: number; ps: number; priority: string }[];
    alerts: string[]; insufficient: boolean; range: [number, number];
  };
  options: { name: string; score: number; recommended: boolean }[];
  risks: [string, string, string][];
  candidates: { name: string; fit: string }[];
  crit: { id: number; target: string; gate: string }[];
  activeIds: string[];
}

export const runV09 = (input: AssessmentInput): OracleOutput =>
  (ctx.__oracle as (s: string) => OracleOutput)(JSON.stringify(input));
