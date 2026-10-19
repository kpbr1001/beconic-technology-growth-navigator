// 재무진단 AI 백그라운드 처리 (파일명 -background → Netlify 백그라운드 함수, 최대 15분)
// /api/finance-insights 가 접수한 작업 id만 받는다. 대기(queued) 중인 작업이 아니면 아무것도 하지 않는다.
// 처리 후 입력(요약 지표)은 지우고 결과만 남긴다.
import { getStore } from '@netlify/blobs';
import { runInsights, defaultClient } from '../../lib/ai-core.mjs';

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createBackground({ jobs: jobsFactory = () => getStore('finance-ai-jobs'), client = defaultClient } = {}) {
  return async (req) => {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.job === 'string' ? body.job : '';
    if (!JOB_ID.test(id) || process.env.BECONIC_AI_ENABLED !== 'true' || !process.env.ANTHROPIC_API_KEY) return new Response(null, { status: 202 });
    const jobs = jobsFactory();
    const job = await jobs.get(id, { type: 'json' }).catch(() => null);
    if (!job || job.status !== 'queued' || !job.request) return new Response(null, { status: 202 });
    await jobs.setJSON(id, { ...job, status: 'running' });
    let result;
    try {
      result = await runInsights(job.request, client());
    } catch {
      result = { status: 'error', http: 502, error: 'AI 처리 중 오류가 발생했습니다.' };
    }
    if (result.status === 'ok') console.log('finance-insights ok', JSON.stringify({ model: result.model, removed: result.removed || 0 }));
    else console.error('finance-insights 실패', result.http);
    await jobs.setJSON(id, { status: 'done', createdAt: job.createdAt, result });
    return new Response(null, { status: 202 });
  };
}

export default createBackground();
