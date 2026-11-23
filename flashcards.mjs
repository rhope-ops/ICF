// Flash Cards logic and markup: the card catalog check, which cards can be studied, card sets (Missed Questions and
// Manual) and the HTML of a card and of the saved-sets screen.
// Inputs: the question bank, the cards.json catalog, the saved card-set library and the user's actions.
// Outputs: new state or library objects and HTML strings. Run: imported as an ES module by the app and the tests.
// Network: none.
// Writes: none directly (a caller passes a `store` object; its commit() does the saving, in cards-ui.mjs).
// Credentials: none.
import { LABEL } from './settings.mjs';
import { shuffle } from './engine.mjs';
import { migrateCardSets, MISSED_SET, MANUAL_SET } from './storage.mjs';
import { escape, backLabel, nextLabel, pageLabel } from './presentation.mjs';
import { MISSED_ID, MANUAL_ID } from './flashcards-sets.mjs';
export { MISSED_ID, MANUAL_ID, ALL_BLOCKS, cardBlock, cardsInSet, setEntries, setsBlockHtml, setsBlockValue, savedSetsHtml } from './flashcards-sets.mjs';

// Generated card links; do not edit.
// Each Hard question uses one existing normal card.
// There are no Hard-only cards.
export const HARD_CARD_MAP = Object.freeze({
 "B5-H-U1-Q063": "B5-U1-Q099", "B5-H-U1-Q064": "B5-U1-Q097", "B5-H-U1-Q065": "B5-U1-Q103", "B5-H-U1-Q066": "B5-U1-Q107",
 "B5-H-U1-Q067": "B5-U1-Q110", "B5-H-U1-Q069": "B5-U1-Q112", "B5-H-U1-Q071": "B5-U1-Q116", "B5-H-U1-Q072": "B5-U1-Q117",
 "B5-H-U1-Q073": "B5-U1-Q118", "B5-H-U1-Q074": "B5-U1-Q123", "B5-H-U1-Q076": "B5-U1-Q127", "B5-H-U1-Q077": "B5-U1-Q130",
 "B5-H-U1-Q078": "B5-U1-Q094", "B5-H-U1-Q079": "B5-U1-Q098", "B5-H-U1-Q080": "B5-U1-Q100", "B5-H-U1-Q083": "B5-U1-Q105",
 "B5-H-U1-Q084": "B5-U1-Q114", "B5-H-U1-Q085": "B5-U1-Q115", "B5-H-U2-Q057": "B5-U2-Q092", "B5-H-U2-Q058": "B5-U2-Q093",
 "B5-H-U2-Q060": "B5-U2-Q095", "B5-H-U2-Q061": "B5-U2-Q096", "B5-H-U2-Q062": "B5-U2-Q097", "B5-H-U2-Q063": "B5-U2-Q098",
 "B5-H-U2-Q065": "B5-U2-Q103", "B5-H-U2-Q066": "B5-U2-Q105", "B5-H-U2-Q067": "B5-U2-Q108", "B5-H-U2-Q068": "B5-U2-Q109",
 "B5-H-U2-Q071": "B5-U2-Q112", "B5-H-U2-Q072": "B5-U2-Q114", "B5-H-U2-Q074": "B5-U2-Q118", "B5-H-U3-Q027": "B5-U3-Q050",
 "B5-H-U3-Q029": "B5-U3-Q049", "B5-H-U3-Q030": "B5-U3-Q054", "B5-H-U3-Q031": "B5-U3-Q056", "B5-H-U3-Q032": "B5-U3-Q059",
 "B5-H-U3-Q033": "B5-U3-Q046", "B5-H-U3-Q034": "B5-U3-Q053", "B5-H-U4-Q012": "B5-U4-Q025", "B5-H-U5-Q036": "B5-U5-Q063",
 "B5-H-U5-Q041": "B5-U5-Q054", "B5-H-U5-Q042": "B5-U5-Q056", "B5-H-U5-Q043": "B5-U5-Q057", "B5-H-U5-Q044": "B5-U5-Q067",
 "B5-H-U6-Q033": "B5-U6-Q076", "B5-H-U6-Q034": "B5-U6-Q074", "B5-H-U6-Q035": "B5-U6-Q072", "B5-H-U6-Q036": "B5-U6-Q071",
 "B5-H-U6-Q037": "B5-U6-Q068", "B5-H-U6-Q039": "B5-U6-Q077", "B5-H-U6-Q040": "B5-U6-Q065", "B5-H-U6-Q041": "B5-U6-Q067",
 "B5-H-U7-Q065": "B5-U7-Q100", "B5-H-U7-Q066": "B5-U7-Q101", "B5-H-U7-Q067": "B5-U7-Q102", "B5-H-U7-Q068": "B5-U7-Q092",
 "B5-H-U7-Q070": "B5-U7-Q090", "B5-H-U7-Q071": "B5-U7-Q105", "B5-H-U7-Q072": "B5-U7-Q106", "B5-H-U7-Q073": "B5-U7-Q109",
 "B5-H-U7-Q074": "B5-U7-Q110", "B5-H-U7-Q076": "B5-U7-Q113", "B5-H-U7-Q077": "B5-U7-Q085", "B5-H-U7-Q081": "B5-U7-Q119",
 "B5-H-U7-Q082": "B5-U7-Q121", "B5-H-U7-Q084": "B5-U7-Q125", "B5-H-U7-Q085": "B5-U7-Q126", "B5-H-U7-Q086": "B5-U7-Q129",
 "B5-H-U7-Q087": "B5-U7-Q132", "B5-H-U7-Q088": "B5-U7-Q133", "B5-H-U7-Q089": "B5-U7-Q134", "B5-H-U7-Q090": "B5-U7-Q135",
 "B3-H-U1-Q036": "B3-U1-Q115", "B3-H-U1-Q037": "B3-U1-Q116", "B3-H-U1-Q038": "B3-U1-Q117", "B3-H-U1-Q039": "B3-U1-Q103",
 "B3-H-U1-Q041": "B3-U1-Q108", "B3-H-U1-Q043": "B3-U1-Q111", "B3-H-U1-Q044": "B3-U1-Q112", "B3-H-U1-Q045": "B3-U1-Q113",
 "B3-H-U1-Q046": "B3-U1-Q089", "B3-H-U1-Q047": "B3-U1-Q095", "B3-H-U1-Q048": "B3-U1-Q096", "B3-H-U1-Q051": "B3-U1-Q100",
 "B3-H-U1-Q052": "B3-U1-Q101", "B3-H-U1-Q053": "B3-U1-Q106", "B3-H-U1-Q054": "B3-U1-Q107", "B3-H-U1-Q055": "B3-U1-Q109",
 "B3-H-U1-Q056": "B3-U1-Q102", "B3-H-U2-Q018": "B3-U2-Q041", "B3-H-U2-Q019": "B3-U2-Q044", "B3-H-U2-Q020": "B3-U2-Q040",
 "B3-H-U2-Q021": "B3-U2-Q039", "B3-H-U2-Q022": "B3-U2-Q038", "B3-H-U2-Q023": "B3-U2-Q037", "B3-H-U2-Q024": "B3-U2-Q043",
 "B3-H-U3-Q070": "B3-U3-Q209", "B3-H-U3-Q071": "B3-U3-Q216", "B3-H-U3-Q074": "B3-U3-Q212", "B3-H-U3-Q075": "B3-U3-Q214",
 "B3-H-U3-Q076": "B3-U3-Q201", "B3-H-U3-Q077": "B3-U3-Q208", "B3-H-U3-Q078": "B3-U3-Q211", "B3-H-U3-Q079": "B3-U3-Q219",
 "B3-H-U3-Q080": "B3-U3-Q223", "B3-H-U3-Q081": "B3-U3-Q217", "B3-H-U3-Q082": "B3-U3-Q206", "B3-H-U3-Q083": "B3-U3-Q224",
 "B3-H-U3-Q084": "B3-U3-Q215", "B3-H-U3-Q085": "B3-U3-Q204", "B3-H-U3-Q086": "B3-U3-Q225", "B3-H-U3-Q087": "B3-U3-Q226",
 "B3-H-U3-Q088": "B3-U3-Q228", "B3-H-U3-Q089": "B3-U3-Q229", "B3-H-U3-Q090": "B3-U3-Q230", "B3-H-U3-Q091": "B3-U3-Q231",
 "B3-H-U3-Q092": "B3-U3-Q242", "B3-H-U3-Q093": "B3-U3-Q234", "B3-H-U3-Q094": "B3-U3-Q235", "B3-H-U3-Q095": "B3-U3-Q239",
 "B3-H-U3-Q098": "B3-U3-Q245", "B3-H-U3-Q099": "B3-U3-Q246", "B3-H-U3-Q100": "B3-U3-Q247", "B3-H-U3-Q101": "B3-U3-Q249",
 "B3-H-U3-Q102": "B3-U3-Q248", "B3-H-U3-Q103": "B3-U3-Q253", "B3-H-U3-Q104": "B3-U3-Q236", "B3-H-U4-Q012": "B3-U4-Q034",
 "B3-H-U5-Q009": "B3-U5-Q025", "B3-H-U5-Q010": "B3-U5-Q024", "B3-H-U5-Q011": "B3-U5-Q023", "B3-H-U5-Q012": "B3-U5-Q022",
 "B3-H-U6-Q026": "B3-U6-Q070", "B3-H-U6-Q027": "B3-U6-Q071", "B3-H-U6-Q029": "B3-U6-Q078", "B3-H-U6-Q030": "B3-U6-Q072",
 "B3-H-U6-Q031": "B3-U6-Q082", "B3-H-U6-Q032": "B3-U6-Q080", "B3-H-U6-Q033": "B3-U6-Q075", "B3-H-U6-Q034": "B3-U6-Q076",
 "B3-H-U6-Q035": "B3-U6-Q074", "B4-H-U1-Q027": "B4-U1-Q067", "B4-H-U1-Q029": "B4-U1-Q073", "B4-H-U1-Q030": "B4-U1-Q072",
 "B4-H-U1-Q031": "B4-U1-Q075", "B4-H-U1-Q032": "B4-U1-Q076", "B4-H-U1-Q034": "B4-U1-Q062", "B4-H-U1-Q035": "B4-U1-Q063",
 "B4-H-U1-Q038": "B4-U1-Q064", "B4-H-U1-Q039": "B4-U1-Q065", "B4-H-U1-Q040": "B4-U1-Q069", "B4-H-U2-Q042": "B4-U2-Q121",
 "B4-H-U2-Q043": "B4-U2-Q122", "B4-H-U2-Q044": "B4-U2-Q110", "B4-H-U2-Q045": "B4-U2-Q115", "B4-H-U2-Q050": "B4-U2-Q111",
 "B4-H-U2-Q051": "B4-U2-Q112", "B4-H-U2-Q052": "B4-U2-Q113", "B4-H-U2-Q053": "B4-U2-Q114", "B4-H-U2-Q054": "B4-U2-Q119",
 "B4-H-U2-Q055": "B4-U2-Q120", "B4-H-U2-Q057": "B4-U2-Q100", "B4-H-U2-Q058": "B4-U2-Q104", "B4-H-U2-Q060": "B4-U2-Q099",
 "B4-H-U2-Q061": "B4-U2-Q101", "B4-H-U2-Q062": "B4-U2-Q106", "B4-H-U2-Q063": "B4-U2-Q118", "B4-H-U3-Q027": "B4-U3-Q058",
 "B4-H-U3-Q028": "B4-U3-Q059", "B4-H-U3-Q029": "B4-U3-Q065", "B4-H-U3-Q030": "B4-U3-Q068", "B4-H-U3-Q032": "B4-U3-Q070",
 "B4-H-U3-Q034": "B4-U3-Q053", "B4-H-U3-Q035": "B4-U3-Q061", "B4-H-U3-Q036": "B4-U3-Q063", "B4-H-U3-Q037": "B4-U3-Q060",
 "B4-H-U3-Q038": "B4-U3-Q056", "B4-H-U3-Q041": "B4-U3-Q057", "B4-H-U4-Q032": "B4-U4-Q080", "B4-H-U4-Q033": "B4-U4-Q081",
 "B4-H-U4-Q035": "B4-U4-Q069", "B4-H-U4-Q036": "B4-U4-Q066", "B4-H-U4-Q037": "B4-U4-Q061", "B4-H-U4-Q038": "B4-U4-Q075",
 "B4-H-U4-Q040": "B4-U4-Q077", "B4-H-U4-Q041": "B4-U4-Q062", "B4-H-U4-Q042": "B4-U4-Q063", "B4-H-U4-Q043": "B4-U4-Q067",
 "B4-H-U4-Q044": "B4-U4-Q064", "B4-H-U4-Q045": "B4-U4-Q073", "B4-H-U4-Q046": "B4-U4-Q065", "B4-H-U4-Q047": "B4-U4-Q070",
 "B4-H-U5-Q020": "B4-U5-Q033", "B4-H-U5-Q021": "B4-U5-Q030", "B4-H-U5-Q022": "B4-U5-Q031", "B4-H-U5-Q024": "B4-U5-Q032",
 "B4-H-U5-Q025": "B4-U5-Q036", "B4-H-U6-Q019": "B4-U6-Q037", "B4-H-U6-Q020": "B4-U6-Q036", "B4-H-U6-Q021": "B4-U6-Q035",
 "B4-H-U6-Q022": "B4-U6-Q039", "B4-H-U6-Q023": "B4-U6-Q040", "B4-H-U6-Q024": "B4-U6-Q041", "B4-H-U6-Q025": "B4-U6-Q034",
 "B4-H-U7-Q016": "B4-U7-Q027", "B4-H-U7-Q017": "B4-U7-Q030", "B4-H-U7-Q018": "B4-U7-Q029", "B4-H-U7-Q019": "B4-U7-Q028",
 "B4-H-U8-Q013": "B4-U8-Q024", "B4-H-U8-Q016": "B4-U8-Q023", "B4-H-U8-Q018": "B4-U8-Q025", "B4-H-U8-Q019": "B4-U8-Q020",
 "B4-H-U8-Q020": "B4-U8-Q022", "B2-H-U1-Q086": "B2-U1-Q058", "B2-H-U1-Q087": "B2-U1-Q059", "B2-H-U1-Q088": "B2-U1-Q061",
 "B2-H-U1-Q089": "B2-U1-Q062", "B2-H-U1-Q090": "B2-U1-Q063", "B2-H-U1-Q091": "B2-U1-Q066", "B2-H-U1-Q092": "B2-U1-Q067",
 "B2-H-U1-Q093": "B2-U1-Q068", "B2-H-U1-Q094": "B2-U1-Q069", "B2-H-U1-Q095": "B2-U1-Q070", "B2-H-U1-Q096": "B2-U1-Q074",
 "B2-H-U1-Q097": "B2-U1-Q077", "B2-H-U1-Q098": "B2-U1-Q078", "B2-H-U1-Q099": "B2-U1-Q079", "B2-H-U1-Q100": "B2-U1-Q080",
 "B2-H-U1-Q101": "B2-U1-Q128", "B2-H-U1-Q102": "B2-U1-Q129", "B2-H-U1-Q103": "B2-U1-Q130", "B2-H-U1-Q104": "B2-U1-Q131",
 "B2-H-U1-Q105": "B2-U1-Q132", "B2-H-U1-Q106": "B2-U1-Q135", "B2-H-U1-Q107": "B2-U1-Q137", "B2-H-U1-Q108": "B2-U1-Q139",
 "B2-H-U1-Q109": "B2-U1-Q140", "B2-H-U1-Q110": "B2-U1-Q142", "B2-H-U1-Q111": "B2-U1-Q143", "B2-H-U1-Q112": "B2-U1-Q144",
 "B2-H-U1-Q113": "B2-U1-Q145", "B2-H-U1-Q114": "B2-U1-Q146", "B2-H-U1-Q115": "B2-U1-Q149", "B2-H-U1-Q116": "B2-U1-Q151",
 "B2-H-U1-Q117": "B2-U1-Q064", "B2-H-U1-Q118": "B2-U1-Q154", "B2-H-U1-Q119": "B2-U1-Q085", "B2-H-U1-Q121": "B2-U1-Q092",
 "B2-H-U1-Q122": "B2-U1-Q093", "B2-H-U1-Q125": "B2-U1-Q096", "B2-H-U1-Q126": "B2-U1-Q100", "B2-H-U1-Q128": "B2-U1-Q104",
 "B2-H-U1-Q129": "B2-U1-Q107", "B2-H-U1-Q130": "B2-U1-Q110", "B2-H-U1-Q131": "B2-U1-Q111", "B2-H-U1-Q132": "B2-U1-Q113",
 "B2-H-U1-Q133": "B2-U1-Q119", "B2-H-U1-Q134": "B2-U1-Q122", "B2-H-U1-Q135": "B2-U1-Q123", "B2-H-U2-Q027": "B2-U2-Q055",
 "B2-H-U2-Q028": "B2-U2-Q057", "B2-H-U2-Q029": "B2-U2-Q059", "B2-H-U2-Q030": "B2-U2-Q061", "B2-H-U2-Q031": "B2-U2-Q063",
 "B2-H-U2-Q032": "B2-U2-Q067", "B2-H-U2-Q033": "B2-U2-Q069", "B2-H-U2-Q034": "B2-U2-Q071", "B2-H-U2-Q035": "B2-U2-Q072",
 "B2-H-U2-Q036": "B2-U2-Q073", "B2-H-U2-Q037": "B2-U2-Q075", "B2-H-U2-Q038": "B2-U2-Q077", "B2-H-U2-Q039": "B2-U2-Q078",
 "B2-H-U2-Q040": "B2-U2-Q079", "B2-H-U2-Q041": "B2-U2-Q080", "B2-H-U2-Q042": "B2-U2-Q081", "B2-H-U3-Q010": "B2-U3-Q025",
 "B2-H-U3-Q011": "B2-U3-Q023", "B2-H-U3-Q012": "B2-U3-Q024", "B2-H-U3-Q013": "B2-U3-Q026", "B2-H-U3-Q014": "B2-U3-Q027",
 "B2-H-U3-Q015": "B2-U3-Q029", "B2-H-U3-Q016": "B2-U3-Q033", "B2-H-U4-Q009": "B2-U4-Q015", "B2-H-U5-Q007": "B2-U5-Q007",
 "B2-H-U5-Q008": "B2-U5-Q008", "B2-H-U5-Q009": "B2-U5-Q013", "B1-H-U2-Q016": "B1-U2-Q015", "B1-H-U2-Q017": "B1-U2-Q018",
 "B1-H-U2-Q018": "B1-U2-Q019", "B1-H-U2-Q019": "B1-U2-Q021", "B1-H-U2-Q020": "B1-U2-Q022", "B1-H-U2-Q021": "B1-U2-Q024",
 "B1-H-U2-Q022": "B1-U2-Q028", "B1-H-U2-Q023": "B1-U2-Q029", "B1-H-U2-Q024": "B1-U2-Q030", "B1-H-U2-Q025": "B1-U2-Q032",
 "B1-H-U2-Q026": "B1-U2-Q033", "B1-H-U2-Q027": "B1-U2-Q038", "B1-H-U2-Q028": "B1-U2-Q037", "B1-H-U3-Q009": "B1-U3-Q015",
 "B1-H-U3-Q010": "B1-U3-Q017", "B1-H-U3-Q011": "B1-U3-Q018", "B1-H-U3-Q012": "B1-U3-Q020", "B1-H-U3-Q013": "B1-U3-Q021",
 "B1-H-U4-Q022": "B1-U4-Q030", "B1-H-U4-Q023": "B1-U4-Q031", "B1-H-U4-Q024": "B1-U4-Q032", "B1-H-U4-Q025": "B1-U4-Q033",
 "B1-H-U4-Q026": "B1-U4-Q035", "B1-H-U4-Q027": "B1-U4-Q037", "B1-H-U4-Q028": "B1-U4-Q034", "B1-H-U4-Q029": "B1-U4-Q039",
 "B1-H-U4-Q030": "B1-U4-Q040", "B1-H-U4-Q031": "B1-U4-Q038", "B1-H-U4-Q032": "B1-U4-Q041", "B1-H-U4-Q033": "B1-U4-Q042",
 "B1-H-U5-Q020": "B1-U5-Q027", "B1-H-U5-Q021": "B1-U5-Q033", "B1-H-U5-Q023": "B1-U5-Q030", "B1-H-U5-Q024": "B1-U5-Q028",
 "B1-H-U5-Q025": "B1-U5-Q042", "B1-H-U5-Q026": "B1-U5-Q026", "B1-H-U5-Q027": "B1-U5-Q034", "B1-H-U5-Q028": "B1-U5-Q037",
 "B1-H-U5-Q029": "B1-U5-Q041", "B1-H-U6-Q013": "B1-U6-Q018", "B1-H-U6-Q014": "B1-U6-Q019", "B1-H-U6-Q015": "B1-U6-Q020",
 "B1-H-U6-Q016": "B1-U6-Q021", "B1-H-U6-Q017": "B1-U6-Q034", "B1-H-U6-Q018": "B1-U6-Q022", "B1-H-U6-Q019": "B1-U6-Q023",
 "B1-H-U6-Q020": "B1-U6-Q028", "B1-H-U6-Q021": "B1-U6-Q029", "B1-H-U6-Q022": "B1-U6-Q030", "B1-H-U7-Q015": "B1-U7-Q021",
 "B1-H-U7-Q016": "B1-U7-Q023", "B1-H-U7-Q017": "B1-U7-Q025", "B1-H-U7-Q018": "B1-U7-Q031", "B1-H-U7-Q019": "B1-U7-Q026",
 "B1-H-U7-Q020": "B1-U7-Q034", "B1-H-U7-Q021": "B1-U7-Q028", "B1-H-U7-Q022": "B1-U7-Q035", "B1-H-U7-Q023": "B1-U7-Q036",
 "B1-H-U7-Q024": "B1-U7-Q029", "B1-H-U8-Q009": "B1-U8-Q012", "B1-H-U8-Q010": "B1-U8-Q016", "B1-H-U8-Q011": "B1-U8-Q018",
 "B1-H-U8-Q012": "B1-U8-Q020", "B1-H-U8-Q013": "B1-U8-Q019", "B1-H-U9-Q005": "B1-U9-Q009", "B1-H-U10-Q013": "B1-U10-Q021",
 "B1-H-U10-Q014": "B1-U10-Q029", "B1-H-U11-Q010": "B1-U11-Q019", "B1-H-U11-Q011": "B1-U11-Q020", "B1-H-U11-Q012": "B1-U11-Q022",
 "B1-H-U11-Q013": "B1-U11-Q026", "B5-H-U2-Q075": "B5-U2-Q113", "B5-H-U2-Q076": "B5-U2-Q094"
});

