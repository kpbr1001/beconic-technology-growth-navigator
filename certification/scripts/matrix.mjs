// RULE_SOURCE_MATRIX.md 생성 — 규칙 데이터에서 자동으로 만든다(손으로 고치지 말 것).
// 사용: node scripts/matrix.mjs   → 대표 검토 후 '검토자·검토일' 칸만 sources.json/규칙팩 reviewer에 기록
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDataSync, ROOT } from '../tests/helpers.mjs';

const D = loadDataSync();
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines = ['# 규칙–공식 근거 대조표 (RULE_SOURCE_MATRIX)', '',
  `> 자동 생성: \`node scripts/matrix.mjs\` · 데이터 ${D.catalog.version} · 출처 ${D.sources.version}`, '',
  '검토 방법: 각 행의 **근거 문구**가 **출처 원문**에 있는지, 판정 함수·기준이 원문과 같은지 확인합니다. 숫자 기준 문구는 `tests/data.test.mjs` DATA-05가 출처 발췌와 자동 대조합니다(숫자 변조 시 실패).', '',
  '검토 상태: 공식 원문 대조 = 개발 시점 완료 · 법률 전문가 검토 = 제외(요청에 따라) · **운영사 대표 검토 = 대기** (규칙팩 `reviewer` 칸에 기록)', ''];
for (const pack of Object.values(D.packs)) {
  const s = D.schemeMap[pack.scheme_id];
  lines.push(`## ${s.name_ko} — ${pack.rule_pack_id} v${pack.rule_version}`, '',
    `- 상태 ${pack.review_status} · 적용 ${pack.valid_from}~${pack.valid_to || ''} · 근거 재확인 기한 ${pack.review_due_at} · 경로 결합 ${pack.combine}`,
    `- 근거: ${pack.verification_basis}`, `- 대표 검토: ${pack.reviewer || '□ 미기재'}`, '',
    '| 경로 | 요건 ID | 요건 | 판정 함수·기준 | 근거 문구 | 출처 | 접속 |', '|---|---|---|---|---|---|---|');
  for (const pw of pack.pathways) {
    const walk = (n) => {
      if (n.type === 'LEAF') {
        const srcs = (n.source_refs || []).map((r) => D.sourceMap[r]);
        const crit = n.check === 'assessment' ? '기관 평가(판정 안 함)' : n.check === 'unverified' ? '미검증 → 항상 확인 필요' : `${n.check} ${JSON.stringify(n.args || {})}`;
        lines.push(`| ${esc(pw.name)} | ${n.id} | ${esc(n.label)} | ${esc(crit)} | ${esc(n.quote || '-')} | ${srcs.map((x) => `[${esc(x.title)}](${x.official_url})`).join('<br>')} | ${srcs.map((x) => x.access_status).join(', ')} |`);
      }
      (n.children || []).forEach(walk); if (n.cond) walk(n.cond); if (n.then) walk(n.then);
    };
    walk(pw.root);
  }
  lines.push('');
}
lines.push('## 공식 출처 목록', '', '| ID | 제목 | 기관 | 문서·조항 | 시행 | 확인일 | 접속 | 알려진 문제 |', '|---|---|---|---|---|---|---|---|');
for (const s of D.sources.sources) lines.push(`| ${s.source_id} | [${esc(s.title)}](${s.official_url}) | ${esc(s.regulator)} | ${esc(s.document_identifier || '-')} | ${s.effective_from || '미기재'} | ${s.checked_at} | ${s.access_status} | ${esc((s.known_issues || []).join(' / ') || '-')} |`);
writeFileSync(join(ROOT, 'RULE_SOURCE_MATRIX.md'), `${lines.join('\n')}\n`);
console.log('RULE_SOURCE_MATRIX.md 생성');
