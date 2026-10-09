/**
 * THE rule for a row click on any Socials table: it opens the thing the row IS (an account's page, a
 * post's panel, a designed account summary) - never the table's generic key/value inspector, which
 * prints raw ids and status codes. Every `MatrxDataTable` in features/marketing/social spreads
 * `socialRowOpen(...)`; `__tests__/row-open-rule.test.ts` fails when one does not.
 */

/** Turns the table's generic side panel and row window off, so a row click can only do what the surface says. */
export const NO_RAW_ROW_WINDOW = {
  detail: { enabled: false },
  window: { enabled: false },
} as const;

export function socialRowOpen<T>(open: (row: T) => void): {
  detail: { enabled: false };
  window: { enabled: false };
  onRowOpen: (row: T) => void;
} {
  return { ...NO_RAW_ROW_WINDOW, onRowOpen: open };
}
