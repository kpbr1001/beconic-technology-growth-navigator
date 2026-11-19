/* global sampleData, runDiagnosis, generateConsultingReport, generateTableOfContents, STAGE_DEFS, judgeStage, TYPE_ORDER, showChecklist, closeModal, openConsult, resumeDraft, esc, renderDashboard, goScreen, diagnosisResult:writable, REPORT_SECTION_COUNT, DOMAIN_META, fieldQuality, GUIDE, TEXT_KEYS, DOMAIN_META, EVIDENCE_LEVELS, loadSampleAndStart, completeDiagnosis, openReportMetaModal, generateReportFlow, proceedAfterQA, loadDiagnosisHistory, LS_KEY, startDiagnosis, renderStep -- page.evaluate 안에서 앱 전역을 호출 */
// BECONIC 고객문제·솔루션 적합성 진단(20번) QA — 실제 Chromium으로 PSF Engine v2 원칙·작성 가이드·사용자 플로우·모바일·A4 PDF를 확인한다.
// 실행: (psf 폴더를 정적 서버로 띄운 뒤) node psf/tests/qa.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://127.0.0.1:8796/';

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
await page.goto(BASE, { waitUntil: 'load' });

// 시나리오 입력을 만들어 엔진을 돌린다(샘플을 복제해 일부만 바꿈)
const run = (patch) => page.evaluate((patch) => {
  const d = JSON.parse(JSON.stringify(sampleData));
  for (const [sec, obj] of Object.entries(patch || {})) Object.assign(d[sec], obj);
  const r = runDiagnosis(d);
  return { total: r.totalScore, raw: r.rawTotal, grade: r.grade, conf: r.confidence, lv: r.evidence.level, scores: r.scores,
    issues: r.issues.map((i) => i.title), types: r.diagnosisTypes.map((t) => t.type), stage: r.stageFit, links: r.links };
}, patch);
const junk = '아아아아아아아아아아아아아아아아아아아아';
const allText = (v) => page.evaluate((v) => {
  const o = { problem: {}, customer: {}, solution: {}, validation: {}, execution: {} };
  const where = { problemStatement: 'problem', problemContext: 'problem', currentAlternatives: 'problem', whyNow: 'problem', customerSegment: 'customer', userPersona: 'customer', decisionMaker: 'customer', buyerPersona: 'customer', customerJob: 'customer', customerPain: 'customer', customerGain: 'customer', earlyAdopter: 'customer', solutionDescription: 'solution', coreFeatures: 'solution', painRelievers: 'solution', gainCreators: 'solution', uniqueValue: 'solution', customerOutcome: 'solution', replacementBehavior: 'solution', pilotTest: 'validation', feedbackSummary: 'validation', goToMarket: 'execution', salesChannel: 'execution', pricingStrategy: 'execution', keyMetrics: 'execution', nextExperiment: 'execution', resourceNeeds: 'execution', mainRisk: 'execution', mainProduct: null, targetMarket: null };
  TEXT_KEYS.forEach((k) => { if (where[k]) o[where[k]][k] = v; });
  return o;
}, v);

// 1. 표기 — 규칙 엔진인데 'AI 진단'으로 표기하지 않음
{
  const body = await page.locator('body').innerText();
  check('홈: "AI 진단"·"AI 기반"·"AI 사전진단" 표기 없음', !/AI 진단|AI 기반|AI 사전진단/.test(body));
  check('홈: 9개 영역 표기', body.includes('9개 영역'));
}

// 2. 엔진 구조
{
  const m = await page.evaluate(() => ({ n: DOMAIN_META.length, sum: DOMAIN_META.reduce((a, d) => a + d.max, 0), coh: DOMAIN_META.find((d) => d.key === 'coherence')?.max, val: DOMAIN_META.find((d) => d.key === 'validationEvidence')?.max, lv: EVIDENCE_LEVELS.length }));
  check('9개 영역 · 배점 합 100', m.n === 9 && m.sum === 100, `${m.n}영역 ${m.sum}점`);
  check('정합성 10점 신설 · 검증근거 20점', m.coh === 10 && m.val === 20);
  check('증거 등급 7단계(L0~L6)', m.lv === 7);
}

