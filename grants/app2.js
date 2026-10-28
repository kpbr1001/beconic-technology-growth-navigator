/* =====================================================================
   BECONIC 지원사업 MATCH  —  app.js
   MOCK-FIRST. 규칙엔진(Hard Eligibility) → Fit → Confidence.
   프론트에서 외부 API 직접 호출 금지. 데이터는 Adapter를 통해서만.
   ===================================================================== */
'use strict';

/* ---------- 버전 정보 (수정 시마다 갱신) ---------- */
const APP_VERSION = {
  version: 'v3.7.0',
  updated: '2026-09-13',
  changelog: [
    { v:'v3.7.0', d:'2026-09-14', note:'시군구 매칭 버그 수정: 접미사(시/군/구) 유연 비교로 남양주시=남양주=[남양주] 모두 매칭, 짧은이름(중구 등) 오탐 방지' },
    { v:'v3.6.0', d:'2026-09-14', note:'대상아님 토글 제거, 결과 개수 명확 표시(N건), 후킹 클릭시 결과이동, 필터시 전체보기 버튼 — 3건 찾았다면 3건이 다 보이게' },
    { v:'v3.5.0', d:'2026-09-14', note:'결과화면 사용자중심 전면개편: 요약바·맞는이유박스 제거, 도넛을 분야별 점유율/건수로, CTA버튼삭제, 컨설턴트 삭제, 사업자유형 추가' },
    { v:'v3.4.0', d:'2026-09-14', note:'프로세스 대폭 단축: 스텝3(지원분야)·intro화면 제거, 결과를 지원분야별 자동 분류+건수 표기, 산업분류 확대(공고기준), 주요사업내용 삭제, CTA→매칭하기' },
    { v:'v3.3.0', d:'2026-09-14', note:'AI 정밀매칭 설계 완비: 엔진 숫자기반 판정(매출·직원·업력·연령·체납), AI스키마 정합화, 키 연동시 자동 enrich, AI 정밀분석 배지' },
    { v:'v3.2.0', d:'2026-09-14', note:'결과를 니즈(자금·수출 등) 카테고리로 그룹핑(사용자 중심), 시장조사 반영 세금체납 자격항목 추가, 필터를 니즈 기반으로 전환' },
    { v:'v3.1.0', d:'2026-09-14', note:'지역 매칭 3단계 재설계(전국<광역<시군구 관련도·가점·배지·정렬), 매칭 알고리즘 시나리오 재검증' },
    { v:'v3.0.0', d:'2026-09-14', note:'CTA 퍼널 개선(유형선택 강조 점프), 카드 신청기간(시작~종료) 표시, D-0 오류 수정(접수중), 워크플로우 정밀 점검' },
    { v:'v2.9.0', d:'2026-09-14', note:'공고 대량수집(페이지네이션)·후킹숫자(N건분석→M건매칭)·시군구 우선노출(내지역 배지)·메인 마케팅퍼널(AIDA) 재설계' },
    { v:'v2.8.0', d:'2026-09-14', note:'상태 범례·설명 추가, 시군구 2단계 지역선택, 카드 확인도 병기, CTA 이메일 전환, 마감순 정렬 개선(접수중 우선)' },
    { v:'v2.7.0', d:'2026-09-14', note:'자가부검 반영: 목적불일치 패널티·확인도 정직화·총액 추천조건부만 합산 / CTA 분석검토자문으로 순화' },
    { v:'v2.6.0', d:'2026-09-14', note:'국세청 사업자번호 조회 제거(불필요), K-Startup URL https 정정' },
    { v:'v2.5.0', d:'2026-09-14', note:'지원금 있는 사업만 필터 추가(금전지원 사업만 보기)' },
    { v:'v2.4.0', d:'2026-09-14', note:'K-Startup 다중소스 연동: 어댑터·병합·중복제거·업력/연령/모집여부 정형 활용' },
    { v:'v2.3.0', d:'2026-09-14', note:'기업마당 API + Claude 라이브 연동: 어댑터·오케스트레이터·자동 mock폴백·실시간배지' },
    { v:'v2.2.0', d:'2026-09-14', note:'결과 하단 컨설팅 CTA(070-4103-4177)·PDF 브랜드 연락처, 대시보드 긍정중심 재구성(신청가능 주인공), API연동 진단서' },
    { v:'v2.1.0', d:'2026-09-13', note:'기업분류 5종(예비창업자·소상인·소공인·중소기업·컨설턴트)별 맞춤 워크플로우, 결과 유저관점 재구성(마감순 기본), 히어로·자동업데이트 개선, 레드팀 감사(XSS·입력검증·견고성) 반영' },
    { v:'v2.0.0', d:'2026-09-13', note:'차별화 개편: 총지원규모 대시보드, 페르소나, 무가입 자동 재매칭, 컨설턴트 멀티클라이언트, BCG급 PDF' },
    { v:'v1.0.0', d:'2026-09-13', note:'초기 릴리스(규칙엔진·Fit·Confidence 분리)' }
  ]
};

/* ---------- 앱 설정 (요구사항 4) ---------- */
const APP_CONFIG = {
  // 배포 환경(https + netlify)에서는 자동으로 live 시도, file://·localhost는 mock.
  // BFF가 키 없으면 스스로 mock 데이터로 폴백하므로 안전.
  DATA_MODE: (typeof location !== 'undefined' && /^https?:/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname)) ? 'live' : 'mock',
  AI_MODE:   'mock',     // mock | live (설명 생성용, 별도)
  AI_ENRICH: false,      // true면 목록 로드시 상위 N건 AI 자격추출(비용↑). 기본 off.
  ENVIRONMENT: 'development',
  DEBUG: false,
  MATCH_WEIGHTS: {       // 요구사항 16 — 코드 하드코딩 금지, 여기서만 관리
    purpose: 20, semantic: 20, stage: 15, industry: 15,
    field: 10, capability: 10, amount: 5, readiness: 5
  }
};

/* ---------- Provider 상태 (요구사항 5) ----------
   LIVE Adapter는 키·공식문서 확보 전 활성화하지 않는다. */
const PROVIDERS = {
  bizinfo:  { name:'기업마당',   status:'NOT_CONFIGURED' },
  kstartup: { name:'K-Startup', status:'NOT_CONFIGURED' },
  claude:   { name:'AI 분석',   status:'READY' } // 키는 확보(백엔드), 초기 QA는 mock
};

/* =====================================================================
   Adapter Layer — 데이터 출처 추상화 (요구사항 53,54 Lock-in 대응)
   ===================================================================== */
const ProgramProvider = {
  lastMode: 'mock',   // 마지막 로드의 실제 데이터 소스 (mock | live)
  lastFetchedAt: null,
  lastSourceCounts: {},
  lastTotalCollected: 0,
  lastAliveCount: 0,
  // 표준 스키마 배열을 반환. mock이면 로컬 JSON, live면 Netlify Function.
  async fetchPrograms() {
    if (APP_CONFIG.DATA_MODE === 'live') {
      const qs = APP_CONFIG.AI_ENRICH ? '?enrich=1&enrichCount=12' : '';
      try {
        const r = await fetch('/.netlify/functions/programs' + qs);
        const data = await r.json();
        if (data.mode === 'live' && Array.isArray(data.programs) && data.programs.length) {
          this.lastMode = 'live'; this.lastFetchedAt = data.fetchedAt || new Date().toISOString();
          this.lastSourceCounts = data.sourceCounts || {};
          this.lastTotalCollected = data.totalCollected || data.count || data.programs.length;
          this.lastAliveCount = data.aliveCount || data.programs.length;
          return data.programs;
        }
      } catch (e) { /* 폴백 */ }
      // 키 미설정/오류/빈결과 → mock 폴백
      this.lastMode = 'mock';
      if (window.__MOCK_PROGRAMS__) return window.__MOCK_PROGRAMS__.programs;
      const res = await fetch('data/mock-programs.json');
      return (await res.json()).programs;
    }
    this.lastMode = 'mock';
    try {
      const res = await fetch('data/mock-programs.json');
      return (await res.json()).programs;
    } catch (e) {
      if (window.__MOCK_PROGRAMS__) return window.__MOCK_PROGRAMS__.programs;
      throw e;
    }
  }
};

/* AI Adapter — 벤더 분리. 지금은 규칙기반 설명으로 대체(mock) */
const AIAdapter = {
  async explain(program, company, judged) {
    if (APP_CONFIG.AI_MODE === 'live') {
      try {
        const r = await fetch('/.netlify/functions/ai-analysis', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ program, company, judged })
        });
        const data = await r.json();
        if (data.status === 'OK') return data;
      } catch (e) { /* 실패 시 규칙기반으로 폴백 */ }
      return null;
    }
    return null; // mock: 규칙기반 Explainability로 대체
  }
};

/* =====================================================================
   상수 · 선택지 정의  (Company Schema 입력 UX의 원천)
   각 항목이 어떤 API 필드 판정에 쓰이는지 API_MAPPING.md 참고
   ===================================================================== */
const REGIONS = ['서울','경기','인천','부산','대구','광주','대전','울산','세종','강원','충북','충남','전북','전남','경북','경남','제주'];
const METRO = ['서울','경기','인천'];

/* 시·도별 시·군·구 (선택 입력 — 안 골라도 시·도 단위 매칭) */
const DISTRICTS = {
  '서울':['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  '경기':['수원시','성남시','고양시','용인시','부천시','안산시','안양시','남양주시','화성시','평택시','의정부시','시흥시','파주시','광명시','김포시','군포시','광주시','이천시','양주시','오산시','구리시','안성시','포천시','의왕시','하남시','여주시','동두천시','과천시','가평군','연천군','양평군'],
  '인천':['중구','동구','미추홀구','연수구','남동구','부평구','계양구','서구','강화군','옹진군'],
  '부산':['중구','서구','동구','영도구','부산진구','동래구','남구','북구','해운대구','사하구','금정구','강서구','연제구','수영구','사상구','기장군'],
  '대구':['중구','동구','서구','남구','북구','수성구','달서구','달성군','군위군'],
  '광주':['동구','서구','남구','북구','광산구'],
  '대전':['동구','중구','서구','유성구','대덕구'],
  '울산':['중구','남구','동구','북구','울주군'],
  '세종':['세종시'],
  '강원':['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군'],
  '충북':['청주시','충주시','제천시','보은군','옥천군','영동군','증평군','진천군','괴산군','음성군','단양군'],
  '충남':['천안시','공주시','보령시','아산시','서산시','논산시','계룡시','당진시','금산군','부여군','서천군','청양군','홍성군','예산군','태안군'],
  '전북':['전주시','군산시','익산시','정읍시','남원시','김제시','완주군','진안군','무주군','장수군','임실군','순창군','고창군','부안군'],
  '전남':['목포시','여수시','순천시','나주시','광양시','담양군','곡성군','구례군','고흥군','보성군','화순군','장흥군','강진군','해남군','영암군','무안군','함평군','영광군','장성군','완도군','진도군','신안군'],
  '경북':['포항시','경주시','김천시','안동시','구미시','영주시','영천시','상주시','문경시','경산시','의성군','청송군','영양군','영덕군','청도군','고령군','성주군','칠곡군','예천군','봉화군','울진군','울릉군'],
  '경남':['창원시','진주시','통영시','사천시','김해시','밀양시','거제시','양산시','의령군','함안군','창녕군','고성군','남해군','하동군','산청군','함양군','거창군','합천군'],
  '제주':['제주시','서귀포시']
};

// 산업분류 — 지원사업 공고 기준 확대 (그룹별)
const INDUSTRY_GROUPS = [
  { group:'제조·소재', items:['제조업','금속·소재 성형가공','기계·장비','전기·전자부품','화학·섬유','반도체·디스플레이','미래형선박·조선'] },
  { group:'ICT·SW', items:['정보통신(ICT)','SW·시스템통합','AI·빅데이터','사이버보안','게임·콘텐츠','블록체인·양자'] },
  { group:'바이오·헬스', items:['바이오·제약','의료기기·헬스케어','기능성식품','뷰티·화장품'] },
  { group:'신산업·에너지', items:['신재생에너지·2차전지','자율주행·모빌리티','로봇·드론','우주·항공','스마트시티·IoT'] },
  { group:'유통·서비스', items:['도소매업','음식점업(F&B)','관광·MICE·숙박','물류·유통','교육(에듀테크)','지식서비스(컨설팅·HR)','디자인'] },
  { group:'기타', items:['건설·건축','농림수산업','문화·예술·미디어','부동산(프롭테크)','환경·수자원','서비스업(기타)','해당없음'] }
];
// 평면 목록(호환)
const INDUSTRIES = INDUSTRY_GROUPS.flatMap(g=>g.items.map(v=>({v, group:g.group})));

// 시군구 매칭: 사용자 선택 시군구가 공고 텍스트에 있는지 (접미사 유연 비교)
function districtMatch(district, hay){
  if(!district || !hay) return false;
  if(hay.includes(district)) return true;   // 정확 일치 우선
  // 접미사(시/군/구/특별시 등) 뗀 핵심어로 비교 (예: 남양주시→남양주)
  const base = district.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/,'');
  if(base.length < 2) return false;         // 너무 짧으면(중구,동구 등 base='중') 오탐 방지 → 정확일치만
  return hay.includes(base);
}

