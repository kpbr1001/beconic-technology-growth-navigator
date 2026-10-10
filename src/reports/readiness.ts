// 지원사업 신청 준비도(규칙 기반) — R&D 과제 4관점 판정·기술바우처 활용 후보·공통 자격 체크리스트.
// 원칙: '선정 가능성'이 아니라 '신청 전에 보완할 점'을 말한다. 특정 사업명은 쓰지 않는다(연도별 변동).
// 관점·기준은 일반적인 R&D 평가 관행으로 만든 시범 기준이며 전문가 검증 대상이다.
import { activeQuestions, evidenceLevel, profile } from '../diagnosis/questions';
import type { AssessmentInput, Eligibility } from '../diagnosis/types';
import type { Readiness } from '../diagnosis/rnd';
import type { ReportCore } from './core';
import { fixParticles, qRef } from './ko';

export type AxisStatus = '충족' | '보완' | '미흡' | '확인 필요';
export type AxisKey = 'tech' | 'capacity' | 'market' | 'policy';
export const AXIS_LABEL: Record<AxisKey, string> = { tech: '기술성', capacity: '수행 역량', market: '사업화·검증', policy: '정책 연계' };

/** 관점 세부 항목(기술성·수행 역량은 5개씩) — 0~100점, null은 '확인 필요'(0점이 아님) */
export interface AxisItem {
  key: string;
  label: string;
  score: number | null;
  status: AxisStatus;
  /** 점수 근거(문항·TRL·리스크·입력값) */
  basis: string;
  /** 보완사항(충족이면 빈 문자열) */
  fix: string;
  /** 이 항목이 '미흡'이면 관점 전체가 '미흡'(필수 항목) */
  gate?: boolean;
}

/** 항목 '충족' 기준점·'보완' 하한(시범 기준 — 화면·PDF 설명과 레이더 기준선이 이 값을 씀) */
export const ITEM_PASS = 70;
export const ITEM_WARN = 45;
/** 항목 점수 → 상태: ITEM_PASS 이상 충족 · ITEM_WARN 이상 보완 · 미만 미흡 · 없음 확인 필요 */
export const itemStatus = (score: number | null): AxisStatus => (score === null ? '확인 필요' : score >= ITEM_PASS ? '충족' : score >= ITEM_WARN ? '보완' : '미흡');

export interface Axis {
  key: AxisKey;
  label: string;
  status: AxisStatus;
  /** 세부 항목 평균(기술성·수행 역량만) */
  score?: number | null;
  items?: AxisItem[];
  /** 판정에 쓴 진단 근거(문항·점수·기술·로드맵) */
  evidence: string[];
  /** 보완 코멘트(무엇이 부족한지) */
  comment: string;
  /** 신청 전 90일 안에 할 일 */
  actions: string[];
}

export type VoucherType = '시험·인증' | '특허·지식재산' | '기술이전·기술자문' | '데이터 구축·가공' | '시제품 제작·설계' | '공정 개선 컨설팅';
export interface VoucherFit {
  type: VoucherType;
  why: string;
  effect: string;
  /** 근거가 된 레드팀 리스크 ID(있을 때) */
  riskId?: string;
}

export type EligStatus = '충족' | '확인 필요' | '주의' | '결격 가능성';
export interface EligItem {
  key: keyof Eligibility;
  label: string;
  status: EligStatus;
  note: string;
}

export interface ReadinessResult {
  overall: Readiness;
  /** 종합 판정 이유(한 줄) */
  reason: string;
  axes: Axis[];
  vouchers: VoucherFit[];
  eligibility: EligItem[];
  /** 자격 항목 중 입력된 수 */
  eligAnswered: number;
}

const num = (v: unknown) => (typeof v === 'number' ? v : null);
const q = (i: AssessmentInput, id: string) => num(i.answers[id]);
const ev = (i: AssessmentInput, id: string) => evidenceLevel(i.evidence, id);
const fmt = (v: number | null) => (v === null ? '판단 보류' : `${Math.round(v)}점`);

