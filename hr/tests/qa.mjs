/* global renderRoadmap, redactPII, goHome, computeScores, loadSample, S, DRIVERS, HR_ITEMS, OUTCOMES, exportJSON, aiPayload, allowedNumbers, checkText, renderResult, fillCover -- page.evaluate 안에서 앱 전역 함수를 호출 */
// BECONIC HR 진단 QA — 실제 Chromium으로 규칙 엔진·사용자 플로우·모바일·AI 화면 계약·A4 PDF를 확인한다.
// 실행: (hr 폴더를 정적 서버로 띄운 뒤) node hr/tests/qa.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://127.0.0.1:8791/';

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

// 엔진 호출 도우미: 모든 문항을 v로 채운 응답
const fill = (v) => page.evaluate((v) => { const e = {}; DRIVERS.forEach((d) => d.q.forEach((_, i) => (e[`${d.id}_${i}`] = v))); OUTCOMES.forEach((o) => (e[o.id] = v)); return e; }, v);
const run = (emp, hr, company) => page.evaluate(([e, h, c]) => { const R = computeScores(e, h, { name: 'T', industry: 'IT', worktype: '원격', ...c }, {}); return JSON.parse(JSON.stringify(R)); }, [emp, hr, company]);

// 1. 소개 화면 문구: 실제와 다른 AI 표기·근거 없는 표현 제거
{
  const intro = await page.locator('#s0').innerText();
  check('소개: "AI 기반" 표기 없음', !/AI 기반|AI-assisted/.test(intro + (await page.locator('header').innerText())));
  check('소개: 근거 없는 "BCG·KPMG 방법론" 표현 없음', !/BCG|KPMG/.test(intro));
  check('헤더 배지 = 규칙 기반 진단', (await page.locator('#modeBadge').innerText()) === '규칙 기반 진단');
  check('소개: 문항 수 48 표기(10×3 + 4 + 14)', intro.includes('48문항') && (await page.evaluate(() => DRIVERS.length * 3 + OUTCOMES.length + HR_ITEMS.length)) === 48);
  const meta = await page.locator('meta[name=description]').getAttribute('content');
  check('메타 설명: 규칙 기반 + AI 선택', meta.includes('규칙 기반') && !meta.includes('AI 기반'));
}

