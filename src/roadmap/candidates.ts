// 로드맵 세부분야 '참고 후보' (D1 수정).
// 원문 KB(Hybrid RAG)가 연결되기 전까지는 단어 일치 기반 후보일 뿐이므로
// '높음/중간' 같은 적합도 등급과 '공식근거' 표기를 하지 않는다(마스터 프롬프트 금지사항 2·3, 17장).
import taxonomy from './static-taxonomy.json';

export const ROADMAP_GROUPS: Record<string, string[]> = taxonomy.ROADMAP_GROUPS;
/** 세부분야 목록: 원문 대조 전(Phase 2에서 검증) */
export const ROADMAP_DETAIL: Record<string, string[]> = taxonomy.ROADMAP_DETAIL;

export type EvidenceGrade = 'unverified' | 'retrieved' | 'verified';

export interface RoadmapCandidate {
  name: string;
  /** 입력 텍스트와 일치한 단어 수(정렬용). 적합도 등급이 아니다. */
  hits: number;
  label: string;
  reason: string;
  source: string;
  evidenceGrade: EvidenceGrade;
  /** 원문 페이지. RAG 연결 전에는 항상 null */
  page: number | null;
}

export interface CandidateInput {
  roadmapField: string;
  texts: string[];
}

export const UNVERIFIED_LABEL = '참고 후보 · 원문 검증 전';

export function roadmapCandidates({ roadmapField: f, texts }: CandidateInput): RoadmapCandidate[] {
  const subs = ROADMAP_DETAIL[f] || ['추가 분류 필요'];
  const txt = texts.join(' ').toLowerCase();
  return subs
    .map((s) => {
      const words = s.toLowerCase().split(/[·/\s]+/).filter((x) => x.length > 1);
      const hits = words.filter((w) => txt.includes(w)).length;
      return {
        name: s,
        hits,
        label: UNVERIFIED_LABEL,
        reason: hits
          ? `입력 내용과 세부분야명 단어 ${hits}개 일치 (원문 대조 전)`
          : `선택한 '${f}' 분야의 세부분야 목록 중 하나 (원문 대조 전)`,
        source: `${f} 세부분야명 · 원문 페이지 미확인`,
        evidenceGrade: 'unverified' as const,
        page: null,
      };
    })
    // v0.9와 같은 순위: 일치 2개 이상 > 1개 > 0개, 동률은 원래 순서 유지
    .sort((a, b) => Math.min(b.hits, 2) - Math.min(a.hits, 2))
    .slice(0, 3);
}
