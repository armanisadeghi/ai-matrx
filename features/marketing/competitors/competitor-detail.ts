/**
 * The competitor detail, as plain data: what the detail panel renders for one brand-level
 * competitor row. Pure (`competitor-detail.test.ts`) — the panel never formats, and never shows
 * a key or a JSON dump.
 */

import { formatSocialHandle } from "@/features/marketing/lib/social-handle";
import type { BrandCompetitor } from "./brand-competitors";
import type { FoundSocialLink } from "./social-links";

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
  reddit: "Reddit",
  snapchat: "Snapchat",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

export function compactCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export interface DetailAccount {
  trackedAccountId: string;
  platformLabel: string;
  handle: string;
  followers: string;
  posts: string;
  /** Route to the account's page, or null while it cannot be built. */
  href: string;
  outlier: string | null;
}

export interface DetailOutlier {
  platformLabel: string;
  handle: string;
  multiple: string;
  views: string | null;
  postUrl: string | null;
  href: string;
}

export interface CompetitorDetailModel {
  name: string;
  website: { label: string; href: string } | null;
  accounts: DetailAccount[];
  /** Best outliers first, one per account that has one. */
  outliers: DetailOutlier[];
  canFindSocials: boolean;
}

export function competitorDetailModel(row: BrandCompetitor, brandSeg: string): CompetitorDetailModel {
  const route = (platform: string, id: string) => `/marketing/${brandSeg}/socials/${platform}/${id}`;
  const accounts = row.accounts.map((a): DetailAccount => ({
    trackedAccountId: a.trackedAccountId,
    platformLabel: platformLabel(a.platform),
    handle: formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl }),
    followers: compactCount(a.followers),
    posts: a.postsTracked.toLocaleString("en"),
    href: route(a.platform, a.profileId),
    outlier: a.topOutlier ? `${a.topOutlier.score.toFixed(1)}×` : null,
  }));
  const outliers = row.accounts
    .filter((a) => a.topOutlier)
    .sort((a, b) => (b.topOutlier?.score ?? 0) - (a.topOutlier?.score ?? 0))
    .map((a): DetailOutlier => ({
      platformLabel: platformLabel(a.platform),
      handle: formatSocialHandle({ platform: a.platform, handle: a.handle, url: a.profileUrl }),
      multiple: `${(a.topOutlier?.score ?? 0).toFixed(1)}×`,
      views: a.topOutlier?.views != null ? compactCount(a.topOutlier.views) : null,
      postUrl: a.topOutlier?.postUrl ?? null,
      href: route(a.platform, a.profileId),
    }));
  return {
    name: row.name,
    website: row.domain ? { label: row.domain, href: `https://${row.domain}` } : null,
    accounts,
    outliers,
    canFindSocials: Boolean(row.domain),
  };
}

/** Found links that are not already tracked on this competitor (one account per platform). */
export function untrackedLinks(row: BrandCompetitor, links: readonly FoundSocialLink[]): FoundSocialLink[] {
  const have = new Set(row.accounts.map((a) => a.platform));
  return links.filter((l) => !have.has(l.platform));
}

/** Rows a bulk "Find socials for all" reads: a website and no social account yet. */
export function rowsToSearch(rows: readonly BrandCompetitor[], searched: ReadonlySet<string>): BrandCompetitor[] {
  return rows.filter((r) => r.domain && r.accounts.length === 0 && !r.progress && !searched.has(r.key));
}