function axes(i: AssessmentInput, c: ReportCore): Axis[] {
  const { m } = c.r;
  const crit = c.ranked.length;
  const lab = i.company.elig?.lab ?? '';

  const techItems = techAxisItems(i, c);
  const capItems = capacityAxisItems(i, c, lab);

  // 사업화·검증: 실제환경 검증(q2)·검증 경험·확장준비
  const q2 = q(i, 'q2');
  const val = (i.discovery.validation ?? '').trim();
  const mEv = [`'실제환경 검증' 응답 ${q2 === null ? "'모름'·미응답" : `${q2}/5 · 근거 '${ev(i, 'q2').name}'`}`, `검증 경험 ${val ? `'${val.slice(0, 30)}${val.length > 30 ? '…' : ''}'` : '미입력'}`, `확장준비 ${fmt(m.scale)}`];
  const mIssues: string[] = [], mAct: string[] = [];
  if (q2 === null || q2 <= 2) { mIssues.push('실제 고객·현장에서 검증한 근거가 약해 사업화 계획의 설득력이 떨어집니다'); mAct.push('수요처 1곳과 시범 적용(PoC) 또는 수요처 의향서 확보'); }
  if (!val) { mIssues.push('외부에서 확인된 경험(PoC·납품·인증)이 입력되지 않았습니다'); mAct.push('2단계 \'외부에서 확인된 경험\'에 PoC·납품 실적 기록'); }
  if (m.scale !== null && m.scale < 45) { mIssues.push('양산·확장 계획이 약해 과제 종료 후 사업화 경로를 설명하기 어렵습니다'); mAct.push('과제 종료 후 3년 사업화 계획(생산·판매 경로) 초안'); }
  const mStatus: AxisStatus = (q2 === null || q2 <= 2) && !val ? '미흡' : q2 !== null && q2 >= 4 && !!val ? '충족' : '보완';

  // 정책 연계: 로드맵 품목 연결·q11
  const q11 = q(i, 'q11');
  // 원문 색인 품목(품목코드 또는 원문 순번이 있는 후보 — 세부분야 대체 후보 제외)
  const strong = c.matches.find((x) => x.uid && !x.weak) ?? c.matches.find((x) => x.uid);
  const sid = strong ? strong.code ?? (strong.itemNo ? `원문 순번 ${strong.itemNo}` : '원문 색인') : '';
  const pEv = [`로드맵 후보 ${strong ? `'${strong.name}'(${sid}${strong.page ? ` p.${strong.page}` : ''})` : '품목 단위 후보 없음'}`, `핵심기술 로드맵 연결 ${c.ranked.filter((x) => x.link).length}/${crit}개`, `'로드맵 연관성 설명' 응답 ${q11 === null ? "'모름'·미응답" : `${q11}/5`}`];
  const pIssues: string[] = [], pAct: string[] = [];
  if (!strong) { pIssues.push('공식 기술로드맵 품목과 연결되지 않아 정책 부합성을 설명하기 어렵습니다'); pAct.push('1단계 기술로드맵 분야·핵심기술명을 구체화해 품목 재탐색'); }
  if (q11 === null || q11 <= 2) { pIssues.push('자사 기술과 로드맵의 연관성을 스스로 설명할 준비가 부족합니다'); pAct.push(`로드맵 품목 대조표 작성${strong?.page ? `(원문 p.${strong.page} 개발목표)` : ''}`); }
  const pStatus: AxisStatus = !strong ? '미흡' : q11 !== null && q11 >= 3 && c.ranked.some((x) => x.link) ? '충족' : '보완';

  // 보완할 점이 하나라도 있으면 '충족'으로 두지 않는다(판정과 코멘트가 엇갈리지 않게)
  const mk = (key: AxisKey, st: AxisStatus, evidence: string[], issues: string[], actions: string[]): Axis => ({
    key, label: AXIS_LABEL[key], status: st === '충족' && issues.length ? '보완' : st, evidence,
    comment: issues.length ? `${issues.join('. ')}.` : st === '충족' ? '진단 근거상 큰 보완 사항이 없습니다. 공고별 평가 기준에 맞춰 근거자료를 정리하세요.' : '추가 확인이 필요합니다.',
    actions: actions.slice(0, 3),
  });
  return [itemAxis('tech', techItems), itemAxis('capacity', capItems), mk('market', mStatus, mEv, mIssues, mAct), mk('policy', pStatus, pEv, pIssues, pAct)];
}

