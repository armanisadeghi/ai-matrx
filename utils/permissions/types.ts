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
  getResourceTypeLabel,
  getResourceSharePath,
} from "./registry";

import type { ResourceType } from "./registry";

// ============================================================================
// Core Permission Types
// ============================================================================

/**
 * Permission levels in hierarchical order: viewer < editor < admin
 */
export type PermissionLevel = "viewer" | "editor" | "admin";

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
  const levels: Record<PermissionLevel, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
  };
  return levels[current] >= levels[required];
}

/**
 * Get all permission levels equal to or higher than the given level
 */
export function getPermissionLevelsAtOrAbove(
  level: PermissionLevel,
): PermissionLevel[] {
  const allLevels: PermissionLevel[] = ["viewer", "editor", "admin"];
  const levelIndex = allLevels.indexOf(level);
  return allLevels.slice(levelIndex);
}

/**
 * Get display label for permission level
 */
export function getPermissionLevelLabel(level: PermissionLevel): string {
  const labels: Record<PermissionLevel, string> = {
    viewer: "Can view",
    editor: "Can edit",
    admin: "Full access",
  };
  return labels[level];
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
