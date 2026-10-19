/* global defaultBaseYear, fyPeriod, buildReport, years, V, S, importJSON, analyzeBank, clearAll, crossCheck, applyRes, aiPayload, metrics, findings, fundingEval, gradeRank, exportJSON, refresh, loanSummary, PROGRAMS, progEval -- page.evaluate 안에서 앱 전역 함수를 호출 */
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
  check('빈 상태: 업종 미선택 시 금융업 경고 숨김', !(await page.locator('#finWarn').isVisible()));
  check('빈 상태: 가상 데이터 배너 숨김', !(await page.locator('#sampleBanner').isVisible()));
  const yr = await page.evaluate(() => [defaultBaseYear(12, new Date(2026, 2, 31, 12)), defaultBaseYear(12, new Date(2026, 3, 1, 9)), defaultBaseYear(6, new Date(2026, 9, 19)), defaultBaseYear(3, new Date(2026, 5, 15))].join(','));
  check('기본 연도: 결산월·신고기한 기준 자동 계산', yr === '2024,2025,2026,2025', yr);
  const fy = await page.evaluate(() => { const p = fyPeriod(2025, 3); return p.start + '~' + p.end + '/' + p.deadline; });
  check('사업연도 기간: 3월 결산', fy === '2024.04.01~2025.03.31/2025.06.30', fy);
  check('푸터 저작권 연도 = 올해', (await page.locator('#footCo small').innerText()).includes('~' + new Date().getFullYear()));
  check('3단계 연도 선택·당기/전기/전전기 표시', (await page.locator('#yearChips').innerText()).includes('당기') && (await page.locator('#baseYear2 option').count()) > 3);
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
  check('보고서에 대시보드(카드·차트) 페이지 포함', ptxt.includes('핵심 지표 대시보드') && ptxt.includes('비율 추이') && ptxt.includes('이익률 추이'));
  check('보고서 NaN/undefined 없음', !/NaN|undefined|Infinity/.test(ptxt));
  execFileSync('pdftoppm', ['-r', '50', '-png', '-f', '1', '-l', '4', path.join(OUT, 'report-sample.pdf'), path.join(OUT, 'report-p')]);
  await page.evaluate(() => { document.querySelector('#report').innerHTML = ''; });
  await page.click('#btnClearSample');
  check('가상 데이터 지우기 시 가상 대출·제한사유도 삭제', (await page.evaluate(() => S.loans.length + Object.keys(S.dq).length)) === 0);
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
  check('XLSX: 회계연도 인식', c.includes(`${Y[2]}년 · 당기 (문서 인식)`));
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
  check('PDF: 연도·단위 인식', c.includes(`${Y[2]}년 · 당기 (문서 인식)`) && c.includes('단위 인식'));
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
  check('NTS: 입력표 단위가 원본 단위(원)를 따라감', (await page.evaluate(() => S.unit)) === '원');
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

