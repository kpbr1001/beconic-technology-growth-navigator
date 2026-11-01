// E2E QA v2 — 실제 클릭: 화면 크기별 레이아웃, 시작→32문항→표준재무제표 PDF 업로드(pdf.js)→결과, 스캔본 대체, 건너뛰기, 결과 파일 왕복, 결과 보고서 PDF, OG.
// 실행: (cd ir && npm run build && cd dist && python3 -m http.server 8794) 후 node ir/tests/qa.mjs http://127.0.0.1:8794/
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://127.0.0.1:8794/';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out'); mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe });
let fails = 0; const ok = (c, msg) => { console.log(`${c ? '✅' : '❌'} ${msg}`); if (!c) fails++; };
const errors = [];
const ctx = await browser.newContext({ acceptDownloads: true });
const newPage = async (w = 390, h = 844) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts|pretendard|net::/i.test(m.text())) errors.push(m.text()); }); return p; };
const nav = async (p, r) => { await p.waitForFunction(() => window.__IR); await p.evaluate((x) => window.__IR.go(x), r); await p.waitForTimeout(80); };

// 합성 표준재무제표 PDF(텍스트형)·스캔본(이미지만) 만들기
const g = await ctx.newPage();
await g.setContent(`<html><body style="font-family:sans-serif;font-size:12px"><h3>표준재무제표증명</h3><p>제 5 기 2025년 01월 01일부터 2025년 12월 31일까지 (단위: 원)</p><table border=1 cellpadding=4>
<tr><td>코드</td><td>계정과목</td><td>당기</td><td>전기</td></tr><tr><td>1</td><td>Ⅰ. 매출액</td><td>950,000,000</td><td>600,000,000</td></tr><tr><td>3</td><td>Ⅳ. 영업이익(손실)</td><td>(80,000,000)</td><td>△ 120,000,000</td></tr>
<tr><td>4</td><td>당기순이익(손실)</td><td>-90,000,000</td><td>-130,000,000</td></tr><tr><td>5</td><td>자산총계</td><td>1,000,000,000</td><td>800,000,000</td></tr><tr><td>6</td><td>부채총계</td><td>650,000,000</td><td>500,000,000</td></tr>
<tr><td>7</td><td>자본총계</td><td>350,000,000</td><td>300,000,000</td></tr><tr><td>8</td><td>자본금</td><td>200,000,000</td><td>200,000,000</td></tr><tr><td>9</td><td>유동자산</td><td>600,000,000</td><td>500,000,000</td></tr><tr><td>10</td><td>유동부채</td><td>450,000,000</td><td>380,000,000</td></tr></table></body></html>`);
const STD = path.join(OUT, 'std-financials.pdf'); await g.pdf({ path: STD });
const shot = (await g.screenshot()).toString('base64');
await g.setContent(`<img src="data:image/png;base64,${shot}" style="width:100%">`); const SCAN = path.join(OUT, 'scanned.pdf'); await g.pdf({ path: SCAN }); await g.close();

// 1) 레이아웃
for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1280, 900]]) {
  const p = await newPage(w, h); await p.goto(BASE, { waitUntil: 'networkidle' }); await p.click('[data-act=sample]'); await p.waitForTimeout(150);
  for (const r of ['', 'start', 'q/1', 'q/23', 'finance', 'result', 'answers']) {
    await nav(p, r); const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (sw > 0) ok(false, `${w}px ${r || 'home'} 가로 넘침 ${sw}px`);
  }
  ok(true, `${w}px 7개 화면 가로 넘침 검사`); await p.close();
}

