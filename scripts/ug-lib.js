// Shared plumbing for the one-off Ultimate Guitar account scripts (probe and
// importer). Not part of the app: nothing under server/ or public/ imports it.
//
// The session cookie is read from UG_COOKIE_FILE (default ~/.ug-cookie), which
// may hold a raw cookie string, a "Cookie: …" header line, or a whole
// "Copy as cURL" command pasted from DevTools (bash or Windows cmd flavour).
// It reaches curl through a mode-600 config file rather than a command-line
// argument, so the value never shows up in `ps` output.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { decodeEntities } from '../server/sources/lib.js';

const execFileAsync = promisify(execFile);

// Cloudflare binds the cf_clearance cookie to the exact user agent that earned
// it, so this must match the browser the cookie was copied from.
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

export function readCookie() {
  const path = process.env.UG_COOKIE_FILE || join(homedir(), '.ug-cookie');
  let raw;
  try {
    raw = readFileSync(path, 'utf8').trim();
  } catch {
    throw new Error(`no cookie file at ${path}`);
  }
  if (!raw) throw new Error(`${path} is empty`);
  // Windows "Copy as cURL (cmd)" escapes every quote and percent with a caret.
  // Dropping the carets turns it back into ordinary shell-ish text.
  if (raw.includes('^"')) raw = raw.replaceAll('^', '');
  const fromCurl = raw.match(/-(?:H|b)\s+(['"])\s*cookie:\s*([\s\S]*?)\1/i);
  if (fromCurl) return fromCurl[2].trim();
  return raw.replace(/^cookie:\s*/i, '').trim();
}

export async function fetchPage(url, cookie) {
  const dir = mkdtempSync(join(tmpdir(), 'ug-'));
  const cfg = join(dir, 'curl.cfg');
  const esc = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  writeFileSync(cfg, `header = "Cookie: ${esc(cookie)}"\n`, { mode: 0o600 });
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sS', '--compressed', '--max-time', '25', '-K', cfg,
      '-w', '\n%{http_code}',
      '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', 'Upgrade-Insecure-Requests: 1',
      '-H', 'Sec-Fetch-Dest: document',
      '-H', 'Sec-Fetch-Mode: navigate',
      '-H', 'Sec-Fetch-Site: none',
      url,
    ], { maxBuffer: 40 * 1024 * 1024 });
    const nl = stdout.lastIndexOf('\n');
    return { status: Number(stdout.slice(nl + 1).trim()), body: stdout.slice(0, nl) };
  } finally {
    try { unlinkSync(cfg); } catch { /* best effort */ }
  }
}

// UG embeds page state as HTML-escaped JSON in <div class="js-store">.
export function jsStore(html) {
  const m = html.match(/class="js-store"\s+data-content="([^"]+)"/);
  return m ? JSON.parse(decodeEntities(m[1])) : null;
}

// Structure dump: keys, types and array lengths, so a page's shape is visible
// without pouring someone's library into a terminal.
export function shape(value, depth = 0, maxDepth = 4) {
  const pad = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array(0)';
    const inner = depth >= maxDepth ? '…' : shape(value[0], depth + 1, maxDepth);
    return `array(${value.length}) of ${inner}`;
  }
  if (value && typeof value === 'object') {
    if (depth >= maxDepth) return '{…}';
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    return '{\n' + keys
      .map((k) => `${pad}  ${k}: ${shape(value[k], depth + 1, maxDepth)}`)
      .join('\n') + `\n${pad}}`;
  }
  if (typeof value === 'string') return value.length > 40 ? 'string(long)' : 'string';
  return typeof value;
}
