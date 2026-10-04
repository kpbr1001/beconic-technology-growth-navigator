// 보고서 시각화(화면·PDF 공용): 역량×신뢰도 포지셔닝 매트릭스, 90일 실행 간트.
// 값은 Rule Engine 결과만 쓰고 새 점수를 만들지 않는다. 일정은 '권장 예시'로 표기한다.

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 기술역량 '양호' 경계(band)·진단 신뢰도 '실행계획 기준선' 경계(경영진 요약 문구와 같은 값) */
export const MATRIX_CUT = { capability: 65, confidence: 60 } as const;

export interface Quadrant {
  key: 'scale' | 'evidence' | 'focus' | 'recheck';
  label: string;
  meaning: string;
}

export const QUADRANTS: Record<Quadrant['key'], Quadrant> = {
  scale: { key: 'scale', label: '확장 실행', meaning: '역량과 근거가 함께 확보되어 제품화·확장 과제를 실행할 수 있는 위치입니다.' },
  evidence: { key: 'evidence', label: '근거 보강 우선', meaning: '역량은 높게 응답됐지만 근거가 약해 과대평가 가능성을 먼저 확인해야 하는 위치입니다.' },
  focus: { key: 'focus', label: '병목 집중 보완', meaning: '진단 근거는 실행계획 기준선으로 쓸 수 있고, 병목 영역 개선에 자원을 집중할 위치입니다.' },
  recheck: { key: 'recheck', label: '진단 재확인', meaning: '역량과 근거가 모두 불확실해 담당자 확인과 핵심 Evidence 확보가 먼저인 위치입니다.' },
};

/** 기술역량(null=판단 보류)·진단 신뢰도로 사분면을 정한다. 역량이 보류면 null */
export function quadrantOf(capability: number | null, confidence: number): Quadrant | null {
  if (capability === null) return null;
  const hiCap = Math.round(capability) >= MATRIX_CUT.capability;
  const hiConf = Math.round(confidence) >= MATRIX_CUT.confidence;
  return QUADRANTS[hiCap ? (hiConf ? 'scale' : 'evidence') : hiConf ? 'focus' : 'recheck'];
}

/** 포지셔닝 매트릭스 SVG. x=진단 신뢰도, y=기술역량 */
export function positionMatrixSVG(capability: number | null, confidence: number): string {
  const W = 300, H = 230, L = 34, T = 10, PW = 252, PH = 186;
  const x = (v: number) => L + (Math.max(0, Math.min(100, v)) / 100) * PW;
  const y = (v: number) => T + PH - (Math.max(0, Math.min(100, v)) / 100) * PH;
  const cx = x(MATRIX_CUT.confidence), cy = y(MATRIX_CUT.capability);
  const q = quadrantOf(capability, confidence);
  const zone = (k: Quadrant['key'], x0: number, y0: number, x1: number, y1: number, fill: string) =>
    `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${fill}" ${q?.key === k ? 'stroke="#2457f5" stroke-width="1.5"' : ''}/>` +
    // 위쪽 사분면은 위에, 아래쪽 사분면은 아래에 이름을 둬 현재 위치 표시와 겹치지 않게
    `<text x="${(x0 + x1) / 2}" y="${y0 === T ? y0 + 14 : y1 - 7}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${q?.key === k ? '#173fb5' : '#667085'}">${QUADRANTS[k].label}</text>`;
  // 현재 위치 라벨은 점이 있는 사분면 안에 두어 기준선·사분면 이름과 겹치지 않게 한다
  const px = x(confidence), py = capability === null ? 0 : y(capability);
  const LBL = 74; // '현재 (78, 52)' 라벨 폭(대략)
  const [qL, qR] = Math.round(confidence) < MATRIX_CUT.confidence ? [L, cx] : [cx, L + PW];
  const below = capability !== null && (capability > 88 || (py > cy && py - cy < 16));
  // 오른쪽 → 왼쪽 → 점 위·아래 가운데 순으로, 점이 있는 사분면 안에 들어가는 자리
  const [lx, anchor, dy] =
    px + 10 + LBL <= qR ? [px + 10, 'start', below ? 17 : -9]
      : px - 10 - LBL >= qL ? [px - 10, 'end', below ? 17 : -9]
        : [Math.min(Math.max(px, qL + LBL / 2 + 2), qR - LBL / 2 - 2), 'middle', below ? 20 : -12];
  const dot =
    capability === null
      ? `<text x="${L + PW / 2}" y="${T + PH / 2}" text-anchor="middle" font-size="10" fill="#b54708">기술역량 판단 보류 — 위치 미표시</text>`
      : `<circle cx="${px}" cy="${py}" r="6.5" fill="#2457f5" stroke="#fff" stroke-width="2"/>` +
        `<text class="matrix-here" x="${lx}" y="${py + dy}" text-anchor="${anchor}" font-size="9.5" font-weight="800" fill="#1d2939">현재 (${Math.round(confidence)}, ${Math.round(capability)})</text>`;
  return `<svg class="matrix-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="기술역량·진단 신뢰도 포지셔닝">` +
    zone('evidence', L, T, cx, cy, '#fff7ed') + zone('scale', cx, T, L + PW, cy, '#ecfdf3') +
    zone('recheck', L, cy, cx, T + PH, '#fef3f2') + zone('focus', cx, cy, L + PW, T + PH, '#f5f7ff') +
    `<rect x="${L}" y="${T}" width="${PW}" height="${PH}" fill="none" stroke="#d0d5dd"/>` +
    `<line x1="${cx}" y1="${T}" x2="${cx}" y2="${T + PH}" stroke="#98a2b3" stroke-dasharray="3 3"/><line x1="${L}" y1="${cy}" x2="${L + PW}" y2="${cy}" stroke="#98a2b3" stroke-dasharray="3 3"/>` +
    `<text x="${cx}" y="${T + PH + 12}" text-anchor="middle" font-size="8.5" fill="#667085">${MATRIX_CUT.confidence}</text><text x="${L - 4}" y="${cy + 3}" text-anchor="end" font-size="8.5" fill="#667085">${MATRIX_CUT.capability}</text>` +
    `<text x="${L + PW / 2}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#475467">진단 신뢰도 →</text>` +
    `<text x="10" y="${T + PH / 2}" text-anchor="middle" font-size="9" fill="#475467" transform="rotate(-90 10 ${T + PH / 2})">기술역량 →</text>` +
    dot + `</svg>`;
}

