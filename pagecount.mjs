// Page counts: on the public Site only, loads the Cloudflare Web Analytics beacon, which counts page views
// without cookies. Inputs: the page's address. Outputs: one script
// element in the page head, or nothing. Loaded by index.html; in Node (the tests) it only exports its parts.
// Network: static.cloudflareinsights.com (the beacon script) and cloudflareinsights.com (where the beacon reports), on the Site host only
// Writes: none (no cookie, no local storage; study data never leaves the device)
// Credentials: none (the site token is public: it is in the page source of every site that uses the service)

// The only place that is counted: the public Site. A preview copy, a local copy and any other host
// load nothing.
export const SITE_HOST = 'rhope-ops.github.io', SITE_PATH = '/icf/';
// The beacon script and the Site's token, both from the Cloudflare dashboard (Web Analytics, "Manage site").
export const BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';
export const BEACON_TOKEN = '50a810e6b0e140449fe53828062f1353';

// True when this address is the public Site (the exact host, and the Site's folder or a page in it).
export const countsHere = ({hostname, pathname}) => hostname === SITE_HOST && (pathname + '/').startsWith(SITE_PATH);

// The attributes of the beacon's script element, as the Cloudflare dashboard gives them.
export const beaconAttributes = () => ({type: 'module', src: BEACON_URL, 'data-cf-beacon': JSON.stringify({token: BEACON_TOKEN})});

/**
 * Adds the beacon to the page when the address is the public Site. The beacon loads after the app's own
 * files, and a failed load (offline, a blocker) changes nothing in the app.
 * @param {Document} page The page to add the script element to.
 * @param {{hostname:string, pathname:string}} address The page's address.
 * @returns {boolean} True when the beacon was added.
 */
export function startPageCount(page, address) {
  if (!countsHere(address)) return false;
  const script = page.createElement('script');
  for (const [name, value] of Object.entries(beaconAttributes())) script.setAttribute(name, value);
  page.head.append(script);
  return true;
}

if (typeof document !== 'undefined') startPageCount(document, location);
