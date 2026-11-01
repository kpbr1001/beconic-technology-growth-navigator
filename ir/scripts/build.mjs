// 빌드: 공개 파일만 dist/ 로 복사한다(문서·테스트·디자인 원본은 공개 URL에 올리지 않음).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const appVer = readFileSync(path.join(root, 'src/app.js'), 'utf8').match(/version:\s*'v([\d.]+)'/)?.[1];
if (appVer !== version) { console.error(`버전 불일치: package.json ${version} ≠ src/app.js v${appVer}`); process.exit(1); }
const html = readFileSync(path.join(root, 'index.html'), 'utf8').replaceAll('?v=dev', `?v=${version}`);
const out = path.join(root, 'dist');
rmSync(out, { recursive: true, force: true }); mkdirSync(path.join(out, 'src'), { recursive: true });
writeFileSync(path.join(out, 'index.html'), html);
for (const f of readdirSync(path.join(root, 'src'))) if (f.endsWith('.js')) cpSync(path.join(root, 'src', f), path.join(out, 'src', f));
cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
console.log(`✅ dist/ v${version} (index.html · src/*.js · assets/)`);
