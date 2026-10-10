// 6단계 맨 위 '핵심요약'(화면·PDF 공용, 순수 함수): 대표가 1분 안에 읽고 결정할 수 있게 결론 한 줄·카드 6개·90일 할 일을 만든다.
// 원칙: 새 점수·새 판단을 만들지 않는다. 모든 값은 reportCore(점수·우선순위·핵심기술 순위·신청 준비도·레드팀) 결과를 그대로 옮긴다.
// 선정 가능성·적합 등급 표현은 쓰지 않는다.
import { CORE, MIN_CORE_ANSWERS } from '../diagnosis';
import { BAND_CUT, band } from '../diagnosis/scoring';
import { nextTrlGate } from '../diagnosis/trl';
import type { AssessmentInput } from '../diagnosis/types';
import type { ReportCore } from './core';
import { fixParticles } from './ko';
import { MATRIX_CUT, quadrantOf } from './visuals';

export type KeyTone = 'ok' | 'warn' | 'bad' | 'info';
export interface KeyTile {
  key: 'position' | 'urgent' | 'tech' | 'support' | 'risk' | 'trust';
  label: string;
  head: string;
  body: string;
  tone: KeyTone;
}
export interface KeyStep {
  when: string;
  what: string;
  who?: string;
}
export interface KeySummary {
  /** 응답 부족으로 점수 판단 보류 */
  held: boolean;
  headline: string;
  tiles: KeyTile[];
  steps: KeyStep[];
  /** 정합성 검사용 값(화면·PDF의 다른 쪽과 대조) */
  facts: {
    capability: number | null;
    confidence: number;
    p0Area: string | null;
    p0Act: string | null;
    topTech: string | null;
    ready: string;
    high: number;
  };
}

/** 영역별 표준 과제 [제목, 설명, 담당, 기간, 성과지표] — 화면 90일 계획과 같은 함수를 넘겨받는다 */
export type ActionOf = (area: string) => string[];

