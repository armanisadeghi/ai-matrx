/**
 * SKINS — the per-brand dimension. The catalog's states are brand-neutral; every scenario runs once
 * per registered skin (one Playwright project per browser x skin). Only `meet` exists today.
 *
 * Adding a skin = ONE entry below, with the routes that skin's pages really live at (it is the
 * only per-brand knowledge the harness holds; the scenarios themselves stay brand-neutral).
 * Select skins with MEET_SKINS (comma list, default `meet`); an unregistered name is an error,
 * never silently skipped.
 */
export interface Skin {
  /** Where a signed-in host starts a meeting. */
  startPath: string;
  /** The page of one meeting, from its slug. */
  meetingPath: (slug: string) => string;
  /** Recognises that a URL is one meeting's page (slug in group 1). */
  meetingUrl: RegExp;
  /** A code in this brand's own shape that names no meeting. */
  invalidCodePath: string;
}

export const SKINS: Record<string, Skin> = {
  meet: {
    startPath: "/meetings",
    meetingPath: (slug) => `/meet/${slug}`,
    meetingUrl: /\/meet\/([^/?#]+)/,
    invalidCodePath: "/meet/qwz-4k7p-mxr",
  },
  // zoom: { … }, teams: { … }, ours: { … }  — add when those skins ship their routes.
};

export function selectedSkins(): string[] {
  const names = (process.env.MEET_SKINS ?? "meet").split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !SKINS[n]);
  if (unknown.length) throw new Error(`MEET_SKINS names no registered skin: ${unknown.join(", ")} (registered: ${Object.keys(SKINS).join(", ")})`);
  return names;
}

let active = "meet";
/** Set once per test by the cast fixture (a worker runs one test at a time). */
export function setActiveSkin(name: string): void {
  if (!SKINS[name]) throw new Error(`unknown skin "${name}"`);
  active = name;
}
export const activeSkinName = (): string => active;
export const skin = (): Skin => SKINS[active];
