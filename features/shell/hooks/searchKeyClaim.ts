/**
 * A mounted route can OWN Cmd/Ctrl+K and Cmd/Ctrl+P instead of the shell's
 * global search. The claim is a tiny counter registry: the global handler
 * (`CommandBarHotkey`) asks `isSearchKeyClaimed()` and stays out of the way.
 * Pure data, no React: the hook (`useClaimSearchKeys`) and the handler share it.
 */

export type ClaimableSearchKey = "k" | "p";

const claims = new Map<ClaimableSearchKey, number>();

/** Register a claim; returns the release function. */
export function claimSearchKeys(keys: readonly ClaimableSearchKey[]): () => void {
  for (const k of keys) claims.set(k, (claims.get(k) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const k of keys) {
      const n = (claims.get(k) ?? 1) - 1;
      if (n <= 0) claims.delete(k);
      else claims.set(k, n);
    }
  };
}

export function isSearchKeyClaimed(key: string): boolean {
  return claims.has(key.toLowerCase() as ClaimableSearchKey);
}

/** Cmd/Ctrl + K or P with no other modifiers; the lower-cased key, else null. */
export function searchKeyOf(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): ClaimableSearchKey | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return null;
  const k = e.key.toLowerCase();
  return k === "k" || k === "p" ? k : null;
}