const clip = (s: string, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const strip = (s: string) => String(s ?? '').replace(/<[^>]*>/g, '');

/** 위치별 대표용 한 줄(사분면 의미를 짧게) */
const QUAD_LINE: Record<string, string> = {
  scale: '역량과 근거가 함께 갖춰져 확장 과제를 실행할 수 있는 단계입니다.',
  evidence: '역량은 높게 답했지만 뒷받침 자료가 약해, 근거부터 확인해야 하는 단계입니다.',
  focus: '진단 근거는 쓸 만하니, 약한 영역에 자원을 모으면 되는 단계입니다.',
  recheck: '역량과 근거가 모두 불확실해, 담당자 확인과 자료 확보가 먼저인 단계입니다.',
};
const READY_TONE: Record<string, KeyTone> = { '신청 준비됨': 'ok', '보완 후 신청': 'warn', '선행 조건 필요': 'bad' };
const capTone = (v: number | null): KeyTone => (v === null ? 'info' : v >= BAND_CUT.good ? 'ok' : v >= BAND_CUT.weak ? 'warn' : 'bad');

export function keySummary(i: AssessmentInput, c: ReportCore, actionOf: ActionOf): KeySummary {
  const { r } = c;
  const held = r.insufficient || r.capability === null;
  const cap = r.capability === null ? null : Math.round(r.capability);
  const conf = Math.round(r.confidence);
  const p0 = c.priorities[0] ?? null;
  const act = p0 ? actionOf(p0.area).map(strip) : null;
  const top = c.ranked[0] ?? null;
  const highs = c.redteam.risks.filter((x) => x.grade === '높음');
  const unknownRisks = c.redteam.risks.filter((x) => x.grade === '확인 필요');
  const quad = quadrantOf(r.capability, r.confidence);
  const ready = c.ready.overall;

  // ① 결론 한 줄
  const headline = held
    ? `아직 점수를 판단하지 않았습니다. 공통 핵심 ${CORE.length}문항 중 ${r.coreAnswered}개만 응답해, ${MIN_CORE_ANSWERS}개 이상 답하면 결과가 확정됩니다.`
    : fixParticles(`기술역량은 ${cap}점으로 '${band(cap)}' 구간이고, 가장 먼저 풀 과제는 '${p0?.area}'입니다. ${quad ? QUAD_LINE[quad.key] : ''}`).trim();

  // ② 카드 6개
  const tiles: KeyTile[] = [];
  tiles.push(held
    ? { key: 'position', label: '지금 위치', head: '판단 보류', body: `응답 ${r.answered}개 · 핵심 문항 ${MIN_CORE_ANSWERS - r.coreAnswered}개 더 필요`, tone: 'info' }
    : { key: 'position', label: '지금 위치', head: `${band(cap)} · ${cap}점`, body: quad ? `'${quad.label}' 단계(역량 × 진단 신뢰도)` : '위치 판단 보류', tone: capTone(cap) });
  tiles.push(held || !p0 || !act
    ? { key: 'urgent', label: '가장 먼저 할 일', head: '핵심 문항 응답 보완', body: '담당자(CTO·개발·생산)와 함께 모름·미응답 문항 확인', tone: 'warn' }
    : { key: 'urgent', label: '가장 먼저 할 일', head: act[0], body: `${p0.area}${p0.score === null ? '(점수 판단 보류)' : ` ${Math.round(p0.score)}점`} · 담당 ${act[2]} · ${act[3]}`, tone: p0.priority === 'P0' ? 'bad' : 'warn' });
  if (top) {
    const t = top.tech;
    const g = nextTrlGate(t.trl);
    tiles.push({
      key: 'tech', label: '먼저 키울 핵심기술', head: t.name,
      body: `${t.trl ? `현재 TRL ${t.trl} → 다음 ${g.target}(${g.gate})` : 'TRL 확인 필요'}${t.confirmed ? '' : ' · 기업 확인 전'}`,
      tone: t.trl ? 'info' : 'warn',
    });
  } else tiles.push({ key: 'tech', label: '먼저 키울 핵심기술', head: '핵심기술 미지정', body: '3단계에서 핵심기술을 지정하면 우선순위를 정합니다', tone: 'warn' });
  const rnd = c.rnd[0];
  const rm = c.matches.find((m) => m.uid && !m.weak) ?? c.matches.find((m) => m.uid);
  tiles.push({
    key: 'support', label: '지원사업 신청 준비', head: ready,
    body: held ? '핵심 문항 응답을 보완한 뒤 판단합니다' : rnd ? `R&D 과제 후보 '${clip(rnd.title, 26)}'${rm ? ` · 로드맵 '${clip(rm.name, 16)}'${rm.page ? ` p.${rm.page}` : ''}` : ''}` : clip(c.ready.reason, 80),
    tone: READY_TONE[ready] ?? 'info',
  });
  tiles.push(highs.length
    ? { key: 'risk', label: '주의할 리스크', head: `'높음' ${highs.length}건`, body: highs.slice(0, 2).map((x) => x.name).join(', ') + (highs.length > 2 ? ` 외 ${highs.length - 2}건` : ''), tone: 'bad' }
    : unknownRisks.length
      ? { key: 'risk', label: '주의할 리스크', head: `'확인 필요' ${unknownRisks.length}건`, body: `${unknownRisks.slice(0, 2).map((x) => x.name).join(', ')} — 관련 문항 확인 필요`, tone: 'warn' }
      : { key: 'risk', label: '주의할 리스크', head: "'높음' 없음", body: '중간 이하 리스크는 90일 계획 안에서 관리', tone: 'ok' });
  tiles.push({
    key: 'trust', label: '결과 신뢰도', head: `${conf}점 · ${r.level}`,
    body: r.unknown ? `'모름' ${r.unknown}개 — 확인하면 신뢰도가 오릅니다` : conf >= MATRIX_CUT.confidence ? '실행계획의 기준선으로 쓸 수 있습니다' : '근거 자료를 보강하면 신뢰도가 오릅니다',
    tone: conf >= MATRIX_CUT.confidence ? 'ok' : 'warn',
  });

  // ③ 90일 할 일(실행 순서)
  const steps: KeyStep[] = [];
  if (held) {
    steps.push({ when: '이번 주', what: '모름·미응답 핵심 문항을 담당자와 확인해 응답 보완', who: '대표·CTO' });
    steps.push({ when: '2주 안', what: top ? `'${clip(top.tech.name, 20)}' TRL 근거(시험·실증 기록) 확인` : '핵심기술 지정과 TRL 확인', who: 'CTO·개발' });
    steps.push({ when: '보완 후', what: '같은 기준으로 다시 진단해 점수·우선순위 확정' });
  } else {
    if (act) steps.push({ when: act[3] || '1~4주', what: act[0], who: act[2] });
    if (top) {
      const g = nextTrlGate(top.tech.trl);
      steps.push({ when: '1~2개월', what: top.tech.trl ? `'${clip(top.tech.name, 20)}' ${g.target} 검증 계획 수립(${g.gate})` : `'${clip(top.tech.name, 20)}' TRL 근거 확인`, who: 'CTO·개발' });
    }
    const weakAxis = c.ready.axes.find((a) => a.status === '미흡') ?? c.ready.axes.find((a) => a.status === '보완');
    if (weakAxis?.actions[0]) steps.push({ when: '2~3개월', what: `지원사업 대비: ${weakAxis.actions[0]}`, who: '대표·기획' });
    else if (rnd) steps.push({ when: '2~3개월', what: `${rnd.id} 과제 공고 일정 확인·기획서 초안`, who: '대표·기획' });
    steps.push({ when: '90일 후', what: '같은 기준으로 재진단해 실행 효과 확인' });
  }

  return {
    held, headline, tiles, steps,
    facts: { capability: cap, confidence: conf, p0Area: held ? null : p0?.area ?? null, p0Act: held ? null : act?.[0] ?? null, topTech: top?.tech.name ?? null, ready, high: highs.length },
  };
}
