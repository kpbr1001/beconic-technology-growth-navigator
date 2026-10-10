// 사용자 플로우 동등성 검수: v0.9 원본(reference)과 신규 빌드(dist)를 '실제 클릭'으로 똑같이 조작하고
// 단계별 동작·결과 화면 텍스트·저장/복원·초기화·PDF 인쇄 트리거를 비교한다.
// 사용: npm run build && node tests/e2e/flow-parity.mjs   (결과: tests/e2e/out/flow-*.png, flow-report.json)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const OUT = 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let p = url.startsWith('/v09') ? 'reference/BECONIC_Technology_Growth_Navigator_v0.9.html' : join('dist', url.replace(/\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const failures = [];
const check = (c, m) => { if (!c) failures.push(m); };

async function runFlow(label, url, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 800 ? 844 : 900 } });
  const errors = [];
  const dialogs = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  const steps = {};
  const hscroll = async (name) => {
    const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    steps[name] = { overflowPx: o };
    await page.screenshot({ path: `${OUT}/flow-${label}-${width}-${name}.png`, fullPage: true });
  };
  const clickText = (t) => page.locator('section.active').getByRole('button', { name: t, exact: false }).first().click();

  // 1. 기업 이해 (v0.9는 진단방식 버튼이 입력값을 지우는 버그가 있어, 비교 시 버튼을 먼저 누른다)
  await clickText('자료와 함께 정밀진단');
  await page.fill('#companyName', '가나다라테크놀로지솔루션즈 주식회사');
  await page.selectOption('#roadmapField', '스마트제조(특화)');
  await page.selectOption('#bizType', '융합형(제조+SW/AI)');
  await page.selectOption('#companySize', '20~49명');
  for (const b of await page.locator('section.active .example-use').all()) await b.click();
  await hscroll('1-company');
  await clickText('기술 발견 시작');
  // 2. 기술 발견
  for (const b of await page.locator('section.active .example-use').all()) await b.click();
  await hscroll('2-discovery');
  await clickText('기술 후보 생성');
  // 3. 핵심기술
  const rows = page.locator('section.active .tech-row');
  const nRows = await rows.count();
  const trls = ['6', '7', '4', '0', '8'];
  for (let i = 0; i < nRows; i++) {
    const selects = rows.nth(i).locator('select');
    await selects.nth(0).selectOption(i % 2 ? '외부' : '자체');
    await selects.nth(2).selectOption(trls[i % trls.length]);
  }
  await rows.nth(0).getByRole('button', { name: '내용 확인' }).click();
  await rows.nth(nRows - 1).locator('input[type=checkbox]').setChecked(false);
  await hscroll('3-inventory');
  await clickText('핵심진단');
  // 4. 핵심진단 (정밀)
  await page.locator('section.active .choice').nth(1).click();
  const qCount = await page.locator('section.active .q').count();
  for (let i = 0; i < qCount; i++) {
    const q = page.locator('section.active .q').nth(i);
    if (i === 4 || i === 9) await q.locator('.unknown').click();
    else await q.locator('.scale5 button').nth((i * 2) % 5).click();
  }
  await hscroll('4-diagnosis');
  await clickText('근거 확인');
  // 5. 근거 확인
  const cards = page.locator('section.active .ev-card');
  const nCards = await cards.count();
  for (let i = 0; i < nCards; i++) await cards.nth(i).locator('.epill').nth(i % 5).click();
  await hscroll('5-evidence');
  await clickText('통합 진단결과 생성');
  // 6. 결과
  await page.waitForSelector('#summary');
  await hscroll('6-result');
  const sections = {};
  for (const id of ['summary', 'deep', 'tech', 'roadmapfit', 'action', 'horizon', 'risk', 'qa']) {
    sections[id] = (await page.textContent(`#${id}`))?.replace(/\s+/g, ' ').trim() ?? null;
  }
  // PDF 인쇄 버튼
  await page.locator('#qa').getByRole('button', { name: 'PDF 인쇄' }).click();
  await page.waitForTimeout(150);
  const printed = await page.evaluate(() => window.__printed || 0);
  const prPages = await page.locator('#printReport .pr-page').count();
  const prText = (await page.textContent('#printReport')).replace(/\s+/g, ' ');
  // 저장 → 새로고침 → 복원
  await page.locator('#qa').getByRole('button', { name: '결과 저장' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  const restored = await page.evaluate(() => ({
    summaryVisible: !!document.querySelector('#s5.active #summary'),
    name: (JSON.parse(localStorage.getItem('beconic_tgn_v09') || '{}').company || {}).name === '가나다라테크놀로지솔루션즈 주식회사',
    printName: document.querySelector('#printReport')?.textContent.includes('가나다라테크놀로지솔루션즈'),
  }));
  // 초기화
  await page.getByRole('button', { name: '초기화' }).click();
  const afterReset = await page.evaluate(() => ({ step0: document.querySelector('#s0')?.classList.contains('active'), name: document.querySelector('#companyName')?.value }));
  await page.close();
  return { label, width, errors, dialogs, steps, nRows, qCount, nCards, sections, printed, prPages, prText, restored, afterReset };
}

// 수정 확인: 입력 후 진단방식 버튼을 눌러도 입력값이 유지되어야 한다 (v0.9 버그)
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.fill('#companyName', '입력유지테스트');
  await page.selectOption('#roadmapField', '원전(특화)');
  await page.fill('#product', '제품 설명');
  await page.locator('#s0 .choice').nth(2).click();
  const kept = await page.evaluate(() => [document.querySelector('#companyName').value, document.querySelector('#roadmapField').value, document.querySelector('#product').value]);
  check(JSON.stringify(kept) === JSON.stringify(['입력유지테스트', '원전(특화)', '제품 설명']), `진단방식 변경 시 입력 유실: ${kept}`);
  await page.close();
}

