// E2E QA v2 — 3단계 흐름·구간 버튼·수수료·보고서 + 개인정보·CSP·뷰포트. 사용: node tests/qa.mjs [http://127.0.0.1:8797/]
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
  page.on('request', (r) => { const u = new URL(r.url()); if (![new URL(BASE).hostname, '127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data')) page._ext.push(r.url()); });
  await page.route('**/*', async (route) => {
    try {
      const resp = await route.fetch();
      const headers = { ...resp.headers() };
      if ((headers['content-type'] || '').includes('text/html')) headers['content-security-policy'] = CSP;
      await route.fulfill({ response: resp, headers });
    } catch { /* 창을 닫는 중 끝나지 않은 요청(원격 서버 테스트 시) — 무시 */ }
  });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  if (opts.clock) await page.clock.setFixedTime(new Date(opts.clock));
  await page.goto(BASE + (opts.hash || ''));
  await page.waitForFunction(() => document.getElementById('app').getAttribute('aria-busy') === 'false');
  return page;
}
const qids = (page) => page.$$eval('.q[data-qid]:not([hidden])', (els) => els.map((e) => e.dataset.qid));

// ── v2 도우미: 3단계(고르기 → 답하기 → 결과) ──
async function pick(page, ids) {
  for (const id of ids) {
    await page.goto(`${BASE}#/scheme/${id}`); await page.waitForSelector('[data-act="pick-go"]');
    await page.click('[data-act="pick-go"]'); await page.waitForSelector('form[data-form="answer"]');
  }
}
async function ans(page, name, value) {
  const sel = `label.chip:has(> input[name="${name}"][value="${value}"])`;
  const el = page.locator(sel);
  if (!(await el.count())) throw new Error(`질문 없음: ${name}=${value}`);
  await el.evaluate((x) => x.scrollIntoView({ block: 'center' }));
  await el.click();
}
async function corp(page, { size = 'small', industry = 'software_582', age = 'r:3:7' } = {}) {
  await ans(page, 'biz_status', 'corporation'); await ans(page, 'founded_on', age);
  await ans(page, 'converted_from_individual', 'no'); await ans(page, 'suspended_period', 'no');
  await ans(page, 'is_sme', 'yes'); await ans(page, 'company_size', size); await ans(page, 'industry', industry);
}
async function toResult(page) { await page.goto(`${BASE}#/result`); await page.waitForSelector('#result-title'); }
const badgeOf = (page, id) => page.$eval(`#res-${id} .rc-h .badge`, (e) => e.textContent.trim());
const tile = (page, id, n) => page.$eval(`#res-${id} .tiles .tile:nth-child(${n}) b`, (e) => e.textContent.trim());

// ── E01 3단계 흐름·중복 질문·개인정보·CSP ──
{
  const p = await newPage({ w: 1440, h: 900 });
  const cta = (await p.textContent('.home-hero a.btn')).trim();
  check('E22 시작 버튼 문구 = 기업인증 진단 시작', cta.startsWith('기업인증 진단 시작'), cta);
  await p.click('a.btn[href="#/select"]'); await p.waitForSelector('#cards');
  const stepOn = await p.$eval('.st[aria-current="step"]', (e) => e.textContent.trim());
  for (const id of ['VEN', 'INNO', 'RNDI']) await p.click(`[data-act="pick"][data-id="${id}"]`);
  await p.click('#tray [data-act="go-answer"]'); await p.waitForSelector('form[data-form="answer"]');
  const q = await qids(p); const dup = q.filter((x, i) => q.indexOf(x) !== i);
  await corp(p);
  await toResult(p);
  const cards = (await p.$$('.rc')).length;
  check('E01 3단계: 인증 고르기 → 우리 회사 답하기 → 결과(선택 3개 = 결과 카드 3개)', stepOn.includes('인증 고르기') && cards === 3, `${stepOn} · 카드 ${cards}`);
  check('E01b 답하기 화면 질문 중복 없음', dup.length === 0, dup.join(','));
  check('E01c 콘솔 오류 0', p._errs.length === 0, p._errs.join(' | '));
  check('PRIV-01 외부 도메인 요청 0', p._ext.length === 0, p._ext.slice(0, 3).join(', '));
  const storage = await p.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, cookie: document.cookie }));
  check('PRIV-02 localStorage·sessionStorage·쿠키 저장 0', storage.l === 0 && storage.s === 0 && storage.cookie === '', JSON.stringify(storage));
  check('PRIV-03 URL에 입력값 없음', !/biz_status|software|corporation/.test(p.url()), p.url());
  check('SEC-01 CSP 위반 0', (await p.evaluate(() => window.__csp)).length === 0, (await p.evaluate(() => window.__csp)).join(' | '));
  // 답 고치기 → 답 유지
  await p.click('a.btn.gh[href="#/answer"]'); await p.waitForSelector('form[data-form="answer"]');
  const kept = await p.$eval('input[name="industry"][value="software_582"]', (e) => e.checked);
  check('E03 답 고치기: 기존 답 유지', kept);
  await p.context().close();
}

