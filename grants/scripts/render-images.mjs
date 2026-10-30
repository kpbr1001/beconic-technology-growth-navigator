// 미리보기(OG)·카카오 챗봇 썸네일을 design/*.html 원본에서 다시 만든다(Pretendard 글꼴 로드 확인 후 캡처).
// 실행: node scripts/render-images.mjs   (Chromium 필요 — CHROME_PATH로 경로 지정 가능)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => pathToFileURL(path.join(root, 'design', f)).href;
const JOBS = [
  { url: src('og.html'), out: 'assets/og-grant-matching-1200x630.jpg', w: 1200, h: 630, type: 'jpeg' },
  ...['match', 'consult', 'finance', 'hr', 'tech', 'growth'].map((k) => (
    { url: `${src('kakao-card.html')}#${k}`, out: `assets/kakao/${k}.png`, w: 800, h: 400, type: 'png' }))
];

mkdirSync(path.join(root, 'assets/kakao'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (const j of JOBS) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h } });
  await page.goto(j.url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('800 40px Pretendard') && document.fonts.check('700 20px Pretendard'));
  if (!ok) { console.error(`❌ Pretendard 글꼴을 불러오지 못함: ${j.url}`); process.exit(1); }
  await page.screenshot({ path: path.join(root, j.out), type: j.type, ...(j.type === 'jpeg' ? { quality: 90 } : {}) });
  console.log(`✅ ${j.out}`);
  await page.close();
}
await browser.close();
