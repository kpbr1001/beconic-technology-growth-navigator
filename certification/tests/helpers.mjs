import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepare, DATA_FILES } from '../src/data.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

export function loadDataSync() {
  return prepare({
    catalog: readJson(DATA_FILES.catalog),
    sources: readJson(DATA_FILES.sources),
    questions: readJson(DATA_FILES.questions),
    packFiles: DATA_FILES.packs.map(readJson),
  });
}

export const AS_OF = '2026-11-22';
