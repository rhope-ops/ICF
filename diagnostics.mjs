export const APP_VERSION = '2.1.66';
export function diagnosticReport({deviceId, platform, browser, version, flags, session, now = new Date().toISOString()}) {
  if (!/^[a-f0-9-]{36}$/.test(deviceId)) throw Error('Invalid device identifier');
  return {schema:1,purpose:'ICF Companion diagnostic submission',appVersion:APP_VERSION,createdAt:now,
    device:{id:deviceId,platform:String(platform).slice(0,40),browser:String(browser).slice(0,40)},contentVersion:version,
    // Deliberately exclude nickname, account data, arbitrary storage and question/source text.
    session:session?{pool:session.pool,activeMs:session.activeMs,appearances:session.appearances,correctIds:session.correctIds,
      missedIds:session.missedIds,attempts:session.attempts,mode:session.mode,kind:session.kind}:null,
    flags:Object.values(flags)};
}
