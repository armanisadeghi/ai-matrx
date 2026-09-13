export type SettingsControlSearchHit = {
  id: string;
  label: string;
  /** Human-readable destination shown below the matching setting name. */
  location: string;
  description?: string;
  tabId: string;
  controlId?: string;
  href: string;
};

/**
 * Static controls recur when one tab component is registered at a parent and
 * its child tabs. Keep the first registry-index occurrence: it is stable and
 * always points to a mounted control.
 */
export function dedupeSettingsControlSearchHits(
  hits: SettingsControlSearchHit[],
): SettingsControlSearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const identity = hit.controlId ?? hit.id;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
