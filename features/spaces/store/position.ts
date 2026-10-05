// features/spaces/store/position.ts — fractional index strings for sibling order (SpaceDoc.position).
//
// Keys are strings over 0-9a-z compared lexicographically; `between(a, b)` returns a key strictly
// between them (null = open end). Keys never end in "0", so there is always room for another one.

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function between(a: string | null, b: string | null): string {
  const lo = a ?? "";
  let hi = b;
  let out = "";
  for (let i = 0; ; i++) {
    const ca = i < lo.length ? DIGITS.indexOf(lo[i]) : 0;
    const cb = hi !== null && i < hi.length ? DIGITS.indexOf(hi[i]) : DIGITS.length;
    if (ca === cb) {
      out += DIGITS[ca];
      continue;
    }
    const mid = Math.floor((ca + cb) / 2);
    if (mid > ca) return out + DIGITS[mid];
    out += DIGITS[ca];
    hi = null;
  }
}

/** `count` evenly spread keys, for seeding. */
export function spread(count: number): string[] {
  const keys: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < count; i++) {
    prev = between(prev, null);
    keys.push(prev);
  }
  return keys;
}

export function byPosition<T extends { position: string }>(a: T, b: T): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}
