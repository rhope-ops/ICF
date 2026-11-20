// Question and card flags, the Diagnostics report, the file download and Delete Local Data.
// Why: a reader marks a question or card for review; this module holds the flag dialogs and the flag write.
// Inputs: a question or card, the flags in shared state, the saved device data. Outputs: flag dialogs, saved flags,
// the diagnostics report object, a downloaded file, a reset app. Run: loaded by the browser as part of the app.
// Network: none (the download is a local file made in the browser).
// Writes: browser storage through store and persist(), the shared flags, the page DOM, a downloaded file.
// Credentials: none.
import { shared } from './app-state.mjs';
import { restoreStats } from './analytics.mjs';
import { $, dialog, main, notice, persist, read, scholarDraft, store, syncThemeSwitch } from './app.mjs';
import { diagnosticReport } from './diagnostics.mjs';
import { restoreCardSets } from './flashcards.mjs';
import { closeTermPop } from './glossary-ui.mjs';
import { navigate, showDialog } from './nav.mjs';
import * as screens from './screens.mjs';
import { cardFlag, reviewFlag, updateFlags } from './storage.mjs';

// The storage key of a question flag: the bank version, then the question id.
const flagKey = id => `${shared.session?.version || shared.bank.version}/${id}`;
// True when the question has a saved flag.
export const isFlagged = id => Boolean(shared.flags[flagKey(id)]);
// Sets the pressed state of every flag button for the question to match its saved flag.
const syncFlagButtons = id => main.querySelectorAll('[data-flag-question]').forEach(b => { if (b.dataset.flagQuestion === id) b.setAttribute('aria-pressed', String(isFlagged(id))); });
/**
 * Opens the Flag Question dialog for a question; Save writes the flag and Clear removes it.
 * @param {object} q the question to flag (needs id)
 */
export function flagQuestion(q) {
  const key = flagKey(q.id), old = shared.flags[key] || {};
  // Writes the entry (null clears it); on success updates the buttons and closes the dialog.
  const done = entry => { if (writeFlags(key, entry)) { syncFlagButtons(q.id); dialog.close(); } };
  showDialog('Flag Question', screens.questionFlagHtml(q, old, Boolean(shared.flags[key])), () => {
    $('#save-flag').onclick = () => {
      const selected = [...dialog.querySelectorAll('[name=answer-flag]:checked')].map(e => e.value), questionFlag = $('#question-flag').checked, note = $('#flag-note').value;
      done(!selected.length && !questionFlag && !note.trim() ? null : reviewFlag({version:shared.session?.version || shared.bank.version,question:q,answerIds:selected,questionFlag,note}));
    };
    if ($('#clear-flag')) $('#clear-flag').onclick = () => done(null);
  }, {label:q.id});
}
/**
 * Sets the pressed state of the card flag button for the given flag key.
 * @param {string} key the storage key of the card flag
 */
const syncCardFlag = key => $('#flag-card')?.setAttribute('aria-pressed', String(Boolean(shared.flags[key])));
// Opens the Flag Card dialog for a card; Save writes the flag and Clear removes it.
export function flagCard(q, context) {
  const key = `${shared.bank.version}/${q.id}/card`, old = shared.flags[key] || {};
  showDialog('Flag Card', screens.cardFlagHtml(context, old, Boolean(shared.flags[key])), () => {
    $('#save-flag').onclick = () => {
      const checked = $('#card-flag').checked, note = $('#flag-note').value;
      if (writeFlags(key, cardFlag({version:shared.bank.version,question:q,note,cardFlag:checked,card:context}))) { syncCardFlag(key); dialog.close(); }
    };
    if ($('#clear-flag')) $('#clear-flag').onclick = () => { if (writeFlags(key, null)) { syncCardFlag(key); dialog.close(); } };
  }, {label:`Card · ${q.id}`});
}
// A failed flag write keeps the dialog open with the error and the saved notes unchanged.
export function writeFlags(key, entry) {
  const result = updateFlags(store, shared.flags, key, entry);
  shared.flags = result.flags;
  if (result.error) notice(result.error);
  if ($('#flag-error')) $('#flag-error').textContent = result.error || '';
  return !result.error;
}
// Saves the text as a JSON file on the device through a temporary link.
export function download(text, filename) { const url = URL.createObjectURL(new Blob([text],{type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
// Builds the Diagnostics report: a stored device id (made on first use), the platform and browser, the bank version, flags and session.
export function diagnostics() {
  let deviceId=read('device');
  if(typeof deviceId!=='string'||!/^[a-f0-9-]{36}$/.test(deviceId)){deviceId=crypto.randomUUID();persist('device',deviceId);}
  const ua=navigator.userAgent;
  const platform=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Mac/i.test(ua)?'macOS':'Linux or other';
  const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
  return diagnosticReport({deviceId,platform,browser,version:shared.bank.version,flags:shared.flags,session:shared.session});
}
// Delete Local Data: clear storage, then return every saved setting and record to its fresh-device value.
export function resetLocalData() {
  // A failed clear stops here: the data is still on the device, so the app must not look reset.
  const failed = store.clear(); if (failed) { notice(failed); return; }
  shared.theme=window.icfTheme.defaultChoice;window.icfTheme.set(shared.theme);syncThemeSwitch();
  shared.pinQuestion=true;document.documentElement.dataset.pinQuestion='true';$('#settings-pin-question').checked=true;
  shared.profile={nickname:'',visited:false};shared.flags={};shared.session=null;shared.understanding={};shared.stats=restoreStats(null);shared.poolKind='random';shared.missedReview=null;shared.modalWasRunning=false;
  shared.cardSets=restoreCardSets();shared.flashPreview=null;shared.flashSetId=null;shared.flashMessage='';shared.dynamicCards=true;shared.pickSetId=null;shared.pendingCard=null;shared.missedWaiting.clear();shared.glossReturn=null;shared.glossEntry=null;shared.glossQuery='';shared.glossSection=0;closeTermPop();shared.scholarState=null;shared.scholarPending=null;shared.scholarReturn=null;shared.lastPlace=null;scholarDraft.clear();shared.scholarOpenFor=null;
  shared.exam=null;shared.examHistory=[];shared.examCycles={schema:1,blocks:{}};shared.lastGroup=null;shared.examFilter='missed';shared.resultsKind='study';
  navigate('welcome');
}
