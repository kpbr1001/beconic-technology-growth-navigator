// 표준재무제표 추출·지표 — 형식 변형·부호·단위·0/음수 처리.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatements, parseFile, mergeParsed, normalizeFin, filledYears, fiscalYear, isStatement, yearRows, finStory, indicators, parseWon, fmtWon, balanceCheck } from '../src/fin.js';

test('추출: 로마 숫자·코드·글자 간격·괄호/△ 음수(공백 분리 포함)·당기/전기', () => {
  const r = parseStatements(['표준손익계산서', '코드 계정과목 당기 전기', '1000 Ⅰ. 매 출 액 1,200,000,000 800,000,000', 'Ⅳ. 영업이익(손실) ( 120,000,000 ) △ 50,000,000', '당기순이익(손실) -150,000,000 -60,000,000', '(1) 자산총계 900,000,000', '부채총계 600,000,000', '자본총계 300,000,000']);
  assert.equal(r.cur.rev, 1200000000); assert.equal(r.prev.rev, 800000000);
  assert.equal(r.cur.op, -120000000); assert.equal(r.prev.op, -50000000); assert.equal(r.cur.net, -150000000);
  assert.equal(r.cur.assets, 900000000); assert.equal(r.unit, 1);
});
test('단위 천원 → 원, 손실 계정명은 양수도 손실', () => {
  const r = parseStatements(['표 준 손 익 계 산 서', '(단위: 천원)', '매출액 1,000', '영업손실 300']);
  assert.equal(r.unit, 1000); assert.equal(r.cur.rev, 1000000); assert.equal(r.cur.op, -300000);
});
test('없는 계정은 비움', () => { const r = parseStatements(['재무상태표', '매출액 5,000']); assert.equal(r.cur.liab, undefined); assert.deepEqual(Object.keys(r.found), ['rev']); });
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

test('재무제표 판별: 표제(손익계산서·재무상태표)가 없으면 읽지 않음', () => {
  assert.equal(isStatement('사업계획서 매출액 1,000,000'), false);
  const r = parseStatements(['IR 덱', '매출액 3,000,000,000', '영업이익 500,000,000']);
  assert.equal(r.isFS, false); assert.deepEqual(r.cur, {});
  assert.deepEqual(parseFile(['투자 제안서', '매출액 01 1,000,000']), []);
});
test('계정 코드(01·228)는 금액이 아님, 원 단위에서 1~3자리 숫자는 무시', () => {
  const r = parseStatements(['표준손익계산서', '매출액 01 120,000,000', '영업손실 02 (90,000,000)', '자산총계 228 500,000,000', '부채총계 7']);
  assert.equal(r.cur.rev, 120000000); assert.equal(r.prev.rev, undefined); assert.equal(r.cur.op, -90000000); assert.equal(r.cur.assets, 500000000); assert.equal(r.cur.liab, undefined);
});
test('사업연도: 기간 끝 연도·"현재" 표기, 발급일 무시', () => {
  assert.equal(fiscalYear('사업연도 2024년 01월 01일 부터 2024년 12월 31일 까지 발급일 2026.03.02'), '2024');
  assert.equal(fiscalYear('2025.01.01 ~ 2025.12.31'), '2025');
  assert.equal(fiscalYear('제5기 2025년 12월 31일 현재'), '2025');
  assert.equal(fiscalYear('발급일 2026년 3월 2일'), '');
});
test('한 파일에 여러 해: 연도별로 나눠 읽음', () => {
  const ps = parseFile(['표준재무상태표', '사업연도 2025년 01월 01일부터 2025년 12월 31일까지', '자산총계 500,000,000', '표준손익계산서', '사업연도 2025년 01월 01일부터 2025년 12월 31일까지', '매출액 120,000,000',
    '표준재무상태표', '사업연도 2024년 01월 01일부터 2024년 12월 31일까지', '자산총계 400,000,000', '표준손익계산서', '사업연도 2024년 01월 01일부터 2024년 12월 31일까지', '매출액 80,000,000']);
  assert.deepEqual(ps.map((p) => [p.year, p.cur.rev, p.cur.assets]), [['2025', 120000000, 500000000], ['2024', 80000000, 400000000]]);
});
test('3개년 배치: 연도 기준(순서 무관)·더 최근 해가 오면 뒤로 밀기·문서의 전기는 빈 칸만', () => {
  const P = (year, cur, prev = {}) => ({ isFS: true, year, cur, prev, found: {}, unit: 1 });
  let d = { y0: '', cur: {}, prev: {}, pp: {} };
  ({ draft: d } = mergeParsed(d, P('2024', { rev: 80 }, { rev: 30 })));
  assert.equal(d.y0, '2024'); assert.equal(d.cur.rev, 80); assert.equal(d.prev.rev, 30);
  const m = mergeParsed(d, P('2025', { rev: 120 }, { rev: 999 })); d = m.draft;
  assert.equal(m.slot, 0); assert.equal(d.y0, '2025'); assert.deepEqual([d.cur.rev, d.prev.rev, d.pp.rev], [120, 80, 30]); // 이미 있는 전년도 값은 덮지 않음
  assert.equal(mergeParsed(d, P('2021', { rev: 1 })).slot, -1); // 3개년 밖
  assert.equal(mergeParsed(d, P('2023', { rev: 31 })).draft.pp.rev, 31); // 같은 해 다시 올리면 교체
  // 연도 미상: 빈 칸부터
  let e = { y0: '', cur: {}, prev: {}, pp: {} };
  e = mergeParsed(e, P('', { rev: 5 })).draft; e = mergeParsed(e, P('', { rev: 4 })).draft;
  assert.deepEqual([e.cur.rev, e.prev.rev], [5, 4]);
});
test('정리: 최근 연도가 비면 앞으로 당기고 연도도 맞춤, 개년 수', () => {
  const f = normalizeFin({ y0: '2025', cur: {}, prev: { rev: 10 }, pp: { rev: 5 } });
  assert.deepEqual([f.y0, f.cur.rev, f.prev.rev, Object.keys(f.pp).length], ['2024', 10, 5, 0]);
  assert.equal(filledYears(f), 2); assert.equal(filledYears(null), 0);
});
test('3개년 지표·연도표·해석 문장', () => {
  const fin = { y0: '2025', cur: { rev: 120, op: -90, equity: 310, liab: 210 }, prev: { rev: 80, op: -110 }, pp: { rev: 30, op: -70 } };
  const ind = indicators(fin);
  assert.equal(ind.find((x) => x.k === 'growth').value, 50); assert.equal(ind.find((x) => x.k === 'cagr').value, 100);
  const rows = yearRows(fin); assert.deepEqual(rows.map((r) => r.label), ['최근 연도(2025년)', '전년도(2024년)', '전전년도(2023년)']);
  const s = finStory(fin).join(' ');
  assert.match(s, /3개년 연속 늘었어요/); assert.match(s, /전년도보다 줄었어요/);
  assert.equal(yearRows({ cur: {}, prev: {}, pp: {} }).length, 0); assert.deepEqual(finStory(null), []);
});
