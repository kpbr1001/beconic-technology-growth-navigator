// 쉬운 용어 변환(화면·PDF 공용). 컨설팅 영어 용어를 사용자가 이해하기 쉬운 우리말로 바꾸고,
// 영어로 전해야 하는 말은 한국어를 함께 적는다. 진단 엔진·저장 데이터는 그대로 두고 '보이는 글자'만 바꾼다.
// 사용자가 입력 중인 칸(textarea·input)과 data-raw 표시 영역은 바꾸지 않는다.
import { fixParticles, josa } from '../reports/ko';

type Term = [RegExp, string];
const W = (s: string) => new RegExp(`(?<![A-Za-z0-9_])${s}(?![A-Za-z0-9_])`, 'g');
/** 이미 괄호로 병행표기된 경우 다시 붙이지 않음 */
const P = (s: string) => new RegExp(`(?<![A-Za-z0-9_])${s}(?![A-Za-z0-9_]|\\s*\\()`, 'g');

/** 긴 표현부터(부분 겹침 방지). 바꾼 결과에는 다시 걸리는 영어 단어가 없어야 한다(멱등) */
export const TERMS: Term[] = [
  // 보고서 쪽 제목·머리말
  [W('Methodology & Data Quality'), '진단 방법·데이터 품질'],
  [W('Methodology & Evidence'), '진단 방법·근거'],
  [W('Capability Scorecard'), '역량 점수표'],
  [W('Critical Technology & TRL'), '핵심기술·TRL'],
  [W('12-Month & 3-5 Year Roadmap'), '1년·3~5년 로드맵'],
  [W('Technology Growth Roadmap'), '기술성장 로드맵'],
  [W('90-Day Execution Plan'), '90일 실행계획'],
  [W('90-Day Plan'), '90일 실행계획'],
  [W('Executive Summary'), '경영진 요약'],
  [W('Deep Diagnosis'), '심층 진단'],
  [W('Strategic Alignment'), '로드맵 정렬'],
  [W('Gap & Root Cause'), '격차·근본원인'],
  [W('Gap Intelligence'), '격차 분석'],
  [W('Strategic Options'), '전략 대안'],
  [W('Risk Red Team'), '리스크 레드팀'],
  [W('KPI & Governance'), '성과지표·운영 체계'],
  [W('Risk & Governance'), '리스크·운영 체계'],
  [W('Appendix & Limitations'), '부록·한계'],
  [W('Re-diagnosis Delta'), '재진단 비교'],
  [W('R&D Proposals'), 'R&D 과제 제안'],
  [W('Appendix'), '부록'],
  // 진단 흐름·개념
  [W('Evidence Confidence'), '근거 신뢰도'],
  [W('Next Best Evidence'), '다음에 확보할 근거'],
  [W('Next Best Action'), '다음 실행'],
  [W('Evidence-aware Assessment'), '근거 기반 진단'],
  [W('Evidence-aware'), '근거 기반 진단'],
  [W('Technology Discovery'), '기술 발견'],
  [W('Critical Technology'), '핵심기술'],
  [W('Roadmap Intelligence'), '로드맵 연계'],
  [W('Action Roadmap'), '실행 로드맵'],
  [W('Technology Fingerprint'), '기술 특징 요약'],
  [W('Dependency Map'), '의존요소 목록'],
  [W('Knowledge Base'), '로드맵 원문 자료'],
  [W('Multi-Respondent'), '다중 응답자'],
  [W('Peer Benchmark'), '동종업계 비교'],
  [W('Citation Accuracy'), '인용 정확도'],
  [W('Cognitive Interview'), '문항 이해도 인터뷰'],
  [W('Hybrid RAG'), '원문 검색'],
  [W('Lead Time'), '소요 기간'],
  [W('Due Date'), '기한'],
  [W('TRL Gate'), 'TRL 검증 관문'],
  [/핵심 Focus/g, '중점 과제'],
  // 단어
  [W('Evidence'), '근거자료'],
  [W('Owner'), '담당자'],
  [W('Gate'), '검증 관문'],
  [W('Scale-up'), '규모 확대'],
  [W('Crosswalk'), '대조표'],
  [W('Trade-off'), '감수할 점'],
  [W('Focus'), '중점'],
  [W('Governance'), '운영 체계'],
  [W('Gap'), '격차'],
  [W('Milestone'), '중간 목표'],
  [W('Blocker'), '걸림돌'],
  [W('Scorecard'), '점수표'],
  [W('Pilot'), '시범 적용'],
  [W('Calibration'), '점수 보정'],
  [W('Delta'), '변화'],
  [W('Confidence'), '신뢰도'],
  [W('Core'), '공통'],
  [W('QA'), '점검'],
  [W('citation'), '원문 인용'],
  [W('Red Team'), '레드팀'],
  [W('POC'), '시범'],
  [W('KPI'), '성과지표'],
  [W('IP'), '지식재산'],
  [/(?<![A-Za-z0-9_])Top ?(\d)/g, '상위 $1'],
  // 영어로 전해야 하는 말: 한국어 병행표기
  [P('PoC'), 'PoC(개념검증)'],
  [P('CVI/CVR'), 'CVI/CVR(전문가 타당도 지수)'],
  [P('Gold Set'), 'Gold Set(정답 세트)'],
  [/(?<![A-Za-z0-9_(])Hit@K·NDCG(?!\))/g, '검색 정확도 지표(Hit@K·NDCG)'],
];

