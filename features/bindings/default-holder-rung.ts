// features/bindings/default-holder-rung.ts
//
// THE BOTTOM RUNG — the mandate's OWN default holder — as pure functions.
//
// 🚨 WHAT THIS RUNG IS. A mandate's bottom rung is not a binding: it is the
// three `mandate.definition` columns `default_holder_type` /
// `default_holder_id` / `default_holder_version_id`. `mandate._rungs` returns
// it as the `system` rung, and per FIX-R1 that rung's principal is the
// mandate's HOME organization — everybody on the platform for a system-homed
// mandate, that ONE organization for an org-homed one.
//
// 🚨 THE DEFECT THIS CLOSES (FIX-R3/W3, fresh Sonnet walk of v0.4.1718). It
// could not be set from the UI at all, and `ScopeHolderBar` told every reader
// it *"is a super-admin decision, so it is not offered here"* — true for a
// system-homed mandate and WRONG for an org-homed one, whose bottom rung
// belongs to that organization's own administrators. A screen that names the
// wrong decider is the fourth law's lie, not a rough edge.
//
// ────────────────────────────────────────────────────────────────────────────
// 🔶 A NAMING COLLISION THIS FILE DELIBERATELY DOES NOT RESOLVE
//
// The campaign's frozen ladder is `system` (the definition's own default) ·
// `global` (a platform-wide binding row) · `org` · `user`, and the register
// states that *"`global` is never relabelled `system`"*. `system-rung.ts`
// (landed 2026-09-08 by the admin-route lane) nonetheless calls the **global**
// binding rung "System — decides for every user".
//
// So on this screen the word "System" now reaches a reader from two different
// rungs. Renaming `global` mid-flight would stomp a live lane, so nothing here
// touches it: this rung's constants are prefixed `DEFAULT_HOLDER_*` (never
// `SYSTEM_RUNG_*`), its copy leads with "default", and the collision is
// reported to the register as a finding rather than silently papered over.
// ────────────────────────────────────────────────────────────────────────────

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";

/**
 * The rung's own key, in the campaign's frozen vocabulary. It sits BESIDE
 * `BindingRung`'s three values rather than inside them, because the three are
 * "the rungs a mandate binding can actually be written at" and this one is not
 * a binding at all.
 */
export const DEFAULT_HOLDER_RUNG = "system" as const;

/**
 * WHAT THIS RUNG CAN AND CANNOT HOLD, said on the screen where the map and the
 * settings would otherwise be.
 *
 * The definition default has no `consumption_map`, no `config_overrides` and no
 * `auto_run` — those columns live on `agent.mandate_binding`. A mapping editor
 * standing here would appear to save something the door never receives, which
 * is exactly the class this campaign kills.
 */
export const DEFAULT_HOLDER_IS_HOLDER_ONLY =
  "The mapping, the settings and auto-run live on a binding above this rung — this one names the holder and nothing else.";

export interface DefaultHolderRungInput {
  /** The mandate's HOME organization — `mandate.definition.organization_id`. */
  homeOrganizationId: string | null;
  /** That organization's name, when this screen has read it. */
  homeOrganizationName: string | null;
  /**
   * The caller's role IN THE HOME ORGANIZATION — `OrganizationWithRole.role`,
   * the same source `canBindThisOrg` reads. `null` means "not a member of it".
   *
   * 🚨 It is the role in the HOME org, never in the caller's active workspace:
   * the active org decides nothing at this rung (the server reads the home off
   * the row), and letting it decide is how a person in two organizations would
   * rebind the wrong one's floor.
   */
  homeOrganizationRole: string | null;
  isSuperAdmin: boolean;
}

export interface DefaultHolderRungOffer {
  /** Is the mandate homed in the Matrx System organization? */
  systemHomed: boolean;
  /** May this caller set it — the predicate the screen and the guard share. */
  offered: boolean;
  /** The rung's name, for the reader in front of it. */
  label: string;
  /** Who runs this answer, in one sentence. */
  covers: string;
  /**
   * Why it is not offered, WHO may decide instead, and what this reader can
   * still do. `null` exactly when `offered` is true — a rung that is neither
   * offered nor explained is the dead control the fourth law forbids.
   */
  refusal: string | null;
  /** Who may HOLD it, printed before the picker opens. */
  holderRule: string;
}

