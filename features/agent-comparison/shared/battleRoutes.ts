/**
 * battleRoutes — where each battle mode lives, and where one saved battle lives.
 *
 * The mode ids are the `metadata.mode` values every mode writes on its saved
 * comparison row, so a saved battle can always be sent to the page that knows
 * how to rebuild it.
 */

export type BattleModeId =
  | "open"
  | "variations"
  | "model"
  | "tuning"
  | "settings"
  | "tools"
  | "system-prompt"
  | "request-mod";

const BASE: Record<BattleModeId, string> = {
  open: "/agents/battle",
  variations: "/agents/battle/variations",
  model: "/agents/battle/model",
  tuning: "/agents/battle/tuning",
  settings: "/agents/battle/settings",
  tools: "/agents/battle/tools",
  "system-prompt": "/agents/battle/system-prompt",
  "request-mod": "/agents/battle/request-mod",
};

export function isBattleModeId(value: unknown): value is BattleModeId {
  return typeof value === "string" && value in BASE;
}

/** The page for a new battle in this mode. */
export function battleModeBasePath(mode: BattleModeId): string {
  return BASE[mode];
}

/**
 * The page for one saved battle. Open mode's base is the Battle root, so its
 * battles live under `/agents/battle/open/<id>`; every other mode nests the id
 * under its own path.
 */
export function battleUrl(mode: BattleModeId, setId: string): string | null {
  if (!isBattleModeId(mode)) return null;
  const id = encodeURIComponent(setId);
  return mode === "open" ? `/agents/battle/open/${id}` : `${BASE[mode]}/${id}`;
}
