// features/admin/users/types.ts
//
// Shared types for the admin Users & Access hub. The API routes and the
// canonical-table clients both import these — one shape, no drift.

/** The FULL user roster row (auth facts + profile + admin level). */
export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  providers: string[];
  email_confirmed: boolean;
  phone_confirmed: boolean;
  is_anonymous: boolean;
  banned: boolean;
  /** admin_level enum value (developer|senior_admin|super_admin) or null. */
  admin_level: string | null;
  onboarding_completed: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  organizations: AdminUserOrganizationMembership[];
}

/** Organization membership shown inline on the global account roster. */
export interface AdminUserOrganizationMembership {
  id: string;
  name: string;
  abbreviation: string;
  slug: string;
  role: string;
  is_personal: boolean;
  is_system: boolean;
}

/** One organization in the super-admin organization directory. */
export interface AdminOrganizationRow {
  id: string;
  name: string;
  abbreviation: string;
  slug: string;
  description: string | null;
  website: string | null;
  created_at: string | null;
  created_by: string | null;
  is_personal: boolean;
  is_system: boolean;
  member_count: number;
  owner_count: number;
  admin_count: number;
}

/** One active canonical organization membership. */
export interface AdminOrganizationMembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  invited_by: string | null;
}

export interface AdminOrganizationDirectory {
  organizations: AdminOrganizationRow[];
  memberships: AdminOrganizationMembershipRow[];
}

/** Per-user AI usage & cost rollup (chat.admin_user_usage_rollup). */
export interface AdminUserUsageRow {
  user_id: string;
  email: string | null;
  total_requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_cost: number;
  distinct_models: number;
  last_activity: string | null;
}
