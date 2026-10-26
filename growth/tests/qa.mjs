/* global scoreEngine, pickActivities, strengthsWeak, consistencyFlags, QUESTIONS, CONCERN_AREA, GAN, SRC, LIB, KPI_LIB -- page.evaluate 안에서 앱 전역을 호출 */
// BECONIC 성장진단(12번) QA — 실제 Chromium으로 규칙 엔진 원칙·사용자 플로우·모바일·재진단·A4 PDF를 확인한다.
// 실행: (growth 폴더를 정적 서버로 띄운 뒤) node growth/tests/qa.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://127.0.0.1:8792/';

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource|Framing 'https:\/\/app\.netlify\.com\//i.test(m.text())) errors.push(m.text()); });
await page.goto(BASE);

// 기본 프로필 + 모든 문항을 v로 채운 입력
const base = { name: 'T', depth: 'standard', stage: 'y13', ctype: 'small', industry: 'mfg', revenue: 'r15', emp: 'e59', customer: 'b2b', concern: ['cert'], prep: [], memo: {} };
const allAns = (v) => page.evaluate((v) => Object.fromEntries(QUESTIONS.map((q) => [q.id, v])), v);
const run = (d) => page.evaluate((d) => { const sc = scoreEngine(d); return JSON.parse(JSON.stringify(sc)); }, d);

// 1. 표기: 실제와 다른 AI 표기 없음
{
  const body = await page.locator('body').innerText();
  check('홈: "AI 사전 분석"·"AI 기반"·"룰 기반" 표기 없음', !/AI 사전 분석|AI 기반|AI 요약|룰 기반/.test(body));
  const html = await page.content();
  check('소스: "AI 사전 분석" 라벨 제거(규칙 기반 사전 분석)', !html.includes('AI 사전 분석') && html.includes('규칙 기반 사전 분석'));
  check('문항 수 = 27, 간이 = 9, 영역별 3문항', await page.evaluate(() => QUESTIONS.length === 27 && QUESTIONS.filter((q) => q.core).length === 9 && ['foundation','bm','sales','marketing','rnd','cert','finance','export','digital'].every((a) => QUESTIONS.filter((q) => q.area === a).length === 3 && QUESTIONS.filter((q) => q.area === a && q.core).length === 1)));
  const nSrc = await page.evaluate(() => Object.keys(SRC).length);
  check('홈: 근거 수 표기 = 출처 레지스트리 수', body.includes(`${nSrc}개 근거`), `SRC=${nSrc}`);
  check('모든 문항·활동에 출처 연결(존재하는 id)', await page.evaluate(() => [...QUESTIONS, ...LIB].every((x) => x.src && x.src.length && x.src.every((id) => SRC[id]))));
}

// 2. 규칙 엔진 원칙 (27개 Tool 진단 지적 대응)
{
  const a2 = await allAns(2);
  const s1 = await run({ ...base, ans: a2, revenue: 'r0', emp: 'e1' });
  const s2 = await run({ ...base, ans: a2, revenue: 'r100', emp: 'e50' });
  check('매출·인원이 달라도 같은 응답이면 영역점수 동일(규모로 점수 매기지 않음)', JSON.stringify(s1.areaScore) === JSON.stringify(s2.areaScore) && s1.total === s2.total, `total ${s1.total}/${s2.total}`);
  const s3 = await run({ ...base, ans: a2, stage: 'pre' });
  const s4 = await run({ ...base, ans: a2, stage: 'y7' });
  check('업력이 달라도 점수 동일, 기대수준만 달라짐', s3.total === s4.total && s3.expTotal < s4.expTotal, `exp ${s3.expTotal}→${s4.expTotal}`);
  const c0 = await run({ ...base, ans: a2, concern: [] });
  const c1 = await run({ ...base, ans: a2, concern: ['cert', 'rnd', 'org'] });
  check('고민을 골라도 점수 감점 없음', JSON.stringify(c0.areaScore) === JSON.stringify(c1.areaScore));
  check("고민 '조직관리' → 기초·체계 영역(디지털 오매핑 수정)", await page.evaluate(() => CONCERN_AREA.org === 'foundation'));
  const pr = await page.evaluate(([d, a]) => { const x = { ...d, ans: a, concern: ['org'] }; const sc = scoreEngine(x); return strengthsWeak(sc, x).weak.map((w) => w.a); }, [base, { ...a2, F1: 1, F2: 1, F3: 1 }]);
  check('조직 고민 + 경영체계 응답 낮음 → 기초·체계가 병목 1순위', pr[0] === 'foundation', pr.join(','));
  const unk = await run({ ...base, ans: { ...a2, B1: 'u', B2: 'u', B3: 3 } });
  check("'모름'은 0점이 아닌 결측(남은 문항만 평균)", unk.areaScore.bm === 100 && unk.confidence.nUnk === 2);
  const allU = await run({ ...base, ans: await allAns('u') });
  check("전부 '모름' → 점수 판정 보류(0점 아님)", allU.total === null && allU.confidence.tier === 'low');
  const na = await run({ ...base, ans: { ...a2, E1: 'na', E2: 'na', E3: 'na' } });
  check("수출 '해당 없음' → 수출 영역 제외(0점·감점 아님)", na.areaScore.export === null && na.status.export === 'na' && na.total === 67);
  const lv = await run({ ...base, ans: await allAns(0) });
  const lv3 = await run({ ...base, ans: await allAns(3) });
  check('행동 4단계 = 0·33·67·100', lv.total === 0 && (await run({ ...base, ans: await allAns(1) })).total === 33 && lv3.total === 100);
  check('보유 현황은 점수에 더하지 않음', (await run({ ...base, ans: a2, prep: ['patent', 'iso', 'venture', 'website', 'crm_erp', 'export_rec'] })).total === s1.total);
  check('일률 응답(전 문항 같은 단계) → 신뢰도 감점', lv3.confidence.straight && lv3.confidence.score <= 85);
  const fl = await page.evaluate(([d, a]) => consistencyFlags({ ...d, ans: a, prep: ['export_rec', 'patent'] }).map((f) => f.id), [base, { ...a2, E2: 0, R2: 0 }]);
  check('응답·보유현황 불일치 탐지(수출실적·특허)', fl.includes('X1') && fl.includes('X3'), fl.join(','));
  const q = await run({ ...base, depth: 'quick', ans: a2 });
  check('간이 진단: 9문항만 사용, 신뢰도 상한 70', q.confidence.asked === 9 && q.confidence.score <= 70);
}