// Near-duplicate normal cards merged. The linked question keeps
// its own place in the bank and studies the kept card; saved sets migrate to the kept ID.
export const MERGED_CARDS = Object.freeze({  });
// End of generated card links.
const linkedFrom = Object.entries(MERGED_CARDS).reduce((m, [from, to]) => m.set(to, [...(m.get(to) || []), from]), new Map());
// True when a question can be a flash card: not Hard, Easy or Medium, and with a non-empty review cue.
const cardEligible = q => q && q.studyMode !== 'Hard' && ['Easy','Medium'].includes(q.difficulty) && typeof q.reviewCue === 'string' && Boolean(q.reviewCue.trim());

// The served catalog (site/dist/cards.json, loaded after the first screen): schema 1, a list of authored factual cards,
// each linked to an approved normal-bank question ID. A file of any other form is refused, so no card shows.
const CATALOG_SCHEMA = 1;
/** Check the loaded catalog file and return its cards.
 * @param {object} raw the parsed cards.json
 * @returns {Array<{questionId: string, term: string, definition: string}>} the cards
 */
export function restoreCatalog(raw) {
  const cards = raw?.schema === CATALOG_SCHEMA && Array.isArray(raw.cards) ? raw.cards : null;
  if (!cards || !cards.every(c => c && ['questionId', 'term', 'definition'].every(k => typeof c[k] === 'string' && c[k].trim())))
    throw Error('The flash card file could not be read.');
  return cards;
}

