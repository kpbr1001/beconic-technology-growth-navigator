// 작업 공간(CompanyWorkspace) 저장 — 브라우저 localStorage에만 저장하고 서버로 보내지 않는다.
// 대표 ↔ 컨설턴트 전달은 '검토 파일(JSON)' 내보내기·불러오기로 한다(증빙 파일 원본은 포함하지 않음: 이름·위치·SHA-256만).
export const STORE_KEY = 'beconic-ir:v1';
export const SCHEMA = 1;

export const today = () => {
  const d = new Date(Date.now() + 9 * 3600e3); // 한국시간 기준 날짜
  return d.toISOString().slice(0, 10);
};
export const nowIso = () => new Date().toISOString();

export function blank() {
  return {
    app: 'beconic-ir', schema: SCHEMA,
    meta: { company: '', country: '대한민국', baseDate: today(), currency: 'KRW', lang: 'ko', ceo: '', consultant: '', disclosure: '', synthetic: false, createdAt: nowIso(), updatedAt: nowIso() },
    role: 'ceo', answers: {}, evidence: [], snapshots: [], log: [],
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** 외부 파일·저장값 검증: 구조가 맞지 않으면 null */
export function validate(raw) {
  if (!isObj(raw) || raw.app !== 'beconic-ir' || raw.schema !== SCHEMA) return null;
  if (!isObj(raw.meta) || !isObj(raw.answers) || !Array.isArray(raw.evidence) || !Array.isArray(raw.snapshots)) return null;
  const st = { ...blank(), ...raw, meta: { ...blank().meta, ...raw.meta } };
  if (!['ceo', 'consultant'].includes(st.role)) st.role = 'ceo';
  if (!Array.isArray(st.log)) st.log = [];
  return st;
}

export function load(storage = globalThis.localStorage) {
  try { const s = storage?.getItem(STORE_KEY); return s ? validate(JSON.parse(s)) : null; } catch { return null; }
}
export function save(st, storage = globalThis.localStorage) {
  try { st.meta.updatedAt = nowIso(); storage?.setItem(STORE_KEY, JSON.stringify(st)); return true; } catch { return false; }
}
export function clear(storage = globalThis.localStorage) { try { storage?.removeItem(STORE_KEY); } catch { /* 저장소 접근 불가 */ } }

export const nextEvidenceId = (st) => {
  const n = st.evidence.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/\D/g, '')) || 0), 0) + 1;
  return `E${String(n).padStart(2, '0')}`;
};