const ans = (v: number | null) => (v === null ? null : Math.round(((v - 1) / 4) * 100));
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const item = (key: string, label: string, score: number | null, basis: string, fix: string, gate = false): AxisItem => {
  const st = itemStatus(score);
  return { key, label, score, status: st, basis, fix: st === '충족' ? '' : fix, gate };
};
const GRADE_SCORE: Record<string, number | null> = { 낮음: 85, 중간: 55, 높음: 30, '확인 필요': null };

/** 기술성 5개 항목: 성숙도·차별성·핵심 기능 구현·로드맵 대비 보유·지식재산 보호 */
export function techAxisItems(i: AssessmentInput, c: ReportCore): AxisItem[] {
  const top = c.ranked[0];
  const trl = top?.tech.trl ?? 0;
  const trlScore = !top || !trl ? 0 : trl <= 2 ? 30 : trl <= 4 ? 70 : trl <= 7 ? 90 : 60;
  const q12 = q(i, 'q12'), e12 = ev(i, 'q12');
  const diff = q12 === null ? null : Math.min(ans(q12)!, e12.k <= 1 ? 60 : 100);
  const techQs = activeQuestions(i.mode, i.company.bizType).filter((x) => x.cat === 'tech' && x.id !== 'q2' && x.id !== 'q12');
  const impl = avg(techQs.map((x) => ans(q(i, x.id))));
  const card = c.cards[0];
  // 평가에서 보는 것은 '보유 비율'이 아니라 '자사 기술이 로드맵 핵심기술과 맞닿아 있는가' — 보유 1개 70점(+10/개), 일부 겹침 50, 답변 언급 35, 없음 20
  const cnt = (st: string) => (card ? card.rows.filter((r) => r.status === st).length : 0);
  const own = !card || !card.rows.length ? null : cnt('held') ? Math.min(100, 60 + 10 * cnt('held')) : cnt('partial') ? 50 : cnt('mentioned') ? 35 : 20;
  const r5 = c.redteam.risks.find((x) => x.id === 'R5');
  return [
    item('trl', '기술 성숙도', trlScore,
      !top ? '핵심기술 미지정' : trl ? `'${top.tech.name}' TRL ${trl}` : `'${top.tech.name}' TRL 확인 필요`,
      !top ? '3단계에서 핵심기술 지정·TRL 입력' : !trl ? '핵심기술 TRL과 근거(시험기록) 확인' : trl <= 2 ? '개념 실험(TRL 3)으로 원리 검증 후 과제화' : '기술개발보다 실증·사업화 과제로 설계', true),
    item('diff', '차별성', diff,
      q12 === null ? "'모방 어려운 차별 요소' 응답 '모름'·미응답" : `'모방 어려운 차별 요소' 응답 ${q12}/5 · 근거 '${e12.name}'${e12.k <= 1 ? '(근거 약해 60점 상한)' : ''}`,
      q12 === null || q12 <= 2 ? '경쟁·선행기술 조사와 성능 비교표 작성' : '특허 선행조사·성능 비교 데이터로 차별성 입증', true),
    item('impl', '핵심 기능 구현', impl,
      techQs.map((x) => `${qRef(x.id)} ${q(i, x.id) ?? '모름'}`).join(' · '),
      '핵심 기능 시연 영상·시험 결과 정리(구현 수준 증빙)'),
    item('roadmap', '로드맵 핵심기술 연계', own,
      card ? `'${card.item.name}' 원문 핵심기술 ${card.rows.length}개 중 보유 ${card.rows.filter((r) => r.status === 'held').length}·일부 ${card.rows.filter((r) => r.status === 'partial').length}` : '대조할 로드맵 품목 없음',
      own !== null && own < 50 ? '로드맵 원문 핵심기술과 자사 기술의 대조표 작성(연결 근거 확보)' : '보완 필요 기술의 확보 방안(자체 개발·외부 협력) 정리'),
    item('ip', '지식재산 보호', r5 ? GRADE_SCORE[r5.grade] : null,
      r5 ? `증빙·지식재산 리스크(R5) ${r5.grade}` : '판단 근거 없음',
      '핵심기술 특허 출원·영업비밀 관리 방안 수립'),
  ];
}

