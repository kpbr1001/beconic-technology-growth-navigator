// PDF QA — v2.0 §09 8개 시나리오를 실제 Chromium 인쇄(page.pdf, print CSS)로 출력하고
// 페이지 수·텍스트(면책·출처)·폰트 임베딩·버튼 노출을 검사한다. 페이지 PNG는 육안 검수용으로 저장.
// 사용: node tests/pdf.mjs [http://127.0.0.1:8797/]  → qa-out/pdf/*.pdf, *-p*.png, pdf-summary.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8797/';
const OUT = join(ROOT, 'qa-out', 'pdf');
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

// v2 도우미: 인증 고르기 → 구간 버튼으로 답하기 → 결과
const choose = async (p, n, v) => { const el = p.locator(`label.chip:has(> input[name="${n}"][value="${v}"])`); await el.evaluate((x) => x.scrollIntoView({ block: 'center' })); await el.click(); };
async function open(w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date('2026-11-22T03:00:00Z'));
  await p.goto(BASE); await p.waitForFunction(() => document.getElementById('app').getAttribute('aria-busy') === 'false');
  return p;
}
async function pick(p, ids) { for (const id of ids) { await p.goto(`${BASE}#/scheme/${id}`); await p.click('[data-act="pick-go"]'); await p.waitForSelector('form[data-form="answer"]'); } }
async function profile(p, name = '주식회사 비코닉테스트') {
  await p.fill('#q-company_name', name); await p.dispatchEvent('#q-company_name', 'input');
  // 공통 질문은 고른 인증이 쓰는 것만 나온다(v2.1) — 화면에 있는 것만 답한다
  const chooseIf = async (n, v) => { if (await p.locator(`input[name="${n}"]`).count()) await choose(p, n, v); };
  await choose(p, 'biz_status', 'corporation'); await chooseIf('founded_on', 'r:3:7');
  await chooseIf('converted_from_individual', 'no'); await chooseIf('suspended_period', 'no');
  await chooseIf('is_sme', 'yes'); await chooseIf('company_size', 'small'); await chooseIf('industry', 'software_582');
}
async function toResult(p) { await p.goto(`${BASE}#/result`); await p.waitForSelector('#result-title'); }

const SCEN = [
  { id: 'S1-domestic-full', title: '국내 단일인증·모든 값 입력', run: async (p) => {
    await pick(p, ['VEN']); await profile(p);
    await choose(p, 'ven_excluded_industry', 'no'); await choose(p, 'ven_invest_total', 'r:5000:'); await choose(p, 'ven_invest_ratio', 'r:10:');
    await choose(p, 'ven_culture_producer', 'no'); await choose(p, 'ven_qualified_investor', 'yes'); await choose(p, 'rnd_unit', 'institute');
    await choose(p, 'ven_rd_spend', 'r:5000:'); await choose(p, 'ven_revenue', 'r:1:500000'); await choose(p, 'ven_rd_ratio', 'r:10:'); await toResult(p);
  } },
  { id: 'S2-overseas-unknown', title: '해외 제품규제·필수 정보 미상', run: async (p) => {
    await pick(p, ['EU-CE', 'US-FDA-DEV', 'US-FCC']);
    await choose(p, 'biz_status', 'corporation'); await choose(p, 'markets', 'EU'); await choose(p, 'markets', 'US'); await choose(p, 'product_categories', 'unknown');
    await toResult(p);
  } },
  { id: 'S3-three-schemes', title: '3개 인증 비교', run: async (p) => {
    await pick(p, ['VEN', 'INNO', 'RNDI']); await profile(p);
    await choose(p, 'ven_excluded_industry', 'no'); await choose(p, 'ven_invest_total', 'r:0:0');
    await choose(p, 'x_credit', 'no'); await choose(p, 'x_dishonor', 'no'); await choose(p, 'x_insolvency', 'none'); await choose(p, 'x_violation', 'no');
    await choose(p, 'rnd_researchers', 'r:2:3'); await choose(p, 'rnd_space', 'partition'); await choose(p, 'rnd_space_over50_impossible', 'yes'); await choose(p, 'rnd_equipment', 'yes'); await choose(p, 'rnd_excluded_field', 'no'); await choose(p, 'rnd_is_venture', 'no');
    await toResult(p);
  } },
  { id: 'S4-long-text', title: '긴 기업명·긴 기관명·긴 URL·최대 길이 입력', run: async (p) => {
    await pick(p, ['RNDI', 'US-FDA-FOOD']);
    await profile(p, '가나다라마바사아자차카타파하'.repeat(5).slice(0, 60));
    await choose(p, 'markets', 'US'); await choose(p, 'product_categories', 'food'); await choose(p, 'trade_role', 'manufacturer');
    await p.fill('#q-intended_use', '장기 보관이 가능한 동결건조 한식 간편식으로 미국 현지 대형마트와 온라인몰에서 판매할 예정이며 성분 표시와 알레르기 정보가 필요한 제품'.slice(0, 120)); await p.dispatchEvent('#q-intended_use', 'input');
    await toResult(p);
  } },
  { id: 'S5-unknown-majority', title: 'UNKNOWN 절반 이상', run: async (p) => {
    await pick(p, ['MAIN', 'RNDD']); await choose(p, 'biz_status', 'corporation');
    await p.$$eval('form[data-form="answer"] .q:not([hidden]) label.chip:has(> input[value="unknown"])', (e) => e.forEach((x) => x.click()));
    await toResult(p);
  } },
  { id: 'S6-no-judgement', title: '자동 판정 0건(정보형만)', run: async (p) => {
    await pick(p, ['WOMEN', 'FAMILY', 'GS-CERT']); await profile(p); await toResult(p);
  } },
  { id: 'S7-evidence-20', title: '신청서류 20건 이상(3개 인증)', run: async (p) => {
    await pick(p, ['VEN', 'INNO', 'MAIN']); await profile(p);
    await choose(p, 'ven_invest_total', 'r:5000:'); await choose(p, 'ven_invest_ratio', 'r:7:10'); await choose(p, 'rnd_unit', 'dept'); await toResult(p);
  } },
  { id: 'S8-mobile', title: '모바일(390px) 진입 후 PDF', w: 390, run: async (p) => {
    await p.goto(`${BASE}#/select`); await p.waitForSelector('#cards');
    for (const id of ['VEN', 'RNDI']) await p.click(`[data-act="pick"][data-id="${id}"]`);
    await p.click('#mbar [data-act="go-answer"]'); await p.waitForSelector('form[data-form="answer"]');
    await profile(p); await toResult(p);
  } },
];

