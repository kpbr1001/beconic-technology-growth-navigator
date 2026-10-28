// 공고 수집(백그라운드 함수, 최대 15분). programs가 스냅샷이 없거나 오래됐을 때 요청한다.
// 공개 주소지만 최근 스냅샷(20분 이내)이 있으면 아무것도 하지 않아 반복 호출로 쿼터를 쓰지 못한다.
import { refreshSnapshot, setDeployHost } from '../lib/collect.mjs';

export default async (req) => {
  let origin = null;
  try { const u = new URL(req.url); origin = u.origin; setDeployHost(u.host); } catch { setDeployHost(null); }
  const r = await refreshSnapshot(process.env, { sourceTimeoutMs: 60000, aiStartBudgetMs: 90000 });
  console.log('refresh-programs', JSON.stringify(r)); // Netlify 함수 로그에서 수집 결과 확인
  // 새 공고의 공고문 분석 이어서 실행
  if (origin) { try { await fetch(`${origin}/.netlify/functions/analyze-docs-background`, { method: 'POST', signal: AbortSignal.timeout(2000) }); } catch { /* 다음 정기 실행에서 */ } }
  return new Response(null, { status: 202 });
};
