/**
 * Text matching helpers for voice input where the speech recognizer's
 * transcript will rarely match the answer character-for-character.
 *
 * normalize() strips Hebrew niqqud, punctuation, "the / ה־" prefix and collapses
 * whitespace so 'אביב גפן' ≈ 'אביב גפן.' ≈ 'הזמר אביב גפן' for our purposes.
 */

const HE_NIQQUD_RE = /[֑-ׇ]/g;
const PUNCT_RE = /[^\p{L}\p{N}\s]/gu;

export function normalize(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    // strip combining marks (Latin diacritics + Hebrew niqqud)
    .replace(HE_NIQQUD_RE, '')
    .replace(/[̀-ͯ]/g, '')
    .replace(PUNCT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Iterative Levenshtein, capped to keep runtime small for short strings. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Does the spoken transcript match the expected answer well enough?
 * Returns true if any of:
 *   - normalised strings are equal
 *   - the transcript contains the answer (or vice-versa) as a substring
 *   - Levenshtein distance is within tolerance (≤2 for short, ≤20% for longer)
 */
export function isVoiceMatch(transcript, answer) {
  const a = normalize(transcript);
  const b = normalize(answer);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const dist = levenshtein(a, b);
  const tolerance = Math.max(2, Math.floor(b.length * 0.2));
  return dist <= tolerance;
}

/**
 * Find the best match for `transcript` in a list of candidates.
 * Returns { best, score } or null when nothing is close enough.
 * Score is normalised distance — lower is better.
 */
export function bestMatch(transcript, candidates) {
  const t = normalize(transcript);
  if (!t || !candidates?.length) return null;
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const n = normalize(c);
    if (!n) continue;
    if (n === t) return { best: c, score: 0 };
    const contains = n.includes(t) || t.includes(n);
    const dist = levenshtein(n, t);
    const score = contains ? Math.min(dist, 1) : dist;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  // Tolerance scales with candidate length
  const limit = Math.max(2, Math.floor(normalize(best || '').length * 0.3));
  if (best && bestScore <= limit) return { best, score: bestScore };
  return null;
}
