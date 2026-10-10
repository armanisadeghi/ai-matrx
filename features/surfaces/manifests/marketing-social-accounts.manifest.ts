/**
 * Surface manifest — Social accounts (`matrx-user/marketing-social-accounts`).
 *
 * The brand's Socials > Accounts list: its own accounts and the competitor / inspiration / client
 * accounts it tracks, one row per account. Emitted by `AccountsTab` from the rows it already
 * rendered (never a fetch). One account's page is `matrx-user/social-profile`.
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup, SurfaceWriteTarget } from "@ai-matrx/chat/surfaces/types";
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

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "create_accounts",
    label: "Track accounts",
    description:
      'Tracks social accounts for this brand, exactly as the Track dialog does: each account\'s profile and latest posts are fetched (this SPENDS POINTS per account; when the cost is worth a warning the page names the points and asks again). Value is a JSON ARRAY of 1-10 objects { "handle_or_url": "<profile link, or a handle>", "platform"?: "instagram" | "tiktok" | "youtube" | "x" | "linkedin" | "facebook" | "threads" | "reddit" | ... (required with a bare handle), "role"?: "own" | "competitor" | "inspiration" | "client" (default competitor) }. A link to a single post is refused (save posts in the Swipe file). An account already tracked comes back "already tracked".',
    valueType: "array",
    updatesValue: "accounts",
    mode: "entity",
    applyPolicy: "ask",
    group: "accounts",
    sortOrder: 300,
  },
  {
    name: "update_accounts",
    label: "Update accounts",
    description:
      'Changes accounts on this page, exactly as the row buttons do. Value is a JSON ARRAY of 1-10 objects { "row_id": "<from accounts>", "role"?: "own" | "competitor" | "inspiration" | "client", "tracked"?: true | false, "refresh"?: true }. tracked false = Stop tracking (archives it for the organization; saved posts and history stay). tracked true = Track as Own, only for an untracked own account (spends points). refresh fetches new numbers (spends points). An unknown row_id refuses the whole list.',
    valueType: "array",
    updatesValue: "accounts",
    mode: "entity",
    applyPolicy: "ask",
    group: "accounts",
    sortOrder: 310,
  },
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
    "Values plus create_accounts (the Track dialog's handle-or-link save) and update_accounts (Track as Own, Stop tracking, role, Refresh). Every person action has an agent twin except opening an account's X connection.",
  intro: `<surface_intro>
You are on the brand's Social accounts list: its own accounts and the competitor, inspiration and client accounts it tracks. Check accounts_loaded first.
account_list is the condensed rows (read it first); accounts holds every row. A row with has_page true opens an account page at /marketing/<brand>/socials/<platform>/<profile_id>; has_page false means the account is not tracked yet, so no numbers exist. Followers or growth null mean not measured, never zero.
create_accounts tracks accounts from a handle or profile link (spends points; say so first). update_accounts changes a tracked account's role, stops tracking it, tracks an untracked own account, or refreshes its numbers (refresh spends points). The person approves each on a card.
</surface_intro>`,
  groups,
  writeTargets,
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
