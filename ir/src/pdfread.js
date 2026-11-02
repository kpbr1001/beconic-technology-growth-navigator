// PDF → 텍스트 줄. 사이트에 내장한 pdf.js로 브라우저 안에서만 읽는다(서버 전송 없음).
// 홈택스 표준재무제표증명은 글자 하나가 텍스트 조각 하나라서, 같은 높이(y)의 조각을 x 순서로 모은 뒤
// 간격이 좁으면 붙이고(한 단어·한 숫자) 넓으면 칸을 나눈다. 칸은 두 칸 공백으로 이어 한 줄 문자열을 만든다.
// (재무진단 도구 finance/의 실제 발급본 검증 로직과 같은 방식)
const BASE = '/vendor/pdfjs/';
let lib = null;

/** pdf.js getTextContent 항목 → 칸 배열의 줄들 */
export function itemsToRows(items) {
  const its = items.filter((i) => typeof i.str === 'string' && i.transform)
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 8 }));
  const lines = [];
  for (const it of its) { if (!it.s) continue; let ln = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.3)); if (!ln) { ln = { y: it.y, items: [] }; lines.push(ln); } ln.items.push(it); }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x); const toks = []; let cur = ''; let end = null;
    for (const it of l.items) {
      if (!it.s.trim()) { if (cur) { toks.push(cur); cur = ''; } end = it.x + it.w; continue; }
      const gap = end === null ? 0 : it.x - end;
      if (cur && gap > Math.max(2.5, it.h * 0.35)) { toks.push(cur); cur = ''; }
      cur += it.s; end = it.x + it.w;
    }
    if (cur) toks.push(cur);
    return toks.flatMap((t) => t.split(/\s{2,}/)).map((t) => t.trim()).filter(Boolean);
  }).filter((t) => t.length);
}

export async function readPdfLines(file, maxPages = 30) {
  if (!lib) {
    lib = await import(`${BASE}pdf.min.mjs`);
    lib.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, isEvalSupported: false, cMapUrl: `${BASE}cmaps/`, cMapPacked: true, disableFontFace: true }).promise;
  const lines = []; let chars = 0;
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    chars += tc.items.reduce((a, i) => a + (i.str || '').trim().length, 0);
    for (const row of itemsToRows(tc.items)) lines.push(row.join('  '));
  }
  return { lines, pages: doc.numPages, textless: chars < 30 };
}
