// BECONIC 창업 준비 가이드 QA — 실제 Chromium으로 데이터 정합성·기준일·사용자 흐름·저장·보안·웹/앱 화면을 확인한다.
// 실행: npm run build && (cd dist && python3 -m http.server 8795) 후 node tests/qa.mjs [baseUrl]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:8795/';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
const newPage = async (opt = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opt });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|Framing 'https:\/\/app\.netlify\.com\//.test(m.text())) errors.push(m.text()); });
  return p;
};
const page = await newPage();
await page.goto(BASE);

// 1. 데이터 정합성
{
  const r = await page.evaluate(() => {
    const D = window.PS_DATA, nts = {}; D.nts.forEach((x) => (nts[x[0]] = nts[x[0]] || []).push(x[3]));
    const ind = D.industries, bad = [], badLink = [];
    ind.forEach((i) => { if (/^\d{6}$/.test(i.nts) && !(nts[i.nts] || []).includes(String(i.ksic))) bad.push(i.id); });
    ind.forEach((i) => [...(i.linkedOfficial || []), ...(i.relatedCodes || [])].forEach((l) => { if (!(nts[l.nts] || []).includes(String(l.ksic))) badLink.push(i.id + ':' + l.nts); }));
    const req = ['id', 'name', 'group', 'summary', 'docs', 'license', 'licenseProcess', 'taxPoints', 'supportPoints', 'askClient', 'pitfalls'];
    const miss = ind.filter((i) => req.some((k) => !i[k] || (Array.isArray(i[k]) && !i[k].length))).map((i) => i.id);
    const ids = new Set(ind.map((i) => i.id));
    return { n: ind.length, codes: D.nts.length, bad, badLink, miss, dupId: ids.size !== ind.length, groups: D.groupOrder.every((g) => D.groupMeta[g]) };
  });
  check('업종 가이드 64개·업종코드 행 1,785개', r.n === 64 && r.codes === 1785, `${r.n}/${r.codes}`);
  check('가이드 대표 코드(국세청↔KSIC)가 연계표와 일치', r.bad.length === 0, r.bad.join(','));
  check('함께 등록 코드(국세청↔KSIC)가 연계표와 일치(원본 오류 9건 수정)', r.badLink.length === 0, r.badLink.join(','));
  check('필수 항목(서류·인허가·순서·세금·지원·질문·주의) 누락 없음', r.miss.length === 0, r.miss.join(','));
  check('업종 id 중복 없음·업태 아이콘 정의', !r.dupId && r.groups);
  const stale = await page.evaluate(() => JSON.stringify(window.PS_DATA.industries).match(/8,000만원 미만|과밀억제권역 외 창업/g));
  check('낡은 세제 기준 없음(간이과세 8,000만원·과밀억제권역 외 창업)', !stale, String(stale));
  check('가구 제조에 식품 도매 코드 연결 오류 제거', await page.evaluate(() => !window.PS.BY_ID.furniture_mfg.linkedOfficial.some((l) => /식품/.test(l.name))));
}

// 2. 진단 → 가이드(유틸) 전환·기준일
{
  const body = await page.locator('body').innerText();
  check('홈: 진단·점수·등급 표현 없음', !/진단|점수|등급|평가 결과/.test(body));
  check('홈: 자료 기준일 2026.11.19 표기(헤더·본문)', (body.match(/2026\.11\.19/g) || []).length >= 2);
  check('바닥글: 상담 번호 02-6124-5960(구 번호 없음)', body.includes('02-6124-5960') && !body.includes('070-4103'));
  const uniq = await page.evaluate(() => window.PS.NTS_UNIQUE);
  const og = await page.evaluate(() => document.querySelector('meta[property="og:description"]').content);
  check('업종코드 개수 = 고유 코드 수(화면·OG 일치, 행 수 1,785와 구분)', uniq === 1612 && body.includes('1,612개') && og.includes('1,612개'), `${uniq}`);
  check('홈: 가이드 수 = 실제 업종 수(하드코딩 17·30개 제거)', body.includes('64개 업종 가이드') && !/17개 주요|전체 30개/.test(body));
  await page.goto(BASE + '#/guide/cafe');
  const g = await page.locator('main').innerText();
  check('가이드: 기준일·세제 기준·업종코드 귀속연도 표기', g.includes('2026.11.19') && g.includes('2026.01') && g.includes('2025년 귀속'));
  check('가이드: 검수 상태 정직 표기(검수 전)', g.includes('검수 전'));
  check('가이드: 진단 표현 없음', !/진단|점수|등급/.test(g.replace(/진단·평가를 하지 않아요/, '').replace(/건강진단/g, '')));
  check('세제 점검 시점 경과 판정: 2026-12 정상, 2027-01부터 경고', await page.evaluate(() => !window.PS.taxExpired(new Date(2026, 11, 31)) && window.PS.taxExpired(new Date(2027, 0, 1))));
}

