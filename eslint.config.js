// ESLint (flat config). Rule Engine·보고서 모델·테스트는 TypeScript 권장 규칙으로 검사한다.
// src/app/legacy-ui.ts 는 v0.9 템플릿 이관본(@ts-nocheck)이라 Phase 6 재작성 전까지 lint 대상에서 제외한다.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'reference/**', 'tests/e2e/out/**', 'src/app/legacy-ui.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
