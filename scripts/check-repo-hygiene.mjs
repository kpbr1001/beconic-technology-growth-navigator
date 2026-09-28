// 저장소 위생 검사: 커밋된 파일에 .env·비밀키·로드맵 PDF 원본·대용량 파일이 없는지 확인한다.
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const MAX_BYTES = 2 * 1024 * 1024;
const SECRET = [
  /sk-ant-[A-Za-z0-9_-]{10,}/, /sk-[A-Za-z0-9]{32,}/, /pa-[A-Za-z0-9_-]{30,}/, /AKIA[0-9A-Z]{16}/,
  /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /^(ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|EMBEDDING_API_KEY)=\S+/m,
];
const problems = [];
for (const f of files) {
  if (/(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example')) problems.push(`.env 파일 커밋: ${f}`);
  if (/\.(pdf|ai|psd|zip)$/i.test(f)) problems.push(`원본·대용량 형식 파일 커밋: ${f}`);
  const size = statSync(f).size;
  if (size > MAX_BYTES) problems.push(`2MB 초과 파일: ${f} (${(size / 1048576).toFixed(1)}MB)`);
  if (size < MAX_BYTES && !f.endsWith('package-lock.json') && !/\.(png|jpg|jpeg|webp)$/i.test(f)) {
    const text = readFileSync(f, 'utf8');
    for (const p of SECRET) if (p.test(text)) problems.push(`비밀키 패턴 ${p}: ${f}`);
  }
}
if (problems.length) {
  console.error('❌ 저장소 위생 검사 실패\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`✅ 저장소 위생 검사 통과 (${files.length}개 파일: .env·비밀키·PDF 원본·2MB 초과 없음)`);
