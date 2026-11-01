// 출처 원장(SourceRegistry)과 문항 원장(QuestionRegistry) — 08_진단문항_출처_검증원장 v2 기준.
// 원칙: 질문은 공식 자료의 '주제'를 근거로 자체 작성했다. 기관이 문항을 승인·인증한 것이 아니다.
//       문항의 전문가 검토·사용성 시험·성과(예측) 타당도는 실제로 수행 전까지 '미검증'으로 둔다.

export const REGISTRY_VERSION = 'QR-2026.11.01';
export const SOURCES_CHECKED_AT = '2026-10-31'; // 08 문서 작성 시 공식 자료 확인일 (이 앱이 다시 열람한 날짜가 아님)

export const SOURCES = [
  { id: 'S01', title: 'Writing a Business Plan', publisher: 'Sequoia Capital', url: 'https://articles.sequoiacap.com/writing-a-business-plan',
    locator: 'Company purpose · Problem · Solution · Why now · Market potential · Competition · Business model · Team · Financials',
    kind: '투자 설명 가이드', limit: '투자 설명 가이드이며 점수·합격 기준이 아닙니다.' },
  { id: 'S02', title: 'A Guide to Seed Fundraising', publisher: 'Y Combinator', url: 'https://www.ycombinator.com/blog/how-to-raise-a-seed-round',
    locator: 'Executive summary 및 덱 구성 1~12 항목',
    kind: '투자 설명 가이드', limit: '시드 조달 가이드입니다. 모든 중소기업에 일률 적용하지 않습니다.' },
  { id: 'S03', title: 'IAS 7 Statement of Cash Flows (공식 개요)', publisher: 'IFRS Foundation', url: 'https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/',
    locator: 'About: 현금·현금성자산, 영업·투자·재무 활동 구분',
    kind: '회계기준 개요', limit: '개요만 참조합니다. IFRS 준수 판정이나 국내 회계기준을 대신하지 않습니다.' },
  { id: 'S04', title: 'Management Commentary — Key terms', publisher: 'IFRS Foundation', url: 'https://www.ifrs.org/supporting-implementation/supporting-materials-by-ifrs-standards/management-commentary/key-terms/',
    locator: 'Management commentary · Material information · Metric',
    kind: '공시 원칙 참고', limit: '투자자 정보 관련 원칙만 참조합니다. 실무서 준수 인증이 아닙니다.' },
  { id: 'S05', title: 'Enterprising Ideas (2021)', publisher: 'WIPO', url: 'https://www.wipo.int/edocs/pubdocs/en/wipo_pub_961.pdf',
    locator: '본문 인쇄 p.38~43 라이선스·양도, p.51~56 위험·권리, p.64 IP audit',
    kind: '지식재산 안내서', limit: '권리 유효성·비침해에 대한 법률 의견이 아닙니다.' },
  { id: 'S06', title: 'NVCA Model Legal Documents', publisher: 'NVCA', url: 'https://nvca.org/model-legal-documents/',
    locator: '정관 · 주식인수 · 투자자 권리 · 의결권 · 우선매수/공동매도 문서 목록',
    kind: '미국 VC 표준계약 목록', limit: '미국 VC 문서 체계입니다. 한국 법률 판단에 사용하지 않습니다.' },
  { id: 'S07', title: 'NIST Cybersecurity Framework 2.0 — Small Business', publisher: 'NIST', url: 'https://www.nist.gov/itl/smallbusinesscyber/nist-cybersecurity-framework-0',
    locator: 'Govern · Identify · Protect · Detect · Respond · Recover, Small Business Quick Start',
    kind: '자발적 보안 관리 체계', limit: '보안 인증이나 완전한 점검표가 아닙니다.' },
  { id: 'S08', title: 'VIMA 2.0 Model Legal Documents', publisher: 'SVCA', url: 'https://www.svca.org.sg/model-legal-documents',
    locator: 'Series A·Pre-Series A 문서 목록: 계약·전환·옵션·창업자·직원 IP 양도',
    kind: '싱가포르 VC 표준계약 목록', limit: '싱가포르 문서 체계입니다. 관할별 별도 검토가 필요합니다.' },
];

