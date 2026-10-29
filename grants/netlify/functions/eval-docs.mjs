// [임시·검증 세트 수집용] 미리보기 배포에서만 동작. 정확도 검증 세트를 만들 때 공고문 원문을 가져오기 위한 함수로,
// 검증 세트를 저장소에 고정한 뒤 삭제한다. 운영(production)에서는 404.
//  ?list=1        → 공고문이 있는 기업마당 공고 목록(ID·공고명·분석 상태)
//  ?ids=A,B,...   → 공고별 스냅샷 정보 + 공고문 텍스트(최대 12건, 앞 8,000자)
import { setDeployHost, isPreview, readSnapshot } from '../lib/collect.mjs';
import { readDocIndex, pdfText } from '../lib/docs.mjs';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default async (req, context) => {
  const u = new URL(req.url);
  setDeployHost(u.host, context?.deploy?.context);
  if (!isPreview()) return new Response('Not found', { status: 404 });
  const snap = await readSnapshot();
  const progs = (snap?.programs || []).filter((p) => p.source === 'bizinfo' && p.docUrl);
  const idx = await readDocIndex();
  if (u.searchParams.get('list')) {
    return json({ fetchedAt: snap?.fetchedAt, programs: progs.map((p) => ({ id: p.sourceProgramId, name: p.programName, status: idx[p.sourceProgramId]?.status || null, any: !!(idx[p.sourceProgramId]?.fields || idx[p.sourceProgramId]?.regions || idx[p.sourceProgramId]?.districts || idx[p.sourceProgramId]?.preStartupAllowed != null) })) });
  }
  const ids = String(u.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 12);
  const out = [];
  for (const id of ids) {
    const p = progs.find((x) => x.sourceProgramId === id);
    if (!p || !/^https:\/\/www\.bizinfo\.go\.kr\//.test(p.docUrl)) { out.push({ id, error: 'not found' }); continue; }
    try {
      const res = await fetch(p.docUrl, { signal: AbortSignal.timeout(20000) });
      const text = await pdfText(Buffer.from(await res.arrayBuffer()));
      const rest = { ...p };
      delete rest.docUrl;
      out.push({ id, program: rest, text: text.slice(0, 8000) });
    } catch (e) { out.push({ id, error: String(e.message || e).slice(0, 120) }); }
  }
  return json({ items: out });
};