/** The cards that can be studied now: each catalog card whose question is in the bank, with that question's hint
 * (reviewCue), block and units. Hints resolve from the shared reviewCue; saved sets store only source IDs.
 * @param {Array<object>} questions the served questions
 * @param {Array<object>} catalog the cards of restoreCatalog (an empty list before the catalog has loaded)
 * @returns {Array<object>} the cards, each with reviewCue, block and units
 */
export function previewCards(questions, catalog) {
  const byId = new Map(questions.map(q => [q.id, q]));
  return catalog.flatMap(card => {
    // The card's own question first; otherwise a merged question in scope supplies cue and units.
    const q = [card.questionId, ...(linkedFrom.get(card.questionId) || [])].map(id => byId.get(id)).find(cardEligible);
    if (!q) return [];
    return [{ ...card, reviewCue: q.reviewCue, block: q.block, units: [...q.units] }];
  });
}

// Start a card session: shuffle the cards and give each a random first side; throw when there are no cards.
export function startCards(cards, random = Math.random) {
  if (!cards.length) throw Error(`No Flash Cards match these ${LABEL.sections}`);
  return { cards: shuffle(cards, random).map(card => ({ ...card,
    initialSide: random() < 0.5 ? 'definition' : 'term', flipped: false, hintUsed: false })), index: 0 };
}

