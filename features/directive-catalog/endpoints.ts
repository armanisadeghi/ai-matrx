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
  /**
   * POST — a READ: has this proposed directive already been applied? (DD-144.)
   * The server computes the frozen per-item apply key (which hashes the VALIDATED
   * item model, so no client can reproduce it) and answers `not_applied` /
   * `in_flight` / `applied`. Nothing here writes.
   */
  applyState: "/directives/apply_state" as const,
} as const;
