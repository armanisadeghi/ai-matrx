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

/**
 * 🚨 ONE MATCHER FOR "does this setting match what I typed" — read by the
 * settings route shell's control search AND by the admin register on
 * /administration/users/limits. A second copy is how two surfaces over the
 * same ~880 rows start answering the same query differently.
 *
 * The haystack is everything an admin could reasonably type: the full key
 * (`feature.key`, so "loop_guard" and "orchestration" both land), the feature
 * on its own, the human label, the description, and the help sentence.
 */
export function knobMatchesControlSearch(
  knob: {
    full_key: string;
    feature: string;
    label: string;
    description: string;
    ui: { help?: string };
  },
  query: string,
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return [knob.full_key, knob.feature, knob.label, knob.description, knob.ui.help]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
    .includes(trimmed);
}