export const SECTIONS = [
  { id: 'A', title: '회사·고객·제품', en: 'Company, Customer & Product', report: 4 },
  { id: 'B', title: '시장·영업 실적', en: 'Market & Commercial Evidence', report: 5 },
  { id: 'C', title: '기술·지식재산', en: 'Technology & IP', report: 6 },
  { id: 'D', title: '팀·지배구조', en: 'Team & Governance', report: 7 },
  { id: 'E', title: '재무·현금', en: 'Historical Financials & Cash', report: 8 },
  { id: 'F', title: '경영진 제출 조달 요청', en: 'Management-Submitted Funding Request', report: 9 },
];

const CUR = { k: 'currency', label: '통화', type: 'currency' };

// fields: 검증 규칙이 쓰는 구조화 입력. 금액은 정수 또는 소수 둘째 자리까지(원 단위 등 표시 통화 기준).
export const QUESTIONS = [
  { id: 'Q01', sec: 'A', q: '회사는 누구에게 어떤 제품·서비스를 제공하나요?',
    why: '투자자는 회사가 하는 일을 한 문장으로 이해할 수 있는지부터 확인합니다. 소개서·서비스 페이지와 같은 표현인지 대조합니다.',
    src: [['S01', 'Company purpose'], ['S02', '덱 항목 1·5']], ex: ['회사 소개서', '서비스 페이지 캡처'],
    check: '사업 설명과 문서 표기를 대조합니다. 가치의 우수성은 판정하지 않습니다.', rules: ['R-DOC-01'] },
  { id: 'Q02', sec: 'A', q: '고객이 겪는 문제를 확인한 자료가 있나요?',
    why: '문제가 실제 고객에게서 확인된 것인지, 누가·언제 말했는지 기록이 있는지 봅니다.',
    src: [['S01', 'Problem'], ['S02', '덱 항목 3·4']], ex: ['고객 인터뷰 기록', '문의·VOC', '설문 결과'],
    check: '대상·날짜·문제 내용이 기록되어 있는지 확인합니다. 표본의 대표성은 자동으로 확정하지 않습니다.', rules: ['R-DOC-01'] },
  { id: 'Q03', sec: 'A', q: '고객이 지금 쓰고 있는 대안은 무엇인가요?',
    why: '고객이 지금 문제를 어떻게 해결하고 있는지(경쟁 제품·수작업 등)를 출처와 함께 정리합니다.',
    src: [['S01', 'Competition']], ex: ['고객 기록', '대안 서비스의 공식 페이지 링크(확인일 포함)'],
    check: '대안별 출처와 확인일을 등록합니다. "경쟁사 없음"처럼 근거 없는 판단은 쓰지 않습니다.', rules: ['R-DOC-01'] },
  { id: 'Q04', sec: 'A', q: '제품이 현재 제공하는 기능은 어디서 확인할 수 있나요?',
    why: '이미 제공 중인 기능과 개발 중인 기능을 구분해 두면 투자자 질문에 정확히 답할 수 있습니다.',
    src: [['S01', 'Solution'], ['S02', '덱 항목 5']], ex: ['데모 영상', '제품 설명서', '시험 기록'],
    check: '제공 중/개발 중을 나눠 기록합니다. 성능의 우월성은 판단하지 않습니다.', rules: ['R-DOC-01'] },
  { id: 'Q06', sec: 'A', q: '사업을 시작한 배경(제도·기술·고객 변화)의 출처가 있나요?',
    why: '"왜 지금인가"로 제시한 변화가 어떤 자료에 근거하는지 날짜와 함께 연결합니다.',
    src: [['S01', 'Why now']], ex: ['제도 개정 공고', '기술·고객 행동 관련 공식 자료'],
    check: '출처와 날짜를 연결합니다. 진입 시점이 적절한지는 판단하지 않습니다.', rules: ['R-DOC-01'] },

  { id: 'Q05', sec: 'B', q: '현재 확인된 고객 범위와 시장 자료는 무엇인가요?',
    why: '시장 규모 숫자보다 먼저, 어떤 지역·연도·정의의 자료인지가 분명해야 합니다.',
    src: [['S01', 'Market potential'], ['S02', '덱 항목 6']], ex: ['고객 세그먼트 정의', '공식 통계(발행기관·연도)'],
    check: '지역·연도·정의·출처를 확인합니다. 시장 규모(TAM 등)를 자동으로 계산하지 않습니다.', rules: ['R-DOC-01'] },
  { id: 'Q07', sec: 'B', q: '실제 매출은 어떤 상품과 계약에서 발생했나요?',
    why: '계약 금액과 실제로 인식한 매출은 다릅니다. 같은 기간의 매출원장 합계를 기준으로 덱·재무자료와 대조합니다.',
    src: [['S01', 'Business model'], ['S02', '덱 항목 9']], ex: ['매출원장', '주요 계약서'],
    check: '상품·기간·매출 정의를 확인하고 계약액과 인식 매출을 구분합니다.', rules: ['R-REV-01'],
    fields: [
      { k: 'start', label: '집계 시작 월', type: 'month' }, { k: 'end', label: '집계 종료 월', type: 'month' }, CUR,
      { k: 'ledger', label: '매출원장 합계(인식 매출)', type: 'money' },
      { k: 'contract', label: '같은 기간 계약 금액 합계(선택)', type: 'money', optional: true },
      { k: 'definition', label: '매출 정의(예: 부가세 제외, 총액/순액)', type: 'text', optional: true },
    ] },
  { id: 'Q08', sec: 'B', q: '현재 가격과 과금 단위를 확인할 수 있나요?',
    why: '가격표·견적·계약서의 가격과 과금 주기가 서로 같은지 봅니다.',
    src: [['S01', 'Business model']], ex: ['가격표', '견적서', '계약서 가격 조항'],
    check: '가격·통화·과금 주기를 대조합니다. 가격 경쟁력은 판정하지 않습니다.', rules: ['R-DOC-01'] },
  { id: 'Q09', sec: 'B', q: '확인 가능한 고객 수·이용 실적은 얼마인가요?',
    why: '고객 수는 기준일·유료/무료·중복 제거 기준에 따라 달라집니다. 정의와 집계를 함께 남깁니다.',
    src: [['S02', '덱 항목 8']], ex: ['고객·이용 집계표(기준일 표시)'],
    check: '기준일·유료/무료·중복 정의와 집계를 연결합니다.', rules: ['R-CUST-01'],
    fields: [
      { k: 'asOf', label: '집계 기준일', type: 'date' },
      { k: 'paid', label: '유료 고객 수', type: 'count' }, { k: 'free', label: '무료 고객 수', type: 'count', optional: true },
      { k: 'total', label: '전체 고객 수', type: 'count' },
      { k: 'exclusive', label: '유료·무료는 서로 겹치지 않게 집계했어요', type: 'check', optional: true },
    ] },
  { id: 'Q10', sec: 'B', q: '고객의 반복 구매·갱신·사용 기록이 있나요?',
    why: '재구매·갱신은 대상(분모)·기간이 맞아야 의미가 있습니다. 과거 기록만 계산하고 앞으로의 유지율은 만들지 않습니다.',
    src: [['S02', '덱 항목 8']], ex: ['갱신·재구매 목록', '코호트 표'],
    check: '대상·분모·기간이 일치하는지 확인합니다. 미래 유지율은 계산하지 않습니다.', rules: ['R-RET-01'],
    fields: [
      { k: 'start', label: '관찰 시작 월', type: 'month' }, { k: 'end', label: '관찰 종료 월', type: 'month' },
      { k: 'base', label: '시작 시점 고객 수(분모)', type: 'count' }, { k: 'kept', label: '종료 시점까지 갱신·재구매한 고객 수', type: 'count' },
    ] },
  { id: 'Q11', sec: 'B', q: '고객을 확보한 경로와 계약 진행 상태는 무엇인가요?',
    why: '접촉·LOI·계약·납품·수금은 서로 다른 단계입니다. 단계를 섞지 않고 목록으로 정리합니다.',
    src: [['S02', '덱 항목 4·8']], ex: ['영업 기록', '계약·LOI 목록'],
    check: '접촉·LOI·계약·납품·수금 상태를 구분합니다. 수주 가능성은 계산하지 않습니다.', rules: ['R-DOC-01'] },

  { id: 'Q12', sec: 'C', q: '핵심 기술·콘텐츠·브랜드를 소유하거나 사용할 권리가 있나요?',
    why: '권리자·범위·기간이 문서로 연결되어 있어야 투자자 실사에서 막히지 않습니다.',
    src: [['S05', 'p.38~43 · p.52'], ['S08', 'IP 양도 문서 목록']], ex: ['특허·상표 목록', '양도·라이선스 계약'],
    check: '권리자·범위·기간과 서류를 연결합니다. 법적 유효성은 별도 전문가 검토 대상입니다.', rules: ['R-DOC-01'], expert: '법률·IP' },
  { id: 'Q13', sec: 'C', q: '외부 기술·오픈소스·데이터의 사용 조건을 정리했나요?',
    why: '외부 구성요소의 사용 조건을 목록으로 남겨 두면 실사 질문에 바로 답할 수 있습니다.',
    src: [['S05', 'p.51~56']], ex: ['오픈소스·외부 API 의존성 목록', '데이터 사용 계약'],
    check: '문서가 있는지와 사용 범위를 연결합니다. 비침해를 보증하지 않습니다.', rules: ['R-DOC-01'], expert: '법률·IP' },
  { id: 'Q14', sec: 'C', q: '개발 결과와 시험 조건을 확인할 자료가 있나요?',
    why: '시험 결과는 날짜·환경·버전·측정 단위가 함께 있어야 다시 확인할 수 있습니다.',
    src: [['S01', 'Solution'], ['S05', '기술 스타트업 관련 장']], ex: ['시험 성적서', '내부 시험 기록(일자·환경·버전)'],
    check: '조건·버전·측정 단위를 확인합니다. 외부 인증 여부는 따로 표시합니다.', rules: ['R-DOC-01'] },

  { id: 'Q15', sec: 'D', q: '핵심 팀원의 현재 역할과 담당 업무는 무엇인가요?',
    why: '기준일 현재 누가 무엇을 책임지는지 정리합니다. 개인 역량을 점수로 매기지 않습니다.',
    src: [['S01', 'Team'], ['S02', '덱 항목 10']], ex: ['역할표', '조직도(기준일 표시)'],
    check: '기준일·역할·책임을 확인합니다.', rules: ['R-DOC-01'] },
  { id: 'Q16', sec: 'D', q: '창업자·직원의 참여 및 지식재산 귀속 문서가 있나요?',
    why: '회사가 만든 결과물이 회사에 귀속된다는 문서가 있는지 봅니다.',
    src: [['S08', "Founders' Agreement · Employee IP Assignment"]], ex: ['창업자 간 계약', '직무발명·IP 귀속 확인서'],
    check: '당사자·체결일·서명 여부를 확인합니다. 적법성 판단은 별도입니다.', rules: ['R-DOC-01'], expert: '법률' },
  { id: 'Q17', sec: 'D', q: '주주·주식·옵션·전환증권의 현재 기록이 있나요?',
    why: '주주명부와 cap table의 합계가 같은 기준일에 맞는지 확인합니다.',
    src: [['S06', '정관·주식인수 문서 체계'], ['S08', '전환·옵션 문서 목록']], ex: ['주주명부', 'cap table', '옵션·전환사채 계약'],
    check: '증권 종류·발행일·합계·기준일을 대조합니다. 미래 전환 결과는 계산하지 않습니다.', rules: ['R-CAP-01'], expert: '법률',
    fields: [
      { k: 'asOf', label: '주주명부 기준일', type: 'date' },
      { k: 'issued', label: '발행주식 총수(주주명부·등기 기준)', type: 'count' },
      { k: 'holders', label: '주주별 보유 주식', type: 'rows', cols: [{ k: 'name', label: '주주', type: 'text', sensitive: true }, { k: 'cls', label: '종류', type: 'text' }, { k: 'shares', label: '주식 수', type: 'count' }] },
    ] },
  { id: 'Q18', sec: 'D', q: '중요 계약상 권리·의무를 확인할 수 있나요?',
    why: '투자자 권리·의결권·주요 거래 계약의 의무가 문서와 설명에서 같은지 봅니다.',
    src: [['S06', '투자자 권리·의결권 문서'], ['S08', '계약 목록']], ex: ['기존 투자계약', '주요 거래 계약', '이사회·주총 결의'],
    check: '문서와 의무 설명을 연결합니다. 관할별 법률 결론은 내리지 않습니다.', rules: ['R-DOC-01'], expert: '법률' },
  { id: 'Q19', sec: 'D', q: '보안 관리·사고 대응 담당자와 기록이 있나요?',
    why: '누가 접근 권한·백업·사고 대응을 맡는지, 기록이 있는지 확인합니다.',
    src: [['S07', '6개 기능 · Small Business 안내']], ex: ['보안 담당 지정', '접근 권한 관리 기록', '백업·복구 기록'],
    check: '자료가 있는지와 범위를 확인합니다. NIST 인증으로 표시하지 않습니다.', rules: ['R-DOC-01'], expert: '보안' },

  { id: 'Q20', sec: 'E', q: '과거 실적 재무 자료의 기간·통화·기준은 무엇인가요?',
    why: '재무자료는 기간·단위·작성 주체·감사 여부가 표시되어야 다른 자료와 대조할 수 있습니다.',
    src: [['S01', 'Financials'], ['S04', 'Material information · Metric']], ex: ['손익계산서', '재무상태표', '감사보고서(있는 경우)'],
    check: '기간·단위·작성 주체·감사 여부를 표시합니다. 회계 적정성 의견은 만들지 않습니다.', rules: ['R-GROW-01', 'R-REV-01'], expert: '회계',
    fields: [
      CUR,
      { k: 'audit', label: '감사 상태', type: 'select', options: ['외부감사 받음', '검토만 받음', '미감사(내부 작성)'] },
      { k: 'std', label: '회계기준(예: 일반기업회계기준, K-IFRS)', type: 'text', optional: true },
      { k: 'pStart', label: '전기 시작 월', type: 'month', optional: true }, { k: 'pEnd', label: '전기 종료 월', type: 'month', optional: true },
      { k: 'pRev', label: '전기 매출액', type: 'money', optional: true },
      { k: 'cStart', label: '당기 시작 월', type: 'month' }, { k: 'cEnd', label: '당기 종료 월', type: 'month' },
      { k: 'cRev', label: '당기 매출액', type: 'money' },
    ] },
  { id: 'Q21', sec: 'E', q: '현금 잔액과 사용 제한 내역을 확인할 수 있나요?',
    why: '통장에 있는 돈 전부를 쓸 수 있는 건 아닙니다. 담보·정부지원금처럼 사용이 제한된 금액을 구분합니다.',
    src: [['S03', '현금·현금성자산']], ex: ['잔액증명서', '사용 제한 내역(정부지원금 전용계좌 등)'],
    check: '같은 기준일로 대조하고 가용 현금과 총잔액을 구분합니다.', rules: ['R-CASH-01', 'R-CASH-02'],
    fields: [
      { k: 'asOf', label: '잔액 기준일', type: 'date' }, CUR,
      { k: 'total', label: '현금·현금성자산 총잔액', type: 'money' },
      { k: 'restricted', label: '사용 제한 금액', type: 'money' },
    ] },
  { id: 'Q22', sec: 'E', q: '영업·투자·재무 현금흐름을 구분했나요?',
    why: '기초 현금에 세 활동의 순변동을 더하면 기말 현금과 같아야 합니다.',
    src: [['S03', '영업·투자·재무 활동 구분']], ex: ['현금흐름표', '계좌 거래 집계'],
    check: '기초 + 순변동 = 기말을 대사합니다. 분류의 회계 적정성은 별도 검토 대상입니다.', rules: ['R-CF-01', 'R-CASH-02'], expert: '회계',
    fields: [
      { k: 'start', label: '기간 시작일', type: 'date' }, { k: 'end', label: '기간 종료일', type: 'date' }, CUR,
      { k: 'open', label: '기초 현금', type: 'money' },
      { k: 'op', label: '영업활동 순현금흐름', type: 'money' }, { k: 'inv', label: '투자활동 순현금흐름', type: 'money' }, { k: 'fin', label: '재무활동 순현금흐름', type: 'money' },
      { k: 'fx', label: '환율변동효과(해당 시)', type: 'money', optional: true },
      { k: 'close', label: '기말 현금', type: 'money' },
    ] },
  { id: 'Q23', sec: 'E', q: 'IR 덱의 핵심 숫자가 원자료와 일치하나요?',
    why: '덱에 적은 숫자를 같은 기간·단위·정의의 원자료와 하나씩 맞춰 봅니다. 기간이나 단위가 다르면 비교하지 않습니다.',
    src: [['S01', 'Financials'], ['S04', 'Metric']], ex: ['IR 덱(쪽 번호)', 'KPI 정의서', '원자료(원장·집계표)'],
    check: '동일 기간·통화·정의일 때만 수치를 대사합니다. 이 대사 규칙은 비코닉 자체 규칙입니다.', rules: ['R-DECK-01'],
    fields: [
      { k: 'rows', label: '덱 숫자', type: 'rows', cols: [
        { k: 'metric', label: '항목', type: 'select', options: ['매출(Q07 원장)', '고객 수(Q09)', '현금 잔액(Q21)', '기타(직접 입력)'] },
        { k: 'label', label: '덱 표기', type: 'text' }, { k: 'page', label: '덱 쪽', type: 'text' },
        { k: 'deck', label: '덱 숫자', type: 'num' }, { k: 'unit', label: '단위', type: 'select', options: ['KRW', 'USD', 'EUR', 'JPY', 'SGD', 'CNY', '명', '건', '%'] },
        { k: 'period', label: '덱 기간·기준일 (예: 2025-01~2025-12 또는 2025-12-31)', type: 'text' },
        { k: 'src', label: '원자료 숫자(기타일 때)', type: 'num' }, { k: 'srcPeriod', label: '원자료 기간(기타일 때)', type: 'text' },
      ] },
    ] },

  { id: 'Q24', sec: 'F', q: '지금 요청하는 투자금과 회사가 제시한 사용 목적은 무엇인가요?',
    why: '경영진이 정한 요청액과 용도별 금액의 합계가 맞는지, 누가 언제 승인했는지 확인합니다. 달성 가능성은 판단하지 않습니다.',
    src: [['S02', '덱 항목 12 Fundraising']], ex: ['경영진(이사회) 승인 조달 계획', '자금 사용 계획표'],
    check: '합계·작성일·승인 여부와 실적/계획 구분을 확인합니다. 달성·수익 전망은 만들지 않습니다.', rules: ['R-FUND-01'], plan: true,
    fields: [
      CUR, { k: 'amount', label: '요청 금액', type: 'money' },
      { k: 'written', label: '계획 작성일', type: 'date' },
      { k: 'approvedBy', label: '승인 주체(예: 이사회, 대표이사)', type: 'text', optional: true },
      { k: 'uses', label: '용도별 금액', type: 'rows', cols: [{ k: 'item', label: '용도', type: 'text' }, { k: 'amt', label: '금액', type: 'money' }] },
    ] },
];

