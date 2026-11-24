// Offline copy worker (caching that an update cannot break).
// Rule 1: a file enters the cache only when the SHA-256 of its bytes matches the hash in its URL (?v=) or in the
//   build's file list (index.html, #release-files). While a host serves a stale file, the page gets that file,
//   as without a worker, but it is never stored: not in the copy, and not in the browser's own cache (no-store),
//   so the first load after the host is healed gets the right file.
// Rule 2: the page (index.html) always comes from the network when the network gives one, so a refresh loads the
//   newest build. Every request of the page is its own network request; the worker only adds a stored answer.
// Rule 3: the worker starts the app from the copy only when the page request fails, and only with the one build
//   in its record, and only when every file of that build is stored. The record names the build of the last page
//   the worker gave to a tab; when the worker cannot be sure of that, it removes the record, so that an older
//   build does not start after a newer one ran (saved progress may be newer than an older build).
//   Each page carries its build number (<meta name="icf-build">, from the app version; it never goes down from one
//   release to the next). The worker keeps the highest build number given to a tab (the floor, below) and never
//   records or starts offline a lower one; so two page answers that arrive in reverse order across a release, or an
//   older page after the record was removed, never make an older build start offline.
// Rule 4: the save migrations (migrations.json) are not in the first-load copy. The app asks for them only to open a
//   save of an older version, and keeps that save for the next start when they cannot load (offline). The worker
//   stores them when the app asks for them; a build is whole without them.
// Rule 5: a new worker waits; it takes over only when a page starts and tells it to ('activate' message), not as soon
//   as it is installed. It then serves every open tab of this scope, as the worker before it did.
// Storage that fails never holds a request, and storage that does not answer holds it for at most a few seconds
// once; then every request goes to the network.
// This file has no build-specific text: a release changes index.html, not this worker.
// Inputs: fetch and message events from the page, and the page's own file list (index.html, #release-files).
// Outputs: responses to those fetches (from the network, or from the stored copy when the page request fails) and
// a stored record of the last build. Run: the browser loads it as the offline worker (app.mjs registers ./sw.js).
// Network: only the site's own files, in this worker's scope (the page and the files its list names).
// Writes: the browser's Cache Storage, in two caches (icf-assets-1 for files and icf-release-1 for the build record and the build-number floor).
// Credentials: none.
const ASSETS = 'icf-assets-1', META = 'icf-release-1', STORAGE_MS = 1500;
const scope = self.registration.scope;
// Turn bytes into a lower-case hex string.
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
// The SHA-256 of the bytes, as a hex string.
const digest = async buffer => hex(await crypto.subtle.digest('SHA-256', buffer));
// Files of the build list that are stored only when the app asks for them (rule 4).
const ON_DEMAND = new Set(['migrations.json']);
// The files of a build list that the first-load copy stores: every listed file except the on-demand ones.
const precached = files => Object.entries(files).filter(([name]) => !ON_DEMAND.has(name));
// The cache key of a file: its address in the scope with the hash as the ?v= tag.
const keyUrl = (name, hash) => `${scope}${name}?v=${hash}`;
// True when the value is a file list {name: 12-character hash} that includes app.mjs and has only safe names and hashes.
const validFiles = files => !!files && typeof files === 'object' && !!files['app.mjs'] &&
  Object.entries(files).every(([name, hash]) => /^[\w.-]+$/.test(name) && /^[0-9a-f]{12}$/.test(hash));
// True when two file lists hold the same names and hashes.
const sameFiles = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
// The build number of the page text (<meta name="icf-build" content="N">), or 0 when the page has none or is not text (a damaged record).
const buildNumber = html => typeof html !== 'string' ? 0 : Number(html.match(/<meta name="icf-build" content="(\d{1,15})">/)?.[1] ?? 0);
// Read the file list from the page text (the #release-files script); null when it is missing or not valid.
function listedFiles(html) {
  const found = html.match(/<script type="application\/json" id="release-files">(.*?)<\/script>/s);
  try { const files = JSON.parse(found[1]); return validFiles(files) ? files : null; } catch { return null; }
}

// Storage that did not answer once is not asked again in this worker's life: every request goes to the network.
let dead = false;
// {value} when the step ends in time, {failed: true} when it rejects, {late: true} when it does not answer.
async function timed(step, ms = STORAGE_MS) {
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve({ late: true }), ms); });
  const result = await Promise.race([Promise.resolve(step).then(value => ({ value }), () => ({ failed: true })), late]);
  clearTimeout(timer);
  if (result.late) dead = true;
  return result;
}

