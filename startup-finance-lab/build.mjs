// 배포용 dist/ 생성: 공개 파일만 복사하고, OG·canonical 주소를 실제 배포 주소로 바꾼다.
// Netlify는 빌드 때 URL(대표 주소) 환경변수를 넣어 준다. 다른 주소로 배포하면 SITE_URL로 지정.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const DEFAULT_SITE = 'https://beconic-startup-lab.netlify.app';
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
console.log(`✅ dist 생성 완료 · 공유 주소 ${site}`);
