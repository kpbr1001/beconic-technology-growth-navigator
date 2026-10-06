// E2E 스모크: dist 빌드본을 실제 Chromium으로 열어 흐름·콘솔 에러·레이아웃·PDF를 검사한다.
// 사용: npm run build && npm run test:e2e   (결과 이미지·PDF: tests/e2e/out/)
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const OUT = 'tests/e2e/out';
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const URL = `http://localhost:${server.address().port}/`;

const VIEWPORTS = [[375, 812], [390, 844], [430, 932], [1366, 768], [1440, 900], [1920, 1080]];
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();

async function openPage(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  page.on('requestfailed', (r) => errors.push(`요청 실패 ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  return { page, errors };
}

// 1) 뷰포트별: 가로 스크롤·콘솔 에러·샘플기업 결과 렌더
for (const [w, h] of VIEWPORTS) {
  const { page, errors } = await openPage(w, h);
  await page.getByRole('button', { name: '샘플기업' }).click();
  await page.evaluate(() => window.navTo(5));
  await page.waitForSelector('#summary');
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!hscroll, `${w}px: 가로 스크롤 발생`);
  check(errors.length === 0, `${w}px: 콘솔 에러 ${JSON.stringify(errors)}`);
  await page.waitForFunction(() => /원문 색인/.test(document.querySelector('#roadmapfit')?.textContent || ''));
  const txt = await page.textContent('#roadmapfit');
  check(!/POC 적합성|높음|중간/.test(txt), `${w}px: 로드맵 후보에 검증 전 적합도 등급 노출`);
  // D4: 원문 색인 품목·쪽 번호 (샘플기업 = 스마트제조 예지보전)
  check(/SMESTR-2025-B-03-08/.test(txt) && /p\.271/.test(txt), `${w}px: 원문 색인 후보(품목코드·쪽) 미표시`);
  // 결과 연관성: 요약은 P0 과제, 핵심기술 우선순위(확인 항목)와 R&D 과제 연결
  check(/90일 최우선 과제\(P[0-2]\)/.test(await page.textContent('#summary')), `${w}px: 요약에 P0 기준 최우선 과제 누락`);
  const tech = await page.textContent('#tech');
  check(/확인 항목/.test(tech) && /\d\/5/.test(tech) && /R&D-1/.test(tech), `${w}px: 핵심기술 우선순위·결과 연결 누락`);
  check(/원문 핵심기술/.test(await page.textContent('#gaps')), `${w}px: 보완 필요 기술·데이터 누락`);
  if (w === 375 || w === 1440) await page.screenshot({ path: `${OUT}/result-${w}.png`, fullPage: false });
  await page.close();
}

// 1-b) 푸터 버전·업데이트 일자 표기
{
  const { page } = await openPage(1440, 900);
  const label = await page.textContent('[data-build-version]');
  check(/^v\d+\.\d+\.\d+ · \d{4}\.\d{2}\.\d{2} 업데이트$/.test(label.trim()), `푸터 버전 표기 형식 오류: ${label}`);
  await page.close();
}

// 2) 누락 CSS 보완 확인 (진단방식 선택 버튼)
{
  const { page } = await openPage(1440, 900);
  const radius = await page.$eval('.choice', (e) => getComputedStyle(e).borderRadius);
  check(radius === '999px', `.choice 스타일 미적용 (${radius})`);
  await page.close();
}

// 3) 전부 모름: 크래시 없이 '판단 보류' 표시
{
  const { page, errors } = await openPage(1440, 900);
  await page.evaluate(() => { localStorage.clear(); window.navTo(5); });
  await page.waitForSelector('#summary');
  const txt = await page.textContent('#summary');
  check(/판단 보류/.test(txt), '전부 모름: 판단 보류 미표시');
  check(errors.length === 0, `전부 모름: 콘솔 에러 ${JSON.stringify(errors)}`);
  const pr = await page.textContent('#printReport');
  check(/판단 보류/.test(pr), '전부 모름: PDF에 판단 보류 미표시');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/report-all-unknown.pdf`, format: 'A4', printBackground: true });
  await page.close();
}

