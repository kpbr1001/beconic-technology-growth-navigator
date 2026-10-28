/* =====================================================================
   BECONIC 지원사업 MATCH  —  app.js
   규칙엔진(Hard Eligibility) → Fit → Confidence. 계산은 브라우저 안에서만.
   프론트에서 외부 API 직접 호출 금지. 데이터는 ProgramProvider(BFF)를 통해서만.
   기업 입력값은 서버로 보내지 않는다(이 브라우저 localStorage에만 저장).
   ===================================================================== */
'use strict';

/* ---------- 버전 정보 (수정 시마다 갱신) ---------- */
const APP_VERSION = {
  version: 'v3.8.1',
  updated: '2026-10-28',
  changelog: [
    { v:'v3.8.1', d:'2026-10-28', note:'실시간 공고 수집 정상화: 기업마당 시간 초과(0건)·K-Startup 페이지 파라미터 오류(10건) 수정, 수집을 백그라운드·예약 함수 + Netlify Blobs 스냅샷으로 분리' },
    { v:'v3.8.0', d:'2026-10-28', note:'자가부검·레드팀 점검 반영: 공고 데이터 XSS 차단·CSP, 공개 AI 프록시 제거·비용 보호 캐시, 연령대·매출·업력 경계 판정 수정, 적합도 산식 정상화(추천 등급 복구), 지역 정식명칭 인식, 지원금액 오추출 방지, 지원금/융자 분리 합계, 마감일 한국시간 기준, 데모 날짜 자동 이동, 과장 문구 정리' },
    { v:'v3.7.0', d:'2026-09-14', note:'시군구 매칭 버그 수정: 접미사(시/군/구) 유연 비교로 남양주시=남양주=[남양주] 모두 매칭, 짧은이름(중구 등) 오탐 방지' },
    { v:'v3.6.0', d:'2026-09-14', note:'대상아님 토글 제거, 결과 개수 명확 표시(N건), 후킹 클릭시 결과이동, 필터시 전체보기 버튼' },
    { v:'v3.5.0', d:'2026-09-14', note:'결과화면 사용자중심 전면개편: 도넛을 분야별 건수로, 컨설턴트 삭제, 사업자유형 추가' },
    { v:'v3.4.0', d:'2026-09-14', note:'프로세스 단축: 지원분야 스텝·intro 제거, 결과를 지원분야별 자동 분류, 산업분류 확대' },
    { v:'v3.3.0', d:'2026-09-14', note:'AI 정밀매칭 설계: 엔진 숫자기반 판정(매출·직원·업력·연령·체납), AI스키마 정합화' },
    { v:'v3.2.0', d:'2026-09-14', note:'결과를 니즈 카테고리로 그룹핑, 세금체납 자격항목 추가' },
    { v:'v3.1.0', d:'2026-09-14', note:'지역 매칭 3단계 재설계(전국<광역<시군구)' },
    { v:'v3.0.0', d:'2026-09-14', note:'CTA 퍼널 개선, 카드 신청기간 표시, D-0 오류 수정' },
    { v:'v2.9.0', d:'2026-09-14', note:'공고 대량수집(페이지네이션)·시군구 우선노출' },
    { v:'v2.4.0', d:'2026-09-14', note:'K-Startup 다중소스 연동' },
    { v:'v2.3.0', d:'2026-09-14', note:'기업마당 API 연동: 어댑터·오케스트레이터·자동 mock폴백' },
    { v:'v2.0.0', d:'2026-09-13', note:'총지원규모 대시보드, 페르소나, 무가입 자동 재매칭' },
    { v:'v1.0.0', d:'2026-09-13', note:'초기 릴리스(규칙엔진·Fit·Confidence 분리)' }
  ]
};

/* ---------- 앱 설정 ---------- */
const APP_CONFIG = {
  // 배포 환경(https·localhost 아님)에서는 live 시도, file://·localhost는 mock.
  // BFF가 키 없음·오류·빈 결과를 돌려주면 DEMO 데이터로 폴백하고 화면에 'DEMO'로 표시한다.
  DATA_MODE: (typeof location !== 'undefined' && /^https?:/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname)) ? 'live' : 'mock',
  MATCH_WEIGHTS: {       // 적합도 가중치 — 코드 하드코딩 금지, 여기서만 관리
    purpose: 20, semantic: 20, stage: 15, industry: 15,
    field: 10, capability: 10, amount: 5, readiness: 5
  },
  REGION_BONUS: { district: 8, sido: 5 },   // 내 시군구·내 시도 특화 사업 가점
  CLOSING_SOON_DAYS: 7,
  GROUP_LIMIT: 6,        // 분야 그룹당 처음 보여줄 카드 수
  LIST_LIMIT: 30,        // 필터 목록 처음 보여줄 카드 수
  PRINT_LIMIT: 30        // PDF에 싣는 최대 사업 수(추천순 상위)
};

/* =====================================================================
   날짜 — 모두 사용자 기기의 '달력 날짜' 기준(한국 사용자 = KST).
   v3.7은 'YYYY-MM-DD'를 UTC 자정으로 해석해 오전 9시 전 D-day가 하루 늘어났다.
   ===================================================================== */
const MS_DAY = 86400000;
function startOfToday(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
let TODAY = startOfToday();
const CURRENT_YEAR = new Date().getFullYear();
function parseYmd(s){
  const m = String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return null;
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}
function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function daysBetween(a,b){ return Math.round((b-a)/MS_DAY); }

/* DEMO 데이터는 _meta.baseDate 기준 날짜를 오늘로 옮겨 쓴다(시간이 지나도 예시가 전부 마감으로 바뀌지 않게). */
function shiftDemoDates(programs, baseDate){
  const base = parseYmd(baseDate); if(!base) return programs;
  const off = daysBetween(base, TODAY);
  const mv = s=>{ const d=parseYmd(s); if(!d) return s; d.setDate(d.getDate()+off); return ymd(d); };
  return programs.map(p=>({ ...p, applicationStart:mv(p.applicationStart), applicationEnd:mv(p.applicationEnd), sourcePublishedAt:mv(p.sourcePublishedAt) }));
}

/* =====================================================================
   출력 안전 — 공고 데이터(외부 API)는 모두 신뢰하지 않는 문자열로 취급
   ===================================================================== */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeUrl(u){
  try{ const x=new URL(String(u||''), 'https://example.invalid/'); return (/^https?:$/.test(x.protocol) && x.hostname!=='example.invalid') ? x.href : ''; }
  catch{ return ''; }
}
const strArr = v => Array.isArray(v) ? v.filter(x=>typeof x==='string') : [];
const finiteOrNull = v => (typeof v==='number' && Number.isFinite(v)) ? v : null;
/* BFF·DEMO 응답을 엔진이 기대하는 모양으로 강제(배열·숫자 타입) */
function normalizeProgram(p){
  if(!p || typeof p!=='object' || typeof p.programName!=='string' || p.sourceProgramId==null) return null;
  const q = { ...p, sourceProgramId:String(p.sourceProgramId) };
  for(const k of ['supportPurposes','targetBusinessType','targetRegions','targetIndustries','excludedIndustries','certificationConditions','specialRequirements','preferenceConditions']) q[k]=strArr(p[k]);
  for(const k of ['businessAgeMin','businessAgeMax','representativeAgeMin','representativeAgeMax','revenueMin','revenueMax','employeeMin','employeeMax','supportAmountMax']) q[k]=finiteOrNull(p[k]);
  return q;
}

/* =====================================================================
   Adapter Layer — 데이터 출처 추상화
   ===================================================================== */
const ProgramProvider = {
  lastMode: 'mock',      // 마지막 로드의 실제 데이터 소스 (mock | live)
  lastFetchedAt: null,
  lastSourceCounts: {},
  lastEnriched: 0,
  _p: null,
  // 같은 페이지에서 한 번만 불러온다(v3.7은 히어로 숫자용·분석용으로 BFF를 두 번 호출).
  fetchPrograms(){
    if(!this._p) this._p = this._load().catch(e=>{ this._p=null; throw e; });
    return this._p;
  },
  async _load(){
    if(APP_CONFIG.DATA_MODE === 'live'){
      try{
        const r = await fetch('/.netlify/functions/programs');
        const data = await r.json();
        if(data && data.mode==='live' && Array.isArray(data.programs) && data.programs.length){
          const list = data.programs.map(normalizeProgram).filter(Boolean);
          if(list.length){
            this.lastMode='live'; this.lastFetchedAt=data.fetchedAt||new Date().toISOString();
            this.lastSourceCounts=data.sourceCounts||{}; this.lastEnriched=+data.enriched||0;
            return list;
          }
        }
      }catch{ /* 폴백 */ }
    }
    this.lastMode='mock';
    const mock = window.__MOCK_PROGRAMS__;
    if(!mock || !Array.isArray(mock.programs)) throw new Error('DEMO 데이터 없음');
    this.lastFetchedAt = new Date().toISOString();
    return shiftDemoDates(mock.programs, mock._meta && mock._meta.baseDate).map(normalizeProgram).filter(Boolean);
  }
};

/* =====================================================================
   상수 · 선택지 정의
   ===================================================================== */
const REGIONS = ['서울','경기','인천','부산','대구','광주','대전','울산','세종','강원','충북','충남','전북','전남','경북','경남','제주'];

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

// 산업분류 — 지원사업 공고 기준 (그룹별)
const INDUSTRY_GROUPS = [
  { group:'제조·소재', items:['제조업','금속·소재 성형가공','기계·장비','전기·전자부품','화학·섬유','반도체·디스플레이','미래형선박·조선'] },
  { group:'ICT·SW', items:['정보통신(ICT)','SW·시스템통합','AI·빅데이터','사이버보안','게임·콘텐츠','블록체인·양자'] },
  { group:'바이오·헬스', items:['바이오·제약','의료기기·헬스케어','기능성식품','뷰티·화장품'] },
  { group:'신산업·에너지', items:['신재생에너지·2차전지','자율주행·모빌리티','로봇·드론','우주·항공','스마트시티·IoT'] },
  { group:'유통·서비스', items:['도소매업','음식점업(F&B)','관광·MICE·숙박','물류·유통','교육(에듀테크)','지식서비스(컨설팅·HR)','디자인'] },
  { group:'기타', items:['건설·건축','농림수산업','문화·예술·미디어','부동산(프롭테크)','환경·수자원','서비스업(기타)','해당없음'] }
];
const INDUSTRIES = INDUSTRY_GROUPS.flatMap(g=>g.items.map(v=>({v, group:g.group})));

// 시군구 매칭: 사용자 선택 시군구가 공고 텍스트에 있는지 (접미사 유연 비교)
function districtMatch(district, hay){
  if(!district || !hay) return false;
  if(hay.includes(district)) return true;
  const base = district.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/,'');
  if(base.length < 2) return false;         // 중구·동구 등은 정확일치만(오탐 방지)
  return hay.includes(base);
}

