// features/connectors/shared-account-level.ts
//
// WHAT A MEMBER MAY DO WITH A SHARED CONNECTOR ACCOUNT — the runtime consumer
// of `connectors / shared_account.member_default_level`
// (migrations/connectors_knobs.sql), which that migration declared was
// "consumed by the sharing layer" while no sharing layer existed. Until this
// module, an organization-owned connection was reachable by every member of the
// organization through RLS and the Connectors panel offered ALL of them
// Reconnect and Disconnect: the clinic's shared info@ mailbox could be
// disconnected by anyone in the clinic, and the knob an admin turned to say
// otherwise changed nothing at all (check:settings-orphans, LANE SETTINGS-3).
//
// The knob's own vocabulary is the rule this file applies:
//   viewer / commenter / editor — USE the account (send after review, read the
//     calendar, pick files). The credential itself is not theirs to touch.
//   admin — ALSO reconnect and disconnect it.
//
// 🚨 NO CODE FALLBACK. A knob that has not answered yet, or answers with a
// level this build does not know, never becomes a guessed level: the
// credential-level controls are ABSENT and a sentence says why (law 4 — a
// screen is absent or honest, never dead). The one thing this module decides
// without the knob is that the organization's OWN owners and admins keep full
// control of their organization's credential; the knob governs what a MEMBER
// gets, and `overridable_by` is deliberately `{organization}` only so a member
// can never raise their own level.

import {
  PERMISSION_LEVEL_SHORT_LABELS,
  parsePermissionLevel,
  permissionLevelRank,
  type PermissionLevel,
} from "@/utils/permissions/levels";
import type { OrgRole } from "@/features/scopes/types";

/**
 * 🚨 THE REGISTER'S OWN PAIR, never a dotted string. The live row is
 * `feature = 'connectors'`, `key = 'shared_account.member_default_level'` —
 * split at the last dot it would resolve as
 * `('connectors.shared_account','member_default_level')`, which is not seeded
 * (the exact defect `prompt.resurface_days` hit, VERIFY-U-P2-R4 / V13-2).
 */
export const SHARED_CONNECTOR_MEMBER_LEVEL_KNOB = {
  feature: "connectors",
  key: "shared_account.member_default_level",
} as const;

/** The level at and above which the credential itself may be managed. */
const MANAGE_LEVEL: PermissionLevel = "admin";

/**
 * May the person in front of this card reconnect or disconnect the account? A
 * refusal always carries the sentence the card prints in place of the controls
 * — there is no silent `false`.
 */
export type SharedConnectorManagement =
  | { allowed: true; sentence: null }
  | { allowed: false; sentence: string };

export const MANAGEMENT_ALLOWED: SharedConnectorManagement = {
  allowed: true,
  sentence: null,
};

export function resolveSharedConnectorManagement({
  ownerKind,
  organizationName,
  orgRole,
  knobValue,
}: {
  ownerKind: "person" | "organization";
  /** The organization's name, for the sentence. Null when the tree has not answered. */
  organizationName: string | null;
  /** The signed-in person's role in THAT organization; null when unknown. */
  orgRole: OrgRole | null;
  /**
   * The effective value of `connectors / shared_account.member_default_level`.
   * `undefined` means the snapshot has not answered yet — never "editor".
   */
  knobValue: unknown;
}): SharedConnectorManagement {
  // A personal connection is the person's own credential. No organization
  // policy applies to it, and no knob is read for it.
  if (ownerKind !== "organization") return MANAGEMENT_ALLOWED;

  // The organization's owners and admins are who connected it and who answer
  // for it. The knob is about MEMBERS.
  if (orgRole === "owner" || orgRole === "admin") return MANAGEMENT_ALLOWED;

  const org = organizationName ?? "your organization";

  if (knobValue === undefined) {
    return {
      allowed: false,
      sentence: `Checking what ${org} lets members do with this shared account…`,
    };
  }

  const level = parsePermissionLevel(
    knobValue,
    `connectors ${SHARED_CONNECTOR_MEMBER_LEVEL_KNOB.key}`,
  );
  if (!level) {
    // parsePermissionLevel already announced the bad value by name. The screen
    // says the true thing rather than picking a level nobody chose.
    return {
      allowed: false,
      sentence:
        `${org}'s setting for what members may do with a shared connector ` +
        "account could not be read, so reconnecting and disconnecting are not " +
        "offered here. An organization admin can set it in Settings → " +
        "Connectors.",
    };
  }

  if (permissionLevelRank(level) >= permissionLevelRank(MANAGE_LEVEL)) {
    return MANAGEMENT_ALLOWED;
  }

  return {
    allowed: false,
    sentence:
      `This account is connected for ${org}, which gives members ` +
      `“${PERMISSION_LEVEL_SHORT_LABELS[level]}”. You can use it; reconnecting ` +
      "and disconnecting it stay with an organization admin.",
  };
}