// The record: {seen: {id, files, html, complete}, previous: file list of the whole build before it, kept for a
// tab that is still open on it}.
async function readRecord() {
  const hit = await (await caches.open(META)).match(`${scope}release`);
  try { return hit ? await hit.json() : null; } catch { return null; }
}
// Read-change-write steps on the record run one at a time (all tabs share this worker). A step that started
// before the record was removed does not write it back.
let turn = Promise.resolve(), epoch = 0;
// "Last" in rule 3 is the order in which page answers reach the worker; its own steps (hashing, storage) never
// reorder them. Each page answer gets the next number when it arrives, and the record never goes back to an earlier
// one, whichever hash finishes first. A removal of the record takes a number too, so a page that arrived before the
// removal cannot write the record back after it.
let arrivals = 0, newest = 0;
// Give the next arrival number to a page answer that skips the recording, so older arrivals cannot write the record later.
const passed = () => { newest = ++arrivals; };
// Run a step after the earlier steps on the record, one at a time; a failed step does not stop the next one.
const inTurn = step => { const run = turn.then(step, step); turn = run.catch(() => {}); return run; };
// Write the record unless the record was removed since the step started (its epoch changed); true when written.
async function writeRecord(record, started) {
  if (started !== epoch) return false;
  await (await caches.open(META)).put(`${scope}release`, new Response(JSON.stringify(record), { headers: { 'content-type': 'application/json' } }));
  return true;
}
// Only this scope's record: another copy of the app on the same origin keeps its own.
// The removal waits its turn, so a write that is already on its way cannot land after it.
// The floor first takes the build of the record that goes, so a removal never lowers it (a record from an older worker
// is the only trace of its build); a floor that cannot be stored still rises in memory.
const dropRecord = () => {
  epoch++;
  return inTurn(async () => {
    const record = await readRecord().catch(() => null);
    await raiseFloor(buildNumber(record?.seen?.html ?? '')).catch(() => {});
    return (await caches.open(META)).delete(`${scope}release`);
  });
};
// The floor: the highest build number given to a tab (rule 3). The worker raises it in memory for every page it gives
// to a tab and for the build a staging tab runs, before any storage step, and keeps it in its own stored entry (not in
// the record, so removing the record does not lower it); only the recovery page (which deletes every icf- cache)
// resets the stored entry. The offline start also checks the floor, so a record of a lower build is never started.
// Known limits: storage that fails or hangs (a floor or a record removal that is never stored), then a new worker;
// a release with a lower app version than one that ran is not recorded (no offline start) until the recovery page runs.
let seenFloor = 0;
// The floor: the highest of the one in memory, the stored one and the build of the current record's page (a record
// that an older worker wrote came with no stored floor).
async function readFloor() {
  const hit = await (await caches.open(META)).match(`${scope}floor`);
  let stored = 0;
  try { const value = hit ? Number((await hit.json()).build) : 0; stored = Number.isFinite(value) ? value : 0; } catch { /* 0 */ }
  const record = await readRecord().catch(() => null);
  return Math.max(seenFloor, stored, buildNumber(record?.seen?.html ?? ''));
}
// Raise the floor to this build number (never lower it). Rejects when the stored entry cannot be written.
async function raiseFloor(build) {
  seenFloor = Math.max(seenFloor, build);
  const hit = await (await caches.open(META)).match(`${scope}floor`);
  let stored = 0;
  try { stored = hit ? Number((await hit.json()).build) || 0 : 0; } catch { /* 0 */ }
  if (build > stored) await (await caches.open(META)).put(`${scope}floor`, new Response(JSON.stringify({ build }), { headers: { 'content-type': 'application/json' } }));
}
// Delete stored files of this scope that are in neither the recorded build nor the one before it.
async function prune(record) {
  const keep = new Set([record.seen.files, record.previous || {}].flatMap(files => Object.entries(files)).map(([name, hash]) => keyUrl(name, hash)));
  const assets = await caches.open(ASSETS);
  await Promise.all((await assets.keys()).filter(request => request.url.startsWith(scope) && !keep.has(request.url)).map(request => assets.delete(request)));
}
// Stores the body only when its hash starts with the expected value. Returns true when stored.
async function storeVerified(name, hash, response) {
  if (!response.ok) return false;
  const body = await response.arrayBuffer();
  if (!(await digest(body)).startsWith(hash)) return false;
  await storeBody(name, hash, body, response);
  return true;
}
// Store bytes whose hash was already checked, with the content type of the response they came from.
async function storeBody(name, hash, body, response) {
  const type = response.headers.get('content-type');
  await (await caches.open(ASSETS)).put(keyUrl(name, hash), new Response(body, { headers: type ? { 'content-type': type } : {} }));
}
// True when the file with this hash is already stored.
const isStored = async (name, hash) => !!(await (await caches.open(ASSETS)).match(keyUrl(name, hash)));
/**
 * Record the build that this page text names; the caller gives this page to a tab. A page that arrived before one
 * already recorded leaves the record alone. Rejects when the record cannot be written.
 * @param {string} html the page text.
 * @param {number} arrival the number the page answer got when it reached the worker.
 * @returns {Promise<{id: string, files: object}|null>} the build, or null when the text names no build.
 */
