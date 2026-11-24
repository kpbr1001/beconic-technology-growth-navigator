// 화면(index.html)이 보내는 시스템 프롬프트를 그대로 뽑아 서버 허용 목록(lib/allowed-prompts.mjs)으로 만든다.
// 서버는 이 목록과 "글자 하나까지 같은" 시스템 프롬프트만 중계한다 → 화면 밖에서 임의 프롬프트로 키를 쓰는 것을 막는다.
//
//   node scripts/sync-prompts.mjs          # 허용 목록 다시 만들기(화면 프롬프트를 고친 뒤 반드시 실행)
//   node scripts/sync-prompts.mjs --check  # 화면과 허용 목록이 같은지 확인만(다르면 종료 코드 1)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const htmlPath = root + 'index.html';
const outPath = root + 'lib/allowed-prompts.mjs';

/** 화면 HTML에서 프롬프트 조립 코드만 잘라 실행해, 화면이 실제로 만드는 문자열을 얻는다. */
export function extractPrompts(html) {
  const grab = (re, name) => {
    const m = html.match(re);
    if (!m) throw new Error(`index.html 에서 ${name} 코드를 찾지 못했습니다(화면 구조가 바뀌었는지 확인).`);
    return m[0];
  };
  const sys = grab(/const sys = '당신은[\s\S]*?';(?=\s*const reqBody)/, '총평 시스템 프롬프트(sys)');
  const lens = grab(/const SEC_LENS = \{[\s\S]*?\n\s*\};(?=\s*const keys)/, '섹션 관점(SEC_LENS)');
  const keys = grab(/const keys = \[[^\]]*\];/, '섹션 목록(keys)');
  const sysFor = grab(/const sysFor = \(k\) => \{[\s\S]*?\n\s*\};(?=\s*const bodyFor)/, '섹션 시스템 프롬프트(sysFor)');
  const code = `${sys}\n${lens}\n${keys}\n${sysFor}\n({ review: sys, keys, sections: Object.fromEntries(keys.map(k => [k, sysFor(k)])) })`;
  const r = vm.runInNewContext(code, {}, { timeout: 1000 });
  const prompts = { review: r.review, ...r.sections };
  // 화면이 요청하는 max_tokens(총평 1536, PSST(s17) 1280, 나머지 섹션 1024)
  const maxTokens = { review: 1536 };
  for (const k of r.keys) maxTokens[k] = k === 's17' ? 1280 : 1024;
  // 화면의 user 메시지 꼬리말
  const tails = { review: '\n\n위 진단을 종합한 컨설턴트 총평을 작성해 주세요.' };
  for (const k of r.keys) tails[k] = '\n\n위 섹션의 심층 해석을 작성해 주세요.';
  for (const t of new Set(Object.values(tails))) {
    if (!html.includes(t.replace(/\n/g, '\\n'))) throw new Error(`index.html 에서 user 메시지 꼬리말을 찾지 못했습니다: ${t.trim()}`);
  }
  const model = (html.match(/model:'(claude-[a-z0-9-]+)'/) || [])[1];
  if (!model) throw new Error('index.html 에서 모델 이름을 찾지 못했습니다.');
  return { model, prompts, maxTokens, tails };
}

export function render(spec) {
  return `// 자동 생성 파일 — 직접 고치지 마세요. 화면(index.html) 프롬프트를 고쳤다면 \`npm run sync-prompts\` 로 다시 만드세요.
// 서버(claude 함수·claude-stream 엣지 함수)는 아래와 정확히 같은 요청 형식만 Anthropic 으로 중계합니다.
export const ALLOWED = ${JSON.stringify(spec, null, 2)};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const spec = extractPrompts(readFileSync(htmlPath, 'utf8'));
  const out = render(spec);
  if (process.argv.includes('--check')) {
    let cur = '';
    try { cur = readFileSync(outPath, 'utf8'); } catch { /* 없음 */ }
    if (cur !== out) {
      console.error('✗ 화면 프롬프트와 서버 허용 목록이 다릅니다. `npm run sync-prompts` 를 실행하세요.');
      process.exit(1);
    }
    console.log(`✓ 허용 목록 일치 (프롬프트 ${Object.keys(spec.prompts).length}개, 모델 ${spec.model})`);
  } else {
    writeFileSync(outPath, out);
    console.log(`허용 목록 생성: 프롬프트 ${Object.keys(spec.prompts).length}개 (${Object.keys(spec.prompts).join(', ')}), 모델 ${spec.model}`);
  }
}
