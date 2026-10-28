// 공고 정기 수집(예약 함수, 30분마다, 실행 제한 30초). 운영 배포에서만 실행된다.
import { refreshSnapshot } from '../lib/collect.mjs';

export default async () => {
  await refreshSnapshot(process.env, { sourceTimeoutMs: 20000, aiStartBudgetMs: 15000 });
  return new Response(null, { status: 204 });
};

export const config = { schedule: '*/30 * * * *' };