// 화면 진행 순서 = 섹션 순서(A→F). 문항 ID 순서(Q05가 B, Q06이 A)로 넘기면 섹션이 오락가락하므로 쓰지 않는다.
export const Q_ORDER = SECTIONS.flatMap((s) => QUESTIONS.filter((q) => q.sec === s.id));
export const QMAP = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
export const SMAP = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// 문항 검증 메타(08 '기계 판독 필수 필드'). 실제 검토 전에는 미검증으로 둔다.
export function questionMeta(q) {
  return {
    question_id: q.id, question_version: REGISTRY_VERSION, plain_question: q.q, purpose: q.why,
    source_ids: q.src.map(([s]) => s), source_locator: q.src.map(([s, loc]) => `${s} ${loc}`).join('; '),
    source_checked_at: SOURCES_CHECKED_AT, topic_source_status: '주제 근거 확인(08 문서)',
    applicability: '전체 기업(적용 제외 시 사유·승인 필요)', evidence_examples: q.ex, verification_rule_ids: q.rules,
    expert_review_status: '미검증', expert_domain: q.expert || null, reviewer: null, reviewed_at: null,
    usability_status: '미검증', predictive_validity: '검증하지 않음',
  };
}

export const RULES = {
  'R-DOC-01': { v: '1.0', name: '자료 존재·원문 위치 확인', desc: '연결된 자료가 있고 문서 내 위치(쪽·시트·셀)가 기록되었는지 확인' },
  'R-REV-01': { v: '1.0', name: '매출원장 ↔ 재무자료 당기 매출 대사', desc: '같은 기간(시작·종료 월)·같은 통화일 때만 비교' },
  'R-CUST-01': { v: '1.0', name: '유료 + 무료 = 전체 고객 수', desc: '유료·무료가 겹치지 않게 집계했다고 표시한 경우에만 확인' },
  'R-RET-01': { v: '1.0', name: '과거 갱신·재구매 비율 계산', desc: '분모가 0보다 크고 분자가 분모 이하일 때만 계산(과거 실적이며 전망 아님)' },
  'R-CAP-01': { v: '1.0', name: '주주별 주식 합계 = 발행주식 총수', desc: '같은 기준일의 주주명부 입력값끼리 합계 확인' },
  'R-GROW-01': { v: '1.0', name: '과거 매출 증감률 계산', desc: '전기·당기 기간 길이(개월)가 같고 전기 매출이 0보다 클 때만 계산' },
  'R-CASH-01': { v: '1.0', name: '가용 현금 = 총잔액 - 사용 제한 금액', desc: '사용 제한 금액이 총잔액 이하인지 확인' },
  'R-CASH-02': { v: '1.0', name: '잔액 자료 ↔ 현금흐름 기말 현금 대사', desc: '잔액 기준일 = 현금흐름 종료일, 같은 통화일 때만 비교' },
  'R-CF-01': { v: '1.0', name: '기초 + 영업 + 투자 + 재무 (+ 환율효과) = 기말', desc: '현금흐름 3활동 구분 대사' },
  'R-DECK-01': { v: '1.0', name: '덱 숫자 ↔ 원자료 대사', desc: '같은 기간·단위·정의일 때만 비교, 다르면 비교하지 않음' },
  'R-DATE-01': { v: '1.0', name: '날짜·기간 순서 확인', desc: '시작이 종료보다 늦거나 보고서 기준일 이후 날짜인지 확인' },
  'R-FUND-01': { v: '1.0', name: '용도별 금액 합계 = 요청 금액', desc: '경영진 제출 계획의 합계 확인(달성 가능성 판단 없음)' },
};

export const EVIDENCE_KINDS = ['회사 소개·IR 덱', '계약서', '원장·집계표', '재무제표', '증명서', '등기·주주명부', '정책·내부 기록', '공식 통계·외부 자료', '기타'];
