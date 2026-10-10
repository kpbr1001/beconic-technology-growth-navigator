// 보고서 핵심 결과(순수 함수): 화면·PDF·AI 서버·검증 테스트가 같은 값을 쓰도록 한곳에서 계산한다.
// 진단 점수 → 우선순위(P0→P2) → 전략 추천안 → 핵심기술 우선순위 → R&D 과제 → 보완 필요 기술 → 레드팀.
import { evaluate, type AssessmentInput, type AssessmentResult, type Gap } from '../diagnosis';
import { redTeam, type RedTeam } from '../diagnosis/redteam';
import { rndProposals, type RndProposal } from '../diagnosis/rnd';
import { strategicOptions, type StrategicOption } from '../diagnosis/strategy';
import { rankTechs, type TechRankRow } from '../diagnosis/techrank';
import { roadmapCandidates, roadmapInputOf, techRoadmapLink, type RoadmapCandidate } from '../roadmap/candidates';
import { gapAnswerText, gapCards, type GapCard } from '../roadmap/gaps';
import { readiness, type ReadinessResult } from './readiness';

const PRI = { P0: 0, P1: 1, P2: 2 } as const;
/** 화면과 같은 우선순위 순서(P0→P1→P2, 같은 등급은 점수 낮은 순 — 엔진 순서 유지) */
export const orderByPriority = (gaps: Gap[]) => [...gaps].sort((a, b) => PRI[a.priority] - PRI[b.priority]);

export interface ReportCore {
  r: AssessmentResult;
  priorities: Gap[];
  options: StrategicOption[];
  recommended: StrategicOption;
  ranked: TechRankRow[];
  matches: RoadmapCandidate[];
  rnd: RndProposal[];
  cards: GapCard[];
  redteam: RedTeam;
  /** 지원사업 신청 준비도(R&D 4관점·바우처 후보·자격) */
  ready: ReadinessResult;
}

const linkOf = (field: string) => (n: string) => {
  const c = techRoadmapLink(field, n);
  return c ? { name: c.name, code: c.code ?? null, page: c.page, source: c.source } : null;
};

export function reportCore(input: AssessmentInput): ReportCore {
  const r = evaluate(input);
  const options = strategicOptions(r);
  const field = input.company.roadmapField;
  const techs = input.inventory.map((t) => ({ ...t, trl: Number(t.trl) || 0 }));
  const ranked = rankTechs(techs, { hardPart: input.discovery.hardPart ?? '', linkOf: linkOf(field) });
  const matches = roadmapCandidates(roadmapInputOf(input));
  const rnd = r.insufficient
    ? []
    : rndProposals({
        r, hardPart: input.discovery.hardPart ?? '',
        techs: techs.map((t) => ({ name: t.name, trl: t.trl, critical: !!t.critical, ownership: t.ownership, confirmed: !!t.confirmed, src: t.src })),
        roadmap: matches.map((m) => ({ name: m.name, code: m.code ?? null, page: m.page ?? null, source: m.source, matchedTechs: (m.matchedTechs ?? []).map((t) => ({ name: t.name, trl: t.trl ?? null, page: t.page ?? null })) })),
        linkOf: linkOf(field), answers: input.answers, externalDependency: !!input.discovery.external,
      });
  const cards = r.insufficient
    ? []
    : gapCards({ candidates: matches, techs: techs.map((t) => ({ name: t.name, trl: t.trl, critical: !!t.critical })), answerText: gapAnswerText(input), dataText: input.discovery.data ?? '', rdScore: r.m.rd });
  const base = {
    r, priorities: orderByPriority(r.gaps), options, recommended: options.find((o) => o.recommended) ?? options[0],
    ranked, matches, rnd, cards, redteam: redTeam(input, r),
  };
  return { ...base, ready: readiness(input, { ...base, ready: undefined as never }) };
}
