/**
 * Display-only memory of the last validated account on this device.
 *
 * This is intentionally separate from authenticated Redux persistence: auth
 * identity isolation must reject an old user's state after sign-out, while the
 * login surface may still say "Welcome back". Never store an id, email, token,
 * role, or anything that could be mistaken for authority here.
 */

import type { UserMetadata } from "@/utils/userDataMapper";

export const REMEMBERED_ACCOUNT_KEY = "matrx:remembered-account";

export interface RememberedAccount {
  displayName: string;
  avatarUrl: string | null;
  rememberedAt: string;
}

export function parseRememberedAccount(
  raw: string | null,
): RememberedAccount | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.displayName !== "string" || !record.displayName.trim()) {
      return null;
    }
    return {
      displayName: record.displayName.trim(),
      avatarUrl:
        typeof record.avatarUrl === "string" && record.avatarUrl
          ? record.avatarUrl
          : null,
      rememberedAt:
        typeof record.rememberedAt === "string" ? record.rememberedAt : "",
    };
  } catch {
    return null;
  }
}

export function rememberValidatedAccount(
  storage: Pick<Storage, "setItem">,
  metadata: UserMetadata,
): void {
  const displayName =
    metadata.fullName?.trim() ||
    metadata.name?.trim() ||
    metadata.preferredUsername?.trim();
  if (!displayName) return;
  const remembered: RememberedAccount = {
    displayName,
    avatarUrl: metadata.avatarUrl || metadata.picture || null,
    rememberedAt: new Date().toISOString(),
  };
  storage.setItem(REMEMBERED_ACCOUNT_KEY, JSON.stringify(remembered));
}
