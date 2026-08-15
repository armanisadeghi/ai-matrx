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
  {
    file: "features/agent-shortcuts/components/ShortcutList.tsx",
    rule: "unlinked-entity-name",
    reason:
      "Doors ride ALONGSIDE the name, not on it, and that is deliberate: the " +
      "card's click already means EDIT (a navigation on the user and org " +
      "consoles), so making the name a second anchor would give one card two " +
      "conflicting destinations. EntityDoorControls carries Open / new tab / " +
      "peek at the same URL the click uses. The detector matches doors by " +
      "ANCESTOR, so a sibling door is invisible to it.",
    addedBy: "no-dead-ends detector",
    addedOn: "2026-08-15",
  },
  {
    file: "features/agents/components/usages/NotifyOwnerDialog.tsx",
    rule: "bare-id-text",
    reason:
      "The truncated id is shown INSTEAD of a name on purpose — the name in " +
      "scope belongs to the shortcut, not to the agent the id points at, and " +
      "labelling the right link with the wrong name is worse than no name; " +
      "peek supplies the identity. Sibling EntityDoorControls (not a linked " +
      "name) because a same-tab navigation would discard the note the user is " +
      "typing in this dialog.",
    addedBy: "no-dead-ends detector",
    addedOn: "2026-08-15",
  },
];