export { josa };

const PAIRS: Record<string, [string, string]> = {
  을: ['을', '를'], 를: ['을', '를'], 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'],
  과: ['과', '와'], 와: ['과', '와'], 으로: ['으로', '로'], 로: ['으로', '로'],
};
const MARK = '\uE000';
/** 바꾼 말 바로 뒤 조사를 새 말의 받침에 맞춤(예: Gate를 → 검증 관문을) */
const fixJosa = (s: string) =>
  s.replace(/([가-힣])\uE000(으로|을|를|이|가|은|는|과|와|로)(?![가-힣])/g, (_m, last: string, p: string) => {
    const [a, b] = PAIRS[p];
    return josa(last, a, b);
  }).replace(/\uE000/g, '');
/** 번역 뒤 같은 말이 겹치는 경우 정리(예: '운영 운영 체계', '의존요소 목록(의존요소 목록)') */
const dedupe = (s: string) => s.replace(/(?<![가-힣])([가-힣]{2,4}) \1(?![가-힣])/g, '$1').replace(/([가-힣·][가-힣· ]{1,14})\(\1\)/g, '$1');

/** 문자열 하나 변환(멱등) */
export function plainKo(text: string): string {
  if (!/[A-Za-z]/.test(text)) return fixParticles(text);
  let out = text;
  for (const [re, to] of TERMS) out = out.replace(re, (...a) => `${to.replace(/\$(\d)/g, (_m, n: string) => String(a[Number(n)] ?? ''))}${MARK}`);
  if (out.indexOf(MARK) < 0) return fixParticles(text);
  return fixParticles(dedupe(fixJosa(out)));
}

const SKIP = new Set(['TEXTAREA', 'INPUT', 'SCRIPT', 'STYLE', 'CODE', 'OPTION']);

/** DOM 아래 보이는 글자만 변환. 입력칸·data-raw 영역은 건너뜀 */
const skipped = (el: Element | null) => {
  for (let p = el; p; p = p.parentElement) if (SKIP.has(p.tagName) || p.hasAttribute('data-raw')) return true;
  return false;
};

export function plainDom(root: Node): void {
  if (typeof document === 'undefined') return;
  if (root.nodeType === Node.TEXT_NODE) {
    const t = root as Text;
    if (!skipped(t.parentElement)) {
      const next = plainKo(t.data);
      if (next !== t.data) t.data = next;
    }
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (skipped(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const n of nodes) {
    const next = plainKo(n.data);
    if (next !== n.data) n.data = next;
  }
}

/** 화면이 바뀔 때마다(결과·PDF·AI 해석 도착 등) 새 글자를 자동 변환 */
export function installPlainKo(root: HTMLElement = document.body): void {
  plainDom(root);
  let queued = false;
  const pending = new Set<Node>();
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') pending.add(r.target);
      else r.addedNodes.forEach((n) => pending.add(n));
    }
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const list = [...pending];
      pending.clear();
      for (const n of list) if (n.isConnected) plainDom(n);
    });
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