// 2. 규칙 엔진 단위 검증
{
  const e3 = await fill(3);
  const allMiss = Object.fromEntries((await page.evaluate(() => HR_ITEMS.map((h) => h.id))).map((id) => [id, 2]));
  let R = await run(e3, allMiss, { headcount: 24 });
  check('제도 미충족 = 0점(기존 33점 오류 수정)', R.hrMaturity === 0, `hrMaturity=${R.hrMaturity}`);
  R = await run(e3, { H01: 1, H02: 4 }, { headcount: 24 });
  check("'모름'은 0점이 아닌 결측(성숙도 계산 제외)", R.hrMaturity === 100 && R.hrUnknown === 1);
  check("법정 의무 '모름' → 확인 필요 플래그", R.riskFlags.some((f) => f.id === 'H01' && f.level === 'unknown'));
  R = await run(e3, { H04: 2 }, { headcount: 9 });
  check('취업규칙: 9인 → 법정 리스크 아님(권고)', R.riskFlags.every((f) => !(f.id === 'H04' && f.isLegal)));
  R = await run(e3, { H04: 2 }, { headcount: 10 });
  check('취업규칙: 10인 → 전문가 검토 필요', R.riskFlags.some((f) => f.id === 'H04' && f.level === 'expert' && f.isLegal));
  R = await run(e3, { H09: 2 }, { headcount: 29 });
  const r29 = R.riskFlags.find((f) => f.id === 'H09');
  R = await run(e3, { H09: 2 }, { headcount: 30 });
  check('노사협의회: 29인 권고 / 30인 법정', (!r29 || !r29.isLegal) && R.riskFlags.some((f) => f.id === 'H09' && f.isLegal));
  R = await run(e3, { H01: 3 }, { headcount: 24 });
  check('법정 의무 부분충족 → 보완 권고(기존 누락)', R.riskFlags.some((f) => f.id === 'H01' && f.level === 'partial'));
  R = await run(e3, {}, { headcount: 24, ot: 13 });
  const ot24 = R.riskFlags.some((f) => f.id === 'XOT');
  R = await run(e3, {}, { headcount: 4, ot: 13 });
  check('연장근로 주 12시간 초과: 5인 이상만 법정 플래그', ot24 && !R.riskFlags.some((f) => f.id === 'XOT'));

  // 결측 처리: 영역에서 1문항만 답하면 그 문항만으로 점수
  const part = { ...e3 }; delete part.D01_1; delete part.D01_2; part.D01_0 = 5;
  R = await run(part, {}, { headcount: 24 });
  check('미응답 문항은 결측(남은 문항 평균)', R.drivers.find((d) => d.id === 'D01').score === 100 && R.drivers.find((d) => d.id === 'D01').n === 1);

  // 로드맵: 고정 배치가 아니라 점수에 따라 달라짐
  const strong = await fill(5); strong.D09_0 = 1; strong.D09_1 = 2; strong.D09_2 = 1;
  R = await run(strong, {}, { headcount: 24 });
  const planIds = [...R.plan[30].drivers, ...R.plan[60].drivers, ...R.plan[90].drivers];
  check('로드맵: 강점 영역(D04·D06 등)은 과제에서 제외', planIds.length > 0 && planIds.every((id) => id === 'D09'), planIds.join(','));
  check('우선순위: 65점 이상 영역은 개선 과제 아님', R.priorities.filter((p) => p.type === 'driver' && p.eligible).every((p) => p.ref === 'D09'));
  check('재진단 목표 = 다음 구간 하한', R.plan.targets[0].target === 35 && R.plan.targets[0].cur === 8, JSON.stringify(R.plan.targets[0]));
  const weakA = await fill(2); weakA.D02_0 = 1; weakA.D02_1 = 1; weakA.D02_2 = 1;
  const RA = await run(weakA, {}, { headcount: 24 });
  check('로드맵: 1순위 영역이 30일에 배치', RA.plan[30].drivers[0] === RA.topDriverIds[0]);

  // 결정론
  const a = await run(e3, allMiss, { headcount: 24, turnover: 5 });
  const b = await run(e3, allMiss, { headcount: 24, turnover: 5 });
  check('결정론: 같은 입력 → 같은 결과', JSON.stringify(a) === JSON.stringify(b));

  // 응답 패턴
  R = await run(await fill(5), {}, { headcount: 24 });
  check('일률 응답(전부 5) → 신뢰도 낮음 + 관대화 신호', R.confidence.level === '낮음' && R.signals.some((s) => s.id === 'FLAT') && R.signals.some((s) => s.id === 'HIGH'));
  // 객관 지표 교차검증
  const e4 = await fill(4); e4.D01_0 = 3; e4.D03_1 = 5;
  R = await run(e4, { H05: 4 }, { headcount: 20, turnover: 6, hires: 10, early: 4, leave: 30, ot: 14 });
  const ids = R.signals.map((s) => s.id).join(',');
  check('교차검증: 이직률·연장근로·연차·조기퇴사 불일치 탐지', ['TOV', 'OTX', 'LVX', 'ERX'].every((x) => ids.includes(x)), ids);
  check('불일치 2건 이상 → 문제정의 "인식 차이" 유형', R.problem.type === 'perception');
  check('이직률 = 퇴사 ÷ 인원 (6/20=30%)', R.objective.turnoverRate === 30 && R.objective.earlyRate === 40);
  R = await run(e3, {}, { headcount: 24, turnover: 6, salary: 4800 });
  check('이직 대체비용 = 퇴사×연봉×0.5~2 (Gallup 범위)', R.objective.costLow === 14400 && R.objective.costHigh === 57600);
  R = await run(e3, {}, { headcount: 24 });
  check('객관 지표 미입력 → 추정하지 않음(null)', R.objective.turnoverRate === null && R.objective.costLow === null);
}

