// 보고서 뷰모델 — 화면(결과·서류·로드맵)과 인쇄용 PDF가 이 객체 하나만 쓴다(결과 불일치 방지).
import { S, ENGINE_VERSION, evaluateScheme, missingInputs, schemeLabel } from './engine.js';
import { computeReadiness, readinessSentence, EVIDENCE } from './readiness.js';
import { recommend, TIER_LABEL } from './recommend.js';
import { triage } from './triage.js';

export const APP_VERSION = '1.0.0';

export const CATEGORY = {
  1: '신청 장애 요인 제거·확인',
  2: '필수 증빙 준비',
  3: '평가·신청 준비',
  4: '선택적 경쟁력 강화',
  5: '지속관리',
};
export const TIMEFRAME = { now: '즉시', d30: '30일 안', d60: '60일 안', d90: '90일 안', ongoing: '지속관리' };

function hash(str) { // FNV-1a 32bit — 문서 ID용(개인정보를 담지 않는 짧은 식별자)
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

export function questionLabel(data, q) {
  const it = data.questionMap[q];
  return it ? it.label_plain_ko : q;
}

function ongoingFor(id) {
  switch (id) {
    case 'INNO': return '확인서 유효기간 3년 — 만료 90일 전부터 연장 신청(운영규정 제15조).';
    case 'MAIN': return '확인서 유효기간 3년 — 연장 기간에 재신청·평가.';
    case 'RNDI': case 'RNDD': return '매년 4월 30일까지 연구개발 실적 제출, 인력·공간 변경 시 변경신고(시행규칙 제5조·제8조).';
    case 'VEN': return '확인 유효기간과 사후관리 기준을 벤처확인시스템에서 확인하세요(이 앱에는 미반영).';
    default: return null;
  }
}

export function buildReport(data, state) {
  const answers = state.answers || {};
  const asOf = state.asOf;
  const selected = state.selected || [];
  const ctx = { schemes: selected };
  const recs = recommend(data.catalog.schemes, answers);
  const recMap = Object.fromEntries(recs.map((r) => [r.scheme.scheme_id, r]));

  const schemes = selected.map((id) => {
    const scheme = data.schemeMap[id];
    if (!scheme) return null;
    const pack = data.packs[id] || null;
    const result = scheme.diagnosable ? evaluateScheme(pack, answers, { asOf, sources: data.sourceMap }) : null;
    const label = result ? schemeLabel(result.basic) : schemeLabel('OUT_OF_SCOPE');
    const readiness = scheme.readiness_items && scheme.readiness_items.length
      ? computeReadiness(scheme.readiness_items, answers, state.docStatus || {}, ctx) : null;
    const selfItems = scheme.self_check ? data.catalog.self_checks[scheme.self_check].items : null;
    const selfcheck = selfItems ? computeReadiness(selfItems.map((i) => ({ ...i, item_id: `${id}:${i.item_id}`, applies_when: 'always' })), answers, state.docStatus || {}, ctx) : null;
    const tri = scheme.triage ? triage(scheme, answers) : null;
    const miss = result && result.gate.active ? missingInputs(result).map((q) => ({ q, label: questionLabel(data, q) })) : [];
    return { scheme, rec: recMap[id], result, label, readiness, selfcheck, selfcheckMeta: scheme.self_check ? data.catalog.self_checks[scheme.self_check] : null, triage: tri, missing: miss, ongoing: ongoingFor(id) };
  }).filter(Boolean);

  // ── 요건 집계(중복 원자요건 1회) ──
  let pass = 0; let fail = 0; let unknown = 0; let unverified = 0;
  schemes.forEach((s) => {
    if (!s.result || !s.result.gate.active) return;
    const seen = new Map();
    s.result.pathways.forEach((p) => {
      if (p.basic === S.NA) return;
      p.leaves.forEach((l) => {
        if (l.kind === 'assessment' || l.inactive || l.is_condition || l.status === S.NA) return;
        const prev = seen.get(l.id);
        if (!prev) seen.set(l.id, l);
      });
    });
    seen.forEach((l) => {
      if (l.status === S.PASS) pass += 1;
      else if (l.status === S.FAIL) fail += 1;
      else { unknown += 1; if (l.unverified) unverified += 1; }
    });
  });
  const byKey = { pass: 0, fail: 0, unknown: 0, na: 0, out: 0 };
  schemes.forEach((s) => { byKey[s.label.key] += 1; });

  const actions = buildActions(data, schemes);
  const unknownInputs = [];
  const seenQ = new Set();
  schemes.forEach((s) => s.missing.forEach((m) => { if (!seenQ.has(m.q)) { seenQ.add(m.q); unknownInputs.push(m); } }));

  const docsAll = schemes.flatMap((s) => (s.readiness ? s.readiness.rows.filter((r) => r.applicable).map((r) => ({ ...r, scheme_id: s.scheme.scheme_id, scheme_name: s.scheme.name_ko })) : []));
  const docCounts = {
    total: docsAll.length,
    done: docsAll.filter((r) => r.status === EVIDENCE.SELF_DECLARED_AVAILABLE).length,
    missing: docsAll.filter((r) => r.status === EVIDENCE.NOT_AVAILABLE).length,
    unknown: docsAll.filter((r) => r.status === EVIDENCE.UNKNOWN).length,
  };

  const diagnosed = schemes.filter((s) => s.result && s.result.gate.active).length;
  let headline;
  if (!schemes.length) headline = '선택한 인증이 없어요.';
  else if (!diagnosed) headline = `선택한 ${schemes.length}개 제도는 정보 안내 대상이에요. 자동 판정 없이 확인할 사항을 정리했어요.`;
  else headline = `현재 확인된 기본요건은 ${pass}개, 확인할 요건은 ${unknown}개입니다.${fail ? ` 미충족 요건이 ${fail}개 있어요.` : ''}`;

  const findings = [];
  schemes.forEach((s) => {
    if (s.result && s.result.gate.active) {
      const best = s.result.pathways.filter((p) => p.basic === S.PASS).map((p) => p.name);
      if (s.result.basic === S.PASS) findings.push({ key: 'pass', text: `${s.scheme.name_ko}: ${best.join('·')} 기준 기본요건이 입력 정보로 확인돼요. 남은 단계는 기관 평가·심사예요.` });
      else if (s.result.basic === S.FAIL) findings.push({ key: 'fail', text: `${s.scheme.name_ko}: 입력한 정보로는 신청 기본요건을 갖추지 못했어요.` });
      else if (s.result.basic === S.UNKNOWN) findings.push({ key: 'unknown', text: `${s.scheme.name_ko}: ${s.missing.length ? `${s.missing.length}개 정보` : '일부 요건'}를 확인하면 판단할 수 있어요.` });
      else if (s.result.basic === S.NA) findings.push({ key: 'na', text: `${s.scheme.name_ko}: 공식 기준상 현재 신청 대상이 아니에요.` });
    } else if (s.triage) findings.push({ key: 'out', text: `${s.scheme.name_ko}: 적용 규정 확인이 먼저 필요해요(의무 여부 미판정).` });
    else findings.push({ key: 'out', text: `${s.scheme.name_ko}: 정보 안내 제도예요(자동 판정 없음).` });
  });

  const docId = `BC-${asOf.replace(/-/g, '')}-${hash(JSON.stringify({ a: answers, s: selected, d: state.docStatus || {} }))}`;
  return {
    meta: {
      doc_id: docId, as_of: asOf, generated_at: state.now || asOf,
      app_version: APP_VERSION, engine_version: ENGINE_VERSION,
      data_versions: { catalog: data.catalog.version, sources: data.sources.version, questions: data.questions.version },
      company_name: (answers.company_name || '').trim() || null,
      flow: state.flow || 'A',
    },
    schemes, recs, actions, roadmap: groupRoadmap(actions),
    summary: { headline, pass, fail, unknown, unverified, byKey, diagnosed, docCounts, findings: findings.slice(0, 3), allFindings: findings, firstAction: actions[0] || null },
    unknownInputs,
    tierLabel: TIER_LABEL,
    _answers: answers, // 인쇄 보고서의 '응답' 열 표시용(브라우저 메모리 안에서만 사용)
  };
}

export function buildActions(data, schemes) {
  const out = [];
  const seenQ = new Set();
  const push = (a) => out.push({ id: `A${out.length + 1}`, ...a });
  const tierRank = (s) => ({ high: 0, consider: 1, insufficient: 2, low: 3 }[(s.rec && s.rec.tier) || 'low']);
  schemes.forEach((s) => {
    const sid = s.scheme.scheme_id; const sname = s.scheme.name_ko;
    const r = s.result;
    if (r && r.gate.active) {
      const schemePass = r.basic === S.PASS;
      r.pathways.forEach((p) => {
        if (p.basic === S.NA) return;
        p.leaves.forEach((l) => {
          if (l.inactive || l.status === S.NA) return;
          if (l.status === S.FAIL && l.kind !== 'assessment' && !l.is_condition && !schemePass) {
            push({ category: 1, timeframe: 'now', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `${l.label} — 미충족`, detail: l.action_fail || '요건 충족 방법을 확인하세요.', basis: l.detail || '', owner: '대표·경영지원', deliverable: '보완 계획', done_when: '요건 충족 근거 확보 후 진단 입력 수정' });
          }
          if (l.status === S.UNKNOWN && l.unverified) {
            push({ category: 1, timeframe: 'now', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `공식 원문 확인: ${l.label}`, detail: l.detail, basis: '', owner: '대표·경영지원', deliverable: '공식 확인 결과', done_when: '운영기관 답변 또는 원문 확보' });
          }
          if (l.status === S.UNKNOWN && l.missing && l.missing.length && !(schemePass && p.basic !== S.PASS)) {
            l.missing.forEach((q) => {
              if (seenQ.has(q)) return; seenQ.add(q);
              const qd = data.questionMap[q];
              push({ category: 1, timeframe: 'now', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `확인: ${qd ? qd.label_plain_ko : q}`, detail: qd ? qd.why_this_matters : '', basis: qd && qd.evidence_examples && qd.evidence_examples.length ? `확인 자료: ${qd.evidence_examples.join(', ')}` : '', owner: '경영지원', deliverable: '확인된 값', done_when: '진단에 값 입력 후 재계산', q });
            });
          }
        });
      });
      if (r.basic === S.PASS || r.basic === S.UNKNOWN) {
        const assess = [];
        r.pathways.forEach((p) => { if (p.basic === S.PASS || p.basic === S.UNKNOWN) p.leaves.forEach((l) => { if (l.kind === 'assessment' && !l.inactive && !assess.includes(l.label)) assess.push(l.label); }); });
        assess.forEach((lb) => push({ category: 3, timeframe: 'd60', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `평가 준비: ${lb}`, detail: '공식 평가지표·제출서류를 내려받아 근거 자료를 맞춰 두세요. 이 앱은 평가 점수를 예측하지 않아요.', basis: '', owner: '대표·연구책임자', deliverable: '평가 대응 자료', done_when: '평가지표별 근거 자료 정리' }));
        push({ category: 3, timeframe: 'd90', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `${sname} 신청·평가 일정 확정`, detail: '공식 시스템에서 신청서를 작성하고 평가 일정을 잡아요.', basis: s.scheme.official_link, owner: '대표', deliverable: '신청 접수', done_when: '접수 완료 확인' });
      }
    }
    if (s.readiness) {
      s.readiness.rows.filter((x) => x.applicable).forEach((d) => {
        if (d.status === EVIDENCE.NOT_AVAILABLE) push({ category: d.required ? 2 : 4, timeframe: d.required ? 'd30' : 'd90', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `서류 준비: ${d.label}`, detail: d.why, basis: d.where ? `발급·확인처: ${d.where}` : '', owner: '경영지원', deliverable: d.label, done_when: '서류 확보' });
        else if (d.status === EVIDENCE.UNKNOWN && d.required) push({ category: 2, timeframe: 'now', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `보유 확인: ${d.label}`, detail: d.why, basis: d.where ? `발급·확인처: ${d.where}` : '', owner: '경영지원', deliverable: '보유 여부', done_when: '서류 체크 화면에서 상태 표시' });
      });
    }
    if (s.selfcheck) {
      s.selfcheck.rows.forEach((d) => {
        if (d.status === EVIDENCE.NOT_AVAILABLE) push({ category: d.required ? 3 : 4, timeframe: d.required ? 'd60' : 'd90', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `운영 준비: ${d.label}`, detail: d.why, basis: '', owner: '품질·운영 책임자', deliverable: d.label, done_when: '운영 기록 확보' });
      });
    }
    if (s.triage) {
      push({ category: 1, timeframe: 'now', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `${sname}: 적용 규정 확인`, detail: s.triage.missing.length ? `먼저 정리할 정보: ${s.triage.missing.map((m) => m.text).join(', ')}` : '판매국 규제기관 원문 또는 전문가로 적용 법규·절차를 확인하세요.', basis: s.scheme.official_link, owner: '대표·해외영업', deliverable: '적용 규정 목록', done_when: '적용 법규·절차 확정' });
    } else if (!s.result && !s.selfcheck) {
      push({ category: 4, timeframe: 'd30', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `${sname}: 공식 요건 확인`, detail: s.scheme.first_check, basis: s.scheme.official_link, owner: '경영지원', deliverable: '요건 확인 메모', done_when: '공식 기관 안내 확인' });
    }
    if (s.ongoing && s.result && s.result.gate.active && s.result.basic !== S.NA && s.result.basic !== S.FAIL) {
      push({ category: 5, timeframe: 'ongoing', scheme_id: sid, scheme_name: sname, rank: tierRank(s), title: `${sname} 사후관리`, detail: s.ongoing, basis: '', owner: '경영지원', deliverable: '관리 일정', done_when: '캘린더 등록' });
    }
  });
  return out.sort((a, b) => a.category - b.category || a.rank - b.rank).map((a, i) => ({ ...a, order: i + 1, category_label: CATEGORY[a.category], timeframe_label: TIMEFRAME[a.timeframe] }));
}

export function groupRoadmap(actions) {
  const g = { now: [], d30: [], d60: [], d90: [], ongoing: [] };
  actions.forEach((a) => g[a.timeframe].push(a));
  return g;
}

export { readinessSentence };