async function note(html, arrival) {
  const files = listedFiles(html);
  if (!files) return null;
  const id = (await digest(new TextEncoder().encode(html))).slice(0, 16);
  const build = buildNumber(html);
  await inTurn(async () => {
    if (arrival < newest) return void await raiseFloor(build); // Not recorded, but a tab got it: the floor still rises.
    newest = arrival;
    const started = epoch, record = await readRecord();
    // Same page: only the floor can rise; a floor that cannot be stored never removes this valid record.
    // A damaged record (page text that is not text) of the same page is written again, so it is repaired.
    if (record?.seen?.id === id && typeof record.seen.html === 'string') return void await raiseFloor(build).catch(() => {});
    if (build < await readFloor()) return; // An older build after a newer one ran: never record it (rule 3).
    await raiseFloor(build); // First: a failed write here rejects, and the caller then removes the record.
    const next = { seen: { id, files, html, complete: false }, previous: record?.seen?.complete ? record.seen.files : record?.previous || {} };
    if (await writeRecord(next, started)) await prune(next); // Files of builds that never became whole do not pile up.
  });
  return { id, files };
}
/**
 * Store each missing file of the recorded build, one after another, each with a request of its own, then mark the
 * build whole or not whole. Safe to run again: it restores a file that went missing.
 * @param {{id: string, files: object}|null} build the build to complete.
 * @returns {Promise<boolean>} true when every file of the build is stored.
 */
async function fill(build) {
  if (!build) return false;
  for (const [name, hash] of precached(build.files)) {
    try { if (!(await isStored(name, hash))) await storeVerified(name, hash, await fetch(keyUrl(name, hash), { cache: 'no-cache' })); } catch { /* counted below */ }
  }
  return inTurn(async () => {
    const started = epoch, record = await readRecord();
    if (record?.seen?.id !== build.id) return false; // Another build was recorded while this one was loading.
    let whole = true;
    for (const [name, hash] of precached(build.files)) if (!(await isStored(name, hash))) whole = false;
    if (record.seen.complete !== whole && !(await writeRecord({ ...record, seen: { ...record.seen, complete: whole } }, started))) return false;
    if (whole) await prune(record);
    return whole;
  });
}

/**
 * Answer a page request: from the network when it gives a page (and record that build first), else from the recorded
 * copy when the build is whole.
 * @param {FetchEvent} event the fetch event.
 * @param {function} settle ends the event's waitUntil, with background work or with nothing.
 * @returns {Promise<Response>} the response.
 */