// 2) 전체 흐름
const p = await newPage(390, 844);
await p.goto(BASE, { waitUntil: 'networkidle' }); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('beconic-ir:v1', '{"legacy":true}'); }); await p.reload();
await p.click('[data-act=new]'); await p.click('[data-act=start-go]');
ok((await p.textContent('#s-err')).includes('회사명'), '회사명 필수');
await p.fill('#s-company', '테스트랩'); await p.click('[data-act=start-go]');
ok((await p.textContent('#s-err')).includes('투자 단계'), '투자 단계 필수');
await p.click('[data-act=stage][data-v=prea]'); ok((await p.inputValue('#s-company')) === '테스트랩', '단계 선택 후에도 회사명 유지');
await p.click('[data-act=start-go]'); await p.waitForTimeout(150);
ok(new URL(p.url()).pathname === '/q/1' && (await p.textContent('.qtitle')).includes('고객 문제'), '1번 문항 진입');
const plan = Array.from({ length: 32 }, (_, i) => [3, 4, 2, 5, 1][i % 5]); plan[27] = 0; // FN4 = 모르겠어요
for (let i = 0; i < 32; i++) {
  if (i % 7 === 0) await p.check('[data-act=ev]');
  await p.click(`.opt[data-v="${plan[i]}"]`); await p.waitForTimeout(320);
}
ok(new URL(p.url()).pathname === '/finance', '32문항 후 재무 단계로 자동 이동');
const st = await p.evaluate(() => window.__IR.state);
ok(Object.keys(st.answers).length === 32 && st.answers.FN4.v === 0 && st.answers.PC1.ev === true, '응답·모르겠어요·근거 체크 저장');
await nav(p, 'q/2'); await p.keyboard.press('5'); await p.waitForTimeout(350);
ok((await p.evaluate(() => window.__IR.state.answers.PC2.v)) === 5 && new URL(p.url()).pathname === '/q/3', '키보드로 응답 수정');
// 스캔본 → 직접 입력 안내
await nav(p, 'finance'); await p.setInputFiles('[data-act=fin-file]', SCAN); await p.waitForSelector('.stat', { timeout: 15000 });
ok((await p.textContent('.stat')).includes('글자를 읽을 수 없는'), '스캔 PDF → 직접 입력 안내');
await p.click('[data-act=fin-cancel]');
// 표준재무제표 업로드
await p.setInputFiles('[data-act=fin-file]', STD); await p.waitForSelector('.fgrid', { timeout: 15000 }); await p.waitForTimeout(200);
const draft = await p.evaluate(() => [...document.querySelectorAll('[data-fin]')].map((i) => [i.dataset.fin, i.dataset.k, i.value]));
const val = (f, k) => draft.find((d) => d[0] === f && d[1] === k)?.[2];
ok(val('cur', 'rev') === '950,000,000' && val('prev', 'rev') === '600,000,000', 'pdf.js로 매출 당기·전기 추출');
ok(val('cur', 'op') === '-80,000,000' && val('prev', 'op') === '-120,000,000', '괄호·△(공백 분리) 음수 추출');
await p.fill('[data-fin=cur][data-k=cash]', '3억'); await p.click('[data-act=fin-save]'); await p.waitForTimeout(200);
const fin = await p.evaluate(() => window.__IR.state.fin);
ok(fin.confirmed && fin.cur.cash === 300000000 && fin.source === 'upload', '확인·수정 후 반영(억 단위 입력)');
const ev = await p.evaluate(() => window.__IR.evaluate());
ok(new URL(p.url()).pathname === '/result' && (await p.textContent('.ch-gauge text:nth-of-type(2)')).includes(String(ev.overall)), `결과 게이지 = 엔진 점수(${ev.overall})`);
ok((await p.textContent('.sum-lines')).includes('표준재무제표 반영') && (await p.locator('.kpi').count()) >= 5 && (await p.locator('.ch-radar').count()) === 1 && (await p.locator('.ch-fin').count()) === 1, '요약·지표·레이더·재무 차트');
ok((await p.textContent('main')).includes('목표 달성 시'), '로드맵 목표 단계 표시');
// 뒤로 가기·결과 파일 왕복
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=export]')]);
const file = path.join(OUT, 'result.json'); await dl.saveAs(file);
ok(JSON.parse(readFileSync(file, 'utf8')).schema === 2, '결과 파일 저장');
await p.evaluate(() => localStorage.removeItem('beconic-ir:v2')); await p.goto(BASE); await p.reload();
await p.click('[data-act=sample]'); p.once('dialog', (d) => d.accept()); await p.setInputFiles('[data-act=import]', file); await p.waitForTimeout(300);
ok((await p.textContent('.res-h h1')).includes('테스트랩'), '결과 파일 열기');
const bad = path.join(OUT, 'bad.json'); writeFileSync(bad, '{"app":"other"}'); await p.setInputFiles('[data-act=import]', bad); await p.waitForTimeout(200);
ok((await p.textContent('#toast')).includes('결과 파일이 아니에요'), '잘못된 파일 거부');
ok((await p.evaluate(() => localStorage.getItem('beconic-ir:v1'))) === '{"legacy":true}', 'v1 기록은 지우지 않고 보존');
// 재무 건너뛰기
await p.evaluate(() => { const s = window.__IR.state; s.fin = null; localStorage.setItem('beconic-ir:v2', JSON.stringify(s)); }); await p.goto(BASE); await nav(p, 'result'); // 로컬 정적 서버는 /result 새로고침 시 404(배포본은 _redirects)
ok((await p.textContent('main')).includes('재무제표가 반영되지 않았어요') && (await p.textContent('.road')).includes('표준재무제표증명'), '재무 미반영 해석·로드맵 반영');
await p.close();

