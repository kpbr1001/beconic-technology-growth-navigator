// /api/ai-discover — 기술 발견 답변에서 보유 기술 후보 찾기(Claude). 접수·조회 절차는 /api/ai-interpret와 같고
// 처리는 같은 백그라운드 함수(ai-interpret-background)가 작업 종류(task: 'discover')를 보고 나눈다.
// 외부 처리 동의(consent: true)가 없으면 400. 키는 서버 환경변수에서만 읽는다.
import { DiscoverRequest } from '../../src/ai/discover';
import { handle } from './ai-interpret';

export default (req: Request) => handle(req, process.env, undefined, DiscoverRequest as unknown as Parameters<typeof handle>[3]);

export const config = { path: '/api/ai-discover' };
