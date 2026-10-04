// 비공개 KB의 문단(chunks.jsonl) → Supabase roadmap_chunks 적재 (+ 임베딩 공급자가 켜져 있으면 벡터도)
// 사용: npx vite-node scripts/rag/load_kb.ts -- --chunks ../beconic-roadmap-kb/kb/chunks.jsonl [--dry-run|--probe] [--batch 64] [--pause-ms 0]
//  --probe: 키·모델·DB 연결만 확인(문단 1개 임베딩 + DB 검색 1회, 쓰기 없음)
//  임베딩 호출이 실패(429 사용 한도 등)하면 20초·40초·… 간격으로 최대 6회 재시도
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (선택) EMBEDDING_PROVIDER=voyage, VOYAGE_API_KEY
// ⚠️ 키는 셸 환경변수로만 전달하고 파일·커밋에 남기지 않는다.
import { readFileSync } from 'node:fs';
import { createEmbeddingProvider } from '../../src/rag/embedding';
import { deactivateOtherVersions, supabaseConfigFromEnv, supabaseKeywordRetriever, upsertChunks } from '../../src/rag/supabase';

const COLUMNS = ['chunk_id', 'chunk_type', 'kb_version', 'source_file', 'sha256', 'roadmap_version', 'roadmap_type',
  'roadmap_role', 'strategic_field', 'field_no', 'subfield', 'item_uid', 'item_code', 'item_no', 'item_name',
  'technology_no', 'technology_name', 'trl_raw', 'trl_min', 'trl_max', 'trl_basis', 'page_start', 'page_end',
  'printed_page_start', 'printed_page_end', 'parse_confidence', 'contextual_prefix', 'content'] as const;

export type Chunk = Record<string, unknown> & { chunk_id: string; chunk_type: string; kb_version: string; contextual_prefix: string; content: string };

export function toRow(c: Chunk): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const k of COLUMNS) row[k] = c[k] ?? null;
  if (c.chunk_type !== 'technology') row.technology_no = null;
  row.trl_basis = c.trl_basis ?? (c.chunk_type === 'technology' ? 'stated' : null);
  row.roadmap_role = c.roadmap_role ?? 'primary';
  row.content = c.content ?? '';
  row.is_active = true;
  return row;
}

/** 임베딩 입력: 문맥 머리말 + 내용 (contextual chunking) */
export const embedInput = (c: Chunk) => `${c.contextual_prefix}\n${c.content}`.slice(0, 8000);

/** 실패 시 대기 후 재시도(Voyage 무료 한도 429 등). wait는 테스트에서 바꿔 끼운다 */
export async function withRetry<T>(fn: () => Promise<T>, { tries = 6, baseMs = 20_000, wait = (ms: number) => new Promise((r) => setTimeout(r, ms)), label = '' } = {}): Promise<T> {
  for (let k = 1; ; k++) {
    try {
      return await fn();
    } catch (e) {
      if (k >= tries) throw e;
      const ms = baseMs * k;
      console.warn(`\n${label} 실패(${e instanceof Error ? e.message : e}) — ${ms / 1000}초 후 재시도 ${k}/${tries - 1}`);
      await wait(ms);
    }
  }
}

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

async function main() {
  const path = arg('chunks');
  if (!path) throw new Error('--chunks <chunks.jsonl> 필요');
  const dry = process.argv.includes('--dry-run');
  const batch = Number(arg('batch', '64'));
  const pauseMs = Number(arg('pause-ms', '0'));
  if (!Number.isInteger(batch) || batch < 1 || batch > 128) throw new Error('--batch는 1~128');
  const probe = process.argv.includes('--probe');
  const chunks = readFileSync(path, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Chunk);
  const versions = [...new Set(chunks.map((c) => c.kb_version))];
  if (versions.length !== 1) throw new Error(`kb_version이 하나여야 함: ${versions.join(',')}`);
  const ids = new Set(chunks.map((c) => c.chunk_id));
  if (ids.size !== chunks.length) throw new Error('chunk_id 중복');
  const embedder = createEmbeddingProvider(process.env);
  console.log(`문단 ${chunks.length}개 · KB ${versions[0]} · 임베딩 ${embedder.enabled ? `${embedder.id}/${embedder.model}/${embedder.dimensions}` : `없음(${embedder.disabledReason})`}`);
  if (embedder.enabled && embedder.dimensions !== 1024) throw new Error('DB 컬럼은 vector(1024) — EMBEDDING_DIMENSIONS=1024 필요');
  if (dry) {
    chunks.slice(0, 2).forEach((c) => console.log(JSON.stringify(toRow(c)).slice(0, 200)));
    console.log('dry-run: 전송 없음');
    return;
  }
  const cfg = supabaseConfigFromEnv(process.env);
  if (!cfg) throw new Error('SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 필요');
  if (probe) {
    const hits = await supabaseKeywordRetriever(cfg).search('예지보전 설비', {}, 1);
    console.log(`DB 연결 확인 — 검색 결과 ${hits.length}건`);
    if (!embedder.enabled) throw new Error(`임베딩 꺼짐: ${embedder.disabledReason}`);
    const [v] = await embedder.embedBatch([embedInput(chunks[0])], { inputType: 'document' });
    if (v.length !== 1024) throw new Error(`임베딩 차원 ${v.length} — DB는 1024`);
    console.log(`임베딩 확인 — ${embedder.model} ${v.length}차원. 시험 통과(쓰기 없음). 전체 적재를 실행하세요.`);
    return;
  }
  for (let i = 0; i < chunks.length; i += batch) {
    const part = chunks.slice(i, i + batch);
    const rows = part.map(toRow);
    if (embedder.enabled) {
      const vecs = await withRetry(() => embedder.embedBatch(part.map(embedInput), { inputType: 'document' }), { label: `임베딩 ${i + 1}~` });
      rows.forEach((r, k) => {
        r.embedding = `[${vecs[k].join(',')}]`;
        r.embedding_model = embedder.model;
      });
    }
    await withRetry(() => upsertChunks(cfg, rows), { tries: 3, baseMs: 5_000, label: `DB 저장 ${i + 1}~` });
    process.stdout.write(`\r적재 ${Math.min(i + batch, chunks.length)}/${chunks.length}`);
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
  }
  await deactivateOtherVersions(cfg, versions[0]);
  console.log(`\n완료 — 다른 KB 버전 행은 비활성 처리`);
}

// 테스트(vitest)에서 import할 때는 실행하지 않는다
if (!process.env.VITEST) {
  main().catch((e) => {
    console.error(`적재 실패: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
