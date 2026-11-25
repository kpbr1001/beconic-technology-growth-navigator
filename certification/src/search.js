// 제도 검색 — 한글/영문/약어/별칭/목적어. 등록된 제도·별칭만 결과·제안으로 쓴다(새 제도 생성 금지).
export function normalize(s) {
  return String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\-_·.()/&,]+/g, '');
}

const PURPOSE_WORDS = {
  rnd: ['r&d', 'rnd', '연구', '연구개발', '세액공제', '연구인력'],
  finance: ['정책자금', '보증', '투자', '자금', '대출'],
  procurement: ['조달', '입찰', '공공구매', '가점'],
  export: ['수출', '해외', '글로벌'],
  quality: ['품질', '안전'],
  security: ['보안', '정보보호'],
  customer: ['거래처', '고객사', '납품'],
  brand: ['신뢰', '홍보', '브랜드'],
};

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

function fieldsOf(s) {
  const names = [s.name_ko, s.official_name, ...(s.aliases || [])].map(normalize);
  const purpose = (s.purpose_tags || []).flatMap((p) => PURPOSE_WORDS[p] || []).map(normalize);
  return { names, purpose };
}

export function filterSchemes(schemes, f = {}) {
  return schemes.filter((s) => {
    if (f.group && f.group !== 'all' && s.display_group !== f.group) return false;
    if (f.target && f.target !== 'all' && !(s.target === f.target || s.target === 'both')) return false;
    if (f.mandatory && f.mandatory !== 'all' && s.mandatory_status !== f.mandatory) return false;
    if (f.diagnosable === true && !s.diagnosable) return false;
    if (f.purpose && f.purpose !== 'all' && !(s.purpose_tags || []).includes(f.purpose)) return false;
    return true;
  });
}

export function searchSchemes(schemes, query, f = {}) {
  const pool = filterSchemes(schemes, f);
  const q = normalize(query);
  if (!q) return pool.map((s) => ({ scheme: s, score: 0 }));
  const tokens = String(query).normalize('NFKC').toLowerCase().split(/\s+/).map(normalize).filter(Boolean);
  const out = [];
  for (const s of pool) {
    const { names, purpose } = fieldsOf(s);
    let score = 0;
    if (names.includes(q)) score = 100;
    else if (names.some((n) => n.startsWith(q))) score = 60;
    else if (names.some((n) => n.includes(q))) score = 40;
    else if (q.length >= 2 && names.some((n) => n.length >= 2 && q.includes(n))) score = 30; // '유럽수출인증' ⊃ '유럽수출'
    else if (tokens.length > 1 && tokens.every((t) => names.some((n) => n.includes(t)) || purpose.some((p) => p.includes(t) || t.includes(p)))) score = 20;
    else if (purpose.some((p) => p === q || (q.length >= 2 && p.includes(q)))) score = 10;
    if (score) out.push({ scheme: s, score });
  }
  return out.sort((a, b) => b.score - a.score || Number(b.scheme.diagnosable) - Number(a.scheme.diagnosable));
}

// 0건일 때 '혹시 …를 찾으시나요?' — 등록된 별칭과 편집거리 1(5자 이상은 2) 이내만
export function suggest(schemes, query) {
  const q = normalize(query);
  if (q.length < 2) return [];
  const hits = [];
  for (const s of schemes) {
    for (const alias of [s.name_ko, ...(s.aliases || [])]) {
      const n = normalize(alias);
      const lim = n.length >= 5 ? 2 : 1;
      if (n.length >= 2 && levenshtein(q, n) <= lim) { hits.push(s); break; }
    }
  }
  return hits.slice(0, 3);
}
