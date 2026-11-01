// 카카오톡·SNS 미리보기(OG) 이미지를 design/og.html 원본에서 다시 만든다(Pretendard 로드 확인 후 캡처).
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
await page.screenshot({ path: path.join(root, 'assets/og-ir-diagnosis-1200x630.jpg'), type: 'jpeg', quality: 90 });
console.log('✅ assets/og-ir-diagnosis-1200x630.jpg');
await browser.close();
