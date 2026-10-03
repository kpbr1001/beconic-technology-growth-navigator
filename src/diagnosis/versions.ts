// 진단 결과 재현성을 위한 버전 태그. 문항·점수식·KB가 바뀌면 반드시 올린다.
import type { Versions } from './types';

export const VERSIONS: Versions = {
  assessment: '0.9.2',
  /** 문항 문구·가중치는 v0.9와 동일 */
  question: 'core12-v0.9',
  /** rule-v0.9 대비: 무응답 차원 null 처리(D2), TRL 평균 폐지(D3) */
  scoring: 'rule-v1.0',
  /** 공식 로드맵 원문 색인(전략품목·핵심기술명·원문 쪽) 연결, 원문 문장 RAG는 미연결 */
  roadmapKb: 'index-kb-v2',
};
