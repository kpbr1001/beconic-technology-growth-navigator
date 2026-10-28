/* global App, APP_CONFIG, APP_VERSION, ProgramProvider, runMatching, buildDashboard, blankCompany, hardEligibility, deadlineState, sanitizeCompany, startOfToday -- page.evaluate 안에서 앱 전역을 호출 */
// BECONIC 지원사업 MATCH QA — 실제 Chromium으로 판정 엔진·사용자 흐름·레드팀 회귀·모바일·PDF·데모 단일본을 확인한다.
// 실행: (grants 를 빌드해 dist/ 를 정적 서버로 띄운 뒤) node grants/tests/qa.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://127.0.0.1:8793/';

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
async function newPage(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource|pretendard/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  return page;
}

// ---------- 1. 판정 엔진 ----------
{
  const page = await newPage();
  await page.goto(BASE);
  const r = await page.evaluate(() => {
    const C = (o) => Object.assign(blankCompany(), o);
    const P = (o) => Object.assign({ sourceProgramId: 'T', programName: 'T', supportPurposes: [], targetBusinessType: [], targetRegions: ['전국'], targetIndustries: [], excludedIndustries: [], certificationConditions: [] }, o);
    const cond = (p, c, label) => hardEligibility(P(p), C(c)).conds.find((x) => x.label === label);
    const sme = { companyType: '중소기업', bizRegType: '법인사업자', region: '서울', industry: '제조업', establishedYear: '2020', businessAge: 6 };
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const t = startOfToday();
    const plus = (n) => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
    return {
      age30: cond({ representativeAgeMax: 39 }, { companyType: '예비창업자', representativeAge: '30대' }, '대표자 연령').result,
      age30vs34: cond({ representativeAgeMax: 34 }, { companyType: '예비창업자', representativeAge: '30대' }, '대표자 연령').result,
      age40vs39: cond({ representativeAgeMax: 39 }, { companyType: '예비창업자', representativeAge: '40대' }, '대표자 연령').result,
      rev15: cond({ revenueConditions: '연매출 15억원 이하' }, { ...sme, revenueRange: '10-30억' }, '매출 조건').result,
      rev10: cond({ revenueConditions: '연매출 10억원 이하' }, { ...sme, revenueRange: '5-10억' }, '매출 조건').result,
      rev30up: cond({ revenueConditions: '연매출 30억원 이상' }, { ...sme, revenueRange: '10-30억' }, '매출 조건').result,
      revAi: cond({ revenueMax: 5e9 }, { ...sme, revenueRange: '50-100억' }, '매출 조건').result,
      emp5: cond({ employeeConditions: '상시근로자 5인 미만' }, { ...sme, employeeCount: '1-4인' }, '상시근로자 조건').result,
      emp5b: cond({ employeeConditions: '상시근로자 5인 미만' }, { ...sme, employeeCount: '5-9인' }, '상시근로자 조건').result,
      ageEdge: cond({ businessAgeMax: 6 }, sme, '업력 조건').result,
      ageIn: cond({ businessAgeMax: 7 }, sme, '업력 조건').result,
      ageOut: cond({ businessAgeMax: 5 }, sme, '업력 조건').result,
      preOnly: cond({ preStartupOnly: true, preStartupAllowed: true }, sme, '업력 조건').result,
      preAllowedFalse: cond({ businessAgeMax: 3, preStartupAllowed: false }, { companyType: '예비창업자' }, '업력 조건').result,
      preMin: cond({ businessAgeMin: 3 }, { companyType: '예비창업자' }, '업력 조건').result,
      inferredType: cond({ targetBusinessType: ['법인', '개인사업자'], targetBusinessTypeInferred: true }, { companyType: '예비창업자' }, '지원대상 유형').result,
      corpOnlyIndiv: cond({ targetBusinessType: ['법인'] }, { ...sme, bizRegType: '개인사업자' }, '지원대상 유형').result,
      exportCap: cond({ exportConditions: '전년도 수출액 100만불 미만' }, { ...sme, exportHistory: false }, '수출 조건').result,
      listing: hardEligibility(P({ eligibilityDepth: 'listing' }), C(sme)).verdict,
      gyeongnam: cond({ targetRegions: ['경남'] }, sme, '사업장 소재지').result,
      reachRec: runMatching([P({ applicationEnd: plus(30), supportAmountMax: 1e8, businessAgeMax: 7 })], C(sme))[0].state,
      today: deadlineState(P({ applicationEnd: plus(0) })),
      yesterday: deadlineState(P({ applicationEnd: plus(-1) })).state,
      d3: deadlineState(P({ applicationEnd: plus(3) })).dday,
      upcoming: deadlineState(P({ applicationStart: plus(5), applicationEnd: plus(20) })),
      loanSplit: (() => { const m = runMatching([P({ programName: 'A 정책자금 융자', supportAmountMax: 1e9, category: '금융', applicationEnd: plus(30) }), P({ programName: 'B 바우처', supportAmountMax: 5e7, applicationEnd: plus(30) })], C(sme)); const d = buildDashboard(m); return [d.grantSum, d.loanSum]; })(),
      sanitize: sanitizeCompany({ region: '<img>', industry: '제조업', establishedYear: '1800', companyType: '중소기업', exportHistory: 'yes' }),
    };
  });
  check('연령대: 30대 vs 만39세 이하 → 충족 (v3.7은 문자열 비교로 전원 탈락)', r.age30 === 'pass', r.age30);
  check('연령대: 30대 vs 만34세 이하 → 확인 필요(구간 걸침)', r.age30vs34 === 'unknown');
  check('연령대: 40대 vs 만39세 이하 → 미충족', r.age40vs39 === 'fail');
  check('매출: 10-30억 vs 15억 이하 → 확인 필요(중간값 비교 금지)', r.rev15 === 'unknown', r.rev15);
  check('매출: 5-10억 vs 10억 이하 → 충족, 10-30억 vs 30억 이상 → 미충족', r.rev10 === 'pass' && r.rev30up === 'fail');
  check('매출(AI 숫자): 50-100억 vs 50억 이하 → 확인 필요', r.revAi === 'unknown', r.revAi);
  check('근로자: 1-4인 vs 5인 미만 충족, 5-9인 미충족', r.emp5 === 'pass' && r.emp5b === 'fail');
  check('업력: 경계 연차는 확인 필요, 이내 충족, 초과 미충족', r.ageEdge === 'unknown' && r.ageIn === 'pass' && r.ageOut === 'fail', `${r.ageEdge}/${r.ageIn}/${r.ageOut}`);
  check('예비창업 전용 사업은 기존 기업 미충족', r.preOnly === 'fail');
  check('예비창업자: 예비창업 제외(K-Startup 업력 목록) 미충족, 업력 N년 이상 미충족', r.preAllowedFalse === 'fail' && r.preMin === 'fail');
  check('대상 표기 없는 공고(inferred)는 대상 아님이 아니라 확인 필요', r.inferredType === 'unknown');
  check('사업자 형태 반영: 법인 전용 사업에 개인사업자 미충족', r.corpOnlyIndiv === 'fail');
  check('수출 상한 조건: 실적 없음 → 충족', r.exportCap === 'pass');
  check('실시간 목록 정보만 있는 공고는 ELIGIBLE 확정 금지(CONDITIONAL)', r.listing === 'CONDITIONAL');
  check('조건 모두 충족·마감 여유 → 추천 등급 도달 (v3.7은 최대 58점이라 추천 불가)', r.reachRec === '추천', r.reachRec);
  check('마감 당일 = 오늘 마감(D-0), 어제 마감 = 마감됨', r.today.state === 'CLOSING_SOON' && r.today.dday === 0 && r.yesterday === 'CLOSED');
  check('D-day는 달력 날짜 기준(3일 후 = D-3)', r.d3 === 3, String(r.d3));
  check('접수 시작 전 = 접수 예정 D-5', r.upcoming.state === 'UPCOMING' && r.upcoming.dday === 5);
  check('대시보드: 보조금과 융자 한도 분리 합산', r.loanSplit[0] === 5e7 && r.loanSplit[1] === 1e9, JSON.stringify(r.loanSplit));
  check('저장값 정제: 허용 밖 값 제거', r.sanitize.region === null && r.sanitize.establishedYear === null && r.sanitize.exportHistory === null && r.sanitize.industry === '제조업');
  await page.context().close();
}

