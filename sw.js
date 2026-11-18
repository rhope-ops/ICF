// Offline copy worker (caching that an update cannot break).
// Rule 1: a file enters the cache only when the SHA-256 of its bytes matches the hash in its URL (?v=) or in the
//   build's file list (index.html, #release-files). While a host serves a stale file, the page gets that file,
//   as without a worker, but it is never stored.
// Rule 2: the page (index.html) always comes from the network when the network gives one, so a refresh loads the
//   newest build. Every request of the page is its own network request; the worker only adds a stored answer.
// Rule 3: the worker starts the app from the copy only when the page request fails, and only with the one build
//   in its record, and only when every file of that build is stored. The record names the build of the last page
//   the worker gave to a tab; when the worker cannot be sure of that, it removes the record, so that an older
//   build does not start after a newer one ran (saved progress may be newer than an older build).
//   Known limit: two page answers that arrive in reverse order across a release leave the older build recorded.
// Storage that fails never holds a request, and storage that does not answer holds it for at most a few seconds
// once; then every request goes to the network.
// This file has no build-specific text: a release changes index.html, not this worker.
const ASSETS = 'icf-assets-1', META = 'icf-release-1', STORAGE_MS = 1500;
const scope = self.registration.scope;
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async buffer => hex(await crypto.subtle.digest('SHA-256', buffer));
const keyUrl = (name, hash) => `${scope}${name}?v=${hash}`;
const validFiles = files => !!files && typeof files === 'object' && !!files['app.mjs'] &&
  Object.entries(files).every(([name, hash]) => /^[\w.-]+$/.test(name) && /^[0-9a-f]{12}$/.test(hash));
const sameFiles = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
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
const passed = () => { newest = ++arrivals; };
const inTurn = step => { const run = turn.then(step, step); turn = run.catch(() => {}); return run; };
async function writeRecord(record, started) {
  if (started !== epoch) return false;
  await (await caches.open(META)).put(`${scope}release`, new Response(JSON.stringify(record), { headers: { 'content-type': 'application/json' } }));
  return true;
}
// Only this scope's record: another copy of the app on the same origin keeps its own.
// The removal waits its turn, so a write that is already on its way cannot land after it.
const dropRecord = () => { epoch++; return inTurn(async () => (await caches.open(META)).delete(`${scope}release`)); };
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
  const type = response.headers.get('content-type');
  await (await caches.open(ASSETS)).put(keyUrl(name, hash), new Response(body, { headers: type ? { 'content-type': type } : {} }));
  return true;
}
const isStored = async (name, hash) => !!(await (await caches.open(ASSETS)).match(keyUrl(name, hash)));
// Records the build that this page text names; the caller gives this page to a tab. arrival: the number the page
// answer got when it reached the worker. Returns {id, files}, or null when the text names no build. Rejects when
// the record cannot be written. A page that arrived before one already recorded leaves the record alone.
async function note(html, arrival) {
  const files = listedFiles(html);
  if (!files) return null;
  const id = (await digest(new TextEncoder().encode(html))).slice(0, 16);
  await inTurn(async () => {
    if (arrival < newest) return;
    newest = arrival;
    const started = epoch, record = await readRecord();
    if (record?.seen?.id === id) return;
    const next = { seen: { id, files, html, complete: false }, previous: record?.seen?.complete ? record.seen.files : record?.previous || {} };
    if (await writeRecord(next, started)) await prune(next); // Files of builds that never became whole do not pile up.
  });
  return { id, files };
}
// Stores each missing file of the recorded build, one after another, each with a request of its own, then marks
// the build whole or not whole. Safe to run again: it restores a file that went missing.
async function fill(build) {
  if (!build) return false;
  for (const [name, hash] of Object.entries(build.files)) {
    try { if (!(await isStored(name, hash))) await storeVerified(name, hash, await fetch(keyUrl(name, hash), { cache: 'no-cache' })); } catch { /* counted below */ }
  }
  return inTurn(async () => {
    const started = epoch, record = await readRecord();
    if (record?.seen?.id !== build.id) return false; // Another build was recorded while this one was loading.
    let whole = true;
    for (const [name, hash] of Object.entries(build.files)) if (!(await isStored(name, hash))) whole = false;
    if (record.seen.complete !== whole && !(await writeRecord({ ...record, seen: { ...record.seen, complete: whole } }, started))) return false;
    if (whole) await prune(record);
    return whole;
  });
}

// settle: ends the event's waitUntil, with background work or with nothing.
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
    const noted = dead || html === null ? { failed: true } : await timed(note(html, arrival), STORAGE_MS * 2);
    if (noted.value) settle(fill(noted.value).catch(() => false));
    // Not recorded. A page with no file list at all (a network sign-in page) leaves the record alone.
    else if (noted.value === null && !/id="release-files"/.test(html)) settle();
    else { passed(); const dropping = dropRecord().catch(() => {}); await timed(dropping); settle(dropping); }
    return response;
  }
  settle();
  const record = dead ? null : (await timed(readRecord())).value;
  if (record?.seen?.complete) return new Response(record.seen.html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (error) throw error;
  return response;
}
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
  settle(storeVerified(name, found.value.hash, response.clone()).catch(() => false));
  return response;
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
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
// 'fill' (the network returned, the tab is shown again): complete or repair the recorded build. It never learns
//   of a new build.
// 'stage' with the file list the tab runs (the tab started without this worker: first visit, after the recovery
//   page, or a reload that went past the worker): record that build when the host's page still names it;
//   otherwise the worker cannot describe what the tab runs, and the record goes.
self.addEventListener('message', event => {
  const data = event.data;
  if (dead || (data?.type !== 'fill' && data?.type !== 'stage')) return;
  event.waitUntil((async () => {
    try {
      const record = await readRecord();
      if (data.type === 'fill') return void await fill(record?.seen);
      if (!validFiles(data.files)) return;
      if (record?.seen && sameFiles(record.seen.files, data.files)) return void await fill(record.seen);
      passed(); await dropRecord(); // First: the record does not name what this tab runs.
      let html = null, arrival = 0;
      try { const response = await fetch(scope, { cache: 'no-cache' }); arrival = ++arrivals; if (response.ok && !response.redirected) html = await response.text(); } catch { /* below */ }
      const files = html && listedFiles(html);
      if (files && sameFiles(files, data.files)) await fill(await note(html, arrival));
    } catch { passed(); try { await dropRecord(); } catch { /* storage unavailable */ } }
  })());
});