// 3. 흐름: 홈 검색 → 가이드, 업태 → 업종, 뒤로가기
{
  await page.goto(BASE);
  await page.fill('#hq', '스마트스토어');
  check('검색 동의어: 스마트스토어 → 전자상거래 가이드', (await page.locator('#homeResults').innerText()).includes('온라인 쇼핑몰'));
  await page.fill('#hq', '커피');
  await page.locator('#homeResults a.item').first().click();
  await page.waitForTimeout(200);
  check('검색 결과 → 처음이면 2단계(내 상황)로 이동', page.url().includes('#/me?next='), page.url());
  await page.goBack(); await page.waitForTimeout(200);
  check('뒤로가기 → 홈', (await page.locator('main').innerText()).includes('업태에서 고르기'));
  await page.click('a.gcard >> nth=0'); await page.waitForTimeout(150);
  check('업태 카드 → 업종 목록', page.url().includes('#/g/') && (await page.locator('.item').count()) === 10);
  await page.goto(BASE + '#/guide/없는업종');
  check('잘못된 주소 → 홈으로(오류 없음)', (await page.locator('main').innerText()).includes('업태에서 고르기'));
}

// 4. 체크리스트 저장·진행률·지금 할 일
{
  await page.goto(BASE + '#/guide/cafe'); await page.evaluate(() => localStorage.clear()); await page.reload();
  const first = await page.locator('.next .nt').innerText();
  check('지금 할 일 = 진행 순서 1단계', first.includes('위생교육'));
  await page.click('[data-next]');
  await page.click('[data-chk="d0"]');
  const pr = await page.evaluate(() => window.PS.progressOf('cafe'));
  check('체크 2개 → 진행률 반영', pr.done === 2 && pr.pct === Math.round(2 / pr.total * 100), JSON.stringify(pr));
  await page.reload();
  check('새로고침 후 체크 유지(이 기기 저장)', (await page.locator('[data-chk="s0"]').getAttribute('aria-checked')) === 'true' && (await page.locator('[data-chk="d0"]').getAttribute('aria-checked')) === 'true');
  check('좌측 내비 개수 표시 갱신(순서 1/4)', (await page.locator('.lnav a[data-sec="steps"] em').innerText()) === '1/4');
  await page.goto(BASE + '#/guide/cafe/finish'); await page.waitForTimeout(100);
  await page.fill('#memo', '건축물 용도 확인');
  await page.reload();
  check('메모 저장', (await page.inputValue('#memo')) === '건축물 용도 확인');
  check('체크박스 접근성(role=checkbox·aria-checked)', (await page.locator('.chk[role="checkbox"]').count()) > 5);
}

// 5. 내 상황 → 맞춤 안내
{
  await page.goto(BASE + '#/me?next=cafe');
  for (const v of ['u34', '서울', 'home', 'lt1']) await page.click(`.opt[data-v="${v}"]`);
  await page.fill('#open', '2027-03-02');
  await page.click('#meSave'); await page.waitForTimeout(200);
  const t = await page.locator('main').innerText();
  check('저장 후 가이드로 복귀', page.url().includes('#/guide/cafe'));
  check('청년(만 34세 이하) 세액감면 안내', t.includes('만 15~34세'));
  check('수도권 지역 감면율 확인 안내', t.includes('수도권'));
  check('음식점 + 자택 → 시설 기준 경고', t.includes('자택으로는 영업신고'));
  check('간이과세 1억400만원 안내', t.includes('1억400만원'));
  check('개업일 +20일 사업자등록 기한(2027.03.22)', t.includes('2027.03.22'));
  check('지원사업 MATCH 링크: 예비창업자·업종·지역 전달', await page.evaluate(() => { const u = new URL(window.PS.matchUrl(window.PS.BY_ID.cafe)); return u.searchParams.get('t') === 'founder' && u.searchParams.get('i') === '음식점업(F&B)' && u.searchParams.get('r') === '서울'; }));
}

