// 후보 추천(결과 A층) — 목적·대상·시장·제품과의 '관련성'만 본다. 인증 가능성·확률이 아니다.
// 숫자 점수는 화면에 노출하지 않고 3단계 라벨만 쓴다.
const PURPOSE_KO = { rnd: 'R&D·세액공제', finance: '정책자금·투자', procurement: '공공조달', export: '해외 수출', quality: '품질·안전', security: '정보보호', customer: '거래처 요구', brand: '대외 신뢰' };
const PRODUCT_KO = { electrical: '전기·전자', radio: '무선통신', medical: '의료기기', food: '식품', cosmetics: '화장품', machinery: '기계류', chemical: '화학제품', toy_child: '어린이제품', software: '소프트웨어' };
const MARKET_KO = { KR: '국내', EU: 'EU', US: '미국', OTHER: '기타 해외' };

export const TIER = Object.freeze({ HIGH: 'high', CONSIDER: 'consider', INSUFFICIENT: 'insufficient', LOW: 'low' });
export const TIER_LABEL = { high: '관련성이 높음', consider: '검토해 볼 만함', insufficient: '현재 정보로 판단 어려움', low: '관련성 낮음' };

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function recommendOne(s, a) {
  const purposes = arr(a.purposes).filter((p) => p !== 'other');
  const markets = arr(a.markets).filter((m) => m !== 'unknown');
  const products = arr(a.product_categories).filter((p) => p !== 'unknown');
  const target = a.target;
  const reasons = [];
  const pm = (s.purpose_tags || []).filter((p) => purposes.includes(p));
  pm.slice(0, 2).forEach((p) => reasons.push(`목적: ${PURPOSE_KO[p]}`));

  // 회사/제품 대상 불일치
  if (target === 'company' && s.target === 'product') return { tier: TIER.LOW, reasons: ['회사 대상 인증을 찾고 계셔서 제품 규제는 뒤로 미뤘어요.'], score: 0 };
  if (target === 'product' && s.target === 'company') return { tier: TIER.LOW, reasons: ['제품 대상 규제를 찾고 계셔서 회사 확인 제도는 뒤로 미뤘어요.'], score: 0 };

  // 예비창업자: 사업자 대상 제도는 사업자등록 후
  if (a.biz_status === 'pre' && ['INNO', 'MAIN', 'RNDI', 'RNDD'].includes(s.scheme_id)) {
    return { tier: TIER.LOW, reasons: ['사업자등록 이후에 신청할 수 있는 제도예요.'], score: 0 };
  }

  // 시장이 정해진 해외 규제
  const marketSpecific = (s.applicable_markets || []).filter((m) => m !== 'GLOBAL' && m !== 'KR');
  if (marketSpecific.length) {
    if (!markets.length) return { tier: TIER.INSUFFICIENT, reasons: ['판매할 해외 시장을 아직 정하지 않으셨어요.'], score: 0 };
    if (!marketSpecific.some((m) => markets.includes(m))) return { tier: TIER.LOW, reasons: [`선택한 시장(${markets.map((m) => MARKET_KO[m]).join(', ')})과 관련이 적어요.`], score: 0 };
    reasons.unshift(`시장: ${marketSpecific.map((m) => MARKET_KO[m] || m).join(', ')}`);
  }
  // 국내 제품 규제: 국내 시장 미선택이면 낮춤
  if (s.target === 'product' && (s.applicable_markets || []).includes('KR') && markets.length && !markets.includes('KR')) {
    return { tier: TIER.LOW, reasons: ['국내 판매를 선택하지 않으셨어요.'], score: 0 };
  }
  // 제품 범위
  if ((s.product_scopes || []).length && (s.target === 'product' || ['food', 'medical'].some((x) => (s.industries || []).includes(x)))) {
    if (!products.length && s.target === 'product') return { tier: TIER.INSUFFICIENT, reasons: ['제품 종류를 알아야 적용 여부를 볼 수 있어요.'], score: 0 };
    const hit = s.product_scopes.filter((p) => products.includes(p));
    const industryHit = (s.industries || []).includes('medical') && a.industry === 'medical_27';
    if (!hit.length && !industryHit) {
      if ((s.industries || []).some((x) => x === 'food' || x === 'medical')) return { tier: TIER.LOW, reasons: ['선택한 제품·업종과 관련이 적어요.'], score: 0 };
      if (s.target === 'product') return { tier: TIER.LOW, reasons: ['선택한 제품 종류와 관련이 적어요.'], score: 0 };
    } else {
      reasons.push(`제품: ${hit.map((p) => PRODUCT_KO[p]).join(', ') || '의료기기 업종'}`);
    }
  }

  const desired = arr(a.desired_schemes).includes(s.scheme_id);
  const score = pm.length + (marketSpecific.length ? 1 : 0) + (desired ? 2 : 0);
  if (desired) reasons.unshift('직접 선택한 인증');
  if (!purposes.length && !desired && !marketSpecific.length) return { tier: TIER.INSUFFICIENT, reasons: ['목적을 고르면 관련성을 더 정확히 볼 수 있어요.'], score: 0 };
  const tier = score >= 2 ? TIER.HIGH : score === 1 ? TIER.CONSIDER : TIER.LOW;
  return { tier, reasons: reasons.slice(0, 3), score };
}

export function recommend(schemes, answers) {
  const order = { high: 0, consider: 1, insufficient: 2, low: 3 };
  return schemes
    .map((s) => ({ scheme: s, ...recommendOne(s, answers) }))
    .sort((x, y) => order[x.tier] - order[y.tier] || y.score - x.score || Number(y.scheme.diagnosable) - Number(x.scheme.diagnosable));
}
