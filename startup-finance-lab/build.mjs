// 배포용 dist/ 생성: 공개 파일만 복사하고, OG·canonical 주소를 실제 배포 주소로 바꾼다.
// dist/ 폴더를 Netlify 'Deploys' 화면에 통째로 끌어다 놓으면 배포된다 (index.html 하나만 올리면 OG 이미지가 없어 카톡 미리보기가 안 뜸).
// Git 연동 빌드에서는 Netlify가 넣어 주는 URL 환경변수를, 다른 주소로 배포하면 SITE_URL을 쓴다.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const DEFAULT_SITE = 'https://beconic-diagnosis-startup-finance.netlify.app';
const site = (process.env.SITE_URL || process.env.URL || DEFAULT_SITE).replace(/\/+$/, '');
if (!/^https:\/\//.test(site)) {
  console.error(`❌ 배포 주소는 https 여야 합니다 (카카오톡 미리보기 조건): ${site}`);
  process.exit(1);
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
const html = readFileSync('index.html', 'utf8').split(DEFAULT_SITE).join(site);
writeFileSync('dist/index.html', html);
cpSync('manifest.webmanifest', 'dist/manifest.webmanifest');
cpSync('assets', 'dist/assets', { recursive: true });

// 드래그&드롭 배포는 netlify.toml 대신 _headers 파일로 보안·캐시 헤더를 적용한다
const toml = readFileSync('netlify.toml', 'utf8');
const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1];
writeFileSync('dist/_headers', [
  '/*',
  '  X-Frame-Options: DENY',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  csp ? '  Content-Security-Policy: ' + csp : '',
  '',
  '/index.html',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=604800',
  ''
].filter(l => l !== null).join('\n'));

// 카카오톡 미리보기에 필요한 파일이 실제로 들어갔는지 확인
const ogPath = (html.match(/property="og:image" content="([^"]+)"/) || [])[1] || '';
const ogFile = 'dist' + ogPath.replace(site, '');
if (!ogPath.startsWith(site + '/') || !existsSync(ogFile)) {
  console.error(`❌ OG 이미지가 배포 폴더에 없습니다: ${ogPath}`);
  process.exit(1);
}
console.log(`✅ dist 생성 완료 · 공유 주소 ${site} · 미리보기 이미지 ${ogPath}`);
