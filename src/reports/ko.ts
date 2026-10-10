// 보고서 한국어 문장 다듬기(순수 함수). 조사 자동 선택·'이(가)' 같은 병기 제거·문항 코드 대신 문항 이름.
// 원칙: 뜻은 바꾸지 않고 읽기만 쉽게 한다(멱등 — 여러 번 적용해도 결과가 같음).
export { Q_SHORT, qRef, qRefs } from '../diagnosis/qref';

/** 숫자 읽기의 받침(0 영·1 일·3 삼·6 육·7 칠·8 팔 — ㄹ은 8) */
const DIGIT_FIN: Record<string, number> = { '0': 21, '1': 8, '2': 0, '3': 16, '4': 0, '5': 0, '6': 1, '7': 8, '8': 8, '9': 0 };
/** 영문 글자 이름의 받침(L 엘·M 엠·N 엔·R 알) */
const LETTER_FIN: Record<string, number> = { l: 8, m: 16, n: 4, r: 8 };

/** 글자 하나의 받침 번호(0 = 없음). 판단할 수 없으면 null */
function finalOf(ch: string): number | null {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) return code % 28;
  if (ch in DIGIT_FIN) return DIGIT_FIN[ch];
  if (/[A-Za-z]/.test(ch)) return LETTER_FIN[ch.toLowerCase()] ?? 0;
  return null;
}

const pick = (fin: number, a: string, b: string) => ((a === '으로' ? fin !== 0 && fin !== 8 : fin !== 0) ? a : b);

/** 받침 유무로 조사 고르기(을/를·이/가·은/는·과/와·으로/로). 판단할 수 없으면 받침 없음으로 본다 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const w = word.trim();
  const fin = lastFinal(w, w.length) ?? 0;
  return `${word}${pick(fin, withFinal, withoutFinal)}`;
}

const CLOSE_QUOTE = new Set(["'", '’', '"', '”', '」', '』', '》', '>']);
/** s[0..end) 끝말의 받침 — 닫는 따옴표는 건너뛰고, 괄호 설명은 괄호 앞 말 기준(예: '정규화'(TRL 6) → 화) */
function lastFinal(s: string, end: number): number | null {
  let i = end - 1;
  while (i >= 0 && CLOSE_QUOTE.has(s[i])) i--;
  if (s[i] === ')') {
    let depth = 0, j = i;
    for (; j >= 0; j--) {
      if (s[j] === ')') depth++;
      else if (s[j] === '(' && --depth === 0) break;
    }
    if (j > 0 && !/\s/.test(s[j - 1])) {
      const f = lastFinal(s, j);
      if (f !== null) return f;
    }
    return lastFinal(s, i); // 괄호 앞에 말이 없으면 괄호 안 끝말
  }
  return i >= 0 ? finalOf(s[i]) : null;
}

const PAIR: Record<string, [string, string]> = {
  이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'], 과: ['과', '와'], 와: ['과', '와'],
};

/** 조사 바로잡기: ① '이(가)'·'은(는)'·'(으)로' 병기 → 앞말에 맞는 하나 ② 따옴표·괄호·숫자 뒤 조사를 앞말 받침에 맞춤 */
export function fixParticles(text: string): string {
  if (!text) return text;
  let s = text.replace(/(이\(가\)|가\(이\)|은\(는\)|는\(은\)|을\(를\)|를\(을\)|과\(와\)|와\(과\)|\(으\)로|으로\(로\))/g, (m, _p, off: number, all: string) => {
    const fin = lastFinal(all, off);
    const [a, b] = m === '(으)로' || m === '으로(로)' ? ['으로', '로'] : PAIR[m[0]];
    return fin === null ? (m.startsWith('(') ? '로' : `${a}`) : pick(fin, a, b);
  });
  // 따옴표·괄호·숫자 바로 뒤 한 글자 조사(뒤에 띄어쓰기·문장부호가 올 때만 — '이다', '가지' 같은 말은 건드리지 않음)
  s = s.replace(/(?<=['’"”)\d])(이|가|은|는|을|를|과|와)(?=[\s,.·:;!?)]|$)/g, (m, _p, off: number, all: string) => {
    const fin = lastFinal(all, off);
    if (fin === null) return m;
    const [a, b] = PAIR[m];
    return pick(fin, a, b);
  });
  return s;
}
