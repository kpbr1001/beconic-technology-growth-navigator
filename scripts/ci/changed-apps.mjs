// CI E2E 대상 앱 고르기 — PR이면 바뀐 폴더의 앱만, main push·수동 실행이면 전체.
// 출력(GITHUB_OUTPUT 형식): apps=["prestartup",...]
// 공통 파일(.github/·package.json·package-lock.json·scripts/ci/)이 바뀌면 전체. 문서(.md)만 바뀐 앱은 제외.
import { execFileSync } from 'node:child_process';

export const APPS = ['tech', 'hr', 'growth', 'grants', 'ir', 'prestartup', 'esg', 'finance', 'psf', 'certification'];
const FOLDER_APPS = APPS.filter((a) => a !== 'tech');
const SHARED = [/^\.github\//, /^package(-lock)?\.json$/, /^scripts\/ci\//];

export function appsFor(files) {
  const out = new Set();
  for (const f of files) {
    if (!f) continue;
    if (SHARED.some((re) => re.test(f))) return [...APPS];
    if (/\.md$/i.test(f)) continue;
    const top = f.split('/')[0];
    out.add(FOLDER_APPS.includes(top) ? top : 'tech');   // 앱 폴더 밖 = 루트의 기술진단(src·index.html·tests 등)
  }
  return APPS.filter((a) => out.has(a));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { EVENT_NAME, BASE_SHA, HEAD_SHA } = process.env;
  let apps = [...APPS];
  if (EVENT_NAME === 'pull_request' && BASE_SHA && HEAD_SHA) {
    try {
      const diff = execFileSync('git', ['diff', '--name-only', `${BASE_SHA}...${HEAD_SHA}`]).toString().split('\n');
      apps = appsFor(diff);
    } catch (e) { console.error('diff 실패 → 전체 실행', String(e)); }
  }
  console.log(`apps=${JSON.stringify(apps)}`);
  console.error(`E2E 대상: ${apps.length ? apps.join(', ') : '없음(문서만 변경)'}`);
}