// Apply one action (flip, hint, previous or next) to a card session and return the new state.
export function moveCards(state, event) {
  const next = { ...state, cards: state.cards.map(c => ({ ...c })) };
  const card = next.cards[next.index];
  if (event === 'flip') card.flipped = !card.flipped;
  else if (event === 'hint') card.hintUsed = true;
  else if (event === 'previous') next.index = Math.max(0, next.index - 1);
  else if (event === 'next') next.index = Math.min(next.cards.length - 1, next.index + 1);
  return next;
}

// Highlight cards carry their own user-edited faces and a source location;
// question cards stay ID-only and resolve against the current catalog.
export const cardKey = card => card.kind === 'highlight' ? card.id : card.questionId;

// Find the catalog card for a question id, following the Hard-question and merged-card maps; null when none.
export function cardForQuestion(catalogCards, id) {
  const target = HARD_CARD_MAP[id] || MERGED_CARDS[id] || id;
  return catalogCards.find(c => c.questionId === target) || null;
}

/**
 * Build the HTML of the current flash card with its Back, Next and Hint controls. `missed` shows a Missed set tag
 * beside the unit. `tools` is extra buttons for the row under Back, at its left (Open in Glossary); Hint stays at the
 * right, under Next.
 * @param {object} state the card session (cards, index).
 * @param {object} [options] saveBox (HTML), unit (label), missed (boolean) and tools (HTML).
 * @returns {string} the HTML.
 */
