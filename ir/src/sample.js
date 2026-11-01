// 합성 예시 — 실제 기업 자료가 아님. 화면·보고서에 '합성 예시' 표시가 붙는다.
import { blank } from './store.js';
export function sampleState() {
  const st = blank();
  st.meta = { ...st.meta, company: '(합성 예시) 주식회사 샘플랩', stage: 'seed', industry: 'IT·소프트웨어', synthetic: true };
  const v = { PC1: 4, PC2: 4, PC3: 3, PC4: 4, SP1: 4, SP2: 3, SP4: 3, SP5: 3, TC1: 4, TC2: 3, TC3: 3, TC4: 2, MK1: 2, MK2: 3, MK3: 3, MK4: 2, BM1: 4, BM2: 3, BM3: 3, BM4: 2,
    CO1: 3, CO2: 3, CO3: 2, CO4: 2, TM1: 4, TM2: 3, TM3: 3, TM4: 3, FN1: 3, FN2: 3, FN3: 4, FN4: 0, IR1: 3, IR2: 2, IR3: 2, IR4: 2 };
  const ev = ['PC1', 'PC2', 'PC4', 'SP1', 'BM1', 'TM1', 'FN1', 'FN3'];
  st.answers = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { v: x, ev: ev.includes(k) }]));
  st.fin = { source: 'upload', confirmed: true, y0: '2025', files: [{ name: '(합성 예시) 표준재무제표증명_2023-2025.pdf', type: 'ok', text: '3개년 읽음' }],
    cur: { rev: 120000000, cogs: 48000000, op: -90000000, net: -95000000, assets: 520000000, liab: 210000000, equity: 310000000, capital: 100000000, ca: 400000000, cl: 150000000, cash: 310000000 },
    prev: { rev: 80000000, cogs: 36000000, op: -110000000, net: -112000000, assets: 430000000, liab: 160000000, equity: 270000000, capital: 100000000 },
    pp: { rev: 30000000, cogs: 15000000, op: -70000000, net: -71000000, assets: 260000000, liab: 60000000, equity: 200000000, capital: 100000000 } };
  return st;
}
