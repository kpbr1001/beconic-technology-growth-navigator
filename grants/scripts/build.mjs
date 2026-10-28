// 빌드: 공개 파일만 dist/ 로 복사한다(서버 함수 소스·문서·테스트는 공개 URL에 올리지 않음).
//   node scripts/build.mjs          → dist/ (Netlify 배포본)
//   node scripts/build.mjs --demo   → dist-demo/ 단일 HTML(스크립트·이미지 인라인, 파일로 열면 DEMO 데이터로 동작)
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const html = read('index.html').replaceAll('?v=dev', `?v=${version}`);
const appVer = read('app.js').match(/version:\s*'v([\d.]+)'/)?.[1];
if (appVer !== version) { console.error(`버전 불일치: package.json ${version} ≠ app.js v${appVer}`); process.exit(1); }

if (process.argv.includes('--demo')) {
  const out = path.join(root, 'dist-demo');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const b64 = (f) => `data:image/png;base64,${readFileSync(path.join(root, 'assets', f)).toString('base64')}`;
  const inline = (f) => `<script>\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`;
  const demo = html
    .replace(`<script src="data.js?v=${version}"></script>`, () => inline('data.js'))
    .replace(`<script src="app.js?v=${version}"></script>`, () => inline('app.js'))
    .replaceAll('href="assets/icon-32.png"', `href="${b64('icon-32.png')}"`)
    .replaceAll('href="assets/icon-180.png"', `href="${b64('icon-180.png')}"`)
    .replaceAll('src="assets/shield.png"', `src="${b64('shield.png')}"`);
  if (/src="(?:data|app)\.js/.test(demo) || /"assets\/(?:icon|shield)/.test(demo)) { console.error('인라인 실패'); process.exit(1); }
  const file = path.join(out, `beconic-grant-match-demo-v${version}.html`);
  writeFileSync(file, demo);
  console.log(`✅ 데모 단일본 ${path.relative(root, file)} (${(demo.length / 1024).toFixed(0)}KB)`);
} else {
  const out = path.join(root, 'dist');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'index.html'), html);
  for (const f of ['app.js', 'data.js']) cpSync(path.join(root, f), path.join(out, f));
  cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
  console.log(`✅ dist/ v${version} (index.html · app.js · data.js · assets/)`);
}
