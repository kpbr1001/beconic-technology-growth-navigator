// E2E QA — v2.0 §15 E01~E15 + 개인정보·CSP·뷰포트. 사용: node tests/qa.mjs [http://127.0.0.1:8797/]
// 빌드본(dist)을 정적 서버로 띄운 뒤 실행. netlify.toml의 CSP 헤더를 응답에 주입해 위반을 감지한다.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8797/';
const CSP = readFileSync(join(ROOT, 'netlify.toml'), 'utf8').match(/Content-Security-Policy = "([^"]+)"/)[1];
const CANONICAL = 'https://beconic-diagnosis-certification.netlify.app/';
const results = [];
let failed = 0;
const check = (id, ok, detail = '') => { results.push({ id, ok, detail }); if (!ok) failed += 1; console.log(`${ok ? '✅' : '❌'} ${id}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch();

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page._errs = []; page._ext = []; page._csp = [];
  page.on('console', (m) => { if (m.type() === 'error') page._errs.push(m.text()); });
  page.on('pageerror', (e) => page._errs.push(`PAGEERR ${e.message}`));
  page.on('dialog', (d) => { page._dialog = d.message(); d.accept(); });
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data')) page._ext.push(r.url()); });
  await page.route('**/*', async (route) => {
    const resp = await route.fetch();
    const headers = { ...resp.headers() };
    if ((headers['content-type'] || '').includes('text/html')) headers['content-security-policy'] = CSP;
    await route.fulfill({ response: resp, headers });
  });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  if (opts.clock) await page.clock.setFixedTime(new Date(opts.clock));
  await page.goto(BASE + (opts.hash || ''));
  await page.waitForFunction(() => document.getElementById('app').getAttribute('aria-busy') === 'false');
  return page;
}
const qids = (page) => page.$$eval('.q[data-qid]:not([hidden])', (els) => els.map((e) => e.dataset.qid));
async function submit(page) { await page.click('form[data-form="step"] button[type=submit]'); await page.waitForTimeout(80); }
async function choose(page, name, value) { await page.check(`input[name="${name}"][value="${value}"]`); }
async function fillNum(page, id, v) { await page.fill(`#q-${id}`, String(v)); await page.dispatchEvent(`#q-${id}`, 'change'); }

async function aFlowToProfile(page, { purposes = ['rnd'], target = 'company', markets = ['KR'] } = {}) {
  await page.click('a[data-act="start-a"]'); await page.waitForSelector('form[data-step="purpose"]');
  for (const p of purposes) await choose(page, 'purposes', p);
  await choose(page, 'target', target);
  for (const m of markets) await choose(page, 'markets', m);
  await submit(page); await page.waitForSelector('form[data-step="profile"]');
}
async function profileCorp(page) {
  await choose(page, 'biz_status', 'corporation');
  await page.fill('#q-founded_on', '2020-03-02'); await page.dispatchEvent('#q-founded_on', 'change');
  await choose(page, 'converted_from_individual', 'no'); await choose(page, 'suspended_period', 'no');
  await choose(page, 'is_sme', 'yes'); await choose(page, 'company_size', 'small'); await choose(page, 'industry', 'software_582');
}
const badgeOf = (page, id) => page.$eval(`#res-${id} .card-head > .badge`, (e) => e.textContent.trim());

// ── E01 A경로 ──
{
  const p = await newPage();
  await aFlowToProfile(p, { purposes: ['rnd', 'finance'] });
  const profileQ = await qids(p);
  await profileCorp(p); await submit(p);
  await p.waitForSelector('[data-act="go-questions"]');
  const sel = await p.evaluate(() => window.__beconic.state.selected);
  await p.click('[data-act="go-questions"]'); await p.waitForSelector('form[data-step="questions"]');
  const schemeQ = await qids(p);
  const dup = schemeQ.filter((q) => profileQ.includes(q));
  await submit(p); await p.waitForSelector('#result-title');
  check('E01 A경로 기업정보→추천→상세진단→결과', sel.length > 0 && (await p.$$('.scheme-res')).length === sel.length, `추천 선택 ${sel.join(',')}`);
  check('E01b 기본정보 질문이 인증별 질문에 중복 없음', dup.length === 0, dup.join(','));
  check('E01c 콘솔 오류 0', p._errs.length === 0, p._errs.join(' | '));
  check('PRIV-01 외부 도메인 요청 0', p._ext.length === 0, p._ext.slice(0, 3).join(', '));
  const storage = await p.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, idb: typeof indexedDB, cookie: document.cookie }));
  check('PRIV-02 localStorage·sessionStorage·쿠키 저장 0', storage.l === 0 && storage.s === 0 && storage.cookie === '', JSON.stringify(storage));
  check('PRIV-03 URL에 입력값 없음', !/biz_status|2020-03-02|software/.test(p.url()), p.url());
  check('SEC-01 CSP 위반 0', (await p.evaluate(() => window.__csp)).length === 0, (await p.evaluate(() => window.__csp)).join(' | '));
  // E03 수정·뒤로가기
  await p.click('[data-act="edit"] >> nth=0'); await p.waitForSelector('form[data-step="purpose"]');
  const kept = await p.isChecked('input[name="purposes"][value="finance"]');
  await p.goBack(); await p.waitForSelector('#result-title');
  check('E03 입력 수정 시 기존 답 유지·뒤로가기로 결과 복귀', kept);
  await p.context().close();
}