// ── E02 선택 최대 3개·빼기 ──
{
  const p = await newPage({ w: 1280, h: 900, hash: '#/select' });
  for (const id of ['VEN', 'INNO', 'MAIN', 'RNDI']) await p.click(`[data-act="pick"][data-id="${id}"]`);
  const n1 = (await p.$$('#tray .it')).length; const toast = await p.textContent('#toast');
  await p.click('#tray [data-act="unpick"][data-id="INNO"]');
  const n2 = (await p.$$('#tray .it')).length;
  const pressed = await p.$eval('[data-act="pick"][data-id="INNO"]', (e) => e.getAttribute('aria-pressed'));
  check('E02 최대 3개 선택(4번째는 안내), 빼기 동작', n1 === 3 && toast.includes('최대 3개') && n2 === 2 && pressed === 'false', `${n1}→${n2}`);
  await p.context().close();
}

// ── E04 탭·검색·목적 찾기 ──
{
  const p = await newPage({ w: 1440, h: 900, hash: '#/select' });
  const names = () => p.$$eval('#cards .cc-name', (e) => e.map((x) => x.textContent));
  const dom = await names();
  await p.click('.side-f [data-act="region"][data-v="international"]'); await p.waitForTimeout(100);
  const intl = await names();
  check('E04 국내 탭에 ISO 없음·해외 탭에 벤처 없음', !dom.some((n) => n.includes('ISO')) && !intl.some((n) => n.includes('벤처')), `${dom.length}/${intl.length}`);
  await p.fill('#q-search', 'ISO'); await p.waitForTimeout(300);
  const iso = (await names()).filter((n) => n.includes('ISO'));
  check('E04b ISO 검색 12종 이상(국내·해외 전체)', iso.length >= 12, `${iso.length}개`);
  await p.fill('#q-search', '미국 의료기기'); await p.waitForTimeout(300);
  check('E04c 목적어 검색(미국 의료기기 → FDA)', (await names()).some((n) => n.includes('FDA')));
  await p.fill('#q-search', 'zzqx없는인증'); await p.waitForTimeout(300);
  check('E04d 0건 안내 + 전문가 문의', (await p.textContent('#cards')).includes('조건에 맞는 인증이 없어요'));
  await p.fill('#q-search', ''); await p.waitForTimeout(300);
  await p.click('.side-f [data-act="region"][data-v="domestic"]'); await p.click('.side-f [data-act="purpose"][data-v="procurement"]'); await p.waitForTimeout(100);
  const rec = await p.$$eval('#cards .rec-mark', (e) => e.length); const all = (await names()).length;
  check('E04e 목적으로 찾기: 공공조달 목적 인증만, 목적 추천 표시', rec > 0 && rec === all, `${rec}/${all}`);
  // 국내·해외 탭마다 분야별 숫자 = 실제 카드 수(탭 전환 후 분야 목록이 다시 그려지는지)
  const mism = [];
  for (const region of ['domestic', 'international']) {
    await p.click(`.side-f [data-act="region"][data-v="${region}"]`); await p.waitForTimeout(80);
    if (await p.$('.side-f [data-act="purpose"][aria-pressed="true"]')) { await p.click('.side-f [data-act="purpose"][aria-pressed="true"]'); await p.waitForTimeout(80); }
    const items = await p.$$eval('.side-f .flist [data-act="field"]', (e) => e.map((x) => ({ v: x.dataset.v, n: Number((x.querySelector('em') || {}).textContent) })));
    const sum = items.filter((x) => x.v !== 'all').reduce((a, x) => a + x.n, 0);
    const all = items.find((x) => x.v === 'all').n;
    if (sum !== all) mism.push(`${region} 분야 합 ${sum} ≠ 전체 ${all}`);
    for (const it of items) {
      await p.click(`.side-f .flist [data-act="field"][data-v="${it.v}"]`); await p.waitForTimeout(60);
      const shown = (await p.$$('#cards .cc')).length;
      if (shown !== it.n) mism.push(`${region}/${it.v} 표시 ${it.n} · 실제 ${shown}`);
    }
  }
  check('E04g 국내·해외 탭 전환 시 분야별 숫자 = 실제 카드 수', mism.length === 0, mism.join(' | '));
  const total = await p.$eval('.side-f .tabs', (e) => e.textContent);
  check('E04f 인증 수 표시(국내·해외)', /국내 \d+/.test(total) && /해외 \d+/.test(total), total.trim());
  await p.context().close();
}