/** "2~3주"→3, "4~8주"→8, "1주"→1. 읽을 수 없으면 2주 */
export function durationWeeks(s: string): number {
  const nums = [...String(s).matchAll(/\d+/g)].map((m) => Number(m[0]));
  return nums.length ? Math.max(1, Math.min(12, Math.max(...nums))) : 2;
}

export interface GanttRow {
  label: string;
  priority: 'P0' | 'P1' | 'P2' | 'base';
  start: number;
  end: number;
}

/** 우선순위별 시작 주차: 기준 확정(1~2주) → P0 2주차 → P1 4주차 → P2 7주차. 12주 안에서 끝나게 자른다 */
export function ganttRows(tasks: { label: string; priority: string; duration: string }[]): GanttRow[] {
  const START: Record<string, number> = { P0: 2, P1: 4, P2: 7 };
  return [
    { label: '기준 확정 · 진단 재확인', priority: 'base', start: 1, end: 2 },
    ...tasks.slice(0, 5).map((t) => {
      const p = (['P0', 'P1', 'P2'].includes(t.priority) ? t.priority : 'P2') as GanttRow['priority'];
      const start = START[p];
      return { label: t.label, priority: p, start, end: Math.min(12, start + durationWeeks(t.duration) - 1) };
    }).sort((a, b) => a.start - b.start), // 같은 우선순위 안에서는 Rule Engine 순서 유지(안정 정렬)
  ];
}

/** 13주(90일) 간트 SVG. 30·60·90일 이정표 포함 */
export function ganttSVG(rows: GanttRow[]): string {
  const LW = 236, WK = 36, RH = 22, T = 22, W = LW + WK * 13 + 6, H = T + rows.length * RH + 30;
  const color: Record<GanttRow['priority'], string> = { base: '#98a2b3', P0: '#d92d20', P1: '#f79009', P2: '#12b76a' };
  const weeks = Array.from({ length: 13 }, (_, i) =>
    `<text x="${LW + i * WK + WK / 2}" y="14" text-anchor="middle" font-size="8.5" fill="#667085">${i + 1}주</text>` +
    `<line x1="${LW + i * WK}" y1="${T - 4}" x2="${LW + i * WK}" y2="${T + rows.length * RH}" stroke="#eaecf0"/>`).join('');
  const bars = rows.map((r, i) => {
    const yy = T + i * RH;
    return `<text x="4" y="${yy + 14}" font-size="9.5" fill="#1d2939" font-weight="${r.priority === 'base' ? 400 : 700}">${r.priority === 'base' ? '' : `${r.priority} · `}${esc(clip(r.label, 18))}</text>` +
      `<rect x="${LW + (r.start - 1) * WK + 2}" y="${yy + 4}" width="${(r.end - r.start + 1) * WK - 4}" height="${RH - 9}" rx="3" fill="${color[r.priority]}" opacity="${r.priority === 'base' ? 0.55 : 0.85}"/>`;
  }).join('');
  const my = T + rows.length * RH + 6;
  const ms = [[4.3, '30일 기준확정'], [8.6, '60일 중간점검'], [13, '90일 재진단']] as const;
  const marks = ms.map(([w, l]) => {
    const xx = LW + w * WK - 2;
    return `<line x1="${xx}" y1="${T - 4}" x2="${xx}" y2="${my}" stroke="#2457f5" stroke-dasharray="2 3"/>` +
      `<path d="M${xx} ${my} l5 6 l-5 6 l-5 -6 z" fill="#2457f5"/><text x="${xx - 7}" y="${my + 11}" text-anchor="end" font-size="8.5" font-weight="700" fill="#173fb5">${l}</text>`;
  }).join('');
  return `<svg class="gantt-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="90일 실행 일정">${weeks}${bars}${marks}</svg>`;
}

