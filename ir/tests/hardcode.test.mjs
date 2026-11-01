// 하드코딩 재발 방지 — 화면·보고서·엔진 소스에 문항 수·영역 수·판정 기준·재무 참고 구간을 숫자로 고정하지 않는다(모두 model.js·fin.js에서 가져옴).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { N_Q, CATEGORIES, LENSES, estMinutes } from '../src/model.js';

const code = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');
const UI = ['src/app.js', 'src/report.js', 'src/score.js', 'index.html'];

test('문항·영역·질문 개수, 소요 시간을 숫자로 쓰지 않음', () => {
  const bad = [];
  for (const f of UI) for (const m of code(f).matchAll(/(?<![\d$.{])\d+\s?문항|(?<![\d$])\d+개 (?:영역|질문|계정)|(?<![\d$])\d+가지|약 \d+분/g)) bad.push(`${f}: ${m[0]}`);
  assert.deepEqual(bad, []);
});
test('점수 기준·막대 색 구간·로드맵 기간을 숫자로 쓰지 않음', () => {
  const bad = [];
  for (const f of ['src/app.js', 'src/report.js', 'src/score.js']) {
    for (const m of code(f).matchAll(/(?:>=|<=|<|>)\s?(?:[1-9]|[1-9]0)\b(?![\d.%])|\*\s?20\b|[1-5]점 (?:이상|이하)|1~5|2주·30일·90일/g)) bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});
test('재무 참고 구간은 fin.js FIN_BANDS 한 곳에서만', () => {
  for (const f of ['src/app.js', 'src/report.js', 'src/score.js']) assert.doesNotMatch(code(f), /100%\/200%|150%|10% 이상/, f);
  const fin = code('src/fin.js'); const inline = [...fin.matchAll(/band:\s*v\s*[<>]=?/g)]; assert.equal(inline.length, 0, '지표 판정은 bandOf()로');
});
test('모델 값이 화면에 쓰이는 값과 일치', () => {
  assert.ok(N_Q > 0 && CATEGORIES.length > 0 && LENSES.length > 0 && estMinutes() >= 5);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\{\{N_Q\}\}문항/); // 빌드 때 채움
});
