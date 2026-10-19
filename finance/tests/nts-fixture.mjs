// 홈택스 표준재무제표증명(일반법인용)과 같은 구조의 '가상' PDF를 만든다.
// 실제 발급본처럼 글자 1개를 텍스트 조각 1개로 쪼개고(글자 단위 span), 재무상태표 첫 줄을 2단으로 배치한다.
// 실제 회사 이름·번호·금액은 쓰지 않는다.
const glyphs = (s) => [...String(s)].map((c) => (c === ' ' ? '<span class="sp"> </span>' : `<span class="g">${c}</span>`)).join('');
const amt = (n) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US');

export function ntsHtml({ company = '(가상)테스트상사 주식회사', biz = '123-45-67890', year, issued = '2026년 10월 14일', report = '정기 신고', reportDate, bs, is, twoCol = true }) {
  const row = (cells) => `<tr>${cells.map((c, i) => `<td class="${i % 3 === 2 ? 'r' : ''}">${glyphs(c)}</td>`).join('')}</tr>`;
  const bsRows = bs.map(([l, c, v]) => [l, c, amt(v)]);
  let bsHtml;
  if (twoCol) {
    // 오른쪽 열에 자본총계·부채와 자본총계를 둔다(2025년 발급본과 같은 배치)
    const right = bsRows.filter((r) => /자본총계/.test(r[0]));
    const left = bsRows.filter((r) => !/자본총계/.test(r[0]));
    bsHtml = left.map((r, i) => row(right[i] ? [...r, ...right[i]] : r)).join('');
  } else bsHtml = bsRows.map(row).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:'WenQuanYi Zen Hei',sans-serif;font-size:11px;margin:30px}
  .g{display:inline-block}.sp{display:inline-block;width:4px}
  td{padding:1px 14px;white-space:nowrap}.r{text-align:right}
  .pb{break-after:page}</style></head><body>
  <section class="pb"><p>${glyphs('( 1 / 3 )')}</p><h2>${glyphs('표 준 재무 제표 증 명')}</h2>
  <p>${glyphs('발 급 번 호')}</p><p>${glyphs('1234-567-8901-234')}</p>
  <p>${glyphs('상 호 ( 법 인 명 )')} &nbsp;&nbsp;&nbsp; ${glyphs(company)} &nbsp;&nbsp;&nbsp; ${glyphs('사업자등록번호')} &nbsp;&nbsp;&nbsp; ${glyphs(biz)}</p>
  <p>${glyphs('업 태')} &nbsp;&nbsp;&nbsp; ${glyphs('제조업')}</p><p>${glyphs('종 목')} &nbsp;&nbsp;&nbsp; ${glyphs('전자부품')}</p>
  <p>${glyphs(`${year}.01.01`)} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${glyphs('표준재무상태표')}</p>
  <p>${glyphs('사 업 연 도')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${glyphs('첨 부 서 류')}</p>
  <p>${glyphs(`~ ${year}.12.31`)} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${glyphs('표준손익계산서')}</p>
  <p>${glyphs('신 고 구 분')} &nbsp;&nbsp;&nbsp; ${glyphs(report)} &nbsp;&nbsp;&nbsp; ${glyphs('신 고 일')} &nbsp;&nbsp;&nbsp; ${glyphs(reportDate || `${year + 1}. 03. 10`)}</p>
  <p style="margin-top:40px">${glyphs(issued)}</p><p>${glyphs('접 수 번 호')} &nbsp;&nbsp; ${glyphs('505517237126')}</p><p>${glyphs('담 당 부 서')} &nbsp;&nbsp; ${glyphs('민원봉사실')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${glyphs('가상세무서장')}</p></section>
  <section class="pb"><p>${glyphs('( 2 / 3 )')}</p><h3>${glyphs('표 준 재 무 상 태 표')}</h3><p>${glyphs('(일반법인용)')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${glyphs('(단위: 원)')}</p>
  <p>${glyphs('법인명 ' + company.slice(0, 6))} &nbsp;&nbsp;&nbsp; ${glyphs(`${year}년12월31일 현재`)}</p>
  <table>${row(['계   정 과   목', '코드', '금          액'])}${bsHtml}</table></section>
  <section><p>${glyphs('( 3 / 3 )')}</p><p>${glyphs(`${year}년 01월 01일 부터`)} &nbsp;&nbsp;&nbsp;&nbsp; ${glyphs('법인명')} &nbsp;&nbsp; ${glyphs(company)}</p>
  <h3>${glyphs('표준손익계산서')}</h3><p>${glyphs(`${year}년 12월 31일 까지`)} &nbsp;&nbsp;&nbsp; ${glyphs('(일반법인용)')} &nbsp;&nbsp; ${glyphs('(단위 : 원)')}</p>
  <table>${row(['계   정 과   목', '코드', '금       액'])}${is.map(([l, c, v]) => row([l, c, amt(v)])).join('')}</table></section></body></html>`;
}

// 대차·손익이 맞는 가상 3개년 (단위: 원)
export function fixtureYear(year, k = 1, cap = 300_000_000) {
  const ca = 400_000_000 * k, cash = 120_000_000 * k, ar = 180_000_000 * k, nca = 600_000_000 * k;
  const cl = 350_000_000 * k, stb = 100_000_000 * k, ins = 30_000_000 * k, ap = 80_000_000 * k, ncl = 250_000_000 * k, ltb = 250_000_000 * k;
  const A = ca + nca, L = cl + ncl, E = A - L, re = E - cap;
  const rev = 1_500_000_000 * k, cogs = 1_100_000_000 * k, gp = rev - cogs, sga = 350_000_000 * k, oi = gp - sga, nonop = 20_000_000 * k, ie = 18_000_000 * k, ni = oi - nonop;
  return {
    year,
    bs: [['Ⅰ.유동자산', '001', ca], ['(1)당좌자산', '002', ca], [' 1.현금 및 현금성자산', '003', cash], [' 4.매출채권(공사․분양수입 외)', '009', ar], ['  가.외상매출금', '010', ar], ['(2)재고자산', '044', ca - cash - ar], ['Ⅱ.비유동자산', '080', nca], ['자산총계(Ⅰ+Ⅱ)', '228', A],
      ['Ⅰ.유동부채', '229', cl], ['2.단기차입금', '234', stb], [' 나.주주·임원·직원', '236', ins], ['3.미지급금', '238', ap], ['Ⅱ.비유동부채', '284', ncl], ['3.장기차입금', '289', ltb], ['부채총계(Ⅰ+Ⅱ)', '333', L],
      ['Ⅲ.자본금', '334', cap], ['Ⅶ.이익잉여금', '372', re], [' 5.미처분이익잉여금(미처리결손금)', '381', re], ['자본총계(Ⅲ+～Ⅶ)', '382', E], ['부채와 자본총계', '383', A]],
    is: [['I.매출액', '001', rev], ['Ⅱ.매출원가', '035', cogs], ['Ⅲ.매출총손익', '066', gp], ['Ⅳ.판매비와관리비', '067', sga], ['Ⅴ.영업손익', '129', oi], ['Ⅶ.영업외비용', '179', nonop], [' 1.이자비용', '180', ie], ['Ⅹ.당기순손익', '219', ni]],
    expect: { assets: A, liabilities: L, equity: E, revenue: rev, operatingIncome: oi, netIncome: ni, retainedEarnings: re, insiderBorrowings: ins, otherPayables: ap, interestExpense: ie, tradeReceivables: ar },
  };
}
