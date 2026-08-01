// One-off probe for the logged-in Ultimate Guitar pages, used to design the
// favourites importer against the real page structure instead of guessing.
//
//   node scripts/ug-probe.js [url]
//
// Prints structure, not content: keys, types and array lengths, plus one
// sample item so the shape can be confirmed. See ug-lib.js for how the session
// cookie is read and passed to curl.

import { readCookie, fetchPage, jsStore, shape } from './ug-lib.js';

const url = process.argv[2] || 'https://www.ultimate-guitar.com/user/mytabs';
const { status, body } = await fetchPage(url, readCookie());

console.log(`GET ${url}\nHTTP ${status}, ${body.length} bytes`);

const store = jsStore(body);
if (!store) {
  console.log('No js-store block found. Page title:',
    body.match(/<title>([^<]*)<\/title>/)?.[1] ?? '(none)');
  console.log('Looks like a login wall:', /log ?in|sign ?in/i.test(body.slice(0, 4000)));
  process.exit(1);
}

const user = store?.store?.user;
console.log('Logged in as:', user?.username ? `${user.username} (id ${user.id})` : 'NOT LOGGED IN');

const data = store?.store?.page?.data ?? {};
console.log('\npage.data shape:\n' + shape(data));

// One item from the biggest list found, to confirm this is the tab list.
const lists = [];
const walk = (node, path) => {
  if (Array.isArray(node)) { if (node.length) lists.push([path, node]); return; }
  if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
};
walk(data, 'data');
if (lists.length) {
  const [path, arr] = lists.sort((a, b) => b[1].length - a[1].length)[0];
  console.log(`\nfirst item of ${path} (${arr.length} entries):`);
  console.log(JSON.stringify(arr[0], null, 2).slice(0, 900));
}
