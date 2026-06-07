/**
 * Shared membership types.
 *
 * Members + Invitations management is ONE reusable system. Organizations and
 * projects both have the role hierarchy `owner > admin > member`, so this is the
 * canonical role union for the shared presentational panels. Feature-local role
 * types (`OrgRole`, `ProjectRole`) are structurally identical and assign
 * cleanly to/from this.
 */
export type MembershipRole = "owner" | "admin" | "member";

/**
 * One selectable role in a role menu / role select. `makeLabel` overrides the
 * default "Make {label}" action wording when present.
 */
export interface MembershipRoleOption {
  value: MembershipRole;
  label: string;
  makeLabel?: string;
}

/** Status of an invitation row, for surfaces that distinguish more than pending. */
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";
