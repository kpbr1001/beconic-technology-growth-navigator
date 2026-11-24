// BECONIC BM Navigator — AI 프록시 잠금(공용). Node 함수와 Deno 엣지 함수가 함께 쓰므로 node: 모듈을 쓰지 않는다.
//
// 잠금 3단:
//   1) 같은 사이트 출처 확인 — Origin 헤더가 반드시 있고, 요청을 받은 바로 그 사이트 주소와 같아야 한다.
//      브라우저가 보내는 Sec-Fetch-Site 가 있으면 same-origin 이어야 한다(다른 사이트의 페이지에서 부르는 것 차단).
//   2) 화면 요청 형식만 중계 — 모델·max_tokens 상한·시스템 프롬프트(글자 단위 일치)·user 메시지 틀이 화면과 같아야 하고,
//      그 밖의 항목(tools·temperature·stream·metadata 등)이 하나라도 있으면 거부. 서버가 허용 항목만으로 새 요청을 만든다.
//   3) 사용량 한도 — 하루 전체·IP별 호출 상한(Netlify Blobs). 예산 보호용 근사치(동시 요청 시 소폭 초과 가능).
import { ALLOWED } from './allowed-prompts.mjs';

export const MAX_BODY = 40_000; // 시스템 프롬프트(약 0.6천 자) + 진단 맥락(최대 MAX_CTX) 여유
export const MAX_CTX = 6_000; // 진단 맥락(사업정의 자유입력 포함) 최대 글자 수
export const HEAD = '[진단 결과]\n';
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT_KEY = new Map(Object.entries(ALLOWED.prompts).map(([k, v]) => [v, k]));

export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });

/** 오류 응답은 화면이 읽는 모양({error:{message}})으로 */
export const fail = (status, message, extra) => json(status, { error: { message } }, extra);

/**
 * 1) 같은 사이트 출처 확인.
 * @param {Request} req
 * @param {string[]} extraOrigins  환경 변수의 사이트 주소(URL·DEPLOY_PRIME_URL·DEPLOY_URL 등)
 * @returns {string|null} 거부 사유(통과면 null)
 */
export function checkOrigin(req, extraOrigins = []) {
  const origin = req.headers.get('origin');
  if (!origin) return 'origin_missing';
  let self = '';
  try { self = new URL(req.url).origin; } catch { /* 아래 목록으로만 판단 */ }
  const allowed = new Set([self, ...extraOrigins].filter(Boolean).map((u) => {
    try { return new URL(u).origin; } catch { return ''; }
  }).filter(Boolean));
  if (!allowed.has(origin)) return 'origin_foreign';
  const sfs = req.headers.get('sec-fetch-site');
  if (sfs && sfs !== 'same-origin') return 'cross_site';
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('application/json')) return 'content_type';
  return null;
}

const isPlain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const onlyKeys = (o, keys) => Object.keys(o).every((k) => keys.includes(k)) && keys.every((k) => k in o);

/**
 * 2) 화면 요청 형식 검사. 통과하면 Anthropic 으로 보낼 새 요청 본문(허용 항목만)을 돌려준다.
 * @returns {{ ok: true, kind: string, body: object } | { ok: false, reason: string }}
 */