/** 수행 역량 5개 항목: 연구 자원·개발·검증 반복·과제 관리·기술 기록·연구 조직·인력 */
export function capacityAxisItems(i: AssessmentInput, c: ReportCore, lab: string): AxisItem[] {
  const { m } = c.r;
  const qs = activeQuestions(i.mode, i.company.bizType);
  const rdLoop = avg(qs.filter((x) => x.cat === 'rd' && x.id !== 'q3').map((x) => ans(q(i, x.id))));
  const r3 = c.redteam.risks.find((x) => x.id === 'R3');
  const res = i.company.elig?.researchers ?? '';
  const labBase = lab === '연구소' ? 90 : lab === '전담부서' ? 75 : lab === '없음' ? 20 : null;
  const org = labBase === null ? null : Math.max(0, Math.min(100, labBase + (({ '0명': -20, '1~2명': -5, '3~5명': 0, '6명 이상': 5 } as Record<string, number>)[res] ?? 0) + (r3?.grade === '높음' ? -15 : r3?.grade === '중간' ? -5 : 0)));
  return [
    item('res', '연구 자원', ans(q(i, 'q3')), `'R&D 자원 확보' 응답 ${q(i, 'q3') ?? '모름'}${q(i, 'q3') === null ? '' : '/5'}`, '연구 인력·장비·예산 계획표 작성'),
    item('loop', '개발·검증 반복', rdLoop, qs.filter((x) => x.cat === 'rd' && x.id !== 'q3').map((x) => `${qRef(x.id)} ${q(i, x.id) ?? '모름'}`).join(' · '), '개발→시험→개선 절차와 실험 기록 양식 문서화'),
    item('mgmt', '과제 관리', m.exec === null ? null : Math.round(m.exec), `실행준비 ${fmt(m.exec)}('과제 담당·일정·완료기준' 문항 반영)`, '과제별 담당·기한·완료기준(중간 목표) 계획'),
    item('record', '기술 기록', m.evidence === null ? null : Math.round(m.evidence), `기술기록 ${fmt(m.evidence)}('개발 기록' 문항 반영)`, '연구노트·시험기록·버전 이력 정비'),
    item('org', '연구 조직·인력', org,
      labBase === null ? '연구전담조직 미입력(1단계 자격 확인)' : `연구전담조직 ${lab}${res ? ` · 연구 인력 ${res}` : ''}${r3 ? ` · 핵심 인력 의존 ${r3.grade}` : ''}`,
      lab === '없음' ? '연구개발전담부서 또는 기업부설연구소 설립 검토' : labBase === null ? "1단계 '지원사업 자격 확인'에서 연구전담조직 입력" : '참여 연구원 구성·백업 담당 지정', true),
  ];
}

/** 항목으로 관점 판정: 필수 항목 미흡 → 미흡 / 확인 가능한 항목 3개 미만 → 확인 필요 / 평균 45 미만 → 미흡 /
 *  평균 70 이상이고 보완·미흡 항목 없음 → 충족 / 그 외 보완. 기술성은 차별성 '모름'도 미흡(설명 불가) */
export function itemAxis(key: AxisKey, items: AxisItem[]): Axis {
  const score = avg(items.map((x) => x.score));
  const known = items.filter((x) => x.score !== null);
  const gateFail = items.some((x) => x.gate && (x.status === '미흡' || (key === 'tech' && x.key === 'diff' && x.status === '확인 필요')));
  // 필수 항목 미흡(예: 연구전담조직 없음)은 정보가 부족해도 확정된 사실이라 먼저 판정한다
  const status: AxisStatus = gateFail ? '미흡' : known.length < 3 ? '확인 필요' : score !== null && score < ITEM_WARN ? '미흡'
    : score !== null && score >= ITEM_PASS && !items.some((x) => x.status === '보완' || x.status === '미흡') ? '충족' : '보완';
  const weak = items.filter((x) => x.status === '미흡' || x.status === '보완' || (x.gate && x.status === '확인 필요')).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  return {
    key, label: AXIS_LABEL[key], status, score, items,
    evidence: items.map((x) => `${x.label} ${x.score === null ? '확인 필요' : `${x.score}점`}`),
    comment: status === '충족' ? '진단 근거상 큰 보완 사항이 없습니다. 공고별 평가 기준에 맞춰 근거자료를 정리하세요.'
      : status === '확인 필요' ? '판단할 항목이 부족합니다. 1단계 자격 확인과 핵심 문항 응답을 보완하세요.'
      : fixParticles(`${weak.map((x) => `${x.label}(${x.score === null ? '확인 필요' : `${x.score}점`})`).join(', ')}이(가) 기준(70점)에 못 미칩니다.`),
    actions: weak.map((x) => x.fix).filter(Boolean).slice(0, 3),
  };
}

