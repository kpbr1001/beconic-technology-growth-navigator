// BECONIC 31 연결(다음 진단·함께 준비·공통 서류)과 상담 메일 초안 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataSync, AS_OF } from './helpers.mjs';
import { buildReport } from '../src/model.js';
import { consultMailto } from '../src/views.js';

const D = loadDataSync();
const L = D.links;
const CORP = { biz_status: 'corporation', company_size: 'small', is_sme: 'yes', founded_on: '2020-01-01' };
const rep = (answers, selected) => buildReport(D, { answers, selected, docStatus: {}, asOf: AS_OF, flow: 'B' });
const codes = (R) => R.connect.next.map((n) => n.code);

test('LINK-01 연결 데이터: 모든 규칙의 도구가 존재하고 주소는 https BECONIC 서비스', () => {
  L.rules.forEach((r) => assert.ok(L.tools[r.tool], `${r.id} 도구 ${r.tool} 없음`));
  Object.values(L.tools).forEach((t) => assert.match(t.url, /^https:\/\/beconic-[a-z0-9-]+\.netlify\.app\/$/));
  assert.ok(!Object.values(L.tools).some((t) => t.url.includes('certification')), '자기 자신으로 연결 금지');
});

test('LINK-02 인증 간 준비 순서 안내는 근거 문구가 출처 발췌에 있음', () => {
  L.strategy.forEach((x) => assert.ok(x.source_refs.some((r) => D.sourceMap[r].excerpt_or_section_ref.includes(x.quote)), `${x.id} 근거 없음`));
});

test('LINK-03 예비창업자: 창업 준비 가이드가 먼저, 기업성장 종합진단(G)은 추천하지 않음', () => {
  const R = rep({ biz_status: 'pre', purposes: ['finance'] }, ['VEN']);
  assert.equal(codes(R)[0], 'S5');
  assert.ok(!codes(R).includes('G'));
  assert.ok(!codes(R).includes('F2'), '기창업자용 대출·보증 진단 제외');
});

test('LINK-04 기창업자: 선택 인증에 맞는 다음 진단(벤처→사업계획서, 이노비즈→기술, 메인비즈→재무), 최대 3개·중복 없음', () => {
  assert.deepEqual(codes(rep(CORP, ['VEN', 'INNO', 'MAIN'])), ['S4', 'TECH', 'F1']);
  const R = rep({ ...CORP, purposes: ['finance'] }, ['VEN']);
  assert.deepEqual(codes(R), ['S4', 'F2', 'MATCH']);
  [rep(CORP, ['RNDI']), rep({}, ['EU-CE'])].forEach((x) => {
    assert.ok(x.connect.next.length >= 1 && x.connect.next.length <= L.max_show);
    assert.equal(new Set(codes(x)).size, codes(x).length);
  });
});

test('LINK-05 함께 준비: 벤처+연구소 선택 시 준비 순서, 연구조직 없음이면 안내, 공통 서류는 2개 이상 인증에만', () => {
  const both = rep(CORP, ['VEN', 'RNDI']);
  assert.ok(both.connect.strategy.some((s) => s.id === 'X-RND-VEN-BOTH'));
  assert.ok(rep({ ...CORP, rnd_unit: 'none' }, ['VEN']).connect.strategy.some((s) => s.id === 'X-RND-VEN'));
  assert.equal(rep(CORP, ['VEN']).connect.commonDocs.length, 0);
  const three = rep(CORP, ['VEN', 'INNO', 'MAIN']);
  assert.ok(three.connect.commonDocs.length >= 2);
  three.connect.commonDocs.forEach((d) => assert.ok(d.schemes.length >= 2));
  assert.ok(three.connect.commonDocs.some((d) => d.name === '법인등기부등본'));
});

test('LINK-06 상담 메일 초안: 결과·문서번호 포함, 회사명 등 입력값은 넣지 않음', () => {
  const R = rep({ ...CORP, company_name: '비밀회사' }, ['VEN', 'INNO']);
  const m = consultMailto(R);
  assert.ok(m.startsWith('mailto:start@gven.kr?subject='));
  const body = decodeURIComponent(m.split('&body=')[1]);
  assert.ok(body.includes(R.meta.doc_id) && body.includes('벤처기업확인'));
  assert.ok(!body.includes('비밀회사'));
});
