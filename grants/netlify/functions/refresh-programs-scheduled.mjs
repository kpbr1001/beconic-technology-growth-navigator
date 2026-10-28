// 공고 정기 수집(예약 함수, 30분마다, 실행 제한 30초). 운영 배포에서만 실행된다.
import { refreshSnapshot, setDeployHost } from '../lib/collect.mjs';

export default async (req, context) => {
  setDeployHost(null, context?.deploy?.context || 'production'); // 예약 실행은 운영에서만
  const r = await refreshSnapshot(process.env, { sourceTimeoutMs: 25000, aiStartBudgetMs: 15000 });
  console.log('refresh-programs', JSON.stringify(r)); // Netlify 함수 로그에서 수집 결과 확인
  // 공고문 분석(백그라운드)을 운영 주소로 요청 — 남은 공고가 있으면 분석 함수가 스스로 이어서 처리
  if (process.env.URL) { try { await fetch(`${process.env.URL}/.netlify/functions/analyze-docs-background`, { method: 'POST', signal: AbortSignal.timeout(2000) }); } catch { /* 다음 실행에서 */ } }
  return new Response(null, { status: 204 });
};

export const config = { schedule: '*/30 * * * *' };
