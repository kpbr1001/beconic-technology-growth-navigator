// 앱 버전·업데이트 일자: 빌드 시 vite.config.ts가 package.json 버전과 빌드 날짜(KST)를 주입한다.
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
declare const __BUILD_COMMIT__: string;

export const BUILD_INFO = {
  version: __APP_VERSION__,
  /** YYYY.MM.DD (한국시간) */
  date: __BUILD_DATE__,
  commit: __BUILD_COMMIT__,
} as const;

/** 화면·보고서 공용 표기: "v0.9.3 · 2026.09.28 업데이트" */
export const versionLabel = () => `v${BUILD_INFO.version} · ${BUILD_INFO.date} 업데이트`;
