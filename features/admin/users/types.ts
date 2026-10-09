// features/admin/users/types.ts
//
// Shared types for the admin Users & Access hub. The API routes and the
// canonical-table clients both import these — one shape, no drift.

import { z } from "zod";
import { GuestAccessSchema } from "./lib/guestAccess";
import type { PersonKind, PersonStage } from "./lib/personSegments";

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
  /** Personal data erased (iam.account_closure.erased_at); cannot be reopened. */
  erased: boolean;
  /** admin_level enum value (developer|senior_admin|super_admin) or null. */
  admin_level: string | null;
  /** Explicit non-role grant stored in protected Supabase app_metadata. */
  mcp_full_access: boolean;
  /** Top-tier models (cost rating 6): app_metadata.permissions has "models.top_tier". Super admins change it. */
  top_tier_models: boolean;
  onboarding_completed: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  organizations: AdminUserOrganizationMembership[];
  /** Exact claimed_by join in the AI Matrx CRM tenant; never name/email matching. */
  party_id?: string | null;
  party_integrity?: "resolved" | "missing" | "ambiguous" | "anonymous";
  /** Who this account is — derived by `lib/personSegments.ts`. */
  kind: PersonKind;
  /** Short reason `kind` was chosen (tooltip). */
  kind_reason: string;
  /** How far along the journey this account got. */
  stage: PersonStage;
  /** All-time AI requests (chat.admin_user_usage_rollup). */
  ai_requests: number;
  /** AI requests in the last 7 days. */
  ai_requests_7d: number;
  /** Distinct UTC days with AI activity — 2+ is sustained use. */
  ai_active_days: number;
  /** All-time stored AI cost, USD. */
  ai_cost: number;
  first_ai_activity: string | null;
  last_ai_activity: string | null;
  /** First observed browser, e.g. "Chrome 153 · macOS"; null when never seen. */
  client: string | null;
  /** First-touch source: utm_source, referring host, "Direct", … */
  source: string | null;
  /** First landing host + path, when captured. */
  landing: string | null;
  /** The plan this person's allowance comes from; null when the read failed. */
  plan: AdminUserPlan | null;
}

/** Usage state of one window, from billing._points_usage_state (never re-derived). */
export type AdminUsageState = "ok" | "near" | "over";

/** A person's effective plan + AI-points usage (users.admin_account_plans). */
export interface AdminUserPlan {
  key: string;
  name: string;
  /**
   * guest = anonymous visitor; organization = the custom values of the person's
   * Enterprise organization (`organization` names it); grant = per-person
   * billing.user_plan row; default = the default plan.
   */
  source: "guest" | "organization" | "grant" | "default";
  /** The Enterprise organization the allowance comes from (users.admin_account_points). */
  organization: { id: string; name: string } | null;
  grant_expires_at: string | null;
  grant_note: string | null;
  state: AdminUsageState;
  /** The window closest to its limit, with its numbers. */
  binding: {
    period: string;
    used: number;
    limit: number | null;
    resets_at: string | null;
  } | null;
  /** Every judged window, most constrained first (the database's order). */
  windows: AdminUsageWindow[];
  /** AI points spent this calendar month (users.admin_account_points). */
  month_points: number;
  /** The person's latest AI-points ledger row; null when never. */
  last_points_at: string | null;
}

/** One window of billing._points_usage_state, read verbatim. */
export interface AdminUsageWindow {
  period: string;
  used: number;
  /** null = no limit for this window. */
  limit: number | null;
  resets_at: string | null;
  state: AdminUsageState;
}

/** Organization membership shown inline on the global account roster. */
export interface AdminUserOrganizationMembership {
  id: string;
  name: string;
  abbreviation: string;
  slug: string;
  role: string;
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
  is_system: boolean;
  /** Set when the organization is archived (closed, not deleted). */
  archived_at: string | null;
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
  /**
   * This user's spend split by the WITNESSED trust axis
   * (chat.user_request.origin_class). One entry per origin class present in the
   * window, cost desc. Requests on the runtime spine with no chat.user_request
   * twin carry no witnessed origin and are reported as `unknown` rather than
   * guessed at — as are pre-provenance historic rows.
   */
  by_origin: AdminUserUsageOriginRow[];
}

export interface AdminUserUsageOriginRow {
  origin_class: string;
  requests: number;
  total_cost: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
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
  referrer_state: z
    .enum(["external", "internal", "local_test", "direct_or_withheld"])
    .nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  utm_content: z.string().nullable(),
  utm_term: z.string().nullable(),
  first_touch_captured_at: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  traffic_kind: z.enum(["browser", "bot", "local_test", "unknown"]),
  client_description: z.string(),
  last_sign_in_at: z.string().nullable(),
  /** The guest registry row aidream resolves this identity's browser through; null when none exists. */
  guest_access: GuestAccessSchema.nullable(),
  guest_fingerprint_hint: z.string().nullable(),
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
  source_warnings: z.array(z.string()),
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