// ---------- 2. 사용자 흐름 (예비창업자, DEMO) ----------
{
  const page = await newPage();
  await page.goto(BASE);
  const body = await page.locator('body').innerText();
  check('홈: 과장·검증 불가 문구 제거(여기뿐·수천·매일 갱신·실시간으로 뒤져)', !/여기뿐|수천|매일 갱신|실시간으로 뒤져/.test(body));
  check('홈: DEMO 모드에서 가짜 공고 수 대신 출처 표기', (await page.locator('#statPrograms').innerText()) === '2곳');
  const ver = await page.evaluate(() => APP_VERSION.version);
  check('푸터 버전 표기 = APP_VERSION', (await page.locator('#footVer').innerText()).includes(ver), ver);
  check('스크립트 캐시 버전 = 앱 버전', await page.evaluate((v) => [...document.scripts].some((s) => s.src.includes('app.js?v=' + v.slice(1))), ver));
  check('유형 카드는 키보드로 누를 수 있는 버튼', await page.locator('#personaGrid button.persona-card').count() === 4);
  await page.locator('.persona-card.founder').click();
  check('다음 버튼: 필수 입력 전 비활성', await page.locator('#nextBtn').isDisabled());
  await page.selectOption('#f-region', '서울');
  await page.selectOption('#f-district', '강남구');
  await page.selectOption('#f-industry', 'AI·빅데이터');
  await page.locator('.opt', { hasText: '30대' }).click();
  await page.locator('#nextBtn').click();
  await page.waitForSelector('#view-results:not(.hidden)', { timeout: 8000 });
  const cards = await page.locator('#cards .rcard').count();
  check('결과: 카드 표시', cards > 0, `${cards}장`);
  check('결과: 카드마다 판정 상태 배지', await page.locator('#cards .rcard .rc-state').count() === cards);
  const states = await page.locator('#cards .rc-state').allInnerTexts();
  check('예비창업자(30대): 청년창업사관학교 포함·추천 등급 존재', (await page.locator('#cards', { hasText: '청년창업사관학교' }).count()) === 1 && states.includes('추천'), states.join(','));
  const hook = await page.locator('.hook-banner').innerText();
  check('후킹 문구: DEMO 표기·검토할 만한(신청 가능 단정 아님)', /DEMO 예시 공고/.test(hook) && /검토할 만한/.test(hook) && !/신청할 수 있는/.test(hook), hook.replace(/\s+/g, ' '));
  const notice = await page.locator('.data-notice').innerText();
  check('데이터 안내: DEMO·예시 명시', /DEMO/.test(notice) && /예시/.test(notice));
  const resFoot = await page.locator('#resFoot').innerText();
  check('결과 하단 출처: DEMO 표기', /DEMO 예시 데이터/.test(resFoot), resFoot);
  // 정렬: 마감임박순은 마감일 순서
  const dd = await page.evaluate(() => { App.setFilter('창업'); return [...document.querySelectorAll('#cards .rc-dl')].map((e) => e.textContent.trim()); });
  const nums = dd.map((t) => (/오늘/.test(t) ? 0 : /D-(\d+)/.test(t) && !/접수/.test(t) ? +t.match(/D-(\d+)/)[1] : 9999));
  check('마감임박순: 마감일 오름차순(지역 우선 정렬 제거)', nums.every((n, i) => i === 0 || nums[i - 1] <= n), dd.join(' | '));
  await page.evaluate(() => App.resetFilter());
  // 상세 모달 · Esc
  await page.locator('#cards .rcard .btn-primary').first().click();
  check('상세 모달 열림·판정 근거 표시', await page.locator('#detailModal:not(.hidden) .cond-row').count() > 0);
  await page.keyboard.press('Escape');
  check('Esc로 모달 닫힘', await page.locator('#detailModal.hidden').count() === 1);
  // 저장·재방문
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('beconic_match_profile_v2')));
  check('재매칭용 조건은 이 브라우저에만 저장(서버 전송 없음)', saved && saved.company.region === '서울');
  await page.reload();
  check('재방문: 재매칭 배너 + 저장 정보 삭제 버튼', await page.locator('#updateBanner', { hasText: '저장 정보 삭제' }).count() === 1);
  await page.locator('#updateBanner button', { hasText: '다시 매칭하기' }).click();
  await page.waitForSelector('#view-results:not(.hidden)');
  check('재매칭 실행 → 결과 화면', await page.locator('#cards .rcard').count() === cards);
  await page.locator('header .brand').click();
  check('결과를 본 뒤 홈으로 가도 임시저장 배너가 생기지 않음', await page.locator('#draftBanner').count() === 0);
  await page.locator('#updateBanner button', { hasText: '저장 정보 삭제' }).click();
  check('저장 정보 삭제 동작', await page.evaluate(() => localStorage.getItem('beconic_match_profile_v2') === null));
  await page.context().close();
}

