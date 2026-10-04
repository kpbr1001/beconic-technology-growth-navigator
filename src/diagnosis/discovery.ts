// 기술 발견(규칙 기반): 2단계 '기술 발견' 답변과 제품 설명에서 기술 후보를 찾는다. 외부 전송 없음.
// 후보마다 근거가 된 답변 문장을 그대로 남기고, 상태는 '추정'·담당자 미확인으로 시작한다(사용자가 확인·수정).
import type { AssessmentInput, TechItem } from './types';

export type DiscoveryField = 'hardPart' | 'automated' | 'data' | 'external' | 'people' | 'validation' | 'product' | 'sectorDetail';

export const FIELD_LABEL: Record<DiscoveryField, string> = {
  hardPart: '경쟁사가 따라 하기 가장 어려운 부분', automated: '자동으로 판단·처리되는 부분', data: '계속 쌓이는 데이터',
  external: '외부에 의존하는 부분', people: '기술을 가장 잘 아는 사람', validation: '외부에서 확인된 경험',
  product: '주요 제품·서비스', sectorDetail: '세부 업종·기술분야',
};

export interface TechCandidate {
  name: string;
  type: string;
  ownership: string;
  field: DiscoveryField;
  /** 근거가 된 답변 구절(원문 그대로) */
  quote: string;
  /** 경쟁사가 따라 하기 어려운 부분에서 나온 후보는 핵심기술로 제안 */
  critical: boolean;
}

interface Rule {
  /** 앞에 있는 표현을 우선(구체적인 말 → 일반적인 말) */
  kws: string[];
  type: string;
  name: (kw: string) => string;
  fields?: DiscoveryField[];
  ownership?: string;
}

const PRETTY: Record<string, string> = { '이상\\s?탐지': '이상 탐지', '이상\\s?징후': '이상징후 탐지', '고장\\s?예측': '고장 예측' };
const pretty = (kw: string) => PRETTY[kw] ?? kw.replace(/\\s\?/g, ' ');

/** 위에서부터 우선. 같은 유형은 한 번만 */
const RULES: Rule[] = [
  { kws: ['클라우드', '외부\\s?API', 'LLM', '오픈소스', '외주', '공급사', '게이트웨이', '위탁'], type: '통합기술', name: () => '외부 서비스 연계·통합 기술', fields: ['external'], ownership: '외부' },
  { kws: ['이상\\s?탐지', '이상\\s?징후', '고장\\s?예측', '예지', '예측', '분류', '인식', '추천', '딥러닝', '머신러닝', '알고리즘', '모델'], type: 'AI/알고리즘', name: (k) => `${pretty(k)} 알고리즘·모델` },
  { kws: ['정규화', '전처리', '표준화', '데이터\\s?수집', '라벨링', '데이터베이스', '파이프라인', '센서\\s?데이터', '로그'], type: '데이터기술', name: () => '데이터 수집·정규화 기술' },
  { kws: ['자동화', '자동으로', '실시간', '제어', '로봇'], type: '생산기술', name: () => '자동화·제어 기술' },
  { kws: ['공정', '가공', '사출', '코팅', '용접', '조립', '양산', '배합', '성형'], type: '공정기술', name: () => '생산·공정 기술' },
  { kws: ['소재', '합성', '원료', '부품', '소자', '물질'], type: '원천기술', name: () => '소재·부품 기술' },
  { kws: ['설계', '회로', '기구', '하드웨어', '디바이스', '장비', '모듈'], type: '설계기술', name: () => '제품 설계·하드웨어 기술' },
  { kws: ['검사', '품질', '측정', '불량'], type: '품질기술', name: () => '품질·검사 기술' },
  { kws: ['보안', '암호', '개인정보'], type: '핵심기술', name: () => '보안 기술' },
  { kws: ['바이오', '세포', '항체', '유전자', '진단키트', '의약', '임상'], type: '원천기술', name: () => '바이오 핵심 기술' },
  { kws: ['배터리', '이차전지', '에너지', '전력', '태양광', '수소', '원전'], type: '원천기술', name: () => '에너지 핵심 기술' },
  { kws: ['플랫폼', 'SaaS', '대시보드', '앱', '소프트웨어', '솔루션', '시스템'], type: '응용기술', name: () => '서비스 플랫폼·소프트웨어' },
  { kws: ['컨설팅', '교육 서비스', '서비스 프로세스', '운영\\s?방식', '매뉴얼'], type: '서비스기술', name: () => '서비스 운영 노하우' },
];

/** 답변을 읽는 순서: 차별 요소 → 자동화 → 데이터 → 제품 → 업종 → 외부 의존.
 *  '외부에서 확인된 경험'은 고객사 이름(예: B부품)이 섞여 오탐이 많아 규칙에서는 읽지 않는다(AI 찾기에서만 사용) */
const ORDER: DiscoveryField[] = ['hardPart', 'automated', 'data', 'product', 'sectorDetail', 'external'];

/** 일치한 곳이 들어 있는 구절(문장·쉼표 단위, 최대 70자) */
function clauseAround(text: string, index: number): string {
  const parts = text.split(/(?<=[.。!?\n])|(?<=,)\s*/);
  let pos = 0;
  for (const p of parts) {
    if (index >= pos && index < pos + p.length) return p.trim().replace(/[,.\s]+$/, '').slice(0, 70);
    pos += p.length;
  }
  return text.slice(Math.max(0, index - 20), index + 40).trim();
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

export function discoverCandidates(
  input: Pick<AssessmentInput, 'company' | 'discovery'>,
  existing: { name: string; type?: string }[] = [],
): TechCandidate[] {
  const text: Record<DiscoveryField, string> = {
    ...input.discovery,
    product: input.company.product ?? '',
    sectorDetail: input.company.sectorDetail ?? '',
  } as Record<DiscoveryField, string>;
  const out: TechCandidate[] = [];
  const seenType = new Set<string>(existing.map((x) => x.type ?? '').filter(Boolean));
  const seenName = new Set(existing.map((x) => norm(x.name)));
  for (const field of ORDER) {
    const t = (text[field] ?? '').trim();
    if (!t) continue;
    for (const rule of RULES) {
      if (rule.fields && !rule.fields.includes(field)) continue;
      if (!rule.fields && field === 'external') continue; // 외부 의존 답변은 연계 기술 후보로만
      let m: RegExpExecArray | null = null, kw = '';
      for (const k of rule.kws) {
        m = new RegExp(k).exec(t);
        if (m) { kw = k; break; }
      }
      if (!m) continue;
      const name = rule.name(kw);
      if (seenType.has(rule.type) || seenName.has(norm(name))) continue;
      seenType.add(rule.type);
      seenName.add(norm(name));
      out.push({
        name, type: rule.type, ownership: rule.ownership ?? '확인필요', field,
        quote: clauseAround(t, m.index), critical: field === 'hardPart',
      });
    }
  }
  return out.slice(0, 6);
}

/** 후보 → 핵심기술 목록 행(추정·미확인, TRL 확인 필요) */
export function toTechItems(cands: TechCandidate[], startId = 1): TechItem[] {
  const anyCritical = cands.some((c) => c.critical);
  return cands.map((c, i) => ({
    id: startId + i, name: c.name, type: c.type, ownership: c.ownership, status: '추정',
    critical: anyCritical ? c.critical : i < 2, trl: 0, confirmed: false,
  }));
}
