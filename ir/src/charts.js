// 차트 — 외부 라이브러리 없이 SVG 문자열로 그린다(CSP 유지, 인쇄 PDF에서도 선명). 색은 명시값이라 인쇄에서도 같다.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

/** 반원 게이지 */
export function gauge(score, grade, { size = 220, label = 'IR 준비도' } = {}) {
  const w = size, r = w / 2 - 16, sw = 16, cx = w / 2, cy = r + sw / 2 + 4, h = cy + 30;
  const s = Math.max(0, Math.min(100, score ?? 0)); const a0 = Math.PI, a1 = Math.PI + (Math.PI * s) / 100;
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1), [xe, ye] = pt(cx, cy, r, 2 * Math.PI);
  const color = grade?.color || '#3182f6';
  return `<svg class="ch-gauge" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)} ${s}점 ${esc(grade?.g || '')}등급">
  <path d="M${x0},${y0} A${r},${r} 0 0 1 ${xe},${ye}" fill="none" stroke="#e5e8eb" stroke-width="${sw}" stroke-linecap="round"/>
  ${s > 0 ? `<path d="M${x0},${y0} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>` : ''}
  <text x="${cx}" y="${cy - 50}" text-anchor="middle" font-size="12" fill="#6b7684" font-weight="600">${esc(label)}</text>
  <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="44" font-weight="800" fill="#191f28">${score ?? '—'}<tspan font-size="16" fill="#6b7684" font-weight="700">점</tspan></text>
  ${grade ? `<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="14" font-weight="800" fill="${color}">${esc(grade.g)}등급</text>` : ''}
  </svg>`;
}

/** 레이더(방사형) — cats: [{name, score}] */
export function radar(cats, { size = 300 } = {}) {
  const n = cats.length, cx = size / 2, cy = size / 2, R = size / 2 - 60;
  const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const ring = (f) => cats.map((_, i) => pt(cx, cy, R * f, ang(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const poly = cats.map((c, i) => pt(cx, cy, R * ((c.score ?? 0) / 100), ang(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const labels = cats.map((c, i) => {
    const [x, y] = pt(cx, cy, R + 22, ang(i)); const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#333d4b" font-weight="600">${esc(c.name)}<tspan x="${x.toFixed(1)}" dy="13" font-size="11.5" font-weight="800" fill="#1b64da">${c.score ?? '—'}</tspan></text>`;
  }).join('');
  return `<svg class="ch-radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="카테고리별 점수 레이더 차트">
  ${[0.2, 0.4, 0.6, 0.8, 1].map((f) => `<polygon points="${ring(f)}" fill="${f === 1 ? '#f9fafb' : 'none'}" stroke="#e5e8eb" stroke-width="1"/>`).join('')}
  ${cats.map((_, i) => { const [x, y] = pt(cx, cy, R, ang(i)); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e8eb"/>`; }).join('')}
  <polygon points="${poly}" fill="rgba(49,130,246,.18)" stroke="#3182f6" stroke-width="2"/>
  ${cats.map((c, i) => { const [x, y] = pt(cx, cy, R * ((c.score ?? 0) / 100), ang(i)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#1b64da"/>`; }).join('')}
  ${labels}</svg>`;
}

/** 연도별 재무 추이 막대(음수 지원) — rows: 오래된 해 → 최근 해 [{label, rev, op, net}] */
export const TREND_SERIES = [{ k: 'rev', name: '매출액', color: '#3182f6' }, { k: 'op', name: '영업이익', color: '#00a37a' }, { k: 'net', name: '당기순이익', color: '#f0a43a' }];
export function trend(rows, { width = 520, height = 230 } = {}) {
  const S = TREND_SERIES; const vals = rows.flatMap((r) => S.map((x) => r[x.k])).filter((v) => typeof v === 'number');
  if (!vals.length) return '';
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = max - min || 1;
  const top = 26, bottom = 30, ph = height - top - bottom, yOf = (v) => top + ((max - v) / span) * ph, y0 = yOf(0);
  const gw = (width - 20) / rows.length, bw = Math.min(30, (gw - 24) / S.length);
  const fmt = (v) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(1).replace(/\.0$/, '')}억` : `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`);
  const bars = rows.map((r, i) => {
    const gx = 10 + gw * i + gw / 2 - (bw * S.length + 4 * (S.length - 1)) / 2;
    return S.map((x, j) => { const v = r[x.k]; if (typeof v !== 'number') return ''; const bx = gx + j * (bw + 4); const y = Math.min(yOf(v), y0), h = Math.max(1, Math.abs(yOf(v) - y0));
      return `<rect x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${x.color}"/><text x="${(bx + bw / 2).toFixed(1)}" y="${(v >= 0 ? y - 4 : y + h + 11).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#4e5968">${fmt(v)}</text>`; }).join('')
      + `<text x="${(10 + gw * i + gw / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#333d4b">${esc(r.label)}</text>`;
  }).join('');
  const legend = S.map((x, j) => `<rect x="${10 + j * 82}" y="4" width="10" height="10" rx="2" fill="${x.color}"/><text x="${24 + j * 82}" y="13" font-size="10.5" fill="#4e5968">${x.name}</text>`).join('');
  return `<svg class="ch-fin" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="연도별 매출액·영업이익·당기순이익 추이 막대 차트">
  ${legend}<line x1="6" y1="${y0.toFixed(1)}" x2="${width - 6}" y2="${y0.toFixed(1)}" stroke="#b0b8c1"/>${bars}</svg>`;
}

/** 점수 점(●●●○○) */
export const dots = (v) => `<span class="dots" aria-label="${v || 0}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= (v || 0) ? 'on' : ''}"></i>`).join('')}</span>`;
