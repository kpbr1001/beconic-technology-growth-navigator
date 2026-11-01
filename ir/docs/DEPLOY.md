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
