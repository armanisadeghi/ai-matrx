import type { AccountRow } from "./types";

/**
 * The route of a tracked account's page, or null when it has no stored profile yet.
 * Every place an account (or a post's creator) is drawn links through this one function.
 */
export function accountHref(
  brandSeg: string,
  row: { platform: string; profileId: string | null | undefined },
): string | null {
  return row.profileId ? `/marketing/${brandSeg}/socials/${row.platform}/${row.profileId}` : null;
}

export type { AccountRow };