// 세부산업 → 매칭용 대분류(기존 targetIndustries 값과 호환)
function industryToBroad(ind){
  if(!ind) return null;
  const M = {
    '제조업':'제조업','금속·소재 성형가공':'제조업','기계·장비':'제조업','전기·전자부품':'제조업',
    '화학·섬유':'제조업','반도체·디스플레이':'제조업','미래형선박·조선':'제조업',
    '정보통신(ICT)':'정보통신업','SW·시스템통합':'정보통신업','AI·빅데이터':'정보통신업',
    '사이버보안':'정보통신업','게임·콘텐츠':'정보통신업','블록체인·양자':'정보통신업',
    '바이오·제약':'과학기술','의료기기·헬스케어':'과학기술','기능성식품':'제조업','뷰티·화장품':'제조업',
    '신재생에너지·2차전지':'제조업','자율주행·모빌리티':'제조업','로봇·드론':'제조업',
    '우주·항공':'제조업','스마트시티·IoT':'정보통신업',
    '도소매업':'도소매업','음식점업(F&B)':'음식점업','관광·MICE·숙박':'서비스업',
    '물류·유통':'도소매업','교육(에듀테크)':'서비스업','지식서비스(컨설팅·HR)':'서비스업','디자인':'서비스업',
    '건설·건축':'건설업','농림수산업':'기타','문화·예술·미디어':'서비스업',
    '부동산(프롭테크)':'서비스업','환경·수자원':'기타','서비스업(기타)':'서비스업','해당없음':'기타'
  };
  return M[ind] || ind;
}

const SUPPORT_FIELDS = [
  {v:'정책자금/금융', p:['정책자금/금융']},
  {v:'R&D/기술', p:['R&D/기술']},
  {v:'창업', p:['창업']},
  {v:'사업화', p:['사업화']},
  {v:'판로/유통', p:['판로']},
  {v:'마케팅', p:['마케팅']},
  {v:'수출', p:['수출']},
  {v:'인력', p:['인력']},
  {v:'경영/컨설팅', p:['경영','컨설팅']},
  {v:'시설/공간', p:['시설/공간']},
  {v:'디지털전환', p:['디지털전환']},
  {v:'제조혁신', p:['제조혁신']}
];

const COMPANY_TYPES = [
  {v:'예비창업자', s:'아직 사업자등록 전'},
  {v:'소상인',     s:'소매·음식·서비스업 소규모'},
  {v:'소공인',     s:'제조업 10인 미만'},
  {v:'중소기업',   s:'법인·개인사업자'}
];

/* 신(新) 기업분류 → 데이터상 targetBusinessType 매핑 (역호환) */
const TYPE_MAP = {
  '예비창업자': ['예비창업자'],
  '소상인':     ['소상공인','개인사업자'],
  '소공인':     ['소상공인','개인사업자'],
  '중소기업':   ['법인','개인사업자'],
  // 레거시 값 자기참조
  '개인사업자': ['개인사업자'],
  '법인':       ['법인'],
  '소상공인':   ['소상공인']
};
function typeMatches(programTargets, userType){
  if(!programTargets || !programTargets.length) return null;
  const mapped = TYPE_MAP[userType] || [userType];
  return mapped.some(t=>programTargets.includes(t));
}

/* Company Schema 초기값 (요구사항 11) — 모르는 값은 null */
function blankCompany(){
  return {
    companyType:null, bizRegType:null,
    region:null, district:null, establishedYear:null, businessAge:null,
    industry:null, businessDescription:null, supportNeeds:[],
    // progressive
    revenueRange:null, employeeCount:null, representativeAge:null,
    representativeGender:null, ventureCertified:null, researchInstitute:null,
    exportHistory:null, exportAmount:null, investmentHistory:null,
    rdHistory:null, patentStatus:null, previousSupportHistory:null,
    taxArrears:null   // 국세·지방세 체납 여부(시장조사: 대부분 사업 자동탈락 요건)
  };
}

/* =====================================================================
   Matching Engine — 파이프라인 (요구사항 13, 순서 불변)
   Normalize → Validate → Dedup → Deadline → HardEligibility
   → Unknown → Fit → Confidence → Ranking → Explainability
   ===================================================================== */
const NOW = new Date();