// ---------- 3. 중소기업 흐름 · 규모 입력 · 추가정보 ----------
{
  const page = await newPage();
  await page.goto(BASE);
  await page.locator('.persona-card.sme').click();
  await page.locator('.opt', { hasText: '법인사업자' }).click();
  await page.selectOption('#f-region', '경기');
  await page.selectOption('#f-district', '남양주시');
  await page.fill('#f-year', '2024');
  await page.selectOption('#f-industry', 'SW·시스템통합');
  await page.locator('#nextBtn').click();
  check('규모 단계(선택): 다음 버튼 활성', !(await page.locator('#nextBtn').isDisabled()));
  await page.locator('#nextBtn').click();
  await page.waitForSelector('#view-results:not(.hidden)');
  check('남양주 특례보증: 내 시군구 배지', await page.locator('.rcard', { hasText: '남양주시' }).locator('.rgn-badge.t2').count() === 1);
  const hero = await page.locator('.dash-hero').innerText();
  check('대시보드: 합계 성격(단순 합계·실제 수령액과 다름) 명시', /단순 합계/.test(hero) && /실제/.test(hero), hero.replace(/\s+/g, ' ').slice(0, 120));
  const ppVisible = await page.locator('#ppBanner .pp-banner').count();
  if (ppVisible) {
    await page.locator('#ppBanner .btn').click();
    const opts = page.locator('#ppBody .opt');
    check('추가정보 모달: 서버 미전송 안내', /서버로 전송되지 않/.test(await page.locator('#ppModal').innerText()));
    await opts.first().click();
    await page.locator('#ppModal .btn-primary').click();
    check('추가정보 반영 후 재계산(오류 없음)', await page.locator('#ppModal.hidden').count() === 1);
  } else check('추가정보 배너(해당 시)', true, '확인 항목 없음');
  await page.locator('.res-actions .btn', { hasText: '조건 수정' }).click();
  check('조건 수정 → 마지막 입력 단계로', await page.locator('#view-form:not(.hidden)').count() === 1);
  await page.context().close();
}

