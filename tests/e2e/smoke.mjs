// E2E 스모크: dist 빌드본을 실제 Chromium으로 열어 흐름·콘솔 에러·레이아웃·PDF를 검사한다.
// 사용: npm run build && npm run test:e2e   (결과 이미지·PDF: tests/e2e/out/)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const OUT = 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const URL = `http://localhost:${server.address().port}/`;

const VIEWPORTS = [[375, 812], [390, 844], [430, 932], [1366, 768], [1440, 900], [1920, 1080]];
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();

async function openPage(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  page.on('requestfailed', (r) => errors.push(`요청 실패 ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  return { page, errors };
}

// 1) 뷰포트별: 가로 스크롤·콘솔 에러·샘플기업 결과 렌더
for (const [w, h] of VIEWPORTS) {
  const { page, errors } = await openPage(w, h);
  await page.getByRole('button', { name: '샘플기업' }).click();
  await page.evaluate(() => window.navTo(5));
  await page.waitForSelector('#summary');
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!hscroll, `${w}px: 가로 스크롤 발생`);
  check(errors.length === 0, `${w}px: 콘솔 에러 ${JSON.stringify(errors)}`);
  await page.waitForFunction(() => /원문 색인/.test(document.querySelector('#roadmapfit')?.textContent || ''));
  const txt = await page.textContent('#roadmapfit');
  check(!/POC 적합성|높음|중간/.test(txt), `${w}px: 로드맵 후보에 검증 전 적합도 등급 노출`);
  // D4: 원문 색인 품목·쪽 번호 (샘플기업 = 스마트제조 예지보전)
  check(/SMESTR-2025-B-03-08/.test(txt) && /p\.271/.test(txt), `${w}px: 원문 색인 후보(품목코드·쪽) 미표시`);
  if (w === 375 || w === 1440) await page.screenshot({ path: `${OUT}/result-${w}.png`, fullPage: false });
  await page.close();
}

// 1-b) 푸터 버전·업데이트 일자 표기
{
  const { page } = await openPage(1440, 900);
  const label = await page.textContent('[data-build-version]');
  check(/^v\d+\.\d+\.\d+ · \d{4}\.\d{2}\.\d{2} 업데이트$/.test(label.trim()), `푸터 버전 표기 형식 오류: ${label}`);
  await page.close();
}

// 2) 누락 CSS 보완 확인 (진단방식 선택 버튼)
{
  const { page } = await openPage(1440, 900);
  const radius = await page.$eval('.choice', (e) => getComputedStyle(e).borderRadius);
  check(radius === '999px', `.choice 스타일 미적용 (${radius})`);
  await page.close();
}

// 3) 전부 모름: 크래시 없이 '판단 보류' 표시
{
  const { page, errors } = await openPage(1440, 900);
  await page.evaluate(() => { localStorage.clear(); window.navTo(5); });
  await page.waitForSelector('#summary');
  const txt = await page.textContent('#summary');
  check(/판단 보류/.test(txt), '전부 모름: 판단 보류 미표시');
  check(errors.length === 0, `전부 모름: 콘솔 에러 ${JSON.stringify(errors)}`);
  const pr = await page.textContent('#printReport');
  check(/판단 보류/.test(pr), '전부 모름: PDF에 판단 보류 미표시');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/report-all-unknown.pdf`, format: 'A4', printBackground: true });
  await page.close();
}

// 4) PDF (A4) — 샘플기업
{
  const { page, errors } = await openPage(1440, 900);
  await page.getByRole('button', { name: '샘플기업' }).click();
  await page.evaluate(() => window.navTo(5));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/report-sample.pdf`, format: 'A4', printBackground: true });
  const pages = await page.evaluate(() => document.querySelectorAll('#printReport .pr-page').length);
  check(pages === 14, `PDF 섹션 수 ${pages} (기대 14)`);
  const pr = await page.textContent('#printReport');
  check(/Scoring rule-v1\.0/.test(pr), 'PDF에 Scoring 버전 누락');
  check(/AI 설비 예지보전 솔루션/.test(pr) && /원문 p\.271/.test(pr), 'PDF 로드맵 정렬에 원문 색인 후보 누락');
  check(/Roadmap KB index-kb-v2/.test(pr), 'PDF에 Roadmap KB 버전 누락');
  check(/App v\d+\.\d+\.\d+ · \d{4}\.\d{2}\.\d{2} 업데이트/.test(pr), 'PDF에 앱 버전·업데이트 일자 누락');
  check(/그로스벤처스/.test(pr) && /제2025-684호/.test(pr), 'PDF에 발행사·인증번호 누락');
  const logoOk = await page.$eval('#printReport .cover-logo', (i) => i.complete && i.naturalWidth > 0);
  check(logoOk, 'PDF 표지 로고 로드 실패');
  check(errors.length === 0, `PDF: 콘솔 에러 ${JSON.stringify(errors)}`);
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error('❌ E2E 실패\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`✅ E2E 통과 (뷰포트 ${VIEWPORTS.length}개, 전부 모름, CSS, PDF)`);
