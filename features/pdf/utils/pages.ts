/**
 * Tiny page-selection input parser used by every demo route.
 *
 * Supports comma-separated singles and ranges:
 *
 *   parsePagesInput("1,2,5")      → [1, 2, 5]
 *   parsePagesInput("1-3,7")      → [1, 2, 3, 7]
 *   parsePagesInput("4, 4, 2-3")  → [4, 2, 3]   // de-duped, order preserved
 *
 * Throws on negative / zero / non-numeric input so callers can surface the
 * exact problem to the user.
 */
export function parsePagesInput(input: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const trimmed = input.trim();
  if (!trimmed) return out;
  const tokens = trimmed.split(",").map((t) => t.trim()).filter(Boolean);
  for (const token of tokens) {
    if (token.includes("-")) {
      const [a, b] = token.split("-").map((s) => Number(s.trim()));
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > b) {
        throw new Error(`Invalid page range "${token}".`);
      }
      for (let p = a; p <= b; p++) {
        if (!seen.has(p)) {
          seen.add(p);
          out.push(p);
        }
      }
    } else {
      const n = Number(token);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`Invalid page "${token}".`);
      }
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}