function vouchers(i: AssessmentInput, c: ReportCore): VoucherFit[] {
  const out: VoucherFit[] = [];
  const grade = (id: string) => c.redteam.risks.find((x) => x.id === id)?.grade;
  const q10 = q(i, 'q10'), q12 = q(i, 'q12');
  if (grade('R4') === '높음' || grade('R4') === '중간' || q10 === null || q10 <= 2)
    out.push({ type: '시험·인증', why: `인증·보안 요건 확인 ${q10 === null ? "'모름'" : `${q10}/5`}, 규제·인증 리스크 ${grade('R4') ?? '—'}`, effect: '목표 시장 필수 인증·시험성적 확보 → 규제·인증 리스크 완화', riskId: 'R4' });
  if (grade('R5') === '높음' || grade('R5') === '중간' || (q12 !== null && q12 >= 4 && ev(i, 'q12').k <= 1))
    out.push({ type: '특허·지식재산', why: `차별 요소 ${q12 === null ? "'모름'" : `${q12}/5`}·근거 '${ev(i, 'q12').name}', 증빙·지식재산 리스크 ${grade('R5') ?? '—'}`, effect: '선행조사·출원으로 차별성 입증 → R&D 기술성·지식재산 근거 강화', riskId: 'R5' });
  const ext = c.cards.flatMap((x) => x.rows).filter((r) => r.status === 'gap' && r.route === '외부 협력·기술 도입 검토');
  if (ext.length) out.push({ type: '기술이전·기술자문', why: `보완 필요 기술 ${ext.length}개가 '외부 협력·기술 도입' 경로(예: '${ext[0].roadmapTech}')`, effect: '부족한 기술을 이전·자문으로 확보 → 개발 기간 단축' });
  const data = c.cards.flatMap((x) => x.dataGaps);
  const d2 = q(i, 'd2');
  if (data.length || (d2 !== null && d2 <= 2)) out.push({ type: '데이터 구축·가공', why: data.length ? `원문 핵심기술에 나오는 ${[...new Set(data.map((d) => d.term))].join('·')} 데이터가 보유 데이터에 없음` : `데이터 품질·이력 관리 ${d2}/5`, effect: '학습·검증 데이터 확보 → 기술 고도화 과제의 전제 충족' });
  const top = c.ranked[0];
  if (top && top.tech.trl >= 3 && top.tech.trl <= 5) out.push({ type: '시제품 제작·설계', why: `핵심기술 1위 '${top.tech.name}' TRL ${top.tech.trl}(시제품 전후 단계)`, effect: '시제품으로 다음 검증 관문 통과 → TRL 상승 근거 확보' });
  const p = profile(i.company.bizType);
  if ((p === '제조' || p === '융합') && c.r.m.scale !== null && c.r.m.scale < 50) out.push({ type: '공정 개선 컨설팅', why: `확장준비 ${Math.round(c.r.m.scale)}점(제조형)`, effect: '공정·품질 병목 개선 → 규모 확대 리스크 완화', riskId: 'R6' });
  return out.slice(0, 4);
}

const ELIG_LABEL: Record<keyof Eligibility, string> = {
  lab: '연구전담조직(기업부설연구소·연구개발전담부서)', researchers: '연구 인력', tax: '국세·지방세 체납', default: '채무불이행·부실 상태',
  restriction: '정부 R&D 참여제한', ongoing: '현재 수행 중인 정부과제', cofund: '자부담(현금·현물) 마련', certs: '벤처·이노비즈 등 인증',
};