// 3. 실제 입력 플로우 (데스크톱)
{
  await page.click('.btn-hx >> nth=0');
  await page.fill('#c_name', '<img src=x onerror=alert(1)>테스트');
  await page.selectOption('#c_industry', '제조');
  await page.fill('#c_headcount', '12');
  check('인원 입력 시 규모 구간 자동 표시', (await page.locator('#c_band').innerText()).includes('10~29명'));
  await page.click('#c_worktype .chip >> nth=0');
  await page.fill('#c_turnover', '2');
  await page.click('text=다음: 조직 진단 →');
  for (let p = 0; p < 11; p++) {
    const groups = page.locator('#empPage .scale');
    const n = await groups.count();
    for (let i = 0; i < n; i++) await groups.nth(i).locator('button.sc').nth((i + p) % 5).click();
    await page.click('#empNext');
  }
  check('조직 진단 → 제도 점검 이동', await page.locator('#s3').isVisible());
  const tags = await page.locator('#hrPage').innerText();
  check('12인: 취업규칙 = 법정 의무, 노사협의회 = 30인 이상 의무·현재 권고', /취업규칙[\s\S]*?법정 의무/.test(tags) && tags.includes('상시 30인 이상 의무 · 현재 권고'));
  const hrGroups = page.locator('#hrPage .scale');
  for (let i = 0; i < (await hrGroups.count()); i++) await hrGroups.nth(i).locator('button.sc').nth(i % 4).click();
  await page.click('text=진단 결과 분석 →');
  const res = await page.locator('#result').innerText();
  check('결과: 경영진 요약·문제정의·노무·갭 매트릭스 표시', res.includes('경영진 요약') && res.includes('STEP 1') && res.includes('인사·노무 리스크') && (await page.locator('svg.matrix').count()) === 1);
  check('결과: NaN/undefined 없음', !/NaN|undefined|Infinity/.test(res));
  check('XSS: 회사명 태그가 실행되지 않고 문자로 표시', res.includes('<img src=x') && (await page.locator('#result img').count()) === 0);
  check('결과: 응답 신뢰도와 근거(응답률) 표시', /응답 신뢰도\s*(높음|보통|낮음)/.test(res) && res.includes('응답률'));
  await page.click('text=실행 로드맵 보기 →');
  const rm = await page.locator('#roadmap').innerText();
  check('로드맵: 공개 산식·KPI 산식·출처 목록 표시', rm.includes('0.6 × 심각도') && rm.includes('÷') && rm.includes('Edmondson (1999)') && rm.includes('ISO 45003'));
  check('로드맵: 120일 재측정 표(현재→목표)', rm.includes('120일 목표'));
  check('로드맵: NaN/undefined 없음', !/NaN|undefined|Infinity/.test(rm));
}