// 3. 원칙: 무의미 입력은 고득점 불가 (v1에서 '아아아…' = 100점 S등급)
{
  const r = await run({ ...(await allText(junk)), problem: { ...(await allText(junk)).problem, problemFrequency: '매일', problemSeverity: '매우 높음' } });
  check('무의미 반복 문자 입력 → 40점 미만', r.total < 40, `${r.total}점 ${r.grade}`);
  check('무의미 입력 → 신뢰도 판정 보류', r.conf.hold && r.conf.score < 40, `신뢰도 ${r.conf.score}`);
  check('무의미 입력 → 점검 사항에 감지', r.issues.includes('의미 없는 입력 감지'), r.issues.join(','));
  const ph = await run(await allText('없음'));
  check("자리채움('없음') 입력 → 40점 미만", ph.total < 40, `${ph.total}점`);
  const dup = await run(await allText('중소 제조기업이 설비 고장으로 생산을 못 하는 문제를 해결한다'));
  check('같은 문장을 모든 문항에 복사 → 중복 감지·저득점', dup.issues.includes('같은 문장 반복 입력') && dup.total < 55, `${dup.total}점`);
}

// 4. 원칙: 분량이 아니라 질 — 길고 모호한 문장 < 짧고 구체적인 문장
{
  const q = await page.evaluate(() => ({
    longVague: fieldQuality('problemStatement', '우리 회사는 고객들이 겪고 있는 여러 가지 다양한 문제들을 혁신적이고 창의적인 방법으로 해결하여 더 나은 미래를 만들어 가고자 하는 비전을 가지고 있습니다'),
    shortSpecific: fieldQuality('problemStatement', '제조기업은 설비 고장 때 라인이 월 2회 멈춰 1회 800만 원 손실을 본다'),
  }));
  check('길고 모호한 문장 < 짧고 구체적인 문장(품질가중)', q.longVague.f < q.shortSpecific.f, `${q.longVague.f.toFixed(2)} < ${q.shortSpecific.f.toFixed(2)}`);
}

// 5. 작성 가이드 자기 일관성 — 좋은 예는 체크를 모두 통과하고, 피할 예는 통과하지 못함
{
  const g = await page.evaluate(() => TEXT_KEYS.map((k) => ({ k, good: fieldQuality(k, GUIDE[k].good), bad: GUIDE[k].bad ? fieldQuality(k, GUIDE[k].bad) : null, how: !!GUIDE[k].how })));
  const goodFail = g.filter((x) => x.good.miss.length > 0 || x.good.f < 0.8).map((x) => `${x.k}[${x.good.miss.join(',')}]`);
  const badPass = g.filter((x) => x.bad && x.bad.f >= 0.6).map((x) => `${x.k}:${x.bad.f.toFixed(2)}`);
  check(`작성법·좋은 예 = 채점 기준 통과 (${g.length}개 서술 문항)`, goodFail.length === 0 && g.every((x) => x.how), goodFail.join(' '));
  check('피할 예는 0.6 미만(보강 필요)으로 채점', badPass.length === 0, badPass.join(' '));
  const ui = await page.evaluate(() => ({ fields: [...document.querySelectorAll('#screen-form [data-k]')].map((e) => e.dataset.k), guides: [...document.querySelectorAll('.f-guide')].map((e) => e.dataset.guide), meters: document.querySelectorAll('.f-meter').length, oldEx: document.querySelectorAll('.f-ex').length }));
  const noGuide = ui.fields.filter((k) => !['companyName', 'businessType', 'industry', 'businessStage', 'yearsInBusiness', 'employeeCount'].includes(k) && !ui.guides.includes(k));
  check('입력 문항마다 작성법·좋은 예 표시(기업 기본정보 제외)', noGuide.length === 0, noGuide.join(','));
  check('서술 문항마다 실시간 작성 체크 표시', ui.meters === (await page.evaluate(() => TEXT_KEYS.length)), `${ui.meters}개`);
}

