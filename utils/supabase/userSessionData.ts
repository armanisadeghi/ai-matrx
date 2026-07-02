import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { DbRpcRow } from "@/types/supabase-rpc";
import type { JsonObject } from "@/types/json";
import { isJsonObject } from "@/types/json";

export type AdminLevel = Database["public"]["Enums"]["admin_level"];

type AdminsLevelRow = Pick<Database["admin"]["Tables"]["admins"]["Row"], "level">;

export interface AdminStatus {
  isAdmin: boolean;
  level: AdminLevel | null;
}

export interface UserSessionData {
  isAdmin: boolean;
  preferences: JsonObject;
  preferencesExist: boolean;
}

interface UserSessionDataResponse {
  is_admin: boolean;
  preferences: unknown; // Json field — narrowed at use via isJsonObject (Pattern 4)
  preferences_exists: boolean;
}

// Compile-time guard — breaks if the DB row shape changes.
type _CheckUserSessionDataResponse =
  UserSessionDataResponse extends DbRpcRow<"get_user_session_data"> ? true : false;
declare const _userSessionDataResponseCheck: _CheckUserSessionDataResponse;
true satisfies typeof _userSessionDataResponseCheck;

/**
 * Single source of truth for admin status. Queries the admins table once and
 * returns both the boolean (any admin) and the level enum.
 *
 * The day this ships every existing admin row defaults to `super_admin`.
 */
export async function getAdminStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdminStatus> {
  const { data, error } = await supabase
    .schema("admin").from("admins")
    .select("user_id, level")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error checking admin status:", error);
    return { isAdmin: false, level: null };
  }

  const level = (data as AdminsLevelRow | null)?.level ?? null;
  return { isAdmin: !!data, level };
}

/**
 * Highest-bar check. The new default for every gate in the app — server
 * routes, layout guards, and (via the matching selector) UI gates.
 */
export async function checkIsSuperAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { level } = await getAdminStatus(supabase, userId);
  return level === "super_admin";
}

/**
 * Returns true for ANY admin level. Kept for the future "selectively lower
 * the bar" use case — call sites that want to allow developer / senior_admin
 * in addition to super_admin.
 *
 * Most existing call sites switched to `checkIsSuperAdmin` when admin levels
 * shipped; new code should default to `checkIsSuperAdmin` and only use this
 * when the bar has been deliberately lowered for that surface.
 */
export async function checkIsUserAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { isAdmin } = await getAdminStatus(supabase, userId);
  return isAdmin;
}

/**
 * Fetches complete user session data (admin status + preferences) in a single database query.
 * This is much more efficient than making separate queries for admin check and preferences.
 * Use this in layouts where you need both admin status and user preferences.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to fetch session data for
 */
export async function getUserSessionData(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserSessionData> {
  const { data, error } = await supabase
    .rpc("get_user_session_data", { p_user_id: userId })
    .single();

  if (error) {
    console.error("Error fetching user session data:", error);
    return {
      isAdmin: false,
      preferences: {},
      preferencesExist: false,
    };
  }

  if (!data) {
    return {
      isAdmin: false,
      preferences: {},
      preferencesExist: false,
    };
  }

  const row = data as unknown as UserSessionDataResponse;
  return {
    isAdmin: row.is_admin,
    preferences: isJsonObject(row.preferences) ? row.preferences : {},
    preferencesExist: row.preferences_exists,
  };
}