// ---------- 4. 레드팀 회귀: 공고 데이터 XSS·위험 URL·저장값 변조 ----------
{
  const page = await newPage();
  const evil = {
    _meta: { baseDate: '2026-09-14' },
    programs: [{
      source: 'bizinfo', sourceProgramId: "x');window.__xss=2;//", programName: '<img src=x onerror="window.__xss=1">악성 공고',
      agency: '<b onmouseover=alert(1)>기관</b>', executingAgency: '', category: '<svg onload=alert(2)>', subCategory: '',
      supportPurposes: ['<img src=x onerror=window.__xss=3>'], targetBusinessType: ['예비창업자'], targetRegions: ['전국'], targetIndustries: [],
      applicationStart: '2026-09-01', applicationEnd: '2026-12-31', supportAmountText: '<script>window.__xss=4</script>', supportAmountMax: 1e7,
      supportDescription: '<iframe src="javascript:alert(5)"></iframe>', contact: '<img src=x onerror=window.__xss=6>',
      originalUrl: 'javascript:window.__xss=7', preferenceConditions: ['<img src=x onerror=window.__xss=8>'],
    }],
  };
  await page.route('**/data.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.__MOCK_PROGRAMS__=' + JSON.stringify(evil) + ';' }));
  await page.goto(BASE);
  await page.locator('.persona-card.founder').click();
  await page.selectOption('#f-region', '서울');
  await page.selectOption('#f-industry', 'AI·빅데이터');
  await page.locator('#nextBtn').click();
  await page.waitForSelector('#view-results:not(.hidden)');
  await page.locator('#cards .rcard .btn-primary').first().click();
  await page.waitForTimeout(100);
  const modalOpenHidden = await page.locator('#modalOpenLink.hidden').count();
  await page.keyboard.press('Escape');
  await page.locator('#cards .rcard h3').first().hover();
  await page.waitForTimeout(200);
  check('XSS: 공고명·기관·금액·분야·설명·문의·우대 주입 미실행', await page.evaluate(() => window.__xss === undefined));
  check('XSS: 공고명은 글자로 표시', (await page.locator('#cards .rcard h3').first().innerText()).includes('<img'));
  check('위험 URL(javascript:) 링크 미생성', await page.evaluate(() => ![...document.querySelectorAll('a[href]')].some((a) => /^javascript:/i.test(a.getAttribute('href')))));
  check('공식공고 버튼: 안전한 URL 없으면 숨김', modalOpenHidden === 1);
  await page.context().close();

  const p2 = await newPage();
  await p2.goto(BASE);
  await p2.evaluate(() => {
    localStorage.setItem('beconic_match_draft_v2', JSON.stringify({ persona: 'company', step: 9, company: { companyType: '중소기업', region: '<img src=x onerror=window.__xss=9>', industry: '제조업' } }));
    localStorage.setItem('beconic_match_profile_v2', JSON.stringify({ persona: '__proto__', company: { companyType: '소상인', region: '서울', industry: '<img src=x onerror=window.__xss=10>' }, ts: 'x' }));
  });
  await p2.reload();
  check('변조 저장값: 배너 표시·스크립트 미실행', await p2.locator('#draftBanner').count() === 1 && await p2.evaluate(() => window.__xss === undefined));
  await p2.locator('#draftBanner .btn-primary').click();
  check('변조 임시저장(없는 유형·범위 밖 단계) 이어하기 → 오류 없이 입력 화면', await p2.locator('#view-form:not(.hidden) #nextBtn').count() === 1);
  await p2.context().close();
}

