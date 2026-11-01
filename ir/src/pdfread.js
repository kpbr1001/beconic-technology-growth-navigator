// PDF → 텍스트 줄. 사이트에 내장한 pdf.js로 브라우저 안에서만 읽는다(서버 전송 없음).
// 같은 높이(y)의 글자 조각을 한 줄로 묶어 표 형태의 표준재무제표를 줄 단위로 복원한다.
const BASE = '/vendor/pdfjs/';
let lib = null;

export async function readPdfLines(file, maxPages = 20) {
  if (!lib) {
    lib = await import(`${BASE}pdf.min.mjs`);
    lib.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, isEvalSupported: false, cMapUrl: `${BASE}cmaps/`, cMapPacked: true, disableFontFace: true }).promise;
  const lines = []; let chars = 0;
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => typeof it.str === 'string' && it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || 8 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, it.h * 0.4));
      if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    for (const r of rows.sort((a, b) => b.y - a.y)) {
      const line = r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
      if (line) { lines.push(line); chars += line.length; }
    }
  }
  return { lines, pages: doc.numPages, textless: chars < 30 };
}
