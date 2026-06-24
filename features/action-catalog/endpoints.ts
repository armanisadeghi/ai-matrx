/**
 * Action Catalog — backend endpoint paths (in-app, BARE prefix).
 *
 * The aidream router mounts at the bare `/actions` prefix; the public URL adds
 * `/api`, but `ApiPrefixCompatMiddleware` strips it server-side, so the in-app
 * path the FE builds is `/actions/catalog` (NEVER `/api/actions/...`). Rooted at
 * the host, like everything in `lib/api/endpoints.ts`.
 */
export const ENDPOINTS_ACTIONS = {
  /** GET — the live noun × verb action catalog (Public, non-sensitive). */
  catalog: "/actions/catalog" as const,
  /** POST — run ONE `verb:noun` action as the user (authed; RLS). */
  execute: "/actions/execute" as const,
} as const;
