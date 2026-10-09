// features/education/onboard/startRoutes.ts
//
// The ONE address that creates a study kit — the agents pattern: the list
// (/education/kits) → New → this create route → the kit page
// (/education/kits/[id]) for everything after. The page offers both ways in:
// build with AI from material, or bundle saved study aids. The retired
// /education/start forwards here with its query.

export const NEW_KIT_HREF = "/education/kits/new";

/** Kept for the education surfaces that name "start a kit" by this constant. */
export const EDU_START_HREF = NEW_KIT_HREF;

/** The query keys the create route reads: `source` (+ `from`) pre-picks material. */
const CARRIED_KEYS = ["source", "from"] as const;

/** The create route, carrying a pre-picked source when one was passed. */
export function newKitHref(params: Partial<Record<string, string | string[] | undefined>> = {}): string {
  const query = new URLSearchParams();
  for (const key of CARRIED_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${NEW_KIT_HREF}?${qs}` : NEW_KIT_HREF;
}
