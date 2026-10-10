/**
 * Surface manifest — Social roll-up (`matrx-user/marketing-social-rollup`).
 *
 * The agency-plane Social page: every tracked social account the person can read across brands and
 * organizations, and the recent outliers among them. Emitted by `SocialReportsSection` from the
 * rows it already rendered (never a fetch). A brand's own accounts are
 * `matrx-user/marketing-social-accounts`; one account's page is `matrx-user/social-profile`.
 *
 * Read-only on purpose: the roll-up creates, changes and archives nothing (tracking happens on a
 * brand's Socials, where a plan credit is spent behind an approval card).
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@ai-matrx/chat/surfaces/types";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";

export const SOCIAL_ROLLUP_SURFACE_NAME = "matrx-user/marketing-social-rollup";

const groups: SurfaceValueGroup[] = [
  { key: "view", label: "View", sortOrder: 100 },
  { key: "accounts", label: "Tracked accounts", sortOrder: 200 },
  { key: "outliers", label: "Recent outliers", sortOrder: 300 },
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
  v("rollup_loaded", "Roll-up loaded", "True once the cross-brand rows are read. While false the other values are absent; load_error says why.", "boolean", 5, "view", 100, { alwaysAvailable: true }),
  v("load_error", "Load error", "Why the roll-up could not be read. Absent on a clean read.", "string", 120, "view", 105),
  v("view", "Open view", "accounts (Tracked accounts) or outliers (Recent outliers): which table the person has open.", "string", 10, "view", 110, { alwaysAvailable: true }),
  v("account_count", "Tracked accounts", "How many tracked accounts the roll-up lists, across every brand the person can read.", "number", 4, "accounts", 200),
  v("brand_count", "Brands with accounts", "How many distinct brands own at least one listed account (organization-wide accounts are not a brand).", "number", 3, "accounts", 210),
  v("accounts_by_role", "Accounts by role", "Counts per role: { own, competitor, inspiration, client } (a role with none is 0).", "object", 80, "accounts", 220),
  v("account_list", "Account list", "The accounts, largest audience first, as one XML bundle: brand, platform, handle, role, followers, whether the account opens a page of ours.", "string", 3000, "accounts", 230),
  v("accounts", "Accounts (full rows)", "Every account as { tracked_account_id, brand_id, brand_name, profile_id, platform, handle, role, followers, last_refreshed_at }.", "array", 6000, "accounts", 240, { autoContext: false }),
  v("outlier_count", "Recent outliers", "How many posts the Recent outliers table lists (last 30 days).", "number", 4, "outliers", 300),
  v("outlier_list", "Outlier list", "The outlier posts, strongest first, as one XML bundle: brand, platform, handle, multiple, views, posted.", "string", 2500, "outliers", 310),
];

export const marketingSocialRollupManifest: SurfaceManifest = {
  surfaceName: SOCIAL_ROLLUP_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  label: "Social roll-up",
  description: "Every tracked social account and recent outlier across the person's brands.",
  urlPattern: "/marketing/social",
  briefValues: ["rollup_loaded", "view", "account_count", "outlier_count"],
  readiness: "partial",
  readinessNote:
    "Read values only, by design: the roll-up creates and changes nothing. Not yet proven with an outside-helper binding test.",
  intro: `<surface_intro>
You are on the agency Social roll-up: every tracked account across the person's brands, and the recent outliers among them. Check rollup_loaded first; when false, load_error says why.
account_list is the condensed rows (read it first); accounts holds every row. Followers null means not measured, never zero. To track or change an account, send the person to that brand's Socials; this page changes nothing.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

export interface SocialRollupScopeValues {
  rollup_loaded: boolean;
  load_error?: string;
  view: string;
  account_count?: number;
  brand_count?: number;
  accounts_by_role?: Record<string, number>;
  account_list?: string;
  accounts?: Array<Record<string, unknown>>;
  outlier_count?: number;
  outlier_list?: string;
}

export const createSocialRollupScope = (values: SocialRollupScopeValues): SurfaceScopePayload =>
  values as unknown as SurfaceScopePayload;
