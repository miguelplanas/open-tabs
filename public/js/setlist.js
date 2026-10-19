// Setlist bookkeeping, kept free of the DOM so it can be tested with
// node:test. A setlist is what collection.js stores in sessionStorage when a
// song is opened from a collection: { id, name, ids, titles }.

// Switching to another version of a song from the reader: put the new
// version in the old one's slot, so prev/next and back keep working from the
// same place. If the new version is also in the setlist (both versions are in
// the collection), the two trade places, so it stays a list of the same songs.
// A song that is not in the setlist leaves it as it is.
export function swapSetlistSong(setlist, fromId, toId) {
  if (!setlist || !Array.isArray(setlist.ids)) return setlist;
  const i = setlist.ids.indexOf(fromId);
  if (i < 0) return setlist;
  const ids = setlist.ids.slice();
  const j = ids.indexOf(toId);
  ids[i] = toId;
  if (j < 0) return { ...setlist, ids };
  ids[j] = fromId;
  const titles = Array.isArray(setlist.titles) ? setlist.titles.slice() : setlist.titles;
  if (titles) [titles[i], titles[j]] = [titles[j], titles[i]];
  return { ...setlist, ids, titles };
}
