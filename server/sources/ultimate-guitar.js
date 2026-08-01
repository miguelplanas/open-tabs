// Ultimate Guitar provider. UG pages embed their data as HTML-escaped JSON in
// <div class="js-store" data-content="...">, which is what we parse here.
// This depends on UG's internal page structure and may break if they change it.

import { curlGet, decodeEntities } from './lib.js';

export const name = 'ultimate-guitar';
export const label = 'Ultimate Guitar';

export const hosts = ['www.ultimate-guitar.com', 'tabs.ultimate-guitar.com'];
const ALLOWED_HOSTS = new Set(hosts);

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
//
// The entity decoding matters more than it looks. UG's JSON escapes the tab
// text a second time, so a Spanish lyric arrives as "&iquest;adonde vas?".
// Left encoded it is not just ugly: the line is seven columns longer than the
// text it represents, which drags every chord above it out of alignment.
export function cleanBody(content) {
  return decodeEntities(content)
    .replaceAll(/\[\/?ch\]/g, '')
    .replaceAll(/\[\/?tab\]/g, '')
    .replaceAll('\r\n', '\n')
    // U+2028 and U+2029 (shipped as &#8232;) are Unicode line separators.
    // Some browsers break on them and some do not, so make them real newlines.
    .replace(/[\u2028\u2029]/g, '\n')
    // A soft hyphen draws nothing but still occupies a column, so it shifts
    // the lyric under its chords.
    .replaceAll('\u00ad', '')
    .trim();
}

export async function fetchTab(url) {
  return parseTab(await fetchStore(url), url);
}

// Split out from fetchTab so the account importer (scripts/import-ug.js) can
// fetch pages with a session cookie of its own and still parse them exactly
// the way the app does.
export function parseTab(store, url) {
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
