/**
 * Deliberate Door Law exemptions.
 *
 * A bare path list is BANNED — `reason` is required by the type, so an
 * exemption nobody can review cannot compile. The admin dashboard renders this
 * list verbatim beside the findings, which is the point: what we chose to
 * silence must be as visible as what we found.
 *
 * Before adding an entry, ask whether the honest fix is a registry edit
 * (`hrefFor` in `features/scopes/registry/entityRegistry.ts`) instead. A missing
 * door is almost always a missing registry line, not a false positive.
 */

import type { DeadEndAllowlistEntry } from "./types";

export const DEAD_END_ALLOWLIST: DeadEndAllowlistEntry[] = [
  {
    file: "components/official/entity-ref/EntityRef.tsx",
    reason:
      "EntityRef IS the door primitive. It renders the name/id fallback itself; " +
      "flagging it would be the checker flagging its own fix.",
    addedBy: "no-dead-ends detector",
    addedOn: "2026-08-09",
  },
  {
    file: "features/admin/dead-ends/DeadEndsConsole.tsx",
    rule: "unlinked-entity-name",
    reason:
      "The detector dashboard prints rule ids, file paths and entity TOKENS " +
      "(not records) as text; a token is not a row and has no id to open. " +
      "Every actual record reference on that page goes through EntityRef.",
    addedBy: "no-dead-ends detector",
    addedOn: "2026-08-09",
  },
];
