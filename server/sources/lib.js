// Helpers shared by tab source providers.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// PHP's htmlspecialchars/htmlentities (what these sites' templating uses)
// escapes accented letters as named entities, e.g. Garc&iacute;a. This table
// covers the Latin-1 letters that show up in Spanish/Portuguese/European
// titles and artists; numeric entities (&#225; / &#x00e1;) are decoded
// generically below.
const NAMED_ENTITIES = {
  aacute: 'á', Aacute: 'Á',
  eacute: 'é', Eacute: 'É',
  iacute: 'í', Iacute: 'Í',
  oacute: 'ó', Oacute: 'Ó',
  uacute: 'ú', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ',
  atilde: 'ã', Atilde: 'Ã',
  otilde: 'õ', Otilde: 'Õ',
  acirc: 'â', Acirc: 'Â',
  ecirc: 'ê', Ecirc: 'Ê',
  ocirc: 'ô', Ocirc: 'Ô',
  uuml: 'ü', Uuml: 'Ü',
  agrave: 'à', Agrave: 'À',
  egrave: 'è', Egrave: 'È',
  igrave: 'ì', Igrave: 'Ì',
  ograve: 'ò', Ograve: 'Ò',
  ugrave: 'ù', Ugrave: 'Ù',
  ccedil: 'ç', Ccedil: 'Ç',
  nbsp: ' ',
  hellip: '…',
  ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”',
};

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

// Some sources sit behind Cloudflare, which rejects Node's TLS fingerprint but
// accepts curl's, so pages are fetched through the system curl binary.
// execFile (no shell) plus each provider's host allowlist keeps this safe.
export async function curlGet(u) {
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
