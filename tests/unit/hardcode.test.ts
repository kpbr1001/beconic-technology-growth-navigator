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
    for (const p of ['src/app/legacy-ui.ts', 'src/reports/keysummary.ts', 'src/main.ts']) expect(code(p), p).not.toMatch(/02-6124-5960|디지털로27길|제2025-684호|start@gven\.kr/);
  });
});

describe('연락처(전화·주소·인증번호·이메일)는 앱마다 한 곳에서만', () => {
  const PHONE = /0\d{1,2}-\d{3,4}-\d{4}/g;
  const lit = /0\d{1,2}-\d{3,4}-\d{4}|디지털로27길|제2025-684호|start@gven\.kr/;
  // 앱별 연락처 원본(한 곳). 화면·보고서 소스는 여기서 가져다 쓴다
  const OWNERS: Record<string, RegExp> = {
    'grants/app.js': /^const HELP_CONTACT|^\s+web:'www\.beconic\.kr'|\{ v:'v/,  // 원본 + 변경 기록(버전 노트)
    'grants/netlify/lib/bot/kakao.mjs': /^export const CONTACT/,
    'hr/index.html': /^const CONTACT=/,
    'finance/index.html': /^const COMPANY=/,
    'growth/index.html': /^\s+(?:tel|certNo):"/,  // const COMPANY = { … } 여러 줄
    'ir/src/contact.js': /./,
  };
  it('원본 밖 화면·보고서 소스에 직접 쓰지 않음', () => {
    const files = ['grants/index.html', 'grants/app.js', 'grants/netlify/lib/bot/kakao.mjs', 'hr/index.html', 'finance/index.html', 'growth/index.html',
      'ir/src/app.js', 'ir/src/report.js', 'ir/index.html'];
    const bad: string[] = [];
    for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (lit.test(line) && !(OWNERS[f] && OWNERS[f].test(line))) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
    expect(bad).toEqual([]);
  });
  it('앱마다 같은 상담 번호', () => {
    const nums = new Set<string>();
    for (const f of Object.keys(OWNERS)) for (const m of readFileSync(f, 'utf8').split('\n').filter((l) => OWNERS[f].test(l) && !/\{ v:'v/.test(l)).join('\n').matchAll(PHONE)) nums.add(m[0]);
    expect([...nums]).toHaveLength(1);
  });
});

describe('진단 툴 주소 비공개', () => {
  it('인사(HR) 진단은 다른 진단 사이트 주소로 연결하지 않음', () => {
    const html = readFileSync('hr/index.html', 'utf8');
    expect(html.match(/https?:\/\/beconic-diagnosis-(?!hr\b)[a-z-]+\.netlify\.app/g) ?? []).toEqual([]);
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
