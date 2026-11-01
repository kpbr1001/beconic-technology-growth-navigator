// 합성 예시 — 실제 기업 자료가 아님. 화면·보고서에 '합성 예시' 표시가 붙는다.
// 07 문서의 해석 예시(손익 120,000,000원 vs 덱 150,000,000원)를 재현해 불일치 1건이 나오도록 구성했다.
import { blank, nowIso } from './store.js';

export function sampleState() {
  const st = blank();
  const t = nowIso();
  const hist = (by, what) => [{ at: t, by, what }];
  st.meta = { ...st.meta, company: '(합성 예시) 주식회사 샘플랩', baseDate: '2026-09-30', currency: 'KRW', ceo: '김대표(예시)', consultant: '박컨설턴트(예시)',
    disclosure: '예시 데이터입니다. 실제 이해관계 신고가 아닙니다.', synthetic: true };
  const E = (id, name, kind, docDate) => ({ id, name, kind, docDate, note: '', sha256: '', size: 0, version: 1, addedAt: t, history: [{ at: t, v: 1, what: '등록(합성 예시 — 실제 파일 없음)' }] });
  st.evidence = [
    E('E01', 'IR 덱 v3.pdf', '회사 소개·IR 덱', '2026-09-15'),
    E('E02', '2025 매출원장.xlsx', '원장·집계표', '2026-01-31'),
    E('E03', '2025 재무제표(미감사).pdf', '재무제표', '2026-03-20'),
    E('E04', '잔액증명서 2025-12-31.pdf', '증명서', '2026-01-05'),
    E('E05', '주주명부 2026-09-01.pdf', '등기·주주명부', '2026-09-01'),
    E('E06', '고객 인터뷰 기록 12건.xlsx', '정책·내부 기록', '2026-05-30'),
    E('E07', '자금 사용 계획(이사회 승인).pdf', '계약서', '2026-09-20'),
  ];
  const A = (o) => ({ status: 'answer', text: '', fields: {}, links: [], review: 'none', suggestions: [], history: hist('대표', '작성'), ...o });
  st.answers = {
    Q01: A({ text: '중소 제조기업의 설비 점검 일정을 자동으로 관리하는 구독형 소프트웨어를 제공합니다.', links: [{ eid: 'E01', loc: '2쪽' }],
      suggestions: [{ id: 'S1', by: '박컨설턴트(예시)', at: t, text: '소개서 2쪽의 고객 표기("50인 이하 제조기업")와 맞추면 문서 간 표현이 같아집니다.', proposed: '50인 이하 제조기업의 설비 점검 일정을 자동으로 관리하는 구독형 소프트웨어를 제공합니다.', status: 'open' }] }),
    Q02: A({ text: '2026년 4~5월 제조기업 12곳 생산관리 담당자 인터뷰에서 점검 누락 문제를 기록했습니다.', links: [{ eid: 'E06', loc: '시트1 2~13행' }] }),
    Q03: A({ text: '엑셀 수기 관리, 범용 그룹웨어 일정 기능(각 공식 페이지 확인일 2026-09-10).' }),
    Q04: A({ text: '제공 중: 점검 일정 알림, 점검표 모바일 작성. 개발 중: 부품 재고 연동.', links: [{ eid: 'E01', loc: '5쪽' }] }),
    Q05: A({ status: 'unknown' }),
    Q07: A({ fields: { start: '2025-01', end: '2025-12', currency: 'KRW', ledger: '120,000,000', contract: '180,000,000', definition: '부가세 제외, 총액 기준' }, links: [{ eid: 'E02', loc: '합계 시트 B42' }] }),
    Q08: A({ text: '사업장당 월 300,000원(부가세 별도), 연 단위 계약.', links: [{ eid: 'E01', loc: '9쪽' }] }),
    Q09: A({ fields: { asOf: '2025-12-31', paid: '38', free: '210', total: '248', exclusive: true } }),
    Q10: A({ fields: { start: '2025-01', end: '2025-12', base: '30', kept: '22' } }),
    Q11: A({ status: 'request', reqTo: '영업팀장(예시)', reqDue: '2026-10-15', reqNote: '접촉·LOI·계약·납품·수금 단계별 목록' }),
    Q12: A({ text: '설비 점검 일정 최적화 방법 특허 출원 1건.', review: 'asked', askNote: '출원번호와 출원인 명의를 확인할 수 있는 자료(출원서 1쪽)를 연결해 주세요.' }),
    Q13: A({ status: 'na', naReason: '외부 오픈소스·데이터를 쓰지 않는다고 대표가 진술(목록 미작성).' }),
    Q15: A({ text: '대표: 영업·재무 / 공동창업자: 개발 총괄 / 직원 3명: 개발 2, 고객지원 1 (2026-09-01 기준)', review: 'reviewer', reviewedBy: '박컨설턴트(예시)', reviewedAt: t, reviewScope: ['서류 존재 확인'] }),
    Q17: A({ fields: { asOf: '2026-09-01', issued: '100,000', holders: [{ name: '김대표(예시)', cls: '보통주', shares: '70,000' }, { name: '공동창업자(예시)', cls: '보통주', shares: '20,000' }, { name: '엔젤투자자(예시)', cls: '보통주', shares: '10,000' }] }, links: [{ eid: 'E05', loc: '1쪽' }] }),
    Q19: A({ status: 'unknown' }),
    Q20: A({ fields: { currency: 'KRW', audit: '미감사(내부 작성)', std: '일반기업회계기준', pStart: '2024-01', pEnd: '2024-12', pRev: '80,000,000', cStart: '2025-01', cEnd: '2025-12', cRev: '120,000,000' }, links: [{ eid: 'E03', loc: '손익계산서 1쪽' }] }),
    Q21: A({ fields: { asOf: '2025-12-31', currency: 'KRW', total: '310,000,000', restricted: '90,000,000' }, links: [{ eid: 'E04', loc: '1쪽' }] }),
    Q22: A({ fields: { start: '2025-01-01', end: '2025-12-31', currency: 'KRW', open: '150,000,000', op: '-240,000,000', inv: '-20,000,000', fin: '420,000,000', close: '310,000,000' }, links: [{ eid: 'E03', loc: '현금흐름표 3쪽' }] }),
    Q23: A({ fields: { rows: [
      { metric: '매출(Q07 원장)', label: '2025년 매출', page: '11', deck: '1.5억', unit: 'KRW', period: '2025' },
      { metric: '고객 수(Q09)', label: '누적 고객', page: '12', deck: '248', unit: '명', period: '2025-12-31' },
      { metric: '현금 잔액(Q21)', label: '보유 현금', page: '14', deck: '3.1억', unit: 'KRW', period: '2025-12-31' },
    ] }, links: [{ eid: 'E01', loc: '11·12·14쪽' }] }),
    Q24: A({ fields: { currency: 'KRW', amount: '10억', written: '2026-09-20', approvedBy: '이사회(2026-09-20 결의)', uses: [{ item: '인건비', amt: '550,000,000' }, { item: '마케팅', amt: '250,000,000' }, { item: '연구개발', amt: '200,000,000' }] }, links: [{ eid: 'E07', loc: '1쪽 표' }] }),
  };
  return st;
}
