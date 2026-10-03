// Claude 해석 백그라운드 처리(파일명 -background → Netlify 백그라운드 함수, 최대 15분).
// /api/ai-interpret 가 접수한 작업 id만 받는다. 대기 중인 작업이 아니면 아무것도 하지 않는다.
import { blobJobStore } from '../../src/ai/blob-store';
import { processJob } from '../../src/ai/jobs';

export default async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { job?: unknown };
  if (typeof body.job === 'string') await processJob(body.job, blobJobStore(), process.env);
  return new Response(null, { status: 202 });
};
