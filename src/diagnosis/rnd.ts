// R&D 과제(지원사업) 기술 제안 — 규칙 기반. 진단 결과(핵심기술 TRL·영역 점수·로드맵 원문 후보)로
// 과제 유형별(초격차·기존 기술 고도화·실증·사업화·융합 확장) 기획 초안을 만든다.
// 원칙: 선정 가능성·적합도 등급을 말하지 않는다. 로드맵 품목·쪽은 원문 색인에 있는 것만 쓴다.
// 목표 TRL은 2~3년 과제 기준 '현재 +1~2단계' 제안값이며, 정량 목표는 기업이 확정한다. 특정 사업명은 쓰지 않는다.
import { CHECK_KEYS, CHECK_LABEL, rankTechs, type RankTechInput, type TechRankRow } from './techrank';
import { TRL_LEVELS } from './trl';
import type { AssessmentResult, Answer } from './types';
import { fixParticles } from '../reports/ko';

export type RndTrack = 'upgrade' | 'frontier' | 'validation' | 'convergence';
export const TRACK_LABEL: Record<RndTrack, string> = {
  upgrade: '기존 기술 고도화',
  frontier: '초격차 기술 확보',
  validation: '실증·사업화 연계',
  convergence: '융합·신규 적용 확장',
};
/** 지원사업에서 흔히 쓰는 과제 성격(특정 사업명 아님) */
export const TRACK_PROGRAM: Record<RndTrack, string> = {
  upgrade: '기술개발(R&D) 과제 — 보유 기술 성능·신뢰성 향상',
  frontier: '도전·선도형 기술개발 과제 — 차세대·원천 기술',
  validation: '실증·사업화 연계 과제 — 수요처 실증·인증·양산',
  convergence: '융합·신시장 기술개발 과제 — 보유 기술의 새 분야 적용',
};

export type RndTech = RankTechInput;

export interface RndRoadmapLink {
  name: string;
  code?: string | null;
  page: number | null;
  source: string;
  /** 원문 핵심기술명과 원문 TRL 표기(있을 때만) */
  techName?: string;
  techTrl?: string | null;
}

export type Readiness = '신청 준비됨' | '보완 후 신청' | '선행 조건 필요';

export interface RndProposal {
  id: string;
  track: RndTrack;
  trackLabel: string;
  program: string;
  title: string;
  techName: string;
  trlNow: number | null;
  trlTarget: string;
  roadmap: RndRoadmapLink | null;
  why: string;
  contents: string[];
  readiness: Readiness;
  prep: string[];
  /** 연계 기술의 핵심기술 우선순위(1부터) */
  techRank: number | null;
}

export interface RndInput {
  r: Pick<AssessmentResult, 'm' | 'gaps' | 'unknown' | 'insufficient'>;
  techs: RndTech[];
  /** 로드맵 후보(원문 색인) — 관련도 순 */
  roadmap: (RndRoadmapLink & { matchedTechs?: { name: string; trl: string | null; page: number | null }[] })[];
  /** 핵심기술 이름 → 가장 가까운 로드맵 품목(없으면 null) */
  linkOf: (techName: string) => RndRoadmapLink | null;
  answers: Record<string, Answer>;
  externalDependency: boolean;
  /** 차별 요소 답변(핵심기술 우선순위 판단용) */
  hardPart?: string;
}

const lvl = (t: number) => `TRL ${t}(${TRL_LEVELS[t]})`;
const at = (v: number | null, x: number) => v !== null && v >= x;
const known = (v: Answer): v is number => v !== null && v !== undefined;

/** 2~3년 과제 기준 목표: 현재 +2단계(최대 9). 0(확인 필요)이면 '확인 후 설정' */
export function targetTrl(now: number): string {
  if (!now) return 'TRL 확인 후 설정';
  if (now >= 9) return 'TRL 9 유지·확장';
  return `${lvl(Math.min(9, now + 2))}`;
}

function upgradeContents(trl: number): string[] {
  if (trl <= 4) return ['핵심 원리·알고리즘의 성능 목표(정량 지표) 정의와 시제품 구현', '유사환경 시험 체계 구축과 반복 시험 데이터 확보', '성능·신뢰성 한계 요인 분석과 개선 설계'];
  if (trl <= 6) return ['실제 사용 환경(수요처)에서 시제품 실증', '성능·신뢰성 목표 지표 고도화와 외부 시험 근거 확보', '현장 적용 절차 표준화(설치·운영·유지보수)'];
  return ['양산·대규모 운영 안정화(품질 편차·장애 대응)', '인증·표준 요구 대응과 시험성적 확보', '원가·처리 성능 최적화로 사업성 강화'];
}

