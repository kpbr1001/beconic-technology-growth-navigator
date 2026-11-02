// 빌드: 공개 파일만 dist/ 로 복사한다(문서·테스트·디자인 원본은 공개 URL에 올리지 않음).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const appVer = readFileSync(path.join(root, 'src/app.js'), 'utf8').match(/version:\s*'v([\d.]+)'/)?.[1];
if (appVer !== version) { console.error(`버전 불일치: package.json ${version} ≠ src/app.js v${appVer}`); process.exit(1); }
// 메타 설명 등 고정 HTML의 개수·시간은 문항 모델에서 채운다(하드코딩 방지)
const model = await import(pathToFileURL(path.join(root, 'src/model.js')).href);
const fill = { N_Q: model.N_Q, N_CAT: model.CATEGORIES.length, SCALE: model.SCALE_MAX, MIN: model.estMinutes() };
const html = readFileSync(path.join(root, 'index.html'), 'utf8').replaceAll('?v=dev', `?v=${version}`).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in fill ? String(fill[k]) : m));
if (/\{\{\w+\}\}/.test(html)) { console.error('채우지 못한 자리표시자:', html.match(/\{\{\w+\}\}/g)); process.exit(1); }
const out = path.join(root, 'dist');
rmSync(out, { recursive: true, force: true }); mkdirSync(path.join(out, 'src'), { recursive: true });
writeFileSync(path.join(out, 'index.html'), html);
// 모듈 사이 import에도 버전을 붙여, 배포 후 예전 파일이 브라우저에 남아 섞이지 않게 한다
for (const f of readdirSync(path.join(root, 'src'))) if (f.endsWith('.js')) writeFileSync(path.join(out, 'src', f), readFileSync(path.join(root, 'src', f), 'utf8').replace(/(from\s+|import\()(['"])(\.\/[\w-]+\.js)\2/g, `$1$2$3?v=${version}$2`));
cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
cpSync(path.join(root, 'vendor'), path.join(out, 'vendor'), { recursive: true }); // pdf.js(표준재무제표 읽기)
// 수동 업로드(드래그 앤 드롭·CLI deploy)에도 보안 헤더가 적용되도록 _headers 생성 — netlify.toml [[headers]]와 같은 값
const toml = readFileSync(path.join(root, 'netlify.toml'), 'utf8');
const blocks = [...toml.matchAll(/\[\[headers\]\]\s*\n\s*for = "([^"]+)"\s*\n\s*\[headers\.values\]\s*\n((?:\s*[\w-]+ = "[^"]*"\s*\n?)+)/g)];
if (!blocks.length) { console.error('netlify.toml 헤더 파싱 실패'); process.exit(1); }
// 일반 경로 주소(/q/Q07)를 새로고침·직접 접속해도 앱이 열리도록 모든 경로를 index.html로 연결(실제 파일이 있으면 파일 우선)
writeFileSync(path.join(out, '_redirects'), '/*  /index.html  200\n');
writeFileSync(path.join(out, '_headers'), blocks.map(([, f, body]) => `${f}\n${[...body.matchAll(/([\w-]+) = "([^"]*)"/g)].map(([, k, v]) => `  ${k}: ${v}`).join('\n')}`).join('\n\n') + '\n');
console.log(`✅ dist/ v${version} (index.html · src/*.js · assets/ · vendor/)`);