function eligibility(e: Eligibility = {}): EligItem[] {
  const it = (key: keyof Eligibility, status: EligStatus, note: string): EligItem => ({ key, label: ELIG_LABEL[key], status, note });
  const v = (k: keyof Eligibility) => e[k] ?? '';
  const yes = (k: keyof Eligibility, okNote: string, badNote: string) => v(k) === '없음' ? it(k, '충족', okNote) : v(k) === '있음' ? it(k, '결격 가능성', badNote) : it(k, '확인 필요', '입력 전');
  return [
    v('lab') === '연구소' || v('lab') === '전담부서' ? it('lab', '충족', v('lab') === '연구소' ? '기업부설연구소 보유' : '연구개발전담부서 보유') : v('lab') === '없음' ? it('lab', '주의', '연구전담조직을 요구하는 R&D 사업이 많음 — 공고 확인') : it('lab', '확인 필요', '입력 전'),
    v('researchers') === '' ? it('researchers', '확인 필요', '입력 전') : v('researchers') === '0명' ? it('researchers', '주의', '참여 연구원 구성이 어려움') : it('researchers', '충족', `연구 인력 ${v('researchers')}`),
    yes('tax', '체납 없음', '체납이 있으면 대부분의 지원사업 신청이 제한됨'),
    yes('default', '해당 없음', '채무불이행·부실 상태는 대부분의 지원사업 결격 사유'),
    yes('restriction', '해당 없음', '참여제한 기간에는 정부 R&D 신청 불가'),
    v('ongoing') === '' ? it('ongoing', '확인 필요', '입력 전') : v('ongoing') === '0건' || v('ongoing') === '1건' ? it('ongoing', '충족', `수행 중 ${v('ongoing')}`) : it('ongoing', '주의', `수행 중 ${v('ongoing')} — 사업별 동시 수행 제한 확인`),
    v('cofund') === '가능' ? it('cofund', '충족', '자부담 마련 가능') : v('cofund') === '' ? it('cofund', '확인 필요', '입력 전') : it('cofund', '주의', `자부담 ${v('cofund')} — 현물 비율·매칭 조건 확인`),
    v('certs') === '' ? it('certs', '확인 필요', '입력 전(가점 항목)') : v('certs') === '없음' ? it('certs', '확인 필요', '인증 없음 — 결격은 아니며 가점에서 불리할 수 있음') : it('certs', '충족', `${v('certs')} 보유(가점 가능)`),
  ];
}

export function readiness(i: AssessmentInput, c: ReportCore): ReadinessResult {
  const elig = eligibility(i.company.elig);
  const eligAnswered = Object.values(i.company.elig ?? {}).filter((x) => x !== '' && x !== undefined).length;
  if (c.r.insufficient) {
    return {
      overall: '선행 조건 필요', reason: '응답이 부족해(판단 보류) 신청 준비도를 판단하지 않았습니다. 핵심 문항 8개 이상 응답 후 다시 확인하세요.',
      axes: (Object.keys(AXIS_LABEL) as AxisKey[]).map((key) => ({ key, label: AXIS_LABEL[key], status: '확인 필요', evidence: [], comment: '응답 부족으로 판단 보류', actions: ['핵심진단 문항 응답'] })),
      vouchers: [], eligibility: elig, eligAnswered,
    };
  }
  const ax = axes(i, c);
  const blocked = elig.filter((e) => e.status === '결격 가능성');
  const weak = ax.filter((a) => a.status === '미흡');
  const overall: Readiness = blocked.length || weak.length ? '선행 조건 필요' : ax.every((a) => a.status === '충족') ? '신청 준비됨' : '보완 후 신청';
  const reason = blocked.length
    ? fixParticles(`자격 항목 '${blocked.map((b) => b.label).join("', '")}'이(가) 결격 가능성입니다. 해소 전에는 신청이 제한될 수 있습니다.`)
    : weak.length
      ? `${weak.map((a) => a.label).join(', ')} 관점이 '미흡'입니다. 이 부분을 먼저 보완한 뒤 신청을 검토하세요.`
      : overall === '신청 준비됨'
        ? `${ax.length}개 관점 모두 진단 근거상 큰 보완 사항이 없습니다. 공고별 자격·평가 기준을 확인해 신청을 검토하세요.`
        : `${ax.filter((a) => a.status !== '충족').map((a) => a.label).join(', ')} 관점을 보완하면 신청 준비가 강화됩니다.`;
  return { overall, reason, axes: ax, vouchers: vouchers(i, c), eligibility: elig, eligAnswered };
}
