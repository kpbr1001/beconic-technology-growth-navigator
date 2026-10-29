// ============================================================================
// kakao-skill — 카카오 i 오픈빌더 스킬 서버(BECONIC 챗봇 허브). 웰컴·폴백 블록에 이 주소를 스킬로 연결한다.
//   POST /api/kakao/skill  ← 오픈빌더 스킬 요청(JSON) → 스킬 응답 v2.0
// 보안: 환경변수 KAKAO_SKILL_TOKEN이 있으면 요청 헤더 x-beconic-skill-token이 같아야 응답(오픈빌더 스킬 '헤더값'에 설정).
// 사용자 문장·식별자는 저장하거나 로그에 남기지 않는다.
// ============================================================================
import { readSnapshot, isAlive, setDeployHost } from '../lib/collect.mjs';
import { route } from '../lib/bot/kakao.mjs';

const MEMO_MS = 5 * 60 * 1000;
let memo = null; // { at, programs }

async function programs(now) {
  if (memo && now - memo.at < MEMO_MS) return memo.programs;
  const snap = await readSnapshot();
  if (!snap || !Array.isArray(snap.programs)) return null;
  const list = snap.programs.filter((p) => isAlive(p, now));
  memo = { at: now, programs: list };
  return list;
}
export function _resetBotCache() { memo = null; }

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default async (req, context) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const token = process.env.KAKAO_SKILL_TOKEN;
  if (token && req.headers.get('x-beconic-skill-token') !== token) return json({ error: 'unauthorized' }, 401);
  try { setDeployHost(new URL(req.url).host, context?.deploy?.context); } catch { setDeployHost(null, context?.deploy?.context); }
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 20000) return json({ error: 'too large' }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: 'bad json' }, 400); }
  // 웰컴 블록(채팅방 첫 진입)은 보내는 문장이 비어 있거나 정해진 문구라서, 블록 이름으로 알아보고 항상 첫 메뉴를 보낸다
  const blockName = String(body?.userRequest?.block?.name || body?.intent?.name || '');
  const utterance = /웰컴|welcome/i.test(blockName) ? '처음' : String(body?.userRequest?.utterance || '').slice(0, 200);
  const now = Date.now();
  let list = null;
  try { list = await programs(now); } catch { list = null; }
  return json(route(utterance, list, now));
};

export const config = { path: '/api/kakao/skill' };
