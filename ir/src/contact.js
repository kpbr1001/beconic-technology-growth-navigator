// 발행사·상담 연락처 — 화면·보고서는 모두 여기서 가져간다(번호·주소를 소스에 직접 쓰지 않음)
export const COMPANY = {
  name: '그로스벤처스 주식회사',
  addr: '서울시 구로구 디지털로27길 24, 209호',
  tel: '02-6124-5960',
  email: 'start@gven.kr',
  web: 'www.beconic.kr',
  webUrl: 'https://www.beconic.kr/',
  cert: '제2025-684호',
};
export const telHref = `tel:${COMPANY.tel.replace(/-/g, '')}`;
