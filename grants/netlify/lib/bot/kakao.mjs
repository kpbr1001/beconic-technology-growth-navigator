// ============================================================================
// 카카오 챗봇 허브 — 카카오 i 오픈빌더 스킬(v2.0) 응답을 만든다. 판단은 사용자가 보낸 문장(utterance)만으로 한다.
//   메뉴: 처음 · 지원사업 찾기 · 사업명 검색 · 마감 임박 · 경영진단 · 상담 연결
//   그 밖의 문장: 진단툴 키워드면 해당 툴 카드, 아니면 사업명 검색
// 카카오 제한: 리스트 카드 항목 5개, 캐러셀 10장, 바로가기 버튼 10개(라벨 14자), 카드 설명 230자, 응답 5초
// ============================================================================
import { TOOLS, AREAS } from './tools.mjs';

export const CONTACT = { tel: '070-4103-4177', app: 'https://beconic-grant-matching.netlify.app/' };
const MENU = ['지원사업 찾기', '사업명 검색', '마감 임박', '경영진단', '상담 연결'];
const POPULAR = ['정책자금', '예비창업패키지', '스마트공장', '수출바우처', '희망리턴', '창업'];

const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
// 여러 줄 글(말풍선·카드 설명): 줄바꿈은 살리고 줄 안 공백만 정리, 빈 줄은 최대 1개
const para = (s, n) => { s = String(s || '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const quick = (labels) => labels.slice(0, 10).map((l) => ({ label: cut(l, 14), action: 'message', messageText: l }));
const text = (t) => ({ simpleText: { text: para(t, 1000) } });
const reply = (outputs, quickReplies = quick(MENU)) => ({ version: '2.0', template: { outputs: outputs.slice(0, 3), ...(quickReplies.length ? { quickReplies } : {}) } });
const web = (label, url) => ({ label: cut(label, 14), action: 'webLink', webLinkUrl: url });

/** 한국시간 기준 마감까지 남은 날(오늘 마감 0, 마감일 없으면 null) */
export function ddayKst(end, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(end || ''); if (!m) return null;
  const today = new Date(now + 9 * 3600e3); const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - t0) / 86400e3);
}
const dlText = (p, now) => { const d = ddayKst(p.applicationEnd, now); return d == null ? '예산 소진 시까지' : d === 0 ? '오늘 마감' : `마감 D-${d}`; };
const isUrl = (u) => /^https:\/\//.test(u || '');

function programList(title, list, now, moreLabel) {
  return {
    listCard: {
      header: { title: cut(title, 30) },
      items: list.slice(0, 5).map((p) => ({
        title: cut(p.programName, 36),
        description: cut(`${p.agency || ''} · ${dlText(p, now)}`, 40),
        ...(isUrl(p.originalUrl) ? { link: { web: p.originalUrl } } : {})
      })),
      buttons: [web(moreLabel || '맞춤 매칭 하기', CONTACT.app)]
    }
  };
}
function toolCard(t) {
  const consult = { label: '상담 연결', action: 'message', messageText: '상담 연결' };
  if (!t.url) return { title: cut(t.name, 40), description: para(`${t.desc}\n\n지금은 컨설턴트 상담으로 진행해 드려요.`, 230), buttons: [consult, { label: '전화 상담', action: 'phone', phoneNumber: CONTACT.tel }] };
  return { title: cut(t.name, 40), description: cut(t.desc, 230), buttons: [web('진단 시작', t.url), consult] };
}

/** 사업명 검색: 띄어쓰기 무시, 마감 가까운 순(마감일 없는 공고는 뒤) */
export function searchPrograms(programs, q, now = Date.now()) {
  const k = norm(q); if (k.length < 2) return [];
  const d = (p) => { const x = ddayKst(p.applicationEnd, now); return x == null ? 9999 : x; };
  return programs.filter((p) => norm(p.programName).includes(k)).sort((a, b) => d(a) - d(b));
}

