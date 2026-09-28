// ReportViewModel: 화면·PDF가 공통으로 쓰는 보고서 데이터. 렌더러는 이 객체만 읽고 계산하지 않는다(Phase 6에서 확장).
import { activeQuestions, evidenceLevel } from '../diagnosis';
import type { AssessmentInput, AssessmentResult, Versions } from '../diagnosis';

export const ISSUER = {
  company: '그로스벤처스 주식회사',
  shortName: '그로스벤처스(주)',
  certification: '중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호',
  certificationShort: '중기부 인증 중소기업상담회사 제2025-684호',
  address: '서울시 구로구 디지털로27길 24, 209호',
  phone: '070-4103-4177',
  email: 'start@gven.kr',
  web: 'www.beconic.kr',
} as const;

export interface DataQuality {
  /** 응답완료율 % */
  complete: number;
  /** 근거강도 평균 % */
  evidenceAvg: number;
  /** 기술 확인율 % */
  techConfirmed: number;
  consistencyWarnings: number;
  roadmapFieldSet: boolean;
}

export interface ReportViewModel {
  reportId: string;
  generatedAt: string;
  companyName: string;
  versions: Versions;
  issuer: typeof ISSUER;
  quality: DataQuality;
}

export function reportId(companyName: string, d = new Date()): string {
  const ds = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('');
  const nm = (companyName || 'COMPANY').replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 12) || 'COMPANY';
  return `BTN-${ds}-${nm}`;
}

export function dataQuality(input: AssessmentInput, r: AssessmentResult): DataQuality {
  const qs = activeQuestions(input.mode, input.company.bizType);
  const inv = input.inventory;
  return {
    complete: Math.round((r.answered / qs.length) * 100),
    evidenceAvg: Math.round((qs.reduce((s, q) => s + evidenceLevel(input.evidence, q.id).m, 0) / qs.length) * 100),
    techConfirmed: Math.round((inv.filter((x) => x.confirmed || x.status === '확정').length / Math.max(1, inv.length)) * 100),
    consistencyWarnings: r.alerts.length,
    roadmapFieldSet: input.company.roadmapField !== '기타/미정',
  };
}

export function buildReportViewModel(input: AssessmentInput, r: AssessmentResult, now = new Date()): ReportViewModel {
  const companyName = input.company.name || '';
  return {
    reportId: reportId(companyName, now),
    generatedAt: now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    companyName: companyName || '진단기업',
    versions: r.versions,
    issuer: ISSUER,
    quality: dataQuality(input, r),
  };
}
