/** Canonical entity token for `ai.model_definition` rows. */
export const MODEL_FAVORITE_ENTITY_TYPE = "ai_model";

export function reconcileModelFavoriteIds(
  cached: readonly string[],
  canonical: readonly string[],
): { merged: string[]; missingFromCanonical: string[] } {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of canonical) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  const missingFromCanonical: string[] = [];
  for (const id of cached) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
    missingFromCanonical.push(id);
  }
  return { merged, missingFromCanonical };
}

export function favoriteIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
