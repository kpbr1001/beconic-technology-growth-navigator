// 화면 공통 도우미 — 모든 동적 텍스트는 esc()를 거친다(XSS 방지). innerHTML에 넣는 문자열은 여기서만 만든다.
export function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 외부 링크: https만 허용, 새 창 + noopener
export const HTTP_ONLY_HOSTS = ['www.gr.or.kr'];
export function safeUrl(u) {
  try {
    const url = new URL(String(u));
    if (url.protocol === 'https:') return url.href;
    // 보안 연결(https)을 지원하지 않는 공식 기관만 예외(운영사가 브라우저로 확인한 주소)
    return url.protocol === 'http:' && HTTP_ONLY_HOSTS.includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
export function extLink(u, text, cls = '') {
  const href = safeUrl(u);
  if (!href) return `<span class="${esc(cls)}">${esc(text)}</span>`;
  return `<a class="ext ${esc(cls)}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}<span class="sr-only"> (새 창)</span></a>`;
}

const SVG = (path, extra = '') => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${extra}>${path}</svg>`;
export const ICON = {
  pass: SVG('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  fail: SVG('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
  unknown: SVG('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="16.9" r="1.2" fill="#fff"/>'),
  na: SVG('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8 12h8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
  out: SVG('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 11v5.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.3" fill="#fff"/>'),
  arrow: SVG('<path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  back: SVG('<path d="M19 12H6M11 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  search: SVG('<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  doc: SVG('<path d="M7 3h7l5 5v13H7z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5M10 13h6M10 17h6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  flag: SVG('<path d="M6 21V4M6 4h11l-2 4 2 4H6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  shield: SVG('<path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  list: SVG('<path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  target: SVG('<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  route: SVG('<circle cx="6" cy="18" r="2.2" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="18" cy="6" r="2.2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  phone: SVG('<path d="M6.6 3.5l2.6.4 1.2 3.6-1.8 1.4a12 12 0 0 0 6.5 6.5l1.4-1.8 3.6 1.2.4 2.6c-.3 1.5-1.6 2.6-3.1 2.4C10.3 19 5 13.7 4.2 6.6 4 5.1 5.1 3.8 6.6 3.5z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/>'),
  print: SVG('<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M7 14h10v7H7z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>'),
};

// 상태 배지: 아이콘 + 글자(색상만으로 상태를 전달하지 않음)
export function badge(key, text, small = false) {
  return `<span class="badge b-${esc(key)}${small ? ' sm' : ''}">${ICON[key] || ''}<span>${esc(text)}</span></span>`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y}. ${Number(m)}. ${Number(d)}.`;
}

export const GROUP_LABEL = { domestic: '국내', international: '해외·국제' };
export const TYPE_LABEL = {
  company_confirmation: '기업 확인·선정',
  rnd_institute_recognition: '연구조직 인정',
  management_system_certification: '경영시스템 인증',
  product_conformity_assessment: '제품 적합성평가',
  registration: '신고·등록',
  authorization_clearance_approval: '허가·승인',
  other: '기타(정보형)',
};
export const MANDATORY_LABEL = { mandatory: '법정 의무', voluntary: '선택(자율 신청)', needs_review: '제품·시장에 따라 판단 필요' };
export const TARGET_LABEL = { company: '회사', product: '제품', both: '회사·제품' };
export const ACCESS_LABEL = { OK: '원문 확인', OK_IMAGE: '게시 이미지 확인', BLOCKED: '접속 차단(내용 미확인)', UNREACHABLE: '접속 불가(링크 미검증)', USER_OK: '운영사 접속 확인(내용 미대조)', NOT_FOUND: '주소 없음' };

// ── v2: 진단 수준(등급)·분야 ──
// A 자동 판정: 공식 원문 규칙으로 기본요건 판정 / B 요건 체크: 핵심 요건 자가 확인 / C 정보 안내: 무엇·어디서 + 공식 링크
export const LEVEL_LABEL = { A: '자동 판정', B: '요건 체크', C: '정보 안내' };
export function levelOf(s) {
  if (s.diagnosable) return 'A';
  if (s.self_check || s.triage || (s.checklist && s.checklist.length)) return 'B';
  return 'C';
}
export const FIELDS = ['기업 확인', 'R&D·기술', '조달·판로', '품질·안전', '정보보호', 'ESG·사회적가치', '경영시스템', '해외 시장 진입'];
export function fieldOf(s) {
  if (s.field) return s.field;
  if (s.scheme_type === 'rnd_institute_recognition') return 'R&D·기술';
  if (s.scheme_type === 'management_system_certification') return s.display_group === 'international' ? '경영시스템' : '품질·안전';
  if (s.display_group === 'international') return '해외 시장 진입';
  if (s.scheme_type === 'product_conformity_assessment') return '품질·안전';
  return '기업 확인';
}
export const FIELD_TONE = { '기업 확인': '', 'R&D·기술': 'v', '조달·판로': 'o', '품질·안전': 'r', '정보보호': 'n', 'ESG·사회적가치': 'g', '경영시스템': 'n', '해외 시장 진입': 'o' };
export const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
