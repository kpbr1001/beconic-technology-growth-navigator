// Claude 해석 사후검증(코드). 모델 출력에 나온 점수·TRL·품목코드·쪽 번호가 입력(Rule Engine 결과·원문 근거)에
// 실제로 있는지 대조하고, 없으면 그 문장을 제거한다. 적합도 등급·확인되지 않은 '사실' 표기도 막는다.
import { CLAIM_TYPES, type ClaimType, type Interpretation } from './schema';

export interface GuardContext {
  /** Rule Engine이 계산한 점수(반올림 정수): 7개 영역·기술역량·진단 신뢰도 */
  scores: number[];
  /** 입력·원문에 실제로 있는 TRL 숫자 */
  trls: number[];
  /** 원문 근거가 있는 로드맵 품목 고유키 */
  evidenceUids: string[];
  /** 품목별 원문 근거 텍스트(발췌·라벨·기술명·출처). 로드맵 노트의 수치(10ms, 95% 등)가 원문에 있는지 대조 */
  evidenceText?: Record<string, string>;
  /** 원문 근거에 있는 공식 품목코드 */
  codes: string[];
  /** 원문 근거의 인쇄 쪽·PDF 쪽 */
  pages: number[];
  /** Rule Engine 우선순위 영역(순서 그대로). 맞춤 실행과제는 이 영역만 허용 */
  gapAreas?: string[];
  /** 화면의 R&D 과제 제안 번호. 과제 메모는 이 번호만 허용 */
  rndIds?: string[];
  /** 외부검증 근거가 없으면 '확인된 사실' 표기를 자가응답으로 낮춘다 */
  allowVerifiedFact: boolean;
}

export type ViolationKind = 'number_not_in_source' | 'score_mismatch' | 'trl_mismatch' | 'unknown_item' | 'unknown_page' | 'fit_grade' | 'claim_downgraded' | 'trimmed';
export interface Violation {
  kind: ViolationKind;
  field: string;
  text: string;
}

const LIMITS = { strengths: 3, constraints: 3, root_cause_hypotheses: 4, confirmation_needed: 4, roadmap_notes: 3, option_notes: 3, action_plan: 5, rnd_notes: 3 } as const;
/** 과제 메모에 쓰면 안 되는 표현(선정 가능성·적합도) */
const SELECTION_RE = /선정|합격|채택\s?가능|가능성\s?(?:이\s?)?(?:높|크)|적합도/;
const OPTIONS = ['A', 'B', 'C'] as const;
const MAX_TEXT = 220;

const SCORE_RE = /(\d{1,3}(?:\.\d+)?)\s*(?:\/\s*100|점)/g;
const TRL_RE = /TRL\s*:?\s*(\d)(?:\s*[~\-–→]\s*(\d))?/gi;
const CODE_RE = /\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\d{2}-\d{2}\b/g;
const PAGE_RE = /p\.\s*(\d{1,4})/gi;
const FIT_RE = /적합도|적합성\s*(?:높|중|낮)|(?:높음|중간|낮음)/;

/** 문장 속 숫자(쪽 번호·TRL 표기는 제외 — 별도 규칙으로 대조) */
export const numbersIn = (t: string) =>
  [...t.replace(PAGE_RE, ' ').replace(TRL_RE, ' ').matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);

/** 같은 키는 첫 항목만(전략안·영역별 1개) */
const uniqueBy = <T>(xs: T[], key: (x: T) => string) => xs.filter((x, i) => xs.findIndex((y) => key(y) === key(x)) === i);

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s);

/** 문장 하나 검사: 위반 종류(없으면 null) */
export function checkText(text: string, ctx: GuardContext, { roadmap = false } = {}): ViolationKind | null {
  for (const m of text.matchAll(SCORE_RE)) {
    const v = Math.round(Number(m[1]));
    if (!ctx.scores.includes(v)) return 'score_mismatch';
  }
  for (const m of text.matchAll(TRL_RE)) {
    for (const g of [m[1], m[2]]) if (g !== undefined && !ctx.trls.includes(Number(g))) return 'trl_mismatch';
  }
  for (const m of text.matchAll(CODE_RE)) if (!ctx.codes.includes(m[0])) return 'unknown_item';
  for (const m of text.matchAll(PAGE_RE)) if (!ctx.pages.includes(Number(m[1]))) return 'unknown_page';
  if (roadmap && FIT_RE.test(text)) return 'fit_grade';
  return null;
}

