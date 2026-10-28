// health — 각 연동의 설정 여부만 확인한다. API 키 값은 절대 반환하지 않는다.
export async function handler() {
  const status = {
    app: 'ok',
    bizinfo: process.env.BIZINFO_API_KEY ? 'ready' : 'not_configured',
    kstartup: process.env.KSTARTUP_API_KEY ? 'ready' : 'not_configured',
    claude: process.env.ANTHROPIC_API_KEY ? 'ready' : 'not_configured',
    ts: new Date().toISOString(),
  };
  return { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(status) };
}