// 6. 업종코드 찾기
{
  await page.goto(BASE + '#/search?q=552303');
  const t = await page.locator('#cres').innerText();
  check('코드 숫자 검색 → 커피 전문점', t.includes('커피 전문점'));
  check('가이드 있는 코드에 "가이드" 연결', (await page.locator('#cres a[href="#/start/cafe"]').count()) > 0);
  await page.fill('#cq', '화장품');
  check('업종명 검색 + 가이드 업종 함께 표시', (await page.locator('#cres').innerText()).includes('준비 가이드가 있는 업종'));
  await page.click('.filters [data-g="제조업"]');
  check('대분류 필터 적용(주소 유지)', page.url().includes('g=') && page.url().includes('q='));
  await page.fill('#cq', '없는업종xyz');
  check('결과 없음 안내', (await page.locator('#cres').innerText()).includes('찾는 코드가 없어요'));
}

// 7. 보안·견고성
{
  await page.goto(BASE);
  await page.fill('#hq', '<img src=x onerror=window.__x=1>');
  await page.waitForTimeout(100);
  check('검색어 HTML 주입 차단', !(await page.evaluate(() => window.__x)));
  await page.evaluate(() => localStorage.setItem('beconic_prestartup_v1', JSON.stringify({ me: { age: '<script>', region: '평양', open: 'x' }, prog: { __proto__: { d: { 0: true } }, cafe: { d: { 0: true, abc: true, 1: 'yes' }, s: {} } }, memo: { cafe: 1 }, recent: ['nope', 'cafe'] })));
  await page.reload();
  const st = await page.evaluate(() => JSON.parse(JSON.stringify(window.PS.S)));
  check('저장값 검증(허용 값만, 이상한 키·값 무시)', Object.keys(st.me).length === 0 && JSON.stringify(st.prog.cafe.d) === '{"0":true}' && !st.memo.cafe && st.recent.join() === 'cafe', JSON.stringify(st));
  await page.evaluate(() => localStorage.setItem('beconic_prestartup_v1', '{broken'));
  await page.reload();
  check('깨진 저장값에도 화면 정상', (await page.locator('.gcard').count()) === 14);
}