const summary = [];
for (const sc of SCEN.filter((x) => !process.env.SCEN || x.id.startsWith(process.env.SCEN))) {
  const p = await open(sc.w);
  try { await sc.run(p); } catch (e) { await p.screenshot({ path: join(OUT, `${sc.id}-FAIL.png`), fullPage: true }); console.log(`❌ ${sc.id} 진행 실패: ${e.message.split('\n')[0]} (url ${p.url()})`); summary.push({ id: sc.id, ok: false, error: e.message.split('\n')[0] }); await p.context().close(); continue; }
  await p.goto(`${BASE}#/result`); await p.waitForSelector('#result-title');
  const screenStatus = await p.$$eval('.rc .rc-h .badge', (e) => e.map((x) => x.textContent.trim()));
  const screenHead = (await p.textContent('#result-title')).trim();
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await p.emulateMedia({ media: 'print' });
  await p.evaluate(() => document.fonts.ready);
  const file = join(OUT, `${sc.id}.pdf`);
  await p.pdf({ path: file, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await p.context().close();
  const info = execFileSync('pdfinfo', [file]).toString();
  const pages = Number(info.match(/Pages:\s+(\d+)/)[1]);
  const text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
  const fonts = execFileSync('pdffonts', [file]).toString().split('\n').slice(2).filter(Boolean);
  const notEmbedded = fonts.filter((l) => / no /.test(l.slice(60)));
  execFileSync('pdftoppm', ['-r', '60', '-png', file, join(OUT, sc.id)]);
  const checks = {
    disclaimer: text.includes('관계 법령과 관할기관의 심사에 따릅니다'),
    sources: text.includes('참조 규정·공식 근거'),
    execSummary: text.includes('Executive Summary'),
    noButtons: !/(PDF 보고서 저장|답 고치기|HTML 저장|문구 수정 켜기)/.test(text),
    feesSection: text.includes('신청서류와 공식 링크') && text.includes('공식 수수료'),
    noHolding: !/보유 여부|자가응답 기준|있음\s+필수/.test(text),
    notEdited: !text.includes('편집본 —'),
    headlineMatch: text.replace(/\s+/g, '').includes(screenHead.replace(/\s+/g, '')),
    companyOk: sc.id === 'S6-no-judgement' || text.includes('비코닉테스트') || text.includes('기업명 미입력') || text.includes('가나다라'),
    statusMatch: screenStatus.every((s) => text.replace(/\s+/g, '').includes(s.replace(/\s+/g, ''))),
    fontsEmbedded: notEmbedded.length === 0,
    korean: /[가-힣]{4}/.test(text),
  };
  const ok = Object.values(checks).every(Boolean);
  summary.push({ id: sc.id, title: sc.title, pages, checks, ok, fonts: fonts.map((l) => l.split(/\s+/)[0]).slice(0, 4), screenStatus });
  console.log(`${ok ? '✅' : '❌'} ${sc.id} (${sc.title}) — ${pages}쪽 ${ok ? '' : JSON.stringify(checks)}`);
}
await browser.close();
writeFileSync(join(OUT, 'pdf-summary.json'), JSON.stringify(summary, null, 2));
console.log(`PNG ${readdirSync(OUT).filter((f) => f.endsWith('.png')).length}장 → ${OUT}`);
process.exit(summary.every((s) => s.ok) ? 0 : 1);
