// Diagnostic report builder: the app version and the one function that makes the report a user may send for support.
// Inputs: a device id, platform and browser names, the content version, the flags and the current session.
// Outputs: a plain object ready to be turned into JSON. Run: imported as an ES module by flags.mjs, app.mjs and the tests.
// Network: none.
// Writes: none (it only builds an object; flags.mjs shows or downloads it).
// Credentials: none.
import { APP } from './settings.mjs';
export const APP_VERSION = '2.10.2';
// Build the diagnostic report object; throw when the device id is not a 36-character id. Names and storage are left out.
export function diagnosticReport({deviceId, platform, browser, version, flags, session, now = new Date().toISOString()}) {
  if (!/^[a-f0-9-]{36}$/.test(deviceId)) throw Error('Invalid device identifier');
  return {schema:1,purpose:`${APP.name} diagnostic submission`,appVersion:APP_VERSION,createdAt:now,
    device:{id:deviceId,platform:String(platform).slice(0,40),browser:String(browser).slice(0,40)},contentVersion:version,
    // Deliberately exclude nickname, account data, arbitrary storage and question/source text.
    session:session?{pool:session.pool,activeMs:session.activeMs,appearances:session.appearances,correctIds:session.correctIds,
      missedIds:session.missedIds,attempts:session.attempts,mode:session.mode,kind:session.kind}:null,
    flags:Object.values(flags)};
}
