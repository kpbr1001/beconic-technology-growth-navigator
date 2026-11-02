// E2E QA v2.2 — 실제 클릭: 화면 크기별 레이아웃, 시작→문항→표준재무제표 PDF 3개년 업로드(pdf.js·여러 파일)→결과, 스캔본·재무제표 아닌 파일 거르기, 주소 '/' 고정, 결과 파일 왕복, 결과 보고서 PDF(약 10쪽), OG.
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

// 합성 표준재무제표 PDF(텍스트형, 연도별)·재무제표 아닌 PDF·스캔본(이미지만) 만들기
const g = await ctx.newPage();
const mkPdf = async (name, html) => { await g.setContent(`<html><body style="font-family:sans-serif;font-size:12px">${html}</body></html>`); const f = path.join(OUT, name); await g.pdf({ path: f }); return f; };
const tbl = (rows, two) => `<table border=1 cellpadding=4><tr><td>계정과목</td><td>코드</td><td>당기</td>${two ? '<td>전기</td>' : ''}</tr>${rows.map(([n, c, a, b]) => `<tr><td>${n}</td><td>${c}</td><td>${a}</td>${two ? `<td>${b}</td>` : ''}</tr>`).join('')}</table>`;
const period = (y) => `<p>사업연도 ${y}년 01월 01일 부터 ${y}년 12월 31일 까지 (단위: 원)</p>`;
const STD25 = await mkPdf('std-2025.pdf', `<h3>표준재무상태표</h3>${period(2025)}${tbl([['자산총계', '228', '1,000,000,000', '800,000,000'], ['유동자산', '01', '600,000,000', '500,000,000'], ['부채총계', '229', '650,000,000', '500,000,000'], ['유동부채', '02', '450,000,000', '380,000,000'], ['자본총계', '230', '350,000,000', '300,000,000'], ['자본금', '231', '200,000,000', '200,000,000']], true)}
  <h3>표준손익계산서</h3>${period(2025)}${tbl([['Ⅰ. 매출액', '01', '950,000,000', '600,000,000'], ['Ⅳ. 영업이익(손실)', '03', '(80,000,000)', '△ 120,000,000'], ['당기순이익(손실)', '04', '-90,000,000', '-130,000,000']], true)}`);
const STD23 = await mkPdf('std-2023.pdf', `<h3>표준손익계산서</h3>${period(2023)}${tbl([['매출액', '01', '210,000,000'], ['영업손실', '03', '150,000,000'], ['당기순손실', '04', '155,000,000']])}<h3>표준재무상태표</h3>${period(2023)}${tbl([['자산총계', '228', '500,000,000'], ['부채총계', '229', '200,000,000'], ['자본총계', '230', '300,000,000']])}`);
const STD24 = await mkPdf('std-2024.pdf', `<h3>표준손익계산서</h3>${period(2024)}${tbl([['매출액', '01', '600,000,000'], ['영업손실', '03', '120,000,000'], ['당기순손실', '04', '130,000,000']])}`);
const NOTFS = await mkPdf('business-plan.pdf', '<h3>사업계획서</h3><p>2025년 목표 매출액 01 3,000,000,000 · 영업이익 500,000,000</p>');
const shot = (await g.screenshot()).toString('base64');
const SCAN = await mkPdf('scanned.pdf', `<img src="data:image/png;base64,${shot}" style="width:100%">`); await g.close();
const atRoot = (pg) => new URL(pg.url()).pathname === '/' && !pg.url().includes('#');
const viewOf = (pg) => pg.evaluate(() => window.__IR.view);

// 1) 레이아웃
for (const [w, h] of [[360, 640], [390, 844], [768, 1024], [1280, 900]]) {
  const p = await newPage(w, h); await p.goto(BASE, { waitUntil: 'networkidle' }); await p.click('[data-act=sample]'); await p.waitForTimeout(150);
  for (const r of ['', 'start', 'q/1', 'q/23', 'finance', 'result', 'answers']) {
    await nav(p, r); const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (sw > 0) ok(false, `${w}px ${r || 'home'} 가로 넘침 ${sw}px`);
    if (!atRoot(p)) ok(false, `${w}px ${r || 'home'} 주소가 '/'가 아님: ${p.url()}`);
    if ((await p.evaluate(() => document.body.innerText)).includes('${')) ok(false, `${w}px ${r || 'home'} 화면에 코드(\${…})가 그대로 보임`);
    if (r === 'q/1' && w <= 412) { const f = await p.evaluate(() => document.querySelector('.opt.unk').getBoundingClientRect().bottom <= document.querySelector('.bottom-bar').getBoundingClientRect().top); if (!f) ok(false, `${w}×${h} 문항 보기가 한 화면에 다 안 보임`); }
  }
  ok(true, `${w}px 화면별 가로 넘침·주소 '/'·코드 노출·문항 한 화면 검사`); await p.close();
}