// ── E02 B경로 = A경로 동일 엔진 ──
{
  const pA = await newPage();
  await aFlowToProfile(pA, { purposes: ['finance'] }); await profileCorp(pA); await submit(pA);
  await pA.waitForSelector('[data-act="go-questions"]');
  await pA.evaluate(() => document.querySelectorAll('[data-act="select-toggle"]:checked').forEach((c) => c.click()));
  await pA.click('[data-act="select-toggle"][data-id="VEN"]');
  await pA.click('[data-act="go-questions"]'); await pA.waitForSelector('form[data-step="questions"]');
  await choose(pA, 'ven_excluded_industry', 'no'); await fillNum(pA, 'ven_invest_total', 1000); await fillNum(pA, 'ven_capital', 5000); await choose(pA, 'ven_qualified_investor', 'yes');
  await submit(pA); await pA.waitForSelector('#result-title');
  const a = await badgeOf(pA, 'VEN');

  const pB = await newPage({ hash: '#/explore' });
  await pB.fill('#ex-q', '벤처'); await pB.waitForTimeout(250);
  await pB.click('[data-act="diagnose"][data-id="VEN"]'); await pB.waitForSelector('form[data-step="profile"]');
  await profileCorp(pB); await submit(pB); await pB.waitForSelector('form[data-step="questions"]');
  await choose(pB, 'ven_excluded_industry', 'no'); await fillNum(pB, 'ven_invest_total', 1000); await fillNum(pB, 'ven_capital', 5000); await choose(pB, 'ven_qualified_investor', 'yes');
  await submit(pB); await pB.waitForSelector('#result-title');
  const b = await badgeOf(pB, 'VEN');
  check('E02 B경로(인증 먼저)와 A경로 결과 동일', a === b, `${a} / ${b}`);
  // E06 벤처 대체경로: 투자유형 미충족 + 혁신성장 기본요건 → 전체 미충족 금지
  check('E06 벤처 투자유형 FAIL이어도 전체 미충족 아님', a.includes('기본요건 확인') && !a.includes('미충족'), a);
  const invFail = await pB.$eval('#res-VEN', (e) => e.textContent.includes('기본요건 미충족'));
  check('E06b 투자유형 자체는 미충족으로 표시', invFail);
  await pA.context().close(); await pB.context().close();
}

// ── E04 검색·탭 ──
{
  const p = await newPage({ hash: '#/explore' });
  const names = () => p.$$eval('#ex-results .card-title', (e) => e.map((x) => x.textContent));
  await p.click('[data-act="tab"][data-group="domestic"]');
  const dom = await names();
  await p.click('[data-act="tab"][data-group="international"]');
  const intl = await names();
  await p.fill('#ex-q', 'ISO'); await p.waitForTimeout(250);
  const iso = await names();
  await p.click('[data-act="tab"][data-group="all"]'); await p.fill('#ex-q', '이노비스'); await p.waitForTimeout(250);
  const sug = await p.textContent('#ex-results');
  await p.fill('#ex-q', '미국 의료기기'); await p.waitForTimeout(250);
  const fda = await names();
  check('E04 국내 탭에 ISO 없음·해외 탭에 벤처 없음', !dom.some((n) => n.includes('ISO')) && !intl.some((n) => n.includes('벤처')));
  check('E04b ISO 검색 6종', iso.filter((n) => n.includes('ISO')).length === 6, iso.join(','));
  check('E04c 0건 안내 + 등록 별칭 제안', sug.includes('찾지 못했습니다') && sug.includes('이노비즈'));
  check('E04d 목적어 검색(미국 의료기기→FDA)', fda.some((n) => n.includes('FDA')), fda.join(','));
  await p.click('[data-act="compare-toggle"][data-id="US-FDA-DEV"]');
  await p.click('a[href="#/compare"]'); await p.waitForSelector('table.cmp');
  check('E04e 비교 화면 동작', (await p.$$('table.cmp thead th')).length === 2);
  await p.context().close();
}

