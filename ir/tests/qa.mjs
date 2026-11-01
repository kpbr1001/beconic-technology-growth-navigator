// E2E QA — 실제 클릭: 화면 크기별 레이아웃·대표 입력→컨설턴트 검토→대표 승인→PDF·승인 후 변경 재검토·검토 파일 왕복·OG.
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
const newPage = async (w = 390, h = 844) => { const p = await browser.newPage({ viewport: { width: w, height: h }, acceptDownloads: true }); p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts|pretendard|ERR_|net::/i.test(m.text())) errors.push(m.text()); }); return p; };

// 1) 레이아웃
for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1280, 900]]) {
  const p = await newPage(w, h);
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.click('[data-act=sample]'); await p.waitForTimeout(150);
  for (const r of ['', '#/work/todo', '#/work/list', '#/work/evidence', '#/work/report', '#/q/Q23', '#/q/Q17', '#/setup']) {
    await p.goto(BASE + r); await p.waitForTimeout(80);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (sw > 0) ok(false, `${w}px ${r || 'home'} 가로 넘침 ${sw}px`);
  }
  ok(true, `${w}px 8개 화면 가로 넘침 검사`);
  await p.close();
}

// 2) 대표 입력 → 컨설턴트 → 승인 → 변경 후 재검토
const p = await newPage(390, 844);
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.evaluate(() => localStorage.clear()); await p.reload();
await p.click('[data-act=new]');
await p.click('[data-act=setup-save]');
ok((await p.textContent('#setup-err')).includes('회사명'), '기본 정보 필수값 검사');
await p.fill('input[name=company]', '테스트 주식회사'); await p.fill('input[name=baseDate]', '2026-09-30'); await p.fill('input[name=ceo]', '대표A'); await p.fill('input[name=consultant]', '컨설턴트B');
await p.click('[data-act=setup-save]');
ok((await p.textContent('.sum h1')) === '테스트 주식회사', '작업 공간 진입');
ok((await p.textContent('.sum')).includes('투자 준비도나 사업성 점수가 아니에요'), '진행률 = 업무 진행률 고지');
await p.goto(BASE + '#/q/Q22');
for (const [k, v] of [['open', '100,000,000'], ['op', '-30,000,000'], ['inv', '-10,000,000'], ['fin', '50,000,000'], ['close', '120,000,000']]) await p.fill(`#f-Q22-${k}`, v);
await p.waitForTimeout(100);
const calc = await p.textContent('#live-calc');
ok(calc.includes('불일치') && calc.includes('10,000,000원 차이') && calc.includes('원인은 확인되지 않았습니다'), '현금흐름 불일치 실시간 표시(차액만, 원인 비추측)');
await p.fill('#f-Q22-close', '110,000,000'); await p.locator('#f-Q22-close').blur(); await p.waitForTimeout(100);
ok((await p.textContent('#live-calc')).includes('일치'), '수정 후 일치');
// 자료 등록·연결·위치
await p.click('.newev summary'); await p.fill('.newev [data-k=name]', '2025 현금흐름표.pdf');
const tmp = path.join(OUT, 'evidence.txt'); writeFileSync(tmp, 'sample evidence v1');
await p.setInputFiles('.newev input[type=file]', tmp); await p.waitForTimeout(200);
await p.click('[data-act=ev-add][data-scope=q]'); await p.waitForTimeout(100);
ok((await p.textContent('#q-chips')).includes('제출됨'), '위치 없는 연결은 원문 연결 확인 아님');
await p.fill('[data-link="0"]', '3쪽'); await p.waitForTimeout(100);
ok((await p.textContent('#q-chips')).includes('자료 간 일치') || (await p.textContent('#q-chips')).includes('원문 연결'), '위치 기록 후 원문 연결/일치');
const sha = await p.evaluate(() => window.__IR.state.evidence[0].sha256);
ok(/^[0-9a-f]{64}$/.test(sha), '파일 SHA-256 로컬 계산(업로드 없음)');
// 컨설턴트
await p.click('[data-act=role]');
ok(await p.locator('#f-Q22-open').isDisabled(), '컨설턴트는 대표 답변을 직접 수정할 수 없음');
await p.check('input[name=scope][value="수치 재계산"]'); await p.click('[data-act=reviewed][data-q=Q22]');
ok((await p.textContent('#q-chips')).includes('검토자 검토'), '검토자 검토 기록');
await p.goto(BASE + '#/q/Q01'); await p.fill('#sg-text', '고객 유형을 넣어 주세요'); await p.fill('#sg-prop', '중소 제조기업에 설비 점검 SaaS 제공'); await p.click('[data-act=sg-add]');
await p.goto(BASE + '#/work/report');
ok((await p.textContent('.approve')).includes('대표 화면에서만'), '컨설턴트는 승인 불가');
// 대표: 제안 반려(사유 필수) → 승인
await p.click('[data-act=role]');
await p.goto(BASE + '#/q/Q01');
await p.click('[data-act=sg-reject]'); ok((await p.locator('.sg.open').count()) === 1, '반려 사유 없으면 반려 안 됨');
await p.fill('.sg-act input', '소개서 표기와 다름'); await p.click('[data-act=sg-reject]');
ok((await p.textContent('.sg')).includes('대표 반려 — 소개서 표기와 다름'), '반려 사유 기록');
await p.goto(BASE + '#/work/report');
await p.click('[data-act=approve]'); ok((await p.evaluate(() => window.__IR.state.snapshots.length)) === 0, '확인 체크 없이 승인 불가');
for (const id of ['ap1', 'ap2', 'ap3']) await p.check(`#${id}`);
await p.click('[data-act=approve]'); await p.waitForTimeout(300);
const s1 = await p.evaluate(() => window.__IR.state.snapshots[0]);
ok(s1 && /^[0-9a-f]{64}$/.test(s1.hash) && s1.byQ.Q22.review === 'approved', 'v1 스냅샷 고정(해시·검토자 검토→대표 승인)');
// 승인 후 변경 → 재검토, 스냅샷 불변
await p.goto(BASE + '#/q/Q22'); await p.fill('#f-Q22-close', '999'); await p.locator('#f-Q22-close').blur(); await p.waitForTimeout(150);
const after = await p.evaluate(() => ({ a: window.__IR.state.answers.Q22, snapClose: window.__IR.state.snapshots[0].state.answers.Q22.fields.close }));
ok(after.a.stale && after.a.review === 'none' && after.snapClose === '110,000,000', '승인 후 변경 → 재검토 대상, 승인본은 그대로');
// 자료 새 버전 → 연결 문항 재검토
await p.goto(BASE + '#/work/evidence'); writeFileSync(tmp, 'sample evidence v2');
await p.setInputFiles('[data-act=ev-replace]', tmp); await p.waitForTimeout(300);
ok((await p.evaluate(() => window.__IR.state.evidence[0].version)) === 2, '자료 교체 시 버전 증가');
// 검토 파일 왕복
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=export]')]);
const file = path.join(OUT, 'review.json'); await dl.saveAs(file);
const json = JSON.parse(readFileSync(file, 'utf8'));
ok(json.app === 'beconic-ir' && json.snapshots.length === 1 && !JSON.stringify(json).includes('sample evidence'), '검토 파일 내보내기(원본 파일 내용 미포함)');
await p.evaluate(() => localStorage.clear()); await p.goto(BASE); await p.reload();
await p.click('[data-act=new]'); await p.fill('input[name=company]', 'X'); await p.click('[data-act=setup-save]');
p.once('dialog', (d) => d.accept());
await p.setInputFiles('[data-act=import]', file); await p.waitForTimeout(300);
ok((await p.textContent('.sum h1')) === '테스트 주식회사', '검토 파일 불러오기');
const badF = path.join(OUT, 'bad.json'); writeFileSync(badF, '{"app":"other"}');
await p.setInputFiles('[data-act=import]', badF); await p.waitForTimeout(200);
ok((await p.textContent('#toast')).includes('검토 파일이 아니에요'), '잘못된 파일 거부');
await p.close();

