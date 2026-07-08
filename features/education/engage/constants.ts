// features/education/engage/constants.ts
//
// Route + copy constants for the Engagement Engine (P10). Route base is
// `/education/game` (chosen at kickoff per master-plan flag #6).

export const ENGAGE_BASE = "/education/game";
export const ENGAGE_ROUTES = {
  home: ENGAGE_BASE,
  solo: `${ENGAGE_BASE}/solo`,
  host: `${ENGAGE_BASE}/host`,
  join: `${ENGAGE_BASE}/join`,
  play: (roomId: string, code: string) =>
    `${ENGAGE_BASE}/play/${roomId}?code=${encodeURIComponent(code)}`,
  results: (roomId: string) => `${ENGAGE_BASE}/results/${roomId}`,
  admin: `${ENGAGE_BASE}/admin`,
} as const;

/** Weekday labels indexed by getDay()/extract(dow) — 0=Sun … 6=Sat. */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
