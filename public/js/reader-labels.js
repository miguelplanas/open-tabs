// Readouts of the reader's tools sheet, as Tech labels in brackets ([+2],
// [14], [7]). Pure, so they are testable without a DOM.
export const signed = (n) => (n > 0 ? '+' + n : String(n));
export const bracket = (v) => `[${v}]`;
export const transposeLabel = (n) => bracket(signed(n));
