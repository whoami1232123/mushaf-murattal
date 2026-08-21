/*
 * Tajweed markup parser for the alquran.cloud "quran-tajweed" edition.
 * Bracket format e.g. "[h:1[ٱ]" -> rule code "h", optional numeric id, wrapped text "ٱ".
 * Rule table sourced from the official islamic-network/alquran-tools PHP parser
 * (identifiers + CSS classes) merged with the alquran.cloud tajweed-guide color legend.
 */
const TAJWEED_RULES = {
  h: { cls: 'tw-ham_wasl',    name: 'همزة الوصل',                 color: '#AAAAAA' },
  s: { cls: 'tw-slnt',        name: 'حرف ساكن',                    color: '#AAAAAA' },
  l: { cls: 'tw-slnt',        name: 'لام شمسية',                   color: '#AAAAAA' },
  n: { cls: 'tw-madda_n',     name: 'مد عادي (٢ حركات)',            color: '#537FFF' },
  p: { cls: 'tw-madda_p',     name: 'مد جائز (٢/٤/٦ حركات)',        color: '#4050FF' },
  m: { cls: 'tw-madda_m',     name: 'مد لازم (٦ حركات)',            color: '#000EBC' },
  q: { cls: 'tw-qlq',         name: 'قلقلة',                       color: '#DD0008' },
  o: { cls: 'tw-madda_o',     name: 'مد واجب (٤-٥ حركات)',          color: '#2144C1' },
  c: { cls: 'tw-ikhf_shfw',   name: 'إخفاء شفوي',                  color: '#D500B7' },
  f: { cls: 'tw-ikhf',        name: 'إخفاء',                       color: '#9400A8' },
  w: { cls: 'tw-idghm_shfw',  name: 'إدغام شفوي',                  color: '#58B800' },
  i: { cls: 'tw-iqlb',        name: 'إقلاب',                       color: '#26BFFD' },
  a: { cls: 'tw-idgh_ghn',    name: 'إدغام بغنة',                  color: '#169777' },
  u: { cls: 'tw-idgh_wghn',   name: 'إدغام بلا غنة',                color: '#169200' },
  d: { cls: 'tw-idgh_mus',    name: 'إدغام متجانسين',               color: '#A1A1A1' },
  b: { cls: 'tw-idgh_mus',    name: 'إدغام متقاربين',               color: '#A1A1A1' },
  g: { cls: 'tw-ghn',         name: 'غنة',                         color: '#FF7E1E' },
};

const TAJWEED_BRACKET_RE = /\[([a-z])(?::\d+)?\[([^\]]*)\]/g;

/** Parse alquran.cloud tajweed bracket markup into safe HTML spans. */
function parseTajweedText(rawText) {
  if (!rawText) return '';
  let out = '';
  let lastIndex = 0;
  TAJWEED_BRACKET_RE.lastIndex = 0;
  let match;
  while ((match = TAJWEED_BRACKET_RE.exec(rawText)) !== null) {
    out += escapeHtml(rawText.slice(lastIndex, match.index));
    const rule = TAJWEED_RULES[match[1]];
    const inner = escapeHtml(match[2]);
    if (rule) {
      out += `<span class="${rule.cls}" title="${rule.name}">${inner}</span>`;
    } else {
      out += inner;
    }
    lastIndex = TAJWEED_BRACKET_RE.lastIndex;
  }
  out += escapeHtml(rawText.slice(lastIndex));
  return out;
}

/** Strip tajweed markup down to plain Arabic text (no HTML, no brackets). */
function stripTajweedMarkup(rawText) {
  if (!rawText) return '';
  return rawText.replace(TAJWEED_BRACKET_RE, '$2');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the CSS + legend list once, shared by mushaf view and lessons. */
function tajweedLegendEntries() {
  const seen = new Map();
  for (const code in TAJWEED_RULES) {
    const r = TAJWEED_RULES[code];
    if (!seen.has(r.cls)) seen.set(r.cls, r);
  }
  return Array.from(seen.values());
}

function injectTajweedCss() {
  const style = document.createElement('style');
  let css = '';
  const seen = new Set();
  for (const code in TAJWEED_RULES) {
    const r = TAJWEED_RULES[code];
    if (seen.has(r.cls)) continue;
    seen.add(r.cls);
    css += `.${r.cls}{color:${r.color};}\n`;
  }
  css += `.no-tajweed [class^="tw-"]{color:inherit !important;}\n`;
  style.textContent = css;
  document.head.appendChild(style);
}
injectTajweedCss();
