// Guards a button's action against repeat taps while its request is in
// flight: a double tap on Save used to create the song twice. Kept free of
// the DOM (it only flips `button.disabled`) so it can be tested with
// node:test.
//
// The button stays disabled when the action succeeds, because success
// navigates away and the old view lingers until the next one has loaded; a
// tap in that window would send the request again. It is re-enabled when the
// action throws, so the user can retry, and the error is passed on.
export function oneAtATime(button, fn) {
  let busy = false;
  return async (...args) => {
    if (busy) return undefined;
    busy = true;
    button.disabled = true;
    try {
      return await fn(...args);
    } catch (err) {
      busy = false;
      button.disabled = false;
      throw err;
    }
  };
}
