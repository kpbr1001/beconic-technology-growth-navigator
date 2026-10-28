// ============================================================================
// 공고문 분석 작업 — 스냅샷의 기업마당 공고 중 아직 분석하지 않은 공고문 PDF를 내려받아
// 텍스트를 뽑고(unpdf) 자격 절을 분석해 공고별 결과를 하나의 색인(Blobs)에 저장한다.
// - 1회 실행당 최대 LIMIT건(기업마당 부하·실행 시간 제한), 마감이 가까운 공고부터
// - 동시에 두 번 돌지 않도록 잠금(LOCK_MS). 반복 호출해도 잠금·분석 완료 공고는 건너뜀
// - 결과는 programs 응답 시점에 병합(applyDoc)되므로 다음 정기 수집을 기다리지 않는다
// ============================================================================
import { readSnapshot, namedStore } from './collect.mjs';
import { analyzeDocText } from './doc-rules.mjs';

export const LIMIT = 80;
// 분석 규칙 버전 — 규칙을 바꾸면 올려서 기존 공고문을 다시 분석한다
export const DOC_VER = 4;
const CONCURRENCY = 4;
const DL_TIMEOUT_MS = 20000;
const MAX_BYTES = 20 * 1024 * 1024;
const LOCK_MS = 14 * 60 * 1000;
const RETRY_ERROR_MS = 24 * 60 * 60 * 1000;   // 내려받기 실패는 하루 뒤 재시도
const INDEX_KEY = 'index';
const LOCK_KEY = 'lock';

const docStore = () => namedStore('grant-docs');

export async function readDocIndex() {
  try { return (await (await docStore()).get(INDEX_KEY, { type: 'json' })) || {}; } catch { return {}; }
}
async function writeDocIndex(idx) {
  try { await (await docStore()).setJSON(INDEX_KEY, idx); } catch { /* 다음 실행에서 다시 */ }
}

/** PDF 바이트 → 텍스트(unpdf). 테스트는 textImpl로 대체 */
export async function pdfText(bytes) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || '');
}

async function analyzeOne(p, { fetchImpl, textImpl }) {
  const base = { url: p.docUrl, at: new Date().toISOString(), v: DOC_VER };
  try {
    const res = await fetchImpl(p.docUrl, { signal: AbortSignal.timeout(DL_TIMEOUT_MS) });
    if (!res.ok) return { ...base, status: 'error', error: `HTTP ${res.status}` };
    const len = +res.headers.get('content-length') || 0;
    if (len > MAX_BYTES) return { ...base, status: 'toolarge' };
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) return { ...base, status: 'toolarge' };
    if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') return { ...base, status: 'notpdf' };
    const text = await textImpl(bytes);
    if (text.replace(/\s/g, '').length < 150) return { ...base, status: 'notext', textLen: text.length }; // 포스터·스캔 이미지
    return { ...base, status: 'ok', ...analyzeDocText(text, { regions: p.targetRegionsInferred ? null : p.targetRegions }) };
  } catch (e) {
    return { ...base, status: 'error', error: String(e.message || e).slice(0, 120) };
  }
}

/**
 * 분석 1회. 반환: { processed, remaining, skipped? }
 */
export async function analyzeDocs({ limit = LIMIT, now = Date.now(), fetchImpl = fetch, textImpl = pdfText } = {}) {
  const st = await docStore();
  try {
    const lock = await st.get(LOCK_KEY, { type: 'json' });
    if (lock && now - lock.at < LOCK_MS) return { skipped: true, reason: 'locked' };
    await st.setJSON(LOCK_KEY, { at: now });
  } catch { /* 잠금 저장소 오류여도 진행 */ }
  try {
    const snap = await readSnapshot();
    const programs = (snap?.programs || []).filter((p) => p.source === 'bizinfo' && p.docUrl);
    const idx = await readDocIndex();
    // 스냅샷에서 사라진(마감) 공고는 색인에서 정리
    const live = new Set(programs.map((p) => p.sourceProgramId));
    for (const id of Object.keys(idx)) if (!live.has(id)) delete idx[id];
    const needs = (p) => {
      const d = idx[p.sourceProgramId];
      if (!d || d.url !== p.docUrl || d.v !== DOC_VER) return true;
      return d.status === 'error' && now - Date.parse(d.at) > RETRY_ERROR_MS;
    };
    const todo = programs.filter(needs)
      .sort((a, b) => String(a.applicationEnd || '9999').localeCompare(String(b.applicationEnd || '9999')));
    const batch = todo.slice(0, limit);
    let i = 0;
    const worker = async () => {
      while (i < batch.length) {
        const p = batch[i++];
        idx[p.sourceProgramId] = await analyzeOne(p, { fetchImpl, textImpl });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
    await writeDocIndex(idx);
    const stats = Object.values(idx).reduce((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
    return { processed: batch.length, remaining: todo.length - batch.length, stats };
  } finally {
    try { await st.setJSON(LOCK_KEY, { at: 0 }); } catch { /* 무시 */ }
  }
}
