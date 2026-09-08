// Helpers shared by tab source providers.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// PHP's htmlspecialchars/htmlentities (what these sites' templating uses)
// escapes anything outside ASCII as a named entity, e.g. Garc&iacute;a or
// &iquest;adonde vas?. Numeric entities (&#225; / &#x00e1;) are decoded
// generically below.
//
// The names for the whole Latin-1 block are fixed by HTML4 and run in code
// point order from 160 to 255, so listing them in that order is both shorter
// and less error-prone than writing out 96 key/value pairs: an omission here
// is invisible until some song shows raw "&iquest;" in the middle of a lyric.
const LATIN1_NAMES = (
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr ' +
  'deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
  'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml ' +
  'eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
).split(' ');

const NAMED_ENTITIES = Object.fromEntries(
  LATIN1_NAMES.map((name, i) => [name, String.fromCharCode(160 + i)])
);

// Punctuation from outside Latin-1 that these sites also emit, plus one
// override: a non-breaking space becomes an ordinary one, because in a tab
// body every column has to be a column the chord above can line up with.
Object.assign(NAMED_ENTITIES, {
  nbsp: ' ',
  hellip: '…',
  ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”',
  bull: '•', dagger: '†', euro: '€', trade: '™',
});

export function decodeEntities(s) {
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

// Look names up over HTTPS instead of through the container's resolver.
// In the deployed container every lookup came back SERVFAIL, so online search
// failed with "Could not resolve host": Tailscale points the host's
// resolv.conf at 100.100.100.100, which tailscaled serves from the host's
// network namespace, and a Swarm container never reaches it. The endpoint is
// an IP literal on purpose, so resolving it needs no working resolver to
// begin with. Set OPENTABS_DOH to another endpoint, or to an empty string to
// go back to the system resolver.
//
// --doh-url rather than --dns-servers: the latter needs a libcurl built with
// c-ares, which the image has but a plain Debian curl (local dev) does not.
const DOH_URL = process.env.OPENTABS_DOH ?? 'https://1.1.1.1/dns-query';

// Exported for the tests: building the argv is the part worth checking, and
// it stays offline.
export function curlArgs(u, doh = DOH_URL) {
  return [
    '-sS', '--compressed', '--max-time', '20',
    '-w', '\n%{http_code}',
    ...(doh ? ['--doh-url', doh] : []),
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
}

// Some sources sit behind Cloudflare, which rejects Node's TLS fingerprint but
// accepts curl's, so pages are fetched through the system curl binary.
// execFile (no shell) plus each provider's host allowlist keeps this safe.
export async function curlGet(u) {
  const { stdout } = await execFileAsync('curl', curlArgs(u), {
    maxBuffer: 20 * 1024 * 1024,
  });
  const nl = stdout.lastIndexOf('\n');
  const status = Number(stdout.slice(nl + 1).trim());
  const body = stdout.slice(0, nl);
  return { status, body };
}