// 3) 결과 보고서 PDF (합성 예시, 재무 반영)
const q = await newPage(1280, 900);
await q.goto(BASE, { waitUntil: 'networkidle' }); await q.click('[data-act=sample]'); await q.waitForTimeout(200);
await q.evaluate(() => { window.__noPrint = true; }); await q.click('[data-act=print] >> nth=0');
await q.emulateMedia({ media: 'print' }); await q.evaluate(() => document.fonts.ready);
const RP = path.join(OUT, 'report.pdf'); await q.pdf({ path: RP, preferCSSPageSize: true, printBackground: true });
await q.emulateMedia({ media: 'screen' });
try {
  const text = execFileSync('pdftotext', ['-layout', RP, '-'], { encoding: 'utf8' }); const pages = Number(execFileSync('pdfinfo', [RP], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)[1]);
  const compact = text.replace(/\s+/g, '');
  ok(pages >= 2 && pages <= 4, `보고서 ${pages}쪽(2~4쪽)`);
  ok(['핵심요약', '영역별점수', '강점과먼저보완할점', '실행로드맵', '문항별응답', '진단방법', '합성예시'].every((s) => compact.includes(s)), '보고서 주요 섹션·합성 예시 표시');
  ok(new RegExp(`1\\s*/\\s*${pages}`).test(text) && /IR-\d{8}-[0-9A-F]{6}/.test(compact), '쪽 번호·보고서 ID');
  ok(![...text.matchAll(/예측|확률|성공률/g)].some((m) => !/않|없|아닙/.test(text.slice(m.index - 40, m.index + 200))), '금지 표현 없음');
  const fonts = execFileSync('pdffonts', [RP], { encoding: 'utf8' }); ok(!/Type 3/.test(fonts) && /Pretendard/.test(fonts), 'Pretendard 일반 글꼴 임베딩');
} catch { console.log('ℹ️ pdftotext 없음 — 보고서 텍스트 검사 생략'); }
await q.close();

// 4) 주소·OG
const u = await newPage(); await u.goto(BASE + '#/result'); await u.waitForTimeout(200);
ok(!u.url().includes('#'), '예전 #/ 주소 → 일반 경로');
if (/^https:/.test(BASE)) { await u.goto(BASE + 'q/5', { waitUntil: 'networkidle' }); ok((await u.textContent('.qtitle')).length > 5, '배포본 직접 접속·새로고침(/q/5)'); }
const og = await u.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute('property'), m.content])));
ok(og['og:url'] === 'https://beconic-diagnosis-ir.netlify.app/' && /og-ir-banner-1200x630\.jpg/.test(og['og:image']), 'OG(카카오) 메타');
ok((await u.request.get(BASE + 'vendor/pdfjs/pdf.worker.min.mjs')).ok(), 'pdf.js 워커 배포본 포함');
ok(await u.evaluate(() => document.fonts.check('700 16px Pretendard')), 'Pretendard 로드');
await u.close();

ok(errors.length === 0, `콘솔·페이지 오류 없음${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(fails ? `\n❌ ${fails}건 실패` : '\n✅ IR 진단 QA 전부 통과');
process.exit(fails ? 1 : 0);
