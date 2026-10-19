/* global buildReport, years, V, S, importJSON, analyzeBank, clearAll, crossCheck, applyRes, aiPayload, metrics, findings -- page.evaluate 안에서 앱 전역 함수를 호출 */
// BECONIC 재무진단 QA — 실제 Chromium으로 사용자 플로우·레드팀 항목·A4 PDF를 확인한다.
// 실행: (finance 폴더를 정적 서버로 띄운 뒤) node finance/tests/qa.mjs [baseUrl]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ntsHtml, fixtureYear } from './nts-fixture.mjs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://127.0.0.1:8790/';
const require = createRequire(import.meta.url);
writeFileSync(path.join(OUT, 'xlsx.cjs'), readFileSync(path.join(here, '..', 'vendor', 'xlsx-0.18.5.full.min.js')));
const XLSX = require(path.join(OUT, 'xlsx.cjs'));

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/pretendard|jsdelivr|ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto(BASE);

const txt = async (sel) => { await page.evaluate((s) => document.querySelectorAll(s + ' details').forEach((d) => (d.open = true)), sel); return page.locator(sel).innerText(); };
const noBadNumbers = async () => { const t = await page.locator('#app').innerText(); return !/NaN|Infinity|undefined/.test(t); };

// 1. 빈 상태: 어떤 숫자도 자동 표시되지 않음
{
  const dash = await txt('#dash');
  check('빈 상태에서 대시보드에 숫자 없음', !/\d/.test(dash.replace(/\d+단계|②/g, '')), dash.slice(0, 60));
  check('빈 상태 AI 버튼 비활성', await page.locator('#btnAI').isDisabled());
}

