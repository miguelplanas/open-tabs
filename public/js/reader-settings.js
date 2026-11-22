// Reader settings (transpose, scroll speed) that have not reached the server
// yet, kept free of the DOM so they can be tested with node:test.
//
// They used to go out once, by sendBeacon, and be forgotten: with no signal
// the change was lost without a word, and even when it arrived the saved
// offline copy of the song kept the old values (the setting doesn't bump
// updated_at, so the offline warmer never refetches it). Now every change is
// queued here until a request the app saw succeed has delivered it, and the
// reader lays a queued entry over whatever copy of the song it loaded.
//
// `store` is a Storage (localStorage); every call survives a missing or
// full one, in which case nothing is queued and behaviour is as before.
export const PENDING_KEY = 'opentabs.pendingSettings';

function read(store) {
  try {
    const v = JSON.parse(store.getItem(PENDING_KEY));
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function write(store, all) {
  try {
    if (Object.keys(all).length) store.setItem(PENDING_KEY, JSON.stringify(all));
    else store.removeItem(PENDING_KEY);
  } catch { /* private mode or full: nothing queued */ }
}

export function queueSettings(store, id, { scroll_speed, transpose }) {
  const all = read(store);
  all[id] = { scroll_speed, transpose };
  write(store, all);
}

export function pendingFor(store, id) {
  return read(store)[id] || null;
}

export function allPending(store) {
  return Object.entries(read(store)).map(([id, s]) => ({ id: Number(id), ...s }));
}

// Drop an entry once it is delivered, unless it changed again meanwhile
// (a newer change still has to go out).
export function settleSettings(store, id, sent) {
  const all = read(store);
  const now = all[id];
  if (now && now.scroll_speed === sent.scroll_speed && now.transpose === sent.transpose) {
    delete all[id];
    write(store, all);
  }
}

// The song as the reader should show it: the loaded copy with any queued
// settings on top.
export function withPending(song, pending) {
  return pending ? { ...song, scroll_speed: pending.scroll_speed, transpose: pending.transpose } : song;
}
