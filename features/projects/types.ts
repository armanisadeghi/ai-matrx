/**
 * Project Types
 *
 * Type definitions for project management system including
 * projects, members, and invitations. Mirrors the organizations feature.
 */

import { formatDurationMs } from "@ai-matrx/kit/format";

import type { Json } from "@/types/database.types";

// ============================================================================
// Core Types
// ============================================================================

export type ProjectRole = "owner" | "admin" | "member";

export type ProjectStatus =
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type ProjectPriority = "low" | "medium" | "high";

export interface Project {
  id: string;
  name: string;
  slug: string | null;
  description?: string | null;
  organizationId: string | null;
  createdBy?: string | null;
  isPersonal: boolean;
  status: ProjectStatus;
  priority?: ProjectPriority | null;
  startDate?: string | null;
  targetDate?: string | null;
  settings?: Json | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithRole extends Project {
  role: ProjectRole;
  memberCount?: number;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  invitedBy?: string | null;
}

export interface ProjectMemberWithUser extends ProjectMember {
  user?: {
    id: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  email: string;
  token: string;
  role: ProjectRole;
  invitedAt: string;
  invitedBy?: string | null;
  expiresAt: string;
}

export interface ProjectInvitationWithProject extends ProjectInvitation {
  project?: Project;
}

// ============================================================================
// Operation Options
// ============================================================================

export interface CreateProjectOptions {
  name: string;
  slug: string;
  /** Undefined or null resolves to the user's personal organization. */
  organizationId?: string | null;
  description?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateProjectOptions {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  /** Move the project to a different organization; null resolves to personal org. */
  organizationId?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority | null;
  /** ISO date (yyyy-mm-dd) or null to clear. */
  startDate?: string | null;
  targetDate?: string | null;
}

export interface InviteProjectMemberOptions {
  projectId: string;
  email: string;
  role?: ProjectRole;
}

// ============================================================================
// Project References
// ============================================================================

export interface ProjectReference {
  schemaName: string;
  tableName: string;
  columnName: string;
  rowCount: number;
}

export interface ProjectReferenceDetailed extends ProjectReference {
  sampleIds: string[] | null;
}

// ============================================================================
// Result Types
// ============================================================================

export interface OperationResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ProjectResult extends OperationResult {
  project?: Project;
}

export interface ProjectInvitationResult extends OperationResult {
  invitation?: ProjectInvitation;
  /**
   * Whether the invitation EMAIL actually went out. `false` means the row
   * exists and the link works, but nothing was delivered — show the
   * copy-the-link remedy, never a success toast (DD-091, law 4).
   */
  emailSent?: boolean;
  emailError?: string;
  acceptUrl?: string;
}

/** Resend result — same honesty contract as {@link ProjectInvitationResult}. */
export interface ResendProjectInvitationResult extends OperationResult {
  emailSent?: boolean;
  emailError?: string;
  acceptUrl?: string;
}

// ============================================================================
// Permission Helpers
// ============================================================================

export function canManageProjectMembers(role: ProjectRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageProjectSettings(role: ProjectRole): boolean {
  return role === "owner" || role === "admin";
}

export function canDeleteProject(role: ProjectRole): boolean {
  return role === "owner";
}

export function isHigherProjectRole(
  roleA: ProjectRole,
  roleB: ProjectRole,
): boolean {
  const hierarchy: Record<ProjectRole, number> = {
    member: 1,
    admin: 2,
    owner: 3,
  };
  return hierarchy[roleA] > hierarchy[roleB];
}

// ============================================================================
// Validation
// ============================================================================

export function validateProjectName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Project name is required" };
  }
  if (name.length < 2) {
    return {
      valid: false,
      error: "Project name must be at least 2 characters",
    };
  }
  if (name.length > 50) {
    return {
      valid: false,
      error: "Project name must be less than 50 characters",
    };
  }
  return { valid: true };
}

export function validateProjectSlug(slug: string): {
  valid: boolean;
  error?: string;
} {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, error: "Project slug is required" };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      valid: false,
      error: "Slug can only contain lowercase letters, numbers, and hyphens",
    };
  }
  if (slug.length < 2) {
    return { valid: false, error: "Slug must be at least 2 characters" };
  }
  if (slug.length > 50) {
    return { valid: false, error: "Slug must be less than 50 characters" };
  }
  return { valid: true };
}

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

export function generateProjectSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================================
// Display Helpers
// ============================================================================

export function getRoleLabel(role: ProjectRole): string {
  const labels: Record<ProjectRole, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
  };
  return labels[role];
}

export function getRoleBadgeColor(role: ProjectRole): string {
  const colors: Record<ProjectRole, string> = {
    owner: "yellow",
    admin: "blue",
    member: "gray",
  };
  return colors[role];
}

/**
 * THE prose voice: @ai-matrx/kit/format's `long` ("3 days", "5 hours",
 * "20 minutes"), which floors so a countdown never over-promises, and
 * pluralises correctly at every unit.
 */
export function getExpiryDisplay(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return "Expired";
  if (diff < 0) return "Expired";
  return `Expires in ${formatDurationMs(diff, { style: "long" })}`;
}
