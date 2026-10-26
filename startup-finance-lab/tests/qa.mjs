// 창업 재무분석 LAB 자동 점검 (기능·계산·보안·접근성·인쇄)
// 실행: npm run qa  (playwright 필요. 브라우저 경로가 다르면 PW_CHROMIUM=/path/to/chromium)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = pathToFileURL(resolve(here, '../index.html')).href;
const OUT = resolve(here, 'out');
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => { errors.push('native dialog: ' + d.type()); d.dismiss(); });
  await page.goto(FILE);
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}
const text = (page, id) => page.textContent('#' + id);
async function typeNum(page, id, value) {
  await page.fill(`#${id}-input`, value);
  await page.press(`#${id}-input`, 'Enter');
  await page.waitForTimeout(60);
}

// ---------------------------------------------------------------- 1. 기본 동작·계산
{
  const { ctx, page, errors } = await open();
  check('첫 화면 주소에 #가 붙지 않음 (카톡 공유용)', !new URL(page.url()).hash, page.url());
  await page.click('.tab[data-tab="pnl"]');
  const pnlHash = new URL(page.url()).hash;
  await page.click('.tab[data-tab="costing"]');
  check('다른 단계는 #로 이동, 1단계로 오면 # 제거', pnlHash === '#pnl' && !new URL(page.url()).hash, pnlHash + ' → ' + page.url());

  const drift = await page.evaluate(() => [...document.querySelectorAll('input[type=range]')]
    .filter(e => +e.value !== +e.getAttribute('value')).map(e => `${e.id}:${e.getAttribute('value')}→${e.value}`));
  check('슬라이더 기본값이 범위 확장 후에도 그대로', drift.length === 0, drift.join(', '));

  const golden = {
    'c-out-total': '4,233원', 'p-op': '8,676,000원', 'p-bep-rev': '10,500,000원',
    'f-r-total-need': '154,400,000원', 'f-r-repay': '1,140,174원', 'cf-min': '4,502,900원'
  };
  for (const [id, want] of Object.entries(golden)) check(`계산 검증 ${id}`, (await text(page, id)) === want, `${await text(page, id)} (기대 ${want})`);

  await page.click('.tab[data-tab="fund"]');
  for (const [input, want] of [['1억 2천만', '120,000,000'], ['3000만', '30,000,000'], ['1.5억', '150,000,000'], ['99억', '500,000,000']]) {
    await typeNum(page, 'f-deposit', input);
    check(`한글 금액 입력 "${input}"`, (await page.inputValue('#f-deposit-input')) === want, await page.inputValue('#f-deposit-input'));
  }

  await page.click('.tab[data-tab="pnl"]');
  await page.check('#p-vat');
  await page.waitForTimeout(100);
  check('부가세 포함: 매출은 공급가액', (await text(page, 'p-rev')) === '22,690,909원', await text(page, 'p-rev'));
  check('부가세 포함: 수수료는 결제금액 기준', (await text(page, 'p-vc-fee')) === '-1,248,000원', await text(page, 'p-vc-fee'));
  await page.uncheck('#p-vat');

  await typeNum(page, 'p-price', '0');
  await typeNum(page, 'p-qty', '0');
  for (const t of ['bep', 'cash', 'report']) { await page.click(`.tab[data-tab="${t}"]`); await page.waitForTimeout(80); }
  const bad = await page.evaluate(() => /NaN|Infinity|undefined/.test(document.querySelector('main').innerText));
  check('매출 0원일 때 NaN·Infinity 표시 없음', !bad);

  await page.click('.tab[data-tab="fund"]');
  await typeNum(page, 'f-term', '12');
  await typeNum(page, 'f-grace', '24');
  check('거치기간 ≥ 상환기간 경고', (await text(page, 'f-advisory')).includes('거치기간(24개월)이 상환기간(12개월) 이상'));

  await page.reload(); await page.waitForTimeout(400);
  check('새로고침 후 입력값 복원', (await page.inputValue('#f-term-input')) === '12');
  check('오류·기본 대화상자 없음', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 2. 보안 (XSS·가져오기 변조)
{
  const { ctx, page, errors } = await open();
  await page.fill('#info-item', '<img src=x onerror="window.__xss=1">');
  await page.click('.tab[data-tab="report"]');
  await page.waitForTimeout(200);
  check('기본정보 XSS 차단 (리포트)', await page.evaluate(() => !window.__xss && !document.querySelector('#report-root img')));

  await page.click('#btn-save');
  await page.fill('#ask-input', '<svg onload="window.__xss2=1">');
  await page.click('#ask-ok');
  await page.waitForTimeout(200);
  check('시나리오 이름 XSS 차단', await page.evaluate(() => !window.__xss2 && !document.querySelector('#scenarios svg, #scenario-compare svg')));

  const evil = {
    work: { 'p-price': '1e308', 'f-rate': '-50', 'info-name': 'x'.repeat(5000), __proto__: { polluted: 1 }, 'evil-id': 'boom' },
    scenarios: Array.from({ length: 10 }, (_, i) => ({ name: '<b>' + 'n'.repeat(100) + i, date: '<script>', profit: 'abc', snap: { 'p-qty': '1e9' } })),
    checklist: { 's1-1': true, 'not-a-step': true, constructor: true }
  };
  const file = resolve(OUT, 'evil-backup.json');
  writeFileSync(file, JSON.stringify(evil).replace('"__proto__":{}', '"__proto__":{"polluted":1}'));
  await page.setInputFiles('#file-import', file);
  await page.waitForTimeout(200);
  await page.click('#ask-ok');
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({
    polluted: ({}).polluted, price: document.getElementById('p-price').value, rate: document.getElementById('f-rate').value,
    name: document.getElementById('info-name').value.length,
    slots: JSON.parse(localStorage.getItem('startup_finance_lab_scenarios_v1')),
    check: JSON.parse(localStorage.getItem('startup_finance_lab_checklist_v1'))
  }));
  check('가져오기: 프로토타입 오염 없음', st.polluted === undefined);
  check('가져오기: 범위 밖 숫자는 허용 범위로 제한', st.price === '5000000' && st.rate === '0', `price ${st.price}, rate ${st.rate}`);
  check('가져오기: 긴 문자열 잘라냄', st.name <= 100, st.name);
  check('가져오기: 시나리오 최대 개수·이름 길이 제한', st.slots.length === 3 && st.slots.every(s => s.name.length <= 30 && /^\d{4}-\d{2}-\d{2}$/.test(s.date)));
  check('가져오기: 모르는 체크리스트 키 제거', JSON.stringify(st.check) === '{"s1-1":true}', JSON.stringify(st.check));
  check('보안 시나리오 중 오류 없음', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 3. 카카오톡 인앱 브라우저
{
  const ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 KAKAOTALK 10.8.0';
  const { ctx, page, errors } = await open({ userAgent: ua });
  check('인앱 브라우저 안내 배너', await page.isVisible('#inapp-banner'));
  await page.click('#btn-print');
  await page.waitForTimeout(150);
  check('인앱에서 PDF 누르면 안내 대화상자', await page.evaluate(() => document.getElementById('ask-dialog').open));
  check('인앱에서도 기본 대화상자(prompt/confirm) 미사용', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 4. 메타·브랜드·접근성
{
  const { ctx, page } = await open();
  const meta = await page.evaluate(() => {
    const m = p => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content || '';
    return { img: m('og:image'), url: m('og:url'), title: m('og:title'), desc: m('og:description'), w: m('og:image:width'), h: m('og:image:height'), tw: m('twitter:card'),
      icon: !!document.querySelector('link[rel="icon"][href^="data:image/svg+xml"]'), manifest: !!document.querySelector('link[rel="manifest"]'),
      logo: !!document.querySelector('header .brand-mark svg path[fill="#e58d00"]') };
  });
  check('OG 이미지 https 절대경로', /^https:\/\/.+\.jpg$/.test(meta.img), meta.img);
  check('OG 제목·설명·주소·크기', meta.title && meta.desc && /^https:\/\//.test(meta.url) && meta.w === '1200' && meta.h === '630');
  check('트위터 카드·파비콘·매니페스트', meta.tw === 'summary_large_image' && meta.icon && meta.manifest);
  check('헤더 방패 로고', meta.logo);

  const contrast = await page.evaluate(() => {
    const hex = v => v.trim().replace('#', '');
    const L = h => { const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const cs = getComputedStyle(document.documentElement);
    const ratio = (a, b) => { const [x, y] = [L(hex(cs.getPropertyValue(a))), L(hex(cs.getPropertyValue(b)))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    return { success: ratio('--success', '--success-bg'), warning: ratio('--warning', '--warning-bg'), danger: ratio('--danger', '--danger-bg'), text3: ratio('--text-3', '--surface') };
  });
  for (const [k, v] of Object.entries(contrast)) check(`글자 대비 ${k} ≥ 4.5:1`, v >= 4.5, v.toFixed(2));

  await page.focus('.tab.active');
  await page.keyboard.press('ArrowRight');
  check('탭 키보드 이동', (await page.getAttribute('.tab.active', 'data-tab')) === 'pnl');
  await page.click('.tab[data-tab="check"]');
  await page.focus('.checklist-item');
  await page.keyboard.press('Space');
  check('체크리스트 Space 키', (await page.getAttribute('.checklist-item', 'aria-checked')) === 'true');

  for (const w of [320, 360, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const t of ['costing', 'pnl', 'fund', 'cash', 'report']) {
      await page.click(`.tab[data-tab="${t}"]`);
      await page.waitForTimeout(60);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) { check(`가로 넘침 없음 ${w}px ${t}`, false, over + 'px'); }
    }
  }
  check('가로 넘침 없음 (320·360·390px, 주요 탭)', !results.some(r => r.name.startsWith('가로 넘침 없음 3') && !r.ok));
  await ctx.close();
}

// ---------------------------------------------------------------- 5. 인쇄(PDF)
for (const scheme of ['light', 'dark']) {
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  await page.fill('#info-item', '수제 크루아상 전문점');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print', colorScheme: scheme });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({
    order: [...document.querySelectorAll('#sections > section')].map(s => s.id.replace('sec-', '')).join(','),
    breaks: ['costing', 'pnl', 'bep', 'fund', 'cash'].map(id => getComputedStyle(document.getElementById('sec-' + id)).breakAfter),
    color: getComputedStyle(document.querySelector('.card-title')).color,
    bg: getComputedStyle(document.body).backgroundColor,
    charts: [...document.querySelectorAll('canvas')].map(c => c.width > 0)
  }));
  check(`[${scheme}] 인쇄: 종합진단이 맨 앞`, st.order.startsWith('report,costing'), st.order);
  check(`[${scheme}] 인쇄: 제조원가~현금흐름 사이 강제 페이지 넘김 없음`, st.breaks.every(b => b === 'auto'), st.breaks.join(','));
  check(`[${scheme}] 인쇄: 흰 바탕·어두운 글자`, st.color === 'rgb(25, 31, 40)' && st.bg === 'rgb(255, 255, 255)', st.color + ' / ' + st.bg);
  check(`[${scheme}] 인쇄: 차트가 그려짐`, st.charts.length === 2 && st.charts.every(Boolean));
  const pdf = await page.pdf({ path: resolve(OUT, `report-${scheme}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(`[${scheme}] 인쇄: 10쪽 이내`, pages > 0 && pages <= 10, pages + '쪽');
  check(`[${scheme}] 인쇄 중 오류 없음`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter(r => !r.ok);
writeFileSync(resolve(OUT, 'qa-result.json'), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
