// ============================================================================
// 공고문 분석 정확도 측정 — 검증 세트(tests/fixtures/eval-set.json)의 정답과 현재 규칙의 결과를 비교한다.
//   node grants/tests/eval-accuracy.mjs            → 항목별 표
//   node grants/tests/eval-accuracy.mjs --json     → 결과 JSON(보고서용)
//   node grants/tests/eval-accuracy.mjs --check    → 기준(baseline) 미달이면 종료 코드 1 (CI 회귀 방지)
//
// 검증 세트: 공고별 { id, stratum, program(목록 단계 결과), text(공고문 앞부분), gold(정답) }
//   stratum 'random'  — 공고문이 있는 공고에서 무작위 추출 → 재현율(놓친 비율) 추정에 사용
//   stratum 'extract' — 규칙이 무언가 뽑은 공고에서 무작위 추출 → 정밀도(틀린 비율) 추정에 보탬
// 정답 표기: 값이 없으면 null(공고문에 해당 조건 없음).
//   regions  — 시·도 배열, 전국이면 ['전국']
//   regions가 null이면 정답을 정할 수 없는 공고 → 지역 항목에서만 제외
//   preStartup — 'yes'(예비창업자 신청 가능) | 'no'(사업자만) | null(공고문으로 판단 불가)
// ============================================================================
import fs from 'node:fs';
import { analyzeDocText, applyDoc } from '../netlify/lib/doc-rules.mjs';

const NUM = ['businessAgeMax', 'businessAgeMin', 'employeeMax', 'employeeMin', 'revenueMax', 'revenueMin', 'representativeAgeMax', 'representativeAgeMin'];
const LABEL = {
  regions: '대상 지역(시·도)', districts: '대상 시·군·구', preStartup: '예비창업자 허용',
  businessAgeMax: '업력 상한', businessAgeMin: '업력 하한', employeeMax: '근로자 상한', employeeMin: '근로자 하한',
  revenueMax: '매출 상한', revenueMin: '매출 하한', representativeAgeMax: '대표자 연령 상한', representativeAgeMin: '대표자 연령 하한',
};

export function predict(item) {
  const p = item.program;
  const doc = { status: 'ok', ...analyzeDocText(item.text, { regions: p.targetRegionsInferred ? null : p.targetRegions }) };
  const q = applyDoc(p, doc);
  // 예비창업자 판정은 엔진(app.js)과 같은 근거로: 명시 허용·불가 → 대상 유형 목록(목록에 표기가 있을 때만)
  const tbt = q.targetBusinessType || [];
  const pre = q.preStartupOnly || q.preStartupAllowed === true ? 'yes'
    : q.preStartupAllowed === false ? 'no'
      : tbt.length && !q.targetBusinessTypeInferred ? (tbt.includes('예비창업자') ? 'yes' : 'no') : null;
  const out = { regions: q.targetRegions || ['전국'], districts: q.targetDistricts || [], preStartup: pre };
  for (const k of NUM) out[k] = q[k] ?? null;
  return out;
}

const sameSet = (a, b) => { const x = [...new Set(a || [])].sort(), y = [...new Set(b || [])].sort(); return x.length === y.length && x.every((v, i) => v === y[i]); };

