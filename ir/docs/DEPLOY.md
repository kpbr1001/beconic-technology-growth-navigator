# 배포 가이드 — beconic-diagnosis-ir.netlify.app

1. Netlify → Add new site → Import from Git → `kpbr1001/beconic-technology-growth-navigator`
2. **Base directory: `ir`** (나머지 빌드 설정은 `ir/netlify.toml`이 우선: `npm run build`, publish `dist`, Node 22)
3. Site name: `beconic-diagnosis-ir` → https://beconic-diagnosis-ir.netlify.app
4. 환경 변수·API 키 없음(서버 함수 없음).
5. 배포 후 확인
   - https://beconic-diagnosis-ir.netlify.app/assets/og-ir-diagnosis-1200x630.jpg 열림
   - 카카오 공유 디버거 https://developers.kakao.com/tool/debugger/sharing 에 URL 입력 → **캐시 초기화** → 미리보기 확인
   - OG 이미지를 바꾸면 `index.html`의 `?v=` 숫자를 올린 뒤 다시 캐시 초기화

보안 헤더: CSP(`script-src 'self'`, 인라인 스크립트 없음), `X-Frame-Options: DENY`, `frame-ancestors 'none'`.

## 현재 배포 상태 (2026-11-01)
- Netlify 사이트가 GitHub 저장소와 연결됨(Production branch `main`, Base directory `ir`).
- PR 머지 전까지는 main에 `ir/`가 없으므로, 저장소 최상위에서 직접 업로드해 배포했다(deploy `6ae6aa421984ed3b8f6504b1`). 업로드도 Base directory `ir` 기준이므로 **반드시 저장소 최상위에서** 실행한다.
- 수동 업로드에도 보안 헤더가 적용되도록 빌드가 `netlify.toml`의 `[[headers]]`로 `dist/_headers`를 만든다.
- OG 이미지: 대표 제공 배너 `assets/og-ir-banner-1200x630.jpg?v=101` (결정 기록은 v2-migration.md).
