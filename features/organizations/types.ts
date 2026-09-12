/**
 * Organization Types
 *
 * Type definitions for organization management system including
 * organizations, members, and invitations.
 */

import type { JsonObject } from "@/types/json";

// ============================================================================
// Core Types
// ============================================================================

/**
 * Organization role hierarchy: owner > admin > member
 */
export type OrgRole = "owner" | "admin" | "member";

const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "member"];

/** Narrow a DB `role: string` (iam.organization_members.role) into OrgRole. */
export function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value);
}

/** Narrow a DB role string, falling back to 'member' for any unrecognized value. */
export function toOrgRole(value: string): OrgRole {
  return isOrgRole(value) ? value : "member";
}

/**
 * Organization entity
 */
export interface Organization {
  id: string;
  name: string;
  abbreviation: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  /** cld_files.id backing logoUrl. Source of truth for rendering; logoUrl is the fallback. */
  logoFileId?: string | null;
  website?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  isPersonal: boolean;
  settings?: JsonObject;
}

/**
 * Organization with user's role
 */
export interface OrganizationWithRole extends Organization {
  role: OrgRole;
  memberCount?: number;
}

/**
 * Organization member
 */
export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  joinedAt: string;
  invitedBy?: string | null;
}

/**
 * Organization member with user details
 */
export interface OrganizationMemberWithUser extends OrganizationMember {
  user?: {
    id: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

/**
 * Organization invitation
 */
export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  token: string;
  role: OrgRole;
  invitedAt: string;
  invitedBy?: string | null;
  expiresAt: string;
}

/**
 * Organization invitation with org details
 */
export interface OrganizationInvitationWithOrg extends OrganizationInvitation {
  organization?: Organization;
}

// ============================================================================
// Operation Options
// ============================================================================

/**
 * Options for creating an organization
 */
export interface CreateOrganizationOptions {
  name: string;
  abbreviation: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  logoFileId?: string;
  website?: string;
  settings?: JsonObject;
}

/**
 * Options for updating an organization
 */
export interface UpdateOrganizationOptions {
  name?: string;
  abbreviation?: string;
  description?: string;
  logoUrl?: string;
  logoFileId?: string;
  website?: string;
  settings?: JsonObject;
}

/**
 * Options for inviting a member
 */
export interface InviteMemberOptions {
  organizationId: string;
  email: string;
  role?: OrgRole;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Generic operation result
 */
export interface OperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Organization operation result
 */
export interface OrganizationResult extends OperationResult {
  organization?: Organization;
}

/**
 * Invitation operation result
 */
export interface InvitationResult extends OperationResult {
  invitation?: OrganizationInvitation;
  /**
   * Whether the invitation EMAIL actually went out. `false` means the
   * invitation row exists and is acceptable by its link, but nothing was
   * delivered — the caller must show the copy-the-link remedy instead of a
   * success toast (DD-091, law 4: nothing fails silently). `undefined` only
   * when no send was attempted.
   */
  emailSent?: boolean;
  /** Why the send failed, in a sentence a human can act on. */
  emailError?: string;
  /** The accept link to hand out by other means when `emailSent` is false. */
  acceptUrl?: string;
}

/** Resend result — same honesty contract as {@link InvitationResult}. */
export interface ResendInvitationResult extends OperationResult {
  emailSent?: boolean;
  emailError?: string;
  acceptUrl?: string;
}

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Check if a role can perform an action
 */
export function canManageMembers(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Check if a role can manage settings
 */
export function canManageSettings(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Pending invitations contain email addresses and acceptance tokens. They are
 * available only to managers of non-personal organizations; the database
 * intentionally rejects invitation management for personal organizations.
 */
export function canManageInvitations(
  role: OrgRole,
  isPersonal: boolean,
): boolean {
  return !isPersonal && canManageMembers(role);
}

/**
 * Check if a role can delete organization
 */
export function canDeleteOrg(role: OrgRole): boolean {
  return role === "owner";
}

/**
 * Check if role A is higher than role B
 */
export function isHigherRole(roleA: OrgRole, roleB: OrgRole): boolean {
  const hierarchy: Record<OrgRole, number> = {
    member: 1,
    admin: 2,
    owner: 3,
  };

  return hierarchy[roleA] > hierarchy[roleB];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate organization name
 */
export function validateOrgName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Organization name is required" };
  }

  if (name.length < 3) {
    return {
      valid: false,
      error: "Organization name must be at least 3 characters",
    };
  }

  if (name.length > 50) {
    return {
      valid: false,
      error: "Organization name must be less than 50 characters",
    };
  }

  return { valid: true };
}

/**
 * Validate organization slug
 */
export function validateOrgSlug(slug: string): {
  valid: boolean;
  error?: string;
} {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, error: "Organization slug is required" };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      valid: false,
      error: "Slug can only contain lowercase letters, numbers, and hyphens",
    };
  }

  if (slug.length < 3) {
    return { valid: false, error: "Slug must be at least 3 characters" };
  }

  if (slug.length > 50) {
    return { valid: false, error: "Slug must be less than 50 characters" };
  }

  return { valid: true };
}

/** The fixed compact label for a user's personal organization. */
export const PERSONAL_ORG_ABBREVIATION = "ME";