// 4) PDF (A4) — 샘플기업
{
  const { page, errors } = await openPage(1440, 900);
  await page.getByRole('button', { name: '샘플기업' }).click();
  await page.evaluate(() => window.navTo(5));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${OUT}/report-sample.pdf`, format: 'A4', printBackground: true });
  const pages = await page.evaluate(() => document.querySelectorAll('#printReport .pr-page').length);
  check(pages === 16, `PDF 섹션 수 ${pages} (기대 16)`);
  const pr = await page.textContent('#printReport');
  check(/Scoring rule-v1\.1/.test(pr), 'PDF에 Scoring 버전 누락');
  check(/AI 설비 예지보전 솔루션/.test(pr) && /원문 p\.271/.test(pr), 'PDF 로드맵 정렬에 원문 색인 후보 누락');
  check(/Roadmap KB index-kb-v2/.test(pr), 'PDF에 Roadmap KB 버전 누락');
  check(/순위 기준/.test(pr) && /R&D-1/.test(pr), 'PDF 핵심기술 우선순위·결과 연결 누락');
  check(/권하는 이유/.test(pr), 'PDF 전략 대안에 우선 검토 이유 누락');
  const radar = await page.textContent('#printReport .pr-radar');
  check((radar.match(/\b\d{1,3}\b/g) || []).length >= 7, `PDF 레이더 점수 표기 누락 ${radar}`);
  check(!/검증 검증|운영 운영|점수 점수|관문를|점를/.test(pr), 'PDF 용어 변환 중복·조사 오류');
  // 하드코딩 제거: 영역 근거 문항·개인화 로드맵(핵심기술 이름)·쪽번호 토큰 치환
  check(/응답 근거/.test(pr), 'PDF 영역 근거 문항 누락');
  // 보완 필요 기술·데이터: 원문 핵심기술 대조(보유·보완 후보)
  check(/보완 필요 기술·데이터/.test(pr) && /보유 기술과 대조/.test(pr) && /보완 필요 후보/.test(pr), 'PDF 보완 필요 기술·데이터 누락');
  check(/'이상징후 탐지 모델' TRL \d→\d/.test(pr), 'PDF 로드맵에 핵심기술 TRL 단계 누락');
  check(!/\{\{(TOTAL|P:)/.test(pr), 'PDF 쪽번호 토큰 미치환');
  check(/App v\d+\.\d+\.\d+ · \d{4}\.\d{2}\.\d{2} 업데이트/.test(pr), 'PDF에 앱 버전·업데이트 일자 누락');
  check(/그로스벤처스/.test(pr) && /제2025-684호/.test(pr), 'PDF에 발행사·인증번호 누락');
  const logoOk = await page.$eval('#printReport .cover-logo', (i) => i.complete && i.naturalWidth > 0);
  check(logoOk, 'PDF 표지 로고 로드 실패');
  check(errors.length === 0, `PDF: 콘솔 에러 ${JSON.stringify(errors)}`);
  await page.close();
}

// 4-a) 업종별 작성 예시: 운영유형을 바꾸면 1단계 예시가 바뀌고 2단계 예시도 그 유형
{
  const { page, errors } = await openPage(1440, 900);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  const before = await page.textContent('[data-ex="product"]');
  await page.selectOption('#bizType', '제조 중심');
  const after = await page.textContent('[data-ex="product"]');
  check(before !== after && /사출/.test(after), `업종별 예시: 1단계 예시가 바뀌지 않음 ${after}`);
  await page.locator('section.active').getByRole('button', { name: '기술 발견 시작' }).click();
  check(/금형/.test(await page.textContent('section.active')), '업종별 예시: 2단계 예시가 운영유형과 다름');
  check(errors.length === 0, `업종별 예시: 콘솔 에러 ${JSON.stringify(errors)}`);
  await page.close();
}
// 4-b) 기술 후보: 2단계 답변에서 찾은 후보(근거 구절 표시), 다시 찾기·삭제 동작
{
  const { page, errors } = await openPage(1440, 900);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  for (const b of await page.locator('section.active .example-use').all()) await b.click();
  await page.locator('section.active').getByRole('button', { name: '기술 발견 시작' }).click();
  for (const b of await page.locator('section.active .example-use').all()) await b.click();
  await page.locator('section.active').getByRole('button', { name: '기술 후보 생성' }).click();
  const names = await page.$$eval('section.active .tech-row b', (bs) => bs.map((b) => b.textContent));
  check(names.length >= 3 && names.some((n) => /알고리즘·모델/.test(n)), `기술 후보: 답변 기반 후보 미생성 ${JSON.stringify(names)}`);
  check((await page.locator('section.active .tech-basis').count()) === names.length, '기술 후보: 근거 구절 미표시');
  // 결과 반영 안내: 핵심기술 체크 수와 행별 '결과 반영/목록만'
  const note = await page.textContent('section.active .reflect-note');
  check(/'핵심기술'에 체크한 기술만/.test(note) && /\d+개<\/b>|\d+개 반영/.test(note), `기술 후보: 결과 반영 안내 누락 ${note}`);
  const rowTags = await page.$$eval('section.active .tech-row .check .tag', (ts) => ts.map((t) => t.textContent));
  check(rowTags.includes('결과 반영') && rowTags.length === names.length, `기술 후보: 결과 반영 표시 누락 ${JSON.stringify(rowTags)}`);
  await page.locator('section.active .tech-row').last().getByRole('button', { name: '삭제' }).click();
  check((await page.locator('section.active .tech-row').count()) === names.length - 1, '기술 후보: 삭제 동작 안 함');
  check(errors.length === 0, `기술 후보: 콘솔 에러 ${JSON.stringify(errors)}`);
  await page.close();
}

// 5) 재진단(Phase 7): 기록 저장 → 파일 내보내기 → 재진단 시작 → 응답 변경 → 비교 섹션·PDF 비교 쪽 → 다른 브라우저에서 파일 불러오기
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '샘플기업' }).click();
  await page.evaluate(() => window.navTo(5));
  check(!(await page.$('#delta')), '재진단: 기준 없이 비교 섹션 표시');
  await page.locator('#history').getByRole('button', { name: '이번 진단 기록 저장' }).click();
  check((await page.locator('#history tbody tr').count()) === 1, '재진단: 기록 저장 실패');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#history').getByRole('button', { name: '내보내기' }).first().click()]);
  const file = `${OUT}/record.json`;
  await dl.saveAs(file);
  check(JSON.parse(readFileSync(file, 'utf8')).kind === 'beconic-diagnosis', '재진단: 내보낸 파일 형식');
  await page.locator('#history').getByRole('button', { name: '재진단 시작' }).first().click();
  check((await page.evaluate(() => document.querySelector('.section.active')?.id)) === 's2', '재진단: 핵심기술 단계로 이동 안 됨');
  await page.evaluate(() => { window.ans('q9', 4); window.ans('q10', 4); window.navTo(5); });
  const head = await page.textContent('#delta .decision p');
  check(/기술역량 \d+→\d+/.test(head ?? ''), `재진단: 변화 요약 ${head}`);
  const prPages = await page.evaluate(() => document.querySelectorAll('#printReport .pr-page').length);
  check(prPages === 17, `재진단: PDF 섹션 수 ${prPages} (기대 17)`);
  check(/재진단 비교 · 기준 진단 대비 변화/.test(await page.textContent('#printReport')), '재진단: PDF 비교 쪽 누락');
  await page.emulateMedia({ media: 'print' });
  mkdirSync(`${OUT}/pdf`, { recursive: true });
  await page.pdf({ path: `${OUT}/pdf/new-rediag.pdf`, format: 'A4', printBackground: true }); // test:pdf 검수 대상에 포함
  await page.evaluate(() => localStorage.removeItem('beconic_history_v1'));
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.navTo(5));
  await page.locator('#history input[type=file]').setInputFiles(file);
  await page.waitForTimeout(300);
  check((await page.locator('#history tbody tr').count()) === 1, '재진단: 기록 파일 불러오기 실패');
  // 레드팀: id에 스크립트를 넣은 조작 기록 파일은 거부(목록에 추가되지 않고 실행되지 않음)
  const evil = { ...JSON.parse(readFileSync(file, 'utf8')), id: "x');window.__pwned=1;('" };
  writeFileSync(`${OUT}/record-evil.json`, JSON.stringify(evil));
  await page.locator('#history input[type=file]').setInputFiles(`${OUT}/record-evil.json`);
  await page.waitForTimeout(300);
  await page.locator('#history').getByRole('button', { name: '현재 결과와 비교' }).first().click();
  check((await page.locator('#history tbody tr').count()) === 1, '레드팀: 조작된 기록 파일이 목록에 추가됨');
  check(!(await page.evaluate(() => window.__pwned)), '레드팀: 기록 파일 스크립트 주입 실행됨');
  check(errors.length === 0, `재진단: 콘솔 에러 ${JSON.stringify(errors)}`);
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error('❌ E2E 실패\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`✅ E2E 통과 (뷰포트 ${VIEWPORTS.length}개, 전부 모름, CSS, PDF, 기술 후보, 재진단)`);
