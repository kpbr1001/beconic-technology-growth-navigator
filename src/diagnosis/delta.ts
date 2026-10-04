// Phase 7 재진단 비교(규칙 기반). 기준 진단의 '입력'을 현재 엔진으로 다시 계산해 같은 기준으로 비교한다.
// 기록은 브라우저·파일로만 보관(서버 저장 없음). 점수·우선순위를 새로 만들지 않고 두 결과의 차이만 해석한다.
import { evaluate } from './index';
import { AREA_NAME, DIMENSIONS } from './questions';
import { redTeam, type RiskEntry } from './redteam';
import type { AssessmentInput, AssessmentResult, Dimension, Priority } from './types';

export const SNAPSHOT_KIND = 'beconic-diagnosis';
export const SNAPSHOT_SCHEMA = 1;

export interface Snapshot {
  kind: typeof SNAPSHOT_KIND;
  schema: typeof SNAPSHOT_SCHEMA;
  id: string;
  /** ISO 시각 */
  savedAt: string;
  appVersion?: string;
  input: AssessmentInput;
  /** 저장 당시 결과 요약(기록 목록 표시용). 비교는 input을 현재 엔진으로 다시 계산해서 한다 */
  summary: {
    capability: number | null;
    confidence: number;
    level: AssessmentResult['level'];
    p0: string[];
    versions: AssessmentResult['versions'];
  };
}

const r0 = (x: number | null) => (x === null ? null : Math.round(x));

export function makeSnapshot(input: AssessmentInput, r: AssessmentResult, now = new Date(), appVersion?: string): Snapshot {
  const clone = JSON.parse(JSON.stringify(input)) as AssessmentInput;
  return {
    kind: SNAPSHOT_KIND,
    schema: SNAPSHOT_SCHEMA,
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: now.toISOString(),
    appVersion,
    input: {
      mode: clone.mode, company: clone.company, discovery: clone.discovery, inventory: clone.inventory,
      answers: clone.answers ?? {}, evidence: clone.evidence ?? {},
    },
    summary: {
      capability: r0(r.capability), confidence: Math.round(r.confidence), level: r.level,
      p0: r.gaps.filter((g) => g.priority === 'P0').map((g) => g.area), versions: r.versions,
    },
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 내보낸 기록 파일 검증. 형식이 맞지 않으면 null(받은 내용은 그대로 실행하지 않고 값만 쓴다) */
export function parseSnapshot(x: unknown): Snapshot | null {
  if (!isObj(x) || x.kind !== SNAPSHOT_KIND || x.schema !== SNAPSHOT_SCHEMA) return null;
  const i = x.input, s = x.summary;
  // id는 화면 버튼 동작에 쓰이므로 영문·숫자·하이픈만 허용(조작된 파일의 스크립트 주입 차단)
  if (typeof x.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(x.id) || typeof x.savedAt !== 'string' || Number.isNaN(Date.parse(x.savedAt))) return null;
  if (!isObj(i) || !isObj(s) || !isObj(i.company) || !isObj(i.discovery) || !isObj(i.answers) || !Array.isArray(i.inventory)) return null;
  if (i.mode !== 'quick' && i.mode !== 'deep') return null;
  const answers: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(i.answers)) {
    if (!/^[a-z]\d{1,2}$/.test(k)) continue;
    if (v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5)) answers[k] = v as number | null;
  }
  const evidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(isObj(i.evidence) ? i.evidence : {})) {
    if (/^[a-z]\d{1,2}$/.test(k) && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4) evidence[k] = v as number;
  }
  const str = (v: unknown, n = 600) => (typeof v === 'string' ? v.slice(0, n) : '');
  const c = i.company, d = i.discovery;
  const inventory = (i.inventory as unknown[]).filter(isObj).slice(0, 30).map((t, n) => ({
    id: Number.isFinite(t.id) ? Number(t.id) : n + 1, name: str(t.name, 120), type: str(t.type, 40), ownership: str(t.ownership, 40),
    status: str(t.status, 40), critical: t.critical === true, trl: Number.isInteger(t.trl) ? Math.max(0, Math.min(9, t.trl as number)) : 0,
    confirmed: t.confirmed === true,
  }));
  const versions = isObj(s.versions) ? s.versions : {};
  return {
    kind: SNAPSHOT_KIND, schema: SNAPSHOT_SCHEMA, id: x.id, savedAt: new Date(Date.parse(x.savedAt)).toISOString(), appVersion: str(x.appVersion, 40) || undefined,
    input: {
      mode: i.mode,
      company: {
        name: str(c.name, 80), stage: str(c.stage, 40), roadmapField: str(c.roadmapField, 60), bizType: str(c.bizType, 60),
        sectorDetail: str(c.sectorDetail, 300), size: str(c.size, 40), years: str(c.years, 40), techKnow: str(c.techKnow, 40),
        product: str(c.product), customer: str(c.customer, 300),
      },
      discovery: {
        hardPart: str(d.hardPart), automated: str(d.automated), data: str(d.data), external: str(d.external), people: str(d.people), validation: str(d.validation),
      },
      inventory, answers, evidence,
    },
    summary: {
      capability: typeof s.capability === 'number' ? Math.round(s.capability) : null,
      confidence: typeof s.confidence === 'number' ? Math.round(s.confidence) : 0,
      level: (['잠정진단', '근거기반 진단', '외부검증 준비'] as const).find((l) => l === s.level) ?? '잠정진단',
      p0: Array.isArray(s.p0) ? s.p0.filter((a): a is string => typeof a === 'string').slice(0, 7) : [],
      versions: { assessment: str(versions.assessment, 20), question: str(versions.question, 30), scoring: str(versions.scoring, 30), roadmapKb: str(versions.roadmapKb, 30) },
    },
  };
}

