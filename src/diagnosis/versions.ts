// 진단 결과 재현성을 위한 버전 태그. 문항·점수식·KB가 바뀌면 반드시 올린다.
import type { Versions } from './types';

export const VERSIONS: Versions = {
  /** 0.9.3: TRL 대조 경고 추가(점수·우선순위 불변) */
  assessment: '0.9.4',
  /** 문항 문구·가중치는 v0.9와 동일 */
  question: 'core12-v0.9',
  /** rule-v0.9 대비: 무응답 차원 null 처리(D2), TRL 평균 폐지(D3) */
  /** rule-v1.1: 최소 응답 기준(공통 핵심 8문항 미만 → 전 영역 판단 보류) */
  scoring: 'rule-v1.1',
  /** 공식 로드맵 원문 색인(전략품목·핵심기술명·원문 쪽) + 원문 근거 검색(설정 시) */
  roadmapKb: 'index-kb-v2',
};
