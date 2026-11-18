// Glossary: pure lookups over glossary.json (built from the authored
// flash cards and the course excerpts). No DOM, storage or network access. Every text shown comes from that file.

// Block scope: each block is self-contained. Links, answer terms and
// related lists name entries of the question's own block; an acronym carries {expansion, blocks: {"<block>": {entry, see}}},
// and a lookup takes the block from the question (q.block) or an explicit {block}.
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function restoreGlossary(raw) {
  const ok = raw && raw.schema === 1 && Array.isArray(raw.entries) && isObj(raw.acronyms) && raw.questionLinks && raw.answerTerms && raw.docs &&
    raw.entries.every(e => typeof e.id === 'string' && typeof e.term === 'string' && typeof e.short === 'string' && Array.isArray(e.excerpts) && Array.isArray(e.questionIds) &&
      Array.isArray(e.aliases) && e.aliases.every(a => typeof a === 'string') && Array.isArray(e.related) && e.related.every(r => typeof r === 'string') && Number.isInteger(e.unit) && Number.isInteger(e.block));
  if (!ok) return null;
  const byId = new Map(raw.entries.map(e => [e.id, e]));
  // An acronym's entry and See entries exist and belong to the block they are listed under.
  const own = (id, b) => byId.get(id)?.block === Number(b);
  const acrOk = Object.values(raw.acronyms).every(a => isObj(a) && typeof a.expansion === 'string' && isObj(a.blocks) &&
    Object.entries(a.blocks).every(([b, v]) => /^[1-9]\d*$/.test(b) && isObj(v) && (v.entry === null || own(v.entry, b)) && Array.isArray(v.see) && v.see.every(id => own(id, b))));
  if (!acrOk) return null;
  return { ...raw, byId };
}
// One block's view of an acronym: {expansion, entry, see} or null when the block's questions do not use it.
export const acronymOf = (g, acr, block) => {
  const a = Object.hasOwn(g.acronyms, acr) ? g.acronyms[acr] : null, b = a && Object.hasOwn(a.blocks, String(block)) ? a.blocks[block] : null;
  return b ? { expansion: a.expansion, entry: b.entry, see: b.see } : null;
};
export const entryOf = (g, id) => g.byId.get(id) || null;
// A flash card's glossary entry: the entry built from that card (same term, same source question).
export const entryForCard = (g, card) => card && card.kind !== 'highlight' ? g.entries.find(e => e.sourceId === card.questionId) || null : null;
const refEntry = (g, ref, block) => ref.startsWith('acr:') ? acronymOf(g, ref.slice(4), block)?.entry || null : ref;

// Exposure rule: no stem term is underlined or linked before a correct answer.
// phase: 'live' (not resolved yet) | 'missed' (resolved by a miss, live) | 'resolved' (the correct answer is known: a correct
// selection or a reveal) | 'review' (an earlier appearance or a review screen) | 'exam' (exam not submitted).
// - Live, missed or a live exam: no stem links in any mode.
// - Resolved / review: every stem link, full entries.
// Returns stem spans [{start, end, ref}] for the question.
export function stemLinks(g, q, { phase }) {
  // Links appear with the Key terms button, after any answer (right, wrong or revealed); never before.
  if (phase !== 'resolved' && phase !== 'review' && phase !== 'missed') return [];
  return (g.questionLinks[q.id]?.stem || []).map(([start, end, ref]) => ({ start, end, ref }));
}

// Popover content for one link. block: the block of the question (or card or entry) the link is in; an acronym opens
// only that block's entry and See entries.
export function popover(g, ref, { block } = {}) {
  if (ref.startsWith('acr:')) {
    const acr = ref.slice(4), a = acronymOf(g, acr, block);
    if (!a) return null;
    return { title: acr, expansion: a.expansion, entry: a.entry ? entryOf(g, a.entry) : null, see: (a.see || []).map(id => entryOf(g, id)).filter(Boolean) };
  }
  const e = entryOf(g, ref);
  return e && (block === undefined || e.block === Number(block)) ? { title: e.term, expansion: null, entry: e, see: [] } : null;
}

