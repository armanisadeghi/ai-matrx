/**
 * Organization Types
 * 
 * Type definitions for organization management system including
 * organizations, members, and invitations.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Organization role hierarchy: owner > admin > member
 */
export type OrgRole = 'owner' | 'admin' | 'member';

/**
 * Organization entity
 */
export interface Organization {
  id: string;
  name: string;
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
  settings?: Record<string, any>;
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
  slug: string;
  description?: string;
  logoUrl?: string;
  logoFileId?: string;
  website?: string;
  settings?: Record<string, any>;
}

/**
 * Options for updating an organization
 */
export interface UpdateOrganizationOptions {
  name?: string;
  description?: string;
  logoUrl?: string;
  logoFileId?: string;
  website?: string;
  settings?: Record<string, any>;
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
}

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Check if a role can perform an action
 */
export function canManageMembers(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if a role can manage settings
 */
export function canManageSettings(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if a role can delete organization
 */
export function canDeleteOrg(role: OrgRole): boolean {
  return role === 'owner';
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
export function validateOrgName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Organization name is required' };
  }
  
  if (name.length < 3) {
    return { valid: false, error: 'Organization name must be at least 3 characters' };
  }
  
  if (name.length > 50) {
    return { valid: false, error: 'Organization name must be less than 50 characters' };
  }
  
  return { valid: true };
}

/**
 * Validate organization slug
 */
export function validateOrgSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, error: 'Organization slug is required' };
  }
  
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { valid: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens' };
  }
  
  if (slug.length < 3) {
    return { valid: false, error: 'Slug must be at least 3 characters' };
  }
  
  if (slug.length > 50) {
    return { valid: false, error: 'Slug must be less than 50 characters' };
  }
  
  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
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
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get display label for role
 */
export function getRoleLabel(role: OrgRole): string {
  const labels: Record<OrgRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
  };
  return labels[role];
}

/**
 * Get role badge color
 */
export function getRoleBadgeColor(role: OrgRole): string {
  const colors: Record<OrgRole, string> = {
    owner: 'yellow',
    admin: 'blue',
    member: 'gray',
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
    return 'Expired';
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `Expires in ${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `Expires in ${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return 'Expires soon';
  }
}

