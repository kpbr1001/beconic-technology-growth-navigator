// BECONIC 기업 재무진단 — AI 개선처방 접수·조회 함수 (Netlify Functions v2, /api/finance-insights)
// Claude 응답은 일반 함수 제한 시간(약 10초)을 넘기므로 3단계로 나눈다(기술진단 앱과 같은 방식).
//   POST  : 운영 스위치 → 출처 → 이용 코드(오입력 잠금) → 입력 스키마 → 사용량 한도 → 작업 접수(202, job id)
//   백그라운드 함수(finance-insights-background, 최대 15분)가 Claude 호출·검증 후 결과 저장
//   GET ?job=: 이용 코드 확인 후 상태 조회(대기 202 / 완료 200 / 실패 오류 코드). 완료 결과는 한 번 읽으면 지운다.
// ANTHROPIC_API_KEY 는 Netlify 환경변수(Functions 범위)에만 둔다.
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { Input } from '../../lib/ai-core.mjs';

export const config = { path: '/api/finance-insights' };

const DAILY_LIMIT = Number(process.env.BECONIC_AI_DAILY_LIMIT || 200); // 전체 일일 호출 상한(예산 보호)
const IP_LIMIT = Number(process.env.BECONIC_AI_IP_LIMIT || 10); // IP당 일일 상한
const MAX_BODY = 24_000;
const FAIL_LIMIT = 20; // 같은 IP의 하루 이용 코드 오입력 허용 횟수(무차별 대입 방지)
export const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const JOB_STALE_MS = 5 * 60_000; // 이 시간이 지나도 끝나지 않은 작업은 실패로 본다

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

function clientIp(req, context) {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
const ipKeyOf = (ip) => String(ip).replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45) || 'unknown';

// 이용 코드 비교: 길이·내용과 무관하게 같은 시간이 걸리도록 해시 후 timingSafeEqual
function sameCode(given, expected) {
  const a = createHash('sha256').update(String(given ?? '')).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

// 백그라운드 함수 호출(같은 사이트의 내부 경로). 응답은 202 즉시.
const defaultTrigger = async (id, req) => {
  await fetch(new URL('/.netlify/functions/finance-insights-background', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job: id }),
  });
};

// 의존성 주입(테스트에서 저장소·트리거를 바꿔 끼움). 운영은 Netlify Blobs.
export function createHandler({
  store: storeFactory = () => getStore('finance-ai-usage'),
  jobs: jobsFactory = () => getStore('finance-ai-jobs'),
  trigger = defaultTrigger,
  today = () => new Date().toISOString().slice(0, 10),
  now = () => Date.now(),
} = {}) {
  return async (req, context) => {
    if (req.method !== 'POST' && req.method !== 'GET') return json(405, { error: 'POST·GET 요청만 가능합니다.' });
    if (process.env.BECONIC_AI_ENABLED !== 'true') return json(503, { error: 'AI 기능이 꺼져 있습니다(운영자 설정 필요).' });
    if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: '서버에 API 키가 설정되지 않았습니다.' });
    const code = process.env.BECONIC_ACCESS_CODE;
    if (!code || code.length < 8) return json(503, { error: '승인 코드가 설정되지 않아 AI 기능을 열 수 없습니다.' });
    const origin = req.headers.get('origin');
    if (origin && process.env.URL && origin !== process.env.URL && origin !== process.env.DEPLOY_PRIME_URL) return json(403, { error: '허용되지 않은 출처입니다.' });

    const ipKey = ipKeyOf(clientIp(req, context));
    let store, u, jobs;
    try {
      store = storeFactory();
      jobs = jobsFactory();
      u = (await store.get(today(), { type: 'json' })) || { total: 0, ip: {}, fail: {} };
      u.fail = u.fail || {};
    } catch {
      return json(503, { error: '사용량 확인 저장소에 접근할 수 없어 요청을 막았습니다.' });
    }
    if ((u.fail[ipKey] || 0) >= FAIL_LIMIT) return json(429, { error: '이용 코드 오류가 많아 오늘은 요청을 막았습니다.' });
    if (!sameCode(req.headers.get('x-beconic-access'), code)) {
      u.fail[ipKey] = (u.fail[ipKey] || 0) + 1;
      try { await store.setJSON(today(), u); } catch { /* 카운터 저장 실패는 응답에 영향 없음 */ }
      return json(401, { error: '이용 코드가 올바르지 않습니다.' });
    }

    // ── 조회 ──
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('job') || '';
      if (!JOB_ID.test(id)) return json(400, { error: '작업 번호가 올바르지 않습니다.' });
      let job;
      try { job = await jobs.get(id, { type: 'json' }); } catch { return json(503, { error: '작업 저장소에 접근할 수 없습니다.' }); }
      if (!job) return json(404, { error: '작업을 찾을 수 없습니다(이미 결과를 받았거나 만료됨).' });
      if (job.status !== 'done') {
        if (now() - job.createdAt > JOB_STALE_MS) {
          await jobs.delete(id).catch(() => {});
          return json(504, { error: 'AI 처리 시간이 너무 오래 걸려 중단했습니다. 다시 시도하세요.' });
        }
        return json(202, { status: job.status, elapsed: Math.round((now() - job.createdAt) / 1000) });
      }
      await jobs.delete(id).catch(() => {});
      const r = job.result || {};
      if (r.status === 'ok') return json(200, { result: r.result, model: r.model, removed: r.removed || 0, notice: 'AI 작성 초안입니다. 경영진 또는 전문가 검토가 필요합니다.' });
      return json(r.http || 502, { error: r.error || 'AI 처리에 실패했습니다.' });
    }

    // ── 접수 ──
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { error: '요청이 너무 큽니다.' });
    let input;
    try {
      input = Input.parse(JSON.parse(raw));
    } catch {
      return json(422, { error: '검증된 요약 지표 형식이 아닙니다.' });
    }
    // 사용량 한도(예산 보호) — 동시 요청 시 소폭 초과 가능, Anthropic 콘솔 월 한도와 함께 운영
    if (u.total >= DAILY_LIMIT) return json(429, { error: '오늘의 AI 사용량 한도에 도달했습니다. 내일 다시 시도하세요.' });
    if ((u.ip[ipKey] || 0) >= IP_LIMIT) return json(429, { error: '이 네트워크의 오늘 AI 요청 한도를 넘었습니다.' });
    u.total += 1;
    u.ip[ipKey] = (u.ip[ipKey] || 0) + 1;
    const id = randomUUID();
    try {
      await store.setJSON(today(), u);
      await jobs.setJSON(id, { status: 'queued', createdAt: now(), request: input });
    } catch {
      return json(503, { error: '사용량 확인 저장소에 접근할 수 없어 요청을 막았습니다.' });
    }
    try {
      await trigger(id, req);
    } catch {
      await jobs.delete(id).catch(() => {});
      return json(502, { error: 'AI 작업을 시작하지 못했습니다.' });
    }
    return json(202, { job: id });
  };
}

export default createHandler();
