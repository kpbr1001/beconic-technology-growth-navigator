/* global ESG -- page.evaluate 안에서 앱 테스트 훅(window.ESG)을 호출 */
// BECONIC ESG 경영준비도 진단 QA — 실제 Chromium으로 엔진 원칙·사용자 플로우·레드팀 회귀·이어하기·위임·인쇄·모바일·A4 PDF를 확인한다.
// 실행: node esg/tests/qa.mjs [baseUrl]   (baseUrl 생략 시 esg/index.html 을 file:// 로 연다)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || pathToFileURL(path.join(here, '..', 'index.html')).href;

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
const requests = [];
async function fresh(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(BASE);
  return { ctx, page };
}
const PROFILE = { industry: '제조', size: '10~49인', mfg: '예', export: '아니오', big: '예', asked: '예', invest: '아니오' };
async function fillProfile(page, prof) {
  await page.click('#startBtn');
  for (const [k, v] of Object.entries(prof)) await page.click(`.chip[data-k="${k}"][data-v="${v}"]`);
  await page.click('#next');
}
// 질문을 끝까지 응답. ans(n) → 0~3 | 'u' | null(중단). k1(page) → 숫자 문항 처리
async function answerAll(page, ans, k1) {
  let n = 0;
  for (let i = 0; i < 40; i++) {
    if (await page.$('[data-mode]')) { await k1(page); const nx = await page.$('#nxt'); if (nx && await nx.isEnabled()) { await nx.click(); continue; } return 'k1-blocked'; }
    if (!(await page.$('.qhead'))) return 'done';
    const r = ans(n++); if (r === null) return 'stopped';
    await page.click(r === 'u' ? '.linkbtn[data-v="u"]' : `.opt[data-v="${r}"]`);
    await page.waitForTimeout(240);
  }
  return 'loop';
}
const k1Bill = async (p) => { await p.click('[data-mode="bill"]'); await p.click('[data-bill="2"]'); };
const bodyText = (page) => page.locator('body').innerText();

// 1. 홈·표기
{
  const { ctx, page } = await fresh();
  const t = await bodyText(page);
  check('홈 렌더 · 시안 문구 없음', t.includes('진단 시작하기') && !/시안/.test(t));
  check('푸터: 회사 정보·인증번호·버전', /제2025-684호/.test(t) && t.includes('v2.0.0') && t.includes('start@gven.kr'));
  const meta = await page.evaluate(() => ({ core: ESG.Q.filter((q) => !q.kind && !q.cond).length, cond: ESG.Q.filter((q) => q.cond).length, refs: ESG.Q.every((q) => q.r && q.r.length), docs: ESG.Q.filter((q) => !q.kind).every((q) => q.doc && q.s), w: Object.values(ESG.W).every((r) => r.reduce((a, b) => a + b, 0) === 100) }));
  check('문항 수: 핵심 18 · 조건부 6', meta.core === 18 && meta.cond === 6, JSON.stringify(meta));
  check('모든 문항에 참조 기준·준비 서류·짧은 이름', meta.refs && meta.docs);
  check('업종 가중치 합계 = 100 (10개 업종)', meta.w);
  await ctx.close();
}