export function cardHtml(state, { saveBox = '', unit = '', missed = false, tools = '' } = {}) {
  const c = state.cards[state.index], highlight = c.kind === 'highlight';
  const side = c.flipped ? (c.initialSide === 'definition' ? 'term' : 'definition') : c.initialSide;
  const cue = highlight ? `<span class="label">Source</span><p>${escape(pageLabel(c.source.label, c.source.page))}</p>` : `<span class="label">Review cue</span><p>${escape(c.reviewCue)}</p>`;
  const last = state.index === state.cards.length - 1;
  return `<button id="flash-card" class="flash-card" data-side="${side}" aria-describedby="flash-instruction">
      <span class="flash-head"><span class="flash-side label">${side === 'definition' ? 'Definition' : 'Term'}</span>${missed || unit ? `<span class="flash-meta">${missed ? '<span class="tag in-missed" data-tone="bad">Missed set</span>' : ''}${unit ? `<span class="flash-unit label">${escape(unit)}</span>` : ''}</span>` : ''}</span>
      <span class="flash-content">${escape(side === 'definition' ? c.definition : c.term)}</span>
      <span class="flash-affordance mono" aria-hidden="true"><span class="on-touch">Tap to flip</span><span class="on-pointer">Click to flip</span></span>
    </button>
    <p id="flash-instruction" class="sr-only">Card ${state.index + 1} of ${state.cards.length}. Recall the other side, then tap the card or press Enter or Space to flip.</p>
    <div id="flash-cue" class="flash-cue" role="status">${c.hintUsed ? cue : ''}</div>${saveBox}
    <div class="navrow actions question-actions"><button id="flash-previous" ${state.index === 0 ? 'disabled' : ''}>${backLabel('Back')}</button><button class="primary" id="flash-next">${nextLabel(last ? 'Finish cards' : 'Next')}</button></div>
    <div class="tool-row"><button id="flash-hint" class="card-hint" aria-controls="flash-cue" ${c.hintUsed ? 'disabled' : ''}>${c.hintUsed ? 'Hint shown' : 'Hint'}</button>${tools}</div>`;
}