/** 신청 전에 진단에서 드러난 약점을 먼저 메우도록 안내(지원사업 평가의 수행 역량·증빙 관점) */
function commonPrep(i: RndInput): string[] {
  const { m } = i.r;
  const o: string[] = [];
  if (!at(m.evidence, 50)) o.push('연구노트·시험기록·버전 이력 정비(기술 실체 증빙)');
  if (!at(m.rd, 50)) o.push('연구개발 전담 인력·예산·장비 계획 수립(수행 역량 증빙)');
  if (!at(m.exec, 50)) o.push('연차별 목표·담당·완료기준(중간 목표) 계획');
  if (!at(m.strategy, 50)) o.push('로드맵 품목과 자사 기술의 대조표 작성(정책 연계성 설명)');
  if (i.externalDependency && !(known(i.answers.q9) && i.answers.q9 >= 3)) o.push('외부 의존 기술의 대체 경로·권리관계 정리');
  if (i.r.unknown > 0) o.push(`'모름'으로 남은 진단 문항 ${i.r.unknown}개를 담당자와 확인`);
  return o;
}

function readinessOf(i: RndInput, need: { tech?: number; extra?: (keyof AssessmentResult['m'])[] }): Readiness {
  const { m } = i.r;
  if (i.r.insufficient) return '선행 조건 필요';
  const base = at(m.evidence, 50) && at(m.rd, 50) && at(m.exec, 50);
  const extraOk = (need.extra ?? []).every((d) => at(m[d], 50));
  if (need.tech !== undefined && !at(m.tech, need.tech)) return at(m.tech, need.tech - 15) ? '보완 후 신청' : '선행 조건 필요';
  return base && extraOk ? '신청 준비됨' : '보완 후 신청';
}

