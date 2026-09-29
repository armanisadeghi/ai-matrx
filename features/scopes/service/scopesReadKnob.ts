// features/scopes/service/scopesReadKnob.ts
//
// THE ONE SWITCH for where the web app READS the scope system (lane SCOPES-WEB-REVERT, 2026-09-29).
//
// Knob `scopes/read_from_store`, default OFF:
//   - OFF — scope types, scopes, context items and values are read from the `context.*` tables, as
//     they were before lane SCOPES-READS-WEB (commit 3ed36176d1).
//   - ON  — they are read through the record store's `custom.context_*` doors
//     (`storeScopeReads.ts` + `storeScopeAdapter.ts`).
//
// Why OFF: the store path went live before a member-seat validation and the scope pages broke
// (Arman, 2026-09-29: "a mess"). Before it is flipped ON, every scope screen must show the same thing
// from the member's seat (admin@admin.com AND test@test.com) on both paths, and the tree must load
// as fast as the old read. The record: common-docs/projects/data-doctrine-adoption/v5/
// PROGRESS-SCOPES-WEB-REVERT.md.
//
// It is a build-time switch, not a `platform.feature_knob` row: the choice is read synchronously on
// every scope read, on the client and the server (the class checkout, the short link), and a missing
// knob row RAISES by design — a DB row would add a round-trip to every scope read and a new failure
// before the path is even chosen. Flip it with NEXT_PUBLIC_SCOPES_READ_FROM_STORE=true (one env, one
// build), or by changing DEFAULT below once the validation passes.

export const SCOPES_READ_FROM_STORE_KNOB = "scopes/read_from_store";

const DEFAULT = false;

let testOverride: boolean | null = null;

/** Should the web app read the scope system from the record store? OFF unless switched on. */
export function scopesReadFromStore(): boolean {
  if (testOverride !== null) return testOverride;
  const env = process.env.NEXT_PUBLIC_SCOPES_READ_FROM_STORE;
  if (env === "true") return true;
  if (env === "false") return false;
  return DEFAULT;
}

/** TEST SEAM: force the path (true/false), or pass null to return to the environment. */
export function __setScopesReadFromStoreForTests(value: boolean | null): void {
  testOverride = value;
}
