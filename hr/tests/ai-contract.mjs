/* global S, SAMPLE, runDiagnosis */
// HR 진단 AI 서버 함수 계약 테스트 (로컬) — 실제 Anthropic 대신 모의 API 서버를 띄워
// ① 요청 형식(모델·구조화 출력·fallback·헤더) ② 키 비노출(카나리 키) ③ 인증·한도·차단 경로 ④ 화면 연동을 확인한다.
// 실서비스 호출 검증은 배포 사이트에서 별도로 해야 한다.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const CANARY = ['sk', 'ant', 'api03', 'CANARY', 'do-not-leak-0123456789abcdef'].join('-'); // 저장소 비밀키 검사에 걸리지 않도록 실행 시 조립
const CODE = 'test-access-code-2026';
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 모의 Anthropic API ──
let mode = 'ok';
const seen = [];
const GOOD = {
  executiveSummary: '학습·성장과 공정성·보상이 가장 취약해 제도화가 우선입니다.',
  insights: [{ refIds: ['D09', 'Z99'], insight: '성장 경로가 보이지 않아 이탈로 이어졌을 가능성이 있습니다.', soWhat: '퇴사자 면담으로 확인하세요.' }],
  interviewQuestions: [{ refId: 'D08', askWhom: '팀원', question: '평가 결과를 들었을 때 무엇이 납득되지 않았나요?' }, { refId: 'NOPE', askWhom: '팀장', question: '팀원 성장 대화는 얼마나 자주 하나요?' }],
  actions: [{ priority: 'P1', ownerRole: '대표', timeline: '30일', action: '평가 기준 초안 작성과 공유', firstStep: '팀장 회의에서 현행 기준 수집', kpiFormula: '평가 기준 공유 인원 ÷ 전체 인원 × 100' }],
  limitations: ['구성원 응답 자료가 없습니다.'],
};
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
    const msg = (text, stop = 'end_turn') => JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: stop, stop_details: null, usage: { input_tokens: 3000, output_tokens: 4000 } });
    const send = (st, b) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(b); };
    if (mode === 'ok') return send(200, msg(JSON.stringify(GOOD)));
    if (mode === 'forbid') return send(200, msg(JSON.stringify({ ...GOOD, executiveSummary: '제도화가 우선입니다. 업종 평균보다 이직이 많습니다.', insights: [{ refIds: ['D09'], insight: '취업규칙 미신고는 법 위반입니다.', soWhat: '확인' }, ...GOOD.insights] })));
    if (mode === 'limit') return send(200, msg(JSON.stringify({ ...GOOD, limitations: ['업종 평균 자료가 없어 비교하지 않았습니다.', '법 위반 여부는 단정하지 않았습니다.'] })));
    if (mode === 'allbad') return send(200, msg(JSON.stringify({ ...GOOD, executiveSummary: '업계 평균보다 나쁩니다.', actions: GOOD.actions.map((a) => ({ ...a, action: '저성과자를 해고하세요.' })) })));
    if (mode === 'badjson') return send(200, msg('이건 JSON이 아님'));
    if (mode === 'refusal') return send(200, msg('', 'refusal'));
    if (mode === 'auth') return send(401, JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${CANARY}` } }));
    if (mode === 'rate') return send(429, JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const MOCK = `http://127.0.0.1:${mock.address().port}`;

Object.assign(process.env, { BECONIC_AI_ENABLED: 'true', ANTHROPIC_API_KEY: CANARY, BECONIC_ACCESS_CODE: CODE, ANTHROPIC_BASE_URL: MOCK, URL: '' });
const { createHandler } = await import('../netlify/functions/hr-insights.mjs');
const { createBackground } = await import('../netlify/functions/hr-insights-background.mjs');
const mkStore = (m) => ({ get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => m.set(k, JSON.stringify(v)), delete: async (k) => m.delete(k) });
const mem = new Map();
const memStore = mkStore(mem);
const jobMem = new Map();
const jobStore = mkStore(jobMem);
let storeBroken = false;
let clock = Date.now();
let triggerFails = false;
const background = createBackground({ jobs: () => jobStore });
const handler = createHandler({
  store: () => { if (storeBroken) throw new Error('blobs down'); return memStore; },
  jobs: () => jobStore,
  now: () => clock,
  trigger: async (id) => { if (triggerFails) throw new Error('trigger down'); await background(new Request('http://x/.netlify/functions/hr-insights-background', { method: 'POST', body: JSON.stringify({ job: id }) })); },
});
const getJob = async (id, { code = CODE, ip = '10.0.0.1' } = {}) => {
  const r = await handler(new Request('http://x/api/hr-insights?job=' + id, { headers: { 'x-beconic-access': code } }), { ip });
  const text = await r.text();
  return { st: r.status, text, json: JSON.parse(text) };
};

const d = (id, name, score) => ({ id, name, score });
const INPUT = {
  industry: 'IT·소프트웨어', sizeBand: '10~29명', worktype: '하이브리드',
  indices: { ohi: 43, outcome: 56, hrMaturity: 54, confidence: '높음' },
  drivers: [d('D01', '역할·목표 명확성', 42), d('D02', '업무량·자원', 33), d('D03', '자율성·의견반영', 67), d('D04', '리더십·상사지원', 42), d('D05', '피드백·인정', 33), d('D06', '심리적 안전·존중', 67), d('D07', '협업·신뢰', 50), d('D08', '공정성·보상', 33), d('D09', '학습·성장', 17), d('D10', '지속가능한 업무·변화대응', 50)],
  outcomes: [d('O01', '업무 몰입', 50), d('O02', '재직 의도', 75), d('O03', '자부심·추천', 50), d('O04', '지속가능 에너지', 50)],
  gaps: [{ label: '공정성·평가·보상', exp: 33, sys: 83, quadrant: 'B' }],
  risks: [{ id: 'H04', category: '취업규칙', status: '전문가 검토 필요', legal: '근로기준법 제93조(상시 10인 이상 작성·신고)' }],
  objective: [{ id: 'turnoverRate', label: '연간 이직률', value: 25, unit: '%' }],
  signals: [{ id: 'TOV', note: '재직 의도는 높게 응답했으나 최근 1년 이직률이 25%입니다.' }],
  problem: '제도와 실행이 함께 무너진 구조적 리스크 영역이 있습니다',
};
const call = async (body, { code = CODE, ip = '10.0.0.1' } = {}) => {
  const r = await handler(new Request('http://x/api/hr-insights', { method: 'POST', headers: { 'content-type': 'application/json', 'x-beconic-access': code }, body: typeof body === 'string' ? body : JSON.stringify(body) }), { ip });
  const text = await r.text();
  const first = { st: r.status, text, json: JSON.parse(text) };
  if (first.st !== 202 || !first.json.job) return first;
  const g = await getJob(first.json.job, { ip });
  return { ...g, job: first.json.job, enqueue: first };
};

// 1. 정상 호출 — 요청 형식과 키 비노출
{
  const r = await call(INPUT);
  const q = seen.at(-1);
  check('정상: 200 + 구조화 결과', r.st === 200 && r.json.result?.actions?.length === 1, `${r.st}`);
  check('요청: 응답 상한 6,000 토큰', q.body.max_tokens === 6000);
  check('요청: 모델 claude-opus-5-5', q.body.model === 'claude-opus-5-5');
  check('요청: 구조화 출력(json_schema)·effort', q.body.output_config?.format?.type === 'json_schema' && q.body.output_config.effort === 'medium');
  check('요청: 거절 시 대체 모델(fallbacks + 베타 헤더)', q.body.fallbacks === 'default' && String(q.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  check('요청: 키는 x-api-key 헤더로만 전송', q.headers['x-api-key'] === CANARY && !JSON.stringify(q.body).includes(CANARY));
  check('응답: 카나리 키 미포함', !r.text.includes('CANARY'));
  check('접수: 202 + 작업 번호(UUID)', r.enqueue?.st === 202 && /^[0-9a-f-]{36}$/.test(r.job));
  check('조회: 결과는 한 번 읽으면 삭제', (await getJob(r.job)).st === 404 && !jobMem.has(r.job));
  check('응답: 입력에 없는 근거 id 제거', JSON.stringify(r.json.result.insights[0].refIds) === '["D09"]' && r.json.result.interviewQuestions[1].refId === '');
  check('응답: 사용료 정보는 화면으로 보내지 않음', !('usage' in r.json));
}
// 2. 차단 경로
{
  mode = 'forbid'; let r = await call(INPUT, { ip: '10.0.0.2' });
  check('금지 표현(업종 평균·법 위반 단정) 문장만 제거', r.st === 200 && r.json.removed === 2 && !/업종 평균|법 위반입니다/.test(r.text) && r.json.result.executiveSummary === '제도화가 우선입니다.', `${r.st} removed=${r.json.removed}`);
  mode = 'limit'; r = await call(INPUT, { ip: '10.0.0.2' }); check('한계 설명 문장은 유지', r.st === 200 && r.json.removed === 0 && r.json.result.limitations.length === 2);
  mode = 'allbad'; r = await call(INPUT, { ip: '10.0.0.2' }); check('해고 권고·외부 평균만 있으면 422', r.st === 422);
  mode = 'badjson'; r = await call(INPUT, { ip: '10.0.0.2' }); check('형식 깨진 응답 → 502', r.st === 502);
  mode = 'refusal'; r = await call(INPUT, { ip: '10.0.0.2' }); check('AI 거절 → 422 안내', r.st === 422);
  mode = 'auth'; r = await call(INPUT, { ip: '10.0.0.2' }); check('제공자 인증 실패 → 502, 오류 원문(키) 미노출', r.st === 502 && !r.text.includes('CANARY') && !r.text.includes('x-api-key'), r.json.error);
  mode = 'rate'; r = await call(INPUT, { ip: '10.0.0.2' }); check('제공자 429 → 429', r.st === 429);
  mode = 'ok';
  const before = seen.length;
  r = await call({ ...INPUT, companyName: '㈜비밀' }, { ip: '10.0.0.3' }); check('허용 외 필드(회사명) → 422, AI 미호출', r.st === 422 && seen.length === before);
  r = await call({ ...INPUT, comments: '팀장 김철수가 문제' }, { ip: '10.0.0.3' }); check('자유서술 필드 → 422', r.st === 422 && seen.length === before);
  r = await call({ ...INPUT, drivers: INPUT.drivers.map((x) => ({ ...x, score: 140 })) }, { ip: '10.0.0.3' }); check('점수 범위(0~100) 위반 → 422', r.st === 422);
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
  process.env.BECONIC_AI_ENABLED = 'false'; r = await call(INPUT); check('스위치 꺼짐(기본값) → 503', r.st === 503); process.env.BECONIC_AI_ENABLED = 'true';
  const g = await handler(new Request('http://x/api/hr-insights', { method: 'DELETE' }), { ip: '1.1.1.1' }); check('DELETE → 405', g.status === 405);
}
// 3b. 작업 조회·백그라운드 경로
{
  mem.clear(); jobMem.clear();
  let r = await getJob('not-a-uuid'); check('조회: 잘못된 작업 번호 → 400', r.st === 400);
  r = await getJob('00000000-0000-4000-8000-000000000000'); check('조회: 없는 작업 → 404', r.st === 404);
  const id = '11111111-1111-4111-8111-111111111111';
  await jobStore.setJSON(id, { status: 'queued', createdAt: clock, request: INPUT });
  r = await getJob(id); check('조회: 처리 중이면 202', r.st === 202);
  clock += 6 * 60_000; r = await getJob(id); check('조회: 5분 넘은 작업 → 504 후 삭제', r.st === 504 && !jobMem.has(id)); clock = Date.now();
  const id2 = '22222222-2222-4222-8222-222222222222';
  await jobStore.setJSON(id2, { status: 'queued', createdAt: clock, request: INPUT });
  await background(new Request('http://x', { method: 'POST', body: JSON.stringify({ job: id2 }) }));
  const stored = JSON.parse(jobMem.get(id2));
  check('백그라운드: 처리 후 입력 삭제·결과만 보관', stored.status === 'done' && !stored.request && stored.result?.status === 'ok');
  check('백그라운드: 저장된 결과에 키 없음', !jobMem.get(id2).includes('CANARY'));
  triggerFails = true; r = await call(INPUT, { ip: '10.0.0.4' }); check('백그라운드 시작 실패 → 502, 작업 삭제', r.st === 502 && jobMem.size === 1); triggerFails = false;
}

// 4. 화면 연동 — 빌드본(dist) + /api 를 모의 함수로 연결, 화면이 만든 요청이 서버 스키마를 통과하는지
mem.clear(); jobMem.clear();
const dist = path.join(here, '..', 'dist');
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('먼저 hr 폴더에서 npm run build');
const site = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/hr-insights')) {
    let body = ''; for await (const c of req) body += c;
    const r = await handler(new Request('http://x' + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? body : undefined }), { ip: '127.0.0.1' });
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text());
  }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(dist, p === '/' ? 'index.html' : p);
  if (!f.startsWith(dist) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext()).newPage();