// ── E05 모름 다수 → 미충족 없음 ──
{
  const p = await newPage({ w: 1280 });
  await pick(p, ['INNO', 'MAIN']);
  await ans(p, 'biz_status', 'corporation'); await ans(p, 'founded_on', 'unknown'); await ans(p, 'is_sme', 'unknown');
  await toResult(p);
  const txt = await p.textContent('main');
  check('E05 모름 다수 → 미충족 없이 확인 필요', !txt.includes('기본요건 미충족') && txt.includes('확인 필요'));
  await p.context().close();
}

// ── E06 벤처 유형 OR + E11 공식 수수료·처리기간 + E18 동적 비율 질문 ──
{
  const p = await newPage({ w: 1440, h: 900 });
  await pick(p, ['VEN', 'INNO', 'RNDI']);
  await corp(p);
  await ans(p, 'ven_excluded_industry', 'no'); await ans(p, 'ven_invest_total', 'r:0:0'); await ans(p, 'rnd_unit', 'institute');
  await ans(p, 'ven_rd_spend', 'r:5000:'); await ans(p, 'ven_revenue', 'r:1:500000');
  await p.waitForTimeout(100);
  const dyn = await p.textContent('#dyn-ven_rd_ratio');
  check('E18 연구개발비 비율: 업종·매출로 우리 회사 기준 10% 질문으로 바뀜', dyn.includes('네, 10% 이상') && dyn.includes('공식 기준 10%'), dyn.slice(0, 60));
  await ans(p, 'ven_rd_ratio', 'r:10:');
  await ans(p, 'rnd_researchers', 'r:2:3'); await ans(p, 'rnd_is_venture', 'no'); await ans(p, 'rnd_founder_researcher', 'no');
  await ans(p, 'rnd_space', 'independent'); await ans(p, 'rnd_equipment', 'yes'); await ans(p, 'rnd_excluded_field', 'no');
  await p.click('.q-nav [data-to="sec-RNDI"]');
  const jumpOk = await p.waitForFunction(() => location.hash === '#/answer' && Math.abs(document.getElementById('sec-RNDI').getBoundingClientRect().top) < 200, null, { timeout: 4000 }).then(() => true).catch(() => false);
  check('E25 질문 구역 바로가기: 같은 화면에서 해당 인증 질문으로 이동(오류 화면 아님)', jumpOk);
  const prev = await p.textContent('#preview');
  check('E19 답하기 화면 미리보기가 답에 따라 바뀜', prev.includes('기본요건 확인') || prev.includes('미충족'), prev.replace(/\s+/g, ' ').slice(0, 80));
  await toResult(p);
  const ven = await badgeOf(p, 'VEN'); const venTxt = await p.textContent('#res-VEN');
  check('E06 벤처 투자유형이 해당 없음·미충족이어도 연구개발유형 충족 → 기본요건 충족', ven.includes('기본요건 확인') && venTxt.includes('벤처투자유형') && /연구개발유형 기본요건 충족/.test(venTxt), ven);
  check('E06b 연구소 소기업 2명 → 미충족(기준 3명)', (await badgeOf(p, 'RNDI')).includes('미충족') && (await p.textContent('#res-RNDI')).includes('선택 2명 / 기준 3명'));
  check('E11 벤처 연구개발유형 공식 수수료 345,000원·처리기간 45일 이내', (await tile(p, 'VEN', 4)) === '345,000원' && (await tile(p, 'VEN', 5)) === '45일 이내', `${await tile(p, 'VEN', 4)} / ${await tile(p, 'VEN', 5)}`);
  check('E11b 이노비즈 770,000원·연구소는 원문 미확보 → 기관 확인', (await tile(p, 'INNO', 4)) === '770,000원' && (await tile(p, 'RNDI', 4)) === '기관 확인' && (await tile(p, 'RNDI', 5)) === '기관 확인');
  await p.click('[data-act="tab"][data-card="VEN"][data-k="fee"]');
  const feeRows = await p.$$eval('#tp-VEN-fee table tbody tr', (e) => e.length);
  check('E11c 비용·기간 탭: 벤처 유형별 수수료 5행 + 근거 링크', feeRows === 5 && (await p.$$('#tp-VEN-fee a.ext')).length >= 1, `${feeRows}행`);
  await p.click('[data-act="tab"][data-card="VEN"][data-k="docs"]');
  const docs = await p.$$eval('#tp-VEN-docs a.ext', (e) => e.map((x) => x.href));
  const files = await p.$$eval('#tp-VEN-docs [data-act="dl"]', (e) => e.map((x) => x.dataset.url));
  const nums = await p.$$eval('#tp-VEN-docs td.no', (e) => e.map((x) => x.textContent.trim()));
  check('E20 서류 탭: 공식 서식(내려받기)·발급처 링크, 서류 번호 1~N', files.some((h) => h.includes('smes.go.kr/venturein/file/download')) && docs.length >= 5 && nums.join(',') === nums.map((_, i) => i + 1).join(','), `서식 ${files.length} · 링크 ${docs.length} · 번호 ${nums.length}`);
  await p.click('#tp-VEN-docs [data-act="dl"]');
  const dlg = await p.evaluate(() => ({ open: document.getElementById('dl-dialog').open, href: document.getElementById('dl-go').href, rel: document.getElementById('dl-go').rel, type: document.getElementById('dl-type').textContent }));
  check('E20b 서식 내려받기 전 안내 창(형식·출처·확인일), 새 창 noopener', dlg.open && dlg.href.startsWith('https://www.smes.go.kr/') && dlg.rel.includes('noopener') && dlg.type === 'PDF', JSON.stringify(dlg).slice(0, 80));
  await p.click('[data-act="dl-close"]');
  check('E20c 안내 창 닫기', !(await p.evaluate(() => document.getElementById('dl-dialog').open)));
  check('E08 서류 보유(있음·없음) 입력 없음', (await p.$$('[data-doc]')).length === 0 && !(await p.textContent('main')).includes('보유 여부'));
  const tabSel = await p.$eval('[data-act="tab"][data-card="VEN"][data-k="docs"]', (e) => e.getAttribute('aria-selected'));
  await p.focus('[data-act="tab"][data-card="VEN"][data-k="docs"]'); await p.keyboard.press('ArrowRight');
  const after = await p.$eval('[data-act="tab"][data-card="VEN"][aria-selected="true"]', (e) => e.dataset.k);
  check('E10e 결과 탭: 클릭·방향키로 이동(aria-selected)', tabSel === 'true' && after === 'fee', after);
  const plain = await p.textContent('main');
  const steps = await p.$$eval('.no2', (e) => e.map((x) => x.textContent));
  check('E21 할 일은 순서만(30·60·90일 일정 없음)·확률 표시 없음', steps.length > 0 && steps.every((x) => !/\d+일/.test(x)) && !/\d+%\s*(가능|확률)|취득 가능성/.test(plain), [...new Set(steps)].join('·'));
  // 다음 진단·공통 서류·메일
  const links = await p.$$eval('.next-card a', (as) => as.map((a) => ({ href: a.href, rel: a.rel, target: a.target })));
  check('E16 다음 진단 추천 1~3개, BECONIC 서비스·새 창 noopener', links.length >= 1 && links.length <= 3 && links.every((l) => /^https:\/\/beconic-[a-z0-9-]+\.netlify\.app\//.test(l.href) && l.target === '_blank' && l.rel.includes('noopener')));
  check('E16b 벤처+이노비즈 공통 서류 묶음', (await p.$$('.common-docs li')).length >= 2);
  const sizes = await p.$$eval('.side-r .btn', (e) => e.map((x) => `${Math.round(x.getBoundingClientRect().width)}x${Math.round(x.getBoundingClientRect().height)}`));
  const nextBtns = await p.$$eval('.next-card .btn', (e) => e.map((x) => Math.round(x.getBoundingClientRect().bottom)));
  check('E23 오른쪽 버튼 크기 동일·다음 진단 버튼 위치 동일', new Set(sizes).size === 1 && new Set(nextBtns).size === 1, `${[...new Set(sizes)]} / ${[...new Set(nextBtns)]}`);
  const whos = await p.$$eval('.side-r .rm .who', (e) => e.map((x) => x.textContent));
  check('E26 여러 인증 선택 시 할 일마다 인증 이름 표시', whos.length > 0 && whos.every(Boolean), whos.join('·'));
  const labels = await p.$$eval('.side-r .rm .no2', (e) => e.map((x) => Math.round(x.getBoundingClientRect().width)));
  check('E24 할 일 순서 라벨 폭 동일(먼저·신청 등)', labels.length > 0 && new Set(labels).size === 1, [...new Set(labels)].join(','));
  const mail = await p.getAttribute('.callout a[href^="mailto:"]', 'href');
  const body = decodeURIComponent((mail || '').split('&body=')[1] || '');
  check('E16c 상담 메일 초안: 문서번호·결과 포함', /BC-\d{8}-[0-9A-Z]{6}/.test(body) && body.includes('벤처기업확인'));
  await p.context().close();
}

// ── E27 결과 상세: PC는 탭, 모바일은 펼침(제목줄에 핵심 숫자) ──
{
  const res = {};
  for (const w of [1280, 390]) {
    const p = await newPage({ w, h: 900 });
    await pick(p, ['VEN']); await corp(p);
    await ans(p, 'ven_excluded_industry', 'no'); await ans(p, 'ven_invest_total', 'r:0:0'); await ans(p, 'rnd_unit', 'institute');
    await ans(p, 'ven_rd_spend', 'r:5000:'); await ans(p, 'ven_revenue', 'r:1:500000'); await p.waitForTimeout(80); await ans(p, 'ven_rd_ratio', 'r:10:');
    await toResult(p);
    const vis = (sel) => p.$$eval(sel, (e) => e.filter((x) => x.offsetParent !== null).length);
    res[w] = { tabs: await vis('#res-VEN .rtabs [role="tab"]'), acc: await vis('#res-VEN .acc-h'), panels: await vis('#res-VEN .tp') };
    if (w === 390) {
      res.sum = await p.$$eval('#res-VEN .acc-h em', (e) => e.map((x) => x.textContent));
      await p.click('#ah-VEN-docs');
      res.afterOpen = await vis('#res-VEN .tp');
      res.docsShown = await p.$eval('#tp-VEN-docs', (e) => e.offsetParent !== null && e.querySelectorAll('td.no').length > 0);
      res.expanded = await p.getAttribute('#ah-VEN-docs', 'aria-expanded');
      await p.click('#ah-VEN-req');
      res.afterClose = await vis('#res-VEN .tp');
      await p.click('#ah-VEN-fee');
      res.feeLabels = await p.$$eval('#tp-VEN-fee tbody tr:first-child td[data-label]', (e) => e.map((x) => getComputedStyle(x, '::before').content.replace(/"/g, '')));
      res.sw = await p.evaluate(() => document.documentElement.scrollWidth);
    }
    await p.context().close();
  }
  check('E27 PC: 탭 5개·패널 1개만 보임 / 모바일: 탭 숨김·펼침 제목 5개·처음엔 요건만 열림',
    res[1280].tabs === 5 && res[1280].acc === 0 && res[1280].panels === 1 && res[390].tabs === 0 && res[390].acc === 5 && res[390].panels === 1, JSON.stringify({ pc: res[1280], m: res[390] }));
  check('E27b 모바일 제목줄에 핵심 숫자(요건·서류·수수료·기간·할 일·근거)', res.sum.length === 5 && /충족/.test(res.sum[0]) && /개/.test(res.sum[1]) && /원|기관 확인/.test(res.sum[2]) && /일 이내|기관 확인/.test(res.sum[2]) && /출처/.test(res.sum[4]), res.sum.join(' | '));
  check('E27d 모바일 수수료 표: 숫자마다 이름표(합계·정부지원금·기업 부담금)', (res.feeLabels || []).join(',') === '합계,정부지원금,기업 부담금', (res.feeLabels || []).join(','));
  check('E27c 모바일 펼치기·접기(aria-expanded), 여러 개 동시에 열기, 가로 넘침 없음', res.afterOpen === 2 && res.docsShown && res.expanded === 'true' && res.afterClose === 1 && res.sw <= 390, JSON.stringify({ o: res.afterOpen, c: res.afterClose, sw: res.sw }));
}

// ── E07 해외 제품 규제: 의무·승인 확정 표현 없음 ──
{
  const p = await newPage({ w: 1280 });
  await pick(p, ['EU-CE', 'US-FDA-DEV']);
  await ans(p, 'biz_status', 'corporation');
  await ans(p, 'markets', 'EU'); await ans(p, 'product_categories', 'medical');
  await toResult(p);
  const t = await p.textContent('main');
  const bad = /(의무입니다|승인 대상입니다|인증이 필요합니다|확정입니다|확정돼요|의무예요)/.test(t);
  check('E07 CE·FDA: 의무·승인 확정 표현 없음 + 적용 규정 확인 표시', !bad && /적용 규정 확인/.test(t));
  await p.context().close();
}

// ── E09 반응형 320~1440 · 터치 영역 ──
{
  const widths = [320, 360, 390, 430, 768, 1024, 1440];
  const bad = [];
  for (const w of widths) {
    const p = await newPage({ w, h: 900 });
    for (const hash of ['', '#/select', '#/scheme/VEN', '#/about-data', '#/privacy']) {
      await p.goto(BASE + hash); await p.waitForTimeout(120);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) bad.push(`${w}px ${hash || 'home'} ${sw}`);
    }
    await pick(p, ['VEN', 'MAIN']); await corp(p);
    let sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) bad.push(`${w}px answer ${sw}`);
    await toResult(p);
    sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) bad.push(`${w}px result ${sw}`);
    if (w <= 430) {
      const small = await p.$$eval('main .btn, main .chip span, .mbar .btn', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map((e) => e.textContent.trim().slice(0, 12)));
      if (small.length) bad.push(`${w}px 터치<40: ${small.slice(0, 3).join('/')}`);
    }
    await p.goto(`${BASE}#/report`); await p.waitForSelector('#rep-stage');
    sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) bad.push(`${w}px report ${sw}`);
    await p.context().close();
  }
  check('E09 320~1440px 7종 가로 넘침·작은 터치영역 0', bad.length === 0, bad.join(' | '));
}

// ── E10 키보드·접근성 ──
{
  const p = await newPage({ w: 1280 });
  await p.goto(`${BASE}#/select`); await p.waitForSelector('#cards');
  await p.focus('[data-act="pick"][data-id="VEN"]'); await p.keyboard.press('Enter');
  const pressed = await p.$eval('[data-act="pick"][data-id="VEN"]', (e) => e.getAttribute('aria-pressed'));
  await p.focus('#tray [data-act="go-answer"]'); await p.keyboard.press('Enter');
  await p.waitForSelector('form[data-form="answer"]');
  await p.focus('input[name="biz_status"][value="corporation"]'); await p.keyboard.press('Space');
  const chosen = await p.$eval('input[name="biz_status"][value="corporation"]', (e) => e.checked);
  const unlabeled = await p.$$eval('main input, main select, main textarea', (els) => els.filter((e) => e.type !== 'hidden' && !e.closest('label') && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.getAttribute('aria-label')).map((e) => e.name || e.id));
  const fieldsetNoLegend = await p.$$eval('fieldset', (els) => els.filter((f) => !f.querySelector('legend')).length);
  const focusedH1 = await p.evaluate(() => document.activeElement.tagName);
  check('E10 키보드만으로 인증 선택·다음 단계·답하기', pressed === 'true' && chosen);
  check('E10b 모든 입력에 레이블·fieldset에 legend', unlabeled.length === 0 && fieldsetNoLegend === 0, unlabeled.join(','));
  check('E10c 화면 전환 시 제목으로 포커스 이동', focusedH1 === 'H1' || (await p.evaluate(() => document.activeElement.closest('fieldset') !== null)));
  check('E10d aria-live 영역 존재', (await p.$$eval('[aria-live]', (e) => e.length)) >= 2);
  await p.context().close();
}

// ── E12 OG·공유·전화·메일·로고 ──
{
  const html = await (await fetch(BASE)).text();
  const need = ['og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:url', 'og:locale', 'twitter:card', 'rel="canonical"'];
  const missing = need.filter((k) => !html.includes(k));
  check('E12 정적 HTML head에 OG·canonical (JS 실행 전)', missing.length === 0, missing.join(','));
  check('E12b og:image 절대 HTTPS 1200×630', /og:image" content="https:\/\/[^"]+og-certification\.png"/.test(html) && html.includes('content="1200"') && html.includes('content="630"'));
  check('E12c OG 이미지 로컬 200', (await fetch(`${BASE}assets/og-certification.png`)).status === 200);
  check('E12f 헤더·푸터: 방패 + BECONIC + by Growth Ventures(IR 진단과 같은 형태), 글자 로고 없음', !html.includes('growth-ventures-ko') && html.includes('assets/shield.png') && html.includes('assets/shield-white.png') && (html.match(/기업인증 진단 · by Growth Ventures/g) || []).length === 2 && html.includes('class="f-cert"'));
  const p = await newPage();
  const tel = await p.$$eval('a[href^="tel:"]', (e) => [...new Set(e.map((x) => x.getAttribute('href')))]);
  const mail = await p.$$eval('a[href^="mailto:"]', (e) => [...new Set(e.map((x) => x.getAttribute('href')))]);
  check('E12d 전화·메일 링크 = 02-6124-5960 / start@gven.kr', tel.length === 1 && tel[0] === 'tel:0261245960' && mail.length === 1 && mail[0] === 'mailto:start@gven.kr', `${tel} ${mail}`);
  await p.evaluate(() => { delete Navigator.prototype.share; });
  await p.click('[data-act="share"]'); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check('E12e 공유는 서비스 랜딩 URL만(결과·입력값 미포함)', clip === CANONICAL, clip);
  await p.goto(`${BASE}#/scheme/VEN`); await p.waitForTimeout(150);
  const ext = await p.$$eval('a[target="_blank"]', (e) => e.filter((x) => !(x.rel || '').includes('noopener')).length);
  check('SEC-02 새 창 링크 전부 noopener', ext === 0);
  await p.context().close();
}

// ── E13 규정 재확인 기한 경과 → 자동판정 중지 ──
{
  const p = await newPage({ w: 1280, clock: '2027-06-01T03:00:00Z' });
  await pick(p, ['VEN']); await corp(p); await toResult(p);
  const t = await p.textContent('#res-VEN');
  check('E13 재확인 기한 지난 기준일 → 판정 범위 밖·중지 사유', (await badgeOf(p, 'VEN')).includes('판정 범위 밖') && t.includes('재확인 기한'));
  await p.context().close();
}

// ── E14 오염·모순 입력·XSS ──
{
  const p = await newPage({ w: 1280 });
  await pick(p, ['MAIN']);
  await p.fill('#q-company_name', '<img src=x onerror="window.__xss=1">"\'&'); await p.dispatchEvent('#q-company_name', 'input');
  await ans(p, 'biz_status', 'corporation');
  await p.click('.q[data-qid="founded_on"] details.exact summary');
  await p.fill('#q-founded_on-date', '2099-01-01'); await p.dispatchEvent('#q-founded_on-date', 'change');
  const futureErr = await p.isVisible('#q-founded_on-err');
  await p.fill('#q-founded_on-date', '2019-01-01'); await p.dispatchEvent('#q-founded_on-date', 'change');
  const okDate = await p.evaluate(() => window.__beconic.state.answers.founded_on);
  await ans(p, 'main_debt_ratio', 'r:1000:');
  await toResult(p);
  check('E14 미래 날짜 안내·정확한 날짜 입력 반영', futureErr && okDate === '2019-01-01', okDate);
  check('E14b 부채비율 1,000% 이상 → 미충족', (await p.textContent('#res-MAIN')).includes('미충족'));
  await p.goto(`${BASE}#/report`); await p.waitForSelector('#rep-stage .p-company');
  const xss = await p.evaluate(() => window.__xss === 1 || !!document.querySelector('#rep-stage img[src="x"]'));
  const shownName = await p.textContent('#rep-stage .p-company');
  check('E14c 회사명 HTML 주입 무력화(이스케이프 표시)', !xss && shownName.includes('<img'), shownName);
  check('E14d 대화상자(alert) 발생 0', !p._dialog, p._dialog || '');
  // E17 문구 수정 → HTML 저장
  await p.click('[data-act="rep-edit"]');
  const editable = await p.$eval('#rep-stage .p-doc', (e) => e.getAttribute('contenteditable'));
  await p.$eval('#rep-stage .p-headline', (e) => { e.textContent = '대표 검토 문구 수정 테스트'; });
  const flag = await p.$eval('#rep-stage [data-edit-flag]', (e) => !e.hidden);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="rep-html"]')]);
  const path = await dl.path(); const saved = readFileSync(path, 'utf8');
  check('E17 보고서 문구 수정(편집본 표시) → HTML 저장(수정 문구·문서번호 포함, 스크립트 없음)', editable === 'true' && flag && saved.includes('대표 검토 문구 수정 테스트') && /BC-\d{8}-/.test(saved) && !/<script/i.test(saved) && dl.suggestedFilename().endsWith('_edited.html'), dl.suggestedFilename());
  await p.context().close();
}

// ── E15 같은 입력 → 같은 결과·문서ID ──
{
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const p = await newPage({ w: 1280, clock: '2026-11-22T03:00:00Z' });
    await pick(p, ['RNDI']); await corp(p);
    await ans(p, 'rnd_researchers', 'r:3:5'); await ans(p, 'rnd_space', 'independent'); await ans(p, 'rnd_equipment', 'yes'); await ans(p, 'rnd_excluded_field', 'no');
    await ans(p, 'rnd_is_venture', 'no'); await ans(p, 'rnd_founder_researcher', 'no');
    await toResult(p);
    ids.push(`${await badgeOf(p, 'RNDI')}|${(await p.textContent('main')).match(/BC-\d{8}-[0-9A-Z]{6}/)[0]}`);
    await p.context().close();
  }
  check('E15 동일 입력 반복 → 결과·문서ID 동일', ids[0] === ids[1], ids[0]);
  check('E15b 연구소 소기업 3~4명·독립공간 → 기본요건 확인', ids[0].includes('기본요건 확인'));
}

await browser.close();
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
