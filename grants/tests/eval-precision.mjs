/* global APP_CONFIG, ProgramProvider -- page.evaluate 안에서 앱 전역을 호출 */
// 매칭 정밀도 측정 — 고정 스냅샷(2026-10-30 운영 공고 1,642건)으로 8개 기업 유형의 결과 첫 화면 상위 10건을 뽑아
// 정답셋(tests/fixtures/precision-gold.json: 유형별 공고 id → 1 맞음 / 0 아님)과 비교한다.
// 실행: (grants 를 빌드해 dist/ 를 정적 서버로 띄운 뒤) node tests/eval-precision.mjs [baseUrl] [--candidates 파일.csv]
//   --candidates: 정답셋에 없는 상위 10건을 CSV로 저장(라벨링용). 정답셋에 없는 공고가 있으면 측정은 실패로 본다.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(process.env.PRECISION_FIXTURE || path.join(here, 'fixtures/programs-2026-10-30.json'), 'utf8'));
const GOLD = JSON.parse(readFileSync(path.join(here, 'fixtures/precision-gold.json'), 'utf8'));
const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8793/';
const candIdx = args.indexOf('--candidates');
const TOP = 10;
// 기준: 전체 상위 10건 정밀도(맞음 비율) 하한 · 유형별 하한 — 규칙을 고칠 때 떨어지면 실패
// v3.21.1(이전 엔진) 30.8% → v3.22.0 41.0% → v3.23.0 42.3%. 올리면 기준도 올린다(부산 뷰티 예비창업자는 맞는 공고 자체가 적어 낮음)
export const BASELINE = { overall: 0.40, perPersona: 0.10 };

// 유형별 입력(선택 단계는 비워 둠 — 실제 사용자 대부분이 건너뜀)
const sel = (id, v) => async (p) => { await p.selectOption(id, v); };
const opt = (t) => async (p) => { await p.locator('#formPanel .opt', { hasText: t }).first().click(); };
const need = (t) => async (p) => { await p.locator('.need-grid .opt', { hasText: t }).click(); };
const year = (y) => async (p) => { await p.fill('#f-year', y); await p.locator('#f-year').dispatchEvent('input'); };
export const PERSONAS = [
  { id: 'founder-seoul-ai', label: '예비창업자 · 서울 강남 · AI · 30대 · 사업화 자금', card: 'founder',
    steps: [need('사업화 자금'), sel('#f-region', '서울'), sel('#f-district', '강남구'), sel('#f-industry', 'AI·빅데이터'), opt('30대')] },
  { id: 'founder-busan-beauty', label: '예비창업자 · 부산 해운대 · 뷰티 · 40대 · 공간·멘토링+사업화', card: 'founder',
    steps: [need('공간·멘토링'), need('사업화 자금'), sel('#f-region', '부산'), sel('#f-district', '해운대구'), sel('#f-industry', '뷰티·화장품'), opt('40대')] },
  { id: 'retail-busan-food', label: '소상인 · 부산 해운대 · 음식점 · 2021 · 운영자금', card: 'retail',
    steps: [need('운영·사업 자금'), opt('개인사업자'), sel('#f-region', '부산'), sel('#f-district', '해운대구'), year('2021'), sel('#f-industry', '음식점업(F&B)')] },
  { id: 'retail-seoul-shop', label: '소상인 · 서울 마포 · 도소매 · 2019 · 판로·온라인', card: 'retail',
    steps: [need('판로·온라인'), opt('개인사업자'), sel('#f-region', '서울'), sel('#f-district', '마포구'), year('2019'), sel('#f-industry', '도소매업')] },
  { id: 'maker-hwaseong-metal', label: '소공인 · 경기 화성 · 금속가공 · 2015 · 스마트공장·설비', card: 'maker',
    steps: [need('스마트공장'), opt('개인사업자'), sel('#f-region', '경기'), sel('#f-district', '화성시'), year('2015'), sel('#f-industry', '금속·소재 성형가공')] },
  { id: 'maker-daegu-machine', label: '소공인 · 대구 달서 · 기계·장비 · 2010 · 운영자금', card: 'maker',
    steps: [need('운영·사업 자금'), opt('개인사업자'), sel('#f-region', '대구'), sel('#f-district', '달서구'), year('2010'), sel('#f-industry', '기계·장비')] },
  { id: 'sme-daejeon-sw', label: '중소기업 · 대전 유성 · SW · 법인 2018 · R&D', card: 'sme',
    steps: [need('R&D 과제'), opt('법인사업자'), sel('#f-region', '대전'), sel('#f-district', '유성구'), year('2018'), sel('#f-industry', 'SW·시스템통합')] },
  { id: 'sme-seongnam-mfg', label: '중소기업 · 경기 성남 · 제조 · 법인 2012 · 수출', card: 'sme',
    steps: [need('수출·해외진출'), opt('법인사업자'), sel('#f-region', '경기'), sel('#f-district', '성남시'), year('2012'), sel('#f-industry', '제조업')] }
];