page.on('dialog', (x) => x.accept());
const net = [];
page.on('response', async (r) => { if (r.url().includes('/api/')) net.push(await r.text()); });
await page.goto(`http://127.0.0.1:${site.address().port}/`);
// 실제 회사 진단처럼(가상 예시 아님) 응답을 넣고 결과 화면으로
await page.evaluate(() => { S.company = { ...SAMPLE.company, name: '테스트상사' }; S.emp = { ...SAMPLE.emp }; S.hr = { ...SAMPLE.hr }; S.texts = { improve: '팀장 김철수 010-1234-5678' }; S.sample = false; runDiagnosis(); });
await page.check('#aiConsent');
await page.fill('#aiCode', 'wrong-code-xxxx');
await page.click('#btnAI');
await page.waitForFunction(() => /받지 못했습니다/.test(document.querySelector('#aiStatus').textContent), null, { timeout: 20000 });
check('화면: 틀린 코드 → 실패 안내(규칙 기반 결과 유지)', (await page.locator('#aiStatus').innerText()).includes('이용 코드가 올바르지 않습니다'));
await page.fill('#aiCode', CODE);
await page.click('#btnAI');
await page.waitForFunction(() => /작성 완료|받지 못했습니다/.test(document.querySelector('#aiStatus').textContent), null, { timeout: 20000 });
const out = await page.locator('#aiOut').innerText();
check('화면 요청이 서버 스키마 통과 → AI 결과 표시', out.includes('평가 기준 초안 작성과 공유') && out.includes('인터뷰 질문'), (await page.locator('#aiStatus').innerText()).slice(0, 80));
const sent = seen.at(-1).body.messages[0].content;
check('화면에서 보낸 요청: 회사명·자유서술·연락처 없음', !/테스트상사|김철수|010-1234/.test(sent));
check('화면·네트워크 응답 어디에도 키 없음', !(await page.content()).includes('CANARY') && !net.some((t) => t.includes('CANARY')));
const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
check('브라우저 저장소에 이용 코드 미저장', !ls.includes(CODE));
await browser.close(); site.close(); mock.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
