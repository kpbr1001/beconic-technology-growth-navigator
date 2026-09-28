// 빌드 산출물에 비밀키가 섞이지 않았는지 검사 (마스터 프롬프트 금지사항 8)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{10,}/, // Anthropic
  /SUPABASE_SERVICE_ROLE_KEY/,
  /ANTHROPIC_API_KEY/,
  /EMBEDDING_API_KEY/,
  /VOYAGE_API_KEY/,
  /api\.voyageai\.com/, // 임베딩 호출은 서버 전용 — 브라우저 번들에 들어오면 안 됨
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, // JWT(service role 등)
];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const hits = walk('dist')
  .filter((f) => /\.(js|html|css|json|map)$/.test(f))
  .flatMap((f) => PATTERNS.filter((p) => p.test(readFileSync(f, 'utf8'))).map((p) => `${f}: ${p}`));
if (hits.length) {
  console.error('❌ 번들에서 비밀키 패턴 발견:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('✅ 번들 비밀키 검사 통과');
