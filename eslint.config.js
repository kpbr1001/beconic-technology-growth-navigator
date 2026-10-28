// ESLint (flat config). Rule Engine·보고서 모델·테스트는 TypeScript 권장 규칙으로 검사한다.
// src/app/legacy-ui.ts 는 v0.9 템플릿 이관본(@ts-nocheck)이라 Phase 6 재작성 전까지 lint 대상에서 제외한다.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'reference/**', 'tests/e2e/out/**', 'src/app/legacy-ui.ts', 'finance/vendor/**', 'finance/tests/out/**', 'finance/dist/**', 'hr/dist/**', 'hr/tests/out/**', 'growth/dist/**', 'growth/tests/out/**', 'grants/dist/**', 'grants/dist-demo/**', 'grants/tests/out/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // 지원사업 MATCH 화면 스크립트: 모듈이 아닌 일반 <script>(전역 App을 HTML onclick에서 호출)
  {
    files: ['grants/app.js', 'grants/data.js'],
    languageOptions: { sourceType: 'script' },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^App$' }] },
  },
);