/**
 * Is this organization the VIEWER'S OWN personal organization?
 *
 * 🚨 `isPersonal` ALONE IS NOT THE ANSWER — it says "this is somebody's private
 * workspace", never "it is yours". A user can hold a membership in another
 * person's personal org, and every surface that derived "Personal" / "ME" from
 * `isPersonal` alone was labelling someone else's private workspace as the
 * viewer's own.
 *
 * Live defect, 2026-09-11: an account holding an `admin` membership in another
 * account's personal org saw TWO organizations badged Personal, and
 * `OrganizationList`'s `find(o => o.isPersonal)` matched the one it did NOT
 * own — so the viewer's real personal org disappeared from the page entirely
 * (the team-org list filters out everything `isPersonal`).
 *
 * Ownership is `created_by`. That is the same column the database keys on in
 * `iam.personal_org_id()` and in the partial unique index
 * `organizations_one_personal_per_creator`, so this predicate and the server
 * agree by construction rather than by coincidence.
 *
 * Accepts either wire spelling: the camelCase `Organization` shape and the
 * snake_case row/RPC shape are the same fact, so they share one predicate
 * instead of growing a second implementation.
 */
export function isOwnPersonalOrg(
  org: {
    isPersonal?: boolean | null;
    is_personal?: boolean | null;
    createdBy?: string | null;
    created_by?: string | null;
  },
  viewerUserId: string | null | undefined,
): boolean {
  const personal = org.isPersonal ?? org.is_personal ?? false;
  if (personal !== true) return false;
  const owner = org.createdBy ?? org.created_by ?? null;
  return !!viewerUserId && !!owner && owner === viewerUserId;
}

const ABBREVIATION_IGNORED_WORDS = new Set([
  "A",
  "AN",
  "AND",
  "AT",
  "BY",
  "FOR",
  "OF",
  "THE",
  "CO",
  "COMPANY",
  "CORP",
  "CORPORATION",
  "INC",
  "INCORPORATED",
  "LLC",
  "LLP",
  "LTD",
  "LIMITED",
  "LP",
  "PLC",
]);

/**
 * Generate the canonical 2-3 letter starting value for an organization.
 * Personal organizations are always ME. Shared organizations use meaningful
 * word initials, preserving a short leading initialism (AI Matrx -> AIM).
 */
export function generateOrganizationAbbreviation(
  name: string,
  isPersonal = false,
): string {
  if (isPersonal) return PERSONAL_ORG_ABBREVIATION;

  const words = (name.toUpperCase().match(/[A-Z]+/g) ?? []).filter(
    (word) => !ABBREVIATION_IGNORED_WORDS.has(word),
  );
  if (words.length === 0) return "ORG";
  if (words.length === 1) {
    return words[0].slice(0, 3).padEnd(2, "X");
  }

  let abbreviation = words[0].length === 2 ? words[0] : words[0][0];
  for (const word of words.slice(1)) {
    if (abbreviation.length >= 3) break;
    abbreviation += word[0];
  }
  return abbreviation.slice(0, 3).padEnd(2, "X");
}

/**
 * The compact label to SHOW a given viewer for an organization.
 *
 * 🚨 `PERSONAL_ORG_ABBREVIATION` ("ME") is a VIEWER-RELATIVE word stored as an
 * absolute column: every personal org carries `abbreviation = 'ME'` in
 * `iam.organizations`, which is true only for its owner. A user holding a
 * membership in someone else's personal org therefore saw two different orgs
 * both chipped "ME" — the most visible half of the 2026-09-11 "why am I seeing
 * two personal organizations" defect, and one that no amount of fixing the
 * badge logic alone could remove, because the wrong word is in the data.
 *
 * So the stored value is honoured for the owner and for every shared org, and
 * recomputed from the name for a personal org the viewer does not own. Nothing
 * is written back: the column stays correct for the person it describes.
 */
export function displayOrganizationAbbreviation(
  org: {
    name: string;
    abbreviation?: string | null;
    isPersonal?: boolean | null;
    is_personal?: boolean | null;
    createdBy?: string | null;
    created_by?: string | null;
  },
  viewerUserId: string | null | undefined,
): string {
  const personal = org.isPersonal ?? org.is_personal ?? false;
  if (personal === true && !isOwnPersonalOrg(org, viewerUserId)) {
    return generateOrganizationAbbreviation(org.name, false);
  }
  return org.abbreviation ?? generateOrganizationAbbreviation(org.name, personal === true);
}

/** Validate the database-backed compact organization label. */
export function validateOrganizationAbbreviation(abbreviation: string): {
  valid: boolean;
  error?: string;
} {
  if (!/^[A-Z]{2,3}$/.test(abbreviation)) {
    return {
      valid: false,
      error: "Abbreviation must be 2–3 uppercase letters",
    };
  }
  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): {
  valid: boolean;
  error?: string;
} {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: "Email is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }

  return { valid: true };
}

/**
 * Generate slug from organization name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get display label for role
 */
export function getRoleLabel(role: OrgRole): string {
  const labels: Record<OrgRole, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
  };
  return labels[role];
}

/**
 * Get role badge color
 */
export function getRoleBadgeColor(role: OrgRole): string {
  const colors: Record<OrgRole, string> = {
    owner: "yellow",
    admin: "blue",
    member: "gray",
  };
  return colors[role];
}

/**
 * Format time remaining until expiration
 */
export function getExpiryDisplay(expiresAt: string): string {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff < 0) {
    return "Expired";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `Expires in ${days} day${days > 1 ? "s" : ""}`;
  } else if (hours > 0) {
    return `Expires in ${hours} hour${hours > 1 ? "s" : ""}`;
  } else {
    return "Expires soon";
  }
}
