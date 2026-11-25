// 해외 제품 규제 트리아지 — 의무 여부·절차를 확정하지 않는다. 결과는 항상 '적용 규정 확인 필요'.
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);


// 규정 검토 문구는 데이터(catalog.triage_specs)에만 둔다
export function triage(scheme, a, specs = {}) {
  const spec = specs[scheme.triage];
  if (!spec) return null;
  const markets = arr(a.markets);
  const products = arr(a.product_categories).filter((p) => p !== 'unknown');
  const missing = [];
  if (!markets.includes(spec.market)) missing.push({ q: 'markets', text: `판매 시장에 ${spec.market_label || spec.market}이(가) 포함되는지` });
  if (!products.length) missing.push({ q: 'product_categories', text: '제품 종류' });
  if (!a.trade_role || a.trade_role === 'unknown') missing.push({ q: 'trade_role', text: '제조자·수입자·유통자 중 우리 역할' });
  if (!a.intended_use) missing.push({ q: 'intended_use', text: '제품의 사용 목적(intended use)' });
  const notes = products.map((p) => spec.notes[p]).filter(Boolean);
  const relevant = markets.includes(spec.market) && (!spec.needs || products.some((p) => spec.needs.includes(p)));
  return {
    status: 'NEEDS_REVIEW',
    label: '적용 규정 확인 필요',
    relevant,
    missing,
    notes: notes.length ? notes : ['입력한 정보로는 적용 규정을 좁힐 수 없어요. 제품 정보로 판매국 규정을 확인하세요.'],
    caution: '이 결과는 의무 여부나 승인·인증 경로를 확정하지 않아요. 판매국 규제기관 원문 또는 전문가 확인이 필요해요.',
  };
}
