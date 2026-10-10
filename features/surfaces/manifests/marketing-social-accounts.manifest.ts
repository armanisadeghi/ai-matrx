/**
 * Surface manifest — Social accounts (`matrx-user/marketing-social-accounts`).
 *
 * The brand's Socials > Accounts list: its own accounts and the competitor / inspiration / client
 * accounts it tracks, one row per account. Emitted by `AccountsTab` from the rows it already
 * rendered (never a fetch). One account's page is `matrx-user/social-profile`.
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@ai-matrx/chat/surfaces/types";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";

export const SOCIAL_ACCOUNTS_SURFACE_NAME = "matrx-user/marketing-social-accounts";

const groups: SurfaceValueGroup[] = [
  { key: "brand", label: "Brand", sortOrder: 100 },
  { key: "accounts", label: "Accounts", sortOrder: 200 },
];

const v = (
  name: string,
  label: string,
  description: string,
  valueType: SurfaceValue["valueType"],
  typicalCharCount: number,
  group: string,
  sortOrder: number,
  extra: Partial<SurfaceValue> = {},
): SurfaceValue => ({ name, label, description, valueType, alwaysAvailable: false, typicalCharCount, group, sortOrder, ...extra });

const surfaceSpecific: SurfaceValue[] = [
  v("accounts_loaded", "Accounts loaded", "True once the brand's account rows are read. While false the other account values are absent; load_error says why.", "boolean", 5, "accounts", 200, { alwaysAvailable: true }),
  v("load_error", "Load error", "Why the accounts could not be read. Absent on a clean read.", "string", 120, "accounts", 205),
  v("brand_id", "Brand id", "The brand whose accounts these are.", "string", 36, "brand", 100),
  v("brand_name", "Brand name", "The brand's name.", "string", 40, "brand", 110),
  v("brand_kind", "Brand kind", "company or person: whose accounts these are.", "string", 8, "brand", 120),
  v("account_count", "Accounts", "How many accounts the table lists.", "number", 3, "accounts", 210),
  v("accounts_by_role", "Accounts by role", "Counts per role: { own, competitor, inspiration, client } (a role with none is 0).", "object", 80, "accounts", 220),
  v("untracked_own_count", "Own accounts not tracked yet", "How many of the brand's own accounts are not tracked, so show no numbers.", "number", 3, "accounts", 230),
  v("account_list", "Account list", "The condensed list as one XML bundle: id, platform, handle, name, role, status, followers, 30-day growth, posts tracked, best multiple, whether the account has a page.", "string", 4000, "accounts", 240),
  v("accounts", "Accounts (full rows)", "Every row as { row_id, profile_id, platform, handle, display_name, role, status, followers, growth, posts_tracked, best_multiple, last_post_at, last_refreshed_at, has_page }.", "array", 6000, "accounts", 250, { autoContext: false }),
];

export const marketingSocialAccountsManifest: SurfaceManifest = {
  surfaceName: SOCIAL_ACCOUNTS_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  label: "Social accounts",
  description: "The brand's own and tracked social accounts, one row per account.",
  urlPattern: "/marketing/[brandId]/socials/accounts",
  briefValues: ["accounts_loaded", "brand_name", "account_count", "accounts_by_role"],
  readiness: "partial",
  readinessNote:
    "Read values only. No write targets yet: Track and Refresh spend plan credits and need an approval card; role change and Stop tracking have no agent twin.",
  intro: `<surface_intro>
You are on the brand's Social accounts list: its own accounts and the competitor, inspiration and client accounts it tracks. Check accounts_loaded first.
account_list is the condensed rows (read it first); accounts holds every row. A row with has_page true opens an account page at /marketing/<brand>/socials/<platform>/<profile_id>; has_page false means the account is not tracked yet, so no numbers exist. Followers or growth null mean not measured, never zero.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

export interface SocialAccountsScopeValues {
  accounts_loaded: boolean;
  load_error?: string;
  brand_id?: string;
  brand_name?: string;
  brand_kind?: string;
  account_count?: number;
  accounts_by_role?: Record<string, number>;
  untracked_own_count?: number;
  account_list?: string;
  accounts?: Array<Record<string, unknown>>;
}

export const createSocialAccountsScope = (values: SocialAccountsScopeValues): SurfaceScopePayload =>
  values as unknown as SurfaceScopePayload;
