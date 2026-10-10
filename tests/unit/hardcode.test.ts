// 하드코딩 재발 방지: 화면·보고서 소스에 문항 수·영역 수·항목 수·판정 기준점·발행사 정보가 숫자/문자로 고정되지 않았는지 검사
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kbSources, setRoadmapIndex, type AppIndex } from '../../src/roadmap/candidates';
import raw from '../../src/roadmap/kb-app-index.json';

const SRC = ['src/app/legacy-ui.ts', 'src/reports/keysummary.ts', 'src/reports/readiness.ts', 'src/reports/report-check.ts', 'src/reports/visuals.ts', 'src/diagnosis/index.ts', 'src/diagnosis/rnd.ts', 'src/main.ts'];
// 주석은 빼고 검사
const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*\*?[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('하드코딩 재발 방지', () => {
  it('문항·영역·항목·경로·관점 개수를 숫자로 고정하지 않음(엔진·판정 결과에서 계산)', () => {
    const bad: string[] = [];
    for (const p of SRC) {
      const s = code(p);
      for (const m of s.matchAll(/(?<![\d$])(\d+)\s?문항|(?<![\d$])\d+개 (?:역량)?(?:영역|관점|항목|경로)|\d+가지 관점|확인 항목 충족 수\(\d|total\s*=\s*\d+/g)) bad.push(`${p}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
  it('판정 기준점(구간 80·65·45, 신청 준비도 70·45, 신뢰도 60)은 상수 한 곳에서만', () => {
    for (const p of ['src/app/legacy-ui.ts', 'src/reports/report-check.ts', 'src/reports/visuals.ts', 'src/reports/keysummary.ts']) {
      const hits = [...code(p).matchAll(/(?<!<b)[\w.\]]\s?(?:>=|<=|<|>)\s?(?:80|70|65|60|45)\b(?!\.\d)/g)].map((m) => m[0]);
      expect(hits, p).toEqual([]);
    }
  });
  it('발행사 정보(전화·주소·인증번호)는 ISSUER에서만 — 화면·보고서 소스에 직접 쓰지 않음', () => {
    for (const p of ['src/app/legacy-ui.ts', 'src/reports/keysummary.ts', 'src/main.ts']) expect(code(p), p).not.toMatch(/070-4103-4177|디지털로27길|제2025-684호|start@gven\.kr/);
  });
});

describe('부록 Knowledge Base = 실제 원문 색인', () => {
  beforeAll(() => setRoadmapIndex(raw as unknown as AppIndex));
  afterAll(() => setRoadmapIndex(null));
  it('문서 묶음·분야 수·품목 수가 색인과 같음', () => {
    const ks = kbSources();
    const ix = raw as unknown as AppIndex;
    expect(ks.reduce((a, k) => a + k.fields.length, 0)).toBe(Object.keys(ix.fields).length);
    expect(ks.reduce((a, k) => a + k.items, 0)).toBe(Object.values(ix.fields).reduce((a, f) => a + f.items.length, 0));
    expect(ks.find((k) => k.doc === '중소기업 전략기술로드맵(2026~2028)')!.fields.length).toBe(13);
  });
  it('색인이 없으면 빈 목록(지어내지 않음)', () => {
    setRoadmapIndex(null);
    expect(kbSources()).toEqual([]);
    setRoadmapIndex(raw as unknown as AppIndex);
  });
});
