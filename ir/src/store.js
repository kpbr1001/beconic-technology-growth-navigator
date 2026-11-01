// 진단 저장 — 브라우저 localStorage에만 저장하고 서버로 보내지 않는다.
// v2(점수형)는 v1(근거 원장형)과 구조가 달라 새 키에 저장한다. v1 기록은 지우지 않고 그대로 둔다.
export const STORE_KEY = 'beconic-ir:v2';
export const LEGACY_KEY = 'beconic-ir:v1';
export const SCHEMA = 2;
export const nowIso = () => new Date().toISOString();
export const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export function blank() {
  return { app: 'beconic-ir', schema: SCHEMA, meta: { company: '', stage: '', industry: '', synthetic: false, createdAt: nowIso(), updatedAt: nowIso() }, answers: {}, fin: null };
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function validate(raw) {
  if (!isObj(raw) || raw.app !== 'beconic-ir' || raw.schema !== SCHEMA || !isObj(raw.meta) || !isObj(raw.answers)) return null;
  const st = { ...blank(), ...raw, meta: { ...blank().meta, ...raw.meta } };
  for (const [k, a] of Object.entries(st.answers)) if (!isObj(a) || !(a.v === undefined || [0, 1, 2, 3, 4, 5].includes(a.v))) delete st.answers[k];
  if (st.fin !== null && !isObj(st.fin)) st.fin = null;
  return st;
}
export function load(storage = globalThis.localStorage) { try { const s = storage?.getItem(STORE_KEY); return s ? validate(JSON.parse(s)) : null; } catch { return null; } }
export function save(st, storage = globalThis.localStorage) { try { st.meta.updatedAt = nowIso(); storage?.setItem(STORE_KEY, JSON.stringify(st)); return true; } catch { return false; } }
export function clear(storage = globalThis.localStorage) { try { storage?.removeItem(STORE_KEY); } catch { /* 접근 불가 */ } }
export function hasLegacy(storage = globalThis.localStorage) { try { return !!storage?.getItem(LEGACY_KEY); } catch { return false; } }