// 2) 전체 흐름
const p = await newPage(390, 844);
await p.goto(BASE, { waitUntil: 'networkidle' }); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('beconic-ir:v1', '{"legacy":true}'); }); await p.reload();
ok(!(await p.textContent('[data-act=new]')).includes('${') && /약 \d+분/.test(await p.textContent('[data-act=new]')), '첫 화면 시작 버튼에 소요 시간 표시(코드 노출 없음)');
ok((await p.getAttribute('.hd-act .btn.call', 'href')).startsWith('tel:'), '모든 화면 상단 전화 상담 버튼');
await p.click('[data-act=new]'); await p.click('[data-act=start-go]');
ok((await p.textContent('#s-err')).includes('회사명'), '회사명 필수');
await p.fill('#s-company', '테스트랩'); await p.click('[data-act=start-go]');
ok((await p.textContent('#s-err')).includes('투자 단계'), '투자 단계 필수');
await p.click('[data-act=stage][data-v=prea]'); ok((await p.inputValue('#s-company')) === '테스트랩', '단계 선택 후에도 회사명 유지');
await p.click('[data-act=start-go]'); await p.waitForTimeout(150);
ok((await viewOf(p)) === 'q/1' && atRoot(p) && (await p.textContent('.qtitle')).includes('고객 문제'), '1번 문항 진입 · 주소는 / 그대로');
const { N, qids } = await p.evaluate(() => ({ N: window.__IR.N_Q, qids: window.__IR.qids })); // 문항 수·순서는 앱(모델)에서 읽는다
const plan = Array.from({ length: N }, (_, i) => [3, 4, 2, 5, 1][i % 5]); plan[qids.indexOf('FN4')] = 0; // FN4 = 모르겠어요
// 선택하면 표시만 되고 넘어가지 않는다
await p.click('.opt[data-v="3"]'); await p.waitForTimeout(500);
ok((await viewOf(p)) === 'q/1' && (await p.textContent('.opt.on .ck')) === '선택됨', '선택 표시가 보이고 자동으로 넘어가지 않음');
await p.click('.opt[data-v="3"]'); await p.waitForTimeout(150);
ok((await viewOf(p)) === 'q/2' && atRoot(p), '같은 보기를 다시 누르면 다음 문항');
await p.goBack(); await p.waitForTimeout(150); ok((await viewOf(p)) === 'q/1' && atRoot(p), '뒤로 가기 동작(주소 그대로)'); await p.goForward(); await p.waitForTimeout(150);
await p.click('[data-act=prev]');
for (let i = 0; i < N; i++) {
  if (i % 7 === 0) await p.check('[data-act=ev]');
  if (!(await p.locator(`.opt.on[data-v="${plan[i]}"]`).count())) await p.click(`.opt[data-v="${plan[i]}"]`); // 이미 고른 보기를 다시 누르면 다음으로 넘어가므로 건너뜀
  await p.click('[data-act=next]'); await p.waitForTimeout(60);
}
ok((await viewOf(p)) === 'finance' && atRoot(p), `${N}문항 후 재무 단계로 이동 · 주소에 /finance 안 붙음`);
const st = await p.evaluate(() => window.__IR.state);
ok(Object.keys(st.answers).length === N && st.answers.FN4.v === 0 && st.answers.PC1.ev === true && st.answers.TC1.v === plan[qids.indexOf('TC1')], '응답(기술역량 포함)·모르겠어요·근거 체크 저장');
await nav(p, 'q/2'); await p.keyboard.press('5'); await p.waitForTimeout(100); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
ok((await p.evaluate(() => window.__IR.state.answers.PC2.v)) === 5 && (await viewOf(p)) === 'q/3', '키보드(1~5·Enter)로 응답 수정');
// 재무: 스캔본·재무제표 아닌 파일은 걸러 안내
await nav(p, 'finance'); await p.setInputFiles('[data-act=fin-file]', [SCAN, NOTFS]); await p.waitForSelector('.flist li', { timeout: 20000 }); await p.waitForTimeout(200);
const notes = await p.$$eval('.flist li', (ls) => ls.map((l) => l.textContent));
ok(notes.some((t) => t.includes('scanned.pdf') && t.includes('글자를 읽을 수 없는')), '스캔 PDF → 직접 입력 안내');
ok(notes.some((t) => t.includes('business-plan.pdf') && t.includes('재무제표가 아니에요')) && !(await p.evaluate(() => Object.keys(window.__IR.state.fin.cur).length)), '재무제표 아닌 PDF는 값을 채우지 않음');
// 여러 파일을 순서 없이 한 번에(2023 + 2025) → 연도 칸 자동 배치
await p.setInputFiles('[data-act=fin-file]', [STD23, STD25]); await p.waitForFunction(() => window.__IR.state.fin?.pp?.rev, null, { timeout: 20000 }); await p.waitForTimeout(200);
let fin = await p.evaluate(() => window.__IR.state.fin);
ok(fin.y0 === '2025' && fin.cur.rev === 950000000 && fin.prev.rev === 600000000 && fin.pp.rev === 210000000, '3개년 배치: 최근 연도(2025)·전년도(문서의 전기)·전전년도(2023 파일)');
ok(fin.cur.op === -80000000 && fin.prev.op === -120000000 && fin.pp.op === -150000000 && fin.cur.assets === 1000000000 && fin.cur.ca === 600000000, '괄호·△·손실 계정 음수, 코드 번호(228·01)를 금액으로 읽지 않음');
ok((await p.$eval('[data-act=fin-file]', (el) => el.value)) === '', '파일 입력을 비워 같은 파일 다시 고르기 가능');
await p.setInputFiles('[data-act=fin-file]', STD24); await p.waitForTimeout(1500);
ok((await p.textContent('.flist')).includes('std-2024.pdf') && (await p.evaluate(() => window.__IR.state.fin.prev.rev)) === 600000000, '전년도 파일 추가 업로드');
const heads = await p.$$eval('.ftbl3 thead th', (ths) => ths.map((t) => t.textContent));
ok(heads.some((t) => t.includes('최근 연도(2025년)')) && heads.some((t) => t.includes('전년도(2024년)')) && heads.some((t) => t.includes('전전년도(2023년)')), '표 머리글: 최근 연도·전년도·전전년도(연도)');
// 고친 값은 바로 저장(새로고침해도 유지)
await p.fill('[data-fin=cur][data-k=cash]', '3억'); await p.fill('[data-fin=pp][data-k=net]', 'abc');
ok(await p.$eval('[data-fin=pp][data-k=net]', (el) => el.classList.contains('bad')), '숫자가 아니면 표시');
await p.reload(); await p.waitForFunction(() => window.__IR); await p.waitForTimeout(200);
fin = JSON.parse(await p.evaluate(() => localStorage.getItem('beconic-ir:v2'))).fin;
ok((await viewOf(p)) === 'finance' && atRoot(p) && fin.cur.cash === 300000000 && fin.pp.net === -155000000 && (await p.inputValue('[data-fin=cur][data-k=cash]')) === '300,000,000', '새로고침해도 재무 화면·입력값 유지(바로 저장)');
await p.click('[data-act=to-result]'); await p.waitForTimeout(250);
const ev = await p.evaluate(() => window.__IR.evaluate());
ok((await viewOf(p)) === 'result' && atRoot(p) && (await p.textContent('.ch-gauge text:nth-of-type(2)')).includes(String(ev.overall)), `결과 게이지 = 엔진 점수(${ev.overall})`);
ok((await p.textContent('.sum-lines')).includes('3개년 반영') && (await p.locator('.kpi').count()) >= 5 && (await p.locator('.ch-radar').count()) === 1 && (await p.locator('.ch-fin').count()) === 1, '요약·지표·레이더·3개년 추이 차트');
ok((await p.locator('.ytbl thead th').count()) === 4 && (await p.locator('.story li').count()) >= 2 && (await p.textContent('#r-fin')).includes('2년 연평균 매출 성장률'), '연도별 표(3개년)·재무 해석 문장·연평균 성장률');
const dr = await p.evaluate(() => window.__IR.evaluate().dataRoom.length);
ok((await p.locator('.room .rm').count()) === dr && (await p.locator('.asks .ask').count()) >= 1 && (await p.textContent('#r-room')).includes('표준재무제표증명'), '투자 준비 서류 체크리스트·투자자가 물어볼 질문');
await p.click('.rnav [data-to=r-room]'); await p.waitForTimeout(1500);
ok(atRoot(p) && (await p.evaluate(() => document.getElementById('r-room').getBoundingClientRect().top)) < 300, '바로 가기 버튼: 주소(#) 변화 없이 이동');
ok((await p.textContent('main')).includes('만들 자료:') && (await p.locator('.lens').count()) === 6 && (await p.locator('.ana').count()) === (await p.locator('.cbar .track s').count()), '투자자 관점 6개·영역별 상세(영역 수만큼)·로드맵 산출물');
ok((await p.locator('.flags li').count()) >= 1 && (await p.locator('.cbar .track s').count()) >= 1, '경계 신호·단계 기대 표시');
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
  ok(pages >= 8 && pages <= 13, `보고서 ${pages}쪽(약 10쪽)`);
  const want = ['한눈에보는결과', '핵심진단', '투자자관점진단', '영역별점수', '영역별상세진단', '재무진단', '투자자가물어볼질문', '투자준비서류체크리스트', '보완로드맵', '문항별응답', '진단방법', '기술역량', '합성예시', '최근연도(2025년)', '전전년도(2023년)'];
  ok(want.every((s) => compact.includes(s)), `보고서 주요 섹션·3개년 재무·합성 예시 표시${want.filter((s) => !compact.includes(s)).length ? ` (빠짐: ${want.filter((s) => !compact.includes(s))})` : ''}`);
  ok(new RegExp(`1\\s*/\\s*${pages}`).test(text) && /IR-\d{8}-[0-9A-F]{6}/.test(compact), '쪽 번호·보고서 ID');
  ok(![...text.matchAll(/예측|확률|성공률/g)].some((m) => !/않|없|아닙/.test(text.slice(m.index - 40, m.index + 200))), '금지 표현 없음');
  const fonts = execFileSync('pdffonts', [RP], { encoding: 'utf8' }); ok(!/Type 3/.test(fonts) && /Pretendard/.test(fonts), 'Pretendard 일반 글꼴 임베딩');
} catch { console.log('ℹ️ pdftotext 없음 — 보고서 텍스트 검사 생략'); }
// 재무 미반영 보고서
await q.evaluate(() => { const s = window.__IR.state; s.fin = null; localStorage.setItem('beconic-ir:v2', JSON.stringify(s)); }); await q.reload(); await q.waitForFunction(() => window.__IR);
await q.evaluate(() => { window.__noPrint = true; }); await q.click('[data-act=print] >> nth=0'); await q.emulateMedia({ media: 'print' });
const RP2 = path.join(OUT, 'report-nofin.pdf'); await q.pdf({ path: RP2, preferCSSPageSize: true, printBackground: true }); await q.emulateMedia({ media: 'screen' });
try { const t2 = execFileSync('pdftotext', [RP2, '-'], { encoding: 'utf8' }).replace(/\s+/g, ''); ok(t2.includes('투자자는표준재무제표를가장먼저요청해요') && t2.includes('준비방법'), '재무 미반영 보고서: 영향·준비 방법 안내'); } catch { /* pdftotext 없음 */ }
await q.close();