// Terms of a question (stem, choices, rationales), in order of first appearance; acronyms count through their entry.
export function keyTerms(g, q, max = 6) {
  const L = g.questionLinks[q.id]; if (!L) return [];
  const ids = [];
  const add = list => { for (const [, , ref] of list) { const id = refEntry(g, ref, q.block); if (id && !ids.includes(id)) ids.push(id); } };
  add(L.stem); for (const a of q.answers) add(L.answers[a.id] || []);
  for (const id of Object.values(g.answerTerms[q.id] || {})) if (!ids.includes(id) && !g.generic.includes(id)) ids.push(id);
  // The question's own card entry (every question but an Exam item has one).
  const own = g.questionEntry?.[q.id]; if (own && !ids.includes(own)) ids.unshift(own);
  for (const a of q.answers) add(L.rationales[a.id] || []);
  // the limit never cuts the own card entry or the key's own term (an entry already named past the limit was
  // cut, e.g. the MX Record card on its own Hard question); it moves to the front in place of the last other term.
  const out = ids.slice(0, max), key = (g.answerTerms[q.id] || {})[q.correctAnswerId];
  for (const id of [key, own]) if (id && !out.includes(id)) {
    if (out.length >= max) out.splice(out.findLastIndex(x => x !== own && x !== key), 1);
    out.unshift(id);
  }
  return out;
}
// Glossary screen: search (term, aliases, short), unit filter, A-Z.
export function searchEntries(g, { query = '', unit = 0 } = {}) {
  const t = query.trim().toLowerCase();
  return g.entries.filter(e => (!unit || e.unit === unit) && (!t || e.term.toLowerCase().includes(t) || e.aliases.some(a => a.toLowerCase().includes(t)) || e.short.toLowerCase().includes(t)));
}

