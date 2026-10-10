// 보고서 문장 품질 자동 검사(화면·PDF에 보이는 글자 기준). 대표가 읽기 어려운 표현이 다시 들어오지 않게 막는다.
// 규칙: 조사 병기('이(가)')·조사 불일치·내부 문항 코드(Q9·D1)·번역 안 된 영어 용어·같은 쪽 안의 문장 반복·지나치게 긴 문장.
import { fixParticles } from './ko';

export type TextIssueKind = 'particle-placeholder' | 'particle-mismatch' | 'question-code' | 'jargon' | 'duplicate' | 'long-sentence';
export interface TextIssue {
  kind: TextIssueKind;
  sample: string;
}

/** 대표용 문장에 남으면 안 되는 영어·내부 용어(쉬운 말 변환 뒤 기준) */
export const JARGON = ['Groundedness', 'Owner', 'Due Date', 'Crosswalk', 'Dependency Map', 'Evidence', 'Gate', 'Trade-off', 'Focus', 'Top3', 'Top5', 'POC 의사결정'];
/** 이 길이를 넘는 한 문장은 나눠 쓰도록 경고 */
export const LONG_SENTENCE = 170;

const around = (s: string, i: number, n = 24) => s.slice(Math.max(0, i - n), i + n).replace(/\s+/g, ' ').trim();

/** 문장 나누기(줄바꿈 = 화면의 다른 칸, 그 안에서 마침표·물음표·느낌표 뒤 띄어쓰기 기준) */
export const sentences = (text: string) =>
  text.split(/\n+/).flatMap((line) => line.replace(/\s+/g, ' ').split(/(?<=[.?!])\s+(?=[가-힣A-Za-z'"‘“([])/)).map((x) => x.trim()).filter(Boolean);

export function textIssues(text: string, opts: { long?: number } = {}): TextIssue[] {
  const out: TextIssue[] = [];
  const t = text.replace(/\s+/g, ' ');
  for (const m of t.matchAll(/(이\(가\)|가\(이\)|은\(는\)|는\(은\)|을\(를\)|를\(을\)|과\(와\)|와\(과\)|\(으\)로)/g)) out.push({ kind: 'particle-placeholder', sample: around(t, m.index ?? 0) });
  const fixed = fixParticles(t);
  if (fixed !== t) {
    // 다른 첫 위치 주변을 보여 줌
    let i = 0;
    while (i < t.length && t[i] === fixed[i]) i++;
    if (!out.some((x) => x.kind === 'particle-placeholder')) out.push({ kind: 'particle-mismatch', sample: around(t, i) });
  }
  for (const m of t.matchAll(/(?<![A-Za-z0-9&-])[QD]\d{1,2}(?![0-9A-Za-z])/g)) out.push({ kind: 'question-code', sample: around(t, m.index ?? 0) });
  for (const w of JARGON) {
    const re = new RegExp(`(?<![A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])(?!\\s*\\()`, 'g');
    for (const m of t.matchAll(re)) out.push({ kind: 'jargon', sample: around(t, m.index ?? 0) });
  }
  const long = opts.long ?? LONG_SENTENCE;
  for (const s of sentences(text)) if (s.length > long) out.push({ kind: 'long-sentence', sample: `${s.slice(0, 60)}… (${s.length}자)` });
  return out;
}

/** 한 덩어리(쪽·섹션) 안에서 같은 문장이 2번 넘게 나오면 반복으로 본다(짧은 표 머리말 등은 제외) */
export function duplicateSentences(text: string, min = 28, times = 2): TextIssue[] {
  const seen = new Map<string, number>();
  for (const s of sentences(text)) if (s.length >= min) seen.set(s, (seen.get(s) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > times).map(([s, n]) => ({ kind: 'duplicate' as const, sample: `${s.slice(0, 60)}… ×${n}` }));
}
