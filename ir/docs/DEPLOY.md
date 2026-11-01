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
- 사이트는 GitHub 미연결 상태이며, `ir/` 폴더를 Netlify에 직접 업로드해 Netlify에서 빌드했다(deploy `6ae6a875f8f7dac3556a7729`).
- 수동 업로드에도 보안 헤더가 적용되도록 빌드가 `netlify.toml`의 `[[headers]]`로 `dist/_headers`를 만든다.
- 이후 변경을 자동 배포하려면 위 1~3단계로 저장소를 연결하고 PR을 main에 머지한다.