/** 문장 → 스킬 응답. programs: 접수 중·예정 공고(없으면 공고 관련 메뉴는 준비 중 안내) */
export function route(utterance, programs, now = Date.now()) {
  const u = String(utterance || '').trim();
  const n = norm(u);
  if (!n || /^(처음|메뉴|시작|홈|안녕|안녕하세요|hi|hello)$/.test(n)) {
    return reply([text('안녕하세요, 비코닉입니다 🙂\n\n우리 회사에 맞는 지원사업과\n경영진단을 찾아드려요.\n\n아래 버튼을 누르거나\n찾는 사업명을 바로 입력해 주세요.\n예) 정책자금, 수출바우처')]);
  }
  if (n === norm('지원사업 찾기')) {
    return reply([{ basicCard: { title: '우리 회사 맞춤 지원사업 찾기', description: '지역·업종·필요한 지원을 고르면\n지금 신청할 수 있는 사업을 추천해 드려요.\n\n회원가입 없음 · 30초', buttons: [web('맞춤 매칭 시작', CONTACT.app)] } },
      text('많이 찾는 사업은 아래 버튼으로 바로 볼 수 있어요.')], quick([...POPULAR, '처음']));
  }
  if (n === norm('사업명 검색')) return reply([text('찾는 사업명을 입력해 주세요.\n\n예) 정책자금, 예비창업패키지,\n스마트공장, 수출바우처')], quick([...POPULAR, '처음']));
  if (n === norm('마감 임박')) {
    if (!programs) return reply([text('공고 정보를 불러오는 중이에요. 잠시 후 다시 시도해 주세요.')]);
    const soon = programs.map((p) => [p, ddayKst(p.applicationEnd, now)]).filter(([, d]) => d != null && d >= 0 && d <= 7).sort((a, b) => a[1] - b[1]).map(([p]) => p);
    if (!soon.length) return reply([text('이번 주에 마감되는 공고가 없어요.')]);
    return reply([programList(`이번 주 마감 ${soon.length}건 중 5건`, soon, now, '내게 맞는지 확인')]);
  }
  if (n === norm('경영진단') || n === norm('진단')) {
    return reply([text('어떤 고민이 있으세요?\n분야를 고르면 맞는 진단을 안내해 드려요.'),
      { carousel: { type: 'basicCard', items: TOOLS.slice(0, 10).map(toolCard) } }], quick([...AREAS, '처음']));
  }
  if (n === norm('상담 요청합니다')) {
    return reply([text('요청 감사합니다 🙏\n아래 양식을 복사해 채워서 보내주세요.'),
      text('회사명:\n업종/지역:\n관심 사업:\n필요한 도움:\n(사업계획서 / 자격 확인 / 서류 / 발표)\n연락처:'),
      text('평일 09~18시에 담당 컨설턴트가\n이 채팅방으로 답변드려요.')], []);
  }
  if (/^(상담|상담연결|상담원|상담원연결|문의|전화|전화상담|연락처|컨설팅)$/.test(n)) {
    return reply([{ basicCard: { title: '전문 컨설턴트와 상담하기', description: para(`그로스벤처스㈜\n중기부 인증 중소기업상담회사 (제2025-684호)\n\n✔ 사업계획서 작성·검토\n✔ 신청 자격 확인\n✔ 서류 준비·발표 코칭\n\n평일 09~18시 · 시간 외에는 요청을 남겨주세요.`, 230),
      buttons: [{ label: '전화 상담', action: 'phone', phoneNumber: CONTACT.tel }, { label: '요청 남기기', action: 'message', messageText: '상담 요청합니다' }] } }]);
  }
  // 상담 요청 글(앱에서 복사한 요청·전화번호·긴 글)은 검색하지 않고 접수 안내 — 담당자가 1:1 채팅에서 이어서 답변
  const plan = /\[지원사업 신청 도움 요청\]/.test(u) ? (/사업명:\s*([^\n]+)/.exec(u) || [])[1] : null;
  if (plan || /회사명[ \t]*:[ \t]*\S/.test(u) || /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,2}-\d{3,4}-\d{4}/.test(u) || u.length > 60) {
    return reply([text(`상담 요청이 접수됐어요. 감사합니다 🙂${plan ? `\n\n· 사업: ${cut(plan, 60)}` : ''}\n\n평일 09~18시에 담당 컨설턴트가\n이 채팅방으로 답변드려요.\n\n급하시면 ☎ ${CONTACT.tel}`)], quick(['지원사업 찾기', '경영진단', '처음']));
  }
  // 분야 메뉴('재무' 등)나 '○○ 진단' → 해당 진단툴
  const area = TOOLS.filter((t) => t.area === u);
  const kwHit = TOOLS.filter((t) => t.id !== 'grants' && t.kw.test(u));
  const toolReply = (list) => reply([{ carousel: { type: 'basicCard', items: list.slice(0, 10).map(toolCard) } }]);
  if (area.length) return toolReply(area);
  if (kwHit.length && /진단/.test(u)) return toolReply(kwHit);
  // 그 밖의 문장은 사업명 검색 — 공고가 없고 진단 분야 키워드면 진단툴 안내
  if (!programs) return reply([text('공고 정보를 불러오는 중이에요. 잠시 후 다시 시도해 주세요.')]);
  const found = searchPrograms(programs, u, now);
  if (!found.length && kwHit.length) return toolReply(kwHit);
  if (!found.length) {
    return reply([text(`'${cut(u, 20)}'(이)가 들어간 공고가 지금은 없어요.\n\n접수 중·예정인 공고만 찾아드려요.\n대표 사업은 보통 1년에 한 번 공고되니\n이미 마감됐거나 공고 전일 수 있어요.`),
      { basicCard: { title: '맞춤 매칭으로 찾아보기', description: '조건을 입력하면 지금 신청 가능한 사업과\n다음 공고 예정 사업까지 알려드려요.', buttons: [web('맞춤 매칭 시작', CONTACT.app)] } }]);
  }
  return reply([programList(`'${cut(u, 12)}' 공고 ${found.length}건${found.length > 5 ? ' 중 5건' : ''}`, found, now)]);
}
