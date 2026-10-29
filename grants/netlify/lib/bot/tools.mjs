// ============================================================================
// BECONIC 진단툴 목록 — 카카오 챗봇 허브가 안내하는 툴. 툴을 늘릴 때는 이 목록에 한 줄만 추가한다.
//   id: 고유 키 · name: 카드 제목 · area: 분야(메뉴 묶음) · desc: 한 줄 설명(카톡 카드 230자 이내)
//   url: 진단 시작 주소 · kw: 사용자가 이렇게 입력하면 이 툴을 보여준다
// ============================================================================
export const AREAS = ['지원사업', '재무', '인사·조직', '기술', '성장전략'];

export const TOOLS = [
  { id: 'grants', name: '지원사업 MATCH', area: '지원사업',
    desc: '기업마당·K-Startup 공고에서 우리 회사 조건에 맞는 지원사업을 30초 만에 찾아드려요. 회원가입 없이 무료.',
    url: 'https://beconic-grant-matching.netlify.app/', kw: /지원\s*사업|정부\s*지원|보조금|정책\s*자금|공고|매칭/ },
  { id: 'finance', name: '기업 재무진단', area: '재무',
    desc: '3개년 재무자료로 성장성·수익성·안정성·유동성·현금흐름을 진단하고 90일·12개월 재무 로드맵을 제시해요.',
    url: 'https://beconic-diagnosis-finance.netlify.app/', kw: /재무|재무제표|현금\s*흐름|수익성|부채|자금\s*사정/ },
  { id: 'hr', name: 'HR 조직건강 진단', area: '인사·조직',
    desc: '15분 만에 조직 상태·HR 제도·법정 노무 항목을 진단하고 120일 실행 로드맵을 받아보세요.',
    url: 'https://beconic-diagnosis-hr.netlify.app/', kw: /인사|HR|조직|노무|채용|근로|평가\s*제도|급여/ },
  { id: 'tech', name: '기업 기술진단', area: '기술',
    desc: '기술수준·R&D 역량·증빙 신뢰도·기술격차를 분석해 실행 가능한 기술 성장 로드맵을 제시해요.',
    url: 'https://beconic-diagnosis-tech.netlify.app/', kw: /기술|R&D|연구\s*개발|특허|기술\s*사업화/ },
  { id: 'growth', name: '성장활동 진단', area: '성장전략',
    desc: '9개 영역 27개 문항으로 성장 성숙도를 진단하고, 지금 먼저 할 과제·90일 실행계획·KPI를 제시해요.',
    url: 'https://beconic-diagnosis-business-growth.netlify.app/', kw: /성장|전략|마케팅|영업|사업\s*계획|경영\s*진단/ }
];