/** The org roles that may decide for an organization — the server's own SQL. */
function isOrgAdminRole(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

/**
 * THE ONE PREDICATE for "may this person set this mandate's own default", and
 * the words that go with each answer.
 *
 * It mirrors `put_mandate_default_holder`'s gate (aidream
 * `api/routers/mandate_bindings.py`): a platform super administrator, or an
 * administrator of the mandate's HOME organization when that home is not the
 * Matrx System organization. The server is still the authority — if the two
 * ever disagree it refuses in its own words, and that sentence is printed
 * verbatim rather than swallowed.
 */
export function defaultHolderRungOffer(
  input: DefaultHolderRungInput,
): DefaultHolderRungOffer {
  const { homeOrganizationId, homeOrganizationRole, isSuperAdmin } = input;

  // 🚨 NEVER GUESS AT AN UNREAD HOME. Treating a missing home as "system" would
  // tell an organization's own admin that a platform administrator owns their
  // job; treating it as "org" would offer a control that 403s. Say it instead.
  if (!homeOrganizationId) {
    return {
      systemHomed: false,
      offered: false,
      label: "The job's own default",
      covers:
        "Whoever this names runs the job wherever no binding above it answers.",
      refusal:
        "We have not read which organization this job is homed in yet, and the home is what decides who may set its default. Reload the page — until then you can still choose your own answer above.",
      holderRule: DEFAULT_HOLDER_ORG_HOLDER_RULE,
    };
  }

  const systemHomed =
    homeOrganizationId.toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase();
  const homeName =
    input.homeOrganizationName ??
    (systemHomed ? "the Matrx System organization" : "its home organization");

  if (systemHomed) {
    return {
      systemHomed: true,
      offered: isSuperAdmin,
      label: "System default",
      covers:
        "Every user on the platform runs this, wherever no binding above it answers.",
      refusal: isSuperAdmin
        ? null
        : "This job is homed in the Matrx System organization, so its default decides for every user on the platform — only a platform administrator can set it. You can still set your own answer above, or set one for an organization you administer.",
      holderRule: DEFAULT_HOLDER_SYSTEM_HOLDER_RULE,
    };
  }

  const allowed = isSuperAdmin || isOrgAdminRole(homeOrganizationRole);
  return {
    systemHomed: false,
    offered: allowed,
    label: `Default for ${homeName}`,
    covers: `Everyone in ${homeName} runs this, wherever no binding above it answers.`,
    refusal: allowed
      ? null
      : `This job is homed in ${homeName}, and its default decides for everyone in that organization — so only an owner or administrator of ${homeName} can set it. You are ${homeOrganizationRole ? `a ${homeOrganizationRole}` : "not a member"} there: ask one of them, or set your own answer above.`,
    holderRule: DEFAULT_HOLDER_ORG_HOLDER_RULE,
  };
}

/**
 * The holder rule at a SYSTEM-homed default. Deliberately the same law
 * `system-rung.ts` states for the platform-wide binding rung — the blast radius
 * is identical (every user on the platform), so the rule is too.
 */
export const DEFAULT_HOLDER_SYSTEM_HOLDER_RULE =
  "This default runs for every user on the platform, so only system agents can hold it.";

/**
 * The holder rule at an ORG-homed default. The home organization's own members
 * must be able to open the holder, or the row is written and then dropped at
 * read time. The server judges it for real (409, FIX-R1's one containment
 * predicate) and its refusal is printed verbatim; this restricts the picker as
 * far as the client can honestly see, and never warns-and-allows.
 */
export const DEFAULT_HOLDER_ORG_HOLDER_RULE =
  "This default runs for everyone in the organization that homes this job, so only agents shared with an organization — or system agents — can hold it.";

/**
 * The refusal when a personal agent is drafted as a SYSTEM-homed default, with
 * the remedy in the same sentence. Save is disabled while it stands.
 */
export const DEFAULT_HOLDER_PERSONAL_HOLDER_REFUSAL =
  "This is a personal agent, and this default runs for every user on the platform. Duplicate it into a system agent in the system-agents admin, then set the copy as the default.";
