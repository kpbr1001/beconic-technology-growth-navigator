// 해외 제품 규제 트리아지 — 의무 여부·절차를 확정하지 않는다. 결과는 항상 '적용 규정 확인 필요'.
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const SPEC = {
  eu_ce: {
    market: 'EU',
    notes: {
      electrical: '전기·전자제품은 전기안전·전자파 관련 EU 제품 법규의 적용 대상인지 검토 후보예요.',
      radio: '무선 기능이 있으면 무선기기 관련 EU 제품 법규 검토 후보예요.',
      medical: '의료 목적이면 EU 의료기기 법규 검토 후보예요(제품 등급에 따라 Notified Body 관여).',
      machinery: '기계류는 기계 관련 EU 제품 법규 검토 후보예요.',
      toy_child: '어린이용 완구는 완구 안전 관련 EU 제품 법규 검토 후보예요.',
      chemical: '화학제품은 CE 표시 대상이 아닌 별도 화학물질 규제가 적용될 수 있어요.',
      software: '실물 제품이 없는 소프트웨어·서비스는 CE 표시 대상이 아닐 수 있어요. 별도 확인이 필요해요.',
      food: '식품은 CE 표시 대상이 아니에요. EU 식품 법규를 따로 확인하세요.',
      cosmetics: '화장품은 CE 표시 대상이 아니에요. EU 화장품 법규를 따로 확인하세요.',
    },
  },
  us_fda_device: {
    market: 'US',
    notes: {
      medical: '사용 목적(intended use)과 기기 분류에 따라 시판 전 절차가 달라요. 시설 등록·목록 등재는 FDA 승인이 아니에요.',
    },
    needs: ['medical'],
  },
  us_fda_food: {
    market: 'US',
    notes: { food: '식품 시설 등록은 승인·인증이 아니에요. 제품 유형별 추가 규정을 확인하세요.' },
    needs: ['food'],
  },
  us_fcc: {
    market: 'US',
    notes: {
      radio: '무선 송신 기기는 Certification 등 경로 검토 후보예요.',
      electrical: '전자파를 내는 전자기기는 공급자 적합성 선언(SDoC) 등 경로 검토 후보예요.',
    },
    needs: ['radio', 'electrical'],
  },
};

export function triage(scheme, a) {
  const spec = SPEC[scheme.triage];
  if (!spec) return null;
  const markets = arr(a.markets);
  const products = arr(a.product_categories).filter((p) => p !== 'unknown');
  const missing = [];
  if (!markets.includes(spec.market)) missing.push({ q: 'markets', text: `판매 시장에 ${spec.market === 'EU' ? 'EU' : '미국'}가 포함되는지` });
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
