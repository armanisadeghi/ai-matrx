import { createClient } from "@/utils/supabase/client";
import { listMicrosoftConnections } from "@/features/microsoft-integration/service";
import { listStorageConnections } from "@/features/storage-connections/service";
import type { StorageBrowseProvider } from "@/features/files/storage-sources/types";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
export interface StoragePickerAccount {
  id: string;
  provider: StorageBrowseProvider;
  label: string;
  email: string | null;
}

function normalizedScopes(scopes: readonly string[]): string[] {
  return scopes.map((scope) =>
    scope.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase(),
  );
}

/**
 * Fail-closed picker inventory. Both provider inventories must succeed in the
 * same verified browser session; an unavailable source never becomes an empty list.
 */
export async function loadStoragePickerAccounts(
  signal?: AbortSignal,
): Promise<StoragePickerAccount[]> {
  const supabase = createClient();
  // The token string still comes from `getSession()`; the IDENTITY comes from
  // that token's locally verified claims.
  const [{ data: sessionData }, { data: claims }] = await Promise.all([
    supabase.auth.getSession(),
    getClaimsUser(supabase),
  ]);
  if (!sessionData.session?.access_token || !claims.user?.id) {
    throw new Error("Sign in again to load your file connections.");
  }

  const [microsoft, storage] = await Promise.all([
    listMicrosoftConnections(signal),
    listStorageConnections(signal),
  ]);

  const oneDrive: StoragePickerAccount[] = microsoft
    .filter((connection) => connection.status === "connected")
    .filter((connection) =>
      normalizedScopes(connection.scopes).includes("files.read"),
    )
    .map((connection) => ({
      id: connection.id,
      provider: "onedrive",
      label:
        connection.accountName ?? connection.accountEmail ?? "Microsoft account",
      email: connection.accountEmail,
    }));
  const oauthStorage: StoragePickerAccount[] = storage
    .filter((connection) => connection.status.status === "connected")
    .map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      label:
        connection.accountName ??
        connection.accountEmail ??
        (connection.provider === "box" ? "Box account" : "Dropbox account"),
      email: connection.accountEmail,
    }));
  return [...oneDrive, ...oauthStorage];
}
