// Display text for collections, kept free of the DOM so it can be tested with
// node:test.

// The Ultimate Guitar import gave every collection the description
// "Imported from Ultimate Guitar (N tabs)", which only repeats the song count
// shown next to it. The stored data is left alone; the views just skip it.
const UG_BOILERPLATE = /^Imported from Ultimate Guitar \(\d+ tabs?\)$/;

export function isBoilerplateDescription(text) {
  return typeof text === 'string' && UG_BOILERPLATE.test(text.trim());
}

// The description worth showing, or '' when there is none.
export function visibleDescription(text) {
  if (!text || isBoilerplateDescription(text)) return '';
  return text;
}