async function page(event, settle) {
  let response = null, error = null;
  try { response = await fetch(event.request.url, { cache: 'no-cache' }); } catch (failure) { error = failure; }
  const arrival = ++arrivals;
  if (response?.redirected) { settle(); return fetch(event.request); } // The browser follows a redirect itself.
  if (response?.ok) {
    // Before a tab gets this page, the record must name its build (rule 3). If that fails, the record goes.
    // The page text is read outside the storage time limit: a slow network is not a storage fault.
    let html = null;
    try { html = await response.clone().text(); } catch { /* handled as not recorded */ }
    if (html !== null) seenFloor = Math.max(seenFloor, buildNumber(html)); // The tab gets this page in every case.
    const noted = dead || html === null ? { failed: true } : await timed(note(html, arrival), STORAGE_MS * 2);
    if (noted.value) settle(fill(noted.value).catch(() => false));
    // Not recorded. A page with no file list at all (a network sign-in page) leaves the record alone.
    else if (noted.value === null && !/id="release-files"/.test(html)) settle();
    else { passed(); const dropping = dropRecord().catch(() => {}); await timed(dropping); settle(dropping); }
    return response;
  }
  settle();
  // Only a whole record whose build is not below the floor (a newer build that ran is never undercut, rule 3).
  const record = dead ? null : (await timed((async () => {
    const found = await readRecord();
    // The build number comes from the stored page text: a record that an older worker wrote has no build field.
    return found?.seen?.complete && typeof found.seen.html === 'string' && buildNumber(found.seen.html) >= await readFloor() ? found : null;
  })())).value;
  if (record) return new Response(record.seen.html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (error) throw error;
  return response;
}
/**
 * Answer a request for a file: from the stored copy when its hash is known and stored, else from the network (and store
 * it when its bytes match the hash).
 * @param {FetchEvent} event the fetch event.
 * @param {function} settle ends the event's waitUntil, with background work or with nothing.
 * @param {string} name the file name.
 * @param {string|null} tag the ?v= hash on the request, or null.
 * @returns {Promise<Response>} the response.
 */
async function asset(event, settle, name, tag) {
  // An untagged request (a font, the badge) is answered from the copy only when the recorded build is whole.
  const found = await timed((async () => {
    let hash = tag;
    if (!hash) { const seen = (await readRecord())?.seen; hash = seen?.complete ? seen.files[name] : null; }
    return { hash, hit: hash ? await (await caches.open(ASSETS)).match(keyUrl(name, hash)) : null };
  })());
  if (found.value?.hit) { settle(); return found.value.hit; }
  if (!found.value?.hash) { settle(); return fetch(event.request); }
  let response;
  try { response = await fetch(event.request.url, { cache: 'no-cache' }); } catch (failure) { settle(); throw failure; }
  if (!response.ok) { settle(); return response; }
  let body;
  try { body = await response.clone().arrayBuffer(); } catch { settle(); return response; } // The page gets the same failure.
  let match = false;
  try { match = (await digest(body)).startsWith(found.value.hash); } catch { /* not checked: handled as stale */ }
  if (match) { settle(storeBody(name, found.value.hash, body, response).catch(() => false)); return response; }
  settle();
  // A stale file (rule 1): the page gets it once, marked no-store, so the browser does not keep it under the new hash.
  // Header names come in lower case. The body is already decoded, so its old encoding and length do not apply.
  const { 'content-encoding': _encoding, 'content-length': _length, ...kept } = Object.fromEntries(response.headers);
  const empty = response.status === 204 || response.status === 205; // These statuses cannot carry a body.
  return new Response(empty ? null : body, { status: response.status, statusText: response.statusText, headers: { ...kept, 'cache-control': 'no-store' } });
}

// No skipWaiting on install: a new worker waits until a page starts and sends 'activate' (rule 5).
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Remove only this app's older caches; other apps on the same origin keep theirs.
  const names = await caches.keys();
  await Promise.allSettled(names.filter(name => name.startsWith('icf-') && name !== ASSETS && name !== META).map(name => caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  const name = url.pathname.slice(new URL(scope).pathname.length), navigation = request.mode === 'navigate';
  if (dead) { // A page that the network gives now is not recorded, so the record must not outlive it.
    if (navigation && (name === '' || name === 'index.html')) event.respondWith(fetch(request).then(response => {
      if (response.ok) { passed(); event.waitUntil(dropRecord().catch(() => {})); }
      return response;
    }));
    return;
  }
  if (navigation ? name !== '' && name !== 'index.html'
    // The recovery page and the worker itself always come from the network.
    : !/^[\w.-]+$/.test(name) || name === 'refresh.html' || name === 'sw.js' || name === 'index.html') return;
  const tag = url.searchParams.get('v');
  if (!navigation && tag !== null && !/^[0-9a-f]{12}$/.test(tag)) return;
  let settle;
  event.waitUntil(new Promise(resolve => { settle = resolve; }));
  event.respondWith(navigation ? page(event, settle) : asset(event, settle, name, tag));
});
// Messages from the page.
// 'activate' (sent to a waiting worker when a page starts): this worker takes over now (rule 5).
// 'fill' (the network returned, the tab is shown again): complete or repair the recorded build. It never learns
//   of a new build.
// 'stage' with the file list the tab runs (the tab started without this worker: first visit, after the recovery
//   page, or a reload that went past the worker): record that build when the host's page still names it;
//   otherwise the worker cannot describe what the tab runs, and the record goes.
self.addEventListener('message', event => {
  const data = event.data;
  if (data?.type === 'activate') return void event.waitUntil(self.skipWaiting());
  if (dead || (data?.type !== 'fill' && data?.type !== 'stage')) return;
  event.waitUntil((async () => {
    try {
      const record = await readRecord();
      if (data.type === 'fill') return void await fill(record?.seen);
      if (!validFiles(data.files)) return;
      const tabBuild = Number.isSafeInteger(data.build) && data.build > 0 ? data.build : 0;
      seenFloor = Math.max(seenFloor, tabBuild); // The build this tab runs, before anything else.
      await inTurn(() => raiseFloor(tabBuild)).catch(() => {});
      if (record?.seen && typeof record.seen.html === 'string' && sameFiles(record.seen.files, data.files)) return void await fill(record.seen);
      passed(); await dropRecord(); // First: the record does not name what this tab runs.
      let html = null, arrival = 0;
      try { const response = await fetch(scope, { cache: 'no-cache' }); arrival = ++arrivals; if (response.ok && !response.redirected) html = await response.text(); } catch { /* below */ }
      const files = html && listedFiles(html);
      if (files && sameFiles(files, data.files)) await fill(await note(html, arrival));
    } catch { passed(); try { await dropRecord(); } catch { /* storage unavailable */ } }
  })());
});