// ── E05 모름 다수 → 거짓 미충족 금지 ──
{
  const p = await newPage({ hash: '#/explore' });
  for (const id of ['MAIN', 'RNDI']) { await p.goto(`${BASE}#/scheme/${id}`); await p.click('[data-act="diagnose"]'); await p.waitForTimeout(100); }
  await p.waitForSelector('form[data-step="profile"]');
  await choose(p, 'biz_status', 'corporation'); await submit(p);
  await p.waitForSelector('form[data-step="questions"]');
  await p.$$eval('input[type="radio"][value="unknown"]', (els) => els.forEach((e) => e.click()));
  await p.$$eval('input[data-unknown]', (els) => els.forEach((e) => { if (!e.checked) e.click(); }));
  await submit(p); await p.waitForSelector('#result-title');
  const txt = await p.textContent('.summary');
  check('E05 모름 다수 → 미충족 표시 없음(추가 확인 필요)', !txt.includes('미충족') && txt.includes('추가 확인 필요'), txt.replace(/\s+/g, ' ').slice(0, 80));
  await p.context().close();
}

// ── E07 해외 제품 정보 불명 ──
{
  const p = await newPage();
  await aFlowToProfile(p, { purposes: ['export'], target: 'product', markets: ['EU', 'US'] });
  await choose(p, 'biz_status', 'corporation'); await submit(p);
  await p.waitForSelector('form[data-step="export"]');
  await choose(p, 'product_categories', 'unknown'); await submit(p);
  await p.waitForSelector('.view h1');
  const recText = await p.textContent('.view');
  await p.evaluate(() => document.querySelectorAll('[data-act="select-toggle"]:checked').forEach((c) => c.click()));
  await p.goto(`${BASE}#/scheme/EU-CE`); await p.click('[data-act="diagnose"]'); await p.waitForTimeout(100);
  await p.goto(`${BASE}#/scheme/US-FDA-DEV`); await p.click('[data-act="diagnose"]'); await p.waitForTimeout(100);
  await p.goto(`${BASE}#/result`); await p.waitForSelector('#result-title');
  const t = await p.textContent('main');
  const bad = /(필수입니다|반드시 받아야|의무입니다|FDA 승인 대상입니다|CE 인증이 필요합니다)/.test(t);
  check('E07 CE·FDA 의무·승인 확정 표현 없음 + 적용 규정 확인 필요 표시', !bad && (t.match(/적용 규정 확인 필요/g) || []).length >= 2);
  check('E07b 제품 미상이면 추천을 확정하지 않음(판단 어려움 표시)', recText.includes('현재 정보로 판단 어려움'));
  await p.context().close();
}

// ── E08 증빙 자가신고 ──
{
  const p = await newPage({ hash: '#/scheme/INNO' });
  await p.click('[data-act="diagnose"]'); await p.waitForSelector('form[data-step="profile"]');
  await profileCorp(p); await submit(p); await submit(p); await p.waitForSelector('#result-title');
  await p.goto(`${BASE}#/docs`); await p.waitForSelector('.doc');
  await p.$$eval('.seg input[value="have"]', (els) => els.forEach((e) => e.click()));
  const cnt = await p.textContent('[id^="cnt-"]');
  await p.goto(`${BASE}#/result`); await p.waitForSelector('#result-title');
  const t = await p.textContent('main');
  check('E08 자가응답은 "있음"으로만 집계, 검증 완료 표현 없음', cnt.includes('있음') && !/(검증 완료|확인 완료|검수 완료)/.test(t), cnt);
  await p.context().close();
}