// Card sets, schema 3: exactly two fixed sets, Missed Questions (automatic) and Manual (the SAVE button),
// in that order. Schema 1 (question IDs only) and schema 2 (adds highlight cards) are the pinned older versions: their
// shape is checked here, then storage.migrateCardSets merges every other set into Manual. Any other schema is refused.
const CARD_SET_SCHEMA = 3, OLD_SET_LIMIT = 500, SET_LIMIT = 50000, ADD_LIMIT = 2000;
const SAFE_ID = /^[\w-]{1,100}$/, DOC_ID = /^[A-Z0-9-]{1,20}$/;
// True when the value is a string without edge spaces and with a length from 1 to `max`.
const clean = (value, max) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
// True when the value is a well-formed highlight source: document, label, page and a start and end position.
const validSource = s => s && DOC_ID.test(s.doc ?? '') && clean(s.label, 80) && Number.isInteger(s.page) && s.page >= 1 &&
  Number.isInteger(s.start) && s.start >= 0 && Number.isInteger(s.end) && s.end > s.start && Object.keys(s).length === 5;
// True when the value is a well-formed saved highlight card.
const validCard = c => c && c.kind === 'highlight' && SAFE_ID.test(c.id ?? '') && clean(c.term, 80) && clean(c.definition, 1000) &&
  validSource(c.source) && Object.keys(c).length === 5;