// 8b. 신용·대출·지원자격 (v1.3) — 정의 기반 여력·사용자 기준 판정·개인신용 보호
{
  await page.click('#btnSample');
  await page.waitForTimeout(200);
  const f = await txt('#fund');
  check('대출·자격: 가상 예시 대출 3건 반영·여력 카드 표시', f.includes('기존 대출 잔액') && f.includes('3,750') && f.includes('이자 감당 기준 추가 차입 여력'));
  check('대출·자격: 영업이익 ≤ 기존 이자 → 추가 여력 없음', f.includes('추가 이자 감당 여력이 없습니다'));
  check('대출·자격: 기준 미입력 시 판정하지 않음 안내', f.includes('해당 항목은 판정하지 않았습니다'));
  const fids = await page.evaluate(() => findings(metrics()).map((x) => x.id));
  check('대출·자격: 1년 내 만기 > 현금 징후(F-DUE)', fids.includes('F-DUE'), fids.join(','));
  const room = await page.evaluate(() => { const keep = S.loans; S.loans = [{ id: 't', lender: 'x', type: '은행 신용', bal: 100e6, rate: 5, due: '', repay: '미확인', coll: '' }]; const r = fundingEval(metrics()).room; S.loans = keep; return r; });
  check('대출·자격: 여력 = (영업이익−기존이자)÷금리 (30−5)÷5% = 500백만원', Math.round(room) === 500e6, String(room));
  // 사용자 기준: 부채비율 상한 150% → 부채 800 감축 또는 자본 533.3 확충
  await page.evaluate(() => { document.querySelector('#critFold').open = true; });
  await page.fill('#cfDebtMax', '150'); await page.dispatchEvent('#cfDebtMax', 'change');
  let f2 = await txt('#fund');
  check('공고 기준: 부채비율 150% 초과 → 미충족·필요 감축/확충액 계산', f2.includes('부채비율 150% 이하') && f2.includes('부채 800백만원 감축') && f2.includes('자본 533백만원 확충'));
  await page.fill('#cfDebtMax', '-5'); await page.dispatchEvent('#cfDebtMax', 'change');
  check('레드팀: 음수 기준값 거부', (await page.evaluate(() => S.crit.debtMax)) === 150);
  // 등급 비교(같은 AAA~D 체계일 때만)
  const g = await page.evaluate(() => [gradeRank('BB+') < gradeRank('BBB-'), gradeRank('A0') < gradeRank('BBB'), gradeRank('B1'), gradeRank('bbb')].join());
  check('등급 비교: 표준 체계만 비교, 비표준 표기는 null', g === 'false,true,,10', g);
  await page.fill('#crRating', 'BB+'); await page.dispatchEvent('#crRating', 'change');
  await page.fill('#cfGrade', 'BBB-'); await page.dispatchEvent('#cfGrade', 'change');
  f2 = await txt('#fund');
  const st = (re) => page.evaluate((src) => fundingEval(metrics()).rows.filter((r) => new RegExp(src).test(r.label)).map((r) => r.status).join(), re);
  check('공고 기준: 요구 등급 미달 → 미충족', (await st('BBB- 이상')) === 'fail' && f2.includes('BBB- 이상'));
  await page.fill('#crRating', '우수(기관 자체 표기)'); await page.dispatchEvent('#crRating', 'change');
  check('공고 기준: 체계가 다른 등급은 자동 비교 안 함(확인 필요)', (await st('BBB- 이상')) === 'check' && (await txt('#fund')).includes('직접 대조'));
  // 업력
  await page.fill('#orgFounded', '2015-03-01'); await page.dispatchEvent('#orgFounded', 'change');
  await page.fill('#cfAgeMax', '7'); await page.dispatchEvent('#cfAgeMax', 'change');
  check('공고 기준: 업력 7년 초과 → 미충족', (await st('업력 7년')) === 'fail' && (await txt('#fund')).includes('업력 7년 이내'));
  // 개인신용평점: 범위·형식 검증
  for (const bad of ['1001', '0', '85.5', 'abc']) { await page.fill('#pNice', bad); await page.dispatchEvent('#pNice', 'change'); }
  check('레드팀: 평점 범위 밖·소수·문자 거부(1~1000 정수)', (await page.evaluate(() => S.person.nice)) === null);
  await page.fill('#pNice', '873'); await page.dispatchEvent('#pNice', 'change');
  await page.fill('#pKcb', '861'); await page.dispatchEvent('#pKcb', 'change');
  await page.fill('#pNiceDate', '2099-01-01'); await page.dispatchEvent('#pNiceDate', 'change');
  check('레드팀: 미래 조회일 거부', (await page.evaluate(() => S.person.niceDate)) === '');
  await page.fill('#cfScoreMin', '870'); await page.dispatchEvent('#cfScoreMin', 'change');
  check('공고 기준: 평점 둘 다 870 이상 → KCB 861로 미충족', (await st('870점 이상')) === 'fail');
  await page.selectOption('#cfScoreAgency', '둘 중 하나');
  check('공고 기준: 둘 중 하나 870 이상 → 충족', (await st('870점 이상')) === 'pass');
  const pay = await page.evaluate(() => JSON.stringify(aiPayload(metrics(), findings(metrics()))));
  check('개인정보: AI 전송에 평점·대출기관·제한사유·F-DUE 없음', !/873|861|A은행|정책자금\(|F-DUE|F-DQ|NICE|KCB/.test(pay));
  const dl = async () => { const [d] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportJSON())]); return JSON.parse(readFileSync(await d.path(), 'utf8')); };
  let j = await dl();
  check('개인정보: JSON 저장 기본값은 평점 제외', j.person && j.person.nice === undefined && !JSON.stringify(j).includes('873'));
  await page.check('#pSaveJson');
  j = await dl();
  check('개인정보: 사용자가 선택하면 JSON에 평점 포함·불러오기 복원', j.person.nice === 873);
  await page.evaluate((o) => { o.person.nice = 5000; o.loans.push({ lender: '<img src=x onerror=alert(1)>', type: '해킹', bal: -5, rate: 999, due: 'x' }); importJSON(o); }, j);
  const imp = await page.evaluate(() => ({ nice: S.person.nice, n: S.loans.length, last: S.loans[S.loans.length - 1] }));
  check('레드팀: JSON 불러오기 시 범위 밖 평점·잘못된 대출값 정화', imp.nice === null && imp.last.bal === null && imp.last.rate === null && imp.last.type === '기타' && imp.last.due === '', JSON.stringify(imp));
  check('레드팀: 대출 기관명 HTML 주입이 실행되지 않음(이스케이프)', (await page.locator('#loanTable img').count()) === 0);
  // 대출 입력 검증
  await page.evaluate(() => { S.loans = []; refresh(); });
  await page.click('#btnLoanAdd');
  const bal = page.locator('#loanTbl [data-f="bal"]').first();
  await bal.fill('-100'); await bal.dispatchEvent('change');
  check('레드팀: 음수 대출 잔액 거부', (await page.evaluate(() => S.loans[0].bal)) === null);
  await page.locator('#loanTbl [data-f="bal"]').first().fill('500'); await page.locator('#loanTbl [data-f="bal"]').first().dispatchEvent('change');
  await page.locator('#loanTbl [data-f="rate"]').first().fill('25'); await page.locator('#loanTbl [data-f="rate"]').first().dispatchEvent('change');
  await page.locator('#loanTbl [data-f="due"]').first().fill('2020-01-01'); await page.locator('#loanTbl [data-f="due"]').first().dispatchEvent('change');
  const lt = await txt('#loanTable');
  check('대출 입력: 백만원 단위 환산·최고금리 초과·만기 경과 경고', (await page.evaluate(() => S.loans[0].bal)) === 500e6 && lt.includes('법정 최고금리') && lt.includes('만기 경과'));
  // 제한 사유 있음 → 최우선 징후·판정
  await page.selectOption('[data-dq="tax"]', '있음');
  const f3 = await txt('#fund');
  check('제한 사유 있음 → 최우선 판정·보완 과제(납세증명서)', f3.includes('제한 사유 해소가 먼저입니다') && f3.includes('납세증명서 재발급'));
  check('제한 사유 있음 → 우선 확인 징후(F-DQ)', (await page.evaluate(() => findings(metrics()).find((x) => x.id === 'F-DQ')?.sev)) === 1);
  // PDF: 장 포함·평점 숫자 비표시(기본)
  await page.evaluate(() => { document.querySelector('#report').innerHTML = buildReport(); });
  await page.emulateMedia({ media: 'print' });
  writeFileSync(path.join(OUT, 'report-fund.pdf'), await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }));
  await page.emulateMedia({ media: 'screen' });
  const ft = execFileSync('pdftotext', ['-layout', path.join(OUT, 'report-fund.pdf'), '-']).toString();
  check('PDF: 대출 여력·지원자격 장과 보완 포함', ft.includes('대출 여력과 지원사업 재무자격') && ft.includes('재무자격 사전점검과 보완'));
  check('PDF: 평점 숫자는 기본 비표시(입력됨·판정만)', !/873|861/.test(ft) && ft.includes('KCB 입력됨'));
  check('PDF: NaN/undefined 없음(대출·자격)', !/NaN|undefined|Infinity/.test(ft));
  await page.locator('#s-fund').screenshot({ path: path.join(OUT, 'fund-1440.png') });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(150);
  check('375px: 신용·대출·자격 화면 가로 스크롤 없음', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 375);
  await page.locator('#s-credit').screenshot({ path: path.join(OUT, 'credit-375.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.querySelector('#report').innerHTML = ''; });
  await page.click('#btnClearSample');
  check('가상 데이터 지우기: 사용자가 입력한 대출은 유지', (await page.evaluate(() => S.loans.length)) === 1);
}

// 8c. v1.4 사용자 관점 — 모드 제거·버튼 통일·내비게이션·화면=PDF
{
  await page.click('#btnSample');
  await page.waitForTimeout(200);
  check('대표자/컨설턴트 모드 토글 제거', (await page.locator('[data-mode]').count()) === 0 && (await page.locator('.c-only').count()) === 0);
  const hs = await page.evaluate(() => [...document.querySelectorAll('main .btn:not(.small):not(.lg)')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height)));
  check('기본 버튼 높이 통일', hs.length >= 3 && new Set(hs).size === 1, [...new Set(hs)].join(','));
  const bad = [];
  for (const a of await page.locator('#stepper a').all()) {
    const step = await a.getAttribute('data-step'); await a.click(); await page.waitForTimeout(500);
    const ok = await page.evaluate((s) => { const h = document.querySelector('#s-' + s + ' h2').getBoundingClientRect(); return h.top >= document.querySelector('.stepper').getBoundingClientRect().bottom - 1 && h.top < innerHeight; }, step);
    if (!ok) bad.push(step);
  }
  check('내비게이션: 12단계 클릭 시 제목이 고정 메뉴에 가리지 않음', !bad.length, bad.join(','));
  const same = await page.evaluate(() => { const r = document.createElement('div'); r.innerHTML = buildReport(); const at = (sel) => [...document.querySelectorAll(sel + ' .atitle')].map((x) => x.textContent); const rep = [...r.querySelectorAll('.atitle')].map((x) => x.textContent); return ['#s-dash', '#s-detail', '#s-risk', '#s-fund', '#s-road'].every((s) => at(s).length && at(s).every((t) => rep.includes(t))); });
  check('화면 결과(④⑤⑥⑨⑪)의 핵심 메시지 = PDF 장 메시지', same);
  check('PDF에서 빈 외부 평가 단독 장 제거', !(await page.evaluate(() => buildReport().includes('외부 신용등급·감사 정보'))));
  const due = await page.evaluate(() => { const keep = [S.loans, S.loanAsOf]; const d = new Date(); d.setDate(d.getDate() + 30); S.loans = [{ id: 'z', lender: 'x', type: '기타', bal: 1e8, rate: 3, due: d.toISOString().slice(0, 10), repay: '미확인', coll: '' }]; S.loanAsOf = '2020-01-01'; const L = loanSummary(); [S.loans, S.loanAsOf] = keep; return [L.due12, L.stale].join(); });
  check('만기 도래는 오늘 기준·오래된 잔액 확인일 경고', due === '100000000,true', due);
  await page.click('#btnClearSample');
}

// 8d. 지원사업별 재무자격(2026년 공고 기준)
{
  await page.click('#btnSample');
  await page.waitForTimeout(200);
  await page.evaluate(() => { S.org.founded = ''; S.dq = {}; refresh(); });
  const ev = () => page.evaluate(() => Object.fromEntries(PROGRAMS.map((p) => [p.id, progEval(p).st])));
  let e = await ev();
  check('지원사업: 8개 사업 판정(창업·R&D·바우처·수출·인증·정책자금)', Object.keys(e).length === 8 && (await page.locator('#fund .pcard').count()) === 8);
  check('지원사업: R&D 부채비율 172.7% → 1,000% 기준 충족', e.rnd === 'pass');
  check('지원사업: 설립일 없으면 업력 사업은 확인 필요', e.early === 'check' && e.innobiz === 'check');
  check('지원사업: 혁신바우처 3년 평균 매출 127억(120~140억 사이) → 확인 필요', e.innov === 'check');
  await page.fill('#orgFounded', '2024-05-01'); await page.dispatchEvent('#orgFounded', 'change');
  await page.evaluate(() => { document.querySelector('#critFold').open = true; });
  await page.fill('#cfRnd', '800'); await page.dispatchEvent('#cfRnd', 'change');
  await page.fill('#cfExport', '50'); await page.dispatchEvent('#cfExport', 'change');
  e = await ev();
  check('지원사업: 업력 2.5년 → 초기창업 충족·도약 미충족·이노비즈 미충족', e.leap === 'fail' && e.innobiz === 'fail' && (await page.evaluate(() => progEval(PROGRAMS[0]).rows[0].st)) === 'pass');
  check('지원사업: 창업 3년 미만 벤처(연구개발비 800백만) → 비율 요건 미적용·충족', e.venture === 'pass');
  check('지원사업: 수출실적 50천 달러 → 수출초보 트랙', (await txt('#fund')).includes('수출초보'));
  await page.evaluate(() => { S.data[years()[2]].liabilities.v = S.data[years()[2]].equity.v * 12; refresh(); });
  e = await ev();
  check('레드팀: 부채비율 1,200% → R&D 미충족·필요 감축액 안내', e.rnd === 'fail' && (await txt('#fund')).includes('1,000% 미만이 되려면'));
  await page.click('[data-pc="창업"]');
  check('지원사업: 분야 선택(창업) 시 해당 사업만 표시', (await page.locator('#fund .pcard').count()) === 2);
  await page.click('[data-pc="전체"]');
  const rep = await page.evaluate(() => buildReport());
  check('PDF: 지원사업별 재무자격 표·출처 구분 포함', rep.includes('지원사업별 재무자격 (2026년 공고 기준)') && rep.includes('공고 원문 확인') && rep.includes('2차 자료'));
  check('AI 전송에 지원사업·설립일·수출실적 없음', !/수출|업력|설립|2024-05-01/.test(await page.evaluate(() => JSON.stringify(aiPayload(metrics(), findings(metrics()))))));
  await page.click('#btnClearSample');
  await page.evaluate(() => { S.org.founded = ''; S.crit.rnd = null; S.crit.exportK = null; refresh(); });
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
