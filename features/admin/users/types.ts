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