// True when the value is a well-formed card set for the given schema and size limit.
const validSet = (s, schema, limit) => s && typeof s.id === 'string' && SAFE_ID.test(s.id) &&
  typeof s.name === 'string' && s.name.trim() && s.name === s.name.trim() && s.name.length <= 40 &&
  Array.isArray(s.questionIds) && s.questionIds.length <= limit && new Set(s.questionIds).size === s.questionIds.length &&
  s.questionIds.every(id => typeof id === 'string' && SAFE_ID.test(id)) &&
  (schema === 1 ? !('cards' in s) : Array.isArray(s.cards) && s.cards.length <= limit && new Set(s.cards.map(c => c?.id)).size === s.cards.length && s.cards.every(validCard));
// Schemas 1 and 2: any number (up to 100) of uniquely named sets.
const validOldSets = (sets, schema) => Array.isArray(sets) && sets.length <= 100 && new Set(sets.map(s => s?.id)).size === sets.length &&
  new Set(sets.map(s => s?.name?.toLowerCase())).size === sets.length && sets.every(s => validSet(s, schema, OLD_SET_LIMIT));
// Schema 3: Missed Questions then Manual, with their fixed IDs and names.
const FIXED = [MISSED_SET, MANUAL_SET];
// True when the sets are exactly the two fixed sets, Missed Questions then Manual.
const validFixedSets = sets => Array.isArray(sets) && sets.length === 2 &&
  sets.every((s, i) => validSet(s, 2, SET_LIMIT) && s.id === FIXED[i].id && s.name === FIXED[i].name);