// ── E09 반응형 320~1440 ──
{
  const widths = [320, 360, 390, 430, 768, 1024, 1440];
  const bad = [];
  for (const w of widths) {
    const p = await newPage({ w, h: 900 });
    for (const hash of ['', '#/explore', '#/scheme/VEN', '#/about-data']) {
      await p.goto(BASE + hash); await p.waitForTimeout(120);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) bad.push(`${w}px ${hash || 'home'} scrollWidth ${sw}`);
    }
    await p.goto(BASE); await aFlowToProfile(p); await profileCorp(p); await submit(p);
    await p.click('[data-act="go-questions"]'); await p.waitForSelector('form[data-step="questions"]');
    let sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) bad.push(`${w}px questions ${sw}`);
    await submit(p); await p.waitForSelector('#result-title');
    sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) bad.push(`${w}px result ${sw}`);
    await p.goto(`${BASE}#/docs`); await p.waitForTimeout(120); sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) bad.push(`${w}px docs ${sw}`);
    await p.goto(`${BASE}#/roadmap`); await p.waitForTimeout(120); sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) bad.push(`${w}px roadmap ${sw}`);
    // 작은 터치영역(보이는 버튼·옵션 44px 미만)
    if (w <= 430) {
      await p.goto(`${BASE}#/result`); await p.waitForSelector('#result-title');
      const small = await p.$$eval('main .btn, main .opt, main .tab, main summary', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map((e) => e.textContent.trim().slice(0, 12)));
      if (small.length) bad.push(`${w}px 터치영역<40: ${small.slice(0, 3).join('/')}`);
    }
    await p.context().close();
  }
  check('E09 320~1440px 7종 가로 넘침·작은 터치영역 0', bad.length === 0, bad.join(' | '));
}

// ── E10 키보드·접근성 기본 ──
{
  const p = await newPage();
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  const firstFocus = await p.evaluate(() => document.activeElement.textContent.trim().slice(0, 20));
  await p.click('a[data-act="start-a"]'); await p.waitForSelector('form[data-step="purpose"]');
  await p.focus('input[name="purposes"][value="rnd"]'); await p.keyboard.press('Space');
  await p.focus('input[name="target"][value="company"]'); await p.keyboard.press('Space');
  await p.focus('input[name="markets"][value="KR"]'); await p.keyboard.press('Space');
  await p.focus('form[data-form="step"] button[type=submit]'); await p.keyboard.press('Enter');
  await p.waitForSelector('form[data-step="profile"]');
  const unlabeled = await p.$$eval('input, select, textarea', (els) => els.filter((e) => e.type !== 'hidden' && !e.closest('label') && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.getAttribute('aria-label')).map((e) => e.name || e.id));
  const fieldsetNoLegend = await p.$$eval('fieldset', (els) => els.filter((f) => !f.querySelector('legend')).length);
  const focusedH1 = await p.evaluate(() => document.activeElement.tagName);
  check('E10 키보드만으로 단계 진행', true, `첫 Tab 대상: ${firstFocus}`);
  check('E10b 모든 입력에 레이블·fieldset에 legend', unlabeled.length === 0 && fieldsetNoLegend === 0, unlabeled.join(','));
  check('E10c 화면 전환 시 제목으로 포커스 이동(스크린리더 안내)', focusedH1 === 'H1');
  const live = await p.$$eval('[aria-live]', (e) => e.length);
  check('E10d aria-live 영역 존재', live >= 2);
  await p.context().close();
}

