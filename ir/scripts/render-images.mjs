// 예비 OG 이미지(텍스트형)를 design/og.html 원본에서 만든다(Pretendard 로드 확인 후 캡처).
// 현재 사이트 OG는 대표 제공 배너(assets/og-ir-banner-1200x630.jpg)이며, 이 스크립트는 그 파일을 덮어쓰지 않는다.
// 실행: npm run images   (Chromium 필요 — CHROME_PATH로 경로 지정 가능)
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(path.join(root, 'design/og.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const ok = await page.evaluate(() => document.fonts.check('800 40px Pretendard') && document.fonts.check('700 20px Pretendard'));
if (!ok) { console.error('❌ Pretendard 글꼴을 불러오지 못함'); process.exit(1); }
await page.screenshot({ path: path.join(root, 'design/og-text-1200x630.jpg'), type: 'jpeg', quality: 90 });
console.log('✅ design/og-text-1200x630.jpg (예비본)');
await browser.close();
