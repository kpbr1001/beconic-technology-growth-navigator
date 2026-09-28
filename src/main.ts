import { start } from './app/legacy-ui';
import { BUILD_INFO, versionLabel } from './build-info';

// 푸터 등 data-build-version 요소에 버전·업데이트 일자 표기
document.querySelectorAll<HTMLElement>('[data-build-version]').forEach((el) => {
  el.textContent = versionLabel();
  if (BUILD_INFO.commit) el.title = `빌드 ${BUILD_INFO.commit}`;
});

start();