/* ---- 날짜 리스크 (요구사항 15) ---- */
function parseDate(s){
  if(!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function deadlineState(p){
  const start = parseDate(p.applicationStart);
  const end   = parseDate(p.applicationEnd);
  // K-Startup: 마감일이 없어도 모집진행 여부(recruitInProgress)로 판정 가능
  if(end === null){
    if(p.recruitInProgress === true) return {state:'OPEN', dday:null};
    if(p.recruitInProgress === false) return {state:'CLOSED', dday:null};
    // 기업마당 "예산 소진시까지" 등 상시
    if(p.applicationEndText) return {state:'OPEN', dday:null};
    return {state:'UNKNOWN', dday:null};
  }
  const msDay = 86400000;
  const dEnd = Math.ceil((end - NOW)/msDay);
  if(start && start > NOW) return {state:'UPCOMING', dday:Math.ceil((start-NOW)/msDay)};
  if(dEnd < 0)  return {state:'CLOSED', dday:dEnd};
  // 명시적으로 모집종료면 마감 처리
  if(p.recruitInProgress === false) return {state:'CLOSED', dday:dEnd};
  if(dEnd <= 7) return {state:'CLOSING_SOON', dday:dEnd};
  return {state:'OPEN', dday:dEnd};
}

/* ---- Hard Eligibility Engine (요구사항 14) ----
   판정: ELIGIBLE / CONDITIONAL / UNKNOWN / INELIGIBLE
   조건별 결과와 근거(evidence)를 함께 반환 → Explainability로 재사용 */
function hardEligibility(p, c){
  const conds = []; // {label, result: pass|fail|unknown|na, evidence}
  const add=(label,result,evidence)=>conds.push({label,result,evidence});

  // 1) 사업자 유형
  if(p.targetBusinessType && p.targetBusinessType.length){
    if(!c.companyType){ add('지원대상 유형','unknown','기업유형 미입력'); }
    else {
      const m = typeMatches(p.targetBusinessType, c.companyType);
      if(m) add('지원대상 유형','pass',`${c.companyType} 대상 포함`);
      else add('지원대상 유형','fail',`대상: ${p.targetBusinessType.join(', ')} (귀사 유형 미포함)`);
    }
  } else add('지원대상 유형','na');

  // 2) 지역 — 3단계 관련도(전국 → 광역시도 → 시군구)
  // regionTier: 0=전국(누구나), 1=내 광역시도, 2=내 시군구 특정. -1=대상 아님
  let regionTier = null;
  const allRegion = !p.targetRegions || p.targetRegions.length===0 || p.targetRegions.includes('전국');
  if(allRegion){
    add('사업장 소재지','pass','전국 대상');
    regionTier = 0;
  } else if(!c.region){
    add('사업장 소재지','unknown','지역 미입력');
    regionTier = null;
  } else if(p.targetRegions.includes(c.region)){
    // 내 광역시도가 대상 → 공고에 내 시군구까지 명시돼 있으면 Tier 2
    const hay = `${p.programName||''} ${(p.targetRegions||[]).join(' ')} ${p._suptReginRaw||''} ${p.supportDescription||''}`;
    if(c.district && districtMatch(c.district, hay)){
      add('사업장 소재지','pass',`${c.region} ${c.district} 대상`);
      regionTier = 2;
    } else {
      add('사업장 소재지','pass',`${c.region} 포함`);
      regionTier = 1;
    }
  } else {
    add('사업장 소재지','fail',`대상지역: ${p.targetRegions.slice(0,4).join('/')}… (${c.region} 미포함)`);
    regionTier = -1;
  }

  // 3) 업력
  if(p.businessAgeMin!=null || p.businessAgeMax!=null){
    if(c.companyType==='예비창업자'){
      // 예비창업자는 업력 개념 없음. 창업 관련 사업만 통과, 그 외 fail
      if(p.businessAgeMax!=null || p.category==='창업') add('업력 조건','pass','예비창업자 해당');
      else add('업력 조건','unknown','예비창업자(업력 없음)');
    } else if(c.businessAge==null){
      add('업력 조건','unknown','설립연도 미입력');
    } else {
      const okMin = p.businessAgeMin==null || c.businessAge >= p.businessAgeMin;
      const okMax = p.businessAgeMax==null || c.businessAge <= p.businessAgeMax;
      const range = `${p.businessAgeMin??0}~${p.businessAgeMax??'제한없음'}년`;
      if(okMin && okMax) add('업력 조건','pass',`업력 ${c.businessAge}년 (요건 ${range})`);
      else add('업력 조건','fail',`요건 ${range} · 귀사 ${c.businessAge}년`);
    }
  } else add('업력 조건','na');

  // 4) 업종 & 제외업종 (세부산업 → 대분류 변환해 비교)
  const cBroad = industryToBroad(c.industry);
  if(p.excludedIndustries && (p.excludedIndustries.includes(c.industry)||p.excludedIndustries.includes(cBroad))){
    add('업종 제한','fail',`제외업종(${c.industry})`);
  } else if(p.targetIndustries && !p.targetIndustries.includes('전업종')){
    if(!c.industry) add('업종 조건','unknown','업종 미입력');
    else if(p.targetIndustries.includes(c.industry)||p.targetIndustries.includes(cBroad)) add('업종 조건','pass',`${c.industry} 대상`);
    else if(p.category==='제조혁신' || p.subCategory==='제조혁신'){
      add('업종 조건', cBroad==='제조업'?'pass':'fail', cBroad==='제조업'?'제조업':'제조업 아님');
    }
    else add('업종 조건','unknown',`대상업종: ${p.targetIndustries.slice(0,3).join('/')}`);
  } else add('업종 조건','na');

  // 5) 매출조건 — AI 추출 숫자(revenueMax/Min) 우선, 없으면 텍스트(revenueConditions)
  if(p.revenueMax!=null || p.revenueMin!=null){
    // AI 파싱값(원 단위). 사용자 매출구간을 대푯값(억)으로 비교
    if(c.revenueRange==null) add('매출 조건','unknown',revenueCondLabel(p));
    else {
      const val = REVENUE_MID[c.revenueRange]; // 억 단위
      if(val==null) add('매출 조건','unknown',revenueCondLabel(p));
      else {
        const valWon = val*100000000;
        const okMax = p.revenueMax==null || valWon <= p.revenueMax;
        const okMin = p.revenueMin==null || valWon >= p.revenueMin;
        add('매출 조건',(okMax&&okMin)?'pass':'fail',revenueCondLabel(p));
      }
    }
  } else if(p.revenueConditions){
    if(c.revenueRange==null) add('매출 조건','unknown',p.revenueConditions);
    else add('매출 조건', checkRevenue(p.revenueConditions,c.revenueRange), p.revenueConditions);
  }

  // 6) 직원조건 — AI 추출 숫자(employeeMax/Min) 우선, 없으면 텍스트
  if(p.employeeMax!=null || p.employeeMin!=null){
    if(c.employeeCount==null) add('상시근로자 조건','unknown',employeeCondLabel(p));
    else {
      const val = EMPLOYEE_MID[c.employeeCount];
      if(val==null) add('상시근로자 조건','unknown',employeeCondLabel(p));
      else {
        const okMax = p.employeeMax==null || val <= p.employeeMax;
        const okMin = p.employeeMin==null || val >= p.employeeMin;
        add('상시근로자 조건',(okMax&&okMin)?'pass':'fail',employeeCondLabel(p));
      }
    }
  } else if(p.employeeConditions){
    if(c.employeeCount==null) add('상시근로자 조건','unknown',p.employeeConditions);
    else add('상시근로자 조건', checkEmployee(p.employeeConditions,c.employeeCount), p.employeeConditions);
  }

  // 7) 대표자 연령 (progressive)
  if(p.representativeAgeMax!=null || p.representativeAgeMin!=null){
    if(c.representativeAge==null) add('대표자 연령','unknown',`요건 ${p.representativeAgeMin??''}~${p.representativeAgeMax??''}세`);
    else{
      const okMin=p.representativeAgeMin==null||c.representativeAge>=p.representativeAgeMin;
      const okMax=p.representativeAgeMax==null||c.representativeAge<=p.representativeAgeMax;
      add('대표자 연령', (okMin&&okMax)?'pass':'fail', `요건 ~${p.representativeAgeMax??'제한없음'}세 · 귀사 ${c.representativeAge}세`);
    }
  }

  // 8) 특수자격 (여성기업·벤처 등) — mock: certificationConditions / AI: specialRequirements 겸용
  const specialReqs = (p.specialRequirements && p.specialRequirements.length) ? p.specialRequirements
                    : (p.certificationConditions || []);
  if(specialReqs.length){
    if(specialReqs.some(x=>String(x).includes('여성'))){
      if(c.representativeGender==null) add('여성기업 확인','unknown','대표자 성별 미입력');
      else add('여성기업 확인', c.representativeGender==='여성'?'pass':'fail', '여성 대표 요건');
    }
    if(specialReqs.some(x=>String(x).includes('벤처'))){
      if(c.ventureCertified==null) add('벤처확인','unknown','벤처인증 여부 미입력');
      else add('벤처확인', c.ventureCertified?'pass':'fail','벤처기업 확인 필요');
    }
    if(specialReqs.some(x=>String(x).includes('수출'))){
      if(c.exportHistory==null) add('수출 실적','unknown','수출 실적 미입력');
      else add('수출 실적', c.exportHistory?'pass':'fail','수출 실적 요건');
    }
  }

  // 9) 수출조건 (mock 텍스트) — 위 specialRequirements에서 안 잡힌 경우
  if(p.exportConditions && !specialReqs.some(x=>String(x).includes('수출'))){
    if(c.exportHistory==null) add('수출 조건','unknown',p.exportConditions);
    else add('수출 조건', c.exportHistory?'pass':'unknown', p.exportConditions);
  }

  // 10) 세금 체납 (시장조사: 대부분 정부지원사업 공통 필수요건)
  // AI가 '체납 없어야 함'을 명시 추출했거나(requiresNoTaxArrears), 자금성 사업이면 적용
  const isFunding = p.requiresNoTaxArrears===true || (p.category==='금융')
                    || (p.supportPurposes||[]).includes('정책자금/금융')
                    || (p.supportAmountMax && p.supportAmountMax>0);
  if(isFunding && c.taxArrears===true){
    add('세금 체납','fail','국세·지방세 체납 시 대부분 사업 신청 제한');
  } else if(isFunding && c.taxArrears===false){
    add('세금 체납','pass','체납 없음(정상)');
  }

  // ---- 종합 판정 ----
  const hasFail    = conds.some(x=>x.result==='fail');
  const hasUnknown = conds.some(x=>x.result==='unknown');
  let verdict;
  if(hasFail) verdict='INELIGIBLE';
  else if(hasUnknown) verdict='CONDITIONAL'; // 필수 fail은 없으나 확인 필요
  else verdict='ELIGIBLE';

  // 확정할 필수정보 자체가 거의 없으면 UNKNOWN
  const known = conds.filter(x=>x.result!=='na');
  if(known.length && known.every(x=>x.result==='unknown')) verdict='UNKNOWN';

  return {verdict, conds, regionTier};
}

function checkRevenue(condText, range){
  // range: 억 단위 상한 추정값. condText 예: "연매출 10억원 이하", "30억원 이상"
  const m = condText.match(/(\d+)\s*억/);
  if(!m) return 'unknown';
  const limit = parseInt(m[1],10);
  const val = REVENUE_MID[range]; if(val==null) return 'unknown';
  if(condText.includes('이하')) return val<=limit?'pass':'fail';
  if(condText.includes('이상')) return val>=limit?'pass':'fail';
  return 'unknown';
}
function checkEmployee(condText, band){
  const m = condText.match(/(\d+)\s*인/);
  if(!m) return 'unknown';
  const limit=parseInt(m[1],10);
  const val=EMPLOYEE_MID[band]; if(val==null) return 'unknown';
  if(condText.includes('미만')) return val<limit?'pass':'fail';
  if(condText.includes('이하')) return val<=limit?'pass':'fail';
  return 'unknown';
}
const REVENUE_MID  = {'매출없음':0,'5억미만':3,'5-10억':8,'10-30억':20,'30-50억':40,'50-100억':75,'100억이상':150};
const EMPLOYEE_MID = {'1-4인':3,'5-9인':7,'10-29인':20,'30-99인':60,'100인이상':150};

// AI 추출 숫자값 → 사람이 읽는 라벨 (원 단위 → 억/만원)
function wonLabel(v){
  if(v==null) return '';
  if(v>=100000000) return (v/100000000)+'억원';
  if(v>=10000) return Math.round(v/10000)+'만원';
  return v.toLocaleString()+'원';
}
function revenueCondLabel(p){
  if(p.revenueMax!=null && p.revenueMin!=null) return `매출 ${wonLabel(p.revenueMin)}~${wonLabel(p.revenueMax)}`;
  if(p.revenueMax!=null) return `매출 ${wonLabel(p.revenueMax)} 이하`;
  if(p.revenueMin!=null) return `매출 ${wonLabel(p.revenueMin)} 이상`;
  return '매출 조건';
}
function employeeCondLabel(p){
  if(p.employeeMax!=null && p.employeeMin!=null) return `상시근로자 ${p.employeeMin}~${p.employeeMax}인`;
  if(p.employeeMax!=null) return `상시근로자 ${p.employeeMax}인 이하`;
  if(p.employeeMin!=null) return `상시근로자 ${p.employeeMin}인 이상`;
  return '상시근로자 조건';
}

/* ---- Fit Score (요구사항 16) ---- */
function fitScore(p, c, regionTier){
  const W = APP_CONFIG.MATCH_WEIGHTS; let s=0; const parts={};
  // 지원목적
  const needP = new Set(c.supportNeeds.flatMap(n=>{
    const f=SUPPORT_FIELDS.find(x=>x.v===n); return f?f.p:[n];
  }));
  const purposeHit = p.supportPurposes.some(pp=>needP.has(pp));
  parts.purpose = purposeHit ? W.purpose : 0; s+=parts.purpose;
  // Semantic (mock: 업종·키워드 기반)
  parts.semantic = semanticFit(p,c)*W.semantic; s+=parts.semantic;
  // 성장단계
  parts.stage = stageFit(p,c)*W.stage; s+=parts.stage;
  // 산업
  parts.industry = (p.targetIndustries.includes('전업종')||p.targetIndustries.includes(c.industry))?W.industry:W.industry*0.4; s+=parts.industry;
  // 지원분야 세부
  parts.field = purposeHit ? W.field : W.field*0.3; s+=parts.field;
  // 기업역량 (progressive 보유시 가점)
  let cap=0.5; if(c.ventureCertified)cap+=0.2; if(c.researchInstitute)cap+=0.2; if(c.patentStatus)cap+=0.1;
  parts.capability = Math.min(1,cap)*W.capability; s+=parts.capability;
  // 지원규모
  parts.amount = (p.supportAmountMax? W.amount : W.amount*0.5); s+=parts.amount;
  // 준비도/마감여유
  const dl = deadlineState(p);
  parts.readiness = (dl.state==='OPEN'?W.readiness: dl.state==='CLOSING_SOON'?W.readiness*0.5: dl.state==='UPCOMING'?W.readiness*0.8:0); s+=parts.readiness;
  // ── 지역 관련도 가점 (전국<광역<시군구) ──
  // 내 지역 특화 사업일수록 경쟁률 낮고 관련도 높음 → 가점
  if(regionTier===2){ parts.regionBonus = 8; s+=8; }        // 내 시군구 특정
  else if(regionTier===1){ parts.regionBonus = 5; s+=5; }   // 내 광역시도
  // regionTier===0(전국)은 가점 없음(기본)
  // ── 지원목적 완전 불일치 패널티 ──
  if(c.supportNeeds.length && !purposeHit){
    s = Math.min(s, 48);
    parts._purposeMismatch = true;
  }
  return {score: Math.round(Math.min(100,s)), parts};
}
function semanticFit(p,c){
  if(!c.businessDescription) return 0.5;
  const txt=(p.programName+' '+p.supportDescription+' '+p.category).toLowerCase();
  const desc=c.businessDescription.toLowerCase();
  const kws=['수출','제조','ai','sw','소프트웨어','마케팅','브랜드','r&d','연구','기술','창업','디지털','플랫폼','it','판로','컨설팅'];
  let hit=0,tot=0;
  kws.forEach(k=>{ if(desc.includes(k)){tot++; if(txt.includes(k))hit++;} });
  if(tot===0) return 0.55;
  return 0.4 + 0.6*(hit/tot);
}
function stageFit(p,c){
  if(c.companyType==='예비창업자') return p.category==='창업'?1:0.3;
  if(p.businessAgeMax!=null && c.businessAge!=null){
    return c.businessAge<=p.businessAgeMax?1:0.4;
  }
  return 0.7;
}

/* ---- Confidence Score (요구사항 17) — Fit과 분리 ---- */
function confidenceScore(elig, c){
  const total = elig.conds.filter(x=>x.result!=='na').length || 1;
  const unknown = elig.conds.filter(x=>x.result==='unknown').length;
  const known = total - unknown;
  let base = Math.round((known/total)*100);
  // 프로필 완성도 보정 (핵심 정보에 가중치)
  // 유형·지역·업종·설립연도는 자격판정 핵심 → 누락 시 확인도 크게 하락
  const core = [
    c.companyType, c.region, c.industry,
    (c.companyType==='예비창업자' ? 1 : c.establishedYear)  // 예비창업자는 설립연도 면제
  ];
  const coreFill = core.filter(x=>x!=null&&x!=='').length / core.length;
  // 부가 정보(사업내용·니즈)는 보조
  const aux = [c.businessDescription, c.supportNeeds.length?1:null];
  const auxFill = aux.filter(x=>x!=null&&x!=='').length / aux.length;
  // 최종: 판정가능도(base) 50% + 핵심완성도 40% + 부가완성도 10%
  base = Math.round(base*0.5 + coreFill*100*0.4 + auxFill*100*0.1);
  return Math.max(5, Math.min(100, base));
}

/* ---- 추천 상태 결정 (요구사항 18) ---- */
function recommendState(verdict, fit, conf, dl){
  if(dl.state==='CLOSED') return '대상 아님';
  if(verdict==='INELIGIBLE') return '대상 아님';
  if(verdict==='UNKNOWN') return '확인 필요';
  if(verdict==='ELIGIBLE'){
    return fit>=70 ? '추천' : (fit>=50 ? '조건부 추천' : '확인 필요');
  }
  // CONDITIONAL: fit 높고 unknown 적으면 조건부, 아니면 확인필요
  return fit>=65 ? '조건부 추천' : '확인 필요';
}

/* ---- 전체 매칭 실행 ---- */
function runMatching(programs, company){
  return programs.map(p=>{
    const dl = deadlineState(p);
    const elig = hardEligibility(p, company);
    const fit = fitScore(p, company, elig.regionTier);
    const conf = confidenceScore(elig, company);
    const state = recommendState(elig.verdict, fit.score, conf, dl);
    // 지역 관련도: 0=전국, 1=내 광역, 2=내 시군구 (정렬·배지용)
    const regionTier = elig.regionTier;
    const localMatch = (regionTier===2);   // 내 시군구 특정 사업
    const regionLabel = regionTier===2 ? `${company.district}` : regionTier===1 ? `${company.region}` : (regionTier===0 ? '전국' : null);
    return {program:p, dl, elig, fit:fit.score, fitParts:fit.parts, conf, state, localMatch, regionTier, regionLabel};
  });
}

/* =====================================================================
   App Controller — 뷰 전환 · 입력 스텝 · 렌더 · 모달 · PDF
   ===================================================================== */


/* =====================================================================
   Dashboard 집계 (차별화: 총 지원규모 대시보드) — runMatching 결과 입력
   ===================================================================== */
function buildDashboard(matched){
  const considerable = matched.filter(m=> m.state!=='대상 아님');
  const rec = matched.filter(m=> m.state==='추천');
  const cond = matched.filter(m=> m.state==='조건부 추천');
  const check = matched.filter(m=> m.state==='확인 필요');
  // 합산 최대 지원금: '추천 + 조건부'만 (확인 필요는 자격 불확실 → 과대평가 방지)
  const fundedForTotal = matched.filter(m=> m.state==='추천' || m.state==='조건부 추천');
  let totalMax = 0, knownCnt=0;
  fundedForTotal.forEach(m=>{
    const v = m.program.supportAmountMax;
    if(typeof v==='number' && v>0){ totalMax += v; knownCnt++; }
  });
  // 마감 임박 (D-7 이내 OPEN/CLOSING_SOON)
  const closingSoon = considerable.filter(m=> m.dl.state==='CLOSING_SOON');
  const openNow = considerable.filter(m=> m.dl.state==='OPEN' || m.dl.state==='CLOSING_SOON');
  const upcoming = considerable.filter(m=> m.dl.state==='UPCOMING');
  // 분야(카테고리) 분포
  const byCat = {};
  considerable.forEach(m=>{
    const c = m.program.category || '기타';
    byCat[c] = (byCat[c]||0)+1;
  });
  const catDist = Object.entries(byCat).map(([k,v])=>({label:k, value:v}))
                    .sort((a,b)=>b.value-a.value);
  // 지원분야(목적) 분포
  const byField = {};
  considerable.forEach(m=>{
    (m.program.supportPurposes||[]).forEach(f=>{ byField[f]=(byField[f]||0)+1; });
  });
  const fieldDist = Object.entries(byField).map(([k,v])=>({label:k,value:v}))
                     .sort((a,b)=>b.value-a.value).slice(0,6);
  // 평균 적합도
  const avgFit = considerable.length
    ? Math.round(considerable.reduce((s,m)=>s+m.fit,0)/considerable.length) : 0;

  return {
    total: matched.length,
    considerable: considerable.length,
    recommend: rec.length,
    conditional: cond.length,
    check: check.length,
    ineligible: matched.length - considerable.length,
    totalMax, knownCnt,
    closingSoon: closingSoon.length,
    openNow: openNow.length,
    upcoming: upcoming.length,
    avgFit,
    catDist, fieldDist,
    topClosing: closingSoon.sort((a,b)=>a.dl.dday-b.dl.dday).slice(0,3)
  };
}

/* 금액 포맷 (억/만원 한글) */
function fmtKRW(v){
  if(!v || v<=0) return '—';
  if(v>=100000000){ const eok=v/100000000; return (eok%1===0?eok:eok.toFixed(1))+'억원'; }
  if(v>=10000){ return Math.round(v/10000)+'만원'; }
  return v.toLocaleString()+'원';
}
/* =====================================================================
   App Controller v2.0 — 3페르소나 · 대시보드 · 자동 재매칭 · 컨설턴트
   ===================================================================== */
const App = (function(){
  let persona = null;           // 'founder' | 'company' | 'consultant'
  let company = blankCompany();
  let step = 0;
  let programs = [];
  let matched = [];
  let dash = null;
  let filter = 'all';
  let sortBy = 'deadline';   // 요구3: 기본정렬 마감순
  let showExcluded = false;
  let fundedOnly = false;   // '지원금 있는 사업만' 토글
  let progressiveDone = false;

  // 컨설턴트 멀티클라이언트
  let clients = [];             // [{id,name,company,matched,dash,ts}]
  let activeClientId = null;

  const DRAFT_KEY   = 'beconic_match_draft_v2';
  const PROFILE_KEY = 'beconic_match_profile_v2';   // 무가입 자동 재매칭용
  const CLIENTS_KEY = 'beconic_clients_v2';
  const LASTSEEN_KEY = 'beconic_lastseen_v2';
  let toastTimer = null;
  const _ppTmp = {};


  const FIELD_ICON={'정책자금/금융':'💰','R&D/기술':'🔬','창업':'🌱','사업화':'🚀','판로':'🛒',
    '마케팅':'📣','수출':'🌍','인력':'👥','경영':'📊','컨설팅':'📊','시설/공간':'🏭','디지털전환':'💻','제조혁신':'⚙️'};
  const FIELD_ORDER=['정책자금/금융','창업','R&D/기술','사업화','제조혁신','수출','판로','마케팅','인력','경영','디지털전환','시설/공간'];

  const PERSONA_CFG = {
    founder: {
      key:'founder', companyType:'예비창업자', consultant:false,
      label:'예비창업자', icon:'🌱',
      cardDesc:'아직 사업자등록 전이에요. 창업 지원사업부터 쉽게 안내해 드립니다.',
      heroTitle:'아이디어는 있는데 <span class="hl">어디서 지원받을지</span> 모르시겠나요?',
      heroDesc:'복잡한 서류·용어 없이, 지금 준비 단계에서 신청할 수 있는 창업 지원사업부터 골라드립니다. 30초면 충분합니다.',
      steps:['creatorBasic'],
      defaultIndustry:null
    },
    retail: {
      key:'retail', companyType:'소상인', consultant:false,
      label:'소상인', icon:'🏪',
      cardDesc:'소매·음식·서비스업을 운영해요. 경영개선·자금·마케팅 지원 중심.',
      heroTitle:'우리 가게에 맞는 <span class="hl">소상공인 지원</span>, 놓치지 마세요.',
      heroDesc:'매출·직원 정보 없이도 시작할 수 있어요. 경영개선·정책자금·마케팅 지원을 마감 순서로 정리해 드립니다.',
      steps:['bizBasic'],
      defaultIndustry:'서비스업'
    },
    maker: {
      key:'maker', companyType:'소공인', consultant:false,
      label:'소공인', icon:'🔧',
      cardDesc:'제조업 10인 미만이에요. 소공인특화·제조혁신 지원 중심.',
      heroTitle:'제조 현장을 위한 <span class="hl">소공인 특화 지원</span>을 한눈에.',
      heroDesc:'소공인특화자금·스마트공방·제조혁신 등 10인 미만 제조기업에 맞는 사업만 골라 마감 순서로 보여드립니다.',
      steps:['bizBasic'],
      defaultIndustry:'제조업'
    },
    sme: {
      key:'sme', companyType:'중소기업', consultant:false,
      label:'중소기업', icon:'🏢',
      cardDesc:'법인·개인사업자로 성장 중이에요. R&D·수출·스마트공장·정책자금.',
      heroTitle:'우리 기업이 지금 <span class="hl">검토할 만한 지원사업</span>만 딱.',
      heroDesc:'자격조건을 먼저 걸러 신청 가능한 사업을, 총 지원규모·마감임박과 함께 보여드립니다. 회원가입 없이요.',
      steps:['bizBasic','smeProfile'],
      defaultIndustry:null
    },
    consultant: {
      key:'consultant', companyType:null, consultant:true,
      label:'컨설턴트', icon:'📊',
      cardDesc:'여러 고객사를 다뤄요. 저장·비교·브랜드 리포트로 상담을 빠르게.',
      heroTitle:'여러 고객사의 <span class="hl">지원사업 매칭을 한 곳</span>에서.',
      heroDesc:'고객사별 프로파일을 저장·비교하고, 매칭 근거가 담긴 브랜드 리포트를 바로 만드세요. 컨설팅 현장을 위한 뷰입니다.',
      steps:['consultantType','bizBasic','smeProfile'],
      defaultIndustry:null
    }
  };

  const STEP_DEFS = {
    // 예비창업자 전용 기본정보 (업력·매출 안 물음)
    creatorBasic: {
      kicker:'STEP', title:'어떤 창업을 준비하세요?',
      desc:'지역과 사업 분야만 고르면 돼요. 창업 전이어도 괜찮습니다.',
      render:()=>`
        ${regionField()}
        ${industrySelect()}
        <div class="field"><label class="q">대표자 연령대 <span class="opt-tag">청년 지원 판정</span></label>
          <div class="opt-grid c3">${['20대','30대','40대','50대','60대이상'].map(a=>optBtn('representativeAge',a,a,'',company.representativeAge===a)).join('')}</div></div>`,
      valid:()=>!!company.region && !!company.industry
    },
    idea: {
      kicker:'STEP', title:'아이디어를 한두 줄로 알려주세요',
      desc:'무엇을 만들거나 제공할 계획인지, 누구를 위한 건지. 연관 사업 추천에 씁니다.',
      render:()=>`
        <div class="field"><label class="q">창업 아이디어 / 사업 구상<span class="req">*</span></label>
          <textarea id="f-desc" placeholder="예: 반려동물 건강데이터를 분석하는 앱을 만들어 보호자에게 맞춤 케어를 제공">${esc(company.businessDescription||'')}</textarea></div>
        <div class="field"><label class="q">대표자 연령대 <span class="opt-tag">청년 지원 판정용</span></label>
          <div class="opt-grid c3">${['20대','30대','40대','50대','60대이상'].map(a=>optBtn('representativeAge',a,a,'',company.representativeAge===a)).join('')}</div></div>`,
      valid:()=>!!company.businessDescription
    },
    // 사업자 공통 기본정보
    bizBasic: {
      kicker:'STEP', title:'기업 기본정보',
      desc:'자격 판정에 필요한 정보만 받아요. 오래 안 걸려요.',
      render:()=>`
        <div class="field"><label class="q">사업자 형태<span class="req">*</span></label>
          <div class="opt-grid c3">${[['개인사업자','개인'],['법인사업자','법인'],['해당없음','미등록']].map(([v,l])=>optBtn('bizRegType',v,l,'',company.bizRegType===v)).join('')}</div></div>
        ${regionField()}
        <div class="field"><label class="q">설립연도<span class="req">*</span></label>
          <input type="number" id="f-year" placeholder="예: 2021" min="1980" max="2026" value="${company.establishedYear||''}"></div>
        ${industrySelect()}`,
      valid:()=>{ const v=parseInt(company.establishedYear,10);
        return !!company.region && !!company.establishedYear && v>=1960 && v<=2026 && !!company.industry && !!company.bizRegType; }
    },
    // 중소기업 심화(선택적 정확도 향상 — 건너뛰기 허용)
    smeProfile: {
      kicker:'STEP', title:'기업 규모 (선택)',
      desc:'입력하면 매출·고용·세금 조건이 있는 사업의 확인도가 올라갑니다. 모르면 건너뛰어도 됩니다.',
      optional:true,
      render:()=>`
        <div class="field"><label class="q">연 매출 규모</label>
          <div class="opt-grid c4">${['매출없음','5억미만','5-10억','10-30억','30-50억','50-100억','100억이상'].map(v=>optBtn('revenueRange',v,v,'',company.revenueRange===v)).join('')}</div></div>
        <div class="field"><label class="q">상시 근로자 수</label>
          <div class="opt-grid c3">${['1-4인','5-9인','10-29인','30-99인','100인이상'].map(v=>optBtn('employeeCount',v,v,'',company.employeeCount===v)).join('')}</div></div>
        <div class="field"><label class="q">수출 실적</label>
          <div class="opt-grid c2">${['있음','없음'].map(v=>optBtn('_exp',v,v,'',(company.exportHistory===true&&v==='있음')||(company.exportHistory===false&&v==='없음'))).join('')}</div></div>
        <div class="field"><label class="q">국세·지방세 체납 <span class="opt-tag">대부분 사업 필수요건</span></label>
          <div class="help">체납이 있으면 대부분의 정부지원사업에서 신청이 제한됩니다.</div>
          <div class="opt-grid c2">${['없음(정상)','체납 있음'].map(v=>optBtn('_tax',v,v,'',(company.taxArrears===false&&v==='없음(정상)')||(company.taxArrears===true&&v==='체납 있음'))).join('')}</div></div>`,
      valid:()=>true
    },
    // 지원분야 (공통)
    need: {
      kicker:'STEP', title:'어떤 지원이 필요하세요?',
      desc:'관심 분야를 고르면 해당 목적 사업을 우선 매칭합니다. (복수 선택)',
      render:()=>needGrid(SUPPORT_FIELDS),
      valid:()=>company.supportNeeds.length>0
    },
    // 소상인 맞춤 니즈 (자금/경영개선/마케팅 중심) — 값은 실제 supportPurposes와 일치
    retailNeed: {
      kicker:'STEP', title:'가장 필요한 도움은?',
      desc:'소상공인이 많이 찾는 분야로 추렸어요. (복수 선택)',
      render:()=>needGrid([
        {v:'정책자금/금융',label:'자금·융자'},{v:'경영',label:'경영개선'},
        {v:'마케팅',label:'마케팅'},{v:'판로',label:'판로·유통'},
        {v:'디지털전환',label:'디지털전환'},{v:'창업',label:'창업·재도전'}]),
      valid:()=>company.supportNeeds.length>0
    },
    // 소공인 맞춤 니즈 (제조·설비 중심)
    makerNeed: {
      kicker:'STEP', title:'가장 필요한 도움은?',
      desc:'제조 소공인에게 맞는 분야로 추렸어요. (복수 선택)',
      render:()=>needGrid([
        {v:'정책자금/금융',label:'자금·융자'},{v:'제조혁신',label:'제조혁신·설비'},
        {v:'R&D/기술',label:'R&D·기술개발'},{v:'수출',label:'수출'},
        {v:'마케팅',label:'마케팅'},{v:'사업화',label:'사업화'}]),
      valid:()=>company.supportNeeds.length>0
    },
    // 컨설턴트: 고객사 유형 선택
    consultantType: {
      kicker:'STEP', title:'어떤 고객사인가요?',
      desc:'고객사의 유형을 고르면 그에 맞는 자격 기준으로 매칭합니다.',
      render:()=>`<div class="field"><div class="opt-grid c4">
        ${COMPANY_TYPES.map(t=>optBtn('companyType',t.v,t.v,t.s,company.companyType===t.v)).join('')}</div></div>`,
      valid:()=>!!company.companyType
    }
  };

  /* ---------- view helper ---------- */
  function show(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
    const el=document.getElementById('view-'+view);
    if(el) el.classList.remove('hidden');
    window.scrollTo({top:0,behavior:'instant'});
  }

  return {
    company:()=>company, get step(){return step}, get persona(){return persona},
    get matched(){return matched}, get dash(){return dash},
    init, pickPersona, jumpToPersona, start, next, back, pick, toggleField,
    analyze, render, setFilter, setSort, toggleExcluded, toggleFunded, resetFilter, scrollToResults,
    openDetail, closeModal, printReport, openProgressive, applyProgressive,
    reset, goHome, editInputs,
    saveDraft, clearDraft, resumeDraft, dismissDraft,
    runAutoUpdate, dismissUpdate,
    saveAsClient, loadClient, deleteClient, newClientFromForm, compareClients,
    _ppset:(k,v)=>{ _ppTmp[k]=v; },
    _backConsHome:()=>{ renderConsultantHome(); }
  };

  /* ================= INIT ================= */
  function init(){
    injectVersion();
    renderPersonaCards();
    prefetchProgramCount();  // 히어로 통계 숫자 프리페치(후킹)
    checkAutoUpdate();   // 무가입 자동 재매칭 배너
    checkDraft();        // 작성중 임시저장 배너
    loadClients();
  }
  async function prefetchProgramCount(){
    const el=document.getElementById('statPrograms'); if(!el)return;
    if(APP_CONFIG.DATA_MODE!=='live') return; // mock이면 '수천' 유지
    try{
      const r=await fetch('/.netlify/functions/programs');
      const data=await r.json();
      const n = data.aliveCount || data.count || 0;
      if(n>0){
        // 카운트업 애니메이션
        const target=n; let cur=0; const step=Math.ceil(target/30);
        const timer=setInterval(()=>{
          cur=Math.min(cur+step,target);
          el.textContent=cur.toLocaleString();
          if(cur>=target) clearInterval(timer);
        },30);
      }
    }catch(e){ /* 실패 시 '수천' 유지 */ }
  }
  function renderPersonaCards(){
    const el=document.getElementById('personaGrid'); if(!el)return;
    const order=['founder','retail','maker','sme'];
    el.innerHTML=order.map(k=>{
      const c=PERSONA_CFG[k];
      return `<div class="persona-card ${k}" onclick="App.pickPersona('${k}')">
        <div class="pc-ic">${c.icon}</div>
        <h3>${c.label}</h3>
        <p>${c.cardDesc}</p>
        <div class="pc-go">시작하기 →</div>
      </div>`;
    }).join('');
  }
  function jumpToPersona(){
    const grid=document.getElementById('personaGrid');
    const q=document.querySelector('.persona-q');
    const target=q||grid;
    if(target){
      target.scrollIntoView({behavior:'smooth', block:'center'});
      // 시선 유도: 유형 카드 펄스 강조
      if(grid){
        grid.classList.remove('pulse'); void grid.offsetWidth; // 리플로우로 재실행
        grid.classList.add('pulse');
        setTimeout(()=>grid.classList.remove('pulse'), 2400);
      }
    }
  }
  function injectVersion(){
    const fv=document.getElementById('footVer');
    if(fv) fv.textContent = '버전 '+APP_VERSION.version+' · 최종 업데이트 '+APP_VERSION.updated;
  }

  /* ================= PERSONA ================= */
  function pickPersona(p){
    persona = p;
    const cfg = PERSONA_CFG[p];
    company = blankCompany();
    company.companyType = cfg.companyType;      // consultant는 null → consultantType 스텝에서 지정
    if(cfg.defaultIndustry) company.industry = cfg.defaultIndustry;
    const pb=document.getElementById('personaBadge'); if(pb) pb.textContent=cfg.label;
    if(cfg.consultant){ renderConsultantHome(); show('consultant'); }
    else { step=0; renderStep(); show('form'); }   // intro 생략, 바로 입력폼
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function activeSteps(){ return PERSONA_CFG[persona].steps; }
  function lastStepIdx(){ return activeSteps().length-1; }

  function start(){ step=0; renderStep(); show('form'); }
  function goHome(){
    if(step>0 || (company&&company.companyType)) saveDraft(true);
    show('landing');
    const b=document.getElementById('draftBanner'); if(b) b.remove();
    checkDraft();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function editInputs(){ step=lastStepIdx(); renderStep(); show('form'); window.scrollTo({top:0,behavior:'smooth'}); }

  /* ================= 스텝 레지스트리 (타입별 최적 문항) ================= */
  // 각 스텝: {title, kicker, render, valid} — persona.steps가 이 키들을 순서대로 나열

  function industrySelect(){
    // 그룹형 드롭다운(optgroup) — 공고 기준 확대된 산업분류
    const opts = INDUSTRY_GROUPS.map(g=>`<optgroup label="${g.group}">${
      g.items.map(v=>`<option ${company.industry===v?'selected':''}>${v}</option>`).join('')
    }</optgroup>`).join('');
    return `<div class="field"><label class="q">주력 산업<span class="req">*</span></label>
      <select id="f-industry"><option value="">산업을 선택하세요</option>${opts}</select>
      <div class="help">가장 가까운 분야를 고르면 돼요. 없으면 '기타'에서 선택.</div></div>`;
  }

  function regionField(){
    const districts = company.region && DISTRICTS[company.region] ? DISTRICTS[company.region] : [];
    const showDistrict = districts.length > 0;
    return `<div class="field"><label class="q">사업장 소재지<span class="req">*</span></label>
      <div class="region-row">
        <select id="f-region" class="region-sido"><option value="">시·도 선택</option>
        ${REGIONS.map(r=>`<option ${company.region===r?'selected':''}>${r}</option>`).join('')}</select>
        <select id="f-district" class="region-gu" ${showDistrict?'':'disabled'}>
          <option value="">${showDistrict?'시·군·구 (선택)':'시·도 먼저 선택'}</option>
          ${districts.map(d=>`<option ${company.district===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="help">시·군·구는 선택사항이에요. 안 고르면 시·도 단위로 매칭됩니다.</div></div>`;
  }
  function needGrid(fields){
    return `<div class="field"><div class="opt-grid c3">
      ${fields.map(f=>{
        const sel=company.supportNeeds.includes(f.v);
        return `<button class="opt ${sel?'sel':''}" data-field="${f.v}" onclick="App.toggleField('${f.v}')">${f.label||f.v}</button>`;
      }).join('')}</div></div>`;
  }

  function renderProgress(){
    const el=document.getElementById('progress'); if(!el)return;
    const steps=activeSteps();
    const labels=steps.map(k=>({creatorBasic:'기본',idea:'아이디어',bizBasic:'기업정보',smeProfile:'규모',
      need:'지원분야',retailNeed:'지원분야',makerNeed:'지원분야',consultantType:'고객유형'}[k]||k));
    labels.push('분석');
    el.innerHTML = labels.map((s,i)=>{
      const cls = i<step?'done':(i===step?'active':'');
      return `<div class="node ${cls}"><div class="cir">${i<step?'✓':i+1}</div><div class="lbl">${s}</div></div>`;
    }).join('');
  }

  function renderStep(){
    renderProgress();
    const panel=document.getElementById('formPanel'); if(!panel)return;
    const key=activeSteps()[step];
    const def=STEP_DEFS[key];
    const kicker=`STEP ${step+1}`;
    const html = head(kicker, def.title, def.desc)
      + def.render()
      + navBtns(step>0, def.valid(), def.optional && !def.valid());
    panel.innerHTML=html;
    bindStepInputs();
  }

  function head(k,t,d){ return `<div class="panel-head"><span class="kicker">${k}</span><h2>${t}</h2><p>${d}</p></div>`; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function optBtn(field,val,label,sub,sel){
    return `<button class="opt ${sel?'sel':''}" onclick="App.pick('${field}','${val}')">${label}${sub?`<small>${sub}</small>`:''}</button>`;
  }
  function navBtns(showBack, canNext, canSkip){
    const isLast = step===lastStepIdx();
    const nextLabel = isLast ? '지원사업 분석하기 →' : '다음 →';
    let right='';
    if(canSkip && !canNext){
      right=`<button class="btn btn-primary" id="nextBtn" onclick="App.next()">${isLast?'분석하기':'건너뛰기'} →</button>`;
    } else {
      right=`<button class="btn btn-primary" id="nextBtn" ${canNext?'':'disabled style="opacity:.4;cursor:not-allowed"'} onclick="App.next()">${nextLabel}</button>`;
    }
    return `<div class="nav-btns">
      ${showBack?`<button class="btn btn-back" onclick="App.back()">← 이전</button>`:`<button class="btn btn-back" onclick="App.goHome()">← 처음으로</button>`}
      ${right}</div>`;
  }
  function bindStepInputs(){
    const r=document.getElementById('f-region'); if(r) r.onchange=e=>{
      company.region=e.target.value;
      company.district=null;   // 시·도 바뀌면 시·군·구 초기화
      // 해당 스텝만 다시 그려 시·군·구 드롭다운 갱신
      renderStep();
    };
    const dist=document.getElementById('f-district'); if(dist) dist.onchange=e=>{
      company.district=e.target.value||null; refreshNext();
    };
    const y=document.getElementById('f-year'); if(y) y.oninput=e=>{
      const v=parseInt(e.target.value,10);
      company.establishedYear=e.target.value||null;
      company.businessAge = e.target.value ? Math.max(0,2026-v) : null;
      // 이상값 경고 (미래연도/과거)
      const warn=document.getElementById('yearWarn');
      if(e.target.value && (v>2026 || v<1960)){
        if(!warn){
          const w=document.createElement('div'); w.id='yearWarn'; w.className='field-warn';
          w.textContent='설립연도를 확인해 주세요 (1960~2026)';
          e.target.parentNode.appendChild(w);
        }
      } else if(warn){ warn.remove(); }
      refreshNext();
    };
    const ind=document.getElementById('f-industry'); if(ind) ind.onchange=e=>{company.industry=e.target.value; refreshNext();};
    const d=document.getElementById('f-desc'); if(d) d.oninput=e=>{company.businessDescription=e.target.value||null; refreshNext();};
  }
  function refreshNext(){
    const btn=document.getElementById('nextBtn'); if(!btn)return;
    const def=STEP_DEFS[activeSteps()[step]];
    const ok=def.valid();
    if(def.optional){ btn.disabled=false; btn.style.opacity='1'; btn.style.cursor='pointer'; return; }
    btn.disabled=!ok; btn.style.opacity=ok?'1':'.4'; btn.style.cursor=ok?'pointer':'not-allowed';
  }

  function next(){
    if(step===lastStepIdx()){ saveDraft(true); analyze(); return; }
    step++; renderStep(); saveDraft(true);
  }
  function back(){ if(step>0){step--; renderStep();} else goHome(); }
  function pick(field,val){
    if(field==='_exp'){ company.exportHistory = (val==='있음'); renderStep(); return; }
    if(field==='_tax'){ company.taxArrears = (val==='체납 있음'); renderStep(); return; }
    company[field]=val; renderStep();
  }
  function toggleField(v){
    const i=company.supportNeeds.indexOf(v);
    if(i>=0) company.supportNeeds.splice(i,1); else company.supportNeeds.push(v);
    renderStep();
  }

  /* ================= 분석 ================= */
  async function analyze(){
    show('loading');
    const steps=['기업조건 확인','지원사업 데이터 조회','자격조건 비교','적합도·확인도 계산','대시보드·리포트 정리'];
    const box=document.getElementById('loadSteps');
    box.innerHTML=steps.map((s,i)=>`<div class="ls" id="ls-${i}"><div class="m">${i+1}</div>${s}</div>`).join('');
    let loadOk=true;
    try{ programs = await ProgramProvider.fetchPrograms(); }
    catch(e){ loadOk=false; }
    updateDataSourceUI();
    for(let i=0;i<steps.length;i++){
      const el=document.getElementById('ls-'+i);
      document.querySelectorAll('.ls').forEach(x=>x.classList.remove('on'));
      el.classList.add('on');
      await wait(340+Math.random()*160);
      el.classList.remove('on'); el.classList.add('fin'); el.querySelector('.m').textContent='✓';
    }
    if(!loadOk){ renderError(); return; }
    matched = runMatching(programs, company);
    dash = buildDashboard(matched);
    filter='all'; sortBy='deadline'; showExcluded=false; fundedOnly=false;
    saveProfile();
    clearDraft();
    renderDashboard();
    renderPpBanner();
    render();
    afterRenderMeta();
    const scb=document.getElementById('saveClientBtn');
    if(scb) scb.style.display = (persona==='consultant')?'inline-flex':'none';
    show('results');
  }

  function updateDataSourceUI(){
    const live = (ProgramProvider.lastMode === 'live');
    const badge = document.querySelector('.badge-demo');
    if(badge){
      badge.textContent = live ? '실시간 공고' : 'DEMO 데이터';
      badge.style.background = live ? '#e6f6ef' : '';
      badge.style.color = live ? '#1f9d6b' : '';
      badge.style.borderColor = live ? '#b8e6d0' : '';
    }
    const notice = document.querySelector('.data-notice');
    if(notice){
      if(live){
        const sc = ProgramProvider.lastSourceCounts || {};
        const srcNames = [];
        if(sc.bizinfo) srcNames.push('기업마당');
        if(sc.kstartup) srcNames.push('K-Startup');
        const srcTxt = srcNames.length ? srcNames.join('·')+' 연동' : '실시간 연동';
        notice.innerHTML = `✅ <span><b>실시간 공고 기준</b>입니다(${srcTxt}). 자격조건 일부는 공고 본문 기준이며, 실제 신청 전 공식 공고를 확인하세요.</span>`;
        notice.style.background = '#e6f6ef'; notice.style.borderColor = '#b8e6d0'; notice.style.color = '#1a6b4f';
      } else {
        notice.innerHTML = '⚠️ <span><b>DEMO 데이터 기준</b>입니다. 표시된 공고·금액·기간은 예시이며, 실제 신청은 공식 공고를 확인하세요.</span>';
      }
    }
  }

  function afterRenderMeta(){
    const now=new Date();
    const stamp=`${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const rf=document.getElementById('resFoot');
    if(rf) rf.textContent=`조회 기준 ${stamp} · 출처: 기업마당·K-Startup (DEMO) · 총 ${dash.total}건 분석`;
    const pm=document.getElementById('printMeta');
    if(pm) pm.innerHTML=`조회일 ${stamp}<br>${company.region||''} · ${company.industry||''} · ${company.companyType||''}`;
  }
  function renderPpBanner(){
    const el=document.getElementById('ppBanner'); if(!el)return;
    const needed=collectNeeded();
    if(!needed.length || progressiveDone){ el.innerHTML=''; return; }
    const labels={revenue:'매출 조건',employee:'상시근로자 조건',repAge:'대표자 연령',export:'수출 조건'};
    el.innerHTML=`<div class="pp-banner">
      <div class="ppb-t"><b>추가 정보 ${needed.length}가지를 알려주시면 자격 확인도를 높일 수 있어요</b>
        <span>현재 확인이 필요한 항목: ${needed.map(n=>labels[n]).join(' · ')}</span></div>
      <button class="btn btn-primary btn-sm" onclick="App.openProgressive()">추가 정보 입력하기</button>
    </div>`;
  }
  function wait(ms){return new Promise(r=>setTimeout(r,ms));}
  function renderError(){
    const el=document.getElementById('view-results');
    show('results');
    document.getElementById('dashboard').innerHTML='';
    document.getElementById('cards').innerHTML=
      `<div class="empty"><h3>데이터를 불러오지 못했습니다</h3><p>잠시 후 다시 시도해 주세요.</p>
       <button class="btn btn-primary" onclick="App.reset()">처음으로</button></div>`;
  }

  /* ================= 대시보드 렌더 (차별화 핵심) ================= */
  function renderDashboard(){
    const el=document.getElementById('dashboard'); if(!el||!dash)return;
    const d=dash;
    // 후킹 숫자
    const analyzed = (ProgramProvider.lastMode==='live') ? (ProgramProvider.lastAliveCount || d.total) : d.total;

    // 지원분야별 건수 (검토가능 사업 기준, 대표분야 1개씩 배정)
    const fieldBuckets = fieldBucketCounts();
    const totalFields = fieldBuckets.reduce((s,f)=>s+f.count,0)||1;
    // 도넛 색상 팔레트
    const PALETTE=['#1f9d6b','#e8921a','#4666c4','#c0428a','#2a9d9d','#8a6d3b','#9b59b6','#e05252'];
    const donutSegs = fieldBuckets.slice(0,8).map((f,i)=>({label:needLabel(f.field), value:f.count, color:PALETTE[i%PALETTE.length]}));
    const donut = donutSVG(donutSegs);

    // 분야별 막대(건수)
    const maxF = Math.max(1, ...fieldBuckets.map(f=>f.count));
    const bars = fieldBuckets.slice(0,8).map((f,i)=>`
      <div class="mbar"><span class="mbar-l">${FIELD_ICON[f.field]||'•'} ${needLabel(f.field)}</span>
        <span class="mbar-t"><span class="mbar-f" style="width:${Math.round(f.count/maxF*100)}%;background:${PALETTE[i%PALETTE.length]}"></span></span>
        <span class="mbar-v">${f.count}</span></div>`).join('');

    const heroBody = d.considerable>0
      ? `<div class="dh-amount">${fmtKRW(d.totalMax)}</div>
         <div class="dh-sub">신청 검토 가능 <b>${d.considerable}건</b> · 최대 지원금 합산(추정)</div>
         ${d.closingSoon>0?`<div class="dh-chips"><span class="dchip soon">⏰ 마감임박 ${d.closingSoon}건</span></div>`:''}`
      : `<div class="dh-amount" style="font-size:22px">지금 딱 맞는 사업은 적어요</div>
         <div class="dh-sub">조건을 바꾸거나, 아래 상담으로 찾아드릴게요.</div>`;

    const hookBanner = `
      <div class="hook-banner" onclick="App.scrollToResults()" style="cursor:pointer">
        지금 접수 중인 <span class="hook-num">${analyzed.toLocaleString()}</span>개 공고 중,
        귀사가 신청할 수 있는 <span class="hook-match">${d.considerable}개</span>를 찾았어요
        <span class="hook-cta">아래에서 확인 ↓</span>
      </div>`;

    el.innerHTML = hookBanner + `
      <div class="dash-grid">
        <div class="dash-hero">
          <div class="dh-label">신청 검토 가능한 총 지원규모 <span class="dh-info" title="자격을 통과한 사업들의 최대 지원금 합계(추정)">ⓘ</span></div>
          ${heroBody}
        </div>
        <div class="dash-card">
          <div class="dc-title">분야별 구성</div>
          <div class="donut-wrap">${donut}
            <div class="donut-center"><b>${d.considerable}</b><span>건</span></div>
          </div>
        </div>
        <div class="dash-card">
          <div class="dc-title">분야별 매칭 건수</div>
          <div class="mbars">${bars||'<span class="muted">데이터 없음</span>'}</div>
        </div>
      </div>`;
  }

  // 지원분야별 건수 (대표분야 1개씩 배정 — 결과 그룹과 동일 로직)
  function fieldBucketCounts(){
    const list=matched.filter(m=>m.state!=='대상 아님');
    const counts={};
    list.forEach(m=>{
      const purposes=m.program.supportPurposes||[];
      let bucket=null;
      for(const f of FIELD_ORDER){ if(purposes.includes(f)){ bucket=f; break; } }
      if(!bucket) bucket = purposes[0] || '기타';
      counts[bucket]=(counts[bucket]||0)+1;
    });
    const ordered=[...FIELD_ORDER.filter(f=>counts[f]), ...Object.keys(counts).filter(f=>!FIELD_ORDER.includes(f))];
    return ordered.map(f=>({field:f, count:counts[f]}));
  }

  // 도넛 SVG
  function donutSVG(segs){
    const total=segs.reduce((s,x)=>s+x.value,0)||1;
    const R=52, C=2*Math.PI*R; let off=0;
    const arcs=segs.filter(s=>s.value>0).map(s=>{
      const frac=s.value/total, len=frac*C;
      const el=`<circle cx="70" cy="70" r="${R}" fill="none" stroke="${s.color}" stroke-width="18"
                 stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off+=len; return el;
    }).join('');
    const legend=segs.map(s=>`<span class="lg"><i style="background:${s.color}"></i>${s.label} ${s.value}</span>`).join('');
    return `<svg viewBox="0 0 140 140" width="140" height="140">${arcs}</svg><div class="donut-legend">${legend}</div>`;
  }

  /* ================= 결과 카드 렌더 ================= */
  function render(){
    renderNeedFilter();  // 지원분야 기반 필터 세그먼트
    const cards=document.getElementById('cards'); if(!cards)return;
    let list = matched.slice();
    // '대상 아님'은 항상 숨김(사용자가 보고 싶은 게 아님)
    list=list.filter(m=>m.state!=='대상 아님');
    // 지원금 있는 사업만
    if(fundedOnly) list=list.filter(m=> typeof m.program.supportAmountMax==='number' && m.program.supportAmountMax>0);
    // 분야 필터
    const activeNeed = (filter && filter!=='all' && filter!=='마감임박') ? filter : null;
    if(filter==='마감임박') list=list.filter(m=>m.dl.state==='CLOSING_SOON');
    if(activeNeed){
      const purposes = needToPurposes(activeNeed);
      list = list.filter(m=> (m.program.supportPurposes||[]).some(pp=>purposes.includes(pp)));
    }

    // 정렬(지역 티어 → 마감/적합도)
    sortList(list);

    // 결과 개수 안내
    renderResultCount(list.length);

    if(!list.length){
      cards.innerHTML=`<div class="empty"><h3>${filter==='all'?'조건에 맞는 사업이 아직 없어요':'이 조건엔 사업이 없어요'}</h3>
        <p>${filter==='all'?'지원분야를 넓히거나, 아래 상담으로 맞춤 사업을 찾아드릴게요.':'<button class="btn btn-ghost btn-sm" onclick="App.setFilter(\'all\')">← 전체 보기</button>'}</p></div>`;
      return;
    }

    // ── 전체 보기: 지원분야 그룹핑 / 특정분야·마감임박: 평면 목록 ──
    const useGrouping = !activeNeed && filter!=='마감임박' && !fundedOnly;
    if(useGrouping){
      cards.innerHTML = renderGroupedByField(list);
    } else {
      cards.innerHTML = list.map(m=>cardHTML(m)).join('');
    }
  }

  // 결과 개수 + 현재 필터 상태 표시
  function renderResultCount(n){
    const el=document.getElementById('resultCount'); if(!el)return;
    let label='전체';
    if(filter==='마감임박') label='마감임박';
    else if(filter!=='all') label=needLabel(filter);
    const fundTxt = fundedOnly ? ' · 지원금 있는 사업만' : '';
    const filterActive = (filter!=='all') || fundedOnly;
    el.innerHTML = `
      <div class="rc-count-in">
        <b>${label}${fundTxt}</b> <span class="rc-count-n">${n}건</span>
        ${filterActive?`<button class="rc-count-reset" onclick="App.resetFilter()">전체 보기 ✕</button>`:''}
      </div>`;
  }
  function resetFilter(){ filter='all'; fundedOnly=false; syncFundedBtn(); render(); }
  function scrollToResults(){
    const el=document.getElementById('resultCount')||document.getElementById('cards');
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // 니즈명 → supportPurposes 매핑
  function needToPurposes(need){
    const f=SUPPORT_FIELDS.find(x=>x.v===need);
    return f?f.p:[need];
  }

  // 결과를 지원분야별로 자동 그룹핑 (건수 표기)
  function renderGroupedByField(list){
    const buckets={}; const used=new Set();
    // 각 사업을 대표 지원분야 하나에 배정(FIELD_ORDER 우선순위)
    list.forEach(m=>{
      const purposes=m.program.supportPurposes||[];
      let bucket=null;
      for(const f of FIELD_ORDER){ if(purposes.includes(f)){ bucket=f; break; } }
      if(!bucket) bucket = purposes[0] || '기타';
      (buckets[bucket]=buckets[bucket]||[]).push(m);
    });
    // FIELD_ORDER 순서로 그룹 출력
    const orderedKeys=[...FIELD_ORDER.filter(f=>buckets[f]), ...Object.keys(buckets).filter(f=>!FIELD_ORDER.includes(f))];
    let html='';
    orderedKeys.forEach(f=>{
      const items=buckets[f]; if(!items||!items.length) return;
      html+=`
      <div class="need-group">
        <div class="need-group-head">
          <span class="ng-icon">${FIELD_ICON[f]||'📌'}</span>
          <h3 class="ng-title">${needLabel(f)}</h3>
          <span class="ng-count">${items.length}건</span>
        </div>
        <div class="need-group-cards">${items.map(m=>cardHTML(m)).join('')}</div>
      </div>`;
    });
    return html;
  }
  function needLabel(need){
    const L={'정책자금/금융':'자금·융자','R&D/기술':'R&D·기술개발','창업':'창업·재도전','사업화':'사업화',
      '판로':'판로·유통','판로/유통':'판로·유통','마케팅':'마케팅','수출':'수출','인력':'인력·고용',
      '경영':'경영개선','경영/컨설팅':'경영·컨설팅','컨설팅':'경영·컨설팅','시설/공간':'시설·공간','디지털전환':'디지털전환','제조혁신':'제조혁신·설비','기타':'기타 지원'};
    return L[need]||need;
  }

  function sortList(list){
    const order={'추천':0,'조건부 추천':1,'확인 필요':2,'대상 아님':3};
    list.sort((a,b)=>{
      if(company.region){
        const ra=(a.regionTier==null?-1:a.regionTier), rb=(b.regionTier==null?-1:b.regionTier);
        if(ra!==rb) return rb-ra;
      }
      if(sortBy==='deadline'){
        const grp=m=>{ if(m.dl.state==='CLOSING_SOON'||m.dl.state==='OPEN') return 0; if(m.dl.state==='UPCOMING') return 1; return 2; };
        const ga=grp(a), gb=grp(b);
        if(ga!==gb) return ga-gb;
        const da=a.dl.dday==null?9999:a.dl.dday, db=b.dl.dday==null?9999:b.dl.dday;
        return da-db;
      }
      if(sortBy==='amount') return (b.program.supportAmountMax||0)-(a.program.supportAmountMax||0);
      return (order[a.state]-order[b.state]) || (b.fit-a.fit);
    });
  }

  // 지원분야 기반 필터 세그먼트 (결과에 나온 분야로 동적 생성)
  function renderNeedFilter(){
    const seg=document.getElementById('seg-filter'); if(!seg)return;
    // 검토가능 사업들의 지원분야 집계
    const fieldCount={};
    matched.filter(m=>m.state!=='대상 아님').forEach(m=>{
      (m.program.supportPurposes||[]).forEach(f=>{ fieldCount[f]=(fieldCount[f]||0)+1; });
    });
    const fields=FIELD_ORDER.filter(f=>fieldCount[f]);
    let btns=`<button data-val="all" class="${filter==='all'?'on':''}" onclick="App.setFilter('all')">전체</button>`;
    fields.forEach(f=>{
      btns+=`<button data-val="${f}" class="${filter===f?'on':''}" onclick="App.setFilter('${f}')">${needLabel(f)}</button>`;
    });
    btns+=`<button data-val="마감임박" class="${filter==='마감임박'?'on':''}" onclick="App.setFilter('마감임박')">⏰ 마감임박</button>`;
    seg.innerHTML=btns;
  }

  function renderSummary(){
    const el=document.getElementById('summaryBar'); if(!el||!dash)return;
    const d=dash;
    // 각 상태에 뜻풀이(title 툴팁 + 하단 범례)
    const cells=[
      {n:d.considerable,l:'신청 검토 가능',c:'lead',desc:'자격을 통과해 신청을 검토할 만한 사업'},
      {n:d.recommend,l:'추천',c:'ok',desc:'자격조건을 모두 충족하고 적합도가 높은 사업'},
      {n:d.conditional,l:'조건부',c:'cond',desc:'대체로 맞지만 일부 조건 확인이 필요한 사업'},
      {n:d.check,l:'확인 필요',c:'check',desc:'추가 정보가 있어야 자격을 판정할 수 있는 사업'},
      {n:d.ineligible,l:'대상 아님',c:'no',desc:'지역·업력·대상 등 자격에 맞지 않거나 마감된 사업'}
    ];
    el.innerHTML=cells.map(c=>`<div class="sum-cell ${c.c==='lead'?'lead':''}" title="${c.desc}"><div class="n ${c.c||''}">${c.n}</div><div class="l">${c.l}</div></div>`).join('');
    // 범례(설명) 렌더
    const lg=document.getElementById('statusLegend');
    if(lg){
      lg.innerHTML = `
        <span class="lg-item"><i class="lg-dot ok"></i><b>추천</b> 자격 충족·적합도 높음</span>
        <span class="lg-item"><i class="lg-dot cond"></i><b>조건부</b> 일부 조건 확인 필요</span>
        <span class="lg-item"><i class="lg-dot check"></i><b>확인 필요</b> 추가 정보 필요</span>
        <span class="lg-item"><i class="lg-dot no"></i><b>대상 아님</b> 자격 불일치·마감</span>`;
    }
  }

  function cardHTML(m){
    const p=m.program, dl=dlBadge(m.dl);
    const stCls={'추천':'ok','조건부 추천':'cond','확인 필요':'check','대상 아님':'no'}[m.state];
    const stShort={'추천':'추천','조건부 추천':'조건부','확인 필요':'확인필요','대상 아님':'대상아님'}[m.state];
    // 한 줄 자격 요약(장황한 박스 대신)
    const passCount=(m.elig.conds||[]).filter(c=>c.result==='pass').length;
    const checkItems=(m.elig.conds||[]).filter(c=>c.result==='unknown').map(c=>c.label);
    const amt = p.supportAmountText || fmtKRW(p.supportAmountMax);
    const eligLine = checkItems.length
      ? `자격 ${passCount}개 충족 · <span class="chk">${checkItems.slice(0,2).join('·')} 확인 필요</span>`
      : `기본 자격 ${passCount}개 충족`;
    return `<div class="rcard ${stCls}">
      <div class="rc-line1">
        ${regionBadge(m)}
        ${p._aiEnriched?`<span class="ai-badge" title="AI가 공고 본문에서 자격조건을 정밀 분석한 사업">🤖 AI</span>`:''}
        <span class="rc-dl ${dl.cls}">${dl.icon} ${dl.txt}</span>
      </div>
      <h3>${p.programName}</h3>
      <div class="rc-agency">${p.agency||''}${p.executingAgency?` · ${p.executingAgency}`:''}</div>
      <div class="rc-amt-row">
        <div class="rc-amt"><span class="rc-amt-l">최대 지원</span><b>${amt}</b></div>
        <div class="rc-fit">
          <span class="rc-fit-l">적합도</span><b>${m.fit}</b>
          <span class="rc-fit-bar"><span style="width:${m.fit}%"></span></span>
        </div>
      </div>
      <div class="rc-period">📅 ${periodText(p, m.dl)}</div>
      <div class="rc-elig">${eligLine}</div>
      <div class="rc-actions">
        <button class="btn btn-primary btn-sm" onclick="App.openDetail('${p.sourceProgramId}')">자세히 · 자격보기</button>
        ${p.originalUrl?`<a class="btn btn-ghost btn-sm" href="${p.originalUrl}" target="_blank" rel="noopener">공식공고 ↗</a>`:''}
      </div>
    </div>`;
  }

  function renderExcludedToggle(){
    const el=document.getElementById('excludedToggle'); if(!el||!dash)return;
    if(dash.ineligible<=0){ el.innerHTML=''; return; }
    el.innerHTML = `<button class="excl-btn" onclick="App.toggleExcluded()">
      ${showExcluded?'대상 아님 사업 숨기기':`대상 아님으로 분류된 사업 보기 (${dash.ineligible})`}</button>`;
  }

  function stateIcon(s){return {'추천':'●','조건부 추천':'◐','확인 필요':'?','대상 아님':'✕'}[s];}
  function regionBadge(m){
    if(m.regionTier===2) return `<span class="rgn-badge t2">📍 ${m.regionLabel}</span> `;
    if(m.regionTier===1) return `<span class="rgn-badge t1">${m.regionLabel}</span> `;
    if(m.regionTier===0) return `<span class="rgn-badge t0">전국</span> `;
    return '';
  }
  function periodText(p, dl){
    const s=p.applicationStart, e=p.applicationEnd;
    if(s && e) return `${fmtDate(s)} ~ ${fmtDate(e)} 마감`;
    if(e) return `~ ${fmtDate(e)} 마감`;
    if(p.applicationEndText) return p.applicationEndText;   // '예산 소진시까지' 등
    if(dl.state==='OPEN') return '접수중 · 마감일은 공식공고 확인';
    return '신청기간은 공식공고 확인';
  }
  function fmtDate(d){
    if(!d) return '';
    const m=String(d).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : d;
  }
  function dlBadge(dl){
    if(dl.state==='CLOSED')return {txt:'마감됨',cls:'no',icon:'✕'};
    if(dl.state==='UNKNOWN')return {txt:'기간 확인',cls:'no',icon:'?'};
    if(dl.state==='UPCOMING')return {txt: dl.dday!=null?`D-${dl.dday} 예정`:'접수 예정',cls:'up',icon:'◷'};
    if(dl.state==='CLOSING_SOON')return {txt: dl.dday!=null?`마감 D-${dl.dday}`:'마감 임박',cls:'soon',icon:'⏰'};
    // OPEN: 마감일 없으면 '상시/접수중', 있으면 D-day
    if(dl.dday==null) return {txt:'접수중', cls:'open', icon:'●'};
    if(dl.dday===0) return {txt:'오늘 마감', cls:'soon', icon:'⏰'};
    return {txt:`D-${dl.dday}`,cls:'open',icon:'●'};
  }

  function setFilter(f){ filter=f; syncSeg('seg-filter',f); render(); }
  function setSort(s){ sortBy=s; render(); }
  function toggleExcluded(){ showExcluded=!showExcluded; render(); }
  function toggleFunded(){ fundedOnly=!fundedOnly; syncFundedBtn(); render(); }
  function syncFundedBtn(){
    const btn=document.getElementById('fundedToggle');
    if(btn) btn.classList.toggle('on', fundedOnly);
  }
  function syncSeg(id,val){
    const seg=document.getElementById(id); if(!seg)return;
    seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.val===val));
  }

  /* ================= 상세 모달 ================= */
  function openDetail(id){
    const m=matched.find(x=>x.program.sourceProgramId===id); if(!m)return;
    const p=m.program;
    const stCls={'추천':'ok','조건부 추천':'cond','확인 필요':'check','대상 아님':'no'}[m.state];
    const conds=(m.elig.conds||[]).map(c=>{
      const ic={pass:'충족',fail:'미충족',unknown:'확인필요',na:'해당없음'}[c.result];
      const cc={pass:'ok',fail:'no',unknown:'check',na:'muted'}[c.result];
      return `<div class="cond-row"><span class="cbadge ${cc}">${ic}</span>
        <div><b>${c.label}</b>${c.evidence?`<span class="cond-ev">${c.evidence}</span>`:''}</div></div>`;
    }).join('');
    const pref=(p.preferenceConditions||[]).map(x=>`<span class="pref">우대 ${x}</span>`).join('');
    document.getElementById('modalBody').innerHTML=`
      <span class="rc-state ${stCls}" style="align-self:flex-start">${stateIcon(m.state)} ${m.state}</span>
      <h2 style="margin:8px 0 4px">${p.programName}</h2>
      <div class="m-info">
        <div><span>소관기관</span><b>${p.agency||'—'}</b></div>
        <div><span>수행기관</span><b>${p.executingAgency||'—'}</b></div>
        <div><span>지원분야</span><b>${p.category||'—'}${p.subCategory?` / ${p.subCategory}`:''}</b></div>
        <div><span>지원금액</span><b>${p.supportAmountText||fmtKRW(p.supportAmountMax)}</b></div>
        <div><span>신청기간</span><b>${p.applicationStart||'—'} ~ ${p.applicationEnd||'—'} (${dlBadge(m.dl).txt})</b></div>
        <div><span>문의</span><b>${p.contact||'—'}</b></div>
      </div>
      <div class="m-sec"><h4>사업 개요</h4><p>${p.supportDescription||'—'}</p></div>
      <div class="m-sec"><h4>자격조건 판정 <span class="muted">(적합도 ${m.fit} · 확인도 ${m.conf})</span></h4>${conds}</div>
      ${pref?`<div class="m-sec"><h4>우대사항</h4><div class="prefs">${pref}</div></div>`:''}
    `;
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('modalOpenLink').href = p.originalUrl||'#';
  }
  function closeModal(){ document.getElementById('detailModal').classList.add('hidden'); }

  /* ================= Progressive Profiling ================= */
  function openProgressive(){
    const needed=collectNeeded();
    if(!needed.length){ toast('추가로 확인할 항목이 없습니다.'); return; }
    const body=document.getElementById('ppBody');
    body.innerHTML = needed.map(n=>ppField(n)).join('');
    document.getElementById('ppModal').classList.remove('hidden');
  }
  function collectNeeded(){
    const set=new Set();
    matched.forEach(m=>{
      if(m.state==='확인 필요'||m.state==='조건부 추천'){
        (m.elig.conds||[]).filter(c=>c.result==='unknown').forEach(c=>{
          if(/매출/.test(c.label)) set.add('revenue');
          if(/직원|상시/.test(c.label)) set.add('employee');
          if(/대표자|연령/.test(c.label)) set.add('repAge');
          if(/수출/.test(c.label)) set.add('export');
        });
      }
    });
    return [...set];
  }
  function ppField(n){
    const F={
      revenue:{q:'연 매출 규모',opts:['매출없음','5억미만','5-10억','10-30억','30-50억','50-100억','100억이상'],key:'revenueRange'},
      employee:{q:'상시 근로자 수',opts:['1-4인','5-9인','10-29인','30-99인','100인이상'],key:'employeeCount'},
      repAge:{q:'대표자 연령대',opts:['20대','30대','40대','50대','60대이상'],key:'representativeAge'},
      export:{q:'수출 실적',opts:['있음','없음'],key:'exportHistory'}
    }[n];
    return `<div class="field"><label class="q">${F.q}</label><div class="opt-grid c3">
      ${F.opts.map(o=>`<button class="opt" data-ppkey="${F.key}" data-ppval="${o}"
        onclick="this.parentNode.querySelectorAll('.opt').forEach(b=>b.classList.remove('sel'));this.classList.add('sel');App._ppset('${F.key}','${o}')">${o}</button>`).join('')}
    </div></div>`;
  }
  function applyProgressive(){
    Object.assign(company,_ppTmp);
    // export 특수 처리
    if(_ppTmp.exportHistory) company.exportHistory = _ppTmp.exportHistory==='있음';
    matched=runMatching(programs,company);
    dash=buildDashboard(matched);
    progressiveDone=true;
    document.getElementById('ppModal').classList.add('hidden');
    saveProfile();
    renderDashboard(); renderPpBanner(); render(); afterRenderMeta();
    toast('추가 정보로 매칭을 다시 계산했습니다.');
  }

  /* ================= 무가입 자동 재매칭 (차별화 핵심) ================= */
  function saveProfile(){
    try{
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        persona, company, ts:Date.now(),
        summary:{total:dash.total, considerable:dash.considerable, recommend:dash.recommend}
      }));
      localStorage.setItem(LASTSEEN_KEY, JSON.stringify({ts:Date.now(), programIds: matched.filter(m=>m.state!=='대상 아님').map(m=>m.program.sourceProgramId)}));
    }catch(e){}
  }
  function checkAutoUpdate(){
    let prof; try{ prof=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null'); }catch(e){ return; }
    if(!prof || !prof.company || !prof.company.companyType) return;
    const days=Math.floor((Date.now()-prof.ts)/86400000);
    const agoTxt = days<=0?'오늘':days===1?'어제':`${days}일 전`;
    const host=document.getElementById('view-landing'); if(!host)return;
    if(document.getElementById('updateBanner'))return;
    const bn=document.createElement('div');
    bn.id='updateBanner'; bn.className='update-banner';
    const ptype = prof.company.companyType||'';
    bn.innerHTML=`<div class="ub-in">
      <div class="ub-txt">
        <b>🔄 저장한 조건의 지원사업을 업데이트했어요</b>
        <span>${agoTxt} 저장 · ${prof.company.region||''} · ${ptype}${prof.company.industry?' · '+prof.company.industry:''} — 이 조건에 맞는 최신 공고만 다시 매칭해 드릴게요.</span>
      </div>
      <div class="ub-btns">
        <button class="btn btn-primary btn-sm" onclick="App.runAutoUpdate()">지원사업 업데이트 보기</button>
        <button class="btn btn-ghost btn-sm" onclick="App.dismissUpdate()">닫기</button>
      </div></div>`;
    host.parentNode.insertBefore(bn, host);
  }
  async function runAutoUpdate(){
    let prof; try{ prof=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null'); }catch(e){ return; }
    if(!prof) return;
    persona=prof.persona; company=Object.assign(blankCompany(),prof.company);
    // 이전 검토가능 목록
    let last; try{ last=JSON.parse(localStorage.getItem(LASTSEEN_KEY)||'null'); }catch(e){}
    const prevIds=new Set(last?last.programIds:[]);
    await analyze();
    // 델타 하이라이트: 신규 검토가능 사업
    const nowConsiderable=matched.filter(m=>m.state!=='대상 아님');
    const newOnes=nowConsiderable.filter(m=>!prevIds.has(m.program.sourceProgramId));
    if(newOnes.length){
      toast(`지난 방문 이후 새로 검토 가능해진 사업 ${newOnes.length}건이 있습니다.`);
      // 카드에 NEW 뱃지
      setTimeout(()=>{
        newOnes.forEach(m=>{
          const cards=document.querySelectorAll('#cards .rcard h3');
          cards.forEach(h=>{ if(h.textContent===m.program.programName && !h.querySelector('.newbadge')){
            const b=document.createElement('span'); b.className='newbadge'; b.textContent='NEW'; h.appendChild(b);
          }});
        });
      },100);
    }
  }
  function dismissUpdate(){ const b=document.getElementById('updateBanner'); if(b) b.remove(); }

  /* ================= 임시저장 ================= */
  function saveDraft(silent){
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({persona,company,step,ts:Date.now()}));
      if(!silent) toast('입력 내용을 임시 저장했습니다.');
    }catch(e){ if(!silent) toast('임시 저장을 사용할 수 없는 환경입니다.'); }
  }
  function clearDraft(){ try{localStorage.removeItem(DRAFT_KEY);}catch(e){} const b=document.getElementById('draftBanner'); if(b)b.remove(); }
  function checkDraft(){
    if(document.getElementById('draftBanner'))return;
    let d; try{ d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); }catch(e){return;}
    if(!d||!d.company||!d.company.companyType)return;
    const host=document.getElementById('view-landing'); if(!host)return;
    const bn=document.createElement('div');
    bn.id='draftBanner'; bn.className='draft-banner';
    bn.innerHTML=`<div class="db-in"><span>📝 작성 중이던 입력이 있습니다 — 이어서 진행할까요?</span>
      <span class="db-btns"><button class="btn btn-primary db-sm" onclick="App.resumeDraft()">이어하기</button>
      <button class="btn btn-ghost db-sm" onclick="App.dismissDraft()">새로 시작</button></span></div>`;
    host.parentNode.insertBefore(bn, host);
  }
  function resumeDraft(){
    let d; try{ d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); }catch(e){return;}
    if(!d)return;
    persona=d.persona||'company'; company=Object.assign(blankCompany(),d.company); step=Math.min(d.step||0,2);
    clearDraft(); renderStep(); show('form'); window.scrollTo({top:0,behavior:'smooth'});
  }
  function dismissDraft(){ clearDraft(); }

  /* ================= 컨설턴트 멀티클라이언트 ================= */
  function loadClients(){ try{ clients=JSON.parse(localStorage.getItem(CLIENTS_KEY)||'[]'); }catch(e){ clients=[]; } }
  function persistClients(){ try{ localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients)); }catch(e){} }

  function renderConsultantHome(){
    const el=document.getElementById('consultantBody'); if(!el)return;
    loadClients();
    const rows = clients.length ? clients.map(c=>`
      <div class="client-row">
        <div class="cl-main">
          <b>${esc(c.name)}</b>
          <span class="cl-sub">${c.company.region||''} · ${c.company.industry||''} · ${c.company.companyType||''}</span>
        </div>
        <div class="cl-stat">
          <span class="dchip ok">추천 ${c.dash?c.dash.recommend:'—'}</span>
          <span class="dchip">검토 ${c.dash?c.dash.considerable:'—'}</span>
          <span class="cl-amt">${c.dash?fmtKRW(c.dash.totalMax):'—'}</span>
        </div>
        <div class="cl-act">
          <button class="btn btn-ghost btn-sm" onclick="App.loadClient('${c.id}')">열기</button>
          <button class="btn btn-ghost btn-sm" onclick="App.deleteClient('${c.id}')">삭제</button>
        </div>
      </div>`).join('') : `<div class="empty-sm">아직 저장된 고객사가 없습니다. 새 고객사를 분석해 추가하세요.</div>`;
    el.innerHTML=`
      <div class="cons-head">
        <div><h2>고객사 관리</h2><p class="muted">고객사별 매칭 결과를 저장·비교하고 브랜드 리포트를 만드세요. (이 브라우저에만 저장)</p></div>
        <button class="btn btn-primary" onclick="App.newClientFromForm()">+ 새 고객사 분석</button>
      </div>
      ${clients.length>=2?`<button class="btn btn-back btn-sm" style="margin-bottom:14px" onclick="App.compareClients()">📊 고객사 비교표 보기</button>`:''}
      <div class="client-list">${rows}</div>`;
  }
  function newClientFromForm(){ persona='consultant'; company=blankCompany(); step=0; renderStep(); show('form'); }

  function saveAsClient(){
    const name = prompt('고객사 이름을 입력하세요 (예: (주)한빛정밀)', company.businessDescription? '' : '');
    if(name===null) return;
    const nm = name.trim() || `고객사 ${clients.length+1}`;
    const id = 'cl_'+Date.now();
    clients.unshift({id, name:nm, company:JSON.parse(JSON.stringify(company)),
      matched:matched.map(m=>({id:m.program.sourceProgramId,state:m.state,fit:m.fit,conf:m.conf})),
      dash:{recommend:dash.recommend,conditional:dash.conditional,considerable:dash.considerable,totalMax:dash.totalMax,closingSoon:dash.closingSoon},
      ts:Date.now()});
    persistClients();
    toast(`'${nm}'를 고객사 목록에 저장했습니다.`);
  }
  function loadClient(id){
    const c=clients.find(x=>x.id===id); if(!c)return;
    persona='consultant'; company=Object.assign(blankCompany(),c.company);
    matched=runMatching(programs.length?programs:[], company);
    // programs 없으면 재분석
    if(!programs.length){ analyze(); return; }
    dash=buildDashboard(matched); filter='all'; sortBy='deadline'; showExcluded=false; fundedOnly=false;
    renderDashboard(); renderPpBanner(); render(); afterRenderMeta();
    const scb=document.getElementById('saveClientBtn'); if(scb) scb.style.display='inline-flex';
    show('results');
  }
  function deleteClient(id){
    if(!confirm('이 고객사를 삭제할까요?'))return;
    clients=clients.filter(x=>x.id!==id); persistClients(); renderConsultantHome();
  }
  function compareClients(){
    if(clients.length<2){ toast('비교하려면 2개 이상의 고객사가 필요합니다.'); return; }
    const el=document.getElementById('consultantBody');
    const rows=clients.map(c=>`<tr>
      <td><b>${esc(c.name)}</b><br><span class="muted">${c.company.industry||''} · ${c.company.region||''}</span></td>
      <td class="ok">${c.dash.recommend}</td><td class="cond">${c.dash.conditional}</td>
      <td>${c.dash.considerable}</td><td class="soon">${c.dash.closingSoon}</td>
      <td><b>${fmtKRW(c.dash.totalMax)}</b></td></tr>`).join('');
    el.innerHTML=`<button class="btn btn-back btn-sm" style="margin-bottom:14px" onclick="App._backConsHome()">← 고객사 목록</button>
      <h2>고객사 비교표</h2>
      <div class="table-wrap"><table class="cmp-table">
        <thead><tr><th>고객사</th><th>추천</th><th>조건부</th><th>검토가능</th><th>마감임박</th><th>총 지원규모</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  /* ================= PDF ================= */
  function printReport(){
    const prevF=filter, prevE=showExcluded;
    filter='all'; showExcluded=false; render();
    document.body.classList.add('printing');
    setTimeout(()=>{ window.print();
      document.body.classList.remove('printing');
      filter=prevF; showExcluded=prevE; render();
    },250);
  }

  function reset(){
    company=blankCompany(); if(persona&&PERSONA_CFG[persona].defaultType) company.companyType=PERSONA_CFG[persona].defaultType;
    step=0; matched=[]; dash=null; progressiveDone=false;
    show('landing'); checkAutoUpdate(); checkDraft();
  }

  /* toast */
  function toast(msg){
    let t=document.getElementById('toast');
    if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2400);
  }
})();