// 2. 가상 예시
{
  await page.click('#btnSample');
  await page.waitForTimeout(200);
  const risks = await txt('#risks');
  check('가상 예시: 유동성 징후 탐지', risks.includes('유동자산이 유동부채보다 적음'));
  check('가상 예시: 이자보상배율 1배 미만 탐지', risks.includes('이자보상배율 1배 미만'));
  check('가상 예시 배너 표시', await page.locator('#sampleBanner').isVisible());
  check('가상 데이터는 AI 차단', await page.locator('#btnAI').isDisabled());
  check('가상 예시: NaN/Infinity 없음', await noBadNumbers());
  const kpi = await txt('#dash');
  check('대시보드 상단 4카드(매출·영업이익률·부채비율·유동비율)', ['매출액', '영업이익률', '부채비율', '유동비율'].every((k) => kpi.includes(k)));
  check('유동비율 94.3% 계산(4,100/4,350)', kpi.includes('94.3'), '');
  await page.locator('#s-dash').screenshot({ path: path.join(OUT, 'dash-1440.png') });
  await page.locator('#s-risk').screenshot({ path: path.join(OUT, 'risk-1440.png') });
  await page.screenshot({ path: path.join(OUT, 'hero-1440.png') });
  // 반응형
  for (const w of [375, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${w}px 가로 스크롤 없음`, sw <= w, `scrollWidth=${sw}`);
    await page.screenshot({ path: path.join(OUT, `full-${w}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // 보고서 PDF
  await page.evaluate(() => { document.querySelector('#report').innerHTML = buildReport(); });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  writeFileSync(path.join(OUT, 'report-sample.pdf'), pdf);
  await page.emulateMedia({ media: 'screen' });
  const info = execFileSync('pdfinfo', [path.join(OUT, 'report-sample.pdf')]).toString();
  const pages = +info.match(/Pages:\s+(\d+)/)[1];
  check('A4 보고서 8~15쪽', pages >= 8 && pages <= 15, `${pages}쪽`);
  const ptxt = execFileSync('pdftotext', ['-layout', path.join(OUT, 'report-sample.pdf'), '-']).toString();
  check('보고서에 가상 데이터 경고 표기', ptxt.includes('가상 데이터'));
  check('보고서에 공식 신용평가서 아님 표기', ptxt.includes('공식 기업신용평가서 아님') || ptxt.includes('공식 기업신용평가서·'));
  check('보고서 NaN/undefined 없음', !/NaN|undefined|Infinity/.test(ptxt));
  execFileSync('pdftoppm', ['-r', '50', '-png', '-f', '1', '-l', '4', path.join(OUT, 'report-sample.pdf'), path.join(OUT, 'report-p')]);
  await page.evaluate(() => { document.querySelector('#report').innerHTML = ''; });
  await page.click('#btnClearSample');
}

// 3. CSV 업로드 (계정과목 + 연도 열)
const Y = await page.evaluate(() => years());
{
  const rows = [['단위: 백만원'], ['계정과목', ...Y.map(String)],
    ['자산총계', 1000, 1100, 1200], ['유동자산', 400, 450, 500], ['비유동자산', 600, 650, 700], ['부채총계', 600, 650, 700], ['유동부채', 300, 320, 350], ['비유동부채', 300, 330, 350],
    ['자본총계', 400, 450, 500], ['자본금', 100, 100, 100], ['매출액', 2000, 2200, 2500], ['매출원가', 1500, 1600, 1800], ['매출총이익', 500, 600, 700], ['판매비와관리비', 400, 450, 500], ['영업이익(손실)', 100, 150, 200], ['이자비용', 10, 12, 14], ['당기순이익(손실)', 70, 50, 50]];
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  await page.setInputFiles('#fileIn', { name: 'fs.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForSelector('[data-apply="0"]');
  const cand = await txt('#candidates');
  check('CSV: 연도 열 인식', cand.includes('열 머리글에서 연도 인식'));
  check('CSV: 단위 인식(백만원)', cand.includes('단위 인식'));
  await page.click('[data-apply="0"]');
  const v = await page.evaluate(() => ({ a: V(years()[2], 'assets'), r: V(years()[0], 'revenue') }));
  check('CSV: 원 단위 변환 반영', v.a === 1200e6 && v.r === 2000e6, JSON.stringify(v));
  const vb = await txt('#vcards');
  check('CSV: 3개년 대차 검증 통과', (vb.match(/검증 통과/g) || []).length === 3);
  for (const c of await page.locator('[data-confirm]').all()) await c.check();
  check('확인 4개 후 검증 완료', (await txt('#verifyBadge')).includes('검증 완료'));
  check('검증 완료 후 AI 버튼 활성', !(await page.locator('#btnAI').isDisabled()));
  // AI 호출(서버 없음) → 안전한 실패
  await page.check('#aiConsent');
  await page.click('#btnAI');
  await page.waitForFunction(() => /실패|시간/.test(document.querySelector('#aiStatus').textContent), null, { timeout: 15000 });
  check('AI 서버 부재 시 안전한 실패 안내', (await txt('#aiStatus')).includes('결정론 분석과 보고서는 그대로'));
  const prev = await txt('#aiPreview');
  check('AI 전송 내용에 회사명·식별정보 없음', !/orgName|사업자|계좌/.test(prev) && !prev.includes('비코닉'));
  // 셀 수정 → 수정기록
  await page.click('#t-grid');
  const inp = page.locator(`input[data-y="${Y[2]}"][data-k="assets"]`);
  await page.selectOption('#unitSel', '백만원');
  await inp.fill('1210');
  await inp.dispatchEvent('change');
  const log = await page.evaluate(() => S.editLog.length);
  check('파일값 수정 시 수정 기록 남음', log === 1);
  check('대차 불일치 시 AI 차단', await page.locator('#btnAI').isDisabled());
  const risks = await txt('#risks');
  check('대차 불일치 → 판단 보류 표시', risks.includes('대차 불일치'));
}

// 4. 음의 자본·매출 0 (JSON 불러오기)
{
  const y = Y;
  const mk = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { v: v * 1e6, src: 'json' }]));
  const data = {
    [y[0]]: mk({ assets: 500, liabilities: 600, equity: -100, currentAssets: 200, currentLiabilities: 400, paidInCapital: 300, revenue: 0, operatingIncome: -80, netIncome: -90 }),
    [y[1]]: mk({ assets: 450, liabilities: 640, equity: -190, currentAssets: 150, currentLiabilities: 420, paidInCapital: 300, revenue: 0, operatingIncome: -85, netIncome: -90 }),
    [y[2]]: mk({ assets: 400, liabilities: 680, equity: -280, currentAssets: 120, currentLiabilities: 450, paidInCapital: 300, revenue: 0, operatingIncome: -90, netIncome: -90, interestExpense: 0 }),
  };
  await page.evaluate((d) => importJSON({ baseYear: years()[2], unit: '백만원', org: { name: '테스트', industry: '정보통신업(소프트웨어·IT)' }, data: d }), data);
  const kpi = await txt('#dash');
  check('자본 음수: 부채비율 음수 표기 안 함(표시 보류)', kpi.includes('표시 보류') && !/부채비율[\s\S]{0,30}-\d/.test(kpi));
  const risks = await txt('#risks');
  check('자본 음수: 완전자본잠식 징후', risks.includes('자본총계 0 이하'));
  check('매출 0: 매출 미발생 안내', risks.includes('매출 미발생'));
  const det = await txt('#detail');
  check('매출 0: 이익률 산출불가', det.includes('산출 불가'));
  check('매출 0: 증가율 표시 보류(전기 0)', det.includes('표시 보류'));
  check('이자비용 0: 이자보상배율 미산출', !/이자보상배율\s+[\d-]/.test(det));
  check('음수/0 케이스 NaN/Infinity 없음', await noBadNumbers());
}

// 5. XLSX (단일 연도 시트 + 단위 천원)
{
  const ws = XLSX.utils.aoa_to_sheet([['표준재무상태표'], [`사업연도 ${Y[2]}년 01월 01일 ~ ${Y[2]}년 12월 31일`], ['(단위: 천원)'], ['과목', '금액'], ['Ⅰ. 유동자산', '1,234,567'], ['자산총계', 3000000], ['부채총계', 1000000], ['자본총계', 2000000], ['매출액', 5000000], ['영업이익(손실)', '(120,000)']]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'BS');
  const buf = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  await page.setInputFiles('#fileIn', { name: 'bs.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf });
  await page.waitForSelector('#candidates .cand', { timeout: 15000 });
  const c = await txt('#candidates');
  check('XLSX: 회계연도 인식', c.includes(`${Y[2]}년 (문서 인식)`));
  check('XLSX: 천원 단위 인식', /천원/.test(await page.locator('[data-res-unit]').last().inputValue()));
  check('XLSX: 괄호 음수 인식', c.includes('(120,000)') && c.includes('-120'));
  await page.click('[data-drop="0"]');
}

// 6. PDF (표준재무제표증명 유사 텍스트 PDF)
{
  const p2 = await ctx.newPage();
  await p2.setContent(`<html><body style="font-family:'WenQuanYi Zen Hei';font-size:12px">
  <h2>표준재무상태표 증명</h2><p>상호(법인명) 주식회사 테스트상사   사업자등록번호 123-45-67890</p>
  <p>사업연도 ${Y[2]}년 01월 01일 ~ ${Y[2]}년 12월 31일</p><p>(단위 : 원)</p>
  <table>${[['Ⅰ. 유동자산', '001', '812,345,000'], ['(1) 당좌자산', '002', '500,000,000'], ['1. 현금및현금성자산', '003', '120,000,000'], ['자산총계', '228', '2,345,678,000'], ['부채총계', '330', '1,345,678,000'], ['자본총계', '390', '1,000,000,000'], ['매출액', '500', '3,210,000,000'], ['영업이익(손실)', '590', '-45,000,000']].map((r) => `<tr>${r.map((c) => `<td style="padding:2px 30px">${c}</td>`).join('')}</tr>`).join('')}</table></body></html>`);
  const pdfBuf = await p2.pdf({ format: 'A4' });
  await p2.close();
  await page.setInputFiles('#fileIn', { name: 'nts.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
  await page.waitForSelector('#candidates .cand', { timeout: 20000 });
  const c = await txt('#candidates');
  check('PDF: 계정 인식(자산총계·매출액·영업이익)', ['자산총계', '매출액', '영업이익(손실)'].every((k) => c.includes(k)), c.slice(0, 200));
  check('PDF: 코드 대신 금액 선택', c.includes('2,345,678,000') && !/자산총계\s+자산총계\s+228\s/.test(c));
  check('PDF: 연도·단위 인식', c.includes(`${Y[2]}년 (문서 인식)`) && c.includes('단위 인식'));
  check('PDF: 사업자번호 마스킹', c.includes('123-45-*****') && !c.includes('67890'));
  check('PDF: 음수 영업손실 인식', c.includes('-45,000,000'));
  await page.locator('#candidates .cand').first().screenshot({ path: path.join(OUT, 'pdf-candidates.png') });
  await page.click('[data-drop="0"]');
}

// 6b. 레드팀 — 홈택스 표준재무제표증명 서식(글자 단위·2단 배치) 가상 픽스처
{
  const mkPdf = async (opts) => { const q = await ctx.newPage(); await q.setContent(ntsHtml(opts)); const b = await q.pdf({ format: 'A4' }); await q.close(); return b; };
  const fx = [fixtureYear(Y[0], 1), fixtureYear(Y[1], 1.1, 900_000_000), fixtureYear(Y[2], 1.2)];
  const pdfs = await Promise.all(fx.map((f) => mkPdf(f)));
  await page.evaluate(() => { clearAll(); S.org.name = ''; S.org.industry = ''; });
  await page.setInputFiles('#fileIn', pdfs.map((b, i) => ({ name: `nts-${fx[i].year}.pdf`, mimeType: 'application/pdf', buffer: b })));
  await page.waitForFunction(() => S.pending.length === 3, null, { timeout: 30000 });
  const pend = await page.evaluate(() => S.pending.map((r) => ({ y: r.fileYear, nts: r.nts, co: r.meta.company, biz: r.meta.biz })));
  check('NTS: 발급일(2026년)이 아닌 사업연도로 연도 인식', pend.map((x) => x.y).join() === Y.join(), pend.map((x) => x.y).join());
  check('NTS: 서식·발급번호·세무서·신고구분 인식', pend.every((x) => x.nts?.form === '일반법인용' && x.nts.issueNo === '1234-567-8901-234' && x.nts.office === '가상세무서' && x.nts.report === '정기신고'));
  check('NTS: 상호 인식·사업자번호 마스킹', pend.every((x) => x.co === '(가상)테스트상사 주식회사' && x.biz === '123-45-*****'));
  const cc = await page.evaluate(() => { const c = crossCheck(); return { blocked: c.blocked, same: c.sameCompany, bal: c.rows.map((r) => r.bal), pl: c.rows.map((r) => r.pl) }; });
  check('NTS: 교차검증(같은 회사·대차·손익 일치)', !cc.blocked && cc.same && cc.bal.every(Boolean) && cc.pl.every(Boolean), JSON.stringify(cc));
  const zero = await page.evaluate(() => S.pending[0].items.filter((i) => i.zero).map((i) => i.k + ':' + i.conf));
  check('NTS: 표시 없는 0원 계정은 확인 필요 후보(보통)로 제시', zero.length > 0 && zero.every((z) => z.endsWith(':mid')), zero.join(','));
  await page.click('#btnApplyAll');
  let mism = [];
  for (const f of fx) for (const [k, v] of Object.entries(f.expect)) { const got = await page.evaluate(([y, kk]) => V(y, kk), [f.year, k]); if (got !== Math.round(v)) mism.push(`${f.year} ${k} ${got}≠${v}`); }
  check('NTS: 3개년 일괄 반영 값이 원본과 100% 일치(2단 자본총계·음수 결손금 포함)', !mism.length, mism.join(' | '));
  check('NTS: 3개년 대차 검증 통과', ((await txt('#vcards')).match(/검증 통과/g) || []).length === 3);
  check('NTS: 회사명·업종 자동 제안', (await page.evaluate(() => [S.org.name, S.org.industry].join('|'))) === '(가상)테스트상사 주식회사|제조업');
  await page.fill('#orgName', '다른 이름');
  await page.evaluate(() => applyRes({ ...S.sources[0], items: [], meta: { company: '(가상)테스트상사 주식회사' }, file: 'x' }));
  check('NTS: 사용자가 입력한 법인명은 덮어쓰지 않음', (await page.evaluate(() => S.org.name)) === '다른 이름');
  check('NTS: 비교가능성 자동 대조 근거 표시', (await txt('#confirmEvidence')).includes('상호·사업자번호가 같습니다'));
  const pay = await page.evaluate(() => JSON.stringify(aiPayload(metrics(), findings(metrics()))));
  check('NTS: AI 전송에 상호·사업자번호·발급번호 없음', !/테스트상사|123-45|1234-567/.test(pay));
  const fids = await page.evaluate(() => findings(metrics()).map((f) => f.id));
  check('진단: 특수관계인 차입금·미지급금 신호 규칙 동작', fids.includes('F-INSIDER'), fids.join(','));

  // 다른 회사 + 같은 연도 섞기 → 일괄 반영 차단
  await page.evaluate(() => clearAll());
  const other = await mkPdf({ ...fixtureYear(Y[2]), company: '(가상)다른회사 주식회사', biz: '999-88-77777' });
  await page.setInputFiles('#fileIn', [{ name: 'a.pdf', mimeType: 'application/pdf', buffer: pdfs[2] }, { name: 'b.pdf', mimeType: 'application/pdf', buffer: other }]);
  await page.waitForFunction(() => S.pending.length === 2, null, { timeout: 30000 });
  const c2 = await txt('#candidates');
  check('레드팀: 다른 회사 서류 섞임 → 일괄 반영 차단', (await page.locator('#btnApplyAll').isDisabled()) && c2.includes('서로 다른 상호') && c2.includes('서로 다른 사업자번호'));
  check('레드팀: 같은 연도 파일 중복 경고', c2.includes(`${Y[2]}년 자료가 여러 파일`));
  // 같은 파일 두 번
  await page.evaluate(() => clearAll());
  await page.setInputFiles('#fileIn', [{ name: 'a.pdf', mimeType: 'application/pdf', buffer: pdfs[2] }]);
  await page.waitForFunction(() => S.pending.length === 1, null, { timeout: 30000 });
  await page.setInputFiles('#fileIn', [{ name: 'a-copy.pdf', mimeType: 'application/pdf', buffer: pdfs[2] }]);
  await page.waitForFunction(() => S.sources.some((s) => /중복/.test(s.status)), null, { timeout: 30000 });
  check('레드팀: 동일 파일 재업로드 무시', (await page.evaluate(() => S.pending.length)) === 1);
  // 1개 연도만 → 누락 연도 안내, 검증 미완료
  const c3 = await txt('#candidates');
  check('레드팀: 3개 중 1개만 업로드 → 누락 연도 안내', c3.includes(`${Y[0]}, ${Y[1]}년`));
  await page.click('#btnApplyAll');
  for (const c of await page.locator('[data-confirm]').all()) await c.check();
  check('레드팀: 1개년만으로는 검증 완료 불가', !(await txt('#verifyBadge')).includes('검증 완료'));
  // 분석 기간 밖 연도
  await page.evaluate(() => clearAll());
  await page.setInputFiles('#fileIn', [{ name: 'old.pdf', mimeType: 'application/pdf', buffer: await mkPdf(fixtureYear(Y[2] - 5)) }]);
  await page.waitForFunction(() => S.pending.length === 1, null, { timeout: 30000 });
  check('레드팀: 분석 기간 밖 연도 경고·미반영', (await txt('#candidates')).includes('분석 기간') && (await page.evaluate(() => S.pending[0].items.every((i) => !document.querySelector(`[data-ci="0:${S.pending[0].items.indexOf(i)}"]`).checked))));
  // 수정신고
  await page.evaluate(() => clearAll());
  await page.setInputFiles('#fileIn', [{ name: 'amend.pdf', mimeType: 'application/pdf', buffer: await mkPdf({ ...fixtureYear(Y[2]), report: '수정 신고' }) }]);
  await page.waitForFunction(() => S.pending.length === 1, null, { timeout: 30000 });
  await page.click('#btnApplyAll');
  check('레드팀: 수정신고분 경고', (await txt('#confirmEvidence')).includes('정기신고가 아닌'));
  // 스캔(이미지) PDF
  await page.evaluate(() => clearAll());
  const q = await ctx.newPage(); await q.setContent('<img src="data:image/png;base64,' + readFileSync(path.join(here, '..', 'og-finance.png')).toString('base64') + '" style="width:600px">'); const scan = await q.pdf({ format: 'A4' }); await q.close();
  await page.setInputFiles('#fileIn', [{ name: 'scan.pdf', mimeType: 'application/pdf', buffer: scan }]);
  await page.waitForFunction(() => S.sources.some((s) => /이미지 PDF/.test(s.status)), null, { timeout: 30000 });
  check('레드팀: 스캔(이미지) PDF → 수동 입력 안내', (await page.evaluate(() => S.pending.length)) === 0);
  await page.evaluate(() => clearAll());
}

// 7. 통장: 계좌 간 이체 매칭
{
  const a = '거래일자,적요,입금,출금,잔액\n2025-01-03,매출입금 A사,"5,000,000",,15000000\n2025-01-05,B계좌로 이체,,"3,000,000",12000000\n2025-02-10,급여,,"4,000,000",8000000\n';
  const b = '거래일시,내용,맡기신금액,찾으신금액,거래후잔액\n2025.01.05 10:00,A계좌에서,3000000,0,3000000\n2025.02.01 09:00,국세청 부가세,0,500000,2500000\n';
  await page.fill('#bkAlias', '주거래 A');
  await page.setInputFiles('#bkFile', { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(a) });
  await page.waitForSelector('#bank .acct');
  await page.fill('#bkAlias', '보조 B');
  await page.setInputFiles('#bkFile', { name: 'b.csv', mimeType: 'text/csv', buffer: Buffer.from(b) });
  await page.waitForFunction(() => document.querySelectorAll('#bank .acct').length === 2);
  const t = await txt('#bank');
  check('통장: 이체 후보 1쌍', t.includes('1쌍'));
  check('통장: 잔액 연속성 검증', t.includes('잔액 연속성 3/3 일치') || t.includes('잔액 연속성 2/2 일치'), t.match(/잔액 연속성[^\n]*/g)?.join(','));
  const before = await page.evaluate(() => analyzeBank().tin);
  await page.check('#bkX');
  const after = await page.evaluate(() => analyzeBank().tin);
  check('통장: 이체 제외 시 입금 중복 제거', before - after === 3000000, `${before}→${after}`);
  check('통장: 매출·영업현금흐름으로 표현 안 함', t.includes('매출액과 같지 않습니다') && !t.includes('영업현금흐름:'));
}

// 8. 신용·감사 구분
{
  await page.selectOption('#auOpinion', '비대상');
  const v = await txt('#creditView');
  check('감사 비대상과 의견거절 구분', v.includes('외부감사 비대상(의견거절과 다름)'));
  check('신용등급 미입력 시 미확인', v.includes('미확인'));
}

// 9. 비밀키 노출 없음
{
  const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');
  check('index.html에 API 키·키 이름 없음', !/ANTHROPIC_API_KEY|sk-ant-/.test(html));
  check('OG 이미지 절대 HTTPS URL', /og:image" content="https:\/\/beconic-diagnosis-finance\.netlify\.app\/og-finance\.png"/.test(html));
  check('메타 title과 OG title이 다름', html.match(/<title>([^<]+)/)[1] !== html.match(/og:title" content="([^"]+)/)[1]);
}

check('콘솔·페이지 오류 없음', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
writeFileSync(path.join(OUT, 'qa-results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