// ---------- 5. 실시간 모드(BFF 응답 모의) ----------
{
  const page = await newPage();
  const many = Array.from({ length: 120 }, (_, i) => ({
    source: i % 2 ? 'bizinfo' : 'kstartup', sourceProgramId: `L${i}`, programName: `실시간 공고 ${i}`, agency: '기관', category: '창업',
    supportPurposes: ['창업'], targetBusinessType: ['예비창업자', '법인', '개인사업자'], targetRegions: ['전국'], targetRegionsInferred: true, targetIndustries: [],
    applicationEnd: '2099-12-31', eligibilityDepth: 'listing', originalUrl: 'https://www.bizinfo.go.kr/x' + i,
  }));
  await page.route('**/.netlify/functions/programs', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mode: 'live', fetchedAt: new Date().toISOString(), sourceCounts: { bizinfo: 60, kstartup: 60 }, enriched: 0, aliveCount: 120, programs: many }) }));
  await page.goto(BASE);
  await page.evaluate(() => { APP_CONFIG.DATA_MODE = 'live'; ProgramProvider._p = null; });
  await page.locator('.persona-card.founder').click();
  await page.selectOption('#f-region', '부산');
  await page.selectOption('#f-industry', '제조업');
  await page.locator('#nextBtn').click();
  await page.waitForSelector('#view-results:not(.hidden)');
  check('실시간: 헤더 배지 "실시간 공고"', (await page.locator('.badge-demo').innerText()) === '실시간 공고');
  check('실시간: 안내에 본문 자격요건 미분석 명시', /세부 자격요건/.test(await page.locator('.data-notice').innerText()));
  const st = await page.locator('#cards .rc-state').allInnerTexts();
  check('실시간 목록 공고는 "추천" 확정 없음(조건부 이하)', st.length > 0 && !st.includes('추천'), [...new Set(st)].join(','));
  check('그룹당 카드 제한 + 더 보기', await page.locator('#cards .rcard').count() === 6 && await page.locator('.more-btn').count() === 1);
  await page.locator('.more-btn').click();
  check('더 보기 → 전체 표시', await page.locator('#cards .rcard').count() === 120);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const printed = await page.locator('#cards .rcard').count();
  check('PDF: 상위 30건만 수록·안내 문구', printed === 30 && /상위 30건/.test(await page.locator('#printNote').innerText()), `${printed}건`);
  await page.pdf({ path: path.join(OUT, 'report-live.pdf'), format: 'A4', printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  check('인쇄 후 화면 목록 복원', await page.locator('#cards .rcard').count() === 120);
  await page.context().close();
}

// ---------- 6. 모바일 375px: 가로 스크롤 없음 ----------
{
  const page = await newPage({ width: 375, height: 812 });
  await page.goto(BASE);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('모바일 홈: 가로 넘침 없음', (await overflow()) <= 0, `${await overflow()}px`);
  await page.locator('.persona-card.sme').click();
  check('모바일 입력: 가로 넘침 없음', (await overflow()) <= 0);
  await page.locator('.opt', { hasText: '개인사업자' }).click();
  await page.selectOption('#f-region', '서울');
  await page.fill('#f-year', '2019');
  await page.selectOption('#f-industry', '제조업');
  await page.locator('#nextBtn').click();
  await page.locator('#nextBtn').click();
  await page.waitForSelector('#view-results:not(.hidden)');
  check('모바일 결과: 가로 넘침 없음(필터 줄바꿈)', (await overflow()) <= 0, `${await overflow()}px`);
  await page.screenshot({ path: path.join(OUT, 'mobile-results.png'), fullPage: false });
  await page.context().close();
}

// ---------- 7. PDF (DEMO) ----------
{
  const page = await newPage();
  await page.goto(BASE);
  await page.locator('.persona-card.retail').click();
  await page.locator('.opt', { hasText: '개인사업자' }).click();
  await page.selectOption('#f-region', '서울');
  await page.fill('#f-year', '2023');
  await page.selectOption('#f-industry', '음식점업(F&B)');
  await page.locator('#nextBtn').click();
  await page.waitForSelector('#view-results:not(.hidden)');
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const f = path.join(OUT, 'report-demo.pdf');
  await page.pdf({ path: f, format: 'A4', printBackground: true });
  check('A4 PDF 생성(DEMO 소상인)', existsSync(f));
  check('인쇄 화면: 머리말·연락처 꼬리말 표시', await page.locator('.print-header').isVisible() && await page.locator('.print-footer').isVisible());
  await page.context().close();
}

// ---------- 8. 데모 단일본(file://) ----------
{
  const demoDir = path.join(here, '..', 'dist-demo');
  const file = existsSync(demoDir) ? readdirSync(demoDir).find((f) => f.endsWith('.html')) : null;
  if (!file) check('데모 단일본 존재(npm run build:demo)', false);
  else {
    const page = await newPage();
    const req = [];
    page.on('request', (r) => { if (!/^(data|file):/.test(r.url()) && !/jsdelivr/.test(r.url())) req.push(r.url()); });
    await page.goto(pathToFileURL(path.join(demoDir, file)).href);
    await page.locator('.persona-card.founder').click();
    await page.selectOption('#f-region', '대전');
    await page.selectOption('#f-industry', '바이오·제약');
    await page.locator('#nextBtn').click();
    await page.waitForSelector('#view-results:not(.hidden)');
    check('데모 단일본: 파일로 열어 결과까지 동작', await page.locator('#cards .rcard').count() > 0);
    check('데모 단일본: 외부 데이터 요청 없음(폰트 제외)', req.length === 0, req.join(','));
    check('데모 단일본: 예시 날짜가 오늘 기준으로 이동(대부분 접수 중)', await page.evaluate(() => App.dash.active >= App.matched.length - 1), String(await page.evaluate(() => `${App.dash.active}/${App.matched.length}`)));
    await page.context().close();
  }
}

check('페이지 오류·콘솔 오류·alert 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.pass);
writeFileSync(path.join(OUT, 'qa-result.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
