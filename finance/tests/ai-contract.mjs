/* global clearAll, applyAll, S */
// AI 서버 함수 계약 테스트 (로컬) — 실제 Anthropic 대신 모의 API 서버를 띄워
// ① 요청 형식(모델·구조화 출력·fallback·헤더) ② 키 비노출(카나리 키) ③ 인증·한도·차단 경로 ④ 화면 수치 대조를 확인한다.
// 실서비스 호출 검증은 배포 사이트에서 별도로 해야 한다.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ntsHtml, fixtureYear } from './nts-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CANARY = ['sk', 'ant', 'api03', 'CANARY', 'do-not-leak-0123456789abcdef'].join('-'); // 저장소 비밀키 검사에 걸리지 않도록 실행 시 조립
const CODE = 'test-access-code-2026';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 모의 Anthropic API ──
let mode = 'ok';
const seen = [];
const GOOD = {
  executiveSummary: '자본잠식과 영업손실이 함께 나타나 자본 확충과 수익 구조 점검이 우선입니다.',
  observations: [{ metricId: 'operatingMargin', year: 2025, fact: '영업이익률이 낮은 수준입니다.', impact: '고정비 부담 점검이 필요합니다.' }],
  risks: [{ findingIds: ['F-IMP', 'F-UNKNOWN'], risk: '결손이 이어지면 자본잠식이 커질 수 있습니다.', verifyNext: '월별 손익과 자금수지표를 확인하세요.' }],
  actions: [
    { priority: 'P1', ownerRole: '대표', timeline: '90일', action: '고정비 항목별 절감 계획 수립', kpiFormula: '판매비와관리비 ÷ 매출액 × 100', neededData: '판관비 계정별 명세' },
    { priority: 'P2', ownerRole: '재무 담당', timeline: '30일', action: '영업이익률을 12.3%p 끌어올리는 가격 인상', kpiFormula: '영업이익 ÷ 매출액 × 100', neededData: '제품별 원가' },
  ],
  questions: ['고정비 중 줄일 수 있는 항목은 무엇인가요?'],
  limitations: ['업종 비교 자료가 없습니다.'],
};
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
    const msg = (text, stop = 'end_turn') => JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: stop, stop_details: null, usage: { input_tokens: 3000, output_tokens: 4000 } });
    const send = (st, b) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(b); };
    if (mode === 'ok') return send(200, msg(JSON.stringify(GOOD)));
    if (mode === 'forbid') return send(200, msg(JSON.stringify({ ...GOOD, executiveSummary: '자본 확충이 우선입니다. 영업이익률이 업종 평균보다 낮습니다.', risks: [{ findingIds: ['F-IMP'], risk: '추정 부도 확률이 높습니다.', verifyNext: '자금수지표 확인' }, ...GOOD.risks] })));
    if (mode === 'limit') return send(200, msg(JSON.stringify({ ...GOOD, limitations: ['업종 평균 자료가 없어 비교하지 않았습니다.', '공식 신용등급은 미확인입니다.'] })));
    if (mode === 'allbad') return send(200, msg(JSON.stringify({ ...GOOD, executiveSummary: '업종 평균보다 나쁩니다.', actions: GOOD.actions.map((a) => ({ ...a, action: '신용등급 B 회복을 목표로 합니다.' })) })));
    if (mode === 'badjson') return send(200, msg('이건 JSON이 아님'));
    if (mode === 'refusal') return send(200, msg('', 'refusal'));
    if (mode === 'auth') return send(401, JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${CANARY}` } }));
    if (mode === 'rate') return send(429, JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const MOCK = `http://127.0.0.1:${mock.address().port}`;

Object.assign(process.env, { BECONIC_AI_ENABLED: 'true', ANTHROPIC_API_KEY: CANARY, BECONIC_ACCESS_CODE: CODE, ANTHROPIC_BASE_URL: MOCK, URL: '' });
const { createHandler } = await import('../netlify/functions/finance-insights.mjs');
const { createBackground } = await import('../netlify/functions/finance-insights-background.mjs');
const mkStore = (m) => ({ get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => m.set(k, JSON.stringify(v)), delete: async (k) => m.delete(k) });
const mem = new Map();
const memStore = mkStore(mem);
const jobMem = new Map();
const jobStore = mkStore(jobMem);
let storeBroken = false;
let clock = Date.now();
let triggerFails = false;
const background = createBackground({ jobs: () => jobStore });
// 접수 함수 → (트리거) 백그라운드 함수를 같은 프로세스에서 실행
const handler = createHandler({
  store: () => { if (storeBroken) throw new Error('blobs down'); return memStore; },
  jobs: () => jobStore,
  now: () => clock,
  trigger: async (id) => { if (triggerFails) throw new Error('trigger down'); await background(new Request('http://x/.netlify/functions/finance-insights-background', { method: 'POST', body: JSON.stringify({ job: id }) })); },
});
const getJob = async (id, { code = CODE, ip = '10.0.0.1' } = {}) => {
  const r = await handler(new Request('http://x/api/finance-insights?job=' + id, { headers: { 'x-beconic-access': code } }), { ip });
  const text = await r.text();
  return { st: r.status, text, json: JSON.parse(text) };
};

const INPUT = {
  industry: '제조업', basis: '개별', accountingStandard: '일반기업회계기준', years: [2023, 2024, 2025],
  metrics: { operatingMargin: { label: '영업이익률', unit: '%', values: { 2023: 3.3, 2024: 1.2, 2025: -5.8 } } },
  findings: [{ id: 'F-IMP', title: '부분 자본잠식 징후', fact: '2025년 자본잠식률 57.5%.', category: '안정성' }],
  scope: { bankData: '없음', audit: '미확인', creditRating: '미확인' },
};
const call = async (body, { code = CODE, ip = '10.0.0.1' } = {}) => {
  const r = await handler(new Request('http://x/api/finance-insights', { method: 'POST', headers: { 'content-type': 'application/json', 'x-beconic-access': code }, body: typeof body === 'string' ? body : JSON.stringify(body) }), { ip });
  const text = await r.text();
  const first = { st: r.status, text, json: JSON.parse(text) };
  if (first.st !== 202 || !first.json.job) return first;
  const g = await getJob(first.json.job, { ip }); // 접수 → 백그라운드 처리 → 조회
  return { ...g, job: first.json.job, enqueue: first };
};

// 1. 정상 호출 — 요청 형식과 키 비노출
{
  const r = await call(INPUT);
  const q = seen.at(-1);
  check('정상: 200 + 구조화 결과', r.st === 200 && r.json.result?.actions?.length === 2, `${r.st}`);
  check('정상: 실측 토큰·사용료 반환(usage)', r.json.usage?.input === 3000 && r.json.usage?.output === 4000 && r.json.usage?.usd === 0.092, JSON.stringify(r.json.usage));
  check('요청: 응답 상한 6,000 토큰(1회 비용 상한)', q.body.max_tokens === 6000);
  check('요청: 모델 claude-opus-5-5', q.body.model === 'claude-opus-5-5');
  check('요청: 구조화 출력(json_schema)·effort', q.body.output_config?.format?.type === 'json_schema' && q.body.output_config.effort === 'medium');
  check('요청: 거절 시 대체 모델(fallbacks default + 베타 헤더)', q.body.fallbacks === 'default' && String(q.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  check('요청: 키는 x-api-key 헤더로만 전송', q.headers['x-api-key'] === CANARY && !JSON.stringify(q.body).includes(CANARY));
  check('요청: 회사명·사업자번호 없음', !/주식회사|\d{3}-\d{2}-\d{5}/.test(JSON.stringify(q.body)));
  check('응답: 카나리 키 미포함', !r.text.includes(CANARY) && !r.text.includes('CANARY'));
  check('접수: 202 + 작업 번호(UUID)', r.enqueue?.st === 202 && /^[0-9a-f-]{36}$/.test(r.job));
  check('조회: 결과는 한 번 읽으면 삭제', (await getJob(r.job)).st === 404 && !jobMem.has(r.job));
  check('응답: 입력에 없는 징후 ID 제거', JSON.stringify(r.json.result.risks[0].findingIds) === '["F-IMP"]');
}
// 2. 차단 경로
{
  mode = 'forbid'; let r = await call(INPUT, { ip: '10.0.0.2' });
  check('금지 표현 문장만 제거, 나머지 결과는 전달', r.st === 200 && r.json.removed === 2 && !/업종 평균|부도 확률/.test(r.text) && r.json.result.executiveSummary === '자본 확충이 우선입니다.' && r.json.result.actions.length === 2, `${r.st} removed=${r.json.removed}`);
  mode = 'limit'; r = await call(INPUT, { ip: '10.0.0.2' }); check('한계 설명(\'업종 평균 자료가 없어\')은 유지', r.st === 200 && r.json.removed === 0 && r.json.result.limitations.length === 2);
  mode = 'allbad'; r = await call(INPUT, { ip: '10.0.0.2' }); check('쓸 수 있는 내용이 없으면 422', r.st === 422);
  mode = 'badjson'; r = await call(INPUT, { ip: '10.0.0.2' }); check('형식 깨진 응답 → 502', r.st === 502);
  mode = 'refusal'; r = await call(INPUT, { ip: '10.0.0.2' }); check('AI 거절 → 422 안내 + 과금 토큰 표시', r.st === 422 && r.json.usage?.usd === 0.092);
  mode = 'auth'; r = await call(INPUT, { ip: '10.0.0.2' }); check('제공자 인증 실패 → 502, 오류 원문(키) 미노출', r.st === 502 && !r.text.includes('CANARY') && !r.text.includes('x-api-key'), r.json.error);
  mode = 'rate'; r = await call(INPUT, { ip: '10.0.0.2' }); check('제공자 429 → 429', r.st === 429);
  mode = 'ok';
  const before = seen.length;
  r = await call({ ...INPUT, companyName: '주식회사 비밀' }, { ip: '10.0.0.3' }); check('허용 외 필드(회사명) → 422, AI 미호출', r.st === 422 && seen.length === before);
  r = await call('x'.repeat(30000), { ip: '10.0.0.3' }); check('본문 용량 초과 → 413', r.st === 413);
}
// 3. 인증·한도
{
  let r = await call(INPUT, { code: 'wrong-code-xxxx', ip: '10.0.0.9' }); check('이용 코드 오류 → 401', r.st === 401);
  r = await call(INPUT, { code: '', ip: '10.0.0.9' }); check('이용 코드 없음 → 401', r.st === 401);
  for (let i = 0; i < 20; i++) await call(INPUT, { code: 'bad' + i, ip: '10.0.0.8' });
  r = await call(INPUT, { ip: '10.0.0.8' }); check('코드 20회 오입력 IP → 정답도 429(잠금)', r.st === 429);
  for (let i = 0; i < 10; i++) await call(INPUT, { ip: '10.0.0.7' });
  r = await call(INPUT, { ip: '10.0.0.7' }); check('IP당 일일 한도 초과 → 429', r.st === 429);
  const day = [...mem.keys()][0]; const u = JSON.parse(mem.get(day)); u.total = 200; mem.set(day, JSON.stringify(u));
  r = await call(INPUT, { ip: '10.0.0.6' }); check('전체 일일 한도 초과 → 429', r.st === 429);
  mem.clear();
  storeBroken = true; r = await call(INPUT, { ip: '10.0.0.5' }); check('사용량 저장소 장애 → 503(차단 유지)', r.st === 503); storeBroken = false;
  process.env.BECONIC_ACCESS_CODE = 'short'; r = await call(INPUT); check('짧은 승인 코드 설정 → 503', r.st === 503); process.env.BECONIC_ACCESS_CODE = CODE;
  process.env.BECONIC_AI_ENABLED = 'false'; r = await call(INPUT); check('스위치 꺼짐 → 503', r.st === 503); process.env.BECONIC_AI_ENABLED = 'true';
  const g = await handler(new Request('http://x/api/finance-insights', { method: 'DELETE' }), { ip: '1.1.1.1' }); check('DELETE → 405', g.status === 405);
}
// 3b. 작업 조회·백그라운드 경로
{
  mem.clear(); jobMem.clear();
  let r = await getJob('not-a-uuid'); check('조회: 잘못된 작업 번호 → 400', r.st === 400);
  r = await getJob('00000000-0000-4000-8000-000000000000'); check('조회: 없는 작업 → 404', r.st === 404);
  const id = '11111111-1111-4111-8111-111111111111';
  await jobStore.setJSON(id, { status: 'queued', createdAt: clock, request: INPUT });
  r = await getJob(id); check('조회: 처리 중이면 202', r.st === 202);
  r = await getJob(id, { code: 'wrong-code-xxxx', ip: '10.1.1.1' }); check('조회: 이용 코드 오류 → 401', r.st === 401);
  clock += 6 * 60_000; r = await getJob(id); check('조회: 5분 넘은 작업 → 504 후 삭제', r.st === 504 && !jobMem.has(id)); clock = Date.now();
  await background(new Request('http://x', { method: 'POST', body: JSON.stringify({ job: id }) }));
  check('백그라운드: 대기 작업이 아니면 아무것도 안 함', !jobMem.has(id));
  const id2 = '22222222-2222-4222-8222-222222222222';
  await jobStore.setJSON(id2, { status: 'queued', createdAt: clock, request: INPUT });
  await background(new Request('http://x', { method: 'POST', body: JSON.stringify({ job: id2 }) }));
  const stored = JSON.parse(jobMem.get(id2));
  check('백그라운드: 처리 후 입력(요약 지표) 삭제·결과만 보관', stored.status === 'done' && !stored.request && stored.result?.status === 'ok');
  check('백그라운드: 저장된 결과에 키 없음', !jobMem.get(id2).includes('CANARY'));
  triggerFails = true; r = await call(INPUT, { ip: '10.0.0.4' }); check('백그라운드 시작 실패 → 502, 작업 삭제', r.st === 502 && jobMem.size === 1); triggerFails = false;
}

// 4. 화면 연동 — dist 정적 파일 + /api 를 모의 함수로 연결
mem.clear(); jobMem.clear();
const dist = path.join(here, '..', 'dist');
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('먼저 npm run build');
const site = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/finance-insights')) {
    let body = ''; for await (const c of req) body += c;
    const r = await handler(new Request('http://x' + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? body : undefined }), { ip: '127.0.0.1' });
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text());
  }
  const f = path.join(dist, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(dist) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${site.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const net = [];
page.on('response', async (r) => { if (r.url().includes('/api/')) net.push(await r.text()); });
await page.goto(SITE);
const Y = await page.evaluate(() => [S.baseYear - 2, S.baseYear - 1, S.baseYear]);
const mk = async (f) => { const q = await ctx.newPage(); await q.setContent(ntsHtml(f)); const b = await q.pdf({ format: 'A4' }); await q.close(); return b; };
const pdfs = await Promise.all(Y.map((y, i) => mk(fixtureYear(y, 1 + i * 0.1, 900_000_000))));
await page.evaluate(() => clearAll());
await page.setInputFiles('#fileIn', pdfs.map((b, i) => ({ name: `nts-${Y[i]}.pdf`, mimeType: 'application/pdf', buffer: b })));
await page.waitForFunction(() => S.pending.length === 3, null, { timeout: 30000 });
await page.evaluate(() => applyAll());
for (const c of await page.locator('[data-confirm]').all()) await c.check();
await page.check('#aiConsent');
await page.fill('#aiCode', 'wrong-code-xxxx');
await page.click('#btnAI');
await page.waitForFunction(() => /실패/.test(document.querySelector('#aiStatus').textContent), null, { timeout: 20000 });
check('화면: 틀린 코드 → 실패 안내', (await page.locator('#aiStatus').innerText()).includes('이용 코드가 올바르지 않습니다'));
await page.fill('#aiCode', CODE);
await page.click('#btnAI');
await page.waitForFunction(() => /작성 완료|실패/.test(document.querySelector('#aiStatus').textContent), null, { timeout: 20000 });
const out = await page.locator('#aiOut').innerText();
check('화면: AI 결과 표시(경영진 요약·권고)', out.includes('경영진 요약') && out.includes('고정비 항목별 절감 계획'));
check('화면: 계산에 없는 수치(12.3%p) 문장 차단', out.includes('수치 대조 실패로 제외') && !out.includes('12.3%p'));
check('화면: 접수 후 결과 조회까지 완료', (await page.locator('#aiStatus').innerText()).includes('작성 완료'));
check('화면: 이번 호출 토큰·사용료 표시(3,000·4,000 토큰 → $0.0920)', out.includes('입력 3,000·출력 4,000 토큰') && out.includes('$0.0920'));
check('화면: 전송 전 1회 예상 사용료 안내', /1회 예상 사용료: 약 \$0\.\d+~\$0\.\d+/.test(await page.locator('#aiCost').innerText()));
const html = await page.content();
check('화면·네트워크 응답 어디에도 키 없음', !html.includes('CANARY') && !net.some((t) => t.includes('CANARY')));
const sent = seen.at(-1).body.messages[0].content;
check('화면에서 보낸 요청: 상호·사업자번호·발급번호 없음', !/테스트상사|123-45|1234-567/.test(sent));
const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
check('브라우저 저장소에 이용 코드 미저장', !ls.includes(CODE));
await browser.close(); site.close(); mock.close();

{
  const { costOf, PRICES } = await import('../lib/ai-core.mjs');
  const a = costOf({ input_tokens: 1e6, output_tokens: 1e6 }, 'claude-opus-5-5');
  check('사용료: Opus 5.5 단가($4/$20 per 1M) 계산', a.usd === 24 && a.input === 1e6 && a.output === 1e6);
  const c = costOf({ input_tokens: 0, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6, output_tokens: 0 }, 'claude-sonnet-5-5');
  check('사용료: 캐시 쓰기 1.25배·읽기 0.1배', c.usd === 2.7);
  check('사용료: 단가표에 없는 모델은 추정하지 않음(null)', costOf({ input_tokens: 5, output_tokens: 5 }, 'unknown-model').usd === null && costOf(undefined, 'claude-opus-5-5').usd === 0);
  check('사용료: 기본 모델 단가 등록', !!PRICES['claude-opus-5-5']);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
