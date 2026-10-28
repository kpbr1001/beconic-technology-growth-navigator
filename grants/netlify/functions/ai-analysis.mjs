// ============================================================================
// AI 분석 어댑터 — Claude API로 공고 본문에서 '정밀 자격조건' 추출
// API에 없는 업력·매출·직원수·업종제한 등을 본문(bsnsSumryCn)에서 구조화.
// 원칙: 근거(evidence)와 함께 추출. 불확실하면 null(허위생성 금지).
// 키는 서버(환경변수 ANTHROPIC_API_KEY)에서만.
// 모델: claude-haiku-4-5 (고volume 추출·저비용). 배치/캐시는 파이프라인에서.
// ============================================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

const SYSTEM = `너는 한국 정부·공공 지원사업 공고에서 '신청 자격조건'만 정확히 추출하는 도구다.
반드시 아래 JSON 스키마로만 답한다. 본문에 명시되지 않은 값은 절대 지어내지 말고 null로 둔다.
각 조건에는 근거(evidence: 본문에서 인용한 짧은 문구)를 함께 담는다. 근거가 없으면 그 필드는 null.
출력은 JSON 객체 하나. 설명·마크다운·코드펜스 금지.

스키마:
{
  "businessAgeMax": 숫자(창업 N년 이내) 또는 null,
  "businessAgeMin": 숫자 또는 null,
  "revenueMax": 숫자(원, 매출 상한) 또는 null,
  "revenueMin": 숫자(원, 매출 하한) 또는 null,
  "employeeMax": 숫자(상시근로자 상한) 또는 null,
  "employeeMin": 숫자(상시근로자 하한) 또는 null,
  "targetIndustries": [업종 문자열] 또는 [],
  "excludedIndustries": [제외업종] 또는 [],
  "representativeAgeMax": 숫자(대표자 연령 상한, 청년) 또는 null,
  "specialRequirements": [특수자격 예:"여성기업","벤처확인","수출실적"] 또는 [],
  "requiresNoTaxArrears": true/false/null (세금 체납 없어야 하면 true),
  "supportAmountMax": 숫자(원, 최대지원금) 또는 null,
  "evidence": { "필드명": "본문 인용 근거" },
  "confidence": "high" | "medium" | "low"
}`;

function buildUserPrompt(program) {
  return `공고명: ${program.programName}
지원분야: ${program.category}
지원대상(대분류): ${(program.targetBusinessType||[]).join(', ')}
사업개요 본문:
${(program.rawSummary || program.supportDescription || '').slice(0, 6000)}

위 본문에서 신청 자격조건을 스키마대로 JSON으로만 추출하라.`;
}

// 응답에서 JSON만 안전 파싱
function safeParse(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b+1);
  try { return JSON.parse(s); } catch { return null; }
}

// 단일 공고 자격추출
export async function extractEligibility(apiKey, program) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt(program) }]
    })
  });
  if (!res.ok) throw new Error(`anthropic HTTP ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const parsed = safeParse(text);
  return { ...parsed, _usage: data.usage || null };
}

// 추출값을 표준 program에 병합(있는 것만 덮어씀, 허위생성 방지)
export function mergeEligibility(program, elig) {
  if (!elig) return program;
  const out = { ...program };
  if (elig.businessAgeMax != null) out.businessAgeMax = elig.businessAgeMax;
  if (elig.businessAgeMin != null) out.businessAgeMin = elig.businessAgeMin;
  if (elig.revenueMax != null) out.revenueMax = elig.revenueMax;
  if (elig.revenueMin != null) out.revenueMin = elig.revenueMin;
  if (elig.employeeMax != null) out.employeeMax = elig.employeeMax;
  if (elig.employeeMin != null) out.employeeMin = elig.employeeMin;
  if (Array.isArray(elig.targetIndustries) && elig.targetIndustries.length) out.targetIndustries = elig.targetIndustries;
  if (Array.isArray(elig.excludedIndustries) && elig.excludedIndustries.length) out.excludedIndustries = elig.excludedIndustries;
  if (elig.representativeAgeMax != null) out.representativeAgeMax = elig.representativeAgeMax;
  // 특수자격: 엔진이 읽는 specialRequirements 필드로 직접 세팅(+우대표시용 preferenceConditions)
  if (Array.isArray(elig.specialRequirements) && elig.specialRequirements.length) {
    out.specialRequirements = elig.specialRequirements;
    out.preferenceConditions = elig.specialRequirements;
  }
  if (elig.requiresNoTaxArrears === true) out.requiresNoTaxArrears = true;
  if (elig.supportAmountMax != null && !out.supportAmountMax) out.supportAmountMax = elig.supportAmountMax;
  out._eligibilityEvidence = elig.evidence || {};
  out._eligibilityConfidence = elig.confidence || 'low';
  out._aiEnriched = true;   // AI 정밀추출 완료 표시
  return out;
}

export async function handler(event) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(200, { status: 'NOT_CONFIGURED', source: 'anthropic' });
  let program;
  try { program = JSON.parse(event.body || '{}').program; } catch { program = null; }
  if (!program) return json(400, { status: 'ERROR', message: 'program required' });
  try {
    const elig = await extractEligibility(key, program);
    return json(200, { status: 'OK', eligibility: elig, program: mergeEligibility(program, elig) });
  } catch (e) {
    return json(200, { status: 'ERROR', message: String(e.message || e) });
  }
}
const json = (code, body) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
