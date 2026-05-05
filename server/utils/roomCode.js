/**
 * Generate a unique 4-digit numeric room code (1000-9999).
 * Pass `inUse(code)` returning true if the code is already taken — the
 * function will keep rolling until it finds a free one.
 *
 * Numeric-only: easier to read out loud and type on phone keyboards than the
 * old base-36 codes that mixed letters and digits.
 */
export function generateRoomCode(inUse = () => false) {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); }
  while (inUse(code));
  return code;
}