// 세부산업 → 매칭용 대분류(공고 targetIndustries 값과 호환)
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
  {v:'정책자금/금융', p:['정책자금/금융']}, {v:'R&D/기술', p:['R&D/기술']}, {v:'창업', p:['창업']},
  {v:'사업화', p:['사업화']}, {v:'판로/유통', p:['판로']}, {v:'마케팅', p:['마케팅']}, {v:'수출', p:['수출']},
  {v:'인력', p:['인력']}, {v:'경영/컨설팅', p:['경영','컨설팅']}, {v:'시설/공간', p:['시설/공간']},
  {v:'디지털전환', p:['디지털전환']}, {v:'제조혁신', p:['제조혁신']}
];
function needToPurposes(need){ const f=SUPPORT_FIELDS.find(x=>x.v===need); return f?f.p:[need]; }

const COMPANY_TYPES = [
  {v:'예비창업자', s:'아직 사업자등록 전'},
  {v:'소상인',     s:'소매·음식·서비스업 소규모'},
  {v:'소공인',     s:'제조업 10인 미만'},
  {v:'중소기업',   s:'법인·개인사업자'}
];
const BIZ_REG_TYPES = ['개인사업자','법인사업자'];

/* 구간 입력 → 범위 [하한, 상한]. 구간이 요건을 걸치면 '확인 필요'로 판정한다(중간값 비교 금지). */
const AGE_BANDS = {'20대':[20,29],'30대':[30,39],'40대':[40,49],'50대':[50,59],'60대이상':[60,120]};
const REVENUE_BANDS = {'매출없음':[0,0],'5억미만':[0,4.99],'5-10억':[5,9.99],'10-30억':[10,29.99],'30-50억':[30,49.99],'50-100억':[50,99.99],'100억이상':[100,Infinity]}; // 억 원
const EMPLOYEE_BANDS = {'1-4인':[1,4],'5-9인':[5,9],'10-29인':[10,29],'30-99인':[30,99],'100인이상':[100,Infinity]};

/* 사용자 유형 → 공고 targetBusinessType 후보 (사업자 형태 반영) */
function userTargets(c){
  if(c.companyType==='예비창업자') return ['예비창업자'];
  const out = new Set();
  if(c.companyType==='소상인' || c.companyType==='소공인') out.add('소상공인');
  if(c.bizRegType==='법인사업자') out.add('법인');
  else if(c.bizRegType==='개인사업자') out.add('개인사업자');
  else { out.add('법인'); out.add('개인사업자'); }
  return [...out];
}

/* Company Schema 초기값 — 모르는 값은 null */
function blankCompany(){
  return {
    companyType:null, bizRegType:null,
    region:null, district:null, establishedYear:null, businessAge:null,
    industry:null, businessDescription:null, supportNeeds:[],
    revenueRange:null, employeeCount:null, representativeAge:null,
    representativeGender:null, ventureCertified:null, researchInstitute:null,
    exportHistory:null, patentStatus:null,
    taxArrears:null   // 국세·지방세 체납 여부
  };
}

/* 저장값(localStorage·임시저장)을 다시 쓸 때는 허용 목록 값만 받는다(변조된 값이 화면·판정에 들어가지 않게). */
function sanitizeCompany(raw){
  const c = blankCompany(); if(!raw || typeof raw!=='object') return c;
  const pick = (v,list)=> list.includes(v) ? v : null;
  c.companyType = pick(raw.companyType, COMPANY_TYPES.map(t=>t.v));
  c.bizRegType = pick(raw.bizRegType, BIZ_REG_TYPES);
  c.region = pick(raw.region, REGIONS);
  c.district = c.region ? pick(raw.district, DISTRICTS[c.region]||[]) : null;
  c.industry = pick(raw.industry, INDUSTRIES.map(i=>i.v));
  const y = parseInt(raw.establishedYear,10);
  if(y>=1960 && y<=CURRENT_YEAR){ c.establishedYear=String(y); c.businessAge=CURRENT_YEAR-y; }
  c.revenueRange = pick(raw.revenueRange, Object.keys(REVENUE_BANDS));
  c.employeeCount = pick(raw.employeeCount, Object.keys(EMPLOYEE_BANDS));
  c.representativeAge = pick(raw.representativeAge, Object.keys(AGE_BANDS));
  for(const k of ['exportHistory','taxArrears']) c[k] = typeof raw[k]==='boolean' ? raw[k] : null;
  return c;
}

/* =====================================================================
   Matching Engine — Deadline → HardEligibility → Fit → Confidence → State
   ===================================================================== */

/* ---- 날짜 리스크 ---- */
function deadlineState(p){
  const start = parseYmd(p.applicationStart);
  const end   = parseYmd(p.applicationEnd);
  if(end === null){
    if(p.recruitInProgress === true) return {state:'OPEN', dday:null};
    if(p.recruitInProgress === false) return {state:'CLOSED', dday:null};
    if(start && start > TODAY) return {state:'UPCOMING', dday:daysBetween(TODAY,start)};
    if(p.applicationEndText) return {state:'OPEN', dday:null};   // '예산 소진시까지' 등 상시
    return {state:'UNKNOWN', dday:null};
  }
  const dEnd = daysBetween(TODAY, end);          // 마감 당일 = 0
  if(dEnd < 0) return {state:'CLOSED', dday:dEnd};
  if(p.recruitInProgress === false) return {state:'CLOSED', dday:dEnd};
  if(start && start > TODAY) return {state:'UPCOMING', dday:daysBetween(TODAY,start)};
  if(dEnd <= APP_CONFIG.CLOSING_SOON_DAYS) return {state:'CLOSING_SOON', dday:dEnd};
  return {state:'OPEN', dday:dEnd};
}

/* 구간 [lo,hi] vs 요건 {min,max}: 구간 전체가 요건 안이면 pass, 완전히 밖이면 fail, 걸치면 unknown */
function bandVsRange(lo, hi, min, max){
  if((max!=null && lo>max) || (min!=null && hi<min)) return 'fail';
  if((max==null || hi<=max) && (min==null || lo>=min)) return 'pass';
  return 'unknown';
}
/* '연매출 10억원 이하', '상시근로자 5인 미만', '30억원 이상' → {min,max} */
function parseLimits(text, unitRe, integer){
  let min=null, max=null;
  const re = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:'+unitRe+')\\s*원?\\s*(이하|미만|이상|초과)','g');
  for(const m of String(text||'').matchAll(re)){
    const n=parseFloat(m[1]), eps=integer?1:0.01;
    if(m[2]==='이하') max=n; else if(m[2]==='미만') max=n-eps; else if(m[2]==='이상') min=n; else min=n+eps;
  }
  return (min==null && max==null) ? null : {min,max};
}
function rangeLabel(min,max,unit){
  if(min!=null && max!=null) return `${min}~${max}${unit}`;
  if(max!=null) return `${max}${unit} 이하`;
  return `${min}${unit} 이상`;
}

/* 업력: 설립'연도'만 받으므로 실제 업력은 (연도 차이 −1, +1) 사이. 경계 연차는 '확인 필요'. */
function businessAgeCond(p, c, add){
  const L='업력 조건';
  const hasAge = p.businessAgeMin!=null || p.businessAgeMax!=null;
  const tbt = p.targetBusinessType||[];
  if(c.companyType==='예비창업자'){
    if(p.preStartupOnly || p.preStartupAllowed===true) return add(L,'pass','예비창업자 신청 가능');
    if(p.preStartupAllowed===false) return add(L,'fail','사업자등록 후 업력 요건(예비창업자 제외)');
    if(p.businessAgeMin) return add(L,'fail',`업력 ${p.businessAgeMin}년 이상 요건`);
    if(!hasAge) return add(L,'na');
    if(tbt.includes('예비창업자') && !p.targetBusinessTypeInferred) return add(L,'pass','예비창업자 대상 포함');
    return add(L,'unknown',`창업 ${p.businessAgeMax}년 이내 요건 — 예비창업자 신청 가능 여부는 공고 확인`);
  }
  if(p.preStartupOnly) return add(L,'fail','예비창업자 전용 사업');
  if(!hasAge) return add(L,'na');
  if(c.businessAge==null) return add(L,'unknown','설립연도 미입력');
  const a = c.businessAge;
  const parts = [];
  if(p.businessAgeMin) parts.push(`${p.businessAgeMin}년 이상`);
  if(p.businessAgeMax!=null) parts.push(`창업 ${p.businessAgeMax}년 ${p.businessAgeMaxExclusive?'미만':'이내'}`);
  const req = parts.join(' · ') || '제한 없음';
  let r='pass';
  if(p.businessAgeMax!=null){ if(a>p.businessAgeMax) r='fail'; else if(a===p.businessAgeMax) r='unknown'; }
  if(r!=='fail' && p.businessAgeMin){ if(a<p.businessAgeMin) r='fail'; else if(a===p.businessAgeMin) r='unknown'; }
  add(L, r, r==='unknown'
    ? `요건 ${req} · ${c.establishedYear}년 설립 — 경계 연차라 사업자등록일로 확인`
    : `요건 ${req} · 귀사 업력 약 ${a}년`);
}

function isLoanProgram(p){
  const t = `${p.programName||''} ${p.subCategory||''} ${p.supportAmountText||''}`;
  return /융자|보증|대출|이차보전/.test(t) || p.category==='금융';
}

/* ---- Hard Eligibility Engine ----
   판정: ELIGIBLE / CONDITIONAL / UNKNOWN / INELIGIBLE
   조건별 결과와 근거(evidence)를 함께 반환 → 화면 설명에 재사용 */
