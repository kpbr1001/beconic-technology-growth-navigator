// 핵심기술 우선순위 — 규칙 기반 확인 항목(점수·가중치 아님). 결과 화면·PDF·R&D 과제 제안이 같은 순서를 쓴다.
// 원칙: 항목마다 충족 여부와 이유를 그대로 보여 준다. 같은 비중(각 1)이며 전문가 검증 전 시범 기준이다.
// 순위는 '먼저 검토할 순서'이지 기술 가치·시장성·선정 가능성이 아니다.

export interface RankTechInput {
  name: string;
  trl: number;
  critical: boolean;
  ownership?: string;
  confirmed?: boolean;
  /** 후보를 찾은 답변 칸(예: hardPart) — 규칙·AI 후보에서만 있음 */
  src?: string;
}

export interface RankLink {
  name: string;
  code?: string | null;
  page: number | null;
  source: string;
}

export type CheckKey = 'diff' | 'roadmap' | 'own' | 'trl' | 'confirmed';
export const CHECK_LABEL: Record<CheckKey, string> = {
  diff: '차별 요소',
  roadmap: '로드맵 연결',
  own: '자체 보유',
  trl: 'TRL 입력',
  confirmed: '기업 확인',
};
export const CHECK_KEYS: CheckKey[] = ['diff', 'roadmap', 'own', 'trl', 'confirmed'];

export interface TechRankRow<T extends RankTechInput = RankTechInput> {
  rank: number;
  tech: T;
  /** null = 판단할 정보 없음(확인 필요) */
  checks: Record<CheckKey, boolean | null>;
  met: number;
  link: RankLink | null;
  /** 항목별 판단 이유(화면·PDF 표시용) */
  reasons: string[];
}

/** 기술 이름에서 의미가 넓은 말은 빼고 비교한다(예: '데이터', '기술'만 겹치면 차별 요소로 보지 않음) */
const GENERIC = new Set([
  '기술', '모델', '알고리즘', '시스템', '분석', '설비', '데이터', '기반', '플랫폼', '솔루션', '서비스', '개발', '관리', '연계',
  '자동', '자동화', '통합', '외부', '핵심', '제품', '경험', '운영', '적용', '활용', '고도화', '처리', '방식', '노하우',
]);

export function nameTokens(name: string): string[] {
  return name
    .split(/[\s·,/()-]+/)
    .map((w) => w.replace(/(을|를|이|가|은|는|의|와|과)$/, ''))
    .filter((w) => w.length >= 2 && !GENERIC.has(w));
}

/** 경쟁사가 따라 하기 어려운 부분(차별 요소) 답변과 이름이 겹치는지 */
export function relatesToDiff(t: Pick<RankTechInput, 'name' | 'src'>, hardPart: string): boolean {
  if (t.src === 'hardPart') return true;
  const text = hardPart.replace(/\s+/g, '');
  return !!text && nameTokens(t.name).some((w) => text.includes(w));
}

export function rankTechs<T extends RankTechInput>(
  techs: T[],
  ctx: { hardPart: string; linkOf: (name: string) => RankLink | null },
): TechRankRow<T>[] {
  const rows = techs
    .filter((t) => t.critical && t.name.trim())
    .map((t, order) => {
      const link = ctx.linkOf(t.name);
      const own = t.ownership === '자체' || t.ownership === '혼합' ? true : t.ownership === '외부' ? false : null;
      const checks: Record<CheckKey, boolean | null> = {
        diff: relatesToDiff(t, ctx.hardPart),
        roadmap: !!link,
        own,
        trl: t.trl > 0,
        confirmed: !!t.confirmed,
      };
      const reasons = [
        checks.diff ? "'경쟁사가 따라 하기 어려운 부분' 답변과 연결" : '차별 요소 답변과 직접 연결되지 않음',
        link ? `로드맵 후보 '${link.name}'${link.page ? ` (원문 p.${link.page})` : ''}` : '이름이 겹치는 로드맵 품목 없음',
        own === true ? `보유형태 '${t.ownership}'` : own === false ? '외부 의존 기술(대체 경로 필요)' : '보유형태 확인 필요',
        t.trl > 0 ? `TRL ${t.trl} 입력(자가응답)` : 'TRL 확인 필요',
        t.confirmed ? '기업이 내용 확인' : '기업 확인 전(추정)',
      ];
      const met = CHECK_KEYS.filter((k) => checks[k] === true).length;
      return { tech: t, checks, met, link, reasons, order };
    })
    // 충족 항목 수 → 차별 요소 → TRL 높은 순 → 입력 순
    .sort((a, b) => b.met - a.met || Number(b.checks.diff) - Number(a.checks.diff) || b.tech.trl - a.tech.trl || a.order - b.order);
  return rows.map((r, i) => ({ rank: i + 1, tech: r.tech, checks: r.checks, met: r.met, link: r.link, reasons: r.reasons }));
}

/** 목록에는 있지만 핵심기술로 체크하지 않아 결과에 반영되지 않는 기술 */
export function excludedTechs<T extends RankTechInput>(techs: T[]): T[] {
  return techs.filter((t) => !t.critical && t.name.trim());
}
