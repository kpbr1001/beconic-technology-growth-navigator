// 공고문(PDF) 분석(백그라운드 함수, 최대 15분). 공고 수집 직후·정기 수집 때 호출되고,
// 남은 공고가 있으면 자신을 한 번 더 호출해 이어서 처리한다(잠금·분석 완료 공고는 건너뛰므로 반복 호출로 부하를 키울 수 없음).
import { setDeployHost } from '../lib/collect.mjs';
import { analyzeDocs } from '../lib/docs.mjs';

export default async (req, context) => {
  let origin = null;
  try { const u = new URL(req.url); origin = u.origin; setDeployHost(u.host, context?.deploy?.context); } catch { setDeployHost(null, context?.deploy?.context); }
  const r = await analyzeDocs();
  console.log('analyze-docs', JSON.stringify(r)); // Netlify 함수 로그에서 진행 확인
  if (origin && r.processed > 0 && r.remaining > 0) {
    try { await fetch(`${origin}/.netlify/functions/analyze-docs-background`, { method: 'POST', signal: AbortSignal.timeout(2000) }); } catch { /* 다음 정기 실행에서 이어서 */ }
  }
  return new Response(null, { status: 202 });
};
