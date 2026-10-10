import { start } from './app/legacy-ui';
import { BUILD_INFO, versionLabel } from './build-info';
import { ISSUER } from './reports/report-model';

// 푸터 등 data-build-version 요소에 버전·업데이트 일자 표기
document.querySelectorAll<HTMLElement>('[data-build-version]').forEach((el) => {
  el.textContent = versionLabel();
  if (BUILD_INFO.commit) el.title = `빌드 ${BUILD_INFO.commit}`;
});

// 푸터 발행사 정보: 보고서 표지·쪽 하단과 같은 출처(ISSUER)에서 채운다(정적 HTML은 스크립트 전 기본값)
const certNo = /제\S+호/.exec(ISSUER.certification)?.[0] ?? '';
const issuerText: Record<string, string> = {
  company: ISSUER.company, address: ISSUER.address, phone: ISSUER.phone, email: ISSUER.email, web: ISSUER.web, certNo,
  copyright: `© ${BUILD_INFO.date.slice(0, 4)} ${ISSUER.company}. All rights reserved.`,
};
const issuerHref: Record<string, string> = { phone: `tel:${ISSUER.phone}`, email: `mailto:${ISSUER.email}`, web: `https://${ISSUER.web}` };
document.querySelectorAll<HTMLElement>('[data-issuer]').forEach((el) => {
  const k = el.dataset.issuer ?? '';
  if (issuerText[k]) el.textContent = issuerText[k];
  if (issuerHref[k]) el.setAttribute('href', issuerHref[k]);
});

start();