// 4. 가상 예시 + 저장·비교 + AI 화면 계약
{
  await page.evaluate(() => loadSample());
  const res = await page.locator('#result').innerText();
  check('예시: 가상 데이터 배너', res.includes('가상 예시 데이터'));
  check('예시: 이직 대체비용 1.4억원~5.8억원', res.includes('1.4억원~5.8억원'));
  check('예시: 취업규칙(24인) 전문가 검토 + 의무교육 미충족', res.includes('취업규칙') && res.includes('법정 의무교육'));
  const g = await page.evaluate(() => { const P = S.result.plan, rows = document.querySelectorAll('#result .gantt .g-row'); const bar = rows[P[30].legal.length]?.querySelector('.g-bar'); return { rows: rows.length, expect: P[30].legal.length + Math.min(S.result.topDriverIds.length, 4) + P[90].legal.length + 1, top: bar?.getAttribute('style') || '', idx: [...document.querySelectorAll('#result > .card')].findIndex((c) => c.classList.contains('gantt-card')) }; });
  check('결과 보고서에 120일 로드맵 한눈에(경영진 요약 바로 다음)', g.rows === g.expect && g.idx === 2, JSON.stringify(g));
  check('로드맵 한눈에: 1순위 영역은 30일 착수·60일 완료 막대', g.top.includes('left:calc(0% + 4px)') && g.top.includes('width:calc(50% - 8px)'));
  check('예시: 가상 데이터는 AI 요청 차단', await page.locator('#btnAI').isDisabled());
  const dl = page.waitForEvent('download');
  await page.evaluate(() => exportJSON());
  const file = await dl;
  const fp = path.join(OUT, 'sample-result.json');
  await file.saveAs(fp);
  const doc = JSON.parse(readFileSync(fp, 'utf8'));
  check('결과 파일: 스키마·점수 포함, 자유서술 제외', doc.schema === 'beconic.hr-diagnosis' && doc.scores.drivers.D09 === 17 && !JSON.stringify(doc).includes('평가 기준이 달라'));
  // 이전 결과로 비교 (점수 일부를 낮춘 파일)
  doc.scores.ohi -= 5; doc.scores.drivers.D09 = 10; doc.createdAt = '2026-06-30T00:00:00Z';
  writeFileSync(path.join(OUT, 'prev.json'), JSON.stringify(doc));
  await page.setInputFiles('#result input[type=file]', path.join(OUT, 'prev.json'));
  await page.waitForTimeout(200);
  const cmp = await page.locator('#result').innerText();
  check('재진단 비교: 변화(▲) 표시', cmp.includes('▲7') && cmp.includes('이전('));
  writeFileSync(path.join(OUT, 'bad.json'), JSON.stringify({ schema: 'x' }));
  await page.setInputFiles('#result input[type=file]', path.join(OUT, 'bad.json'));
  check('잘못된 파일은 거부(앱 정상)', (await page.locator('#result').innerText()).includes('경영진 요약'));

  // AI 계약: 실제 데이터 상태에서 모의 서버로 응답 → 수치 대조·금지 표현 차단·배지 전환
  await page.evaluate(() => { S.sample = false; S.prev = null; });
  await page.evaluate(() => { document.getElementById('result').innerHTML = ''; });
  await page.evaluate(() => { const R = S.result; window.__p = aiPayload(R); });
  const p = await page.evaluate(() => window.__p);
  check('AI 전송: 회사명·자유서술 미포함', !JSON.stringify(p).includes('샘플테크') && !JSON.stringify(p).includes('평가 기준이 달라') && p.drivers.length === 10);
  let posted = null;
  await page.route('**/api/hr-insights**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') { posted = { body: req.postDataJSON(), code: req.headers()['x-beconic-access'] }; return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job: '11111111-2222-3333-4444-555555555555' }) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: 'claude-opus-5-5', removed: 1, result: {
      executiveSummary: '학습·성장(17점)과 업무량이 가장 취약합니다. 업종 평균보다 낮습니다.',
      insights: [{ refIds: ['D09', 'Z99'], insight: '성장 경로 부재가 이직률 25%와 연결되었을 가능성이 있습니다.', soWhat: '퇴사자 면담으로 확인하세요.' }],
      interviewQuestions: [{ refId: 'D09', askWhom: '팀원', question: '최근 1년 동안 새로 배운 것은 무엇인가요?' }],
      actions: [{ priority: 'P1', ownerRole: 'HR', timeline: '30일', action: '연봉을 37% 올린다', firstStep: '보상 현황표 작성', kpiFormula: '1인당 교육시간 = 총 교육시간 ÷ 인원' }],
      limitations: ['구성원 응답 자료가 없습니다.'] } }) });
  });
  await page.evaluate(() => { renderResult(S.result); });
  await page.check('#aiConsent');
  await page.fill('#aiCode', 'code-1234');
  await page.click('#btnAI');
  await page.waitForSelector('.ai-out', { timeout: 10000 });
  const ai = await page.locator('#aiOut').innerText();
  check('AI: 이용 코드 헤더 전송·스키마 일치 본문', posted && posted.code === 'code-1234' && posted.body.drivers.length === 10);
  check('AI: 근거 없는 "업종 평균" 문장 차단', ai.includes('근거 없는 표현') && !ai.includes('업종 평균보다'));
  check('AI: 진단에 없는 수치(37%) 차단, 있는 수치(25%·17점)는 통과', ai.includes('진단 결과에 없는 수치(37)') && ai.includes('25%'));
  check('AI: 초안 라벨 표시 + 헤더 배지 전환', ai.includes('AI 초안 · 검토 필요') && (await page.locator('#modeBadge').innerText()).includes('AI 해석 초안'));
  const sample = await page.evaluate(() => { const p = aiPayload(S.result); const al = allowedNumbers(p); return [checkText('이직 확률이 높습니다.', al), checkText('외부 평균 자료가 없어 비교하지 않았습니다.', al)]; });
  check('AI 검사: 확률 표현 차단, 한계 설명 문장 허용', sample[0] && sample[1] === null);
  await page.unroute('**/api/hr-insights**');
}