export function evaluate(set) {
  const rows = set.map((it) => ({ it, pred: predict(it) }));
  const res = {};
  // 대상 지역: 전 공고 대상. 틀린 경우를 두 갈래로 — 과대(대상이 아닌 지역 기업에 '충족') / 과소(대상 기업에 '대상 아님')
  {
    let ok = 0, over = 0, under = 0; const errors = [];
    let n = 0;
    for (const { it, pred } of rows) {
      const g = it.gold.regions, p = pred.regions;
      if (!g) continue; // 정답을 정할 수 없는 공고는 제외
      n++;
      if (sameSet(g, p)) { ok++; continue; }
      const gN = g.includes('전국'), pN = p.includes('전국');
      // 과소: 정답 지역 일부를 빠뜨림(그 지역 기업이 '대상 아님'으로 잘못 걸러짐). 그 외는 과대(전국 간주 등)
      const missing = gN ? !pN : g.some((r) => !pN && !p.includes(r));
      if (missing) under++; else over++;
      errors.push({ id: it.id, name: it.program.programName, gold: g, pred: p });
    }
    res.regions = { n, accuracy: ok / n, over, under, errors };
  }
  // 시·군·구
  {
    let ok = 0; const errors = [];
    for (const { it, pred } of rows) { if (sameSet(it.gold.districts || [], pred.districts)) ok++; else errors.push({ id: it.id, name: it.program.programName, gold: it.gold.districts || [], pred: pred.districts }); }
    res.districts = { n: rows.length, accuracy: ok / rows.length, errors };
  }
  // 값 항목: 정밀도 = 맞게 뽑은 수 / 뽑은 수, 재현율 = 맞게 뽑은 수 / 정답이 있는 수(무작위 층만)
  for (const k of ['preStartup', ...NUM]) {
    let predicted = 0, correct = 0, goldN = 0, found = 0, goldAll = 0, foundAll = 0; const errors = [];
    for (const { it, pred } of rows) {
      const g = it.gold[k] ?? null, p = pred[k] ?? null;
      if (p != null) { predicted++; if (p === g) correct++; else errors.push({ id: it.id, name: it.program.programName, gold: g, pred: p }); }
      if (it.stratum === 'random' && g != null) { goldN++; if (p === g) found++; }
      if (g != null) { goldAll++; if (p === g) foundAll++; }
    }
    res[k] = { predicted, correct, precision: predicted ? correct / predicted : null, goldInRandom: goldN, foundInRandom: found, recall: goldN ? found / goldN : null, goldAll, foundAll, misses: rows.filter(({ it, pred }) => it.gold[k] != null && pred[k] !== it.gold[k]).map(({ it, pred }) => ({ id: it.id, name: it.program.programName, gold: it.gold[k], pred: pred[k] })), errors };
  }
  return { n: rows.length, random: set.filter((x) => x.stratum === 'random').length, fields: res };
}

// CI 기준(v3.12 측정값으로 고정 — v3.11: 지역 85%·시군구 90%·틀린 추출 3건): 규칙을 바꿀 때 이보다 나빠지면 실패한다. 개선되면 기준을 올린다.
//   지역·시군구 정확도 하한, 값 항목 '틀린 추출' 총수 상한, '맞힌 추출' 총수 하한
export const BASELINE = { regionsAccuracy: 0.91, districtsAccuracy: 0.94, maxWrong: 0, minCorrect: 59 };

export function check(r) {
  const bad = [];
  const fs_ = r.fields;
  if (fs_.regions.accuracy < BASELINE.regionsAccuracy - 1e-9) bad.push(`지역 정확도 ${(fs_.regions.accuracy * 100).toFixed(0)}% < ${BASELINE.regionsAccuracy * 100}%`);
  if (fs_.districts.accuracy < BASELINE.districtsAccuracy - 1e-9) bad.push(`시·군·구 정확도 ${(fs_.districts.accuracy * 100).toFixed(0)}% < ${BASELINE.districtsAccuracy * 100}%`);
  const keys = ['preStartup', ...NUM];
  const wrong = keys.reduce((a, k) => a + fs_[k].errors.length, 0);
  const correct = keys.reduce((a, k) => a + fs_[k].correct, 0);
  if (wrong > BASELINE.maxWrong) bad.push(`틀린 추출 ${wrong}건 > ${BASELINE.maxWrong}건`);
  if (correct < BASELINE.minCorrect) bad.push(`맞힌 추출 ${correct}건 < ${BASELINE.minCorrect}건`);
  return { ok: !bad.length, bad, wrong, correct };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const set = JSON.parse(fs.readFileSync(new URL('./fixtures/eval-set.json', import.meta.url), 'utf8'));
  const r = evaluate(set);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  const pct = (x) => (x == null ? '  -  ' : `${(x * 100).toFixed(0).padStart(3)}%`);
  console.log(`검증 세트 ${r.n}건 (무작위 ${r.random} · 추출 ${r.n - r.random})`);
  console.log(`${LABEL.regions}: 정확도 ${pct(r.fields.regions.accuracy)} (과대 ${r.fields.regions.over} · 과소 ${r.fields.regions.under})`);
  console.log(`${LABEL.districts}: 정확도 ${pct(r.fields.districts.accuracy)}`);
  for (const k of ['preStartup', ...NUM]) {
    const f = r.fields[k];
    console.log(`${LABEL[k].padEnd(12)} 정밀도 ${pct(f.precision)} (${f.correct}/${f.predicted})  재현율(무작위) ${pct(f.recall)} (${f.foundInRandom}/${f.goldInRandom})  전체 ${f.foundAll}/${f.goldAll}`);
  }
  if (process.argv.includes('--check')) {
    const c = check(r);
    if (!c.ok) { console.error('기준 미달:', c.bad.join(', ')); process.exit(1); }
    console.log(`기준 충족 (틀린 추출 ${c.wrong}건 · 맞힌 추출 ${c.correct}건)`);
  }
}
