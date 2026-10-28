// health — 각 연동 상태 확인. API Key 자체는 절대 반환하지 않는다.
export async function handler() {
  const status = {
    app: 'ok',
    bizinfo:  process.env.BIZINFO_API_KEY  ? 'ready' : 'not_configured',
    kstartup: process.env.KSTARTUP_API_KEY ? 'ready' : 'not_configured',
    nts:      process.env.NTS_API_KEY      ? 'ready' : 'not_configured',
    claude:   process.env.ANTHROPIC_API_KEY ? 'ready' : 'not_configured',
    ts: new Date().toISOString()
  };
  return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(status) };
}
