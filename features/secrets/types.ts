import type { components } from "@/types/python-generated/api-types";

/**
 * User-secrets vault — public wire shapes.
 *
 * Source of truth: `aidream/aidream/api/schemas/user_secrets.py` +
 * `users.user_secrets` table. These mirror the aidream Pydantic shapes
 * one-for-one; if they drift, fix it here AND in Python.
 *
 * Plaintext `value` is NEVER on a `UserSecretSummary` — that field is
 * write-only (request) for safety: the listing endpoint deliberately
 * doesn't return decrypted values to the browser. The agent / sandbox
 * paths fetch decrypted env via `/user-secrets/sandbox-env` server-side.
 */

export type SecretCategory =
  | "github"
  | "openai"
  | "anthropic"
  | "google"
  | "aws"
  | "stripe"
  | "supabase"
  | "vercel"
  | "linear"
  | "notion"
  | "slack"
  | "custom";

/** Listing row — safe to render in the UI. */
export interface UserSecretSummary {
  id: string;
  key: string;
  value_hint: string;
  description: string | null;
  category: SecretCategory | null;
  is_active: boolean;
  inject_into_sandbox: boolean;
  value_version: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSecretListResponse {
  secrets: UserSecretSummary[];
}

export interface UserSecretCreateRequest {
  key: string;
  value: string;
  description?: string | null;
  category?: SecretCategory | null;
  inject_into_sandbox?: boolean;
  upsert?: boolean;
}

export interface UserSecretUpdateRequest {
  value?: string;
  description?: string | null;
  category?: SecretCategory | null;
  is_active?: boolean;
  inject_into_sandbox?: boolean;
}

export interface UserSecretBulkEnvRequest {
  env_text: string;
  default_category?: SecretCategory | null;
  inject_into_sandbox?: boolean;
}

export interface UserSecretBulkEnvResponse {
  upserted: UserSecretSummary[];
  count: number;
}

export const CATEGORY_LABELS: Record<SecretCategory, string> = {
  github: "GitHub",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  aws: "AWS",
  stripe: "Stripe",
  supabase: "Supabase",
  vercel: "Vercel",
  linear: "Linear",
  notion: "Notion",
  slack: "Slack",
  custom: "Custom",
};

export const ALL_CATEGORIES: SecretCategory[] = Object.keys(
  CATEGORY_LABELS,
) as SecretCategory[];

/** Mirrors the DB CHECK constraint on user_secrets.key. */
export const VALID_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ApiSchemas = components["schemas"];

/** Organization vault contracts are generated from aidream's OpenAPI schema. */
export type OrganizationSecretSummary = ApiSchemas["OrganizationSecretSummary"];
export type OrganizationSecretCreateRequest = ApiSchemas["OrganizationSecretCreateRequest"];
export type OrganizationSecretUpdateRequest = ApiSchemas["OrganizationSecretUpdateRequest"];
export type OrganizationSecretContributeRequest =
  ApiSchemas["OrganizationSecretContributeRequest"];
export type OrganizationSecretPermissionsRequest =
  ApiSchemas["OrganizationSecretPermissionsRequest"];

export type SecretAccessMode = OrganizationSecretSummary["access_mode"];
export type SecretSyncStatus = OrganizationSecretSummary["sync_status"];
