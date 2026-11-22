// BECONIC 31 연결 — 다음 진단 추천·인증 간 준비 순서·공통 서류. 규칙은 data/links.json에만 있다.
import { S } from './engine.js';

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// 사업자등록 상태: 'pre'(등록 전) | 'own'(등록함) | null(모름·미답)
export function bizKind(answers) {
  const b = answers.biz_status;
  if (b === 'pre') return 'pre';
  if (b === 'individual' || b === 'corporation') return 'own';
  return null;
}

function matchWhen(w, ctx) {
  if (!w) return true;
  if (w.biz && ctx.biz !== w.biz) return false;
  if (w.selected_any && !w.selected_any.some((id) => ctx.selected.includes(id))) return false;
  if (w.selected_all_of && !w.selected_all_of.every((grp) => grp.some((id) => ctx.selected.includes(id)))) return false;
  if (w.purpose_any && !w.purpose_any.some((p) => ctx.purposes.includes(p))) return false;
  if (w.diagnosed && !ctx.diagnosed) return false;
  if (w.answer_in && !Object.entries(w.answer_in).every(([q, vals]) => vals.includes(ctx.answers[q]))) return false;
  return true;
}

function context(R, answers) {
  const selected = R.schemes.map((x) => x.scheme.scheme_id);
  return {
    answers, selected,
    biz: bizKind(answers),
    purposes: arr(answers.purposes),
    diagnosed: R.schemes.some((x) => x.result && x.result.gate.active && x.result.basic !== S.NA),
  };
}

// 다음 진단: 조건이 맞는 규칙을 위에서부터, 같은 도구는 한 번만, 최대 max_show개
export function nextSteps(links, R, answers) {
  if (!links) return [];
  const ctx = context(R, answers);
  const out = []; const used = new Set();
  for (const r of links.rules) {
    if (out.length >= (links.max_show || 3)) break;
    const tool = links.tools[r.tool];
    if (!tool || used.has(r.tool) || !matchWhen(r.when, ctx)) continue;
    used.add(r.tool);
    out.push({ id: r.id, code: r.tool, name: tool.n, url: tool.url, why: r.why });
  }
  return out;
}

// 인증 간 준비 순서(근거 있는 것만)
export function strategyNotes(links, R, answers) {
  if (!links || !links.strategy) return [];
  const ctx = context(R, answers);
  const seen = new Set();
  return links.strategy.filter((x) => matchWhen(x.when, ctx)).filter((x) => {
    if (seen.has(x.quote)) return false; // 같은 근거의 중복 안내는 하나만
    seen.add(x.quote); return true;
  }).map((x) => ({ id: x.id, text: x.text, source_refs: x.source_refs }));
}

// 2개 이상 인증에 공통으로 필요한 서류
export function commonDocs(links, R) {
  if (!links || !links.common_docs) return [];
  const groups = links.common_docs.groups;
  const hit = new Map();
  R.schemes.forEach((x) => {
    const rows = x.readiness ? x.readiness.rows.filter((r) => r.applicable) : [];
    rows.forEach((row) => {
      const g = groups.find((gr) => gr.match.some((m) => row.label.includes(m)));
      if (!g) return;
      if (!hit.has(g.name)) hit.set(g.name, new Set());
      hit.get(g.name).add(x.scheme.name_ko.replace(/\s*\(.*\)\s*$/, '')); // 화면용 짧은 이름(괄호 설명 제외)
    });
  });
  return [...hit.entries()].filter(([, set]) => set.size >= 2).map(([name, set]) => ({ name, schemes: [...set] }));
}