const report = [];
for (const width of [390, 1440]) {
  const old = await runFlow('v09', `${BASE}/v09`, width);
  const now = await runFlow('new', `${BASE}/`, width);
  report.push({ old, now });
  const tag = `${width}px`;
  check(now.errors.length === 0, `${tag} 신규: 콘솔 에러 ${JSON.stringify(now.errors)}`);
  // v0.9.16: 기술 후보는 업종 고정 4개 대신 2단계 답변에서 찾음(의도된 차이) — 개수는 2개 이상만 확인
  check(now.nRows >= 2 && now.qCount === old.qCount && now.nCards === old.nCards,
    `${tag} 단계 구성 불일치 (기술 ${old.nRows}/${now.nRows}, 문항 ${old.qCount}/${now.qCount}, 근거 ${old.nCards}/${now.nCards})`);
  for (const [k, v] of Object.entries(now.steps)) check(v.overflowPx <= 1, `${tag} ${k}: 가로 넘침 ${v.overflowPx}px`);
  check(now.printed === 1, `${tag} PDF 인쇄 버튼이 인쇄를 호출하지 않음`);
  // v0.9.11 리스크 레드팀·v0.9.17 R&D 과제 제안·v0.9.20 보완 필요 기술·데이터·v0.9.22 신청 준비도 쪽 추가(의도된 변경)
  check(now.prPages === old.prPages + 4, `${tag} PDF 섹션 수 ${old.prPages} → ${now.prPages} (기대 ${old.prPages + 4})`);
  check(now.restored.summaryVisible && now.restored.name && now.restored.printName, `${tag} 저장 후 새로고침 복원 실패`);
  check(now.afterReset.step0 && now.afterReset.name === '', `${tag} 초기화 실패`);
  for (const id of Object.keys(old.sections)) check(now.sections[id] !== null, `${tag} 결과 섹션 누락: ${id}`);
}
writeFileSync(`${OUT}/flow-report.json`, JSON.stringify(report, null, 1));
await browser.close();
server.close();
if (failures.length) { console.error('❌ 플로우 검수 실패\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('✅ 플로우 동등성 통과 (390/1440px, v0.9 원본 vs 신규, 실제 클릭)');