function hardEligibility(p, c){
  const conds = [];
  const add=(label,result,evidence)=>{ conds.push({label,result,evidence:evidence||''}); };

  // 1) 사업자 유형
  const tbt = p.targetBusinessType||[];
  if(tbt.length){
    if(!c.companyType) add('지원대상 유형','unknown','기업유형 미입력');
    else if(userTargets(c).some(t=>tbt.includes(t))) add('지원대상 유형','pass',`${c.companyType} 대상 포함`);
    else if(p.targetBusinessTypeInferred) add('지원대상 유형','unknown','공고 목록에 지원대상 표기 없음 — 공식 공고 확인');
    else add('지원대상 유형','fail',`대상: ${tbt.join(', ')} (${c.companyType}${c.bizRegType?'·'+c.bizRegType:''} 미포함)`);
  } else add('지원대상 유형','na');

  // 2) 지역 — 3단계 관련도(전국 0 → 광역시도 1 → 시군구 2), 대상 아님 -1
  let regionTier = null;
  const tr = p.targetRegions||[];
  if(!tr.length || tr.includes('전국')){
    add('사업장 소재지','pass', p.targetRegionsInferred ? '공고명·기관에 지역 표기 없음(전국으로 간주)' : '전국 대상');
    regionTier = 0;
  } else if(!c.region){
    add('사업장 소재지','unknown','지역 미입력');
  } else if(tr.includes(c.region)){
    const hay = `${p.programName||''} ${tr.join(' ')} ${p._suptReginRaw||''} ${p.supportDescription||''}`;
    if(c.district && districtMatch(c.district, hay)){ add('사업장 소재지','pass',`${c.region} ${c.district} 대상`); regionTier = 2; }
    else { add('사업장 소재지','pass',`${c.region} 포함`); regionTier = 1; }
  } else {
    add('사업장 소재지','fail',`대상지역: ${tr.slice(0,4).join('/')}${tr.length>4?'…':''} (${c.region} 미포함)`);
    regionTier = -1;
  }

  // 3) 업력
  businessAgeCond(p, c, add);

  // 4) 업종 & 제외업종
  const cBroad = industryToBroad(c.industry);
  const ti = p.targetIndustries||[], ex = p.excludedIndustries||[];
  if(c.industry && (ex.includes(c.industry) || ex.includes(cBroad))){
    add('업종 제한','fail',`제외업종(${c.industry})`);
  } else if(ti.length && !ti.includes('전업종')){
    if(!c.industry) add('업종 조건','unknown','업종 미입력');
    else if(ti.includes(c.industry) || ti.includes(cBroad)) add('업종 조건','pass',`${c.industry} 대상`);
    else if(p.category==='제조혁신' || p.subCategory==='제조혁신') add('업종 조건', cBroad==='제조업'?'pass':'fail', cBroad==='제조업'?'제조업':'제조업 아님');
    else add('업종 조건','unknown',`대상업종: ${ti.slice(0,3).join('/')}`);
  } else add('업종 조건','na');

  // 5) 매출 — AI 추출 숫자(원) 우선, 없으면 공고 문구
  const revReq = (p.revenueMax!=null || p.revenueMin!=null)
    ? {min:p.revenueMin!=null?p.revenueMin/1e8:null, max:p.revenueMax!=null?p.revenueMax/1e8:null}
    : parseLimits(p.revenueConditions, '억', false);
  if(revReq){
    const label = p.revenueConditions || `매출 ${rangeLabel(revReq.min, revReq.max, '억원')}`;
    const band = REVENUE_BANDS[c.revenueRange];
    if(!band) add('매출 조건','unknown',label);
    else { const r=bandVsRange(band[0],band[1],revReq.min,revReq.max); add('매출 조건', r, `${label} · 귀사 ${c.revenueRange}${r==='unknown'?' (구간이 기준에 걸침)':''}`); }
  } else if(p.revenueConditions){
    add('매출 조건','unknown',p.revenueConditions);
  }

  // 6) 상시근로자
  const empReq = (p.employeeMax!=null || p.employeeMin!=null)
    ? {min:p.employeeMin, max:p.employeeMax}
    : parseLimits(p.employeeConditions, '인|명', true);
  if(empReq){
    const label = p.employeeConditions || `상시근로자 ${rangeLabel(empReq.min, empReq.max, '인')}`;
    const band = EMPLOYEE_BANDS[c.employeeCount];
    if(!band) add('상시근로자 조건','unknown',label);
    else { const r=bandVsRange(band[0],band[1],empReq.min,empReq.max); add('상시근로자 조건', r, `${label} · 귀사 ${c.employeeCount}${r==='unknown'?' (구간이 기준에 걸침)':''}`); }
  } else if(p.employeeConditions){
    add('상시근로자 조건','unknown',p.employeeConditions);
  }

  // 7) 대표자 연령 — 연령대(구간)로 받으므로 걸치면 '확인 필요'
  if(p.representativeAgeMax!=null || p.representativeAgeMin!=null){
    const req = p.representativeAgeMin!=null && p.representativeAgeMax!=null ? `만 ${p.representativeAgeMin}~${p.representativeAgeMax}세`
      : p.representativeAgeMax!=null ? `만 ${p.representativeAgeMax}세 이하` : `만 ${p.representativeAgeMin}세 이상`;
    const band = AGE_BANDS[c.representativeAge];
    if(!band) add('대표자 연령','unknown',`요건 ${req} · 대표자 연령대 미입력`);
    else { const r=bandVsRange(band[0],band[1],p.representativeAgeMin,p.representativeAgeMax);
      add('대표자 연령', r, `요건 ${req} · 대표자 ${c.representativeAge}${r==='unknown'?' (만 나이로 확인)':''}`); }
  }

  // 8) 특수자격 (여성기업·벤처 등)
  const specialReqs = (p.specialRequirements||[]).length ? p.specialRequirements : (p.certificationConditions||[]);
  if(specialReqs.some(x=>x.includes('여성'))){
    if(c.representativeGender==null) add('여성기업 확인','unknown','여성기업(대표자) 요건 — 해당 여부 확인');
    else add('여성기업 확인', c.representativeGender==='여성'?'pass':'fail', '여성 대표 요건');
  }
  if(specialReqs.some(x=>x.includes('벤처'))){
    if(c.ventureCertified==null) add('벤처확인','unknown','벤처기업 확인서 요건');
    else add('벤처확인', c.ventureCertified?'pass':'fail','벤처기업 확인 필요');
  }
  const exportReq = specialReqs.some(x=>x.includes('수출'));
  if(exportReq){
    if(c.exportHistory==null) add('수출 실적','unknown','수출 실적 요건');
    else add('수출 실적', c.exportHistory?'pass':'fail','수출 실적 요건');
  }

  // 9) 수출 조건(문구) — '100만불 미만'처럼 상한이면 실적 없음=충족, 실적 있음=금액 확인
  if(p.exportConditions && !exportReq){
    const capOnly = /미만|이하/.test(p.exportConditions);
    if(c.exportHistory==null) add('수출 조건','unknown',p.exportConditions);
    else if(capOnly) add('수출 조건', c.exportHistory?'unknown':'pass', p.exportConditions + (c.exportHistory?' · 수출액 확인':' · 수출 실적 없음'));
    else add('수출 조건', c.exportHistory?'pass':'fail', p.exportConditions);
  }

  // 10) 세금 체납 — 금전 지원 사업 공통 제한요건
  const isFunding = p.requiresNoTaxArrears===true || isLoanProgram(p)
                    || (p.supportPurposes||[]).includes('정책자금/금융') || (p.supportAmountMax>0);
  if(isFunding && c.taxArrears===true) add('세금 체납','fail','국세·지방세 체납 시 대부분 사업 신청 제한');
  else if(isFunding && c.taxArrears===false) add('세금 체납','pass','체납 없음(정상)');

  // 11) 목록 정보만 있는 실시간 공고 — 본문 자격요건을 읽지 않았다는 사실을 판정에 반영
  if(p.eligibilityDepth==='listing') add('세부 자격요건','unknown','공고문 본문의 업력·매출·업종 제한은 자동 분석 전 — 공식 공고 확인');

  // ---- 종합 판정 ----
  let verdict;
  if(conds.some(x=>x.result==='fail')) verdict='INELIGIBLE';
  else if(conds.some(x=>x.result==='unknown')) verdict='CONDITIONAL';
  else verdict='ELIGIBLE';
  const known = conds.filter(x=>x.result!=='na');
  if(verdict!=='INELIGIBLE' && known.length && known.every(x=>x.result==='unknown')) verdict='UNKNOWN';
  return {verdict, conds, regionTier};
}

/* ---- Fit Score ----
   입력으로 판단 가능한 요소만 가중평균하고, 판단 근거가 적을수록 상한을 낮춘다.
   v3.7은 입력받지 않는 항목(지원목적·사업내용)을 0점 처리해 최대 58점 → '추천'(70+)이 나올 수 없었다. */
function fitScore(p, c, regionTier){
  const W = APP_CONFIG.MATCH_WEIGHTS;
  const totalW = Object.values(W).reduce((a,b)=>a+b,0);
  const parts = {}; let num=0, den=0;
  const use=(k,v)=>{ parts[k]=Math.round(v*W[k]*10)/10; num+=v*W[k]; den+=W[k]; };
  let purposeHit = null;
  const needs = c.supportNeeds||[];
  if(needs.length){
    const needP = new Set(needs.flatMap(needToPurposes));
    purposeHit = (p.supportPurposes||[]).some(x=>needP.has(x));
    use('purpose', purposeHit?1:0); use('field', purposeHit?1:0.3);
  }
  if(c.businessDescription) use('semantic', semanticFit(p,c));
  use('stage', stageFit(p,c));
  const ti = p.targetIndustries||[], cBroad = industryToBroad(c.industry);
  use('industry', (!ti.length || ti.includes('전업종') || ti.includes(c.industry) || ti.includes(cBroad)) ? 1 : 0.4);
  if(c.ventureCertified!=null || c.researchInstitute!=null || c.patentStatus!=null){
    let cap=0.5; if(c.ventureCertified)cap+=0.2; if(c.researchInstitute)cap+=0.2; if(c.patentStatus)cap+=0.1;
    use('capability', Math.min(1,cap));
  }
  use('amount', p.supportAmountMax ? 1 : 0.5);
  const dl = deadlineState(p);
  use('readiness', dl.state==='OPEN'?1 : dl.state==='CLOSING_SOON'?0.5 : dl.state==='UPCOMING'?0.8 : 0);
  const coverage = den/totalW;
  let s = (den ? num/den*100 : 50) * (0.6 + 0.4*coverage);
  const B = APP_CONFIG.REGION_BONUS;
  const bonus = regionTier===2 ? B.district : regionTier===1 ? B.sido : 0;
  if(bonus){ parts.regionBonus = bonus; s += bonus; }
  if(purposeHit===false){ s = Math.min(s, 48); parts._purposeMismatch = true; }
  parts._coverage = Math.round(coverage*100);
  return {score: Math.round(Math.max(0, Math.min(100, s))), parts};
}
function semanticFit(p,c){
  const txt=((p.programName||'')+' '+(p.supportDescription||'')+' '+(p.category||'')).toLowerCase();
  const desc=String(c.businessDescription||'').toLowerCase();
  const kws=['수출','제조','ai','sw','소프트웨어','마케팅','브랜드','r&d','연구','기술','창업','디지털','플랫폼','it','판로','컨설팅'];
  let hit=0,tot=0;
  kws.forEach(k=>{ if(desc.includes(k)){tot++; if(txt.includes(k))hit++;} });
  return tot===0 ? 0.55 : 0.4 + 0.6*(hit/tot);
}
function stageFit(p,c){
  if(c.companyType==='예비창업자'){
    const startup = p.preStartupOnly || p.preStartupAllowed===true || /창업/.test(p.category||'') || (p.supportPurposes||[]).includes('창업');
    return startup ? 1 : 0.3;
  }
  if(p.businessAgeMax!=null && c.businessAge!=null) return c.businessAge<=p.businessAgeMax ? 1 : 0.4;
  return 0.85;   // 업력 제한 없는 사업: 성장단계 무관(중립)
}

/* ---- Confidence Score — Fit과 분리: '판정을 얼마나 확정했는가' ---- */
function confidenceScore(elig, c){
  const total = elig.conds.filter(x=>x.result!=='na').length || 1;
  const unknown = elig.conds.filter(x=>x.result==='unknown').length;
  const base = Math.round(((total-unknown)/total)*100);
  const core = [ c.companyType, c.region, c.industry, (c.companyType==='예비창업자' ? 1 : c.establishedYear) ];
  const coreFill = core.filter(x=>x!=null&&x!=='').length / core.length;
  return Math.max(5, Math.min(100, Math.round(base*0.6 + coreFill*100*0.4)));
}

