/**
 * Directive Catalog — backend endpoint paths (in-app, BARE prefix).
 *
 * The aidream router mounts at the bare `/directives` prefix; the public URL adds
 * `/api`, but `ApiPrefixCompatMiddleware` strips it server-side, so the in-app
 * path the FE builds is `/directives/catalog` (NEVER `/api/directives/...`). Rooted at
 * the host, like everything in `lib/api/endpoints.ts`.
 */
export const ENDPOINTS_DIRECTIVES = {
  /** GET — the live noun × verb directive catalog (Public, non-sensitive). */
  catalog: "/directives/catalog" as const,
  /** POST — run ONE `verb:noun` Directive as the user (authed; RLS). */
  execute: "/directives/execute" as const,
  /** POST — apply a directive the agent proposed under `ask`, on user accept (authed). */
  confirm: "/directives/confirm" as const,
} as const;