// 6. 원칙: 정합성 · 증거 관문 · 모순 · 단계
{
  const s = await run({});
  check('샘플: 원점수 90↑ → L4(약속)라 S등급 관문 상한 89점(A)', s.raw >= 90 && s.total === 89 && s.grade === 'A' && s.lv === 4, `${s.raw}→${s.total} ${s.grade} L${s.lv}`);
  check('샘플: 신뢰도 80 이상 · 모든 연결 구간 연결됨', s.conf.score >= 80 && s.links.every((l) => l.status === '연결됨'), `신뢰도 ${s.conf.score}`);
  const mis = await run({ solution: { solutionDescription: '모바일 앱으로 직원 근태와 급여 정산을 자동화해 인사담당자의 업무 시간을 줄여준다.', painRelievers: '출퇴근 기록 자동화, 급여 계산 오류 감소', customerOutcome: '인사 업무 시간 70% 절감', uniqueValue: '타사 HR 앱 대비 월 2만 원 저렴, 근로기준법 자동 반영' } });
  check('문제와 무관한 솔루션 → 정합성 30% 미만 · 69점 이하 · 연결 단절', mis.scores.coherence < 3 && mis.total <= 69 && mis.issues.includes('문제 ↔ 솔루션 연결 단절'), `정합성 ${mis.scores.coherence} · ${mis.total}점`);
  const noev = await run({ validation: { customerInterviewCount: 0, surveyCount: 0, pilotTest: '', paidCustomer: '없음', repeatUsage: '없음', letterOfIntent: '없음', revenueEvidence: '아직 없음', feedbackSummary: '' } });
  check('검증 근거 없음 → L0 · B등급 불가(69점 이하) · 신뢰도 55 이하', noev.lv === 0 && noev.total <= 69 && noev.conf.score <= 55, `${noev.total}점 신뢰도 ${noev.conf.score}`);
  check('검증 근거 없음 + 심각도 높음 → 근거 없는 고심각도 상한', noev.issues.includes('근거 없는 고심각도 응답') && noev.scores.problemSeverity <= 5);
  const paid = await run({ company: { businessStage: '초기매출' }, validation: { customerInterviewCount: 25, surveyCount: 120, paidCustomer: '있음', revenueEvidence: '있음', repeatUsage: '있음', letterOfIntent: '있음' } });
  check('유료·매출·반복구매(L6) → S등급 가능', paid.lv === 6 && paid.grade === 'S', `${paid.total}점 ${paid.grade}`);
  const pr = await run({ validation: { paidCustomer: '있음', revenueEvidence: '아직 없음' } });
  check('유료 고객 있음 ↔ 매출 없음 → 모순 감지', pr.issues.includes('유료 고객 ↔ 매출 불일치'));
  const st = await run({ company: { businessStage: '성장' } });
  check("사업단계 '성장'인데 매출 없음 → 높음 수준 모순 · 신뢰도 감점", st.issues.includes('사업단계 ↔ 매출 불일치') && st.conf.score < s.conf.score, `신뢰도 ${s.conf.score}→${st.conf.score}`);
  const iv = await run({ validation: { feedbackSummary: '' } });
  check('인터뷰 12명인데 피드백 기록 없음 → 모순 감지', iv.issues.includes('인터뷰 기록 미제시'));
  const idea = await run({ company: { businessStage: '아이디어' } });
  check('같은 입력이면 점수 동일, 단계별 기대수준만 다름', idea.total === s.total && idea.stage.expected < s.stage.expected, `기대 ${idea.stage.expected} < ${s.stage.expected}`);
  check("정합성 단절 → '정합성부족형' 진단유형", mis.types.includes('정합성부족형'), mis.types.join(','));
}

// 7. 사용자 플로우 (실제 클릭) · 실시간 작성 체크 · 대시보드
{
  await page.evaluate(() => loadSampleAndStart());
  await page.waitForTimeout(200);
  await page.fill('[data-k="companyName"]', 'QA테스트기업');
  for (let i = 0; i < 6; i++) { await page.click('#btnNext'); await page.waitForTimeout(120); }
  await page.waitForTimeout(1600);
  const d = await page.evaluate(() => ({ active: document.querySelector('.screen.active')?.id, gauge: document.getElementById('gaugeVal').textContent, bars: document.querySelectorAll('#barChart .barrow').length, exp: document.querySelectorAll('#barChart .bar-exp').length, conf: document.getElementById('confPanel').innerText, ev: document.getElementById('evidencePanel').innerText, badge: document.getElementById('gradeBadge').innerText, cap: document.getElementById('capNote').innerText }));
  check('클릭 플로우: 6단계 → 대시보드', d.active === 'screen-dashboard' && d.gauge === '89', `게이지 ${d.gauge}`);
  check('대시보드: 9개 영역 막대 + 단계 기대수준 표시', d.bars === 9 && d.exp === 9);
  check('대시보드: 등급 배지에 신뢰도, 아래 줄에 상한 적용 표기', /신뢰도 \d+/.test(d.badge) && /원점수 9\d점/.test(d.cap), `${d.badge} / ${d.cap}`);
  check('대시보드: 신뢰도 패널·점검 사항 / 증거 사다리·연결 점검', d.conf.includes('증거 등급 관문 적용') && d.ev.includes('L4') && d.ev.includes('문제 → 솔루션'));
  const h = await page.evaluate(() => ({ key: LS_KEY, list: loadDiagnosisHistory().length }));
  check('진단 이력 저장(v2 키)', h.key.endsWith('_v2') && h.list >= 1);

  await page.evaluate(() => { document.querySelector('#screen-form [data-k="problemStatement"]').value = ''; });
  // eslint-disable-next-line no-undef -- 앱 전역 let(currentStep)에 직접 대입
  await page.evaluate(() => { startDiagnosis(); currentStep = 2; renderStep(); });
  await page.fill('[data-k="problemStatement"]', '제조업의 디지털 전환이 필요하다.');
  const m1 = await page.locator('[data-meter="problemStatement"]').innerText();
  await page.fill('[data-k="problemStatement"]', '중소 제조기업은 설비 고장 때 라인이 월 2회 멈춰 1회 800만 원 손실을 본다.');
  const m2 = await page.locator('[data-meter="problemStatement"]').innerText();
  check('실시간 작성 체크: 모호 → 보강 필요, 작성법대로 → 우수', m1.includes('보강 필요') && m2.includes('우수'), `${m1.split('\n').pop()} → ${m2.split('\n').pop()}`);
}

