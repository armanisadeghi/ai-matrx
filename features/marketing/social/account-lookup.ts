/**
 * Account lookup for the social account input: a free read of the profile store first, then (only
 * when the person asks by leaving the field) the profile ingest, which is a hard cost in points.
 */

import { supabase } from "@/utils/supabase/client";

import type { FoundAccount } from "./account-input";
import type { OkAccount } from "./account-input";
import { isRawChannelId } from "./mappers";
import { ingestProfile } from "./server";
import { readProfile } from "./service";
import { isSocialPlatform, type SocialPlatform, type SocialProfileRow } from "./types";

export function foundFromRow(row: SocialProfileRow, source: FoundAccount["source"]): FoundAccount | null {
  if (!isSocialPlatform(row.platform)) return null;
  const handle = (row.handle ?? "").replace(/^@/, "");
  return {
    profileId: row.id,
    platform: row.platform as SocialPlatform,
    handle,
    displayName: (row.display_name ?? "").trim() || (isRawChannelId(handle) ? "YouTube channel" : handle),
    avatarUrl: row.avatar_url ?? null,
    hasStoredAvatar: Boolean(row.avatar_file_id),
    followers: row.follower_count ?? null,
    source,
  };
}

/** The profile already in our store for this account, or null. Free. */
export async function findCachedAccount(account: Pick<OkAccount, "platform" | "handle">): Promise<FoundAccount | null> {
  const handle = account.handle.replace(/^r\//, "");
  // `_` is a wildcard in ilike: take candidates, then keep only the exact handle.
  const { data, error } = await supabase
    .schema("social")
    .from("social_profile")
    .select("*")
    .eq("platform", account.platform)
    .or(`handle.ilike.${handle},handle.ilike.@${handle}`)
    .is("deleted_at", null)
    .limit(10);
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as SocialProfileRow[]).find(
    (r) => (r.handle ?? "").replace(/^@/, "").toLowerCase() === handle.toLowerCase(),
  );
  return row ? foundFromRow(row, "cache") : null;
}

/** Fetch the account from its platform (costs points) and read back the stored profile. */
export async function fetchAccount(args: {
  account: Pick<OkAccount, "platform" | "handle" | "url">;
  organizationId: string;
  signal?: AbortSignal;
}): Promise<FoundAccount> {
  const result = await ingestProfile(
    { handleOrUrl: args.account.url, platform: args.account.platform, pages: 1 },
    { organizationId: args.organizationId, signal: args.signal },
  );
  const row = await readProfile(result.profile_id);
  const found = row ? foundFromRow(row, "fetched") : null;
  if (!found) throw new Error("The account was fetched but could not be read back.");
  return found;
}