/** 오늘 + n일을 YYYY.MM.DD로 */
export function dateAfter(days: number, from = new Date()): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 리스크 히트맵 SVG: 가로=가능성(낮음·중간·높음·확인 필요), 세로=영향(위가 높음). 칸 안에 리스크 ID */
export function riskHeatmapSVG(risks: { id: string; likelihood: 1 | 2 | 3 | null; impact: 1 | 2 | 3 }[]): string {
  const LW = 44, TH = 22, CW = 74, CH = 46, W = LW + CW * 4 + 4, H = TH + CH * 3 + 24;
  const fill = (s: number | null) => (s === null ? '#f2f4f7' : s >= 6 ? '#fee4e2' : s >= 3 ? '#fef0c7' : '#ecfdf3');
  const cols = ['낮음', '중간', '높음', '확인 필요'];
  let out = cols.map((c, i) => `<text x="${LW + i * CW + CW / 2}" y="14" text-anchor="middle" font-size="9" font-weight="700" fill="#475467">${c}</text>`).join('');
  for (let imp = 3; imp >= 1; imp--) {
    const y0 = TH + (3 - imp) * CH;
    out += `<text x="${LW - 6}" y="${y0 + CH / 2 + 3}" text-anchor="end" font-size="9" font-weight="700" fill="#475467">${['', '낮음', '중간', '높음'][imp]}</text>`;
    for (let c = 0; c < 4; c++) {
      const lk = c < 3 ? c + 1 : null;
      const x0 = LW + c * CW;
      out += `<rect x="${x0 + 1}" y="${y0 + 1}" width="${CW - 2}" height="${CH - 2}" rx="4" fill="${fill(lk === null ? null : lk * imp)}" stroke="#fff"/>`;
      const here = risks.filter((r) => r.impact === imp && r.likelihood === lk);
      here.forEach((r, k) => {
        const cx = x0 + 14 + (k % 3) * 23, cy = y0 + 12 + Math.floor(k / 3) * 14;
        out += `<circle cx="${cx}" cy="${cy}" r="7" fill="${lk === null ? '#667085' : lk * imp >= 6 ? '#d92d20' : lk * imp >= 3 ? '#dc6803' : '#039855'}"/>` +
          `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="6.6" font-weight="800" fill="#fff">${esc(r.id)}</text>`;
      });
    }
  }
  out += `<text x="${LW + (CW * 3) / 2}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#475467">발생 가능성 →</text>` +
    `<text x="${LW - 6}" y="14" text-anchor="end" font-size="8.5" font-weight="700" fill="#667085">영향 ↓</text>`;
  return `<svg class="heatmap-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="리스크 히트맵">${out}</svg>`;
}

/** 재진단 변화(덤벨) SVG: 영역별 기준(회색) → 이번(파랑·빨강) 점수. 판단 보류는 표시만 */
export function deltaDumbbellSVG(rows: { label: string; prev: number | null; cur: number | null; verdict: string }[]): string {
  const LW = 84, RW = 70, PW = 330, RH = 24, T = 18, W = LW + PW + RW, H = T + rows.length * RH + 8;
  const x = (v: number) => LW + (Math.max(0, Math.min(100, v)) / 100) * PW;
  const grid = [0, 25, 50, 75, 100].map((g) =>
    `<line x1="${x(g)}" y1="${T - 6}" x2="${x(g)}" y2="${T + rows.length * RH}" stroke="#eaecf0"/><text x="${x(g)}" y="10" text-anchor="middle" font-size="8" fill="#98a2b3">${g}</text>`).join('');
  const body = rows.map((r, i) => {
    const y = T + i * RH + RH / 2;
    const col = r.verdict === '개선' ? '#2457f5' : r.verdict === '악화' ? '#d92d20' : '#667085';
    const label = `<text x="${LW - 8}" y="${y + 3}" text-anchor="end" font-size="9.5" font-weight="700" fill="#1d2939">${esc(r.label)}</text>`;
    const tag = `<text x="${LW + PW + 8}" y="${y + 3}" font-size="9" font-weight="700" fill="${col}">${esc(r.verdict)}</text>`;
    if (r.prev === null || r.cur === null) {
      const v = r.cur ?? r.prev;
      return label + tag + (v === null ? '' : `<circle cx="${x(v)}" cy="${y}" r="5" fill="${r.cur === null ? '#d0d5dd' : col}"/>`);
    }
    return label + tag +
      `<line x1="${x(r.prev)}" y1="${y}" x2="${x(r.cur)}" y2="${y}" stroke="${col}" stroke-width="3" opacity=".35"/>` +
      `<circle cx="${x(r.prev)}" cy="${y}" r="5" fill="#d0d5dd"/><circle cx="${x(r.cur)}" cy="${y}" r="5.5" fill="${col}"/>` +
      `<text x="${x(r.cur)}" y="${y - 8}" text-anchor="middle" font-size="8.5" font-weight="800" fill="${col}">${r.cur}</text>`;
  }).join('');
  return `<svg class="delta-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="재진단 영역별 변화">${grid}${body}</svg>`;
}