// 8. 모바일 375px — 가로 넘침 없음
{
  const mob = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await mob.goto(BASE, { waitUntil: 'load' });
  await mob.evaluate(() => { loadSampleAndStart(); });
  await mob.waitForTimeout(200);
  const formOv = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mob.evaluate(() => completeDiagnosis());
  await mob.waitForTimeout(1500);
  const dashOv = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mob.screenshot({ path: path.join(OUT, 'mobile-dashboard.png'), fullPage: false });
  check('모바일 375px: 입력·대시보드 가로 넘침 없음', formOv <= 1 && dashOv <= 1, `form ${formOv}px · dash ${dashOv}px`);
  await mob.close();
}

// 9. A4 PDF 보고서
{
  await page.evaluate(() => { loadSampleAndStart(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { completeDiagnosis(); openReportMetaModal(); generateReportFlow(); proceedAfterQA(); });
  await page.waitForTimeout(600);
  await page.emulateMedia({ media: 'print' });
  const pdfPath = path.join(OUT, 'psf-report-sample.pdf');
  const pdf = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('A4 PDF 생성', pdf.length > 50000 && pages >= 10 && pages <= 24, `${pages}쪽 · ${Math.round(pdf.length / 1024)}KB`);
  const py = spawnSync('python3', ['-c', 'import sys,pymupdf;print("".join(p.get_text() for p in pymupdf.open(sys.argv[1])))', pdfPath], { encoding: 'utf8' });
  const txt = py.status === 0 ? py.stdout : await page.evaluate(() => document.getElementById('reportContainer').textContent);
  check('PDF: 신뢰도·증거 등급·점검 사항·연결 점검·공개 산식 포함', ['진단 신뢰도', '증거 등급', '점검 사항', '문제-솔루션 연결 점검', '점수 산정 원칙'].every((x) => txt.includes(x)), py.status === 0 ? 'PDF 텍스트 검사' : 'DOM 대체 검사');
  check('PDF: AI 진단 표기 없음', !/AI 진단|AI 사전진단|AI 기반/.test(txt));
  await page.emulateMedia({ media: 'screen' });
}

// 10. v2.2 레드팀 회귀 — PDF 점검·하드코딩·고객 여정·디자인
{
  await page.goto(BASE, { waitUntil: 'load' });
  const html = await page.content();
  check('회사 대표번호 단일 출처(02-6124-5960), 옛 번호(070-4103-4177) 없음', html.includes('02-6124-5960') && !html.includes('4103-4177'));
  const cnt = await page.evaluate(() => ({ dom: document.querySelector('[data-count="domains"]').textContent, n: DOMAIN_META.length, types: document.querySelector('[data-count="types"]').textContent, tl: TYPE_ORDER.length }));
  check('개수 표기는 정의에서 계산(영역·유형)', cnt.dom === `${cnt.n}개 영역` && cnt.types === `${cnt.tl}대`, `${cnt.dom} · ${cnt.types}`);
  const r = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(sampleData)); const res = runDiagnosis(d);
    const rep = generateConsultingReport(d, res, { recipientCompany: '', confidentialityLevel: '대외 참고용', reportPurpose: '경영 진단 참고' });
    const toc = []; generateTableOfContents(d, res, { set tableOfContents(v) { toc.push(...v); } });
    return { stage: STAGE_DEFS[judgeStage(res)].name, strat: rep.finalRecommendation.strategy, optC: rep.strategicOptions[2].fit, weak: res.weaknesses.join(' '), kpi: res.kpiTable.map((k) => k.kpi).join(','), q1: rep.twelveMonthRoadmap[0].theme, risk: res.riskTable.map((x) => x.resp).join(' '), rec0: res.recommendations[0].title, toc: toc.length, sec: REPORT_SECTION_COUNT, head: rep.executiveSummary.headline };
  });
  check('유료고객 없는(L4) 샘플 → 사업화 단계 시장검증(스케일 아님)', r.stage === '시장검증', r.stage);
  check('L4 → 최종 권고 전략 B(유료 전환 우선), 세일즈 가속(C) 적합도 낮음', r.strat.startsWith('전략 B') && r.optC === '낮음', r.strat);
  check('경영요약 헤드라인 = 다음 증거 관문(유료 전환)', r.head.includes('유료 전환'), r.head);
  check('5개 연결 모두 연결됨 → 약점에 "연결 약함" 없음(구 단어일치 오판 제거)', !/연결이 약/.test(r.weak), r.weak.slice(0, 60));
  check('1순위 권고 = 증거 사다리 다음 단계', r.rec0.includes('유료 전환'), r.rec0);
  check('KPI 표에 대표가 쓴 지표 반영(알림 정확도 79%→90%)', r.kpi.includes('알림 정확도'), r.kpi);
  check('12개월 Q1 = 현재 증거(L4)의 다음 단계(유료 전환)', r.q1.includes('유료 전환'), r.q1);
  check('리스크 대응 = 대표가 쓴 대응 문장(→ 뒤)', r.risk.includes('고객별 임계값 튜닝'));
  check('목차 수 = 개수 상수(보고서 섹션 수 하드코딩 방지)', r.toc === r.sec, `${r.toc}/${r.sec}`);

  // 모달: 체크리스트가 QA 모달을 덮어쓰지 않음 · 상담 모달
  const m = await page.evaluate(() => { loadSampleAndStart(); return true; });
  await page.waitForTimeout(150);
  const md = await page.evaluate(() => { completeDiagnosis(); showChecklist(); closeModal('infoModal'); openReportMetaModal(); generateReportFlow();
    const t = document.querySelector('#qaModal h3').textContent; closeModal('qaModal'); openConsult();
    const c = document.getElementById('infoBody').innerHTML; closeModal('infoModal'); return { t, c }; });
  check('체크리스트 후에도 QA 모달 제목 유지(덮어쓰기 버그)', m && md.t === '보고서 검수 결과', md.t);
  check('상담: alert 대신 전화·메일 링크(진단 요약 포함)', md.c.includes('tel:0261245960') && md.c.includes('mailto:start@gven.kr') && md.c.includes('%EC%A7%84%EB%8B%A8%20%EC%9A%94%EC%95%BD'));

  // 임시저장·이어하기
  await page.evaluate(() => { localStorage.removeItem('beconic_psf_draft_v1'); startDiagnosis({ fresh: true }); });
  await page.fill('[data-k="companyName"]', '이어하기테스트');
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'load' });
  const bar = await page.locator('#resumeBar').innerText();
  await page.evaluate(() => resumeDraft());
  const restored = await page.inputValue('[data-k="companyName"]');
  check('입력 자동 임시저장 → 새로고침 후 이어하기 복원', bar.includes('이어서 작성') && restored === '이어하기테스트', bar.slice(0, 30));
  page.once('dialog', (dlg) => dlg.dismiss());
  await page.evaluate(() => { goScreen('landing'); startDiagnosis(); });
  const afterNew = await page.evaluate(() => localStorage.getItem('beconic_psf_draft_v1'));
  check('임시저장 있을 때 새 진단 → 확인 후에만 지움(조용한 덮어쓰기 방지)', afterNew === null);

  // XSS: 새로 문장을 만드는 칸(지표·리스크·실험·사용자)에 태그 주입
  const x = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(sampleData)); const bad = '<img src=x onerror="window.__xss=1">';
    d.execution.keyMetrics = bad + ' 전환율 0%→30%'; d.execution.mainRisk = bad + ' → ' + bad; d.execution.nextExperiment = bad; d.customer.userPersona = bad;
    Object.keys(d).forEach((sec) => Object.keys(d[sec]).forEach((k) => { if (typeof d[sec][k] === 'string') d[sec][k] = esc(d[sec][k]); }));
    // eslint-disable-next-line no-undef -- 앱 전역 let(diagnosisInput)에 직접 대입(window 속성이 아님)
    diagnosisInput = d; diagnosisResult = runDiagnosis(d); goScreen('dashboard'); renderDashboard(d, diagnosisResult);
    openReportMetaModal(); generateReportFlow(); proceedAfterQA();
    return { imgs: document.querySelectorAll('img[src="x"]').length };
  });
  await page.waitForTimeout(300);
  check('XSS: 새 문장 생성 칸에 태그 주입해도 실행·삽입 없음', x.imgs === 0 && !(await page.evaluate(() => window.__xss)));

  // 디자인·앱
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check('본문 폰트 Pretendard', /Pretendard/.test(font), font.slice(0, 40));
  const mf = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); const j = await r.json(); return { ok: r.ok, icons: j.icons.length, name: j.short_name }; });
  check('앱 설치: manifest·아이콘 제공', mf.ok && mf.icons >= 3, mf.name);
  const sw = await page.evaluate(async () => (await fetch('sw.js')).ok);
  check('앱 설치: 서비스 워커 파일 제공(/api/ 캐시 제외)', sw);
  const mob = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await mob.goto(BASE, { waitUntil: 'load' });
  await mob.evaluate(() => { loadSampleAndStart(); });
  await mob.waitForTimeout(150);
  await mob.evaluate(() => completeDiagnosis());
  await mob.waitForTimeout(400);
  const mb = await mob.evaluate(() => ({ bar: getComputedStyle(document.querySelector('#screen-dashboard .m-bottom')).display, jump: [...document.querySelectorAll('.dash-jump a')].every((a) => document.querySelector(a.getAttribute('href'))), nav: document.querySelector('.topnav').scrollHeight }));
  check('모바일: 결과 하단 고정 버튼 · 바로가기 대상 모두 존재 · 상단 메뉴 한 줄', mb.bar === 'flex' && mb.jump && mb.nav < 50, JSON.stringify(mb));
  await mob.close();
}
// 11. PDF 품질 회귀 (pymupdf 있을 때)
{
  const py = spawnSync('python3', ['-c', `
import sys,pymupdf
d=pymupdf.open(sys.argv[1])
low=[i+1 for i,p in enumerate(d) if i>0 and len(p.get_text())<250]
fonts=set()
for p in d:
  for b in p.get_text('dict')['blocks']:
    for l in b.get('lines',[]):
      for sp in l['spans']:
        if sp['text'].strip().startswith('Page') or '진단보고서' in sp['text']: fonts.add(sp['font'])
print(len(d),'|',','.join(map(str,low)),'|',';'.join(sorted(fonts)))`, path.join(OUT, 'psf-report-sample.pdf')], { encoding: 'utf8' });
  if (py.status === 0) {
    const [n, low, fonts] = py.stdout.trim().split('|').map((x) => x.trim());
    check('PDF: 빈 쪽(본문 250자 미만) 없음 — 스코어카드 쪽 분할 수정', low === '', `${n}쪽 · 빈쪽 ${low || '없음'}`);
    void fonts; // Chromium은 가변 폰트를 Type3로 넣어 PDF에서 폰트 이름을 읽을 수 없음 → 아래 DOM 검사로 대체
  } else check('PDF 품질 검사(pymupdf 없음 — 생략)', true, 'pymupdf 미설치');
}
{
  const run = await page.evaluate(() => (document.getElementById('pageRunStyle') || {}).textContent || '');
  check('PDF 머리글·바닥글: Pretendard 지정 + 회사 상수(인증번호)에서 생성', /Pretendard/.test(run) && run.includes('제2025-684호') && run.includes('counter(page)'));
}

check('콘솔·페이지 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const fail = results.filter((r) => !r.pass);
writeFileSync(path.join(OUT, 'qa-result.json'), JSON.stringify({ total: results.length, failed: fail.length, results }, null, 2));
console.log(`\n${results.length - fail.length}/${results.length} 통과`);
process.exit(fail.length ? 1 : 0);
