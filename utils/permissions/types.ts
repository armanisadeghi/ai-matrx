/**
 * Permission System Types
 *
 * The single source of truth for which resource types are shareable lives in
 * the database table `shareable_resource_registry`, mirrored in TypeScript by
 * `./registry.ts`. Do NOT add resource types here — add them to the registry.
 */

export type { ShareableResourceEntry, ResourceType } from "./registry";
export {
  SHAREABLE_RESOURCE_REGISTRY,
  RESOURCE_TYPES,
  getShareableResource,
  resolveTableName,
  resolveResourceToken,
  getResourceTypeLabel,
  getResourceSharePath,
} from "./registry";

import type { ResourceType } from "./registry";

// ============================================================================
// Core Permission Types
// ============================================================================

// The access levels are `viewer` · `commenter` · `editor` · `admin` — one vocabulary everywhere
// (AI Matrx Data Doctrine R18, 2026-09-10, recorded in
// common-docs/systems/platform/access/DECISIONS.md). The ladder is declared ONCE in `./levels.ts`
// and re-exported here; `commenter` is in the code ladder already and tolerated everywhere, while
// the live `public.permission_level` enum still holds only `viewer, editor, admin` — see that
// module's header for which side of the gap each call site belongs on.
// Register: /projects/data-doctrine-adoption/REGISTER.md#DD-050
export type { PermissionLevel, DbPermissionLevel } from "./levels";
export {
  PERMISSION_LEVELS,
  PERMISSION_LEVEL_RANK,
  PERMISSION_LEVEL_LABELS,
  PERMISSION_LEVEL_SHORT_LABELS,
  DB_PERMISSION_LEVELS,
  isPermissionLevel,
  isDbPermissionLevel,
  toDbPermissionLevel,
  parsePermissionLevel,
  permissionLevelRank,
} from "./levels";

import {
  PERMISSION_LEVELS,
  PERMISSION_LEVEL_LABELS,
  permissionLevelRank,
  type PermissionLevel,
} from "./levels";

/**
 * Complete permission record from database
 */
export interface Permission {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  grantedToUserId?: string | null;
  grantedToOrganizationId?: string | null;
  isPublic?: boolean;
  permissionLevel: PermissionLevel;
  createdAt?: Date;
  createdBy?: string;
}

/**
 * Enriched permission with user/org details for display
 */
export interface PermissionWithDetails extends Permission {
  grantedToUser?: {
    id: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
  };
  grantedToOrganization?: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
  };
  createdByUser?: {
    id: string;
    email: string;
    displayName?: string;
  };
}

// ============================================================================
// Share Operation Types
// ============================================================================

export interface ShareWithUserOptions {
  resourceType: ResourceType;
  resourceId: string;
  userId: string;
  permissionLevel: PermissionLevel;
  /**
   * Optional human title of the resource, used for the in-app DM notification
   * card ("X shared '<title>' with you"). Falls back to the type label.
   */
  resourceName?: string;
  /**
   * The organization the SHARED OBJECT lives in, from the page that opened the dialog (the
   * object's own resolver — never the active organization). The in-app notification is filed
   * there. Absent, the notification is filed in the organization the person is working in, and
   * when none is picked it is skipped and said — it never raises "Which workspace is this for?"
   * (lane ACCESS-FIX-18, VERIFIER-18 H4).
   */
  organizationId?: string | null;
}

export interface ShareWithOrgOptions {
  resourceType: ResourceType;
  resourceId: string;
  organizationId: string;
  /**
   * Explicit level. Omit to let the server apply the org module's
   * `default_permission` (falls back to 'viewer'). Pickers pass a level; the
   * "contribute" flow omits it.
   */
  permissionLevel?: PermissionLevel;
}

export interface MakePublicOptions {
  resourceType: ResourceType;
  resourceId: string;
  permissionLevel?: PermissionLevel;
}

export interface UpdatePermissionOptions {
  resourceType: ResourceType;
  resourceId: string;
  userId?: string;
  organizationId?: string;
  isPublic?: boolean;
  newLevel: PermissionLevel;
}

export interface RevokeAccessOptions {
  resourceType: ResourceType;
  resourceId: string;
  userId?: string;
  organizationId?: string;
  isPublic?: boolean;
}

// ============================================================================
// Permission Check Types
// ============================================================================

export interface PermissionCheckResult {
  hasAccess: boolean;
  level?: PermissionLevel;
  isOwner: boolean;
  reason?: string;
}

export interface CheckPermissionOptions {
  resourceType: ResourceType;
  resourceId: string;
  requiredLevel?: PermissionLevel;
}

// ============================================================================
// Resource Owner Types
// ============================================================================

export interface OwnedResource {
  id: string;
  user_id: string;
  [key: string]: unknown;
}

export interface OwnerCheckResult {
  isOwner: boolean;
  ownerId: string;
}

// ============================================================================
// Sharing UI Types
// ============================================================================

export type ShareTargetType = "user" | "organization" | "public";

export interface SharingState {
  isOpen: boolean;
  activeTab: ShareTargetType;
  permissions: PermissionWithDetails[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  selectedPermissionLevel: PermissionLevel;
}

export interface ShareActionResult {
  success: boolean;
  message?: string;
  error?: string;
  permission?: Permission;
}

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Check if a permission level satisfies a required level
 */
export function satisfiesPermissionLevel(
  current: PermissionLevel,
  required: PermissionLevel,
): boolean {
  return permissionLevelRank(current) >= permissionLevelRank(required);
}

/**
 * Get all permission levels equal to or higher than the given level
 */
export function getPermissionLevelsAtOrAbove(
  level: PermissionLevel,
): PermissionLevel[] {
  const levelIndex = PERMISSION_LEVELS.indexOf(level);
  return [...PERMISSION_LEVELS].slice(levelIndex);
}

/**
 * Get display label for permission level
 */
export function getPermissionLevelLabel(level: PermissionLevel): string {
  // Never `undefined` for a known level, and never a blank string on screen for
  // an unknown one — an unrecognised level names itself instead (law 4).
  return PERMISSION_LEVEL_LABELS[level] ?? `Unknown level (${level})`;
}

/**
 * Validate permission data
 */
export function validatePermission(permission: Partial<Permission>): boolean {
  if (!permission.resourceType) {
    throw new Error("Resource type is required");
  }
  if (!permission.resourceId) {
    throw new Error("Resource ID is required");
  }
  if (!permission.permissionLevel) {
    throw new Error("Permission level is required");
  }

  const targetsSet = [
    !!permission.grantedToUserId,
    !!permission.grantedToOrganizationId,
    !!permission.isPublic,
  ].filter(Boolean).length;

  if (targetsSet !== 1) {
    throw new Error(
      "Exactly one of grantedToUserId, grantedToOrganizationId, or isPublic must be set",
    );
  }
  return true;
}

// ============================================================================
// Error Types
// ============================================================================

export class PermissionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

export enum PermissionErrorCode {
  NOT_FOUND = "PERMISSION_NOT_FOUND",
  ALREADY_EXISTS = "PERMISSION_ALREADY_EXISTS",
  INVALID_LEVEL = "INVALID_PERMISSION_LEVEL",
  INVALID_TARGET = "INVALID_SHARE_TARGET",
  UNAUTHORIZED = "UNAUTHORIZED",
  DATABASE_ERROR = "DATABASE_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
}
