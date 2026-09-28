// PDF 검수용 A4 PDF 생성: v0.9 원본과 신규 빌드를 같은 시나리오로 출력한다.
// 사용: npm run build && node tests/e2e/pdf-generate.mjs && python3 tests/e2e/pdf_qa.py
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const OUT = 'tests/e2e/out/pdf';
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const p = url.startsWith('/v09') ? 'reference/BECONIC_Technology_Growth_Navigator_v0.9.html' : join('dist', url.replace(/\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;

const LONG = '초정밀 반도체 후공정 웨이퍼 레벨 패키징용 AI 기반 비전검사·공정제어 통합 플랫폼';
// 시나리오: sample(샘플기업) · allUnknown(자료 없는 대표) · stress(긴 기업명·긴 기술명 12개·긴 서술) · 모바일(390px) 입력 후 출력

async function makePdf(label, url, scenario, width = 1440) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => { window.print = () => {}; });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  if (scenario === 'sample' || scenario === 'stress') await page.getByRole('button', { name: '샘플기업' }).click();
  if (scenario === 'stress') {
    // 화면 입력으로 긴 값 주입: 1단계 입력 → 기술 발견 → 핵심기술 목록에 긴 이름 행을 추가
    await page.evaluate(() => window.navTo(0));
    await page.fill('#companyName', '주식회사 가나다라마바사아자차카타파하 글로벌 테크놀로지 솔루션즈 코리아');
    await page.fill('#product', LONG.repeat(3));
    await page.evaluate(() => window.navTo(1));
    await page.fill('#d_hardPart', LONG);
    await page.fill('#d_data', LONG.repeat(2));
    await page.evaluate(() => window.navTo(5));
    // 핵심기술 12개(긴 이름)를 localStorage 경유로 주입 후 재로딩
    await page.evaluate((LONG) => {
      window.saveState();
      const s = JSON.parse(localStorage.getItem('beconic_tgn_v09'));
      s.inventory = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `${LONG} 모듈 ${i + 1}`, type: '핵심기술', ownership: i % 2 ? '외부' : '자체', status: '확정', critical: true, trl: [2, 4, 6, 7, 8, 9][i % 6], confirmed: true }));
      s.step = 5;
      localStorage.setItem('beconic_tgn_v09', JSON.stringify(s));
    }, LONG);
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.evaluate(() => window.navTo(5));
  await page.emulateMedia({ media: 'print' });
  const path = `${OUT}/${label}-${scenario}${width < 800 ? '-mobile' : ''}.pdf`;
  await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  return path;
}

for (const sc of ['sample', 'allUnknown', 'stress']) {
  console.log(await makePdf('v09', `${BASE}/v09`, sc));
  console.log(await makePdf('new', `${BASE}/`, sc));
}
console.log(await makePdf('new', `${BASE}/`, 'sample', 390));
server.close();
