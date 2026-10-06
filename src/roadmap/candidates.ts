// 로드맵 '참고 후보' (D1 → D4).
// 원문 색인(전략품목·핵심기술 이름, 원문 쪽 번호)에서 입력 내용과 단어가 겹치는 전략품목을 찾는다.
// 키워드 일치일 뿐 내용 적합성 판정이 아니므로 '높음/중간' 같은 적합도 등급과 '공식근거' 표기를 하지 않는다
// (마스터 프롬프트 금지사항 2·3, 17장). 원문 문장 검색·근거 인용은 Phase 3 Hybrid RAG에서 붙는다.
import taxonomy from './static-taxonomy.json';
import { terms } from './terms';

export { terms };

export const ROADMAP_GROUPS: Record<string, string[]> = taxonomy.ROADMAP_GROUPS;
/** 세부분야 목록(원문 색인 기준으로 동기화: scripts/roadmap/build_app_index.py) */
export const ROADMAP_DETAIL: Record<string, string[]> = taxonomy.ROADMAP_DETAIL;

/** unverified: 세부분야명만 / retrieved: 원문 색인에서 찾은 품목(문서·쪽 있음, 내용 적합성은 미검증) */
export type EvidenceGrade = 'unverified' | 'retrieved' | 'verified';

export interface MatchedTech {
  name: string;
  /** 원문 TRL 표기 그대로. 2025~2027 판은 연차별 목표 TRL('2 → 3 → 4') */
  trl: string | null;
  page: number | null;
}

export interface RoadmapCandidate {
  name: string;
  /** 입력 텍스트와 일치한 단어 수(정렬용). 적합도 등급이 아니다. */
  hits: number;
  label: string;
  reason: string;
  source: string;
  evidenceGrade: EvidenceGrade;
  /** 원문 인쇄 쪽 번호(없으면 null) */
  page: number | null;
  pdfPage?: number | null;
  /** 원문 색인 품목 고유키(원문 근거 조회용) */
  uid?: string;
  /** 공식 품목코드(2026~2028 판) 또는 null */
  code?: string | null;
  itemNo?: string | null;
  subfield?: string | null;
  matchedTerms?: string[];
  matchedTechs?: MatchedTech[];
  /** 품목의 원문 핵심기술 전체(보완 필요 기술 대조용) */
  allTechs?: MatchedTech[];
  trlNote?: string | null;
  /** 일치 단어가 1개뿐인 약한 후보 */
  weak?: boolean;
  /** 정렬 점수(희소 단어 가중). 표시용 등급이 아니다 */
  score?: number;
}

export interface CandidateInput {
  roadmapField: string;
  texts: string[];
  /** 기업이 직접 밝힌 기술(세부 업종·기술분야, 핵심기술명). 이 단어는 2배 가중 — 제품 설명의 넓은 맥락어보다 우선 */
  coreTexts?: string[];
}

type AppItem = {
  uid: string; code: string | null; no: string | null; name: string; sub: string | null;
  pp: number | null; pdf: number; techs: [string, string | null, number | null, number | null, string?][];
};
type AppField = {
  collection: string; edition: string; doc: string; source_file: string; trl_note: string | null;
  subfields: string[]; items: AppItem[];
};
export type AppIndex = { kb_version: string; fields: Record<string, AppField> };

export const UNVERIFIED_LABEL = '참고 후보 · 원문 검증 전';
export const RETRIEVED_LABEL = '원문 색인 후보 · 키워드 일치';

let INDEX: AppIndex | null = null;
let loading: Promise<AppIndex | null> | null = null;

/** 원문 색인(약 64KB gzip)을 별도 파일로 비동기 로드. 실패해도 세부분야 목록으로 계속 동작한다. */
export function loadRoadmapIndex(): Promise<AppIndex | null> {
  loading ??= import('./kb-app-index.json')
    .then((m) => (INDEX = (m.default ?? m) as unknown as AppIndex))
    .catch(() => null);
  return loading;
}
export const roadmapIndexReady = () => INDEX !== null;
/** 테스트용 */
export function setRoadmapIndex(ix: AppIndex | null) {
  INDEX = ix;
}

const itemText = (i: AppItem) => `${i.name} ${i.techs.map((t) => t[0]).join(' ')}`.toLowerCase();
const DF = new WeakMap<AppField, Map<string, number>>();

/** 분야 안에서 단어의 희소성(IDF). 그 분야 품목 대부분에 들어가는 말('ai', '데이터')은 거의 0 */
function idf(field: AppField, q: string): number {
  let m = DF.get(field);
  if (!m) DF.set(field, (m = new Map()));
  let df = m.get(q);
  if (df === undefined) m.set(q, (df = field.items.filter((i) => itemText(i).includes(q)).length));
  const n = field.items.length;
  if (!df || df / n > 0.35) return 0;
  return Math.log((n + 1) / df);
}

function matchItem(field: AppField, item: AppItem, qs: string[], core: Set<string>) {
  const name = item.name.toLowerCase();
  const matched = qs.filter((q) => idf(field, q) > 0 && itemText(item).includes(q));
  // 품목명 일치 1.5배, 기업이 밝힌 핵심어 2배
  const score = matched.reduce((s, q) => s + idf(field, q) * (name.includes(q) ? 1.5 : 1) * (core.has(q) ? 2 : 1), 0);
  const techHits = item.techs
    .map((t) => ({ t, n: matched.filter((q) => t[0].toLowerCase().includes(q)).length }))
    .filter((x) => x.n > 0);
  return { score, hits: matched.length, matched, techHits };
}

