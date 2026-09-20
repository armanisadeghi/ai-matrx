// utils/auth/adminUtils.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import {
  checkIsUserAdmin,
  getAdminStatus,
  type AdminLevel,
} from '@/utils/supabase/userSessionData';
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * Server-side Admin Utilities
 *
 * These functions run on the server and provide secure admin verification.
 * All functions query the database 'admins' table as the single source of truth.
 * Use these for any security-critical operations in API routes and server actions.
 *
 * Default bar: Super Admin. Use `requireSuperAdmin()` / `checkIsSuperAdmin()`
 * unless a specific surface has been deliberately lowered to allow other levels.
 */

/**
 * Get the current user's ID, admin status, and admin level (server-side).
 * Queries the database admins table to verify admin status.
 * @returns Object with userId, isAdmin, and level, or null if not authenticated
 */
export async function getCurrentUserAdminStatus(): Promise<{
  userId: string;
  isAdmin: boolean;
  level: AdminLevel | null;
} | null> {
  const supabase = await createClient();

  const { data: { user }, error } = await getClaimsUser(supabase);

  if (error || !user) {
    return null;
  }

  const { isAdmin, level } = await getAdminStatus(supabase, user.id);

  return {
    userId: user.id,
    isAdmin,
    level,
  };
}

/**
 * Verify that the current user is a Super Admin (server-side).
 * Highest-bar route guard — the new default for admin-only API routes and
 * server actions. Throws on auth failure or insufficient level.
 * @returns The user ID if user is an authenticated Super Admin
 * @throws Error if user is not authenticated or not a Super Admin
 */
export async function requireSuperAdmin(): Promise<string> {
  const status = await getCurrentUserAdminStatus();

  if (!status) {
    throw new Error('Unauthorized: User not authenticated');
  }

  if (status.level !== 'super_admin') {
    throw new Error('Forbidden: Super Admin required');
  }

  return status.userId;
}

/**
 * Verify that the current user is an admin at any level (server-side).
 * Kept for the future selective-lower use case. Most call sites use
 * `requireSuperAdmin` instead.
 * @returns The user ID if user is an authenticated admin
 * @throws Error if user is not authenticated or not an admin
 */
export async function requireAdmin(): Promise<string> {
  const status = await getCurrentUserAdminStatus();

  if (!status) {
    throw new Error('Unauthorized: User not authenticated');
  }

  if (!status.isAdmin) {
    throw new Error('Forbidden: User is not an admin');
  }

  return status.userId;
}

/**
 * Check if a specific user ID is an admin at any level (server-side)
 * Queries the database admins table.
 * @param userId - User ID to check
 * @returns true if user is an admin
 */
export async function checkIsAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  return checkIsUserAdmin(supabase, userId);
}
