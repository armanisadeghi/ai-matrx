/**
 * A brand's social accounts as Board profile tiles. Pure.
 *
 * The Studio's starter and the Add menu's "From this brand's accounts" both turn account rows into
 * `social-profile` tiles through THIS module, so they cannot disagree about which accounts come first, what a
 * tile is called, or what an account that is not stored yet needs.
 */

import type { AccountRow } from "./types";

/** Roles that are the brand's own accounts (they come first and start checked). */
const OWN_ROLES: ReadonlySet<string> = new Set(["own", "client"]);

export interface AccountTileSeed {
  rowId: string;
  title: string;
  platform: string;
  /** The stored profile; null when the account has not been read yet (the tile reads it when it opens). */
  profileId: string | null;
  /** What the tile reads when it has no profile id yet. */
  handleOrUrl: string;
  own: boolean;
}

export const isOwnAccount = (row: Pick<AccountRow, "role">): boolean => OWN_ROLES.has(row.role);

/** One tile seed per account; the brand's own accounts first, then by followers, then name. */
export function accountTileSeeds(rows: readonly AccountRow[]): AccountTileSeed[] {
  const seen = new Set<string>();
  const seeds: { seed: AccountTileSeed; followers: number }[] = [];
  for (const r of rows) {
    const key = r.profileId ?? `${r.platform}:${r.handle.toLowerCase()}`;
    if (seen.has(key) || !r.handle.trim()) continue;
    seen.add(key);
    seeds.push({
      followers: r.followers ?? 0,
      seed: {
        rowId: r.rowId,
        title: `@${r.handle.replace(/^@/, "")}`,
        platform: r.platform,
        profileId: r.profileId,
        handleOrUrl: r.profileUrl?.trim() || r.handle,
        own: isOwnAccount(r),
      },
    });
  }
  return seeds
    .sort((a, b) => Number(b.seed.own) - Number(a.seed.own) || b.followers - a.followers || a.seed.title.localeCompare(b.seed.title))
    .map((x) => x.seed);
}

/** The accounts the Studio starter puts on a fresh board: the brand's own accounts that are already stored (opening costs nothing). */
export function starterAccountSeeds(rows: readonly AccountRow[], max = 4): AccountTileSeed[] {
  return accountTileSeeds(rows)
    .filter((s) => s.own && s.profileId !== null)
    .slice(0, max);
}
