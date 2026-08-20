// features/admin/users/types.ts
//
// Shared types for the admin Users & Access hub. The API routes and the
// canonical-table clients both import these — one shape, no drift.

import { z } from "zod";

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

export type AcquisitionIdentityState =
  "visitor" | "guest" | "account" | "converted";

/** Runtime-validated admin projection over auth, guest first-touch, and stored AI cost. */
export const AdminUserAcquisitionRowSchema = z.object({
  row_id: z.string(),
  user_id: z.string().uuid().nullable(),
  email: z.string().nullable(),
  display_name: z.string(),
  identity_state: z.enum(["visitor", "guest", "account", "converted"]),
  is_anonymous: z.boolean(),
  created_at: z.string(),
  converted_at: z.string().nullable(),
  first_ai_activity: z.string().nullable(),
  last_ai_activity: z.string().nullable(),
  total_requests: z.number(),
  total_cost: z.number(),
  landing_host: z.string().nullable(),
  landing_path: z.string().nullable(),
  referrer: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  utm_content: z.string().nullable(),
  utm_term: z.string().nullable(),
  first_touch_captured_at: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  traffic_kind: z.enum(["browser", "bot", "unknown"]),
  client_description: z.string(),
  last_sign_in_at: z.string().nullable(),
});

export type AdminUserAcquisitionRow = z.infer<
  typeof AdminUserAcquisitionRowSchema
>;

export const AcquisitionJourneyEventSchema = z.object({
  id: z.string(),
  occurred_at: z.string(),
  kind: z.enum(["api", "runtime", "error", "server_log"]),
  title: z.string(),
  detail: z.string().nullable(),
  status: z.string().nullable(),
  request_id: z.string().nullable(),
  route: z.string().nullable(),
  cost: z.number().nullable(),
  is_problem: z.boolean(),
});

export const AcquisitionJourneySchema = z.object({
  verdict: z.enum([
    "no_activity",
    "blocked",
    "exploring",
    "engaged",
    "converted",
  ]),
  api_requests: z.number(),
  successful_requests: z.number(),
  failed_requests: z.number(),
  runtime_requests: z.number(),
  runtime_executions: z.number(),
  runtime_cost: z.number(),
  errors: z.number(),
  last_activity: z.string().nullable(),
  feature_usage: z.array(
    z.object({
      feature: z.string(),
      requests: z.number(),
      failures: z.number(),
    }),
  ),
  events: AcquisitionJourneyEventSchema.array(),
});

export type AcquisitionJourneyEvent = z.infer<
  typeof AcquisitionJourneyEventSchema
>;
export type AcquisitionJourney = z.infer<typeof AcquisitionJourneySchema>;