// 4) 주소·OG
const u = await newPage(); await u.goto(BASE + '#/result'); await u.waitForTimeout(200);
ok(atRoot(u) && (await viewOf(u)) === 'result', '예전 #/result 주소 → 결과 화면을 열고 주소는 /');
if (/^https:/.test(BASE)) { await u.goto(BASE + 'finance', { waitUntil: 'networkidle' }); ok(atRoot(u), '배포본 예전 경로(/finance) → 주소 /로 되돌림'); }
const meta = await u.evaluate(() => document.querySelector('meta[name=description]').content);
const nq = await u.evaluate(() => window.__IR.N_Q);
ok(meta.includes(`${nq}문항`) && !/\{\{/.test(meta), `메타 설명 문항 수 = 모델(${nq}문항)`);
const og = await u.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute('property'), m.content])));
ok(og['og:url'] === 'https://beconic-diagnosis-ir.netlify.app/' && /og-ir-banner-1200x630\.jpg/.test(og['og:image']), 'OG(카카오) 메타');
ok((await u.request.get(BASE + 'vendor/pdfjs/pdf.worker.min.mjs')).ok(), 'pdf.js 워커 배포본 포함');
ok(await u.evaluate(() => document.fonts.check('700 16px Pretendard')), 'Pretendard 로드');
await u.close();

ok(errors.length === 0, `콘솔·페이지 오류 없음${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(fails ? `\n❌ ${fails}건 실패` : '\n✅ IR 진단 QA 전부 통과');
process.exit(fails ? 1 : 0);