function fallback(f: string, field: AppField | undefined): RoadmapCandidate[] {
  const subs = field?.subfields.length ? field.subfields : ROADMAP_DETAIL[f] || ['추가 분류 필요'];
  return subs.slice(0, 3).map((s) => {
    const first = field?.items.find((i) => i.sub === s);
    return {
      name: s,
      hits: 0,
      label: field ? RETRIEVED_LABEL : UNVERIFIED_LABEL,
      reason: field
        ? `입력 내용과 일치하는 전략품목이 없어 '${f}' 세부분야를 표시 — 기업 기술을 더 구체적으로 입력하면 품목 단위로 찾습니다`
        : `선택한 '${f}' 분야의 세부분야 목록 중 하나 (원문 대조 전)`,
      source: field ? `${field.doc}${first?.pp ? ` · 인쇄 p.${first.pp}~` : ''}` : `${f} 세부분야명 · 원문 페이지 미확인`,
      evidenceGrade: field ? ('retrieved' as const) : ('unverified' as const),
      page: field && first ? first.pp : null,
      pdfPage: field && first ? first.pdf : null,
      subfield: s,
    };
  });
}

export function roadmapCandidates({ roadmapField: f, texts, coreTexts = [] }: CandidateInput): RoadmapCandidate[] {
  const field = INDEX?.fields[f];
  if (!field) return fallback(f, undefined);
  const ranked = rank(field, terms([...texts, ...coreTexts].join(' ')), new Set(terms(coreTexts.join(' '))));
  if (!ranked.length) return fallback(f, field);
  return ranked.map((x) => toCandidate(field, x));
}

export interface OtherFieldCandidate extends RoadmapCandidate {
  field: string;
}

/** 선택 분야보다 확실히 더 잘 맞는 품목이 다른 분야에 있으면 제시(분야 선택 재검토용). 없으면 빈 배열 */
export function otherFieldCandidates({ roadmapField: f, texts, coreTexts = [] }: CandidateInput, limit = 2): OtherFieldCandidate[] {
  if (!INDEX) return [];
  const qs = terms([...texts, ...coreTexts].join(' '));
  const core = new Set(terms(coreTexts.join(' ')));
  const own = INDEX.fields[f] ? rank(INDEX.fields[f], qs, core)[0]?.score ?? 0 : 0;
  const out: OtherFieldCandidate[] = [];
  for (const [name, field] of Object.entries(INDEX.fields)) {
    if (name === f || field.collection === '2025-2027_general') continue; // 이전 판(대조용)은 추천하지 않는다
    const top = rank(field, qs, core)[0];
    if (top && top.hits >= 2 && top.score > Math.max(own * 1.5, 2)) out.push({ field: name, ...toCandidate(field, top) });
  }
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
}

type Ranked = { item: AppItem; order: number } & ReturnType<typeof matchItem>;

function rank(field: AppField, qs: string[], core: Set<string> = new Set()): Ranked[] {
  return field.items
    .map((item, order) => ({ item, order, ...matchItem(field, item, qs, core) }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 3);
}

function toCandidate(field: AppField, { item, hits, matched, techHits, score }: Ranked): RoadmapCandidate {
  const techs = techHits.sort((a, b) => b.n - a.n).slice(0, 2).map(({ t }) => ({
    name: t[0],
    trl: t[1] ? (t[4] === 'stage_targets' ? `연차별 목표 ${t[1]}` : t[1]) : null,
    page: t[2],
  }));
  const id = item.code ?? (item.no ? `원문 순번 ${item.no}` : '');
  return {
    name: item.name,
    hits,
    label: RETRIEVED_LABEL,
    reason: `입력어 ${matched.slice(0, 4).map((m) => `'${m}'`).join('·')} 일치 (전략품목·핵심기술명 기준, 내용 적합성 검증 전)`,
    source: `${field.doc}${item.sub ? ` › ${item.sub}` : ''} › ${id} · ${item.pp ? `인쇄 p.${item.pp}` : '인쇄 쪽 미확인'} (PDF p.${item.pdf})`,
    evidenceGrade: 'retrieved' as const,
    page: item.pp,
    pdfPage: item.pdf,
    uid: item.uid,
    code: item.code,
    itemNo: item.no,
    subfield: item.sub,
    matchedTerms: matched,
    matchedTechs: techs,
    allTechs: item.techs.map((t) => ({ name: t[0], trl: t[1] ? (t[4] === 'stage_targets' ? `연차별 목표 ${t[1]}` : t[1]) : null, page: t[2] })),
    trlNote: field.trl_note,
    weak: hits < 2,
    score: Math.round(score * 100) / 100,
  };
}

/** 진단 입력 → 로드맵 후보 검색 입력(화면·서버 공용). 기업이 밝힌 세부 업종·핵심기술명은 핵심어 */
export function roadmapInputOf(i: {
  company: { roadmapField: string; product?: string; sectorDetail?: string };
  discovery: { hardPart?: string; automated?: string; data?: string };
  inventory: { name: string; critical: boolean }[];
}): CandidateInput {
  return {
    roadmapField: i.company.roadmapField,
    texts: [i.company.product ?? '', i.discovery.hardPart ?? '', i.discovery.automated ?? '', i.discovery.data ?? ''],
    coreTexts: [i.company.sectorDetail ?? '', ...i.inventory.filter((x) => x.critical).map((x) => x.name)],
  };
}

/** 핵심기술 1건과 이름이 겹치는 로드맵 품목(없으면 null) — 화면·서버 공용 */
export function techRoadmapLink(roadmapField: string, techName: string): RoadmapCandidate | null {
  const c = roadmapCandidates({ roadmapField, texts: [], coreTexts: [techName] })[0];
  return c && c.hits > 0 ? c : null;
}
