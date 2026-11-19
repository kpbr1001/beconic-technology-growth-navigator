// 아이콘·OG 이미지 생성: node scripts/render-images.mjs (Playwright Chromium 필요)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = 'data:image/png;base64,' + readFileSync(path.join(root, 'assets/logo.png')).toString('base64');
const font = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">`;
const icon = (size, pad) => `<html><head>${font}</head><body style="margin:0"><div style="width:${size}px;height:${size}px;background:#fff;display:flex;align-items:center;justify-content:center">
  <div style="width:${size - pad * 2}px;height:${size - pad * 2}px;border-radius:${(size - pad * 2) * .24}px;background:#1f6fe8;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:'Pretendard Variable';">
  <svg viewBox="0 0 24 24" width="${(size - pad * 2) * .5}" height="${(size - pad * 2) * .5}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg></div></div></body></html>`;
const og = `<html><head>${font}</head><body style="margin:0"><div style="width:1200px;height:630px;background:#f2f4f6;font-family:'Pretendard Variable';display:flex;padding:72px;box-sizing:border-box;gap:56px;align-items:center">
 <div style="flex:1"><div style="display:flex;align-items:center;gap:12px;font-size:26px;font-weight:800;color:#191f28"><img src="${logo}" style="width:48px;height:48px;border-radius:12px">BECONIC 창업 준비 가이드</div>
 <div style="font-size:64px;font-weight:800;line-height:1.25;letter-spacing:-2px;color:#191f28;margin-top:34px">업종만 고르면<br><span style="color:#3182f6">창업 준비물</span>이<br>정리돼요</div>
 <div style="font-size:26px;color:#4e5968;margin-top:26px;font-weight:600">서류 · 인허가 순서 · 업종코드 · 세금 혜택 · 기준일 표기</div></div>
 <div style="width:380px;background:#fff;border-radius:32px;padding:34px;box-shadow:0 8px 30px rgba(0,27,55,.08)">
  <div style="font-size:20px;color:#5f6b7a;font-weight:700">카페·커피전문점</div><div style="font-size:56px;font-weight:800;color:#3182f6;margin:6px 0">60%</div>
  <div style="height:10px;border-radius:9px;background:#e5e8eb"><div style="width:60%;height:10px;border-radius:9px;background:#3182f6"></div></div>
  ${['위생교육 이수', '보건증 발급', '영업신고', '사업자등록'].map((t, i) => `<div style="display:flex;align-items:center;gap:14px;font-size:22px;font-weight:700;margin-top:${i ? 16 : 26}px;color:${i < 2 ? '#8b95a1' : '#191f28'}"><span style="width:28px;height:28px;border-radius:50%;${i < 2 ? 'background:#3182f6' : 'border:3px solid #c5ccd3;box-sizing:border-box'}"></span>${t}</div>`).join('')}
 </div></div></body></html>`;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage();
for (const [name, size, pad] of [['icon-512.png', 512, 0], ['icon-192.png', 192, 0], ['icon-180.png', 180, 0], ['icon-32.png', 32, 0], ['icon-512-maskable.png', 512, 64]]) {
  await p.setViewportSize({ width: size, height: size }); await p.setContent(icon(size, pad)); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(root, 'assets', name), omitBackground: false });
}
await p.setViewportSize({ width: 1200, height: 630 }); await p.setContent(og, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
await p.screenshot({ path: path.join(root, 'assets/og-pre-startup-1200x630.jpg'), type: 'jpeg', quality: 88 });
await b.close();
console.log('images ok');
