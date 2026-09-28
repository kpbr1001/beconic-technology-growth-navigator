import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: 'public',
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 8787 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/regression/**/*.test.ts'],
  },
});
