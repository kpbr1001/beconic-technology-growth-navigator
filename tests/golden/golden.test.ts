// 표준 사례 기대 결과표: 12개 사례의 핵심 결과를 사람이 읽는 표(golden-cases.md)로 고정한다.
// 규칙·데이터를 바꿔 결과가 달라지면 이 테스트가 실패하고 차이를 보여 준다. 의도한 변경이면 `npm run golden:update` 후 표를 검수한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reportCore } from '../../src/reports/core';
import { setRoadmapIndex, type AppIndex } from '../../src/roadmap/candidates';
import { CHECK_KEYS } from '../../src/diagnosis/techrank';
import { GOLDEN } from '../fixtures/golden';
import raw from '../../src/roadmap/kb-app-index.json';

const n = (v: number | null) => (v === null ? '보류' : String(Math.round(v)));
const CK = { diff: '차', roadmap: '로', own: '자', trl: 'T', confirmed: '확' } as const;

function render(): string {
  const rows = GOLDEN.map(({ id, label, input }) => ({ id, label, c: reportCore(input) }));
  const out: string[] = [
    '# 표준 사례 기대 결과표',
    '',
    '> 자동 생성 파일(tests/golden/golden.test.ts). 규칙·데이터 변경으로 결과가 바뀌면 테스트가 실패합니다. 의도한 변경이면 `npm run golden:update` 후 아래 표를 다시 검수하세요.',
    '> 검수 포인트: ① 최우선 과제(P0)가 이 기업에 맞는가 ② 추천 전략안이 납득되는가 ③ 핵심기술 1위가 맞는가 ④ R&D 과제의 기술·유형이 맞는가 ⑤ 보완 필요 후보가 그럴듯한가.',
    '',
    '| 사례 | 기술역량 | 신뢰도·단계 | 최우선 과제 | 추천안 | 핵심기술 1위 | R&D 과제(유형·기술) | 보완 후보 | 높음 리스크 | 신청 준비도 |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { id, label, c } of rows) {
    const p0 = c.priorities[0];
    const top = c.ranked[0];
    const gapN = c.cards.flatMap((x) => x.rows).filter((r) => r.status === 'gap').length;
    out.push(`| ${label} (${id}) | ${n(c.r.capability)} | ${n(c.r.confidence)} · ${c.r.level} | ${p0 ? `${p0.priority} ${p0.area} ${n(p0.score)}` : '-'} | ${c.recommended.name} | ${top ? `${top.tech.name} (${top.met}/5)` : '-'} | ${c.rnd.map((p) => `${p.id} ${p.trackLabel}: ${p.techName} [${p.readiness}]`).join('<br>') || '-'} | ${gapN} | ${c.redteam.risks.filter((x) => x.grade === '높음').map((x) => x.id).join('·') || '-'} | ${c.ready.overall}<br>${c.ready.axes.map((a) => `${a.label} ${a.status}`).join(' · ')} |`);
  }
  for (const { id, label, c } of rows) {
    out.push('', `## ${label} (${id})`, '');
    out.push(`- 영역 점수: ${Object.entries(c.r.m).map(([k, v]) => `${k} ${n(v)}`).join(' · ')}`);
    out.push(`- 우선순위: ${c.priorities.map((g) => `${g.priority} ${g.area}(${n(g.score)})`).join(' → ')}`);
    out.push(`- 전략 기준 점수: ${c.options.map((o) => `${o.name.charAt(0)} ${o.score ?? '산정 불가'}${o.recommended ? '★' : ''}`).join(' · ')}`);
    out.push(`- 핵심기술 순위: ${c.ranked.map((x) => `${x.rank}. ${x.tech.name} [${CHECK_KEYS.map((k) => (x.checks[k] === true ? CK[k] : x.checks[k] === null ? '?' : '·')).join('')}]`).join(' / ') || '없음'}`);
    out.push(`- 로드맵 후보: ${c.matches.slice(0, 3).map((m) => `${m.name}${m.code ? ` (${m.code})` : ''}${m.weak ? ' 약함' : ''}`).join(' / ') || '없음'}`);
    for (const card of c.cards) out.push(`- 보완 대조 · ${card.item.name}: ${card.rows.map((r) => `${({ held: '보유', partial: '일부', mentioned: '언급', gap: '보완' } as const)[r.status]}(${r.roadmapTech}${r.company ? `←${r.company.name}` : r.route ? `·${r.route}` : ''})`).join(' / ')}${card.dataGaps.length ? ` · 데이터: ${card.dataGaps.map((d) => d.term).join('·')}` : ''}`);
    for (const a of c.ready.axes.filter((x) => x.items)) out.push(`- ${a.label} ${a.score ?? '—'}점(${a.status}): ${a.items!.map((x) => `${x.label} ${x.score ?? '확인 필요'}`).join(' · ')}`);
    out.push(`- 신청 준비도: ${c.ready.overall} — ${c.ready.reason} · 바우처 후보: ${c.ready.vouchers.map((v) => v.type).join('·') || '없음'}`);
    out.push(`- 경고: ${c.r.alerts.length ? c.r.alerts.map((a) => a.slice(0, 60)).join(' / ') : '없음'}`);
  }
  return `${out.join('\n')}\n`;
}

describe('표준 사례 12개', () => {
  beforeAll(() => setRoadmapIndex(raw as unknown as AppIndex));
  afterAll(() => setRoadmapIndex(null));
  it('사례마다 결과가 나오고(판단 보류 없음) 기대 결과표와 같음', async () => {
    for (const g of GOLDEN) {
      const c = reportCore(g.input);
      expect(c.r.insufficient, g.id).toBe(false);
      expect(c.ranked.length, g.id).toBe(3);
      expect(c.rnd.length, g.id).toBeGreaterThan(0);
    }
    await expect(render()).toMatchFileSnapshot('./golden-cases.md');
  });
  it('성장 사례는 초기 사례보다 기술역량·신뢰도가 높음(같은 업종)', () => {
    for (const key of ['aisw', 'mfg', 'svc', 'hw', 'deep', 'fusion']) {
      const e = reportCore(GOLDEN.find((g) => g.id === `${key}-early`)!.input).r;
      const g = reportCore(GOLDEN.find((x) => x.id === `${key}-growth`)!.input).r;
      expect(g.capability!, key).toBeGreaterThan(e.capability!);
      expect(g.confidence, key).toBeGreaterThan(e.confidence);
    }
  });
});