// 3) PDF — 합성 예시 승인본, 요약본·상세본
const q = await newPage(1280, 900);
await q.goto(BASE, { waitUntil: 'networkidle' }); await q.click('[data-act=sample]');
await q.goto(BASE + '#/work/report'); for (const id of ['ap1', 'ap2', 'ap3']) await q.check(`#${id}`);
await q.click('[data-act=approve]'); await q.waitForTimeout(300);
await q.evaluate(() => { window.__noPrint = true; });
for (const kind of ['brief', 'detail']) for (const mask of ['0', '1']) {
  await q.selectOption('#rp-mask', mask);
  await q.click(`[data-act=print][data-kind=${kind}][data-v="1"]`);
  await q.emulateMedia({ media: 'print' }); await q.evaluate(() => document.fonts.ready);
  const f = path.join(OUT, `${kind}${mask === '1' ? '-masked' : ''}.pdf`);
  await q.pdf({ path: f, preferCSSPageSize: true, printBackground: true });
  await q.emulateMedia({ media: 'screen' }); await q.evaluate(() => document.body.classList.remove('printing'));
  let text = ''; let pages = 0;
  try { text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); pages = Number(execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)[1]); } catch { console.log('ℹ️ pdftotext 없음 — 텍스트 검사 생략'); continue; }
  ok(text.includes('합성 예시') && /IR-20260930-[0-9A-F]{8}/.test(text), `${kind}${mask === '1' ? '(마스킹)' : ''}: 합성 예시 표시·보고서 ID (${pages}쪽)`);
  ok(new RegExp(`1\\s*/\\s*${pages}`).test(text), `${kind}: 쪽 번호 "n / ${pages}"`);
  ok(text.includes('30,000,000원') && ![...text.matchAll(/점수|합격|확률|예측/g)].some((m) => !/아닙|않|없/.test(text.slice(m.index - 40, m.index + 240))), `${kind}: 불일치 금액 포함·금지어 없음`);
  if (kind === 'brief') ok(pages <= 2, `요약본 2쪽 이하 (${pages}쪽)`);
  if (kind === 'detail') ok(['검토 범위와 방법', '확인 사항과 자료 요청', '용어집', 'SHA-256'].every((s) => text.includes(s)), '상세본 12개 섹션 주요 항목');
  if (mask === '1') ok(!text.includes('엔젤투자자(예시)'), '마스킹: 주주명 비노출');
}
await q.close();

// 4) OG·메타
const o = await newPage(); await o.goto(BASE, { waitUntil: 'networkidle' });
const og = await o.evaluate(() => Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute('property'), m.content])));
ok(og['og:url'] === 'https://beconic-diagnosis-ir.netlify.app/' && og['og:image'].startsWith('https://beconic-diagnosis-ir.netlify.app/assets/og-ir-banner-1200x630.jpg') && og['og:image:width'] === '1200', 'OG(카카오) 절대 URL·1200×630');
const img = await o.request.get(BASE + 'assets/og-ir-banner-1200x630.jpg'); ok(img.ok(), 'OG 이미지 배포본 포함');
ok(await o.evaluate(() => document.fonts.check('700 16px "Pretendard Variable"')), 'Pretendard 로드');
await o.close();

ok(errors.length === 0, `콘솔·페이지 오류 없음${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(fails ? `\n❌ ${fails}건 실패` : '\n✅ IR 진단 QA 전부 통과');
process.exit(fails ? 1 : 0);
