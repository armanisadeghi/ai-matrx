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
  {
    file: "features/content-ir/admin/DuplicateSkillResolver.tsx",
    rule: "bare-id-text",
    reason:
      "`skillId` here is skill.definition.skill_id — a HUMAN-READABLE SLUG " +
      "(`kind_card_detail`), not an opaque id, and the shape doctor's gather " +
      "never carries the skill's uuid, so there is no id to hand a peek. The " +
      "`skill` token is deliberately peek-only in entityRegistry.ts (no detail " +
      "route exists), and a peek keyed by slug would 404 — worse than no door, " +
      "which is exactly what that registry comment warns against. The surface " +
      "answers the identity question better than a door would: each candidate " +
      "card carries the skill's label, everything else it teaches, its " +
      "containment relationship and its demonstration count, and `Compare " +
      "skill bodies` opens the FULL body of both skills in a Monaco diff. The " +
      "flagged line is also inside a ConfirmDialog sentence, where a " +
      "same-tab navigation would discard the decision note being typed.",
    addedBy: "no-dead-ends detector",
    addedOn: "2026-08-26",
  },
];