export function rndProposals(i: RndInput): RndProposal[] {
  const out: RndProposal[] = [];
  const prep0 = commonPrep(i);
  // 결과 화면·PDF와 같은 핵심기술 우선순위(확인 항목 수 → 차별 요소 → TRL)
  const ranked = rankTechs(i.techs, { hardPart: i.hardPart ?? '', linkOf: i.linkOf });
  const used = new Set<string>();
  const rankOf = (t?: RndTech) => (t ? ranked.find((x) => x.tech === t)?.rank ?? null : null);
  const why1 = (row: TechRankRow<RndTech>) => {
    const ok = CHECK_KEYS.filter((k) => row.checks[k] === true).map((k) => CHECK_LABEL[k]);
    return fixParticles(`'${row.tech.name}'은(는) 핵심기술 우선순위 ${row.rank}위(판단 기준 5가지 ${row.met === 5 ? '모두 충족' : `중 ${row.met}가지 충족${ok.length ? `: ${ok.join('·')}` : ''}`})`);
  };
  /** 기업 확인 전 기술은 '신청 준비됨'으로 두지 않는다 */
  const capConfirmed = (r: Readiness, t?: RndTech): Readiness => (t && !t.confirmed && r === '신청 준비됨' ? '보완 후 신청' : r);
  const confirmPrep = (t?: RndTech) => (t && !t.confirmed ? [`'${t.name}' TRL·보유형태 기업 확인(3단계 '내용 확인')`] : []);

  // 1) 기존 기술 고도화: 대표 핵심기술의 다음 단계
  const mainRow = ranked.find((x) => x.tech.trl > 0) ?? ranked[0];
  const main = mainRow?.tech;
  if (main) {
    used.add(main.name);
    const link = mainRow.link;
    const trl = main.trl || 0;
    out.push({
      id: 'R&D-1', track: 'upgrade', trackLabel: TRACK_LABEL.upgrade, program: TRACK_PROGRAM.upgrade,
      title: `${main.name} 성능·신뢰성 고도화`,
      techName: main.name, trlNow: trl || null, trlTarget: targetTrl(trl), roadmap: link,
      why: trl ? `${why1(mainRow)}이며 ${lvl(trl)} 단계로, 다음 검증 단계를 과제로 묶기 좋습니다.` : `핵심기술 '${main.name}'의 TRL이 확인되지 않아 목표를 정하기 전에 현재 수준 확인이 먼저입니다.`,
      contents: trl ? upgradeContents(trl) : ['현재 TRL과 근거자료 확인', '성능 목표(정량 지표) 정의', '시험·검증 계획 수립'],
      readiness: trl ? capConfirmed(readinessOf(i, {}), main) : '선행 조건 필요',
      prep: [...(trl ? confirmPrep(main) : ['핵심기술 TRL 확인(3단계)']), ...prep0].slice(0, 4),
      techRank: mainRow.rank,
    });
  }

  // 2) 초격차: 로드맵 원문 후보의 핵심기술을 목표로 한 차세대 기술(기술성숙·차별성이 있어야 권장)
  const top = i.roadmap.find((c) => (c.matchedTechs ?? []).length);
  if (top) {
    const mt = top.matchedTechs![0];
    const diff = known(i.answers.q12) && i.answers.q12 >= 4;
    // 이 로드맵 품목과 연결된 핵심기술을 우선(같은 품목 코드·이름) → 없으면 아직 쓰지 않은 상위 기술 → 대표 기술
    const sameItem = (row: TechRankRow<RndTech>) => !!row.link && (top.code ? row.link.code === top.code : row.link.name === top.name);
    const fRow = ranked.find((x) => sameItem(x) && !used.has(x.tech.name)) ?? ranked.find((x) => !used.has(x.tech.name)) ?? mainRow;
    const ft = fRow?.tech;
    if (ft) used.add(ft.name);
    const readiness: Readiness = capConfirmed(!at(i.r.m.tech, 50) ? '선행 조건 필요' : at(i.r.m.tech, 65) && diff ? readinessOf(i, { extra: ['strategy'] }) : '보완 후 신청', ft);
    out.push({
      id: 'R&D-2', track: 'frontier', trackLabel: TRACK_LABEL.frontier, program: TRACK_PROGRAM.frontier,
      title: `${mt.name} 차세대 기술 개발`,
      techName: ft?.name ?? mt.name, trlNow: ft?.trl || null,
      // 원문 TRL 표기는 품목 기준값(연차 목표일 수도 있음)이라 자사 목표가 아니라 대조 기준으로만 쓴다
      trlTarget: mt.trl ? `차세대 성능 목표 설정(로드맵 원문 TRL ${mt.trl} 기준 대조)` : '로드맵 원문 목표 확인 후 설정',
      roadmap: { name: top.name, code: top.code, page: mt.page ?? top.page, source: top.source, techName: mt.name, techTrl: mt.trl },
      why: fixParticles(`공식 로드맵 '${top.name}'의 핵심기술 '${mt.name}'과(와) 자사 '${ft?.name ?? '핵심기술'}'이(가) 맞닿아 있어, 정책 방향과 연결된 선도 과제로 설명할 수 있습니다(원문 확인 필요).`),
      contents: ['로드맵 개발목표 대비 자사 기술 격차 분석과 목표 성능 설정', '독자 핵심기술(알고리즘·공정·소재) 개발과 지식재산(특허) 확보', '국내외 선도 기술과의 성능 비교 검증'],
      readiness,
      prep: [...(diff ? [] : ['차별 기술·노하우의 지식재산 보호 방안(특허 선행조사)']), `로드맵 원문${(mt.page ?? top.page) ? ` p.${mt.page ?? top.page}` : ''}의 개발목표와 대조`, ...confirmPrep(ft), ...prep0].slice(0, 4),
      techRank: rankOf(ft),
    });
  }

  // 3) 실증·사업화: TRL 6 이상 핵심기술
  // 고도화 과제와 겹치지 않게 다른 핵심기술로
  const ready = ranked.map((x) => x.tech).find((t) => t.trl >= 6 && !used.has(t.name));
  if (ready) {
    used.add(ready.name);
    out.push({
      id: 'R&D-3', track: 'validation', trackLabel: TRACK_LABEL.validation, program: TRACK_PROGRAM.validation,
      title: `${ready.name} 수요처 실증·사업화`,
      techName: ready.name, trlNow: ready.trl, trlTarget: targetTrl(ready.trl), roadmap: i.linkOf(ready.name),
      why: `'${ready.name}'이(가) ${lvl(ready.trl)} 단계로, 실제 수요처 실증과 인증을 거쳐 매출로 연결할 시점입니다.`,
      contents: ['수요처(고객사) 현장 실증과 성과 지표 측정', '필수 인증·표준·안전 요건 대응', '양산·운영 체계와 원가 구조 확정'],
      readiness: capConfirmed(readinessOf(i, { extra: ['scale'] }), ready),
      prep: [...(!(known(i.answers.q10) && i.answers.q10 >= 3) ? ['목표 시장 필수 인증·보안 요건 목록 확인'] : []), '실증 수요처 확보 의향서', ...confirmPrep(ready), ...prep0].slice(0, 4),
      techRank: rankOf(ready),
    });
  }

  // 4) 융합·확장: 두 번째 로드맵 후보(다른 품목)로 적용 분야 확대 — 앞의 제안이 3개 미만일 때만
  const second = i.roadmap.find((c) => c !== top && c.name !== top?.name);
  // 적용 확장은 아직 과제에 쓰지 않은 기술을 우선(같은 기술로 3건을 채우지 않음)
  const cRow = second ? ranked.find((x) => !used.has(x.tech.name)) ?? mainRow : undefined;
  const ct = cRow?.tech;
  if (out.length < 3 && second && ct) {
    out.push({
      id: 'R&D-4', track: 'convergence', trackLabel: TRACK_LABEL.convergence, program: TRACK_PROGRAM.convergence,
      title: `${ct.name} 기반 ${second.name} 적용 확장`,
      techName: ct.name, trlNow: ct.trl || null, trlTarget: ct.trl ? targetTrl(Math.max(1, ct.trl - 1)) : 'TRL 확인 후 설정', roadmap: second,
      why: `보유 기술 '${ct.name}'을(를) 로드맵 품목 '${second.name}' 분야에 적용하면 새 시장을 겨냥한 과제로 기획할 수 있습니다(원문 확인 필요).`,
      contents: ['새 적용 분야의 요구 성능·데이터 조건 분석', '보유 기술의 적용 모듈 개발·연계', '새 분야 수요처 시범 적용'],
      readiness: capConfirmed(readinessOf(i, { extra: ['strategy'] }), ct),
      prep: ['새 분야 수요처·협력기관 확보', ...confirmPrep(ct), ...prep0].slice(0, 4),
      techRank: rankOf(ct),
    });
  }
  return out.slice(0, 3);
}
