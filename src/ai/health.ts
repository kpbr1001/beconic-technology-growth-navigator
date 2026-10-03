// 연동 상태 점검(신호등) — 서버 전용. 키 값·주소는 응답에 넣지 않고 상태·짧은 설명만 돌려준다.
//  green: 연결·실조회 성공 / yellow: 대체 동작 중(예: 키워드만) / red: 설정됐는데 오류 / gray: 꺼짐(미설정)
import type Anthropic from '@anthropic-ai/sdk';
import { createEmbeddingProvider } from '../rag/embedding';
import { supabaseConfigFromEnv, supabaseKeywordRetriever } from '../rag/supabase';
import { DEFAULT_MODEL } from './interpret';
import type { JobStore } from './jobs';

type Env = Record<string, string | undefined>;
export type Light = 'green' | 'yellow' | 'red' | 'gray';
export interface Check {
  light: Light;
  label: string;
  detail: string;
}
export interface HealthReport {
  checkedAt: string;
  evidence: Check;
  semantic: Check;
  claude: Check;
  jobs: Check;
}

export interface HealthDeps {
  /** Claude 키 확인(모델 정보 조회 — 토큰 비용 없음) */
  claudeClient: (key: string) => Pick<Anthropic, 'models'>;
  store: () => JobStore;
}

const errKind = (e: unknown) => {
  const st = (e as { status?: number })?.status;
  return st ? `HTTP ${st}` : e instanceof Error ? e.name : '오류';
};

export async function checkHealth(env: Env, deps: HealthDeps): Promise<HealthReport> {
  const sb = supabaseConfigFromEnv(env);
  const embed = createEmbeddingProvider(env);
  const key = env.ANTHROPIC_API_KEY?.trim();
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  const evidence = (async (): Promise<Check> => {
    if (!sb) return { light: 'gray', label: '미설정', detail: 'Supabase 환경변수 없음 — 원문 색인 후보만 표시' };
    try {
      const rows = await supabaseKeywordRetriever(sb).search('예지보전 설비', {}, 1);
      return rows.length
        ? { light: 'green', label: '정상', detail: '로드맵 원문 DB 조회 성공' }
        : { light: 'yellow', label: '데이터 확인', detail: 'DB 연결은 되지만 원문 문단 검색 결과 없음(적재 확인)' };
    } catch (e) {
      return { light: 'red', label: '오류', detail: `로드맵 원문 DB 조회 실패(${errKind(e)})` };
    }
  })();

  const semantic: Check = embed.enabled
    ? { light: 'green', label: '설정됨', detail: `의미 검색 켜짐(${embed.id} · ${embed.model ?? ''})` }
    : { light: sb ? 'yellow' : 'gray', label: '키워드만', detail: '의미 검색(임베딩) 꺼짐 — 키워드 검색으로 원문 근거 제공' };

  const claude = (async (): Promise<Check> => {
    if (!key) return { light: 'gray', label: '미설정', detail: 'ANTHROPIC_API_KEY 없음 — 규칙 기반 해석만' };
    try {
      await deps.claudeClient(key).models.retrieve(model);
      return { light: 'green', label: '정상', detail: `Claude API 키·모델 확인(${model})` };
    } catch (e) {
      const st = (e as { status?: number })?.status;
      const why = st === 401 ? '키 오류' : st === 403 ? '권한 없음' : st === 404 ? '모델 이름 확인' : st === 429 ? '사용 한도' : errKind(e);
      return { light: 'red', label: '오류', detail: `Claude API 확인 실패(${why})` };
    }
  })();

  const jobs = (async (): Promise<Check> => {
    if (!key) return { light: 'gray', label: '미사용', detail: 'AI 해석이 꺼져 있어 사용하지 않음' };
    try {
      await deps.store().get('00000000-0000-4000-8000-000000000000');
      return { light: 'green', label: '정상', detail: '해석 작업 저장소(Netlify Blobs) 연결' };
    } catch (e) {
      return { light: 'red', label: '오류', detail: `해석 작업 저장소 연결 실패(${errKind(e)})` };
    }
  })();

  return { checkedAt: new Date().toISOString(), evidence: await evidence, semantic, claude: await claude, jobs: await jobs };
}