export type Verdict = '개선' | '악화' | '오차 범위 내' | '신규 산정' | '판단 보류';
export interface ScoreDelta {
  prev: number | null;
  cur: number | null;
  diff: number | null;
  verdict: Verdict;
}
export interface DimDelta extends ScoreDelta {
  dim: Dimension;
  area: string;
}
export interface TrlDelta {
  name: string;
  prev: number | null;
  cur: number | null;
  status: '상승' | '유지' | '하락' | '신규 지정' | '핵심 제외' | '확인 전';
}
export interface PriorityDelta {
  area: string;
  prevPriority: Priority;
  prevScore: number | null;
  curPriority: Priority | null;
  curScore: number | null;
  outcome: '해소' | '개선 중' | '정체' | '악화' | '판단 보류';
}
export interface RiskDelta {
  id: string;
  name: string;
  prev: RiskEntry['grade'] | null;
  cur: RiskEntry['grade'] | null;
  change: '완화' | '악화' | '유지' | '신규' | '해제' | '확인됨' | '미확인 전환';
}

export interface Delta {
  from: string;
  days: number;
  /** 기준 진단 저장 당시 점수식과 현재가 다르면 안내(비교는 현재 기준으로 다시 계산) */
  versionNote: string | null;
  modeNote: string | null;
  margin: number;
  capability: ScoreDelta;
  confidence: ScoreDelta;
  level: { prev: AssessmentResult['level']; cur: AssessmentResult['level'] };
  unknown: { prev: number; cur: number };
  dims: DimDelta[];
  trl: TrlDelta[];
  priorities: PriorityDelta[];
  risks: RiskDelta[];
  riskCounts: { prevHigh: number; curHigh: number };
  headline: string;
  next: string[];
}

const GRADE_RANK: Record<RiskEntry['grade'], number> = { 높음: 3, 중간: 2, 낮음: 1, '확인 필요': 0 };

/** 오차 범위: 두 진단 중 낮은 신뢰도 기준 불확실성(엔진 range와 같은 식), 최소 3점 */
export const deltaMargin = (prevConf: number, curConf: number) => Math.max(3, Math.round((100 - Math.min(prevConf, curConf)) * 0.18));

