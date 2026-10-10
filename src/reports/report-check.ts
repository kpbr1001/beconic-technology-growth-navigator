// 보고서 정합성 자동 검사: 완성된 PDF 보고서(DOM)의 쪽끼리 같은 사실을 같게 말하는지 대조한다.
// 화면에 그려진 결과를 그대로 읽으므로, 계산은 맞는데 표시가 어긋나는 경우(예: 요약 최우선 과제 ≠ 90일 계획 P0)도 잡는다.
// 표식: data-ck(단일 값), data-ckrow(표의 행), section[data-sec](쪽).

import { ITEM_PASS, ITEM_WARN } from './readiness';

export interface CheckResult {
  id: string;
  label: string;
  /** null = 이 보고서에는 해당 없음(예: 판단 보류로 표가 없음) */
  ok: boolean | null;
  detail: string;
}

const txt = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const rows = (root: ParentNode, kind: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-ckrow="${kind}"]`));
const one = (root: ParentNode, key: string) => root.querySelector<HTMLElement>(`[data-ck="${key}"]`);
const PRI = (p: string) => ({ P0: 0, P1: 1, P2: 2 })[p as 'P0'] ?? 9;

export function checkReport(root: ParentNode): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (id: string, label: string, ok: boolean | null, detail = '') => out.push({ id, label, ok, detail });

  // 1. 요약 최우선 과제 = 90일 계획 첫 행
  const sum = one(root, 'summary');
  const acts = rows(root, 'act');
  if (!sum || !acts.length) add('p0-plan', '요약 최우선 과제 = 90일 계획 첫 과제', null, '90일 계획 없음');
  else {
    const ok = sum.dataset.p0area === acts[0].dataset.area && sum.dataset.p0act === acts[0].dataset.act;
    add('p0-plan', '요약 최우선 과제 = 90일 계획 첫 과제', ok, ok ? '' : `요약 '${sum.dataset.p0area}·${sum.dataset.p0act}' ≠ 계획 '${acts[0].dataset.area}·${acts[0].dataset.act}'`);
  }
  // 2. 90일 계획은 P0→P1→P2 순
  if (acts.length) {
    const ps = acts.map((r) => r.dataset.pri ?? '');
    const ok = ps.every((p, i) => i === 0 || PRI(ps[i - 1]) <= PRI(p));
    add('plan-order', '90일 계획 우선순위 순서(P0→P2)', ok, ok ? '' : ps.join('→'));
  }
  // 3. 격차표 = 90일 계획(영역·우선순위·순서)
  const gaps = rows(root, 'gap');
  if (gaps.length && acts.length) {
    const a = gaps.map((r) => `${r.dataset.pri} ${r.dataset.area}`).join(' / ');
    const b = acts.map((r) => `${r.dataset.pri} ${r.dataset.area}`).join(' / ');
    add('gap-plan', '격차 분석표 = 90일 계획(영역·순서)', a === b, a === b ? '' : `${a}  ≠  ${b}`);
  }
  // 4. 1분기 로드맵 첫 항목이 최우선 과제
  const q1 = one(root, 'q1');
  if (sum && q1) {
    const ok = txt(q1.querySelector('li')).includes(sum.dataset.p0act ?? '\u0000');
    add('p0-q1', '1분기 로드맵이 최우선 과제로 시작', ok, ok ? '' : `Q1 '${txt(q1.querySelector('li'))}'`);
  }
  // 5. 요약 '먼저 검토할 핵심기술' = 핵심기술 표 1위
  const rank = rows(root, 'rank');
  if (!rank.length) add('top-tech', "요약 '먼저 검토할 기술' = 핵심기술 1위", null, '핵심기술 없음');
  else {
    const ok = (sum?.dataset.toptech ?? '') === rank[0].dataset.tech;
    add('top-tech', "요약 '먼저 검토할 기술' = 핵심기술 1위", ok, ok ? '' : `요약 '${sum?.dataset.toptech}' ≠ 표 '${rank[0].dataset.tech}'`);
  }
  // 6. 로드맵 대조표 기술 순서 = 핵심기술 순위
  const rm = rows(root, 'rm');
  if (rank.length && rm.length) {
    const a = rm.map((r) => r.dataset.tech).join(' / ');
    const b = rank.slice(0, rm.length).map((r) => r.dataset.tech).join(' / ');
    add('rank-rm', '로드맵 대조표 기술 순서 = 핵심기술 순위', a === b, a === b ? '' : `${a}  ≠  ${b}`);
  }
  // 7·8. R&D 과제 기술은 핵심기술 안, 핵심기술 표의 '연결 과제'와 R&D 쪽이 일치
  const rnd = rows(root, 'rnd');
  if (!rnd.length) add('rnd-tech', 'R&D 과제 기술 = 핵심기술 목록 안', null, 'R&D 과제 없음');
  else {
    const names = new Set(rank.map((r) => r.dataset.tech));
    const bad = rnd.filter((r) => names.size && !names.has(r.dataset.tech)).map((r) => `${r.dataset.id} ${r.dataset.tech}`);
    add('rnd-tech', 'R&D 과제 기술 = 핵심기술 목록 안', !bad.length, bad.join(', '));
    const fromRank = rank.flatMap((r) => (r.dataset.rnd ? r.dataset.rnd.split(',').map((id) => `${id}:${r.dataset.tech}`) : [])).sort().join(' ');
    const fromRnd = rnd.filter((r) => names.has(r.dataset.tech)).map((r) => `${r.dataset.id}:${r.dataset.tech}`).sort().join(' ');
    add('rank-rnd', "핵심기술 표 '연결 과제' = R&D 과제 쪽", fromRank === fromRnd, fromRank === fromRnd ? '' : `${fromRank}  ≠  ${fromRnd}`);
  }
  // 9. 보완 대조의 자사 기술은 핵심기술 안
  const gapt = rows(root, 'gapt').filter((r) => r.dataset.company);
  if (gapt.length) {
    const names = new Set(rank.map((r) => r.dataset.tech));
    const bad = gapt.filter((r) => !names.has(r.dataset.company)).map((r) => r.dataset.company);
    add('gap-tech', '보완 대조의 자사 기술 = 핵심기술 목록 안', !bad.length, bad.join(', '));
  }
  // 10. 리스크 건수: 히트맵 = 표, '높음' 수 = 성과지표 기준선
  const rc = one(root, 'riskcounts');
  const risk = rows(root, 'risk');
  if (rc) {
    const high = risk.filter((r) => r.dataset.grade === '높음').length;
    const ok = Number(rc.dataset.total) === risk.length && Number(rc.dataset.high) === high;
    add('risk-count', '리스크 히트맵 건수 = 리스크 표', ok, ok ? '' : `히트맵 ${rc.dataset.total}(높음 ${rc.dataset.high}) ≠ 표 ${risk.length}(높음 ${high})`);
    const kpiRow = Array.from(one(root, 'kpi')?.querySelectorAll('tr') ?? []).find((tr) => /고위험 의존요소/.test(txt(tr)));
    if (kpiRow) {
      const m = /높음 등급 리스크 (\d+)건/.exec(txt(kpiRow));
      const ok2 = m ? Number(m[1]) === high : high === 0;
      add('risk-kpi', "성과지표 기준선 '높음' 리스크 수 = 레드팀", ok2, ok2 ? '' : `기준선 ${m?.[1] ?? 0} ≠ 레드팀 ${high}`);
    }
  }
  // 11. 추천 전략안 = 의사결정 요청
  const rec = one(root, 'rec');
  if (rec) {
    const asks = txt(root.querySelector('.pr-asks'));
    const ok = asks.includes(rec.dataset.v ?? '\u0000');
    add('rec-ask', '전략 추천안 = 경영진 의사결정 요청', ok, ok ? '' : `추천안 '${rec.dataset.v}'이 의사결정 요청에 없음`);
  }
  // 12. 점수표 = 레이더
  const areas = rows(root, 'area');
  const radar = Array.from(root.querySelectorAll<SVGTextElement>('[data-ckradar]'));
  if (areas.length && radar.length) {
    const a = areas.map((r) => `${r.dataset.area}:${r.dataset.score || '보류'}`).join(' ');
    const b = radar.map((t) => `${t.getAttribute('data-ckradar')}:${t.textContent?.trim()}`).join(' ');
    add('score-radar', '점수표 = 레이더 차트 점수', a === b, a === b ? '' : `${a}  ≠  ${b}`);
  }
  // 13. 쪽 번호: 연속·총 쪽수 일치·쪽 참조가 해당 쪽을 가리킴
  const pages = Array.from(root.querySelectorAll<HTMLElement>('section.pr-page'));
  const foot = pages.map((p) => /(\d+) \/ (\d+)/.exec(txt(p.querySelector('.pr-footer'))));
  if (pages.length) {
    const bad = foot.map((m, i) => (i === 0 ? null : !m || Number(m[1]) !== i + 1 || Number(m[2]) !== pages.length ? i + 1 : null)).filter((x) => x !== null);
    add('page-no', '쪽 번호 연속·전체 쪽수 일치', !bad.length, bad.length ? `${bad.join(', ')}쪽 표기 오류` : '');
    const refs = Array.from(root.querySelectorAll<HTMLElement>('[data-ck="ref"]'));
    const SEC: Record<string, string> = { risk: 'Risk Red Team', kpi: 'KPI & Governance' };
    const badRef = refs.filter((r) => {
      const m = /(\d+)쪽/.exec(txt(r));
      const idx = pages.findIndex((p) => p.dataset.sec === SEC[r.dataset.to ?? '']);
      return !m || Number(m[1]) !== idx + 1;
    }).map((r) => txt(r));
    add('page-ref', '본문의 쪽 참조가 해당 쪽을 가리킴', !badRef.length, badRef.join(' / '));
  }
  // 15. 신청 준비도 종합 판정 = 관점·자격 판정 규칙(미흡·결격 → 선행 조건 / 모두 충족 → 준비됨 / 그 외 보완 후)
  const ready = one(root, 'ready');
  if (ready) {
    const ax = rows(root, 'axis').map((r) => r.dataset.status);
    const el = rows(root, 'elig').map((r) => r.dataset.status);
    const expected = ax.every((x) => x === '확인 필요') || ax.includes('미흡') || el.includes('결격 가능성') ? '선행 조건 필요' : ax.every((x) => x === '충족') ? '신청 준비됨' : '보완 후 신청';
    const ok = ready.dataset.overall === expected;
    add('ready-rule', '신청 준비도 종합 판정 = 관점·자격 판정', ok, ok ? '' : `표시 '${ready.dataset.overall}' ≠ 규칙 '${expected}'`);
    const ids = new Set(risk.map((r) => r.dataset.id));
    const bad = rows(root, 'voucher').map((r) => r.dataset.risk).filter((id) => id && !ids.has(id));
    add('voucher-risk', '바우처 근거 리스크 = 레드팀 표', !bad.length, bad.join(', '));
  }
  // 17·18. 신청 준비도 세부 항목: 레이더 점수 = 표 점수, 관점 판정·점수 = 항목 판정 규칙
  const items = rows(root, 'item');
  if (items.length) {
    const radarItems = Array.from(root.querySelectorAll<SVGTextElement>('[data-ckitem]'));
    const fromTable = items.map((r) => `${r.dataset.label}:${r.dataset.score || '확인 필요'}`).join(' ');
    const fromRadar = radarItems.map((t) => `${t.getAttribute('data-ckitem')}:${t.textContent?.trim()}`).join(' ');
    add('item-radar', '세부 항목 레이더 점수 = 표 점수', fromTable === fromRadar, fromTable === fromRadar ? '' : `${fromRadar}  ≠  ${fromTable}`);
    const bad: string[] = [];
    for (const axis of rows(root, 'axis').filter((a) => items.some((r) => r.dataset.axis === a.dataset.label))) {
      const its = items.filter((r) => r.dataset.axis === axis.dataset.label);
      const sc = its.map((r) => (r.dataset.score ? Number(r.dataset.score) : null)).filter((x): x is number => x !== null);
      const avg = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
      const st = (r: HTMLElement) => r.dataset.status;
      const gate = its.some((r) => r.dataset.gate && (st(r) === '미흡' || (r.dataset.gatenull && st(r) === '확인 필요')));
      const expected = gate ? '미흡' : sc.length < 3 ? '확인 필요' : avg !== null && avg < ITEM_WARN ? '미흡' : avg !== null && avg >= ITEM_PASS && !its.some((r) => st(r) === '보완' || st(r) === '미흡') ? '충족' : '보완';
      if (axis.dataset.status !== expected || String(avg ?? '') !== (axis.dataset.score ?? '')) bad.push(`${axis.dataset.label} 표시 ${axis.dataset.status}·${axis.dataset.score} ≠ 규칙 ${expected}·${avg}`);
    }
    add('item-axis', '관점 판정·점수 = 세부 항목 판정 규칙', !bad.length, bad.join(' / '));
  }
  // 21. 핵심요약 = 본문(최우선 과제·핵심기술 1위·신청 준비도·'높음' 리스크 수)
  const key = one(root, 'key');
  if (key) {
    const bad: string[] = [];
    const k = key.dataset;
    if (sum && k.p0area && (k.p0area !== sum.dataset.p0area || k.p0act !== sum.dataset.p0act)) bad.push(`최우선 과제 '${k.p0area}·${k.p0act}' ≠ 경영진 요약 '${sum.dataset.p0area}·${sum.dataset.p0act}'`);
    if (acts.length && k.p0area && k.p0act !== acts[0].dataset.act) bad.push(`최우선 과제 '${k.p0act}' ≠ 90일 계획 '${acts[0].dataset.act}'`);
    if ((k.toptech ?? '') !== (rank[0]?.dataset.tech ?? '')) bad.push(`핵심기술 '${k.toptech}' ≠ 표 1위 '${rank[0]?.dataset.tech ?? ''}'`);
    if (ready && k.ready !== ready.dataset.overall) bad.push(`신청 준비도 '${k.ready}' ≠ 본문 '${ready.dataset.overall}'`);
    if (rc && Number(k.high) !== risk.filter((r) => r.dataset.grade === '높음').length) bad.push(`'높음' 리스크 ${k.high} ≠ 표 ${risk.filter((r) => r.dataset.grade === '높음').length}`);
    const tile = (key2: string) => txt(key.querySelector(`[data-key="${key2}"] b`));
    if (k.cap && !tile('position').includes(`${k.cap}점`)) bad.push(`위치 카드 '${tile('position')}'에 역량 ${k.cap}점 없음`);
    add('key-summary', '핵심요약 = 본문(최우선 과제·핵심기술·준비도·리스크)', !bad.length, bad.join(' / '));
  }
  // 14. 깨진 값·미치환 표식
  const all = txt(root as Element);
  const broken = all.match(/\{\{[^}]*\}\}|undefined|NaN|\[object Object\]/g);
  add('broken', '깨진 값·미치환 표식 없음', !broken, broken ? [...new Set(broken)].join(', ') : '');
  return out;
}

export const checkSummary = (rs: CheckResult[]) => {
  const applied = rs.filter((r) => r.ok !== null);
  return { passed: applied.filter((r) => r.ok).length, total: applied.length, failed: applied.filter((r) => !r.ok) };
};
