// CifraClub provider. Search goes through their public Solr endpoint
// (solr.sscdn.co), which returns plain JSON; song pages serve the tab inside
// the first <pre>, with chords wrapped in <b> tags. Both depend on CifraClub's
// internals and may break if they change them.
//
// The song page is a Next.js build: its CSS class names are hashes that
// change from one deploy to the next, so nothing here matches on them.
// Title and artist come from the schema.org JSON-LD, the capo from a
// data-anchor attribute, and a non-standard tuning from the first line of
// the tab itself.

import { curlGet, decodeEntities } from './lib.js';

export const name = 'cifraclub';
export const label = 'CifraClub';

export const hosts = ['www.cifraclub.com.br', 'cifraclub.com.br', 'm.cifraclub.com.br'];
const ALLOWED_HOSTS = new Set(hosts);

export async function search(q) {
  const url = new URL('https://solr.sscdn.co/cc/h2/?q=' + encodeURIComponent(q));
  const { status, body } = await curlGet(url);
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} from CifraClub search`);
  }
  // The endpoint answers JSONP-style, wrapping the JSON in parentheses.
  const json = body.trim().replace(/^\(/, '').replace(/\)$/, '');
  const docs = JSON.parse(json)?.response?.docs || [];
  // t === '2' marks songs (t === '1' is an artist page); d/u are the
  // artist and song slugs the site URL is built from.
  return docs
    .filter((r) => r.t === '2' && r.d && r.u)
    .map((r) => ({
      title: r.m || '',
      artist: r.a || '',
      type: 'Chords',
      version: 1,
      rating: null,
      votes: null,
      url: `https://www.cifraclub.com.br/${r.d}/${r.u}/`,
    }));
}

// Strip tags from the <pre> body: chords come as <b>Em7</b> and every line
// sits in its own <div>, which keeps its newline inside.
function cleanBody(pre) {
  return decodeEntities(pre.replace(/<[^>]+>/g, ''))
    .replaceAll('\r\n', '\n')
    .trim();
}

// "Wonderwall - Oasis - Cifra Club", used when the JSON-LD is missing.
function fromOgTitle(html) {
  const og = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const parts = decodeEntities(og || '').split(' - ');
  return parts.length >= 3 ? { title: parts[0], artist: parts[1] } : {};
}

function fromJsonLd(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let ld;
    try { ld = JSON.parse(m[1]); } catch { continue; }
    const types = [].concat(ld['@type']);
    if (!types.includes('MusicRecording')) continue;
    const artist = ld.byArtist?.name || '';
    // name is "Artist - Title".
    const prefix = artist + ' - ';
    const title = ld.name?.startsWith(prefix) ? ld.name.slice(prefix.length) : '';
    return { title, artist };
  }
  return {};
}

// Exported for the tests: everything that depends on the page layout, offline.
export function parsePage(html) {
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  if (!pre) throw new Error('page layout changed: no tab <pre> found');

  let body = cleanBody(pre);
  // Only songs off standard tuning carry this line; it belongs in the tuning
  // field, not at the top of the tab.
  let tuning = '';
  const afi = body.match(/^Afinação:?[ \t]*([^\n]*)\n*/i);
  if (afi) {
    tuning = afi[1].trim();
    body = body.slice(afi[0].length);
  }

  // <button ... data-anchor="--chord-capo" ...>2ª casa</button>
  const capoTxt = html.match(/data-anchor="--chord-capo"[^>]*>([^<]*)</)?.[1] || '';
  const capo = Number(capoTxt.match(/(\d+)\s*ª/)?.[1]) || 0;

  const ld = fromJsonLd(html);
  const og = fromOgTitle(html);
  return {
    title: decodeEntities(ld.title || og.title || '').trim(),
    artist: decodeEntities(ld.artist || og.artist || '').trim(),
    body,
    capo,
    tuning,
  };
}

export async function fetchTab(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error('not an https cifraclub.com.br URL');
  }
  u.hostname = 'www.cifraclub.com.br'; // bare/mobile hosts redirect; skip the hop
  const { status, body: html } = await curlGet(u);
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} from cifraclub.com.br`);
  }
  return { ...parsePage(html), source: name, source_url: u.href };
}
