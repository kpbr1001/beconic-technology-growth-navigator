// docs/QUESTION_AUDIT.md 생성 — 인증별로 실제 화면에 나오는 질문과 그 질문을 쓰는 규칙·근거를 데이터에서 뽑는다(손으로 고치지 말 것).
// 사용: node scripts/question_audit.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDataSync, ROOT } from '../tests/helpers.mjs';
import { questionsUsedBy, IMPLICIT_INPUTS } from '../src/engine.js';
import { answerQuestions } from '../src/views.js';
import { levelOf, LEVEL_LABEL } from '../src/ui.js';

const D = loadDataSync();
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const kind = (s) => (D.packs[s.scheme_id] ? '규칙 자동 판정' : s.self_check ? '자가 체크리스트' : s.triage ? '해외 규정 트리아지' : s.prep_check ? '신청 준비 점검' : '-');
const L = ['# 인증별 질문 전수 점검표 (QUESTION_AUDIT)', '',
  `> 자동 생성: \`node scripts/question_audit.mjs\` · 데이터 ${D.catalog.version} · 인증 ${D.catalog.schemes.length}개`, '',
  '원칙: 판정에 쓰는 질문만 묻는다(QS-01·04·08), 판정 함수가 읽는 질문은 빠짐없이 묻는다(QS-01·02), 판정 규칙이 없는 인증은 자격을 판정하지 않고 신청 준비만 점검한다(QS-09).', '',
  '## 1. 인증별 질문 구성', '',
  '| 인증 | 등급 | 질문 방식 | 공통 | 제품·시장 | 인증별 | 합계 | 인증별 문항 |', '|---|---|---|---|---|---|---|---|'];
const counts = {};
for (const s of D.catalog.schemes) {
  const { common, exp, per } = answerQuestions({ selected: [s.scheme_id], answers: {}, f: {} }, D);
  const p = per[0];
  const items = [...p.list.map((q) => q.label_plain_ko), ...p.checks.map((c) => c.label)];
  const total = common.length + exp.length + items.length;
  const k = kind(s); counts[k] = (counts[k] || 0) + 1;
  L.push(`| ${esc(s.name_ko)} | ${LEVEL_LABEL[levelOf(s)]} | ${k} | ${common.length} | ${exp.length} | ${items.length} | ${total} | ${esc(items.join(' / ') || '-')} |`);
}
L.push('', `질문 방식 분포: ${Object.entries(counts).map(([k, n]) => `${k} ${n}개`).join(' · ')}`, '');
L.push('## 2. 자동 판정 인증: 질문 → 판정 규칙 → 공식 근거', '');
for (const [id, pack] of Object.entries(D.packs)) {
  const s = D.schemeMap[id];
  L.push(`### ${s.name_ko} (${pack.rule_pack_id} v${pack.rule_version})`, '', '| 질문 | 쓰는 요건 | 근거 문구 | 출처 |', '|---|---|---|---|');
  const used = questionsUsedBy(pack, D.questionMap);
  const leaves = [];
  const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.type === 'LEAF') leaves.push(n); Object.values(n).forEach((v) => { if (v && typeof v === 'object') walk(v); }); };
  pack.pathways.forEach((pw) => walk(pw.root));
  for (const q of used) {
    const qd = D.questionMap[q];
    const imp = (l) => { const x = IMPLICIT_INPUTS[l.check]; return (typeof x === 'function' ? x(l.args) : x || []).includes(q); };
    const hits = leaves.filter((l) => JSON.stringify(l.args || {}).includes(`"${q}"`) || imp(l));
    const uniq = [...new Map(hits.map((l) => [l.id, l])).values()];
    const req = uniq.map((l) => `${esc(l.label)}${imp(l) && !JSON.stringify(l.args || {}).includes(`"${q}"`) ? ' (판정 함수가 직접 읽음)' : ''}`).join('<br>') || '-';
    const quote = uniq.map((l) => esc(l.quote || '-')).join('<br>') || '-';
    const src = [...new Set([...(qd.source_refs || []), ...uniq.flatMap((l) => l.source_refs || [])])].join(', ');
    L.push(`| ${esc(qd.label_plain_ko)} | ${req} | ${quote} | ${src} |`);
  }
  L.push('');
}
writeFileSync(join(ROOT, 'docs/QUESTION_AUDIT.md'), `${L.join('\n')}\n`);
console.log('docs/QUESTION_AUDIT.md');
