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

function decodeEntities(s) {
  return s
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
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
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error('not an ultimate-guitar.com URL');
  const { status, body: html } = await curlGet(u);
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} from ultimate-guitar.com`);
  }
  const m = html.match(/class="js-store"\s+data-content="([^"]+)"/);
  if (!m) throw new Error('page layout changed: js-store data not found');
  return JSON.parse(decodeEntities(m[1]));
}

export async function search(q) {
  const url =
    'https://www.ultimate-guitar.com/search.php?search_type=title&value=' +
    encodeURIComponent(q);
  const store = await fetchStore(url);
  const results = store?.store?.page?.data?.results || [];
  return results
    .filter((r) => r.tab_url && !r.marketing_type)
    .map((r) => ({
      title: r.song_name || '',
      artist: r.artist_name || '',
      type: r.type || '',
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
