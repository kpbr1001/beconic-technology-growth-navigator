// 보완 필요 기술·데이터(규칙 기반). 로드맵 후보 품목의 원문 핵심기술 전체를 기업 핵심기술과 이름으로 대조한다.
// 원칙: 원문 색인에 있는 핵심기술명·TRL 표기·쪽만 쓴다(새 기술을 만들지 않음). 이름 겹침은 '대조 필요' 수준의 신호이며
// 적합도·선정 가능성이 아니다. 원문 TRL은 품목 기준값이라 자사 목표가 아니라 대조 기준으로만 표시한다.
import { nameTokens } from '../diagnosis/techrank';
import type { RoadmapCandidate } from './candidates';

export interface GapTechInput {
  name: string;
  trl: number;
  critical: boolean;
}
export interface GapInput {
  candidates: RoadmapCandidate[];
  techs: GapTechInput[];
  /** 기업 답변(제품·차별 요소·자동 판단·데이터·외부 의존) — 목록엔 없지만 답변에 언급됐는지 */
  answerText: string;
  /** '계속 쌓이는 데이터' 답변 */
  dataText: string;
  /** R&D 역량 점수(없으면 null) — 보완 경로(자체 개발/외부 협력) 판단에 씀 */
  rdScore: number | null;
}

/** held: 2단어 이상 겹침 · partial: 1단어만 겹침(원문 대조 필요) · mentioned: 답변에만 표현 · gap: 겹침 없음 */
export type GapStatus = 'held' | 'partial' | 'mentioned' | 'gap';
export const GAP_STATUS_LABEL: Record<GapStatus, string> = {
  held: '보유 기술과 대조',
  partial: '일부 겹침 — 원문 대조 필요',
  mentioned: '답변에 관련 표현 — 목록 추가 검토',
  gap: '보완 필요 후보',
};
export type GapRoute = '자체 개발 후보' | '외부 협력·기술 도입 검토';

export interface GapRow {
  roadmapTech: string;
  /** 원문 TRL 표기 그대로(없으면 null) */
  trlRef: string | null;
  page: number | null;
  status: GapStatus;
  /** 이름이 겹치는 자사 핵심기술 */
  company?: { name: string; trl: number };
  /** 겹친 단어(판단 근거 표시용) */
  overlap: string[];
  route?: GapRoute;
}
export interface DataGap {
  term: string;
  roadmapTech: string;
  page: number | null;
}
export interface GapCard {
  item: { name: string; code: string | null; page: number | null; source: string; uid?: string };
  rows: GapRow[];
  dataGaps: DataGap[];
  /** 데이터 답변이 비어 데이터 대조를 하지 않음 */
  dataUnchecked: boolean;
}

/** 로드맵 기술명에 흔한 수식어 — 겹침 판단에서 뺀다 */
const EXTRA_GENERIC = new Set(['ai', '실시간', '지능형', '스마트', '최적화', '고효율', '효율', '자율', '차세대', '고성능', '정밀', '활용한', '위한', '이용한', '예측', '환경', '의사결정']);
const toks = (s: string) => nameTokens(s).map((w) => w.toLowerCase()).filter((w) => !EXTRA_GENERIC.has(w));
const near = (a: string, b: string) => a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 원문 기술명에 나오는 데이터 종류(이 말이 원문 기술명에 있을 때만 데이터 보완 후보로 봄) */
export const DATA_TERMS = ['센서', '비전', '영상', '이미지', '시계열', '멀티모달', '음성', '텍스트', '문서', '로그', '위치', '생체', '임상', '유전체', '공정', '진동', '열화상', '라이다', '레이더', '위성', '전력', '에너지', '거래', '3D', '점군'];

const trlNum = (t: string | null) => {
  const m = /(\d)(?!.*\d)/.exec(t ?? ''); // 연차별 목표는 마지막(최종) 값
  return m ? Number(m[1]) : null;
};

export function gapCards(i: GapInput, maxItems = 2): GapCard[] {
  const withTechs = i.candidates.filter((c) => (c.allTechs ?? []).length);
  const strong = withTechs.filter((c) => !c.weak);
  const picked = (strong.length ? strong : withTechs).slice(0, maxItems);
  const techs = i.techs.filter((t) => t.critical && t.name.trim()).map((t) => ({ ...t, tk: toks(t.name) }));
  const answer = squash(i.answerText);
  const data = squash(i.dataText);
  return picked.map((c) => {
    const rows: GapRow[] = (c.allTechs ?? []).map((rt) => {
      const rk = toks(rt.name);
      let best: { t: (typeof techs)[number]; ov: string[] } | null = null;
      for (const t of techs) {
        const ov = rk.filter((w) => t.tk.some((x) => near(w, x)));
        if (ov.length && (!best || ov.length > best.ov.length)) best = { t, ov };
      }
      // 한 단어만 겹치면(예: '수명', '탄소') 같은 기술이라 단정하지 않고 '일부 겹침'으로 둔다(표준 사례 검수에서 확인된 오판 방지)
      if (best) return { roadmapTech: rt.name, trlRef: rt.trl, page: rt.page, status: best.ov.length >= 2 ? 'held' : 'partial', company: { name: best.t.name, trl: best.t.trl }, overlap: best.ov };
      const said = rk.filter((w) => w.length >= 2 && answer.includes(w));
      if (said.length) return { roadmapTech: rt.name, trlRef: rt.trl, page: rt.page, status: 'mentioned', overlap: said };
      const ref = trlNum(rt.trl);
      const route: GapRoute = (ref !== null && ref >= 6) || (i.rdScore !== null && i.rdScore < 50) ? '외부 협력·기술 도입 검토' : '자체 개발 후보';
      return { roadmapTech: rt.name, trlRef: rt.trl, page: rt.page, status: 'gap', overlap: [], route };
    });
    const dataGaps: DataGap[] = [];
    if (data) {
      for (const rt of c.allTechs ?? []) {
        for (const term of DATA_TERMS) {
          if (rt.name.includes(term) && !data.includes(term.toLowerCase()) && !dataGaps.some((d) => d.term === term)) dataGaps.push({ term, roadmapTech: rt.name, page: rt.page });
        }
      }
    }
    return {
      item: { name: c.name, code: c.code ?? null, page: c.page, source: c.source, uid: c.uid },
      rows,
      dataGaps: dataGaps.slice(0, 3),
      dataUnchecked: !data,
    };
  });
}

/** AI·보고서에 넘길 '보완 필요 후보' 기술명 목록(카드 순서, 중복 제거) */
export const gapTechNames = (cards: GapCard[]) => [...new Set(cards.flatMap((c) => c.rows.filter((r) => r.status === 'gap' || r.status === 'mentioned').map((r) => r.roadmapTech)))];

/** 보완 필요 대조에 쓰는 기업 답변(화면·서버 공용) */
export const gapAnswerText = (i: { company: { product?: string; sectorDetail?: string }; discovery: { hardPart?: string; automated?: string; data?: string; external?: string } }) =>
  [i.company.product, i.company.sectorDetail, i.discovery.hardPart, i.discovery.automated, i.discovery.data, i.discovery.external].filter(Boolean).join(' ');
