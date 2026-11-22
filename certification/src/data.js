// 데이터 묶음 준비 — 브라우저(fetch)와 Node 테스트(fs)가 같은 prepare()를 쓴다.
export const DATA_FILES = {
  catalog: 'data/catalog.json',
  sources: 'data/sources.json',
  questions: 'data/questions.json',
  packs: ['data/rule_packs/venture.json', 'data/rule_packs/innobiz.json', 'data/rule_packs/mainbiz.json', 'data/rule_packs/rnd.json'],
};

export function prepare({ catalog, sources, questions, packFiles }) {
  const packs = {};
  packFiles.forEach((f) => (f.packs ? f.packs : [f]).forEach((p) => { packs[p.scheme_id] = p; }));
  return {
    catalog, sources, questions, packs,
    schemeMap: Object.fromEntries(catalog.schemes.map((s) => [s.scheme_id, s])),
    sourceMap: Object.fromEntries(sources.sources.map((s) => [s.source_id, s])),
    questionMap: Object.fromEntries(questions.questions.map((q) => [q.question_id, q])),
  };
}

export async function loadData(base = '') {
  const get = async (p) => {
    const r = await fetch(base + p, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`데이터를 불러오지 못했어요 (${p})`);
    return r.json();
  };
  const [catalog, sources, questions, ...packFiles] = await Promise.all([
    get(DATA_FILES.catalog), get(DATA_FILES.sources), get(DATA_FILES.questions), ...DATA_FILES.packs.map(get),
  ]);
  return prepare({ catalog, sources, questions, packFiles });
}