export function scoreDelta(prev: number | null, cur: number | null, margin: number): ScoreDelta {
  const p = r0(prev), c = r0(cur);
  if (p === null && c === null) return { prev: p, cur: c, diff: null, verdict: '판단 보류' };
  if (p === null) return { prev: p, cur: c, diff: null, verdict: '신규 산정' };
  if (c === null) return { prev: p, cur: c, diff: null, verdict: '판단 보류' };
  const diff = c - p;
  return { prev: p, cur: c, diff, verdict: diff >= margin ? '개선' : diff <= -margin ? '악화' : '오차 범위 내' };
}

const sign = (n: number | null) => (n === null ? '' : n > 0 ? `+${n}` : n === 0 ? '±0' : `${n}`);
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export function compareAssessments(prevSnap: Snapshot, curInput: AssessmentInput, cur: AssessmentResult, now = new Date()): Delta {
  const prev = evaluate(prevSnap.input);
  const prevRt = redTeam(prevSnap.input, prev), curRt = redTeam(curInput, cur);
  const margin = deltaMargin(prev.confidence, cur.confidence);
  const v0 = prevSnap.summary.versions, v1 = cur.versions;
  const versionNote =
    v0.scoring && (v0.scoring !== v1.scoring || v0.question !== v1.question)
      ? `기준 진단은 ${v0.question}·${v0.scoring}으로 저장됐으며, 같은 기준 비교를 위해 현재 ${v1.question}·${v1.scoring}으로 다시 계산했습니다.`
      : null;
  const modeNote = prevSnap.input.mode !== curInput.mode
    ? `진단 유형이 다릅니다(${prevSnap.input.mode === 'deep' ? '정밀' : '간편'} → ${curInput.mode === 'deep' ? '정밀' : '간편'}). 산업 심화 문항 차이만큼 영역 점수가 달라질 수 있습니다.`
    : null;

  const dims = DIMENSIONS.map((d) => ({ dim: d, area: AREA_NAME[d], ...scoreDelta(prev.m[d], cur.m[d], margin) }));

  // 핵심기술 TRL: 이름으로 맞춘다(목록 순서·id가 바뀌어도 비교)
  const crit = (i: AssessmentInput) => new Map(i.inventory.filter((t) => t.critical && t.name.trim()).map((t) => [t.name.trim(), t.trl > 0 ? t.trl : null]));
  const pT = crit(prevSnap.input), cT = crit(curInput);
  const trl: TrlDelta[] = [...new Set([...pT.keys(), ...cT.keys()])].map((name) => {
    const p = pT.get(name) ?? null, c = cT.get(name) ?? null;
    const status: TrlDelta['status'] = !pT.has(name) ? '신규 지정' : !cT.has(name) ? '핵심 제외'
      : p === null || c === null ? '확인 전' : c > p ? '상승' : c < p ? '하락' : '유지';
    return { name, prev: p, cur: c, status };
  });

  // 기준 진단의 P0·P1 과제가 어떻게 됐는지(이행 결과)
  const curGap = new Map(cur.gaps.map((g) => [g.area, g]));
  const dimOf = new Map(DIMENSIONS.map((d) => [AREA_NAME[d], d]));
  const priorities: PriorityDelta[] = prev.gaps.filter((g) => g.priority !== 'P2').map((g) => {
    const d = dimOf.get(g.area);
    const cs = d ? cur.m[d] : null;
    const sd = scoreDelta(g.score, cs, margin);
    const cg = curGap.get(g.area);
    const outcome: PriorityDelta['outcome'] = sd.verdict === '판단 보류' || sd.verdict === '신규 산정' ? '판단 보류'
      : sd.verdict === '악화' ? '악화'
        : !cg || (g.priority === 'P0' && cg.priority !== 'P0') ? '해소'
          : sd.verdict === '개선' ? '개선 중' : '정체';
    return { area: g.area, prevPriority: g.priority, prevScore: r0(g.score), curPriority: cg?.priority ?? null, curScore: r0(cs), outcome };
  });

  const pR = new Map(prevRt.risks.map((x) => [x.id, x])), cR = new Map(curRt.risks.map((x) => [x.id, x]));
  const risks: RiskDelta[] = [...new Set([...pR.keys(), ...cR.keys()])].map((id) => {
    const p = pR.get(id), c = cR.get(id);
    const pg = p?.grade ?? null, cg = c?.grade ?? null;
    let change: RiskDelta['change'];
    if (!p) change = '신규';
    else if (!c) change = '해제';
    else if (pg === '확인 필요' && cg !== '확인 필요') change = '확인됨';
    else if (pg !== '확인 필요' && cg === '확인 필요') change = '미확인 전환';
    else change = GRADE_RANK[cg!] < GRADE_RANK[pg!] ? '완화' : GRADE_RANK[cg!] > GRADE_RANK[pg!] ? '악화' : '유지';
    return { id, name: (c ?? p)!.name, prev: pg, cur: cg, change };
  }).sort((a, b) => Number(b.change === '악화') - Number(a.change === '악화') || Number(b.change === '완화') - Number(a.change === '완화'));

  const capability = scoreDelta(prev.capability, cur.capability, margin);
  const confidence = scoreDelta(prev.confidence, cur.confidence, margin);
  const days = Math.max(0, Math.round((now.getTime() - Date.parse(prevSnap.savedAt)) / 86_400_000));
  const prevP0 = priorities.filter((p) => p.prevPriority === 'P0');
  const solved = prevP0.filter((p) => p.outcome === '해소').length;
  const riskCounts = { prevHigh: prevRt.counts.high, curHigh: curRt.counts.high };

  const capText = capability.diff === null ? `기술역량 ${capability.verdict}` : `기술역량 ${capability.prev}→${capability.cur}(${sign(capability.diff)}, ${capability.verdict})`;
  const headline = `기준 진단(${fmtDate(prevSnap.savedAt)}) 이후 ${days}일, ${capText}, 진단 신뢰도 ${confidence.prev}→${confidence.cur}(${sign(confidence.diff)}). ` +
    `기준 P0 과제 ${prevP0.length}개 중 ${solved}개 해소, '높음' 리스크 ${riskCounts.prevHigh}→${riskCounts.curHigh}건입니다.`;

  // 다음 90일 초점(규칙): 악화·정체된 기준 P0 → 현재 P0 → 남은 '모름' → TRL 확인
  const next: string[] = [];
  for (const p of priorities) {
    if (p.outcome === '악화') next.push(`${p.area}: 기준 진단보다 낮아졌습니다. 원인(담당 변경·외부 요인·응답 기준 차이)을 먼저 확인하세요.`);
    else if (p.prevPriority === 'P0' && p.outcome === '정체') next.push(`${p.area}: 기준 P0 과제가 오차 범위 안에서 정체입니다. 완료기준·담당을 다시 정하고 P0로 유지하세요.`);
  }
  for (const g of cur.gaps.filter((g) => g.priority === 'P0' && !prev.gaps.some((x) => x.area === g.area && x.priority === 'P0'))) {
    next.push(`${g.area}: 이번 진단에서 새로 P0가 됐습니다. 다음 90일 과제에 추가하세요.`);
  }
  if (cur.unknown > 0) next.push(`'모름' ${cur.unknown}개 문항(기준 ${prev.unknown}개)을 담당자 확인으로 줄이면 비교 정확도가 높아집니다.`);
  const pendingTrl = trl.filter((t) => t.status === '확인 전').length;
  if (pendingTrl) next.push(`핵심기술 ${pendingTrl}개의 TRL이 확인 전이라 기술성숙 변화를 판단하지 못했습니다.`);
  if (!next.length) next.push('기준 P0 과제가 모두 해소·개선됐습니다. 현재 P0·P1로 다음 90일 계획을 다시 세우세요.');

  return {
    from: prevSnap.savedAt, days, versionNote, modeNote, margin, capability, confidence,
    level: { prev: prev.level, cur: cur.level }, unknown: { prev: prev.unknown, cur: cur.unknown },
    dims, trl, priorities, risks, riskCounts, headline, next: next.slice(0, 5),
  };
}
