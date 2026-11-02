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
  // v2.0 → v2.1: '기술·지식재산'(SP3)이 기술역량 영역(TC2)으로 이동
  if (st.answers.SP3 && !st.answers.TC2) st.answers.TC2 = st.answers.SP3;
  delete st.answers.SP3;
  for (const [k, a] of Object.entries(st.answers)) if (!isObj(a) || !(a.v === undefined || [0, 1, 2, 3, 4, 5].includes(a.v))) delete st.answers[k];
  if (st.fin !== null && !isObj(st.fin)) st.fin = null;
  // v2.1 → v2.2: 재무 2개년(cur·prev) → 3개년(cur·prev·pp) + 최근 연도(y0)·파일 목록
  if (st.fin) {
    const f = st.fin; const num = (o) => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) : {});
    // v2.2 이전 읽기 오류로 모든 값이 0으로 저장된 해는 비움(다시 올리면 채워짐)
    const clean = (o) => { const v = num(o); return Object.keys(v).length && Object.values(v).every((x) => x === 0) ? {} : v; };
    st.fin = { ...f, cur: clean(f.cur), prev: clean(f.prev), pp: clean(f.pp), y0: /^20\d{2}$/.test(String(f.y0 || '')) ? String(f.y0) : (Array.isArray(f.years) && /^20\d{2}$/.test(String(f.years[0])) ? String(f.years[0]) : ''),
      files: Array.isArray(f.files) ? f.files.filter(isObj).slice(0, 6) : (f.fileName ? [{ name: String(f.fileName), type: 'ok', text: '' }] : []) };
  }
  return st;
}
export function load(storage = globalThis.localStorage) { try { const s = storage?.getItem(STORE_KEY); return s ? validate(JSON.parse(s)) : null; } catch { return null; } }
export function save(st, storage = globalThis.localStorage) { try { st.meta.updatedAt = nowIso(); storage?.setItem(STORE_KEY, JSON.stringify(st)); return true; } catch { return false; } }
export function clear(storage = globalThis.localStorage) { try { storage?.removeItem(STORE_KEY); } catch { /* 접근 불가 */ } }
export function hasLegacy(storage = globalThis.localStorage) { try { return !!storage?.getItem(LEGACY_KEY); } catch { return false; } }
