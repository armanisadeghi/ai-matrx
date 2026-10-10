"use client";

/**
 * The page for a social account no one has tracked yet — `/socials/<platform>/<propertyId>`.
 * It names the account, says it is not tracked, and offers Track; once tracked it moves to the
 * account's real page. A property id that is not one of this brand's accounts is "not found".
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, ExternalLink, Loader2, Plus } from "lucide-react";

import { Badge, Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { accountLabels } from "../mappers";
import { useBrandSocialAccounts } from "../hooks";
import { accountHref } from "../account-href";
import { PlatformMark, platformLabel } from "./PlatformMark";
import { trackableOwn, useTrackOwn } from "./useTrackOwn";

export function UntrackedAccount({ platform, propertyId }: { platform: string; propertyId: string }) {
  const brand = useMarketingBrand();
  const router = useRouter();
  const accounts = useBrandSocialAccounts(brand.id);
  const { busyRow, progress, trackOwn, costText } = useTrackOwn(brand.organizationId, brand.id);
  const row = (accounts.data ?? []).find((r) => r.propertyId === propertyId) ?? null;
  const profileHref = row ? accountHref(brand.seg, row) : null;

  // Tracked from here (or elsewhere): the account has a profile now, so open it.
  useEffect(() => {
    if (profileHref) router.replace(profileHref);
  }, [profileHref, router]);

  if (accounts.isLoading || profileHref) return <RegionSkeleton shape="cards" count={1} />;
  if (accounts.isError || !row) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="text-sm text-foreground">{accounts.isError ? "Couldn't load this account" : "Account not found"}</p>
        <Button variant="outline" asChild>
          <Link href={marketingRoutes.brandSocials(brand.seg)}>Back to Socials</Link>
        </Button>
      </div>
    );
  }

  const labels = accountLabels(row.displayName, row.handle, row.platform);
  const handle = formatSocialHandle({ platform: row.platform, handle: row.handle, url: row.profileUrl });
  const busy = busyRow === row.rowId;
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-2 p-3" data-testid="untracked-account">
      <Button variant="quiet" icon={<ArrowLeft />} aria-label="Back" onClick={() => router.back()} />
      <PlatformMark platform={row.platform} size={28} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-foreground">{labels.primary}</span>
        <span className="truncate text-xs text-muted-foreground">
          {progress ?? [platformLabel(platform), labels.secondary ? handle : null].filter(Boolean).join(" · ")}
        </span>
      </div>
      <Badge tone="warning">Not tracked</Badge>
      <span className="ml-auto flex items-center gap-1">
        {trackableOwn(row) ? (
          <Button
            variant="outline"
            icon={busy ? <Loader2 className="animate-spin" /> : <Plus />}
            disabled={busyRow !== null}
            title={["Track as Own", costText("track", 1)].filter(Boolean).join(" · ")}
            onClick={() => void trackOwn(row)}
          >
            {busy ? "Tracking…" : "Track"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {row.trackable === false ? `${platformLabel(row.platform)} tracking is coming` : "Needs a handle"}
          </span>
        )}
        {row.externalUrl ? (
          <Button variant="quiet" asChild icon={<ExternalLink />}>
            <a href={row.externalUrl} target="_blank" rel="noreferrer">
              Open on {platformLabel(row.platform)}
            </a>
          </Button>
        ) : null}
      </span>
    </div>
  );
}