// 3. 추천: 응답 근거 연결·보유 과제 제외
{
  const acts = await page.evaluate((d) => {
    const x = { ...d, ans: Object.fromEntries(QUESTIONS.map((q) => [q.id, 1])), prep: ['venture', 'iso'] };
    const sc = scoreEngine(x); return pickActivities(x, sc).map((a) => ({ id: a.id, r: a._reasons }));
  }, base);
  check('보유(벤처·ISO) 과제는 추천 제외', !acts.some((a) => a.id === 'c2' || a.id === 'c1'), acts.map((a) => a.id).join(','));
  check('추천마다 선정 근거(점수·기대수준·문항 응답) 표시', acts.length === 6 && acts.every((a) => a.r.length >= 2 && /기대/.test(a.r[0])));
  const done = await page.evaluate((d) => {
    const x = { ...d, ans: { ...Object.fromEntries(QUESTIONS.map((q) => [q.id, 1])), R2: 3 } };
    const sc = scoreEngine(x); return pickActivities(x, sc).map((a) => a.id);
  }, base);
  check("연결 문항이 '체계화'면 해당 과제 제외(R2=3 → 특허 출원 검토 제외)", !done.includes('r2'));
  const ex = await page.evaluate((d) => {
    const x = { ...d, industry: 'trade', stage: 'y57', ans: { ...Object.fromEntries(QUESTIONS.map((q) => [q.id, 2])), E1: 'na', E2: 'na', E3: 'na' } };
    const sc = scoreEngine(x); return pickActivities(x, sc).filter((a) => a.area === 'export').length;
  }, base);
  check("수출 '해당 없음'이면 수출 과제 추천 안 함(수출입 업종이어도)", ex === 0);
  const kpi = await page.evaluate(() => Object.values(KPI_LIB).flat().every((k) => k.basis && !/업종 평균/.test(k.g12 + k.g3)));
  check("KPI 목표에 근거 유형 표기, 출처 없는 '업종 평균' 목표 없음", kpi);
}