export function validateBody(body) {
  if (!isPlain(body)) return { ok: false, reason: 'not_object' };
  if (!onlyKeys(body, ['model', 'max_tokens', 'system', 'messages'])) return { ok: false, reason: 'keys' };
  if (body.model !== ALLOWED.model) return { ok: false, reason: 'model' };
  if (typeof body.system !== 'string') return { ok: false, reason: 'system_type' };
  const kind = PROMPT_KEY.get(body.system);
  if (!kind) return { ok: false, reason: 'system_not_allowed' };
  const mt = body.max_tokens;
  if (!Number.isInteger(mt) || mt < 1 || mt > ALLOWED.maxTokens[kind]) return { ok: false, reason: 'max_tokens' };
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length !== 1) return { ok: false, reason: 'messages_len' };
  const m = msgs[0];
  if (!isPlain(m) || !onlyKeys(m, ['role', 'content'])) return { ok: false, reason: 'message_keys' };
  if (m.role !== 'user' || typeof m.content !== 'string') return { ok: false, reason: 'message_role' };
  const tail = ALLOWED.tails[kind];
  const c = m.content;
  if (!c.startsWith(HEAD) || !c.endsWith(tail)) return { ok: false, reason: 'message_frame' };
  const ctx = c.slice(HEAD.length, c.length - tail.length);
  if (!ctx.trim() || ctx.length > MAX_CTX) return { ok: false, reason: 'ctx_len' };
  if (!ctx.includes('사업단계: ') && !ctx.includes('사업단계:')) return { ok: false, reason: 'ctx_shape' };
  return {
    ok: true,
    kind,
    body: { model: ALLOWED.model, max_tokens: mt, system: ALLOWED.prompts[kind], messages: [{ role: 'user', content: c }] },
  };
}

/** 요청 본문 읽기(크기 제한 포함). */
export async function readJson(req) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return { error: 'too_large' };
  try { return { value: JSON.parse(raw) }; } catch { return { error: 'bad_json' }; }
}

const ipKeyOf = (ip) => String(ip || '').replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45) || 'unknown';

/**
 * 3) 사용량 한도. store 는 Netlify Blobs 저장소(get(key,{type:'json'}), setJSON(key,v)).
 * @returns {Promise<null | {status:number, message:string, reason:string}>} 막을 때만 사유
 */
export async function takeQuota(store, { ip, day, dailyLimit, ipLimit }) {
  let u;
  try {
    u = (await store.get(day, { type: 'json' })) || { total: 0, ip: {} };
  } catch {
    return { status: 503, reason: 'quota_store', message: '사용량 확인 저장소에 접근할 수 없어 요청을 막았습니다.' };
  }
  u.ip = u.ip || {};
  const k = ipKeyOf(ip);
  if ((u.total || 0) >= dailyLimit) return { status: 429, reason: 'daily_limit', message: '오늘의 AI 사용량 한도에 도달했습니다. 내일 다시 시도해 주세요.' };
  if ((u.ip[k] || 0) >= ipLimit) return { status: 429, reason: 'ip_limit', message: '이 네트워크의 오늘 AI 요청 한도를 넘었습니다.' };
  u.total = (u.total || 0) + 1;
  u.ip[k] = (u.ip[k] || 0) + 1;
  try {
    await store.setJSON(day, u);
  } catch {
    return { status: 503, reason: 'quota_store', message: '사용량 확인 저장소에 접근할 수 없어 요청을 막았습니다.' };
  }
  return null;
}

/** 운영 설정(환경 변수 읽기 함수를 받아 플랫폼 차이를 감춤) */
export function settings(env) {
  const num = (k, d) => {
    const n = Number(env(k));
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    disabled: env('BECONIC_AI_DISABLED') === 'true',
    key: env('ANTHROPIC_API_KEY') || '',
    dailyLimit: num('BECONIC_AI_DAILY_LIMIT', 400), // 보고서 1건 ≈ 8회(총평 1 + 심층 해석 7)
    ipLimit: num('BECONIC_AI_IP_LIMIT', 48), // IP당 하루 ≈ 보고서 6건
    origins: [env('URL'), env('DEPLOY_PRIME_URL'), env('DEPLOY_URL'), env('BECONIC_ALLOWED_ORIGIN')].filter(Boolean),
  };
}

export const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국 날짜 기준

export const anthropicHeaders = (key) => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
});

/** 차단 기록(로그 검색: "bm-ai-blocked"). 개인정보·본문은 남기지 않는다. */
export function logBlocked(where, reason, req) {
  const ua = (req.headers.get('user-agent') || '').slice(0, 80);
  const origin = (req.headers.get('origin') || '-').slice(0, 80);
  console.warn(`bm-ai-blocked ${where} reason=${reason} origin=${origin} ua=${ua}`);
}