// 8. 웹·앱 화면(가로 넘침·터치 영역·하단 탭·좌측 내비)
for (const [w, h] of [[320, 640], [375, 812], [768, 1024], [1280, 900]]) {
  const p = await newPage({ viewport: { width: w, height: h } });
  let over = 0, small = [];
  for (const u of ['', '#/g/' + encodeURIComponent('음식점업'), '#/guide/cosmetic_mfg', '#/search?q=화장품', '#/me', '#/my']) {
    await p.goto(BASE + u); await p.waitForTimeout(150);
    over = Math.max(over, await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    small.push(...await p.evaluate(() => [...document.querySelectorAll('button, a.btn, .tabbar a, .nav a, .chk, .filters button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 36; }).map((e) => e.textContent.trim().slice(0, 12))));
  }
  check(`${w}px: 가로 넘침 없음`, over <= 0, `${over}px`);
  check(`${w}px: 버튼 높이 36px 이상`, small.length === 0, small.slice(0, 5).join('|'));
  await p.goto(BASE + '#/guide/cafe'); await p.waitForTimeout(150);
  const vis = await p.evaluate(() => { const d = (q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== 'none'; }; return { tab: d('.tabbar'), lnav: d('.lnav'), jstep: d('.jstep'), nav: d('.stepnav'), fixed: getComputedStyle(document.querySelector('.stepnav')).position === 'fixed' }; });
  if (w < 768) check(`${w}px: 앱 화면 = 단계 표시 + 하단 고정 이전/다음(탭 바 숨김)`, vis.jstep && vis.nav && vis.fixed && !vis.tab && !vis.lnav, JSON.stringify(vis));
  else if (w < 1024) check(`${w}px: 태블릿 = 상단 메뉴 + 단계 표시 + 이전/다음`, vis.jstep && vis.nav && !vis.tab && !vis.lnav, JSON.stringify(vis));
  else check(`${w}px: 웹 = 단계 표시 + 좌측 단계별 목차 + 이전/다음`, vis.jstep && vis.lnav && vis.nav && !vis.tab, JSON.stringify(vis));
  await p.context().close();
}

// 9. 좌측 목차 스크롤 연동
{
  await page.goto(BASE + '#/guide/cafe/benefit'); await page.waitForTimeout(200);
  await page.click('.lnav a[data-sec="tax"]'); await page.waitForTimeout(900);
  check('좌측 목차(4단계) 클릭 → 세금 혜택으로 이동·활성 표시', (await page.locator('.lnav a.on').innerText()).includes('세금') && page.url().endsWith('#/guide/cafe/benefit'));
}

// 10. 앱 안 브라우저(카카오톡) → PDF 대신 요약 복사
{
  const p = await newPage({ userAgent: 'Mozilla/5.0 (iPhone) KAKAOTALK 10.0', viewport: { width: 375, height: 812 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await p.goto(BASE + '#/guide/cafe');
  check('카카오톡: "요약 복사" 버튼', (await p.locator('[data-act="print"]').first().innerText()).includes('요약 복사'));
  const sum = await p.evaluate(() => window.PS.summary('cafe'));
  check('요약: 기준일·코드·체크리스트·다시 보기 링크', sum.includes('2026.11.19') && sum.includes('552303') && sum.includes('⬜') && sum.includes('#/guide/cafe'));
  await p.context().close();
}

// 11. 인쇄(A4) — 한눈에 보기 요약·남은 할 일·쪽 번호·사이트 주소·빈 메모 줄·연락처
{
  await page.goto(BASE + '#/guide/cafe');
  await page.evaluate(() => localStorage.setItem('beconic_prestartup_v1', JSON.stringify({ me: { age: 'u34', open: '2027-03-02' }, prog: { cafe: { s: { 0: true }, d: { 0: true } } }, recent: ['cafe'] })));
  await page.reload(); await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => ({ head: getComputedStyle(document.querySelector('.phead')).display, sum: getComputedStyle(document.querySelector('.psum')).display, top: getComputedStyle(document.querySelector('.top')).display, lnav: getComputedStyle(document.querySelector('.lnav')).display, memoTa: getComputedStyle(document.querySelector('#memo')).display, sumText: document.querySelector('.psum').innerText, url: getComputedStyle(document.querySelector('.purl')).display, contact: document.querySelector('.pcontact').innerText }));
  check('인쇄: 머리말(기준일) 표시, 상단·좌측 내비 숨김', pr.head !== 'none' && pr.top === 'none' && pr.lnav === 'none');
  check('인쇄: 한눈에 보기(업종코드·진행률·인허가·사업자등록 기한·남은 할 일)', pr.sum === 'block' && /552303/.test(pr.sumText) && /진행률/.test(pr.sumText) && /2027\.03\.22까지/.test(pr.sumText) && /남은 할 일 \d+개/.test(pr.sumText) && !/\[순서\] 위생교육/.test(pr.sumText));
  check('인쇄: 빈 메모는 예시 문구 대신 쓰기 줄', pr.memoTa === 'none' && (await page.locator('.pmemo i').count()) === 4);
  check('인쇄: 신청 사이트 주소 표시·전문가 연락처', pr.url === 'block' && pr.contact.includes('02-6124-5960'));
  const pdf = await page.pdf({ format: 'A4' });
  check('인쇄: A4 PDF 생성', pdf.length > 20000, `${Math.round(pdf.length / 1024)}KB`);
  const css = await page.evaluate(() => [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules].map((r) => r.cssText); } catch { return []; } }).join(' '));
  check('인쇄: 쪽 번호·바닥글(@page 여백 상자)', /counter\(pages\)/.test(css));
  await page.emulateMedia({ media: 'screen' });
  const title = await page.evaluate(() => { let t = ''; const o = window.print; window.print = () => { t = document.title; }; document.querySelector('[data-act="print"]').click(); window.print = o; return t; });
  check('PDF 파일 이름 = 창업준비체크리스트_업종_날짜', /^창업준비체크리스트_카페커피전문점_\d{8}$/.test(title), title);
}

// 11-2. 사용자 흐름: 홈 이용 순서 → 가이드 → 내 상황 수정 → 저장 후 맞춤 안내로 복귀
{
  await page.goto(BASE);
  check('홈: 5단계 표시, 1단계(업종 고르기) 현재', (await page.locator('.jstep li').count()) === 5 && (await page.locator('.jstep li.on').innerText()).includes('업종'));
  await page.goto(BASE + '#/guide/cafe'); await page.waitForTimeout(100);
  check('가이드 목차에 "맞춤 안내" 포함', (await page.locator('.lnav a[data-sec="me"]').count()) === 1);
  await page.click('#sec-me a[href^="#/me"]'); await page.waitForTimeout(150);
  check('내 상황 화면 = 2단계 표시·미리보기·건너뛰기', (await page.locator('.jstep li.on').innerText()).includes('내 상황') && (await page.locator('#mePreview').innerText()).includes('카페') && (await page.locator('#meSkip').count()) === 1);
  await page.click('.opt[data-v="home"]');
  check('미리보기: 고르는 즉시 안내 개수 갱신', /맞춤 안내 \d+개/.test(await page.locator('#mePreview').innerText()));
  await page.click('#meClear');
  check('선택 초기화는 저장 전까지 반영 안 함', await page.evaluate(() => window.PS.S.me.age === 'u34'));
  await page.click('.opt[data-v="home"]');
  await page.click('#meSave'); await page.waitForTimeout(300);
  const top = await page.evaluate(() => Math.round(document.getElementById('sec-me').getBoundingClientRect().top));
  check('저장 → 3단계(준비 체크)의 맞춤 안내로 이동(강조)', page.url().endsWith('#/guide/cafe/prepare') && top < 400 && (await page.locator('#sec-me .chip').count()) >= 1, `top=${top}`);
  check('맞춤 안내에 선택한 상황 칩 표시', (await page.locator('#sec-me .mechips').innerText()).includes('자택'));
  await page.click('.stepnav .btn-primary'); await page.waitForTimeout(150);
  check('다음 → 4단계(혜택·지원): 업종코드·세금·지원사업만 표시', page.url().endsWith('/benefit') && await page.isVisible('#sec-tax') && !(await page.isVisible('#sec-docs')) && (await page.locator('.jstep li.on').innerText()).includes('혜택'));
  await page.click('.stepnav .btn-primary'); await page.waitForTimeout(150);
  check('다음 → 5단계(저장·마무리): 한눈에 보기 + PDF·지원사업·전문가 3가지', page.url().endsWith('/finish') && await page.isVisible('.psum-screen') && (await page.locator('#sec-finish .fcard').count()) === 3);
  check('이미 거친 단계는 ✓ 표시(1·2·4단계)', (await page.locator('.jstep li.done').count()) >= 3);
  await page.click('.stepnav .btn-gray'); await page.waitForTimeout(150);
  check('이전 → 4단계', page.url().endsWith('/benefit'));
  await page.goBack(); await page.goBack(); await page.goBack(); await page.goBack(); await page.waitForTimeout(150);
  check('뒤로가기 → 내 상황 화면', page.url().includes('#/me'));
}

// 11-3. 단계 진입 규칙·인쇄는 전체
{
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.goto(BASE + '#/start/cafe'); await page.waitForTimeout(150);
  check('처음 업종 선택 → 2단계(내 상황)', page.url().includes('#/me?next=cafe'));
  await page.click('#meSkip'); await page.waitForTimeout(150);
  check('건너뛰기 → 3단계(준비 체크)', page.url().endsWith('#/guide/cafe/prepare'));
  await page.goto(BASE + '#/start/ecommerce'); await page.waitForTimeout(150);
  check('한 번 건너뛴 뒤 다른 업종 → 바로 3단계', page.url().endsWith('#/guide/ecommerce/prepare'));
  await page.goto(BASE + '#/guide/cafe/prepare'); await page.emulateMedia({ media: 'print' });
  const all = await page.evaluate(() => ['tax', 'code', 'support', 'sites', 'memo', 'about', 'docs', 'steps'].every((k) => getComputedStyle(document.getElementById('sec-' + k)).display !== 'none') && getComputedStyle(document.querySelector('.jstep')).display === 'none');
  check('인쇄: 어느 단계에서 저장해도 전체 섹션 포함, 단계 표시는 숨김', all);
  await page.emulateMedia({ media: 'screen' });
}

// 12. 앱(PWA) 구성
{
  const m = await page.evaluate(async () => (await fetch('assets/manifest.webmanifest')).json());
  check('매니페스트: standalone·아이콘 192/512/maskable', m.display === 'standalone' && ['192x192', '512x512'].every((s) => m.icons.some((i) => i.sizes === s)) && m.icons.some((i) => i.purpose === 'maskable'));
  const ok = await page.evaluate(async () => (await Promise.all(['sw.js', 'assets/icon-192.png', 'assets/icon-512-maskable.png', 'assets/og-pre-startup-1200x630.jpg'].map((u) => fetch(u)))).every((r) => r.ok));
  check('서비스워커·아이콘·OG 이미지 배포 포함', ok);
}

check('페이지 오류 0', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const fail = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - fail}/${results.length} 통과`);
process.exit(fail ? 1 : 0);
