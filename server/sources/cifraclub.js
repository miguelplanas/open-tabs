// CifraClub provider. Search goes through their public Solr endpoint
// (solr.sscdn.co), which returns plain JSON; song pages serve the tab inside
// the first <pre>, with chords wrapped in <b> tags. Both depend on CifraClub's
// internals and may break if they change them.

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

// Strip tags from the <pre> body: chords come as <b>Em7</b> and some pages
// wrap sections in extra inline markup.
function cleanBody(pre) {
  return decodeEntities(pre.replace(/<[^>]+>/g, ''))
    .replaceAll('\r\n', '\n')
    .trim();
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
  const pre = html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1];
  if (!pre) throw new Error('page layout changed: no tab <pre> found');

  const title = html.match(/<h1 class="t1"[^>]*>([^<]+)<\/h1>/)?.[1];
  const artist = html.match(/<h2 class="t3"[^>]*><a[^>]*>([^<]+)<\/a>/)?.[1];
  // "Capotraste na <a ...>2ª casa</a>" inside span#cifra_capo.
  const capoTxt = html.match(/id="cifra_capo"[^>]*>([\s\S]{0,120}?)<\/span>/)?.[1] || '';
  const capo = Number(capoTxt.replace(/<[^>]+>/g, '').match(/(\d+)\s*ª/)?.[1]) || 0;
  const tuningTxt = html.match(/id="cifra_afi"[^>]*>([\s\S]{0,120}?)<\/span>/)?.[1] || '';
  const tuning = decodeEntities(tuningTxt.replace(/<[^>]+>/g, '')).replace(/^Afinação:?\s*/i, '').trim();

  return {
    title: decodeEntities(title || '').trim(),
    artist: decodeEntities(artist || '').trim(),
    body: cleanBody(pre),
    capo,
    tuning,
    source: name,
    source_url: u.href,
  };
}
