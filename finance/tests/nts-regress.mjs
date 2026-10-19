/* global clearAll, applyAll, V, S -- page.evaluate 안에서 앱 전역 함수를 호출 */
// 실제 홈택스 표준재무제표증명 PDF 회귀 검사 (로컬 전용 — 실제 PDF·금액은 저장소에 두지 않는다)
// 기대값은 저장하지 않고, poppler `pdftotext -layout`으로 독립 추출한 [코드·금액]을 오라클로 삼아 앱 추출값과 대조한다.
// 실행: node finance/tests/nts-regress.mjs <증명서1.pdf> <증명서2.pdf> ... [--base http://127.0.0.1:8790/]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const BASE = bi >= 0 ? args.splice(bi, 2)[1] : 'http://127.0.0.1:8790/';
const files = args;
if (!files.length) { console.log('사용법: node nts-regress.mjs <pdf...>'); process.exit(2); }

// 앱과 독립적으로 유지하는 오라클 코드표(일반법인용)
const CODES = {
  bs: { '001': 'currentAssets', '003': 'cash', '009': 'tradeReceivables', '044': 'inventory', '080': 'noncurrentAssets', '228': 'assets', '229': 'currentLiabilities', '234': 'shortTermBorrowings', '236': 'insiderBorrowings', '238': 'otherPayables', '284': 'noncurrentLiabilities', '289': 'longTermBorrowings', '333': 'liabilities', '334': 'paidInCapital', '372': 'retainedEarnings', '382': 'equity' },
  is: { '001': 'revenue', '035': 'costOfSales', '066': 'grossProfit', '067': 'sga', '129': 'operatingIncome', '180': 'interestExpense', '219': 'netIncome' },
};
function oracle(file) {
  const pages = execFileSync('pdftotext', ['-layout', file, '-']).toString().split('\f');
  const out = { year: null, values: {} };
  for (const pg of pages) {
    const c = pg.replace(/\s/g, '');
    const type = c.includes('표준재무상태표') && !c.includes('표준손익계산서') ? 'bs' : c.includes('표준손익계산서') && !c.includes('표준재무상태표') ? 'is' : null;
    const y = c.match(/(20\d{2})년\d{1,2}월\d{1,2}일(?:현재|까지)/);
    if (y) out.year = +y[1];
    if (!type) continue;
    for (const m of pg.matchAll(/(\S[^\n]*?)\s+(\d{3})\s+(-?[\d,]+)(?=\s|$)/g)) {
      const k = CODES[type][m[2]];
      if (k && !(k in out.values)) out.values[k] = Number(m[3].replace(/,/g, ''));
    }
  }
  return out;
}

const truth = files.map((f) => ({ file: f, ...oracle(f) }));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(BASE);
const maxY = Math.max(...truth.map((t) => t.year));
await page.evaluate((y) => { clearAll(); S.baseYear = y; S.org.name = ''; }, maxY);
await page.setInputFiles('#fileIn', files.map((f) => ({ name: path.basename(f), mimeType: 'application/pdf', buffer: readFileSync(f) })));
await page.waitForFunction((n) => S.pending.length === n, files.length, { timeout: 60000 });
await page.evaluate(() => applyAll());
let total = 0, okc = 0;
const bad = [];
for (const t of truth) {
  for (const [k, v] of Object.entries(t.values)) {
    total++;
    const got = await page.evaluate(([y, kk]) => V(y, kk), [t.year, k]);
    if (got === v) okc++; else bad.push(`${path.basename(t.file)} ${t.year} ${k}: 앱 ${got === null ? '없음' : '값 다름'}`);
  }
}
const vs = await page.locator('#vcards').innerText();
console.log(`오라클 대비 일치 ${okc}/${total} · 대차 검증 통과 ${(vs.match(/검증 통과/g) || []).length}/${truth.length}`);
bad.forEach((b) => console.log('❌ ' + b));
await browser.close();
process.exit(bad.length ? 1 : 0);