export async function topCards(browser, persona) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-30T10:00:00+09:00'));
  await page.route('**/.netlify/functions/programs', (r) => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ mode: 'live', fetchedAt: FIX._meta.fetchedAt, sourceCounts: {}, enriched: 0, aliveCount: FIX.programs.length, programs: FIX.programs }) }));
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); APP_CONFIG.DATA_MODE = 'live'; ProgramProvider._p = null; });
  await page.locator(`.persona-card.${persona.card}`).click();
  for (const s of persona.steps) await s(page);
  for (let i = 0; i < 6 && await page.locator('#view-form:not(.hidden)').count(); i++) {
    if (await page.locator('#nextBtn').isDisabled()) throw new Error(`${persona.id}: 필수 입력 누락`);
    await page.locator('#nextBtn').click(); await page.waitForTimeout(40);
  }
  await page.waitForSelector('#view-results:not(.hidden)', { timeout: 30000 });
  const cards = await page.$$eval('#cards .rcard', (cs) => cs.map((c) => ({ id: c.dataset.id, name: c.querySelector('h3').textContent.trim(), state: c.querySelector('.rc-state').textContent.trim() })));
  await ctx.close();
  const seen = new Set();
  return cards.filter((c) => !seen.has(c.id) && seen.add(c.id)).slice(0, TOP);
}

export function score(results) {
  let hit = 0, labeled = 0; const per = {}; const unlabeled = [];
  for (const { persona, cards } of results) {
    const g = GOLD[persona.id] || {};
    let h = 0, l = 0;
    for (const c of cards) {
      if (!(c.id in g)) { unlabeled.push({ persona, c }); continue; }
      l++; h += g[c.id] ? 1 : 0;
    }
    per[persona.id] = l ? h / l : 0; hit += h; labeled += l;
  }
  return { overall: labeled ? hit / labeled : 0, per, unlabeled, hit, labeled };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const results = [];
  for (const persona of PERSONAS) results.push({ persona, cards: await topCards(browser, persona) });
  await browser.close();
  const r = score(results);
  for (const { persona, cards } of results) {
    console.log(`\n### ${persona.label} — 정밀도 ${(r.per[persona.id] * 100).toFixed(0)}%`);
    cards.forEach((c, i) => { const g = (GOLD[persona.id] || {})[c.id]; console.log(`${String(i + 1).padStart(2)}. ${g === 1 ? '✅' : g === 0 ? '❌' : '❔'} ${c.name} (${c.state}) [${c.id}]`); });
  }
  console.log(`\n상위 ${TOP}건 정밀도: ${(r.overall * 100).toFixed(1)}% (${r.hit}/${r.labeled}) · 정답셋에 없는 공고 ${r.unlabeled.length}건`);
  if (candIdx >= 0) {
    const rows = [['persona', 'programId', 'programName', 'state', 'label(1맞음/0아님)']].concat(r.unlabeled.map(({ persona, c }) => [persona.id, c.id, c.name, c.state, '']));
    writeFileSync(args[candIdx + 1], '﻿' + rows.map((x) => x.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
    console.log(`라벨링용 CSV: ${args[candIdx + 1]}`);
  }
  const fails = [];
  if (r.unlabeled.length) fails.push(`정답셋에 없는 공고 ${r.unlabeled.length}건 — --candidates 로 뽑아 라벨링`);
  if (r.overall < BASELINE.overall) fails.push(`전체 정밀도 ${(r.overall * 100).toFixed(1)}% < 기준 ${BASELINE.overall * 100}%`);
  for (const p of PERSONAS) if (r.per[p.id] < BASELINE.perPersona) fails.push(`${p.id} 정밀도 ${(r.per[p.id] * 100).toFixed(0)}% < 기준 ${BASELINE.perPersona * 100}%`);
  if (fails.length) { console.error('❌ ' + fails.join('\n❌ ')); process.exit(1); }
  console.log('✅ 정밀도 기준 통과');
}