// Bookmarks: one list of entry ids (icf:glossaryBookmarks). SAVE replaced them; app.migrateBookmarks moves a
// saved list once into Manual. Unknown or repeated ids are dropped.
// A card term change renames its entry id; a saved list naming the old id keeps the card (
// B4-U4-Q020's card "Domain Name System (DNS) name hierarchy example" became Subdomain).
// Three Block 5 cards have their course terms back; Group Policy Object and Proxy Server are
// also Block 4 terms, so their Block 5 entries are "-b5" (build_glossary.assign_ids).
export const RENAMED_ENTRIES = Object.freeze({ 'domain-name-system-dns-name-hierarchy-example': 'third-level-domain',
  'subdomain': 'third-level-domain', 'security-technical-implementation-guide-stig-b1': 'security-technical-implementation-guide-b1',
  'security-technical-implementation-guide-stig': 'security-technical-implementation-guide-b1',
  'proxy-outbound-control': 'proxy-server-b5',
  'building-an-access-control-list-acl': 'access-control-list', 'access-control-list-acl': 'access-control-list',
  'availability-b4': 'availability', 'electromagnetic-interference-emi-b1': 'electromagnetic-interference', 'electromagnetic-interference-emi': 'electromagnetic-interference',
  'intrusion-detection-system-ids-b1': 'intrusion-detection-system', 'intrusion-detection-system-ids': 'intrusion-detection-system',
  // Block 5: facet entries follow to their parent concept; renamed cards to their new entry.
  'anti-virus-detection': 'anti-virus', 'application-security-vulnerabilities': 'application-vulnerabilities', 'authentication-factor-location': 'authentication-factors',
  'baseline-configuration-risk-gap': 'baseline-configuration', 'botnet-command-server': 'botnet', 'cirt-responsibilities': 'computer-incident-response-team',
  'cmos-boot-setting': 'complementary-metal-oxide-semiconductor', 'communications-security-authenticity-goal': 'communications-security-comsec', 'computer-security-scope': 'computer-security',
  'computer-viruses-boot-sector': 'computer-viruses', 'configuration-management-tracking': 'configuration-management', 'controlled-unclassified-information-cui-recall-roster': 'controlled-unclassified-information-cui',
  'cookies-forgery-risk': 'cookies', 'cyber-hygiene-habits': 'cyber-hygiene', 'data-diddling-detection': 'data-diddling',
  'demilitarized-zone-internal-firewall': 'demilitarized-zone', 'demilitarized-zone-layout': 'demilitarized-zone', 'denial-of-service-traits': 'denial-of-service',
  'encryption-in-storage': 'encryption', 'encryption-of-stored-files': 'encryption', 'encryption-to-cipher-text': 'encryption',
  'event-notification-trigger': 'event', 'fde-key-storage': 'trusted-platform-module', 'firewall-with-proxy': 'firewall',
  'first-responder-goal': 'first-responder', 'fraud-waste-and-abuse-examples': 'fraud-waste-and-abuse', 'freedom-of-information-act-foia-exemption-1': 'freedom-of-information-act-foia',
  'full-backup-restore': 'full-backup', 'full-control-share-permission': 'full-control', 'general-services-administration-approved-safe': 'general-services-administration-gsa',
  'hardware-encryption-hsm-card': 'hardware-security-module', 'incident-analysis-purpose': 'incident-analysis', 'incident-categories-severity-levels': 'incident-categories',
  'incident-handling-process-phase-two': 'preliminary-analysis-and-identification', 'incremental-backup-restore': 'incremental-backup', 'information-protection-disciplines': 'information-protection',
  'information-security-within-information-protection': 'information-security-infosec', 'intranet-zone-traffic': 'intranet-zone', 'malicious-code-examples': 'malicious-code',
  'nac-agent-types': 'network-access-control', 'nids-console': 'network-based-intrusion-detection-system', 'operations-security-opsec-deployment-breach': 'operations-security-opsec',
  'phishing-wide-audience': 'phishing', 'physical-security-access-control-letter': 'physical-security', 'privacy-act-of-1974-coverage': 'privacy-act-of-1974',
  'protected-distribution-system-categories': 'hardened-distribution-system', 'proxy-server-web-filtering': 'proxy-server-b5', 'reporting-requirements-deadline': 'reporting-requirements',
  'scripting-risk': 'scripting', 'sdlc-waterfall-model': 'software-development-life-cycle', 'security-zones-purpose': 'security-zones',
  'social-engineering-nickname': 'social-engineering', 'software-based-firewall-notifications': 'notifications', 'software-patching-need': 'software-patching',
  'spyware-privacy-threat': 'spyware', 'transparent-proxy-server': 'proxy-server-b5', 'trojan-horse-back-door': 'trojan-horse',
  'unauthorized-access-methods': 'unauthorized-access', 'unauthorized-access-threat': 'unauthorized-access', 'wireless-zone': 'wireless',
  'worm-network-spread': 'worm',
  // Block 5: retired Block 5 entries follow to the new Block 5 entry of the same term.
  'communications-security': 'communications-security-comsec', 'computer-security-compusec': 'computer-security',
  'controlled-unclassified-information': 'controlled-unclassified-information-cui', 'demilitarized-zone-dmz': 'demilitarized-zone',
  'freedom-of-information-act': 'freedom-of-information-act-foia', 'operations-security': 'operations-security-opsec',
  'transmission-security': 'transmission-security-transec',
  // Block 2: the old Block 2 entries left, so these entries took the plain id.
  'administrator-account-b4': 'administrator-account', 'media-access-control-mac-address-b1': 'media-access-control-mac-address',
  // Block 2: retired Block 2 entries follow to the new Block 2 entry of the same term.
  'accountable-property-officer-apo': 'accountable-property-officer', 'advanced-technology-attachment-ata': 'advanced-technology-attachment',
  'approved-product-list-apl': 'approved-product-list', 'approved-products-certification-office-apco': 'approved-products-certification-office',
  'arithmetic-logic-unit-alu': 'arithmetic-logic-unit', 'central-processing-unit-cpu': 'central-processing-unit',
  'parallel-ata-pata': 'parallel-ata', 'serial-ata-sata': 'serial-ata',
  'united-states-government-configuration-baseline-usgcb': 'united-states-government-configuration-baseline', 'universal-serial-bus-usb-host-controller': 'universal-serial-bus-host-controller',
  // Block 1: retired Block 1 entries follow to the new Block 1 entry of the same term.
  'address-resolution-protocol-arp': 'address-resolution-protocol-b1', 'air-force-instruction-afi': 'air-force-instruction',
  'department-of-defense-manual-dodm': 'department-of-defense-manual', 'domain-name-system-dns': 'domain-name-system-b1',
  'dynamic-host-configuration-protocol-dhcp': 'dynamic-host-configuration-protocol-b1', 'electrostatic-discharge-esd': 'electrostatic-discharge',
  'file-transfer-protocol-ftp': 'file-transfer-protocol', 'hypertext-transfer-protocol-http': 'hypertext-transfer-protocol-b1',
  'internet-assigned-numbers-authority-iana': 'internet-assigned-numbers-authority', 'least-significant-digit-lsd': 'least-significant-digit',
  'lightweight-access-point-lwap': 'lightweight-access-point', 'military-standard-mil-std': 'military-standard',
  'most-significant-digit-msd': 'most-significant-digit', 'optical-time-domain-reflectometer-otdr': 'optical-time-domain-reflectometer',
  'rogue-access-point-ap': 'rogue-access-point', 'root-cause-analysis-rca': 'root-cause-analysis',
  'routing-information-protocol-rip': 'routing-information-protocol-b1', 'service-set-identifier-ssid': 'service-set-identifier',
  'shielded-twisted-pair-stp': 'shielded-twisted-pair', 'single-mode-fiber-smf': 'single-mode-fiber',
  'wireless-metropolitan-area-network-wman': 'wireless-metropolitan-area-network', 'wireless-wide-area-network-wwan': 'wireless-wide-area-network' });
export const restoreBookmarks = (raw, g) => Array.isArray(raw) ? [...new Set(raw.map(id => typeof id === 'string' && Object.hasOwn(RENAMED_ENTRIES, id) ? RENAMED_ENTRIES[id] : id)
  .filter(id => typeof id === 'string' && g.byId.has(id)))] : [];
