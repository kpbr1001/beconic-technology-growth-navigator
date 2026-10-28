// 공고 정기 수집(예약 함수, 30분마다, 실행 제한 30초). 운영 배포에서만 실행된다.
import { refreshSnapshot, setDeployHost } from '../lib/collect.mjs';

export default async () => {
  setDeployHost(null); // 예약 실행은 운영에서만
  const r = await refreshSnapshot(process.env, { sourceTimeoutMs: 25000, aiStartBudgetMs: 15000 });
  console.log('refresh-programs', JSON.stringify(r)); // Netlify 함수 로그에서 수집 결과 확인
  return new Response(null, { status: 204 });
};

export const config = { schedule: '*/30 * * * *' };
