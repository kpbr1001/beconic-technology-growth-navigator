// 지원사업 신청 준비도(규칙 기반) — R&D 과제 4관점 판정·기술바우처 활용 후보·공통 자격 체크리스트.
// 원칙: '선정 가능성'이 아니라 '신청 전에 보완할 점'을 말한다. 특정 사업명은 쓰지 않는다(연도별 변동).
// 관점·기준은 일반적인 R&D 평가 관행으로 만든 시범 기준이며 전문가 검증 대상이다.
import { evidenceLevel, profile } from '../diagnosis/questions';
import type { AssessmentInput, Eligibility } from '../diagnosis/types';
import type { Readiness } from '../diagnosis/rnd';
import type { ReportCore } from './core';

export type AxisStatus = '충족' | '보완' | '미흡' | '확인 필요';
export type AxisKey = 'tech' | 'capacity' | 'market' | 'policy';
export const AXIS_LABEL: Record<AxisKey, string> = { tech: '기술성', capacity: '수행 역량', market: '사업화·검증', policy: '정책 연계' };

export interface Axis {
  key: AxisKey;
  label: string;
  status: AxisStatus;
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
  const top = c.ranked[0];
  const crit = c.ranked.length;
  const lab = i.company.elig?.lab ?? '';

  // 기술성: 핵심기술 TRL·차별 요소(q12)와 그 근거
  const q12 = q(i, 'q12'), e12 = ev(i, 'q12');
  const tEv = [top ? `핵심기술 1위 '${top.tech.name}' ${top.tech.trl ? `TRL ${top.tech.trl}` : 'TRL 확인 필요'}` : '핵심기술 미지정', `Q12 차별 요소 ${q12 === null ? "'모름'·미응답" : `${q12}/5 · 근거 '${e12.name}'`}`, `기술성숙 ${fmt(m.tech)}`];
  const tIssues: string[] = [], tAct: string[] = [];
  if (!top) { tIssues.push('과제의 중심이 될 핵심기술이 지정되지 않았습니다'); tAct.push('3단계에서 핵심기술 지정·TRL 입력'); }
  else if (!top.tech.trl) { tIssues.push(`'${top.tech.name}'의 현재 TRL이 확인되지 않아 개발 목표(TRL)를 정할 수 없습니다`); tAct.push('핵심기술 TRL과 근거(시험기록) 확인'); }
  else if (top.tech.trl >= 8) tIssues.push(`TRL ${top.tech.trl}은 기술개발보다 실증·사업화 과제에 가깝습니다`);
  if (q12 === null || q12 <= 2) { tIssues.push('경쟁 기술 대비 차별성이 약하거나 확인되지 않았습니다'); tAct.push('경쟁·선행기술 조사와 성능 비교표 작성'); }
  else if (e12.k <= 1) { tIssues.push(`차별 요소를 높게 답했지만 근거가 '${e12.name}' 수준입니다`); tAct.push('특허 선행조사·성능 비교 데이터로 차별성 입증'); }
  const tStatus: AxisStatus = !top || !top.tech.trl || q12 === null || q12 <= 2 ? '미흡' : top.tech.trl >= 3 && top.tech.trl <= 7 && q12 >= 4 && e12.k >= 2 ? '충족' : '보완';

  // 수행 역량: R&D 역량·기술기록·연구전담조직·핵심 인력 의존
  const r3 = c.redteam.risks.find((x) => x.id === 'R3');
  const cEv = [`R&D 역량 ${fmt(m.rd)}`, `기술기록 ${fmt(m.evidence)}`, `연구전담조직 ${lab || '미입력'}`, ...(r3 ? [`핵심 인력 의존 리스크 ${r3.grade}`] : [])];
  const cIssues: string[] = [], cAct: string[] = [];
  if (m.rd !== null && m.rd < 60) { cIssues.push('연구 자원·개발 반복 체계가 과제 수행 계획으로 설명되기에 부족합니다'); cAct.push('연구 인력·장비·예산 계획표와 개발-시험-개선 절차 문서화'); }
  if (m.evidence !== null && m.evidence < 55) { cIssues.push('연구노트·시험기록이 정비되지 않아 기술 실체를 증빙하기 어렵습니다'); cAct.push('연구노트·시험기록·버전 이력 정비'); }
  if (lab === '없음') { cIssues.push('연구전담조직이 없으면 신청이 제한되는 R&D 사업이 많습니다'); cAct.push('연구개발전담부서 또는 기업부설연구소 설립 검토'); }
  if (r3?.grade === '높음') { cIssues.push('핵심 노하우가 특정 인력에 몰려 있어 수행 안정성을 설명하기 어렵습니다'); cAct.push('참여 연구원 구성·백업 담당 지정'); }
  const cStatus: AxisStatus = m.rd === null || m.evidence === null ? '확인 필요' : m.rd < 45 || m.evidence < 40 || lab === '없음' ? '미흡' : m.rd >= 60 && m.evidence >= 55 && r3?.grade !== '높음' ? '충족' : '보완';

  // 사업화·검증: 실제환경 검증(q2)·검증 경험·확장준비
  const q2 = q(i, 'q2');
  const val = (i.discovery.validation ?? '').trim();
  const mEv = [`Q2 실제환경 검증 ${q2 === null ? "'모름'·미응답" : `${q2}/5 · 근거 '${ev(i, 'q2').name}'`}`, `검증 경험 ${val ? `'${val.slice(0, 30)}${val.length > 30 ? '…' : ''}'` : '미입력'}`, `확장준비 ${fmt(m.scale)}`];
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
  const pEv = [`로드맵 후보 ${strong ? `'${strong.name}'(${sid}${strong.page ? ` p.${strong.page}` : ''})` : '품목 단위 후보 없음'}`, `핵심기술 로드맵 연결 ${c.ranked.filter((x) => x.link).length}/${crit}개`, `Q11 로드맵 연관성 설명 ${q11 === null ? "'모름'·미응답" : `${q11}/5`}`];
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
  return [mk('tech', tStatus, tEv, tIssues, tAct), mk('capacity', cStatus, cEv, cIssues, cAct), mk('market', mStatus, mEv, mIssues, mAct), mk('policy', pStatus, pEv, pIssues, pAct)];
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
    ? `자격 항목 '${blocked.map((b) => b.label).join("', '")}'이(가) 결격 가능성입니다. 해소 전에는 신청이 제한될 수 있습니다.`
    : weak.length
      ? `${weak.map((a) => a.label).join('·')} 관점이 '미흡'입니다. 이 부분을 먼저 보완한 뒤 신청을 검토하세요.`
      : overall === '신청 준비됨'
        ? '4개 관점 모두 진단 근거상 큰 보완 사항이 없습니다. 공고별 자격·평가 기준을 확인해 신청을 검토하세요.'
        : `${ax.filter((a) => a.status !== '충족').map((a) => a.label).join('·')} 관점을 보완하면 신청 준비가 강화됩니다.`;
  return { overall, reason, axes: ax, vouchers: vouchers(i, c), eligibility: elig, eligAnswered };
}
