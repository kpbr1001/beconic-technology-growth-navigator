// 로드맵 후보 품목별 '원문 근거' 찾기: 후보 품목(item_uid) 범위에서 Hybrid 검색 → 짧은 인용문 + 출처·쪽.
// 원문 문장은 그대로 발췌만 한다(요약·생성 금지). ⚠️ 서버 전용.
import type { EmbeddingProvider } from './embedding/types';
import { hybridSearch, type HybridSearchOptions } from './hybrid-search';
import { terms } from '../roadmap/terms';
import {
  supabaseKeywordRetriever, supabaseVectorRetriever, type RoadmapRankedChunk, type SupabaseConfig,
} from './supabase';

export interface EvidenceRequest {
  /** 기업 입력(제품·핵심기술 등)을 합친 질의. 최대 600자로 자른다 */
  query: string;
  /** 화면 후보의 품목 고유키(최대 3개) */
  itemUids: string[];
}

export interface EvidenceQuote {
  chunkId: string;
  /** 원문 발췌(최대 ~240자, 말줄임 표시) */
  quote: string;
  label: string; // '개요' | '기술개발 목표' | '정의' … (원문 라벨)
  technologyName: string | null;
  trl: string | null;
  citation: string; // 문서 · 품목 · 인쇄 p.N (PDF p.M)
  printedPage: number | null;
  pdfPage: number | null;
  matchedTerms: string[];
}

export interface EvidenceResponse {
  status: 'ok' | 'not_configured';
  mode?: 'hybrid' | 'keyword_only';
  semanticDisabledReason?: string;
  items: Record<string, EvidenceQuote[]>;
}

const MAX_QUERY = 600;
const MAX_ITEMS = 3;
const QUOTE_LEN = 240;

/** 내용에서 일치어가 가장 많은 '라벨: 문장' 줄을 고른다 */
export function bestQuote(content: string, matched: string[]): { label: string; quote: string } {
  const lines = content.split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean);
  let label = '';
  let best = { label: '', text: '', n: -1 };
  for (const l of lines) {
    const m = l.match(/^([^:]{1,16}):\s*(.*)$/);
    if (m && !m[2]) {
      label = m[1];
      continue;
    }
    const lab = m ? m[1] : label;
    const text = m ? m[2] : l;
    const n = matched.filter((t) => text.toLowerCase().includes(t)).length;
    if (n > best.n) best = { label: lab, text, n };
  }
  // 한 줄에 여러 항목이 이어진 경우(원문 글머리표가 두 칸 공백으로 합쳐짐): 일치어가 많은 항목부터 길이 한도까지
  const segs = best.text.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
  const hit = (x: string) => matched.filter((t) => x.toLowerCase().includes(t)).length;
  const ordered = segs.length > 1 ? segs.map((x, i) => ({ x, i, n: hit(x) })).sort((a, b) => b.n - a.n || a.i - b.i) : [{ x: best.text, i: 0, n: 0 }];
  const picked: { x: string; i: number }[] = [];
  let len = 0;
  for (const s of ordered) {
    if (picked.length && (s.n === 0 || len + s.x.length > QUOTE_LEN)) break;
    picked.push(s);
    len += s.x.length;
  }
  const t = picked.sort((a, b) => a.i - b.i).map((s) => s.x).join(' … ');
  return { label: best.label || '내용', quote: t.length > QUOTE_LEN ? `${t.slice(0, QUOTE_LEN).trimEnd()}…` : t };
}

function citation(c: RoadmapRankedChunk): string {
  const r = c.row;
  const doc = r.contextual_prefix.match(/^\[문서\] (.+)$/m)?.[1] ?? r.source_file;
  const id = r.item_code ?? (r.item_no ? `원문 순번 ${r.item_no}` : '');
  const page = r.printed_page_start ? `인쇄 p.${r.printed_page_start}` : '인쇄 쪽 미확인';
  return `${doc} › ${r.item_name}${id ? ` (${id})` : ''} · ${page}${r.page_start ? ` (PDF p.${r.page_start})` : ''}`;
}

/** 질의 임베딩 메모: 같은 텍스트·용도면 첫 호출의 결과(또는 실패)를 그대로 돌려준다 */
export function memoizeEmbedder(e: EmbeddingProvider): EmbeddingProvider {
  if (!e.enabled) return e;
  const memo = new Map<string, Promise<number[]>>();
  return {
    ...e,
    embedText(text, options) {
      const k = `${options.inputType}\u0000${text}`;
      if (!memo.has(k)) memo.set(k, e.embedText(text, options));
      return memo.get(k)!;
    },
    embedBatch: (texts, options) => e.embedBatch(texts, options),
  };
}

export async function findEvidence(
  req: EvidenceRequest,
  deps: { supabase: SupabaseConfig | null; embedder: EmbeddingProvider },
  opts: HybridSearchOptions = {},
): Promise<EvidenceResponse> {
  if (!deps.supabase) return { status: 'not_configured', items: {} };
  const query = req.query.slice(0, MAX_QUERY);
  const uids = [...new Set(req.itemUids)].slice(0, MAX_ITEMS);
  const keyword = supabaseKeywordRetriever(deps.supabase);
  const vector = supabaseVectorRetriever(deps.supabase);
  const qTerms = terms(query);
  // 같은 질의를 후보 품목마다 다시 임베딩하지 않도록 1회 결과(실패 포함)를 재사용 — 임베딩 호출 수를 품목 수 → 1회로
  const embedder = memoizeEmbedder(deps.embedder);
  const items: Record<string, EvidenceQuote[]> = {};
  let mode: EvidenceResponse['mode'] = 'hybrid';
  let reason: string | undefined;
  for (const uid of uids) {
    const r = await hybridSearch(query, { keyword, vector, embedder }, {
      ...opts,
      matchCount: opts.matchCount ?? 10,
      finalCount: opts.finalCount ?? 2,
      filters: { ...(opts.filters ?? {}), itemUids: [uid] },
    });
    if (r.mode === 'keyword_only') {
      mode = 'keyword_only';
      reason = r.semanticDisabledReason;
    }
    items[uid] = r.results.map((c) => {
      const ch = c as unknown as RoadmapRankedChunk;
      const matched = ch.matchedTerms ?? qTerms.filter((t) => ch.text.toLowerCase().includes(t));
      const q = bestQuote(ch.row.content, matched);
      return {
        chunkId: ch.chunkId,
        quote: q.quote,
        label: q.label,
        technologyName: ch.row.technology_name,
        trl: ch.row.trl_raw,
        citation: citation(ch),
        printedPage: ch.row.printed_page_start,
        pdfPage: ch.row.page_start,
        matchedTerms: matched,
      };
    }).filter((q) => q.quote);
  }
  return { status: 'ok', mode, ...(reason ? { semanticDisabledReason: reason } : {}), items };
}
