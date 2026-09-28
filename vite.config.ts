import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** 업데이트 일자 = 빌드(배포) 시각, 한국시간 기준 YYYY.MM.DD */
const buildDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date())
  .filter((p) => p.type !== 'literal')
  .map((p) => p.value)
  .join('.');

export default defineConfig({
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
    // Netlify 빌드 시 커밋 해시(COMMIT_REF), CI는 GITHUB_SHA
    __BUILD_COMMIT__: JSON.stringify((process.env.COMMIT_REF || process.env.GITHUB_SHA || '').slice(0, 7)),
  },
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 8787 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/regression/**/*.test.ts'],
  },
});
