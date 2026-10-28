// 공고 수집(백그라운드 함수, 최대 15분). programs가 스냅샷이 없거나 오래됐을 때 요청한다.
// 공개 주소지만 최근 스냅샷(20분 이내)이 있으면 아무것도 하지 않아 반복 호출로 쿼터를 쓰지 못한다.
import { refreshSnapshot } from '../lib/collect.mjs';

export default async () => {
  await refreshSnapshot(process.env, { sourceTimeoutMs: 60000, aiStartBudgetMs: 90000 });
  return new Response(null, { status: 202 });
};
