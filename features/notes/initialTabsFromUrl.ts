/**
 * Which note tabs a /notes URL asks to be open, and which one is focused.
 *
 * THE DOOR THIS KEEPS OPEN: every note door in the platform is
 * `/notes?active=<id>` — the `note` entry in
 * `features/scopes/registry/entityRegistry.ts` is what EntityRef,
 * MatrxUuidCell and the org Notes tile all resolve through. Until 2026-09-20
 * the workspace only read `?tabs=`, so `?active=` alone opened NO tab and the
 * restore effect bailed on an empty list: every one of those doors landed on
 * the empty "Open a note from the sidebar" state instead of the note it named.
 *
 * Pure on purpose, so the rule is testable without rendering the workspace.
 */
export function initialTabsFromUrl(params: {
  /** `?tabs=` ids, already split. */
  tabs: string[];
  /** `?active=` id. */
  active: string | null;
  /** The `/notes/[id]` path segment. */
  routeNoteId: string | null;
}): string[] | undefined {
  if (params.tabs.length > 0) return params.tabs;
  const single = params.active ?? params.routeNoteId;
  return single ? [single] : undefined;
}