// 4. 실제 클릭 플로우 (데스크톱)
{
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE);
  await page.click('.hero-cta .btn-amber');
  await page.click('#btnNext');
  check('STEP1: 기업명 미입력 → 오류 표시', await page.locator('.field[data-k="name"] .err-tip.on').isVisible());
  await page.fill('#f-name', '플로우테스트');
  await page.click('#c-depth .chip-btn[data-v="standard"]');
  await page.click('#c-stage .chip-btn[data-v="y35"]');
  await page.click('#c-ctype .chip-btn[data-v="small"]');
  await page.click('#c-industry .chip-btn[data-v="svc"]');
  await page.click('#btnNext');
  await page.click('#c-revenue .chip-btn[data-v="r510"]');
  await page.click('#c-emp .chip-btn[data-v="e1029"]');
  await page.click('#c-customer .chip-btn[data-v="b2b"]');
  await page.click('#c-concern .chip-btn[data-v="org"]');
  await page.click('#btnNext');
  check('STEP3: 표준 진단 27문항 렌더', (await page.locator('.qa-card').count()) === 27);
  await page.click('#btnNext');
  check('STEP3: 미응답 있으면 진행 차단 + 안내', await page.locator('#q-err.on').isVisible() && (await page.locator('.qa-card.miss').count()) === 27);
  // 키보드로 첫 문항 선택(button 요소 → Enter)
  await page.locator('.qa-card').first().locator('.qa-opt').nth(2).focus();
  await page.keyboard.press('Enter');
  check('문항 선택지 키보드 선택 가능(aria-checked)', (await page.locator('.qa-card').first().locator('.qa-opt[aria-checked="true"]').count()) === 1);
  const cards = page.locator('.qa-card');
  for (let i = 1; i < 27; i++) {
    const c = cards.nth(i);
    if (i % 9 === 4) await c.locator('.qa-x[data-v="u"]').click();
    else await c.locator('.qa-opt').nth(i % 4).click();
  }
  check('응답 진행률 27/27', (await page.locator('#q-count').innerText()).includes('27 / 27'));
  await page.click('#btnNext');
  check('STEP4 보유 현황: "점수에 더하지 않습니다" 안내', (await page.locator('#fstep-4').innerText()).includes('점수에 더하지 않습니다'));
  await page.click('#col-3 .collapse-h'); await page.waitForTimeout(450);
  await page.click('.tg[data-v="website"]');
  check('STEP4: 결과 바로 보기 버튼 표시', await page.locator('#btnSkip').isVisible());
  await page.click('#btnNext');
  check('STEP5: 규칙 기반 사전 분석 표기', (await page.locator('#c-presum').innerText()).includes('규칙 기반 사전 분석'));
  await page.click('#btnNext');
  await page.waitForSelector('#v-result.on');
  const r = await page.locator('#resultRoot').innerText();
  check('결과: 핵심 문제 한 문장·단계 기대수준·응답 근거 섹션', r.includes('핵심 문제') && r.includes('기대') && r.includes('영역별 응답 근거와 다음 단계'));
  check('결과: 공공 지원·연계 진단 + 응답 점검 섹션', r.includes('공공 지원·연계 진단') && r.includes('응답 점검 결과'));
  check('결과: 조직 고민 → HR(24) 연계 진단 추천', r.includes('HR 진단'));
  check("결과: '모름' 문항 목록 표시", /'모름' 문항: .*[A-Z]\d/.test(r));
  // 임시 저장 → 새로고침 후 이어하기
  await page.goto(BASE);
  check('임시 저장: 새로고침 후 이어하기 안내', await page.locator('#resumeBar').isVisible());
  // 결과 파일 저장 → 재진단 비교
  await page.evaluate(() => GAN.go('diagnose'));
  await page.evaluate(() => GAN.skipToResult());
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("결과 파일 저장")')]);
  const fp = path.join(OUT, 'saved.json'); await dl.saveAs(fp);
  const saved = JSON.parse(readFileSync(fp, 'utf8'));
  check('결과 파일: schema·응답·요약 포함', saved.schema === 'beconic-growth/6' && Object.keys(saved.data.ans).length === 27 && saved.summary.areas);
  await page.evaluate(() => GAN.restart());
  await page.goto(BASE);
  await page.setInputFiles('.sample-banner .file-in', fp);
  await page.waitForSelector('#v-diagnose.on');
  check('재진단: 파일 불러오면 응답 복원', (await page.inputValue('#f-name')) === '플로우테스트');
  await page.evaluate(() => { const s = GAN._state(); s.data.ans.F1 = 3; s.data.ans.F2 = 3; GAN.skipToResult(); });
  const r2 = await page.locator('#resultRoot').innerText();
  check('재진단 비교 섹션: 영역별 ▲ 표시', r2.includes('재진단 비교') && r2.includes('▲'));
  // 잘못된 파일
  writeFileSync(path.join(OUT, 'bad.json'), JSON.stringify({ schema: 'x', data: {} }));
  await page.goto(BASE);
  await page.setInputFiles('.sample-banner .file-in', path.join(OUT, 'bad.json'));
  await page.waitForTimeout(200);
  check('재진단: 다른 형식 파일은 거부', (await page.locator('#toastMsg').innerText()).includes('결과 파일이 아닙니다'));
}