// 5. 임시 저장 → 새로고침 후 이어하기
{
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('.btn-hx >> nth=0');
  await page.fill('#c_name', '이어하기㈜'); await page.selectOption('#c_industry', '서비스'); await page.fill('#c_headcount', '7');
  await page.click('#c_worktype .chip >> nth=1');
  await page.click('text=다음: 조직 진단 →');
  await page.locator('#empPage .scale').nth(0).locator('button.sc').nth(3).click();
  await page.reload();
  check('임시 저장: 새로고침 후 이어하기 안내', await page.locator('#draftBar').isVisible());
  await page.click('#draftBar button >> nth=0');
  check('이어하기: 응답 복원', await page.locator('#s2').isVisible() && (await page.locator('#empPage .sc.on').count()) === 1);
  check('키보드 접근: 응답 선택지가 button 요소', (await page.locator('#empPage button.sc').count()) === 15);
}

// 6. 모바일 375px 가로 넘침
{
  const m = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  const mp = await m.newPage();
  mp.on('dialog', (d) => d.accept());
  await mp.goto(BASE);
  const over = async () => mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const o1 = await over();
  await mp.click('.btn-hx >> nth=0'); const o2 = await over();
  await mp.evaluate(() => loadSample()); await mp.waitForTimeout(150); const o3 = await over();
  await mp.screenshot({ path: path.join(OUT, 'mobile-result.png'), fullPage: false });
  await mp.click('text=실행 로드맵 보기 →'); const o4 = await over();
  await mp.evaluate(() => { S.empIdx = 0; window.go(3); }); const o5 = await over();
  check('모바일 375px: 소개·기업정보·결과·로드맵·제도 가로 넘침 없음', [o1, o2, o3, o4, o5].every((x) => x <= 0), [o1, o2, o3, o4, o5].join(','));
  await m.close();
}

