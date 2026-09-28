# BECONIC 기업 기술진단 (Technology Growth Navigator)

그로스벤처스 주식회사 · 중소벤처기업부 공식 인증 중소기업상담회사 제2025-684호

- 서비스: https://beconic-diagnosis-tech.netlify.app
- 회사: 서울시 구로구 디지털로27길 24, 209호 · 070-4103-4177 · start@gven.kr · www.beconic.kr

## 구조

```text
public/                     # Netlify publish 디렉터리 (정적 사이트)
├─ index.html               # v0.9 진단 UI + 그로스벤처스 헤더/푸터·OG 메타 (v0.9.1)
└─ assets/
   ├─ gv-shield.svg / gv-shield-white.svg      # 방패 로고 (원본 .ai에서 벡터 추출)
   ├─ gv-logo-en.svg / gv-logo-en-white.svg    # Growth Ventures 가로형 로고
   ├─ og-beconic-tech-diagnosis.jpg            # 카카오톡·SNS 공유 이미지 1200×630
   └─ favicon-32.png, apple-touch-icon.png, icon-512.png
reference/                  # 기준선 원본 v0.9 (수정 금지 — 회귀 비교용)
netlify.toml                # 배포·보안헤더·캐시 설정
.env.example                # 향후 Phase(RAG·Claude API·Supabase) 환경변수 템플릿
```

## 배포 (Netlify)

Project configuration → Build & deploy → Continuous deployment → Link repository

- Repository: `kpbr1001/beconic-technology-growth-navigator`
- Branch: `main` (병합 전에는 작업 브랜치)
- Build command: 비움 / Publish directory: `public`

## 카카오톡 공유 미리보기 갱신

카카오는 OG 정보를 캐시합니다. 이미지·문구 변경 후
https://developers.kakao.com/tool/debugger/sharing 에서 URL 입력 → **캐시 초기화**.

## 로컬 실행

```bash
npx http-server public -p 8787
```
