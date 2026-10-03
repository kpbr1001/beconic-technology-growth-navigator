// Netlify Blobs 작업 저장소(서버 전용). 함수 실행 환경에서 자동으로 인증된다.
import { getStore } from '@netlify/blobs';
import type { Job, JobStore } from './jobs';

export function blobJobStore(): JobStore {
  const s = getStore({ name: 'ai-interpret', consistency: 'strong' });
  return {
    get: async (id) => ((await s.get(id, { type: 'json' })) as Job | null) ?? null,
    set: async (id, job) => {
      await s.setJSON(id, job);
    },
  };
}