// 7. A4 PDF (가상 예시)
{
  await page.goto(BASE);
  await page.evaluate(() => loadSample());
  await page.click('text=실행 로드맵 보기 →');
  await page.evaluate(() => { fillCover(); const c = document.getElementById('pdfCover'); document.body.insertBefore(c, document.body.firstChild); });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ path: path.join(OUT, 'HR_Health_Navigator_v3_sample.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('A4 PDF 생성(표지+요약+본문)', pages >= 6 && pages <= 20, `${pages}쪽`);
  await page.emulateMedia({ media: 'screen' });
}

// 8. 레드팀 회귀 (2026-10-26 자가부검에서 찾은 결함)
{
  await page.goto(BASE);
  const fz = await page.evaluate(() => {
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pick = (a) => a[Math.floor(rnd() * a.length)];
    const bad = [];
    for (let t = 0; t < 300; t++) {
      const emp = {}; DRIVERS.forEach((d) => d.q.forEach((_, i) => { if (rnd() > 0.15) emp[`${d.id}_${i}`] = 1 + Math.floor(rnd() * 5); }));
      OUTCOMES.forEach((o) => { if (rnd() > 0.3) emp[o.id] = 1 + Math.floor(rnd() * 5); });
      const hr = {}; HR_ITEMS.forEach((h) => { if (rnd() > 0.2) hr[h.id] = 1 + Math.floor(rnd() * 4); });
      const hc = pick([1, 4, 5, 9, 10, 29, 30, 300]);
      const c = { name: 'F', industry: 'IT', worktype: '원격', headcount: hc, turnover: pick(['', 0, 3, hc * 3]), hires: pick(['', 4]), early: pick(['', 1]), leave: pick(['', 40]), ot: pick(['', 13]), salary: pick(['', 3000]) };
      try {
        const R = computeScores(emp, hr, c, {});
        if ([R.ohi, R.outcomeIndex, R.hrMaturity, ...R.drivers.map((d) => d.score)].some((v) => v != null && (!Number.isInteger(v) || v < 0 || v > 100))) bad.push('range' + t);
        Object.assign(S, { result: R, company: c, emp, hr, sample: false, prev: null, ai: null });
        renderResult(R); renderRoadmap(R); document.getElementById('aiPreview')?.remove();
        const txt = document.getElementById('result').innerText + document.getElementById('roadmap').innerText;
        if (/NaN|undefined|Infinity|\bnull\b|\[object/.test(txt)) bad.push('text' + t);
      } catch (e) { bad.push('throw' + t + e.message); }
    }
    return bad;
  });
  check('퍼징 300건: 예외·범위 이탈·NaN/null 표시 없음', fz.length === 0, fz.slice(0, 3).join(','));
  const top = await page.evaluate(() => { const e = {}; DRIVERS.forEach((d, k) => d.q.forEach((_, i) => (e[`${d.id}_${i}`] = (k + i) % 2 ? 5 : 4))); const hr = {}; HR_ITEMS.forEach((h) => (hr[h.id] = 4)); const R = computeScores(e, hr, { name: 'S', industry: 'IT', worktype: '원격', headcount: 20 }, {}); S.result = R; S.sample = false; renderResult(R); return document.querySelectorAll('.exec-row').length; });
  check('전 영역 안정 회사: 경영진 요약 과제 빈칸 없음(강화 과제)', top >= 1, String(top));
  await page.evaluate(() => localStorage.setItem('hrh-draft-v3', JSON.stringify({ at: Date.now(), company: { name: '진짜회사', headcount: 12 }, emp: { D01_0: 3 }, hr: {}, texts: {} })));
  await page.evaluate(() => { loadSample(); goHome(); });
  check('예시 결과 → 처음으로: 작성 중이던 임시 저장 보존', await page.evaluate(() => !!localStorage.getItem('hrh-draft-v3')));
  const fb = await page.evaluate(() => { loadSample(); S.sample = false; const al = allowedNumbers(aiPayload(S.result)); return ['근로기준법 제93조에 따라 점검하세요.', '10~29명 규모에서는 대표가 직접 하세요.', '상시 5인 이상이면 적용됩니다.'].map((x) => checkText(x, al)); });
  check('AI 수치 대조: 법 조문·규모 구간·기준 인원은 오탐 없음', fb.every((x) => x === null), JSON.stringify(fb));
  const pii = await page.evaluate(() => ['남궁민수 과장이', '팀장 김철수가', '팀장 회의가 길다', '대표 이사가 결정', '팀장 이번에'].map(redactPII));
  check('PII: 복성·직함 앞 이름 제거, 일반 단어는 유지', !pii[0].includes('민수') && !pii[1].includes('철수') && pii[2] === '팀장 회의가 길다' && pii[3] === '대표 이사가 결정' && pii[4] === '팀장 이번에', JSON.stringify(pii));
  const tr = await page.evaluate(() => { const e = {}; DRIVERS.forEach((d) => d.q.forEach((_, i) => (e[`${d.id}_${i}`] = 1 + (i % 5)))); return computeScores(e, {}, { name: 'T', industry: 'IT', worktype: '원격', headcount: 5, turnover: 40 }, {}).signals.map((x) => x.id); });
  check('퇴사인원 > 현재 인원 → 입력 확인 신호', tr.includes('TRX'));
  await page.goto(BASE);
  await page.click('.btn-hx >> nth=0');
  await page.evaluate(() => { document.getElementById('c_name').value = '가'.repeat(200); });
  await page.selectOption('#c_industry', '제조'); await page.fill('#c_headcount', '10'); await page.click('#c_worktype .chip >> nth=0');
  await page.click('text=다음: 조직 진단 →');
  check('회사명 60자 초과 거부(프로그램 입력 포함)', await page.locator('#s1').isVisible());
  await page.fill('#c_name', '정상㈜'); await page.fill('#c_turnover', '2.5');
  await page.click('text=다음: 조직 진단 →');
  check('퇴사인원 소수(2.5명) 거부', await page.locator('#s1').isVisible());
}

check('콘솔·페이지 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const fail = results.filter((r) => !r.pass);
console.log(`\n${results.length - fail.length}/${results.length} 통과`);
writeFileSync(path.join(OUT, 'qa-result.json'), JSON.stringify(results, null, 2));
process.exit(fail.length ? 1 : 0);