/* ---- 추천 상태 ---- */
function recommendState(verdict, fit, conf, dl){
  if(dl.state==='CLOSED') return '대상 아님';
  if(verdict==='INELIGIBLE') return '대상 아님';
  if(verdict==='UNKNOWN') return '확인 필요';
  if(verdict==='ELIGIBLE') return fit>=70 ? '추천' : (fit>=50 ? '조건부 추천' : '확인 필요');
  return fit>=65 ? '조건부 추천' : '확인 필요';   // CONDITIONAL: 필수 미충족은 없고 확인할 항목이 있음
}

/* ---- 전체 매칭 실행 ---- */
function runMatching(programs, company){
  return programs.map(p=>{
    const dl = deadlineState(p);
    const elig = hardEligibility(p, company);
    const fit = fitScore(p, company, elig.regionTier);
    const conf = confidenceScore(elig, company);
    const state = recommendState(elig.verdict, fit.score, conf, dl);
    const regionTier = elig.regionTier;
    const regionLabel = regionTier===2 ? company.district : regionTier===1 ? company.region : (regionTier===0 ? '전국' : null);
    return {program:p, dl, elig, fit:fit.score, fitParts:fit.parts, conf, state, localMatch:regionTier===2, regionTier, regionLabel};
  });
}

/* =====================================================================
   Dashboard 집계 — runMatching 결과 입력
   ===================================================================== */
function buildDashboard(matched){
  const considerable = matched.filter(m=> m.state!=='대상 아님');
  const rec = matched.filter(m=> m.state==='추천');
  const cond = matched.filter(m=> m.state==='조건부 추천');
  const check = matched.filter(m=> m.state==='확인 필요');
  // 합계는 '추천 + 조건부'만(확인 필요는 자격 불확실 → 과대평가 방지). 보조·출연과 융자·보증은 성격이 달라 따로 합산.
  let grantSum=0, grantCnt=0, loanSum=0, loanCnt=0;
  rec.concat(cond).forEach(m=>{
    const v = m.program.supportAmountMax;
    if(typeof v!=='number' || !(v>0)) return;
    if(isLoanProgram(m.program)){ loanSum+=v; loanCnt++; } else { grantSum+=v; grantCnt++; }
  });
  const closingSoon = considerable.filter(m=> m.dl.state==='CLOSING_SOON');
  return {
    total: matched.length,
    active: matched.filter(m=>m.dl.state!=='CLOSED').length,
    considerable: considerable.length,
    recommend: rec.length, conditional: cond.length, check: check.length,
    ineligible: matched.length - considerable.length,
    grantSum, grantCnt, loanSum, loanCnt,
    closingSoon: closingSoon.length,
    avgFit: considerable.length ? Math.round(considerable.reduce((s,m)=>s+m.fit,0)/considerable.length) : 0
  };
}

/* 금액 포맷 (억/만원 한글) */
function fmtKRW(v){
  if(!v || v<=0) return '—';
  if(v>=100000000){ const eok=v/100000000; return (eok%1===0?eok:eok.toFixed(1))+'억원'; }
  if(v>=10000){ return Math.round(v/10000).toLocaleString()+'만원'; }
  return v.toLocaleString()+'원';
}

/* =====================================================================
   App Controller — 4유형 · 대시보드 · 무가입 재매칭
   ===================================================================== */