// ── E12 OG·공유·전화·메일 ──
{
  const html = await (await fetch(BASE)).text();
  const need = ['og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:url', 'og:locale', 'twitter:card', 'rel="canonical"'];
  const missing = need.filter((k) => !html.includes(k));
  check('E12 정적 HTML head에 OG·canonical (JS 실행 전)', missing.length === 0, missing.join(','));
  check('E12b og:image 절대 HTTPS 1200×630', /og:image" content="https:\/\/[^"]+og-certification\.png"/.test(html) && html.includes('content="1200"') && html.includes('content="630"'));
  const img = await fetch(`${BASE}assets/og-certification.png`);
  check('E12c OG 이미지 로컬 200', img.status === 200);
  const p = await newPage();
  const tel = await p.$$eval('a[href^="tel:"]', (e) => [...new Set(e.map((x) => x.getAttribute('href')))]);
  const mail = await p.$$eval('a[href^="mailto:"]', (e) => [...new Set(e.map((x) => x.getAttribute('href')))]);
  check('E12d 전화·메일 링크 = 02-6124-5960 / start@gven.kr', tel.length === 1 && tel[0] === 'tel:0261245960' && mail.length === 1 && mail[0] === 'mailto:start@gven.kr', `${tel} ${mail}`);
  await p.evaluate(() => { delete Navigator.prototype.share; });
  await p.click('[data-act="share"]'); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check('E12e 공유는 서비스 랜딩 URL만(결과·입력값 미포함)', clip === CANONICAL, clip);
  const ext = await p.$$eval('a[target="_blank"]', (e) => e.filter((x) => !(x.rel || '').includes('noopener')).length);
  check('SEC-02 새 창 링크 전부 noopener', ext === 0);
  await p.context().close();
}

// ── E13 규정 재확인 기한 경과 → 자동판정 중지 ──
{
  const p = await newPage({ hash: '#/scheme/VEN', clock: '2027-06-01T03:00:00Z' });
  await p.click('[data-act="diagnose"]'); await p.waitForSelector('form[data-step="profile"]');
  await profileCorp(p); await submit(p); await submit(p); await p.waitForSelector('#result-title');
  const b = await badgeOf(p, 'VEN'); const t = await p.textContent('#res-VEN');
  check('E13 재확인 기한(2027-05-22) 지난 기준일 → 판정 범위 밖·중지 사유 표시', b.includes('판정 범위 밖') && t.includes('재확인 기한'), b);
  await p.context().close();
}

// ── E14 오염·모순 입력 ──
{
  const p = await newPage({ hash: '#/scheme/MAIN' });
  await p.click('[data-act="diagnose"]'); await p.waitForSelector('form[data-step="profile"]');
  await p.fill('#q-company_name', '<img src=x onerror="window.__xss=1">"\'&'); await p.dispatchEvent('#q-company_name', 'input');
  await choose(p, 'biz_status', 'corporation');
  await p.fill('#q-founded_on', '2099-01-01'); await p.dispatchEvent('#q-founded_on', 'change');
  const futureErr = await p.isVisible('#q-founded_on-err');
  await p.fill('#q-founded_on', '2019-01-01'); await p.dispatchEvent('#q-founded_on', 'change');
  await submit(p); await p.waitForSelector('form[data-step="questions"]');
  await p.fill('#q-main_debt_ratio', '12abc'); await p.dispatchEvent('#q-main_debt_ratio', 'change');
  const numErr = await p.isVisible('#q-main_debt_ratio-err');
  await submit(p);
  const blocked = await p.$('form[data-step="questions"]');
  await p.fill('#q-main_debt_ratio', '1,200'); await p.dispatchEvent('#q-main_debt_ratio', 'change');
  await submit(p); await p.waitForSelector('#result-title');
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const xss = await p.evaluate(() => window.__xss === 1 || !!document.querySelector('#print-root img[src="x"]'));
  const shownName = await p.textContent('#print-root .p-company');
  check('E14 미래 날짜·숫자 오류 안내 후 진행 차단', futureErr && numErr && !!blocked);
  check('E14b 쉼표 숫자(1,200) 허용 → 부채비율 1,000% 이상 미충족 표시', (await p.textContent('#res-MAIN')).includes('미충족'));
  check('E14c 회사명 HTML 주입 무력화(이스케이프 표시)', !xss && shownName.includes('<img'), shownName);
  check('E14d 대화상자(alert) 발생 0', !p._dialog, p._dialog || '');
  await p.context().close();
}

// ── E15 같은 입력 → 같은 결과·문서ID ──
{
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const p = await newPage({ hash: '#/scheme/RNDI', clock: '2026-11-22T03:00:00Z' });
    await p.click('[data-act="diagnose"]'); await p.waitForSelector('form[data-step="profile"]');
    await profileCorp(p); await submit(p);
    await fillNum(p, 'rnd_researchers', 3); await choose(p, 'rnd_space', 'independent'); await choose(p, 'rnd_equipment', 'yes'); await choose(p, 'rnd_excluded_field', 'no'); await choose(p, 'rnd_is_venture', 'no');
    await submit(p); await p.waitForSelector('#result-title');
    ids.push(`${await p.textContent('#result-title')}|${(await p.textContent('main')).match(/BC-\d{8}-[0-9A-Z]{6}/)[0]}|${await badgeOf(p, 'RNDI')}`);
    await p.context().close();
  }
  check('E15 동일 입력 반복 → 결과·문서ID 동일', ids[0] === ids[1], ids[0]);
  check('E15b 연구소 소기업 3명·독립공간 → 기본요건 확인', ids[0].includes('기본요건 확인'));
}

await browser.close();
console.log(`\n${results.length - failed}/${results.length} 통과`);
if (process.env.QA_JSON) (await import('node:fs')).writeFileSync(process.env.QA_JSON, JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
