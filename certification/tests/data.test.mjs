// 데이터 무결성·가짜 기준 차단 테스트 — 스키마, 출처 연결, 근거 문구, 조건식, 분류 축
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS } from '../src/engine.js';
import { assertExpr } from '../src/conditions.js';
import { searchSchemes, suggest } from '../src/search.js';
import { loadDataSync, readJson } from './helpers.mjs';

const D = loadDataSync();

// JSON Schema 부분 검증기(type·required·enum·pattern·minItems·minLength·items·properties) — 외부 의존성 없이
function validate(schema, v, at = '$', errs = []) {
  if (schema.type) {
    const types = [].concat(schema.type);
    const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) errs.push(`${at}: type ${t} ∉ ${types}`);
  }
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${at}: ${JSON.stringify(v)} ∉ enum`);
  if (typeof v === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) errs.push(`${at}: pattern ${schema.pattern}`);
    if (schema.minLength && v.length < schema.minLength) errs.push(`${at}: too short`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems && v.length < schema.minItems) errs.push(`${at}: minItems`);
    if (schema.items) v.forEach((x, i) => validate(schema.items, x, `${at}[${i}]`, errs));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    (schema.required || []).forEach((k) => { if (!(k in v)) errs.push(`${at}: required ${k}`); });
    Object.entries(schema.properties || {}).forEach(([k, s]) => { if (k in v) validate(s, v[k], `${at}.${k}`, errs); });
  }
  return errs;
}

function walkNodes(n, fn) { fn(n); (n.children || []).forEach((c) => walkNodes(c, fn)); if (n.cond) walkNodes(n.cond, fn); if (n.then) walkNodes(n.then, fn); }
const allPacks = Object.values(D.packs);
const allLeaves = () => allPacks.flatMap((p) => p.pathways.flatMap((pw) => { const out = []; walkNodes(pw.root, (n) => { if (n.type === 'LEAF') out.push({ pack: p, n }); }); return out; }));

test('DATA-01 스키마: 출처·카탈로그·질문·규칙팩', () => {
  const sS = readJson('schemas/source.schema.json'); const cS = readJson('schemas/certification.schema.json');
  const qS = readJson('schemas/question.schema.json'); const rS = readJson('schemas/rule.schema.json');
  const errs = [];
  D.sources.sources.forEach((s) => validate(sS, s, s.source_id, errs));
  D.catalog.schemes.forEach((s) => validate(cS, s, s.scheme_id, errs));
  D.questions.questions.forEach((q) => validate(qS, q, q.question_id, errs));
  allPacks.forEach((p) => {
    validate(rS, p, p.rule_pack_id, errs);
    p.pathways.forEach((pw) => walkNodes(pw.root, (n) => validate(rS.$defs.node, n, `${p.rule_pack_id}/${n.id}`, errs)));
  });
  assert.deepEqual(errs, []);
});

test('DATA-02 ID 유일성', () => {
  const uniq = (arr) => new Set(arr).size === arr.length;
  assert.ok(uniq(D.sources.sources.map((s) => s.source_id)));
  assert.ok(uniq(D.catalog.schemes.map((s) => s.scheme_id)));
  assert.ok(uniq(D.questions.questions.map((q) => q.question_id)));
});

test('DATA-03 자동 판정 제도 ⇔ VERIFIED 규칙팩, 정보형 제도에는 규칙팩 없음', () => {
  D.catalog.schemes.forEach((s) => {
    if (s.diagnosable) {
      assert.ok(D.packs[s.scheme_id], `${s.scheme_id} 규칙팩 없음`);
      assert.equal(D.packs[s.scheme_id].review_status, 'VERIFIED');
      assert.equal(s.verified_status, 'VERIFIED');
    } else {
      assert.equal(D.packs[s.scheme_id], undefined, `${s.scheme_id}는 정보형인데 규칙팩이 있음`);
      assert.notEqual(s.verified_status, 'VERIFIED');
    }
  });
});

test('DATA-04 모든 원자요건: 화이트리스트 판정 함수·존재하는 질문·존재하는 출처', () => {
  allLeaves().forEach(({ pack, n }) => {
    assert.ok(CHECKS[n.check], `${pack.rule_pack_id}/${n.id} 판정 함수 ${n.check}`);
    (n.source_refs || []).forEach((r) => assert.ok(D.sourceMap[r], `${n.id} 출처 ${r} 없음`));
    const args = n.args || {};
    ['q', 'invest', 'capital', 'culture', 'spend', 'revenue', 'industry', 'ratio_q'].forEach((k) => { if (args[k]) assert.ok(D.questionMap[args[k]], `${n.id} 질문 ${args[k]} 없음`); });
  });
});

const NUMERIC = ['gte', 'lt', 'years_since_gte', 'biz_age_gte', 'venture_invest_ratio', 'venture_rd_ratio', 'rnd_institute_staff', 'rnd_space'];
// 근거 문구 검사기: 문구가 출처 발췌에 있고, 규칙의 숫자가 문구에 있어야 한다(문구는 맞고 숫자만 바꾼 가짜 기준 차단)
function quoteErrors(leaf) {
  const errs = [];
  if (!leaf.quote) return [`${leaf.id} 근거 문구 없음`];
  if (!leaf.source_refs.some((r) => D.sourceMap[r] && D.sourceMap[r].excerpt_or_section_ref.includes(leaf.quote))) errs.push(`${leaf.id} 근거 문구가 출처 발췌에 없음`);
  const a = leaf.args || {};
  const money = (v) => (v % 10000 === 0 ? `${v / 10000}억원` : v % 1000 === 0 ? `${v / 1000}천만원` : `${v}만원`);
  const forms = [];
  if (a.min !== undefined) forms.push(a.unit === '만원' ? money(a.min) : `${a.min}${a.unit || ''}`);
  if (a.max !== undefined) forms.push(`${a.max.toLocaleString('en-US')}${a.unit || ''}`);
  if (a.years !== undefined) forms.push(`${a.years}년`);
  if (a.pct !== undefined) forms.push(`${a.pct}%`);
  if (a.pct_culture !== undefined) forms.push(`${a.pct_culture}%`);
  if (a.staff) {
    const k = a.staff;
    forms.push(`소기업 ${k.small}명`, `${k.startup_years}년까지 ${k.small_startup}명`, `중기업 ${k.medium}명`,
      `${k.transition_years}년까지 ${k.medium_transition}명`, `벤처기업 ${k.venture_or_founder}명`, `중견기업 ${k.midsize}명`, `그 밖 ${k.large}명`);
  }
  forms.forEach((f) => { if (!leaf.quote.includes(f)) errs.push(`${leaf.id}: 규칙 숫자 '${f}'가 근거 문구에 없음`); });
  return errs;
}

test('DATA-05 가짜 기준 0건: 숫자 기준 요건은 근거 문구가 출처 발췌에 있고 숫자가 일치', () => {
  const leaves = allLeaves().map((x) => x.n).filter((l) => NUMERIC.includes(l.check));
  assert.ok(leaves.length >= 10);
  assert.deepEqual(leaves.flatMap(quoteErrors), []);
});

test('DATA-05c 숫자 판정 함수는 기준값을 규칙 데이터(args)로 받는다 — 코드 속 기준값 금지', () => {
  allLeaves().map((x) => x.n).filter((l) => NUMERIC.includes(l.check)).forEach((l) => {
    assert.ok(l.args && Object.keys(l.args).length > 0, `${l.id}: args가 비어 있음(기준값이 코드에 숨어 있을 수 있음)`);
  });
  const staff = allLeaves().map((x) => x.n).find((l) => l.id === 'RNDI-STAFF');
  ['small', 'startup_years', 'small_startup', 'medium', 'transition_years', 'medium_transition', 'venture_or_founder', 'midsize', 'large']
    .forEach((k) => assert.ok(Number.isInteger(staff.args.staff[k]), `RNDI-STAFF staff.${k} 없음`));
  const dept = allLeaves().map((x) => x.n).find((l) => l.id === 'RNDD-SPACE');
  assert.ok(dept.args.partition_industries.length > 0);
  dept.args.partition_industries.forEach((c) => assert.ok(D.questionMap.industry.response_options.some((o) => o.value === c), `업종 코드 ${c} 없음`));
  assert.ok(D.sourceMap['S-RND-RULE'].excerpt_or_section_ref.includes('정보서비스·SW개발공급업 연구개발부서 포함'));
});

test('DATA-05b 검사기 자체 검증: 기준 숫자·문구를 바꾼 변조 규칙을 잡아냄', () => {
  const orig = allLeaves().map((x) => x.n).find((l) => l.id === 'VEN-INV-AMT');
  assert.ok(quoteErrors({ ...orig, args: { ...orig.args, min: 4000 } }).length > 0, '숫자 변조');
  assert.ok(quoteErrors({ ...orig, quote: '투자금액 합계 4천만원 이상', args: { ...orig.args, min: 4000 } }).length > 0, '문구·숫자 동시 변조');
  assert.ok(quoteErrors({ ...orig, quote: undefined }).length > 0, '문구 삭제');
  const staff = allLeaves().map((x) => x.n).find((l) => l.id === 'RNDI-STAFF');
  assert.deepEqual(quoteErrors(staff), [], '연구소 기준표 원본은 통과');
  assert.ok(quoteErrors({ ...staff, args: { ...staff.args, staff: { ...staff.args.staff, small: 2 } } }).length > 0, '연구소 인원 변조');
  assert.ok(quoteErrors({ ...staff, args: { ...staff.args, staff: { ...staff.args.staff, large: 8 } } }).length > 0, '연구소 인원 변조(그 밖)');
  const debt = allLeaves().map((x) => x.n).find((l) => l.id === 'MAIN-X-DEBT');
  assert.ok(quoteErrors({ ...debt, args: { ...debt.args, max: 2000 } }).length > 0);
});

test('DATA-06 업종별 연구개발비 비율표가 공식 게시 이미지 판독값(출처 발췌)과 일치', () => {
  const table = D.packs.VEN.tables.rd_ratio;
  const ex = D.sourceMap[table.source_ref].excerpt_or_section_ref;
  const code = { pharma_21: '(21)', machinery_29: '(29, 2918 제외)', computer_263: '(263)', office_2918: '(2918)', electric_28: '(28)', semi_261_262: '(261,262)', medical_27: '(27)', telecom_61: '(61)', software_582: '(582)', programming_62: '(62)', info_63: '(63)', retail_45_47: '(45~47)' };
  Object.entries(code).forEach(([k, c]) => {
    const seg = ex.split(' · ').find((x) => x.includes(c));
    assert.ok(seg, `${k} 발췌 없음`);
    assert.ok(seg.endsWith(table.rows[k].join('/')), `${k}: 표 ${table.rows[k]} ≠ 발췌 ${seg}`);
  });
});

test('DATA-07 VERIFIED 규칙의 판정 요건은 접속 확인된 출처(OK/OK_IMAGE)에 근거', () => {
  allLeaves().forEach(({ n }) => {
    if (n.check === 'unverified' || n.kind === 'assessment') return;
    assert.ok(n.source_refs.some((r) => ['OK', 'OK_IMAGE'].includes(D.sourceMap[r].access_status)), `${n.id}`);
  });
});

test('DATA-08 조건식(show_when·required_when·applies_when) 문법', () => {
  D.questions.questions.forEach((q) => { assertExpr(q.show_when); assertExpr(q.required_when); });
  D.catalog.schemes.forEach((s) => s.readiness_items.forEach((i) => assertExpr(i.applies_when)));
});

test('DATA-09 분류 축: 국내 탭 ≠ 법적 관할 (ISO는 국제 표준, 한국 기관이 인증해도 국제로 분류)', () => {
  const iso = D.schemeMap.ISO9001;
  assert.equal(iso.display_group, 'international');
  assert.equal(iso.standard_origin, 'ISO');
  assert.equal(iso.scheme_type, 'management_system_certification');
  assert.match(iso.issuing_authority, /ISO가 직접 발급하지 않음/);
  assert.equal(D.schemeMap.VEN.scheme_type, 'company_confirmation');
  assert.equal(D.schemeMap['EU-CE'].scheme_type, 'product_conformity_assessment');
  assert.equal(D.schemeMap['US-FDA-FOOD'].scheme_type, 'registration');
  assert.equal(D.schemeMap['US-FDA-DEV'].scheme_type, 'authorization_clearance_approval');
  // 해외 제품 규제는 '의무'로 확정 표기하지 않음
  ['EU-CE', 'US-FDA-DEV', 'US-FDA-FOOD', 'US-FCC', 'KC-SAFETY', 'KC-RADIO', 'HACCP'].forEach((id) => assert.equal(D.schemeMap[id].mandatory_status, 'needs_review', id));
});

test('DATA-10 오해 유발 표현 금지(인증서 일반화·보장 문구)', () => {
  const text = JSON.stringify(D.catalog);
  ['100% 인증', '정부가 보장', '취득 확률', '무조건 세액공제', '합격률'].forEach((w) => assert.ok(!text.includes(w), w));
  ['EU-CE', 'US-FDA-DEV'].forEach((id) => {
    const s = D.schemeMap[id];
    assert.ok(!/(CE|FDA) 인증서(를|가)? (발급|받)/.test(s.what + s.scope_note));
  });
});

test('DATA-11 검색: 별칭·약어·목적어·부분입력·0건 제안', () => {
  const ids = (q, f) => searchSchemes(D.catalog.schemes, q, f).map((r) => r.scheme.scheme_id);
  assert.equal(ids('벤처')[0], 'VEN');
  assert.ok(ids('R&D').includes('RNDI'));
  assert.ok(ids('연구소').includes('RNDI'));
  assert.ok(ids('ISO').includes('ISO9001'));
  assert.ok(ids('품질').includes('ISO9001'));
  assert.ok(ids('KC').includes('KC-SAFETY'));
  assert.ok(ids('유럽 수출').includes('EU-CE'));
  assert.ok(ids('미국 의료기기').includes('US-FDA-DEV'));
  assert.ok(ids('이노').includes('INNO'));
  assert.ok(ids('ＩＳＯ　９００１').includes('ISO9001'), '전각 문자 NFKC');
  assert.deepEqual(ids('벤처', { group: 'international' }), []);
  assert.deepEqual(ids('zzqq없는제도'), []);
  assert.ok(suggest(D.catalog.schemes, '이노비스').some((s) => s.scheme_id === 'INNO'));
  assert.deepEqual(suggest(D.catalog.schemes, 'zzqq없는제도'), []);
});

test('DATA-12 레드팀: 한국 회사의 ISO 인증이 국내/해외 필터에서 사라지지 않음(전체·국제 탭에서 검색됨)', () => {
  const r1 = searchSchemes(D.catalog.schemes, 'ISO 9001', { group: 'all' }).map((r) => r.scheme.scheme_id);
  const r2 = searchSchemes(D.catalog.schemes, 'ISO 9001', { group: 'international' }).map((r) => r.scheme.scheme_id);
  assert.ok(r1.includes('ISO9001') && r2.includes('ISO9001'));
});

test('DATA-09 사후관리·도움말의 법령 조항·숫자는 출처가 있거나 미확보로 표시', () => {
  const ARTICLE = /제\d+조|\d+월 \d+일|\d+만원|\d+점/;
  D.catalog.schemes.filter((s) => s.diagnosable).forEach((s) => {
    const o = s.ongoing;
    assert.ok(o && o.text, `${s.scheme_id} 사후관리 안내 없음`);
    if (o.unverified) assert.ok(!ARTICLE.test(o.text), `${s.scheme_id}: 미확보 안내에 조항·숫자를 단정하면 안 됨`);
    else {
      assert.ok(o.quote && o.source_refs.some((r) => D.sourceMap[r] && D.sourceMap[r].excerpt_or_section_ref.includes(o.quote)), `${s.scheme_id}: 사후관리 근거 문구가 출처에 없음`);
      (o.text.match(/제\d+조[①-⑩]?/g) || []).forEach((art) => assert.ok(o.quote.includes(art), `${s.scheme_id}: 조항 ${art}가 근거 문구에 없음`));
    }
    if (s.help_text && ARTICLE.test(s.help_text)) assert.fail(`${s.scheme_id} 도움말에 출처 없는 조항·숫자: ${s.help_text}`);
  });
});

test('HC-01 판정 엔진·모델에 법정 기준값·업종 코드·제도별 법령 문구 하드코딩 금지', async () => {
  const { readFileSync } = await import('node:fs');
  const engine = readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/model.js', import.meta.url), 'utf8');
  assert.ok(!/T\.add\(\d/.test(engine), '엔진에 연구전담요원 기준 숫자');
  assert.ok(!/'(software_582|info_63|programming_62)'/.test(engine), '엔진에 업종 코드');
  assert.ok(!/case '(INNO|MAIN|RNDI|RNDD|VEN)'/.test(model), '모델에 제도별 문구 분기');
});

test('DATA-10 공식 수수료·처리기간: 금액·기간은 공식 원문 문구와 한 글자도 다르지 않고, 없으면 미확보로 표시', () => {
  const won = (n) => `${n.toLocaleString('en-US')}원`;
  const man = (n) => [`${n / 10000}만원`, `${n / 10000}만 원`];
  D.catalog.schemes.filter((s) => s.diagnosable).forEach((s) => {
    ['fees', 'processing'].forEach((k) => {
      const f = s[k];
      assert.ok(f, `${s.scheme_id} ${k} 없음`);
      if (f.unverified) { assert.ok(!/\d+원|\d+일 이내|\d+주/.test(f.text), `${s.scheme_id} 미확보인데 숫자 단정`); return; }
      f.items.forEach((it) => {
        const src = D.sourceMap[it.source_ref];
        assert.ok(src && src.excerpt_or_section_ref.includes(it.quote), `${s.scheme_id} ${it.label}: 근거 문구가 출처에 없음`);
        if (k === 'fees') {
          assert.ok(it.quote.includes(won(it.total)) || man(it.total).some((m) => it.quote.includes(m)), `${s.scheme_id} ${it.label} 금액 ${it.total} 원문 불일치`);
          if (it.gov !== undefined) {
            assert.equal(it.gov + it.company, it.total, `${it.label} 정부지원+기업부담 ≠ 합계`);
            assert.ok(it.quote.includes(won(it.gov)) && it.quote.includes(won(it.company)));
          }
        } else {
          if (it.days) assert.ok(it.quote.includes(`${it.days}일 이내`));
          if (it.weeks) assert.ok(it.quote.includes(`${it.weeks}주 이내`));
        }
      });
    });
  });
  const ven = D.catalog.schemes.find((s) => s.scheme_id === 'VEN').fees.items.find((i) => i.label === '벤처투자유형 신규');
  assert.equal(ven.company, 175000);
});

test('DATA-11 인증 목록: 120개 이하, 모든 공식 링크 https, 출처 접속 상태 기록, 분야는 정해진 목록 안', async () => {
  const { FIELDS, fieldOf, levelOf, HTTP_ONLY_HOSTS } = await import('../src/ui.js');
  const all = D.catalog.schemes;
  assert.ok(all.length <= 120, `인증 ${all.length}개 — 상한 120`);
  all.forEach((s) => {
    const u = new URL(s.official_link);
    assert.ok(u.protocol === 'https:' || (u.protocol === 'http:' && HTTP_ONLY_HOSTS.includes(u.hostname)), `${s.scheme_id} 링크는 https(예외 목록만 http)`);
    assert.ok(FIELDS.includes(fieldOf(s)), `${s.scheme_id} 분야 ${fieldOf(s)}`);
    s.sources.forEach((r) => assert.ok(['OK', 'OK_IMAGE', 'BLOCKED', 'UNREACHABLE', 'USER_OK'].includes(D.sourceMap[r].access_status), `${s.scheme_id} 출처 상태`));
    if (levelOf(s) === 'C') assert.ok(!s.fees || s.fees.unverified, `${s.scheme_id}: 정보 안내 인증에 대조 안 된 수수료 숫자 금지`);
    (s.readiness_items || []).forEach((d) => { if (d.link) assert.match(d.link, /^https:\/\//); });
    (s.guides || []).forEach((g) => assert.match(g.url, /^https:\/\//));
  });
});
