// 공개 파일만 dist/로 복사한다(테스트·문서·스키마·스크립트는 공개 URL에 올리지 않음).
import { rmSync, mkdirSync, cpSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const p of ['index.html', 'src', 'data', 'assets', 'fonts']) cpSync(join(ROOT, p), join(OUT, p), { recursive: true });
writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');
let n = 0; let bytes = 0;
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else { n += 1; bytes += s.size; } });
walk(OUT);
console.log(`✅ dist/ ${n}개 파일, ${(bytes / 1048576).toFixed(2)}MB`);
