// 표준재무제표 추출·지표 — 형식 변형·부호·단위·0/음수 처리.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatements, indicators, parseWon, fmtWon, balanceCheck } from '../src/fin.js';

test('추출: 로마 숫자·코드·글자 간격·괄호/△ 음수(공백 분리 포함)·당기/전기', () => {
  const r = parseStatements(['코드 계정과목 당기 전기', '1000 Ⅰ. 매 출 액 1,200,000,000 800,000,000', 'Ⅳ. 영업이익(손실) ( 120,000,000 ) △ 50,000,000', '당기순이익(손실) -150,000,000 -60,000,000', '(1) 자산총계 900,000,000', '부채총계 600,000,000', '자본총계 300,000,000']);
  assert.equal(r.cur.rev, 1200000000); assert.equal(r.prev.rev, 800000000);
  assert.equal(r.cur.op, -120000000); assert.equal(r.prev.op, -50000000); assert.equal(r.cur.net, -150000000);
  assert.equal(r.cur.assets, 900000000); assert.equal(r.unit, 1);
});
test('단위 천원 → 원, 손실 계정명은 양수도 손실', () => {
  const r = parseStatements(['(단위: 천원)', '매출액 1,000', '영업손실 300']);
  assert.equal(r.unit, 1000); assert.equal(r.cur.rev, 1000000); assert.equal(r.cur.op, -300000);
});
test('없는 계정은 비움', () => { const r = parseStatements(['매출액 5,000']); assert.equal(r.cur.liab, undefined); assert.deepEqual(Object.keys(r.found), ['rev']); });
test('지표: 성장률은 전기>0일 때만, 자본잠식·부채비율·유동비율', () => {
  const f = (cur, prev = {}) => indicators({ cur, prev });
  assert.ok(!f({ rev: 100 }, { rev: 0 }).some((x) => x.k === 'growth'));
  assert.equal(f({ rev: 150 }, { rev: 100 }).find((x) => x.k === 'growth').value, 50);
  const z = f({ liab: 100, equity: -5, capital: 50 }); assert.equal(z.find((x) => x.k === 'debt').value, null); assert.equal(z.find((x) => x.k === 'impair').text, '완전 자본잠식');
  assert.equal(f({ liab: 100, equity: 40, capital: 50 }).find((x) => x.k === 'impair').text, '부분 자본잠식');
  assert.equal(f({ liab: 300, equity: 100 }).find((x) => x.k === 'debt').band, 'warn');
  assert.equal(f({ ca: 120, cl: 100 }).find((x) => x.k === 'current').band, 'mid');
  assert.ok(!f({ rev: 0, op: -1 }).some((x) => x.k === 'opm')); // 매출 0이면 이익률 계산 안 함
});
test('금액 입력·표시·대차 확인', () => {
  assert.equal(parseWon('1.2억'), 120000000); assert.equal(parseWon('(3,000)'), -3000); assert.equal(parseWon('-5만'), -50000);
  assert.equal(parseWon(''), null); assert.ok(Number.isNaN(parseWon('abc')));
  assert.equal(fmtWon(1234567890, true), '12.3억원'); assert.equal(fmtWon(-25000000, true), '-2,500만원');
  assert.deepEqual(balanceCheck({ cur: { assets: 10, liab: 4, equity: 6 } }), { ok: true, diff: 0 });
});