// Return a new library with the two fixed sets and no cards.
const emptyLibrary = () => ({ schema: CARD_SET_SCHEMA, sets: FIXED.map(f => ({ ...f, questionIds: [], cards: [] })) });

// Check a saved library and return a clean copy (older schemas are migrated); throw when it cannot be read.
export function restoreCardSets(raw = emptyLibrary()) {
  if (raw && [1, 2].includes(raw.schema) && validOldSets(raw.sets, raw.schema)) raw = migrateCardSets(raw);
  if (!raw || raw.schema !== CARD_SET_SCHEMA || !validFixedSets(raw.sets)) throw Error('Saved card sets could not be read.');
  return { schema: CARD_SET_SCHEMA, sets: raw.sets.map(s => ({ id:s.id, name:s.name, questionIds:[...new Set(s.questionIds.map(id => MERGED_CARDS[id] || id))],
    cards: s.cards.map(c => ({ id:c.id, kind:c.kind, term:c.term, definition:c.definition, source:{ ...c.source } })) })) };
}

// Copy a highlight card, trimming its text, into the shape that is stored.
const storedCard = c => ({ id:c.id, kind:'highlight', term:String(c.term).trim(), definition:String(c.definition).trim(), source:{ doc:c.source.doc, label:c.source.label, page:c.source.page, start:c.source.start, end:c.source.end } });
// Add a card (a question card, or a saved highlight card) to Missed Questions or Manual.
export function addCardToSet(library, setId, card) {
  const next = restoreCardSets(library), set = next.sets.find(s => s.id === setId);
  if (!set) throw Error('That set does not exist.');
  const list = card.kind === 'highlight' ? set.cards : set.questionIds, key = cardKey(card);
  if (list.some(x => (x.id ?? x) === key)) return next;
  if (list.length >= ADD_LIMIT) throw Error(`A set holds up to ${ADD_LIMIT} cards.`);
  list.push(card.kind === 'highlight' ? storedCard(card) : card.questionId);
  return restoreCardSets(next);
}

// Remove a card (by key) from a set of the library and return the new library.
export function removeSavedCard(library, setId, key) {
  const next = restoreCardSets(library), set = next.sets.find(s => s.id === setId);
  if (set) { set.questionIds = set.questionIds.filter(id => id !== key); set.cards = set.cards.filter(c => c.id !== key); }
  return next;
}

// True when the set already holds the card.
export function setHasCard(set, card) {
  return Boolean(set && (card.kind === 'highlight' ? set.cards.some(c => c.id === card.id) : set.questionIds.includes(card.questionId)));
}
// True when the Manual set already holds the card.
export const manualHas = (library, card) => setHasCard(library.sets.find(s => s.id === MANUAL_ID), card);

// ---- Saving cards ----
// store: { library(): current library, commit(next): true when saved, fail(message) }.
export function writeSetCard(store, setId, card, on) {
  try { return store.commit(on ? addCardToSet(store.library(), setId, card) : removeSavedCard(store.library(), setId, cardKey(card))); }
  catch (error) { store.fail(error.message); return false; }
}
// Question screen: key names one resolved appearance. Dynamic Flash Cards adds a missed question's card to
// Missed Questions once per appearance (unchanged); the SAVE button writes to Manual on its own.
export function questionSaveBox(store, box, { key, card, missed, dynamic }) {
  if (box?.key === key) return box;
  if (dynamic && missed && !setHasCard(store.library().sets.find(s => s.id === MISSED_ID), card)) writeSetCard(store, MISSED_ID, card, true);
  return { key, card };
}