// 2. 기본 플로우 → 8개 섹션 리포트
{
  const { ctx, page } = await fresh();
  await fillProfile(page, PROFILE);
  const st = await answerAll(page, (n) => [1, 0, 2, 1][n % 4], k1Bill);
  const t = await bodyText(page);
  check('전체 응답 후 리포트 생성', st === 'done' && !!(await page.$('#s8')), st);
  check('리포트 8개 섹션', (await page.$$('.rsec')).length === 8);
  check('리포트에 null·NaN·undefined 없음', !/\bnull\b|NaN|undefined/.test(t));
  const caps = await page.evaluate(() => { const R = ESG.analyze(); return { len: R.P.map((p) => p.length), proj: R.proj }; });
  check('Phase 용량 4/6/6/5 이하', caps.len.every((n, i) => n <= [4, 6, 6, 5][i]), caps.len.join('/'));
  check('점수 전망 단조 증가(감소 없음)', caps.proj.every((v, i) => !i || v >= caps.proj[i - 1]), caps.proj.join('→'));
  const g = await page.evaluate(() => ESG.analyze().risks.every((r) => r.grade === ESG.gradeOf(r.L, r.S)));
  check('리스크 등급 = 등급 규칙', g);
  const tools = await page.$$eval('.tool', (as) => as.map((a) => a.href));
  check('추천 후속 진단 2~4개 · BECONIC 도메인', tools.length >= 2 && tools.length <= 4 && tools.every((h) => /beconic-(diagnosis|grant)/.test(h)), String(tools.length));
  await page.screenshot({ path: path.join(OUT, 'report-desktop.png'), fullPage: true });
  // 이어하기: 새로고침 후 저장값
  await page.reload();
  check('새로고침 후 이어하기 안내', (await bodyText(page)).includes('진행 중이던 진단이 있어요'));
  await page.click('#resumeBtn');
  check('이어하기 → 완료 진단은 리포트로', !!(await page.$('#s1')));
  // 인쇄: 참조 숨김, 산출 방식표 펼침, 인쇄 머리말
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const pr = await page.evaluate(() => ({ ref: [...document.querySelectorAll('.ref')].filter((e) => getComputedStyle(e).display !== 'none').length, fold: document.querySelector('details.fold').open, head: getComputedStyle(document.querySelector('.print-only')).display, top: getComputedStyle(document.querySelector('.top')).display, law: [...document.querySelectorAll('.ref-line')].filter((e) => getComputedStyle(e).display !== 'none').length }));
  check('인쇄: 참조 기준 제외 · 산출 방식표 포함 · 근거 법령 포함 · 머리말 표시', pr.ref === 0 && pr.fold && pr.head === 'block' && pr.top === 'none' && pr.law > 0, JSON.stringify(pr));
  const pdf = await page.pdf({ path: path.join(OUT, 'report-a4.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('A4 PDF 생성', pages >= 3, `${pages}쪽`);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await ctx.close();
}

// 3. 레드팀 회귀
{
  const base = { industry: '서비스', mfg: '아니오', export: '아니오', big: '아니오', asked: '아니오', invest: '아니오' };
  // 1인 기업 + 전부 아니오 → 선행 진단 안내 모달 → 그래도 진행
  let { ctx, page } = await fresh({ width: 390, height: 860 });
  await fillProfile(page, { ...base, size: '1인·프리랜서' });
  check('극초기 1인 기업 → 선행 진단 안내 모달', !(await page.$eval('#modal', (m) => m.hidden)));
  await page.click('[data-mb="0"]');
  await answerAll(page, () => 1, async (p) => { await p.click('[data-mode="none"]'); await p.click('[data-none="guide"]'); });
  let t = await bodyText(page);
  check('1인 기업: 사람·안전 영역 null 노출 없음', !/\bnull\b|NaN/.test(t) && t.includes('해당 없음'));
  check('1인 기업: 높음 없으면 단계적 관리 문장', t.includes('단계적으로 관리'));
  check('모바일 390px 가로 스크롤 없음', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.screenshot({ path: path.join(OUT, 'report-mobile-solo.png'), fullPage: true });
  await ctx.close();
  // 전부 모름 → 리포트 미생성
  ({ ctx, page } = await fresh());
  await fillProfile(page, { ...base, size: '2~9인' });
  await answerAll(page, () => 'u', async (p) => { await p.click('[data-mode="none"]'); await p.click('[data-none="later"]'); });
  check('전부 모름 → 리포트 미생성', (await bodyText(page)).includes('응답이 부족해요'));
  await ctx.close();
  // 일부만 응답 → 리포트 미생성
  ({ ctx, page } = await fresh());
  await fillProfile(page, { ...base, size: '10~49인' });
  await answerAll(page, (n) => (n < 3 ? 0 : null), async () => {});
  await page.click('[data-go="result"]');
  check('일부 응답(3문항) → 리포트 미생성', (await bodyText(page)).includes('응답이 부족해요'));
  await ctx.close();
  // 전부 최고 + 실측 → 유지 문구, 탄소량
  ({ ctx, page } = await fresh());
  await fillProfile(page, { industry: '제조', size: '50~299인', mfg: '예', export: '예', big: '예', asked: '예', invest: '예' });
  await answerAll(page, () => 3, async (p) => { await p.click('[data-mode="exact"]'); await p.fill('#kwh', '50000'); });
  t = await bodyText(page);
  check('전부 최고 → 100점 · 유지 문구 · 모순 문장 없음', t.includes('100') && t.includes('유지하면서') && !/가장 취약한 곳/.test(t));
  check('실측 50,000kWh → 참고 탄소량 약 272tCO₂e', t.includes('약 272'));
  await ctx.close();
  // 비정상 kWh → 다음 버튼 비활성
  ({ ctx, page } = await fresh());
  await fillProfile(page, { ...base, size: '10~49인' });
  const st = await answerAll(page, () => 2, async (p) => { await p.click('[data-mode="exact"]'); await p.fill('#kwh', '999999999'); });
  check('월 9억 kWh 입력 → 진행 차단', st === 'k1-blocked');
  await ctx.close();
}

// 4. 잠정 → 보완 → 확정, 기한 경과
{
  const { ctx, page } = await fresh();
  await fillProfile(page, PROFILE);
  await answerAll(page, () => 1, async (p) => { await p.click('[data-mode="none"]'); await p.click('[data-none="later"]'); });
  check('나중에 입력 → 잠정 배지', (await page.textContent('.status')).includes('잠정'));
  await page.fill('#fixKwh', '3200'); await page.click('#fixBtn');
  check('보완 입력 → 확정', (await page.textContent('.status')).includes('확정'));
  await page.evaluate(() => { const s = ESG.S; s.k1 = { mode: 'none', kwh: '', bill: -1, none: 'later', contract: 'auto', dueAt: Date.now() - 1000 }; });
  await page.click('[data-go="result"]');
  const t = await bodyText(page);
  check('보완 기한 경과 → 미확보로 확정 + 안내', (await page.textContent('.status')).includes('확정') && t.includes('보완 기한 경과'));
  await ctx.close();
}

// 5. 담당자 위임 화면
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '#kwh-request');
  await page.reload();
  check('#kwh-request → 담당자 입력 화면', (await bodyText(page)).includes('담당자 확인 요청'));
  await page.fill('#dkwh', '4100');
  check('담당자 입력 → 대표님께 보낼 메시지', (await page.textContent('#dmsg')).includes('4,100 kWh') && await page.isEnabled('#dcopy'));
  await ctx.close();
}

// 6. 외부 요청: 폰트 CDN 외 없음
{
  const ext = [...new Set(requests.filter((u) => /^https?:/.test(u)).map((u) => new URL(u).host))];
  check('외부 요청은 폰트 CDN(cdn.jsdelivr.net)만', ext.every((h) => h === 'cdn.jsdelivr.net'), ext.join(',') || '없음');
}

check('스크립트 오류 0건', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const fail = results.filter((r) => !r.pass);
writeFileSync(path.join(OUT, 'qa-result.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - fail.length}/${results.length} 통과`);
process.exit(fail.length ? 1 : 0);