const App = (function(){
  let persona = null;           // 'founder' | 'retail' | 'maker' | 'sme'
  let company = blankCompany();
  let step = 0;
  let programs = [];
  let matched = [];
  let dash = null;
  let filter = 'all';
  let sortBy = 'deadline';
  let fundedOnly = false;
  let progressiveDone = false;
  let printMode = false;
  let currentView = 'landing';
  let expanded = new Set();     // 펼친 분야 그룹
  let listLimit = APP_CONFIG.LIST_LIMIT;

  const DRAFT_KEY   = 'beconic_match_draft_v2';
  const PROFILE_KEY = 'beconic_match_profile_v2';   // 무가입 재매칭용
  const LASTSEEN_KEY = 'beconic_lastseen_v2';
  const LEGACY_KEYS = ['beconic_clients_v2'];        // v3.4까지 컨설턴트 고객사 목록(기능 삭제)
  let toastTimer = null;
  let lastFocus = null;          // 모달 닫을 때 포커스 복귀
  const ST_CLS = {'추천':'ok','조건부 추천':'cond','확인 필요':'check','대상 아님':'no'};
  let ppTmp = {};

  const FIELD_ICON={'정책자금/금융':'💰','R&D/기술':'🔬','창업':'🌱','사업화':'🚀','판로':'🛒',
    '마케팅':'📣','수출':'🌍','인력':'👥','경영':'📊','컨설팅':'📊','시설/공간':'🏭','디지털전환':'💻','제조혁신':'⚙️','행사/네트워크':'🤝'};
  const FIELD_ORDER=['정책자금/금융','창업','R&D/기술','사업화','제조혁신','수출','판로','마케팅','인력','경영','디지털전환','시설/공간'];

  const PERSONA_CFG = {
    founder: { key:'founder', companyType:'예비창업자', label:'예비창업자', icon:'🌱',
      cardDesc:'아직 사업자등록 전이에요. 창업 지원사업부터 쉽게 안내해 드립니다.',
      steps:['creatorBasic'], defaultIndustry:null },
    retail: { key:'retail', companyType:'소상인', label:'소상인', icon:'🏪',
      cardDesc:'소매·음식·서비스업을 운영해요. 경영개선·자금·마케팅 지원 중심.',
      steps:['bizBasic'], defaultIndustry:null },
    maker: { key:'maker', companyType:'소공인', label:'소공인', icon:'🔧',
      cardDesc:'제조업 10인 미만이에요. 소공인특화·제조혁신 지원 중심.',
      steps:['bizBasic'], defaultIndustry:'제조업' },
    sme: { key:'sme', companyType:'중소기업', label:'중소기업', icon:'🏢',
      cardDesc:'법인·개인사업자로 성장 중이에요. R&D·수출·스마트공장·정책자금.',
      steps:['bizBasic','smeProfile'], defaultIndustry:null }
  };
  const personaOf = type => Object.keys(PERSONA_CFG).find(k=>PERSONA_CFG[k].companyType===type) || null;

  const PICKABLE = {
    bizRegType: BIZ_REG_TYPES,
    representativeAge: Object.keys(AGE_BANDS),
    revenueRange: Object.keys(REVENUE_BANDS),
    employeeCount: Object.keys(EMPLOYEE_BANDS)
  };

  const STEP_DEFS = {
    creatorBasic: {
      title:'어떤 창업을 준비하세요?',
      desc:'지역과 사업 분야만 고르면 돼요. 창업 전이어도 괜찮습니다.',
      render:()=>`
        ${regionField()}
        ${industrySelect()}
        <div class="field"><label class="q">대표자 연령대 <span class="opt-tag">청년 지원 판정</span></label>
          <div class="opt-grid c3">${Object.keys(AGE_BANDS).map(a=>optBtn('representativeAge',a,a,'',company.representativeAge===a)).join('')}</div></div>`,
      valid:()=>!!company.region && !!company.industry
    },
    bizBasic: {
      title:'기업 기본정보',
      desc:'자격 판정에 필요한 정보만 받아요. 오래 안 걸려요.',
      render:()=>`
        <div class="field"><label class="q">사업자 형태<span class="req">*</span></label>
          <div class="opt-grid c2">${[['개인사업자','개인사업자'],['법인사업자','법인사업자']].map(([v,l])=>optBtn('bizRegType',v,l,'',company.bizRegType===v)).join('')}</div>
          <div class="help">아직 사업자등록 전이라면 <button type="button" class="link-btn" onclick="App.pickPersona('founder')">예비창업자로 찾기</button>가 더 정확합니다.</div></div>
        ${regionField()}
        <div class="field"><label class="q" for="f-year">설립연도<span class="req">*</span></label>
          <input type="number" id="f-year" inputmode="numeric" placeholder="예: 2021" min="1960" max="${CURRENT_YEAR}" value="${esc(company.establishedYear||'')}">
          <div class="help">사업자등록증의 개업연월일 기준. 업력 경계 연차(예: 창업 7년 이내인데 7년 차)는 '확인 필요'로 표시됩니다.</div></div>
        ${industrySelect()}`,
      valid:()=>{ const v=parseInt(company.establishedYear,10);
        return !!company.region && v>=1960 && v<=CURRENT_YEAR && !!company.industry && !!company.bizRegType; }
    },
    smeProfile: {
      title:'기업 규모 (선택)',
      desc:'입력하면 매출·고용·세금 조건이 있는 사업의 확인도가 올라갑니다. 모르면 건너뛰어도 됩니다.',
      optional:true,
      render:()=>`
        <div class="field"><label class="q">연 매출 규모</label>
          <div class="opt-grid c4">${Object.keys(REVENUE_BANDS).map(v=>optBtn('revenueRange',v,v,'',company.revenueRange===v)).join('')}</div></div>
        <div class="field"><label class="q">상시 근로자 수</label>
          <div class="opt-grid c3">${Object.keys(EMPLOYEE_BANDS).map(v=>optBtn('employeeCount',v,v,'',company.employeeCount===v)).join('')}</div></div>
        <div class="field"><label class="q">수출 실적</label>
          <div class="opt-grid c2">${['있음','없음'].map(v=>optBtn('_exp',v,v,'',(company.exportHistory===true&&v==='있음')||(company.exportHistory===false&&v==='없음'))).join('')}</div></div>
        <div class="field"><label class="q">국세·지방세 체납 <span class="opt-tag">대부분 사업 필수요건</span></label>
          <div class="help">체납이 있으면 대부분의 정부지원사업에서 신청이 제한됩니다.</div>
          <div class="opt-grid c2">${['없음(정상)','체납 있음'].map(v=>optBtn('_tax',v,v,'',(company.taxArrears===false&&v==='없음(정상)')||(company.taxArrears===true&&v==='체납 있음'))).join('')}</div></div>`,
      valid:()=>true
    }
  };

  /* ---------- view helper ---------- */
  function show(view){
    currentView = view;
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
    const el=document.getElementById('view-'+view);
    if(el) el.classList.remove('hidden');
    window.scrollTo({top:0,behavior:'instant'});
  }

  return {
    company:()=>company, get step(){return step}, get persona(){return persona},
    get matched(){return matched}, get dash(){return dash},
    init, pickPersona, jumpToPersona, next, back, pick,
    analyze, render, setFilter, setSort, toggleFunded, resetFilter, scrollToResults, expandGroup, showMore,
    openDetail, closeModal, printReport, openProgressive, applyProgressive, closeProgressive,
    reset, goHome, editInputs,
    saveDraft, clearDraft, resumeDraft, dismissDraft,
    runAutoUpdate, dismissUpdate, forgetProfile,
    _ppset:(k,v)=>{ if(['revenueRange','employeeCount','representativeAge','exportHistory'].includes(k)) ppTmp[k]=v; }
  };

  /* ================= INIT ================= */
  function init(){
    injectVersion();
    renderPersonaCards();
    updateDataSourceUI(true);
    prefetchProgramCount();
    checkAutoUpdate();
    checkDraft();
    try{ LEGACY_KEYS.forEach(k=>localStorage.removeItem(k)); }catch{ /* 저장소 사용 불가 */ }
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(); closeProgressive(); } });
    window.addEventListener('beforeprint', ()=>{ if(currentView==='results' && matched.length && !printMode){ printMode=true; render(); } });
    window.addEventListener('afterprint', ()=>{ if(printMode){ printMode=false; render(); } });
  }
  async function prefetchProgramCount(){
    const el=document.getElementById('statPrograms'); if(!el) return;
    try{
      const list = await ProgramProvider.fetchPrograms();
      updateDataSourceUI();
      if(ProgramProvider.lastMode!=='live') return;   // DEMO면 '출처 2곳' 표기 유지(가짜 수치 금지)
      const n = list.filter(p=>deadlineState(p).state!=='CLOSED').length;
      if(n>0){
        el.textContent = n.toLocaleString();
        const lab=document.getElementById('statProgramsLabel'); if(lab) lab.textContent='접수 중·예정 공고';
      }
    }catch{ /* 실패 시 기본 표기 유지 */ }
  }
  function renderPersonaCards(){
    const el=document.getElementById('personaGrid'); if(!el) return;
    el.innerHTML=['founder','retail','maker','sme'].map(k=>{
      const c=PERSONA_CFG[k];
      return `<button type="button" class="persona-card ${k}" onclick="App.pickPersona('${k}')">
        <span class="pc-ic" aria-hidden="true">${c.icon}</span>
        <span class="pc-title">${c.label}</span>
        <span class="pc-desc">${c.cardDesc}</span>
        <span class="pc-go">시작하기 →</span>
      </button>`;
    }).join('');
  }
  function jumpToPersona(){
    const grid=document.getElementById('personaGrid');
    const target=document.querySelector('.persona-q')||grid;
    if(!target) return;
    target.scrollIntoView({behavior:'smooth', block:'center'});
    if(grid){ grid.classList.remove('pulse'); void grid.offsetWidth; grid.classList.add('pulse'); setTimeout(()=>grid.classList.remove('pulse'), 2400); }
  }
  function injectVersion(){
    const fv=document.getElementById('footVer');
    if(fv) fv.textContent = '버전 '+APP_VERSION.version+' · 최종 업데이트 '+APP_VERSION.updated;
  }

  /* ================= PERSONA ================= */
  function pickPersona(p){
    if(!PERSONA_CFG[p]) return;
    persona = p;
    const cfg = PERSONA_CFG[p];
    const prev = company;
    company = blankCompany();
    company.companyType = cfg.companyType;
    // 다른 유형으로 바꿔도 지역·업종 입력은 유지
    company.region = prev.region; company.district = prev.district;
    company.industry = prev.industry || cfg.defaultIndustry;
    setPersonaBadge();
    matched = []; dash = null; progressiveDone = false;
    step=0; renderStep(); show('form');
  }
  function setPersonaBadge(){ const pb=document.getElementById('personaBadge'); if(pb) pb.textContent = persona ? PERSONA_CFG[persona].label : ''; }

  function activeSteps(){ return PERSONA_CFG[persona].steps; }
  function lastStepIdx(){ return activeSteps().length-1; }

  function goHome(){
    if(currentView==='form' && company.companyType) saveDraft(true);   // 결과를 본 뒤에는 임시저장하지 않음
    show('landing');
    const b=document.getElementById('draftBanner'); if(b) b.remove();
    checkDraft(); checkAutoUpdate();
  }
  function editInputs(){ if(!persona) return goHome(); step=lastStepIdx(); renderStep(); show('form'); }

  /* ================= 입력 스텝 ================= */
  function industrySelect(){
    const opts = INDUSTRY_GROUPS.map(g=>`<optgroup label="${g.group}">${
      g.items.map(v=>`<option ${company.industry===v?'selected':''}>${v}</option>`).join('')
    }</optgroup>`).join('');
    return `<div class="field"><label class="q" for="f-industry">주력 산업<span class="req">*</span></label>
      <select id="f-industry"><option value="">산업을 선택하세요</option>${opts}</select>
      <div class="help">가장 가까운 분야를 고르면 돼요. 없으면 '기타'에서 선택.</div></div>`;
  }
  function regionField(){
    const districts = company.region && DISTRICTS[company.region] ? DISTRICTS[company.region] : [];
    const showDistrict = districts.length > 0;
    return `<div class="field"><label class="q" for="f-region">사업장 소재지<span class="req">*</span></label>
      <div class="region-row">
        <select id="f-region" class="region-sido"><option value="">시·도 선택</option>
        ${REGIONS.map(r=>`<option ${company.region===r?'selected':''}>${r}</option>`).join('')}</select>
        <select id="f-district" class="region-gu" aria-label="시·군·구" ${showDistrict?'':'disabled'}>
          <option value="">${showDistrict?'시·군·구 (선택)':'시·도 먼저 선택'}</option>
          ${districts.map(d=>`<option ${company.district===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="help">시·군·구는 선택사항이에요. 고르면 그 지역 이름이 들어간 공고를 위로 올립니다.</div></div>`;
  }

  function renderProgress(){
    const el=document.getElementById('progress'); if(!el) return;
    const labels=activeSteps().map(k=>({creatorBasic:'기본',bizBasic:'기업정보',smeProfile:'규모'}[k]||k));
    labels.push('분석');
    el.innerHTML = labels.map((s,i)=>{
      const cls = i<step?'done':(i===step?'active':'');
      return `<div class="node ${cls}"><div class="cir">${i<step?'✓':i+1}</div><div class="lbl">${s}</div></div>`;
    }).join('');
  }
  function renderStep(){
    renderProgress();
    const panel=document.getElementById('formPanel'); if(!panel) return;
    const def=STEP_DEFS[activeSteps()[step]];
    panel.innerHTML = head(`STEP ${step+1}`, def.title, def.desc) + def.render() + navBtns(step>0, def.valid(), def.optional);
    bindStepInputs();
  }
  function head(k,t,d){ return `<div class="panel-head"><span class="kicker">${k}</span><h2>${t}</h2><p>${d}</p></div>`; }
  function optBtn(field,val,label,sub,sel){
    return `<button type="button" class="opt ${sel?'sel':''}" aria-pressed="${sel?'true':'false'}" onclick="App.pick('${field}','${val}')">${label}${sub?`<small>${sub}</small>`:''}</button>`;
  }
  function navBtns(showBack, canNext, optional){
    const isLast = step===lastStepIdx();
    const label = isLast ? '지원사업 분석하기 →' : '다음 →';
    const enabled = canNext || optional;
    return `<div class="nav-btns">
      ${showBack?`<button type="button" class="btn btn-back" onclick="App.back()">← 이전</button>`:`<button type="button" class="btn btn-back" onclick="App.goHome()">← 처음으로</button>`}
      <button type="button" class="btn btn-primary" id="nextBtn" ${enabled?'':'disabled'} onclick="App.next()">${label}</button></div>`;
  }
  function bindStepInputs(){
    const r=document.getElementById('f-region'); if(r) r.onchange=e=>{
      company.region = REGIONS.includes(e.target.value) ? e.target.value : null;
      company.district=null;
      renderStep();
    };
    const dist=document.getElementById('f-district'); if(dist) dist.onchange=e=>{
      company.district = (DISTRICTS[company.region]||[]).includes(e.target.value) ? e.target.value : null; refreshNext();
    };
    const y=document.getElementById('f-year'); if(y) y.oninput=e=>{
      const v=parseInt(e.target.value,10);
      const ok = v>=1960 && v<=CURRENT_YEAR;
      company.establishedYear = ok ? String(v) : null;
      company.businessAge = ok ? CURRENT_YEAR-v : null;
      let warn=document.getElementById('yearWarn');
      if(e.target.value && !ok && String(v).length>=4){
        if(!warn){ warn=document.createElement('div'); warn.id='yearWarn'; warn.className='field-warn'; warn.setAttribute('role','alert'); e.target.parentNode.appendChild(warn); }
        warn.textContent=`설립연도를 확인해 주세요 (1960~${CURRENT_YEAR})`;
      } else if(warn){ warn.remove(); }
      refreshNext();
    };
    const ind=document.getElementById('f-industry'); if(ind) ind.onchange=e=>{ company.industry = INDUSTRIES.some(i=>i.v===e.target.value) ? e.target.value : null; refreshNext(); };
  }
  function refreshNext(){
    const btn=document.getElementById('nextBtn'); if(!btn) return;
    const def=STEP_DEFS[activeSteps()[step]];
    btn.disabled = !(def.optional || def.valid());
  }

  function next(){
    const def=STEP_DEFS[activeSteps()[step]];
    if(!def.optional && !def.valid()) return;
    if(step===lastStepIdx()){ analyze(); return; }
    step++; renderStep(); saveDraft(true);
  }
  function back(){ if(step>0){ step--; renderStep(); } else goHome(); }
  function pick(field,val){
    if(field==='_exp'){ company.exportHistory = (val==='있음'); renderStep(); return; }
    if(field==='_tax'){ company.taxArrears = (val==='체납 있음'); renderStep(); return; }
    if(!PICKABLE[field] || !PICKABLE[field].includes(val)) return;
    company[field] = company[field]===val ? null : val;   // 다시 누르면 해제(선택 항목)
    renderStep();
  }

  /* ================= 분석 ================= */
  async function analyze(){
    show('loading');
    const steps=['기업조건 확인','지원사업 데이터 조회','자격조건 비교','적합도·확인도 계산','대시보드·리포트 정리'];
    const box=document.getElementById('loadSteps');
    box.innerHTML=steps.map((s,i)=>`<div class="ls" id="ls-${i}"><div class="m">${i+1}</div>${s}</div>`).join('');
    let loadOk=true;
    const load = ProgramProvider.fetchPrograms().then(list=>{ programs=list; }, ()=>{ loadOk=false; });
    for(let i=0;i<steps.length;i++){
      const el=document.getElementById('ls-'+i);
      el.classList.add('on');
      if(i===1) await load; else await wait(260);
      el.classList.remove('on'); el.classList.add('fin'); el.querySelector('.m').textContent='✓';
    }
    updateDataSourceUI();
    if(!loadOk){ renderError(); return; }
    TODAY = startOfToday();
    matched = runMatching(programs, company);
    dash = buildDashboard(matched);
    filter='all'; sortBy='deadline'; fundedOnly=false; expanded=new Set(); listLimit=APP_CONFIG.LIST_LIMIT;
    const ss=document.getElementById('sortSel'); if(ss) ss.value='deadline';
    syncFundedBtn();
    saveProfile();
    clearDraft();
    renderDashboard(); renderPpBanner(); render(); afterRenderMeta();
    show('results');
  }

  function updateDataSourceUI(initial){
    const live = ProgramProvider.lastMode==='live';
    const pending = initial && APP_CONFIG.DATA_MODE==='live';
    const badge = document.querySelector('.badge-demo');
    if(badge){
      badge.textContent = pending ? '공고 불러오는 중' : live ? '실시간 공고' : 'DEMO 데이터';
      badge.classList.toggle('live', live);
    }
    const notice = document.querySelector('.data-notice');
    if(!notice || pending) return;
    if(live){
      const sc = ProgramProvider.lastSourceCounts || {};
      const srcNames = [sc.bizinfo?'기업마당':null, sc.kstartup?'K-Startup':null].filter(Boolean);
      const ai = ProgramProvider.lastEnriched;
      notice.className='data-notice live';
      notice.innerHTML = `✅ <span><b>실시간 공고 기준</b>입니다(${srcNames.join('·')||'공공 API'} · ${esc(fmtStamp(new Date(ProgramProvider.lastFetchedAt)))} 수집). 지원대상·지역·접수기간은 공고 목록 기준으로 판정하며, 본문의 세부 자격요건${ai?`은 ${ai}건만 AI로 분석했고 나머지는`:'은'} 공식 공고에서 확인이 필요합니다.</span>`;
    } else {
      notice.className='data-notice';
      notice.innerHTML = '⚠️ <span><b>DEMO 데이터 기준</b>입니다. 표시된 공고·금액·기간은 동작 확인용 예시(날짜는 오늘 기준으로 이동)이며 실제 공고가 아닙니다. 실제 신청은 공식 공고를 확인하세요.</span>';
    }
  }

  function fmtStamp(d){
    if(!(d instanceof Date) || isNaN(d)) d=new Date();
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function afterRenderMeta(){
    const stamp=fmtStamp(new Date());
    const live = ProgramProvider.lastMode==='live';
    const rf=document.getElementById('resFoot');
    if(rf) rf.textContent=`조회 ${stamp} · 출처: ${live?'기업마당·K-Startup 공개 API':'DEMO 예시 데이터'} · 접수 중·예정 공고 ${dash.active}건 분석`;
    const pm=document.getElementById('printMeta');
    if(pm) pm.innerHTML=`조회일 ${esc(stamp)}<br>${esc([company.region, company.district, company.industry, company.companyType].filter(Boolean).join(' · '))}`;
  }
  function renderPpBanner(){
    const el=document.getElementById('ppBanner'); if(!el) return;
    const needed=collectNeeded();
    if(!needed.length || progressiveDone){ el.innerHTML=''; return; }
    const labels={revenue:'매출 조건',employee:'상시근로자 조건',repAge:'대표자 연령',export:'수출 조건'};
    el.innerHTML=`<div class="pp-banner">
      <div class="ppb-t"><b>추가 정보 ${needed.length}가지를 알려주시면 자격 확인도를 높일 수 있어요</b>
        <span>현재 확인이 필요한 항목: ${needed.map(n=>labels[n]).join(' · ')}</span></div>
      <button type="button" class="btn btn-primary btn-sm" onclick="App.openProgressive()">추가 정보 입력하기</button>
    </div>`;
  }
  function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function renderError(){
    show('results');
    document.getElementById('dashboard').innerHTML='';
    document.getElementById('resultCount').innerHTML='';
    document.getElementById('cards').innerHTML=
      `<div class="empty"><h3>데이터를 불러오지 못했습니다</h3><p>잠시 후 다시 시도해 주세요.</p>
       <button type="button" class="btn btn-primary" onclick="App.reset()">처음으로</button></div>`;
  }

  /* ================= 대시보드 ================= */
  function renderDashboard(){
    const el=document.getElementById('dashboard'); if(!el||!dash) return;
    const d=dash;
    const live = ProgramProvider.lastMode==='live';
    const fieldBuckets = fieldBucketCounts();
    const PALETTE=['#1f9d6b','#e8921a','#4666c4','#c0428a','#2a9d9d','#8a6d3b','#9b59b6','#e05252'];
    const segs = fieldBuckets.slice(0,8).map((f,i)=>({label:needLabel(f.field), value:f.count, color:PALETTE[i%PALETTE.length]}));
    const maxF = Math.max(1, ...fieldBuckets.map(f=>f.count));
    const bars = fieldBuckets.slice(0,8).map((f,i)=>`
      <div class="mbar"><span class="mbar-l">${FIELD_ICON[f.field]||'•'} ${esc(needLabel(f.field))}</span>
        <span class="mbar-t"><span class="mbar-f" style="width:${Math.round(f.count/maxF*100)}%;background:${PALETTE[i%PALETTE.length]}"></span></span>
        <span class="mbar-v">${f.count}</span></div>`).join('');

    const okCnt = d.recommend + d.conditional;
    let heroBody;
    if(!d.considerable){
      heroBody = `<div class="dh-amount dh-amount-sm">지금 딱 맞는 사업은 적어요</div>
         <div class="dh-sub">조건을 바꾸거나, 아래 상담으로 찾아드릴게요.</div>`;
    } else if(d.grantSum>0 || d.loanSum>0){
      const main = d.grantSum>0 ? d.grantSum : d.loanSum;
      const mainLabel = d.grantSum>0 ? `보조·출연 ${d.grantCnt}건` : `융자·보증 ${d.loanCnt}건`;
      heroBody = `<div class="dh-amount">${fmtKRW(main)}</div>
         <div class="dh-sub">자격 충족(추천·조건부) <b>${okCnt}건</b> 중 금액 공개 ${mainLabel}의 사업별 최대액 단순 합계${d.grantSum>0&&d.loanSum>0?` · 융자·보증 한도 <b>${fmtKRW(d.loanSum)}</b> 별도`:''}</div>
         <div class="dh-note">중복수혜 제한·선정 여부에 따라 실제 받을 수 있는 금액은 이보다 적습니다.</div>
         ${d.closingSoon>0?`<div class="dh-chips"><span class="dchip soon">⏰ 마감임박 ${d.closingSoon}건</span></div>`:''}`;
    } else {
      heroBody = `<div class="dh-amount dh-amount-sm">검토할 사업 ${d.considerable}건</div>
         <div class="dh-sub">자격 충족 ${okCnt}건의 지원금액은 공고문에서 확인이 필요합니다.</div>`;
    }
    const heroLabel = d.grantSum>0 ? '자격 충족 사업 지원금 합계(추정)' : d.loanSum>0 ? '자격 충족 사업 융자·보증 한도 합계(추정)' : '검토 결과';

    const srcLabel = live ? '현재 접수 중·예정 공고' : 'DEMO 예시 공고';
    const hookBanner = `
      <button type="button" class="hook-banner" onclick="App.scrollToResults()">
        ${srcLabel} <span class="hook-num">${d.active.toLocaleString()}</span>개 중,
        검토할 만한 사업 <span class="hook-match">${d.considerable}개</span>
        <span class="hook-split">(자격 충족 ${okCnt} · 확인 필요 ${d.check})</span>
        <span class="hook-cta">아래에서 확인 ↓</span>
      </button>`;

    el.innerHTML = hookBanner + `
      <div class="dash-grid">
        <div class="dash-hero">
          <div class="dh-label">${heroLabel}</div>
          ${heroBody}
        </div>
        <div class="dash-card">
          <div class="dc-title">분야별 구성</div>
          <div class="donut-wrap">${donutSVG(segs)}
            <div class="donut-center"><b>${d.considerable}</b><span>건</span></div>
          </div>
        </div>
        <div class="dash-card">
          <div class="dc-title">분야별 매칭 건수</div>
          <div class="mbars">${bars||'<span class="muted">데이터 없음</span>'}</div>
        </div>
      </div>
      <div class="status-legend" aria-label="판정 범례">
        <span class="lg-item"><i class="lg-dot ok"></i><b>추천</b> 판정된 자격 모두 충족·적합도 높음</span>
        <span class="lg-item"><i class="lg-dot cond"></i><b>조건부</b> 미충족 없음 · 일부 조건 공고 확인 또는 적합도 보통</span>
        <span class="lg-item"><i class="lg-dot check"></i><b>확인 필요</b> 자격 판정에 정보 부족</span>
      </div>`;
  }

  function bucketOf(m){
    const purposes=m.program.supportPurposes||[];
    for(const f of FIELD_ORDER){ if(purposes.includes(f)) return f; }
    return purposes[0] || '기타';
  }
  function fieldBucketCounts(){
    const counts={};
    matched.filter(m=>m.state!=='대상 아님').forEach(m=>{ const b=bucketOf(m); counts[b]=(counts[b]||0)+1; });
    const ordered=[...FIELD_ORDER.filter(f=>counts[f]), ...Object.keys(counts).filter(f=>!FIELD_ORDER.includes(f))];
    return ordered.map(f=>({field:f, count:counts[f]}));
  }
  function donutSVG(segs){
    const total=segs.reduce((s,x)=>s+x.value,0)||1;
    const R=52, C=2*Math.PI*R; let off=0;
    const arcs=segs.filter(s=>s.value>0).map(s=>{
      const len=s.value/total*C;
      const el=`<circle cx="70" cy="70" r="${R}" fill="none" stroke="${s.color}" stroke-width="18"
                 stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off+=len; return el;
    }).join('');
    const legend=segs.map(s=>`<span class="lg"><i style="background:${s.color}"></i>${esc(s.label)} ${s.value}</span>`).join('');
    return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="분야별 구성">${arcs}</svg><div class="donut-legend">${legend}</div>`;
  }

  /* ================= 결과 카드 ================= */
  function visibleList(){
    let list = matched.filter(m=>m.state!=='대상 아님');
    if(fundedOnly) list=list.filter(m=> m.program.supportAmountMax>0);
    if(filter==='마감임박') list=list.filter(m=>m.dl.state==='CLOSING_SOON');
    else if(filter!=='all'){ const ps=needToPurposes(filter); list=list.filter(m=>(m.program.supportPurposes||[]).some(pp=>ps.includes(pp))); }
    sortList(list);
    return list;
  }
  function render(){
    renderNeedFilter();
    const cards=document.getElementById('cards'); if(!cards) return;
    const pn=document.getElementById('printNote');
    if(printMode){
      // PDF: 필터와 관계없이 추천순 상위 N건만(실시간 수백 건이 수십 쪽이 되지 않게)
      const all = matched.filter(m=>m.state!=='대상 아님');
      const order={'추천':0,'조건부 추천':1,'확인 필요':2};
      all.sort((a,b)=>(order[a.state]-order[b.state]) || (b.fit-a.fit));
      const top = all.slice(0, APP_CONFIG.PRINT_LIMIT);
      if(pn) pn.textContent = all.length>top.length ? `추천순 상위 ${top.length}건 수록 (검토 대상 전체 ${all.length}건은 화면에서 확인)` : `검토 대상 ${all.length}건 전체 수록 (추천순)`;
      cards.innerHTML = top.map(cardHTML).join('');
      return;
    }
    if(pn) pn.textContent='';
    const list = visibleList();
    renderResultCount(list.length);
    if(!list.length){
      cards.innerHTML=`<div class="empty"><h3>${filter==='all'&&!fundedOnly?'조건에 맞는 사업이 아직 없어요':'이 조건엔 사업이 없어요'}</h3>
        <p>${filter==='all'&&!fundedOnly?'조건을 바꾸거나, 아래 상담으로 맞춤 사업을 찾아드릴게요.':'<button type="button" class="btn btn-ghost btn-sm" onclick="App.resetFilter()">← 전체 보기</button>'}</p></div>`;
      return;
    }
    const useGrouping = filter==='all' && !fundedOnly;
    if(useGrouping){ cards.innerHTML = renderGroupedByField(list); return; }
    const shown = list.slice(0, listLimit);
    cards.innerHTML = shown.map(cardHTML).join('')
      + (list.length>shown.length ? `<div class="more-row"><button type="button" class="more-btn" onclick="App.showMore()">${list.length-shown.length}건 더 보기</button></div>` : '');
  }
  function renderResultCount(n){
    const el=document.getElementById('resultCount'); if(!el) return;
    const label = filter==='마감임박' ? '마감임박' : filter!=='all' ? needLabel(filter) : '전체';
    const filterActive = filter!=='all' || fundedOnly;
    el.innerHTML = `<div class="rc-count-in">
        <b>${esc(label)}${fundedOnly?' · 지원금액 공개 사업만':''}</b> <span class="rc-count-n">${n}건</span>
        ${filterActive?`<button type="button" class="rc-count-reset" onclick="App.resetFilter()">전체 보기 ✕</button>`:''}
      </div>`;
  }
  function resetFilter(){ filter='all'; fundedOnly=false; listLimit=APP_CONFIG.LIST_LIMIT; syncFundedBtn(); render(); }
  function scrollToResults(){
    const el=document.getElementById('resultCount')||document.getElementById('cards');
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function expandGroup(f){ expanded.add(f); render(); }
  function showMore(){ listLimit += APP_CONFIG.LIST_LIMIT; render(); }

  function renderGroupedByField(list){
    const buckets={};
    list.forEach(m=>{ const b=bucketOf(m); (buckets[b]=buckets[b]||[]).push(m); });
    const orderedKeys=[...FIELD_ORDER.filter(f=>buckets[f]), ...Object.keys(buckets).filter(f=>!FIELD_ORDER.includes(f))];
    return orderedKeys.map(f=>{
      const items=buckets[f];
      const shown = expanded.has(f) ? items : items.slice(0, APP_CONFIG.GROUP_LIMIT);
      return `
      <div class="need-group">
        <div class="need-group-head">
          <span class="ng-icon" aria-hidden="true">${FIELD_ICON[f]||'📌'}</span>
          <h3 class="ng-title">${esc(needLabel(f))}</h3>
          <span class="ng-count">${items.length}건</span>
        </div>
        <div class="need-group-cards">${shown.map(cardHTML).join('')}</div>
        ${items.length>shown.length?`<div class="more-row"><button type="button" class="more-btn" data-field="${esc(f)}" onclick="App.expandGroup(this.dataset.field)">${esc(needLabel(f))} ${items.length-shown.length}건 더 보기</button></div>`:''}
      </div>`;
    }).join('');
  }
  function needLabel(need){
    const L={'정책자금/금융':'자금·융자','R&D/기술':'R&D·기술개발','창업':'창업·재도전','사업화':'사업화',
      '판로':'판로·유통','판로/유통':'판로·유통','마케팅':'마케팅','수출':'수출','인력':'인력·고용',
      '경영':'경영개선','경영/컨설팅':'경영·컨설팅','컨설팅':'경영·컨설팅','시설/공간':'시설·공간','디지털전환':'디지털전환','제조혁신':'제조혁신·설비','행사/네트워크':'행사·네트워크','기타':'기타 지원'};
    return L[need]||need;
  }

  function sortList(list){
    const order={'추천':0,'조건부 추천':1,'확인 필요':2,'대상 아님':3};
    const grp=m=> (m.dl.state==='CLOSING_SOON'||m.dl.state==='OPEN') ? 0 : m.dl.state==='UPCOMING' ? 1 : 2;
    list.sort((a,b)=>{
      if(sortBy==='deadline'){
        // 마감임박순은 말 그대로 마감일 순(v3.7은 지역 관련도를 먼저 적용해 이름과 순서가 달랐음)
        const ga=grp(a), gb=grp(b); if(ga!==gb) return ga-gb;
        const da=a.dl.dday==null?9999:a.dl.dday, db=b.dl.dday==null?9999:b.dl.dday;
        return (da-db) || ((b.regionTier??-1)-(a.regionTier??-1));
      }
      if(sortBy==='amount') return (b.program.supportAmountMax||0)-(a.program.supportAmountMax||0) || (order[a.state]-order[b.state]);
      // 추천순: 판정 상태 → 내 지역 특화 → 적합도
      return (order[a.state]-order[b.state]) || ((b.regionTier??-1)-(a.regionTier??-1)) || (b.fit-a.fit);
    });
  }

  function renderNeedFilter(){
    const seg=document.getElementById('seg-filter'); if(!seg) return;
    const fieldCount={};
    matched.filter(m=>m.state!=='대상 아님').forEach(m=>{ (m.program.supportPurposes||[]).forEach(f=>{ fieldCount[f]=(fieldCount[f]||0)+1; }); });
    const fields=FIELD_ORDER.filter(f=>fieldCount[f]);
    const btn=(val,label)=>`<button type="button" data-val="${esc(val)}" class="${filter===val?'on':''}" aria-pressed="${filter===val}" onclick="App.setFilter(this.dataset.val)">${label}</button>`;
    seg.innerHTML = btn('all','전체') + fields.map(f=>btn(f, `${esc(needLabel(f))} <small>${fieldCount[f]}</small>`)).join('') + btn('마감임박','⏰ 마감임박');
  }

  function cardHTML(m){
    const p=m.program, dl=dlBadge(m.dl), url=safeUrl(p.originalUrl);
    const passCount=m.elig.conds.filter(c=>c.result==='pass').length;
    const checkItems=m.elig.conds.filter(c=>c.result==='unknown').map(c=>c.label);
    const amt = p.supportAmountText || fmtKRW(p.supportAmountMax);
    const eligLine = checkItems.length
      ? `자격 ${passCount}개 충족 · <span class="chk">${esc(checkItems.slice(0,2).join('·'))}${checkItems.length>2?` 외 ${checkItems.length-2}`:''} 확인 필요</span>`
      : `판정된 자격 ${passCount}개 모두 충족`;
    return `<article class="rcard ${ST_CLS[m.state]}" data-id="${esc(p.sourceProgramId)}">
      <div class="rc-line1">
        <span class="rc-state ${ST_CLS[m.state]}">${esc(m.state)}</span>
        ${regionBadge(m)}
        ${p._aiEnriched?`<span class="ai-badge" title="공고 본문에서 자격조건을 AI로 추출(근거 문구 대조)한 사업">🤖 AI 본문분석</span>`:''}
        <span class="rc-dl ${dl.cls}">${dl.icon} ${esc(dl.txt)}</span>
      </div>
      <h3>${esc(p.programName)}</h3>
      <div class="rc-agency">${esc(p.agency||'')}${p.executingAgency?` · ${esc(p.executingAgency)}`:''}</div>
      <div class="rc-amt-row">
        <div class="rc-amt"><span class="rc-amt-l">${isLoanProgram(p)?'융자·보증 한도':'최대 지원'}</span><b>${esc(amt)}</b></div>
        <div class="rc-fit" title="입력 정보로 계산한 적합도(선정확률 아님)">
          <span class="rc-fit-l">적합도</span><b>${m.fit}</b>
          <span class="rc-fit-bar"><span style="width:${m.fit}%"></span></span>
        </div>
      </div>
      <div class="rc-period">📅 ${esc(periodText(p, m.dl))}</div>
      <div class="rc-elig">${eligLine}</div>
      <div class="rc-actions">
        <button type="button" class="btn btn-primary btn-sm" data-id="${esc(p.sourceProgramId)}" onclick="App.openDetail(this.dataset.id)">자세히 · 자격보기</button>
        ${url?`<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">공식공고 ↗</a>`:''}
      </div>
    </article>`;
  }

  function regionBadge(m){
    if(m.regionTier===2) return `<span class="rgn-badge t2">📍 ${esc(m.regionLabel)}</span>`;
    if(m.regionTier===1) return `<span class="rgn-badge t1">${esc(m.regionLabel)}</span>`;
    if(m.regionTier===0) return `<span class="rgn-badge t0">전국</span>`;
    return '';
  }
  function periodText(p, dl){
    const s=p.applicationStart, e=p.applicationEnd;
    if(s && e) return `${fmtDate(s)} ~ ${fmtDate(e)} 마감`;
    if(e) return `~ ${fmtDate(e)} 마감`;
    if(p.applicationEndText) return String(p.applicationEndText).slice(0,60);
    if(dl.state==='OPEN') return '접수중 · 마감일은 공식공고 확인';
    return '신청기간은 공식공고 확인';
  }
  function fmtDate(d){
    const m=String(d||'').match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : String(d||'');
  }
  function dlBadge(dl){
    if(dl.state==='CLOSED') return {txt:'마감됨',cls:'no',icon:'✕'};
    if(dl.state==='UNKNOWN') return {txt:'기간 확인',cls:'no',icon:'?'};
    if(dl.state==='UPCOMING') return {txt: dl.dday!=null?`접수 D-${dl.dday}`:'접수 예정',cls:'up',icon:'◷'};
    if(dl.state==='CLOSING_SOON') return {txt: dl.dday===0 ? '오늘 마감' : `마감 D-${dl.dday}`, cls:'soon', icon:'⏰'};
    if(dl.dday==null) return {txt:'접수중', cls:'open', icon:'●'};
    return {txt:`D-${dl.dday}`,cls:'open',icon:'●'};
  }

  function setFilter(f){ filter = typeof f==='string' && f ? f : 'all'; listLimit=APP_CONFIG.LIST_LIMIT; render(); }
  function setSort(s){ sortBy = ['deadline','fit','amount'].includes(s) ? s : 'deadline'; render(); }
  function toggleFunded(){ fundedOnly=!fundedOnly; listLimit=APP_CONFIG.LIST_LIMIT; syncFundedBtn(); render(); }
  function syncFundedBtn(){ const btn=document.getElementById('fundedToggle'); if(btn){ btn.classList.toggle('on', fundedOnly); btn.setAttribute('aria-pressed', String(fundedOnly)); } }

  /* ================= 상세 모달 ================= */
  function openDetail(id){
    const m=matched.find(x=>x.program.sourceProgramId===String(id)); if(!m) return;
    const p=m.program, url=safeUrl(p.originalUrl);
    const conds=m.elig.conds.filter(c=>c.result!=='na').map(c=>{
      const ic={pass:'충족',fail:'미충족',unknown:'확인필요'}[c.result];
      const cc={pass:'ok',fail:'no',unknown:'check'}[c.result];
      return `<div class="cond-row"><span class="cbadge ${cc}">${ic}</span>
        <div><b>${esc(c.label)}</b>${c.evidence?`<span class="cond-ev">${esc(c.evidence)}</span>`:''}</div></div>`;
    }).join('') || '<p class="muted">판정할 자격 항목이 공고에 없습니다.</p>';
    const pref=(p.preferenceConditions||[]).map(x=>`<span class="pref">우대 ${esc(x)}</span>`).join('');
    const ev=p._eligibilityEvidence && typeof p._eligibilityEvidence==='object'
      ? Object.entries(p._eligibilityEvidence).slice(0,8).map(([k,v])=>`<li><b>${esc(k)}</b> “${esc(v)}”</li>`).join('') : '';
    const depth = p._aiEnriched ? 'AI 본문 분석(근거 문구 대조)' : p.eligibilityDepth==='listing' ? '공고 목록 정보(본문 미분석)' : ProgramProvider.lastMode==='live' ? '공고 정보' : 'DEMO 예시 데이터';
    const period = (p.applicationStart||p.applicationEnd) ? `${p.applicationStart||'—'} ~ ${p.applicationEnd||'—'}` : periodText(p, m.dl);
    document.getElementById('modalBody').innerHTML=`
      <span class="rc-state ${ST_CLS[m.state]}" style="align-self:flex-start">${esc(m.state)}</span>
      <h2 id="modalTitle" style="margin:8px 0 4px">${esc(p.programName)}</h2>
      <div class="m-info">
        <div><span>소관기관</span><b>${esc(p.agency||'—')}</b></div>
        <div><span>수행기관</span><b>${esc(p.executingAgency||'—')}</b></div>
        <div><span>지원분야</span><b>${esc(p.category||'—')}${p.subCategory?` / ${esc(p.subCategory)}`:''}</b></div>
        <div><span>${isLoanProgram(p)?'융자·보증 한도':'지원금액'}</span><b>${esc(p.supportAmountText||fmtKRW(p.supportAmountMax))}</b></div>
        <div><span>신청기간</span><b>${esc(period)} (${esc(dlBadge(m.dl).txt)})</b></div>
        <div><span>문의</span><b>${esc(p.contact||'—')}</b></div>
      </div>
      <div class="m-sec"><h4>사업 개요</h4><p>${esc(p.supportDescription||'—')}</p></div>
      <div class="m-sec"><h4>자격조건 판정 <span class="muted">(적합도 ${m.fit} · 확인도 ${m.conf} · 근거: ${esc(depth)})</span></h4>${conds}</div>
      ${ev?`<div class="m-sec"><h4>AI가 인용한 공고 문구</h4><ul class="ev-list">${ev}</ul></div>`:''}
      ${pref?`<div class="m-sec"><h4>우대사항</h4><div class="prefs">${pref}</div></div>`:''}
    `;
    const link=document.getElementById('modalOpenLink');
    if(url){ link.href=url; link.classList.remove('hidden'); } else { link.removeAttribute('href'); link.classList.add('hidden'); }
    lastFocus = document.activeElement;
    document.getElementById('detailModal').classList.remove('hidden');
    const close=document.querySelector('#detailModal .modal-close'); if(close) close.focus();
  }
  function closeModal(){
    const md=document.getElementById('detailModal');
    if(!md || md.classList.contains('hidden')) return;
    md.classList.add('hidden');
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ================= Progressive Profiling ================= */
  function openProgressive(){
    const needed=collectNeeded();
    if(!needed.length){ toast('추가로 확인할 항목이 없습니다.'); return; }
    ppTmp = {};
    document.getElementById('ppBody').innerHTML = needed.map(ppField).join('');
    document.getElementById('ppModal').classList.remove('hidden');
  }
  function closeProgressive(){ const el=document.getElementById('ppModal'); if(el) el.classList.add('hidden'); }
  function collectNeeded(){
    const set=new Set();
    matched.forEach(m=>{
      if(m.state==='대상 아님') return;
      m.elig.conds.filter(c=>c.result==='unknown').forEach(c=>{
        if(/매출/.test(c.label) && !company.revenueRange) set.add('revenue');
        if(/상시/.test(c.label) && !company.employeeCount) set.add('employee');
        if(/대표자/.test(c.label) && !company.representativeAge) set.add('repAge');
        if(/수출/.test(c.label) && company.exportHistory==null) set.add('export');
      });
    });
    return [...set];
  }
  function ppField(n){
    const F={
      revenue:{q:'연 매출 규모',opts:Object.keys(REVENUE_BANDS),key:'revenueRange'},
      employee:{q:'상시 근로자 수',opts:Object.keys(EMPLOYEE_BANDS),key:'employeeCount'},
      repAge:{q:'대표자 연령대',opts:Object.keys(AGE_BANDS),key:'representativeAge'},
      export:{q:'수출 실적',opts:['있음','없음'],key:'exportHistory'}
    }[n];
    return `<div class="field"><label class="q">${F.q}</label><div class="opt-grid c3">
      ${F.opts.map(o=>`<button type="button" class="opt"
        onclick="this.parentNode.querySelectorAll('.opt').forEach(b=>b.classList.remove('sel'));this.classList.add('sel');App._ppset('${F.key}','${o}')">${o}</button>`).join('')}
    </div></div>`;
  }
  function applyProgressive(){
    const next = { ...company, ...ppTmp };
    if(ppTmp.exportHistory!=null) next.exportHistory = ppTmp.exportHistory==='있음';
    company = Object.assign(sanitizeCompany(next), {supportNeeds:company.supportNeeds});
    matched=runMatching(programs,company);
    dash=buildDashboard(matched);
    progressiveDone=true;
    closeProgressive();
    saveProfile();
    renderDashboard(); renderPpBanner(); render(); afterRenderMeta();
    toast('추가 정보로 매칭을 다시 계산했습니다.');
  }

  /* ================= 무가입 재매칭 (이 브라우저에만 저장) ================= */
  function readJSON(key){ try{ return JSON.parse(localStorage.getItem(key)||'null'); }catch{ return null; } }
  function saveProfile(){
    try{
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ persona, company, ts:Date.now() }));
      localStorage.setItem(LASTSEEN_KEY, JSON.stringify({ts:Date.now(), programIds: matched.filter(m=>m.state!=='대상 아님').map(m=>m.program.sourceProgramId).slice(0,2000)}));
    }catch{ /* 저장소 사용 불가 */ }
  }
  function loadProfile(){
    const prof=readJSON(PROFILE_KEY);
    if(!prof || typeof prof!=='object') return null;
    const c=sanitizeCompany(prof.company);
    const p = PERSONA_CFG[prof.persona] && PERSONA_CFG[prof.persona].companyType===c.companyType ? prof.persona : personaOf(c.companyType);
    if(!p) return null;
    return {persona:p, company:c, ts:+prof.ts||Date.now()};
  }
  function checkAutoUpdate(){
    const prof=loadProfile(); if(!prof) return;
    const host=document.getElementById('view-landing'); if(!host || document.getElementById('updateBanner')) return;
    const days=Math.max(0, Math.floor((Date.now()-prof.ts)/MS_DAY));
    const agoTxt = days===0?'오늘':days===1?'어제':`${days}일 전`;
    const bn=document.createElement('div');
    bn.id='updateBanner'; bn.className='update-banner';
    bn.innerHTML=`<div class="ub-in">
      <div class="ub-txt">
        <b>🔄 저장한 조건으로 최신 공고를 다시 매칭할 수 있어요</b>
        <span>${agoTxt} 저장 · ${esc([prof.company.region, prof.company.companyType, prof.company.industry].filter(Boolean).join(' · '))} — 지난번 이후 새로 맞는 공고에 NEW 표시. 조건은 이 브라우저에만 저장돼 있습니다.</span>
      </div>
      <div class="ub-btns">
        <button type="button" class="btn btn-primary btn-sm" onclick="App.runAutoUpdate()">다시 매칭하기</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="App.forgetProfile()">저장 정보 삭제</button>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="배너 닫기" onclick="App.dismissUpdate()">닫기</button>
      </div></div>`;
    host.parentNode.insertBefore(bn, host);
  }
  async function runAutoUpdate(){
    const prof=loadProfile(); if(!prof) return;
    persona=prof.persona; company=prof.company; setPersonaBadge();
    const last=readJSON(LASTSEEN_KEY);
    const prevIds=new Set(last && Array.isArray(last.programIds) ? last.programIds.map(String) : []);
    dismissUpdate();
    await analyze();
    if(!prevIds.size) return;
    const newOnes=matched.filter(m=>m.state!=='대상 아님' && !prevIds.has(m.program.sourceProgramId));
    if(!newOnes.length) return;
    toast(`지난 방문 이후 새로 검토 가능해진 사업 ${newOnes.length}건이 있습니다.`);
    const ids=new Set(newOnes.map(m=>m.program.sourceProgramId));
    document.querySelectorAll('#cards .rcard').forEach(card=>{
      if(ids.has(card.dataset.id) && !card.querySelector('.newbadge')){
        const b=document.createElement('span'); b.className='newbadge'; b.textContent='NEW'; card.querySelector('h3').appendChild(b);
      }
    });
  }
  function dismissUpdate(){ const b=document.getElementById('updateBanner'); if(b) b.remove(); }
  function forgetProfile(){
    try{ [PROFILE_KEY, LASTSEEN_KEY, DRAFT_KEY].forEach(k=>localStorage.removeItem(k)); }catch{ /* 저장소 사용 불가 */ }
    dismissUpdate(); const d=document.getElementById('draftBanner'); if(d) d.remove();
    toast('이 브라우저에 저장된 조건을 삭제했습니다.');
  }

  /* ================= 임시저장 ================= */
  function saveDraft(silent){
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({persona,company,step,ts:Date.now()}));
      if(!silent) toast('입력 내용을 임시 저장했습니다.');
    }catch{ if(!silent) toast('임시 저장을 사용할 수 없는 환경입니다.'); }
  }
  function clearDraft(){ try{ localStorage.removeItem(DRAFT_KEY); }catch{ /* 저장소 사용 불가 */ } const b=document.getElementById('draftBanner'); if(b) b.remove(); }
  function loadDraft(){
    const d=readJSON(DRAFT_KEY); if(!d || typeof d!=='object') return null;
    const c=sanitizeCompany(d.company);
    const p = PERSONA_CFG[d.persona] ? d.persona : personaOf(c.companyType);
    if(!p) return null;
    c.companyType = PERSONA_CFG[p].companyType;
    const s = Math.max(0, Math.min(parseInt(d.step,10)||0, PERSONA_CFG[p].steps.length-1));
    return {persona:p, company:c, step:s};
  }
  function checkDraft(){
    if(document.getElementById('draftBanner') || !loadDraft()) return;
    const host=document.getElementById('view-landing'); if(!host) return;
    const bn=document.createElement('div');
    bn.id='draftBanner'; bn.className='draft-banner';
    bn.innerHTML=`<div class="db-in"><span>📝 작성 중이던 입력이 있습니다 — 이어서 진행할까요?</span>
      <span class="db-btns"><button type="button" class="btn btn-primary db-sm" onclick="App.resumeDraft()">이어하기</button>
      <button type="button" class="btn btn-ghost db-sm" onclick="App.dismissDraft()">새로 시작</button></span></div>`;
    host.parentNode.insertBefore(bn, host);
  }
  function resumeDraft(){
    const d=loadDraft(); if(!d) return clearDraft();
    persona=d.persona; company=d.company; step=d.step; setPersonaBadge();
    clearDraft(); renderStep(); show('form');
  }
  function dismissDraft(){ clearDraft(); }

  /* ================= PDF ================= */
  function printReport(){
    printMode=true; render();
    setTimeout(()=>{ window.print(); }, 50);   // afterprint에서 화면 목록 복원
  }

  function reset(){
    company=blankCompany(); persona=null; setPersonaBadge();
    step=0; matched=[]; dash=null; progressiveDone=false;
    show('landing'); checkAutoUpdate(); checkDraft();
  }

  function toast(msg){
    let t=document.getElementById('toast');
    if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2400);
  }
})();
