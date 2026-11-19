// E2E 대상 고르기 규칙 — node --test scripts/ci/changed-apps.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appsFor, APPS } from './changed-apps.mjs';

test('앱 폴더만 바뀌면 그 앱만', () => assert.deepEqual(appsFor(['prestartup/app.js', 'prestartup/index.html']), ['prestartup']));
test('여러 앱이면 그 앱들만', () => assert.deepEqual(appsFor(['grants/app.js', 'hr/index.html']), ['hr', 'grants']));
test('문서(.md)만 바뀌면 대상 없음', () => assert.deepEqual(appsFor(['README.md', 'prestartup/docs/CHANGELOG.md']), []));
test('루트 코드(src·tests)는 기술진단', () => assert.deepEqual(appsFor(['src/main.ts', 'tests/unit/x.test.ts']), ['tech']));
test('워크플로·의존성·CI 스크립트가 바뀌면 전체', () => {
  for (const f of ['.github/workflows/ci.yml', 'package.json', 'package-lock.json', 'scripts/ci/app-qa.sh']) assert.deepEqual(appsFor([f]), APPS, f);
});
test('모든 앱 폴더가 실제로 있음', async () => {
  const { existsSync } = await import('node:fs');
  for (const a of APPS.filter((x) => x !== 'tech')) assert.ok(existsSync(`${a}/tests`), a);
});
