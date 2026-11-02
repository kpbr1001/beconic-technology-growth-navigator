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

/** 레이더(방사형) — cats: [{name, score, expect?}]. expect가 있으면 단계 기대 수준을 점선으로 겹쳐 그린다 */
export function radar(cats, { size = 300, font = 11 } = {}) {
  const n = cats.length, cx = size / 2, cy = size / 2, R = size / 2 - font * 5.4;
  const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const ring = (f) => cats.map((_, i) => pt(cx, cy, R * f, ang(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const polyOf = (key) => cats.map((c, i) => pt(cx, cy, R * ((c[key] ?? 0) / 100), ang(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const hasExp = cats.some((c) => typeof c.expect === 'number');
  const labels = cats.map((c, i) => {
    const [x, y] = pt(cx, cy, R + font * 2, ang(i)); const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
    const low = hasExp && typeof c.score === 'number' && c.score < c.expect;
    return `<text x="${x.toFixed(1)}" y="${(y - font * 0.2).toFixed(1)}" text-anchor="${anchor}" font-size="${font}" fill="#333d4b" font-weight="600">${esc(c.name)}<tspan x="${x.toFixed(1)}" dy="${(font * 1.2).toFixed(1)}" font-size="${(font * 1.08).toFixed(1)}" font-weight="800" fill="${low ? '#d22030' : '#1b64da'}">${c.score ?? '—'}${hasExp ? `<tspan font-size="${(font * 0.85).toFixed(1)}" font-weight="600" fill="#8b95a1"> / ${c.expect}</tspan>` : ''}</tspan></text>`;
  }).join('');
  const legend = hasExp ? `<g font-size="${font}" fill="#4e5968"><rect x="8" y="${size - font * 1.6}" width="${font}" height="${font * 0.8}" fill="rgba(49,130,246,.25)" stroke="#3182f6"/><text x="${8 + font * 1.4}" y="${size - font * 0.85}">우리 점수</text>
    <line x1="${8 + font * 6.6}" y1="${size - font * 1.2}" x2="${8 + font * 8}" y2="${size - font * 1.2}" stroke="#e8921a" stroke-width="2" stroke-dasharray="4 3"/><text x="${8 + font * 8.4}" y="${size - font * 0.85}">단계 기대 수준</text></g>` : '';
  return `<svg class="ch-radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="영역별 점수 레이더 차트${hasExp ? '(단계 기대 수준 비교)' : ''}">
  ${[0.2, 0.4, 0.6, 0.8, 1].map((f) => `<polygon points="${ring(f)}" fill="${f === 1 ? '#f9fafb' : 'none'}" stroke="#e5e8eb" stroke-width="1"/>`).join('')}
  ${cats.map((_, i) => { const [x, y] = pt(cx, cy, R, ang(i)); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e8eb"/>`; }).join('')}
  ${hasExp ? `<polygon points="${polyOf('expect')}" fill="none" stroke="#e8921a" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
  <polygon points="${polyOf('score')}" fill="rgba(49,130,246,.2)" stroke="#3182f6" stroke-width="2.4"/>
  ${cats.map((c, i) => { const [x, y] = pt(cx, cy, R * ((c.score ?? 0) / 100), ang(i)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(font * 0.32).toFixed(1)}" fill="#1b64da"/>`; }).join('')}
  ${labels}${legend}</svg>`;
}

/** 연도별 재무 추이 막대(음수 지원) — rows: 오래된 해 → 최근 해 [{label, rev, op, net}] */
export const TREND_SERIES = [{ k: 'rev', name: '매출액', color: '#3182f6' }, { k: 'op', name: '영업이익', color: '#00a37a' }, { k: 'net', name: '당기순이익', color: '#f0a43a' }];
export function trend(rows, { width = 520, height = 230 } = {}) {
  const S = TREND_SERIES; const vals = rows.flatMap((r) => S.map((x) => r[x.k])).filter((v) => typeof v === 'number');
  if (!vals.length) return '';
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = max - min || 1;
  const top = 26, bottom = min < 0 ? 46 : 30, ph = height - top - bottom, yOf = (v) => top + ((max - v) / span) * ph, y0 = yOf(0);
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

/** 비율 추이 꺾은선 — cats: 연도 라벨(오래된 해 → 최근 해), series: [{name, color, vals}], 값 없음은 건너뜀 */
export function lineChart(cats, series, { width = 360, height = 200, unit = '%', label = '비율 추이' } = {}) {
  const vals = series.flatMap((x) => x.vals).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length || cats.length < 2) return '';
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = max - min || 1;
  const L = 34, R = 18, top = 44, bottom = 36, pw = width - L - R, ph = height - top - bottom;
  const xOf = (i) => L + (cats.length === 1 ? pw / 2 : (pw * i) / (cats.length - 1)), yOf = (v) => top + ((max - v) / span) * ph;
  const fmt = (v) => `${Math.round(v * 10) / 10}${unit}`;
  const lines = series.map((x, si) => { const pts = x.vals.map((v, i) => (typeof v === 'number' ? [xOf(i), yOf(v), v] : null)).filter(Boolean);
    return `<polyline points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="${x.color}" stroke-width="2.4"/>${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${x.color}"/><text x="${p[0].toFixed(1)}" y="${(si % 2 ? p[1] + 15 : p[1] - 7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${x.color}">${fmt(p[2])}</text>`).join('')}`; }).join('');
  const legend = series.map((x, j) => `<rect x="${L + j * 92}" y="4" width="10" height="10" rx="2" fill="${x.color}"/><text x="${L + 14 + j * 92}" y="13" font-size="10.5" fill="#4e5968">${esc(x.name)}</text>`).join('');
  return `<svg class="ch-line" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">${legend}
  <line x1="${L}" y1="${yOf(0).toFixed(1)}" x2="${width - R}" y2="${yOf(0).toFixed(1)}" stroke="#b0b8c1"/>
  ${cats.map((c, i) => `<text x="${xOf(i).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="#333d4b">${esc(c)}</text>`).join('')}${lines}</svg>`;
}

/** 가로 막대(0~100) — items: [{name, score, expect?}], marks: 세로 기준선 값들(예: 판단 구간) */
export function hbars(items, { width = 520, row = 22, label = 110, marks = [], color = () => '#3182f6' } = {}) {
  const pw = width - label - 44, h = items.length * row + 18;
  const x = (v) => label + (pw * Math.max(0, Math.min(100, v ?? 0))) / 100;
  return `<svg class="ch-hbar" viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" role="img" aria-label="점수 막대 차트">
  ${marks.map((m) => `<line x1="${x(m).toFixed(1)}" y1="2" x2="${x(m).toFixed(1)}" y2="${h - 14}" stroke="#d1d6db" stroke-dasharray="3 3"/><text x="${x(m).toFixed(1)}" y="${h - 3}" text-anchor="middle" font-size="9" fill="#8b95a1">${m}</text>`).join('')}
  ${items.map((it, i) => { const y = 4 + i * row; return `<text x="${label - 8}" y="${y + row / 2 + 1}" text-anchor="end" font-size="11" font-weight="600" fill="#333d4b">${esc(it.name)}</text>
    <rect x="${label}" y="${y + 4}" width="${pw}" height="${row - 10}" rx="${(row - 10) / 2}" fill="#f2f4f6"/>
    <rect x="${label}" y="${y + 4}" width="${(x(it.score) - label).toFixed(1)}" height="${row - 10}" rx="${(row - 10) / 2}" fill="${color(it.score)}"/>
    ${typeof it.expect === 'number' ? `<line x1="${x(it.expect).toFixed(1)}" y1="${y + 1}" x2="${x(it.expect).toFixed(1)}" y2="${y + row - 3}" stroke="#4e5968" stroke-width="2"/>` : ''}
    <text x="${label + pw + 8}" y="${y + row / 2 + 1}" font-size="11" font-weight="800" fill="${typeof it.expect === 'number' && it.score < it.expect ? '#d22030' : '#191f28'}">${it.score ?? '—'}</text>`; }).join('')}</svg>`;
}

/** 점수 점(●●●○○) */
export const dots = (v) => `<span class="dots" aria-label="${v || 0}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= (v || 0) ? 'on' : ''}"></i>`).join('')}</span>`;
