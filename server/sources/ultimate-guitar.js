// Ultimate Guitar provider. UG pages embed their data as HTML-escaped JSON in
// <div class="js-store" data-content="...">, which is what we parse here.
// This depends on UG's internal page structure and may break if they change it.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const name = 'ultimate-guitar';
export const label = 'Ultimate Guitar';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ALLOWED_HOSTS = new Set(['www.ultimate-guitar.com', 'tabs.ultimate-guitar.com']);

// PHP's htmlspecialchars/htmlentities (what UG's templating uses) escapes
// accented letters as named entities, e.g. Garc&iacute;a. This table covers
// the Latin-1 letters that show up in Spanish/European titles and artists;
// numeric entities (&#225; / &#x00e1;) are decoded generically below.
const NAMED_ENTITIES = {
  aacute: 'á', Aacute: 'Á',
  eacute: 'é', Eacute: 'É',
  iacute: 'í', Iacute: 'Í',
  oacute: 'ó', Oacute: 'Ó',
  uacute: 'ú', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ',
  uuml: 'ü', Uuml: 'Ü',
  agrave: 'à', Agrave: 'À',
  egrave: 'è', Egrave: 'È',
  igrave: 'ì', Igrave: 'Ì',
  ograve: 'ò', Ograve: 'Ò',
  ugrave: 'ù', Ugrave: 'Ù',
  ccedil: 'ç', Ccedil: 'Ç',
  nbsp: ' ',
  hellip: '…',
  ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    // &amp; must be decoded last or nested entities (e.g. &amp;aacute;) double-decode.
    .replaceAll('&amp;', '&');
}

// UG sits behind Cloudflare, which rejects Node's TLS fingerprint but accepts
// curl's, so we fetch pages through the system curl binary. execFile (no shell)
// plus the host allowlist above keeps this safe.
async function curlGet(u) {
  const args = [
    '-sS', '--compressed', '--max-time', '20',
    '-w', '\n%{http_code}',
    '-A', UA,
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-H', 'Upgrade-Insecure-Requests: 1',
    '-H', 'Sec-Fetch-Dest: document',
    '-H', 'Sec-Fetch-Mode: navigate',
    '-H', 'Sec-Fetch-Site: none',
    '-H', 'Sec-Fetch-User: ?1',
    u.href,
  ];
  const { stdout } = await execFileAsync('curl', args, {
    maxBuffer: 20 * 1024 * 1024,
  });
  const nl = stdout.lastIndexOf('\n');
  const status = Number(stdout.slice(nl + 1).trim());
  const body = stdout.slice(0, nl);
  return { status, body };
}

async function fetchStore(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error('not an https ultimate-guitar.com URL');
  }
  const { status, body: html } = await curlGet(u);
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} from ultimate-guitar.com`);
  }
  const m = html.match(/class="js-store"\s+data-content="([^"]+)"/);
  if (!m) throw new Error('page layout changed: js-store data not found');
  return JSON.parse(decodeEntities(m[1]));
}

// Result types that cannot be imported as plain text (paid Pro/Official
// formats, Guitar Pro files, video lessons); the UI should never offer them.
const EXCLUDED_TYPES = new Set(['Pro', 'Power', 'Official', 'Video']);

export async function search(q) {
  const url =
    'https://www.ultimate-guitar.com/search.php?search_type=title&value=' +
    encodeURIComponent(q);
  const store = await fetchStore(url);
  const results = store?.store?.page?.data?.results || [];
  return results
    .filter((r) => r.tab_url && !r.marketing_type && !EXCLUDED_TYPES.has(r.type))
    .map((r) => ({
      title: r.song_name || '',
      artist: r.artist_name || '',
      type: r.type || '',
      version: Number(r.version) || 1,
      rating: r.rating ? Math.round(r.rating * 100) / 100 : null,
      votes: r.votes ?? null,
      url: r.tab_url,
    }));
}

// UG marks up chords as [ch]Am[/ch] and tab blocks as [tab]...[/tab];
// strip the markers but keep the text so the body stays plain monospace.
function cleanBody(content) {
  return content
    .replaceAll(/\[\/?ch\]/g, '')
    .replaceAll(/\[\/?tab\]/g, '')
    .replaceAll('\r\n', '\n')
    .trim();
}

export async function fetchTab(url) {
  const store = await fetchStore(url);
  const data = store?.store?.page?.data;
  const tab = data?.tab || {};
  const content = data?.tab_view?.wiki_tab?.content;
  if (typeof content !== 'string') {
    throw new Error('no tab content on page (Pro/official tabs are not importable)');
  }
  const meta = data?.tab_view?.meta || {};
  return {
    title: tab.song_name || '',
    artist: tab.artist_name || '',
    body: cleanBody(content),
    capo: Number(meta.capo) || 0,
    tuning: meta.tuning?.value || '',
    source: name,
    source_url: tab.tab_url || url,
  };
}