export function applyGuardrail(raw: Interpretation, ctx: GuardContext): { output: Interpretation; violations: Violation[] } {
  const violations: Violation[] = [];
  const keep = <T>(field: keyof typeof LIMITS | 'headline', items: T[], textOf: (x: T) => string[], opts = {}): T[] => {
    const out: T[] = [];
    for (const it of items) {
      const bad = textOf(it).map((t) => checkText(t, ctx, opts)).find(Boolean);
      if (bad) violations.push({ kind: bad, field, text: textOf(it).join(' / ').slice(0, 120) });
      else out.push(it);
    }
    const lim = field === 'headline' ? out.length : LIMITS[field];
    if (out.length > lim) violations.push({ kind: 'trimmed', field, text: `${out.length - lim}개 초과분 제외` });
    return out.slice(0, lim);
  };

  const claim = (c: Interpretation['strengths'][number], field: string) => {
    if (!CLAIM_TYPES.includes(c.claim_type as ClaimType)) {
      violations.push({ kind: 'claim_downgraded', field, text: c.text.slice(0, 120) });
      return { ...c, claim_type: 'hypothesis' as const, text: clip(c.text), basis: clip(c.basis) };
    }
    if (c.claim_type === 'verified_fact' && !ctx.allowVerifiedFact) {
      violations.push({ kind: 'claim_downgraded', field, text: c.text.slice(0, 120) });
      return { ...c, claim_type: 'self_report' as const, text: clip(c.text), basis: clip(c.basis) };
    }
    return { ...c, text: clip(c.text), basis: clip(c.basis) };
  };

  const headlineOk = keep('headline', [raw.headline], (h) => [h]);
  return {
    violations,
    output: {
      headline: headlineOk.length ? clip(raw.headline) : '',
      strengths: keep('strengths', raw.strengths, (c) => [c.text, c.basis]).map((c) => claim(c, 'strengths')),
      constraints: keep('constraints', raw.constraints, (c) => [c.text, c.basis]).map((c) => claim(c, 'constraints')),
      root_cause_hypotheses: keep('root_cause_hypotheses', raw.root_cause_hypotheses, (h) => [h.text, h.verify_by]).map((h) => ({
        text: clip(h.text), verify_by: clip(h.verify_by),
      })),
      confirmation_needed: keep('confirmation_needed', raw.confirmation_needed, (q) => [q]).map(clip),
      roadmap_notes: keep(
        'roadmap_notes',
        raw.roadmap_notes.filter((n) => {
          if (!ctx.evidenceUids.includes(n.item_uid)) {
            violations.push({ kind: 'unknown_item', field: 'roadmap_notes', text: n.item_uid.slice(0, 80) });
            return false;
          }
          // 원문 노트의 숫자는 그 품목 원문 근거에 실제로 있는 숫자만(입력 점수·TRL·쪽은 위 규칙으로 따로 대조)
          const src = ctx.evidenceText?.[n.item_uid];
          const stray = src === undefined ? undefined : numbersIn(n.text).find((x) => !numbersIn(src).includes(x) && !ctx.scores.includes(Number(x)));
          if (stray) {
            violations.push({ kind: 'number_not_in_source', field: 'roadmap_notes', text: n.text.slice(0, 120) });
            return false;
          }
          return true;
        }),
        (n) => [n.text],
        { roadmap: true },
      ).map((n) => ({ ...n, text: clip(n.text) })),
      option_notes: keep(
        'option_notes',
        uniqueBy(
          (raw.option_notes ?? []).flatMap((o) => {
            // "B", "B.", "B안", "B. 제품화…" → B. 기호를 알 수 없으면 제외
            const k = o.option.trim().toUpperCase().charAt(0);
            if (!(OPTIONS as readonly string[]).includes(k)) {
              violations.push({ kind: 'unknown_item', field: 'option_notes', text: o.option.slice(0, 40) });
              return [];
            }
            return [{ ...o, option: k }];
          }),
          (o) => o.option,
        ).sort((a, b) => a.option.localeCompare(b.option)),
        (o) => [o.text, o.prerequisite],
      ).map((o) => ({ option: o.option, text: clip(o.text), prerequisite: clip(o.prerequisite) })),
      action_plan: keep(
        'action_plan',
        uniqueBy(
          (raw.action_plan ?? []).filter((a) => {
            const ok = (ctx.gapAreas ?? []).includes(a.area.trim());
            if (!ok) violations.push({ kind: 'unknown_item', field: 'action_plan', text: a.area.slice(0, 40) });
            return ok;
          }),
          (a) => a.area.trim(),
        ).sort((a, b) => (ctx.gapAreas ?? []).indexOf(a.area.trim()) - (ctx.gapAreas ?? []).indexOf(b.area.trim())),
        (a) => [a.action, a.kpi, a.evidence],
      ).map((a) => ({ area: a.area.trim(), action: clip(a.action), kpi: clip(a.kpi), evidence: clip(a.evidence) })),
      rnd_notes: keep(
        'rnd_notes',
        uniqueBy(
          (raw.rnd_notes ?? []).filter((n) => {
            const ok = (ctx.rndIds ?? []).includes(n.id.trim());
            if (!ok) violations.push({ kind: 'unknown_item', field: 'rnd_notes', text: n.id.slice(0, 20) });
            else if (SELECTION_RE.test(`${n.title} ${n.summary}`)) {
              violations.push({ kind: 'fit_grade', field: 'rnd_notes', text: n.title.slice(0, 80) });
              return false;
            }
            return ok;
          }),
          (n) => n.id.trim(),
        ),
        (n) => [n.title, n.summary],
      ).map((n) => ({ id: n.id.trim(), title: n.title.length > 60 ? `${n.title.slice(0, 59)}…` : n.title, summary: clip(n.summary) })),
    },
  };
}