// 5. 공유 링크: 왕복·정제·메모 미포함·이름 기본 제외
{
  const url = await page.evaluate(() => { const s = GAN._state(); s.data = { ...s.data, name: '비밀회사', stage: 'y13', industry: 'it', revenue: 'r1', ctype: 'small', emp: 'e24', customer: 'b2b', concern: ['dx'], ans: { B1: 2, S1: 9, F1: '<img>' }, memo: { overview: '내부메모' } }; return GAN._buildShareURL(false); });
  const p = JSON.parse(Buffer.from(decodeURIComponent(url.split('#r=')[1]), 'base64').toString('utf8'));
  check('공유 링크: 기업명·컨설턴트 메모 미포함', !JSON.stringify(p).includes('비밀회사') && !JSON.stringify(p).includes('내부메모'));
  await page.goto(url); await page.reload(); await page.waitForSelector('#v-result.on');
  const st = await page.evaluate(() => GAN._state().data.ans);
  check('공유 링크: 허용 밖 응답 값 제거(정제)', st.B1 === 2 && st.S1 === undefined && st.F1 === undefined);
  await page.goto(BASE + '#r=' + encodeURIComponent(Buffer.from(JSON.stringify({ s: 'y13', i: 'it', r: 'r1' })).toString('base64')));
  await page.reload(); await page.waitForTimeout(300);
  check('v5 공유 링크는 열지 않고 안내', !(await page.locator('#v-result.on').count()));
  await page.goto('about:blank'); await page.goto(BASE);
}

// 6. 가상 예시: 사용자 입력을 덮어쓰지 않음
{
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto(BASE);
  await page.evaluate(() => GAN.go('diagnose'));
  await page.fill('#f-name', '내회사');
  await page.click('#c-stage .chip-btn[data-v="y1"]');
  await page.evaluate(() => GAN.loadSample());
  check('가상 예시: 결과 파일 저장 비활성', await page.locator('button:has-text("결과 파일 저장")').isDisabled());
  await page.evaluate(() => GAN.go('diagnose'));
  check('가상 예시 후 진단으로 돌아오면 내 입력 유지', (await page.inputValue('#f-name')) === '내회사' && (await page.evaluate(() => GAN._state().data.stage)) === 'y1');
}

// 7. 모바일 375px: 가로 넘침 없음
{
  const m = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await m.goto(BASE);
  const ov = async () => m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('모바일 홈: 가로 넘침 없음', (await ov()) <= 0, `${await ov()}px`);
  await m.evaluate(() => { GAN.go('diagnose'); const s = GAN._state(); s.data.stage = 'y13'; s.data.industry = 'mfg'; s.step = 3; GAN.go('diagnose'); });
  await m.waitForTimeout(200);
  check('모바일 STEP3 문항: 가로 넘침 없음', (await ov()) <= 0, `${await ov()}px`);
  await m.screenshot({ path: path.join(OUT, 'mobile-step3.png') });
  await m.evaluate(() => GAN.loadSample()); await m.waitForTimeout(400);
  check('모바일 결과: 가로 넘침 없음', (await ov()) <= 0, `${await ov()}px`);
  await m.screenshot({ path: path.join(OUT, 'mobile-result.png'), fullPage: true });
  await m.close();
}

// 8. A4 PDF (가상 예시 보고서)
{
  await page.evaluate(() => GAN.loadSample());
  await page.evaluate(() => { document.getElementById('rep-client').value = '그로스샘플 제조'; });
  await page.evaluate(() => { window.print = () => {}; GAN.openReportDialog(); document.getElementById('repGenerate').click(); document.querySelectorAll('#v-result details').forEach((x) => (x.open = true)); });
  await page.waitForTimeout(100);
  await page.emulateMedia({ media: 'print' });
  const pdfPath = path.join(OUT, 'growth-report-sample.pdf');
  const pdf = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('A4 PDF 생성(표지·목차 포함)', pdf.length > 50000 && pages >= 6, `${pages}쪽 · ${Math.round(pdf.length / 1024)}KB`);
  check('PDF: 18쪽 이하', pages <= 18, `${pages}쪽`);
  // PDF 본문 텍스트(pymupdf 있으면 실제 PDF, 없으면 인쇄 DOM)
  const py = spawnSync('python3', ['-c', 'import sys,pymupdf;print("".join(p.get_text() for p in pymupdf.open(sys.argv[1])))', pdfPath], { encoding: 'utf8' });
  const pdfTxt = py.status === 0 ? py.stdout : await page.evaluate(() => document.getElementById('resultRoot').textContent);
  check('PDF: 표지·응답 근거·공개 산식·근거 출처 포함', ['기업 성장활동 진단 보고서', '영역별 응답 근거와 다음 단계', '영역 우선도 = max(0', '근거·출처', 'Churchill'].every((s) => pdfTxt.includes(s)), py.status === 0 ? 'PDF 텍스트 검사' : 'DOM 대체 검사');
  check('PDF: AI 표기 없음', !/AI 사전 분석|AI 요약|AI 기반/.test(pdfTxt));
  await page.emulateMedia({ media: 'screen' });
}

check('콘솔·페이지 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const fail = results.filter((r) => !r.pass);
writeFileSync(path.join(OUT, 'qa-result.json'), JSON.stringify({ total: results.length, failed: fail.length, results }, null, 2));
console.log(`\n${results.length - fail.length}/${results.length} 통과`);
process.exit(fail.length ? 1 : 0);
