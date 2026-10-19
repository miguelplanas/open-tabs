// Pure helpers for autoscroll timing. No DOM, so the tests can import them.

// Speed (px/s) that covers `distancePx` in `seconds`. Null when either is not
// a usable positive number. The result is clamped to [minSpeed, maxSpeed], the
// range the speed buttons and the server accept without surprises.
export function speedForDuration(distancePx, seconds, { minSpeed = 1, maxSpeed = 60 } = {}) {
  if (!(distancePx > 0) || !(seconds > 0)) return null;
  return Math.min(maxSpeed, Math.max(minSpeed, distancePx / seconds));
}

// "≈2:10" for the time left to scroll `distancePx` at `speed` px/s. Empty when
// there is nothing left or the speed is unusable.
export function formatRemaining(distancePx, speed) {
  if (!(distancePx > 0) || !(speed > 0)) return '';
  return '≈' + formatDuration(Math.round(distancePx / speed));
}

// Whole seconds as m:ss.
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// "m:ss" typed by the person, as seconds; null if it is not that.
export function parseDuration(text) {
  const m = String(text ?? '').trim().match(/^(\d{1,3}):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
