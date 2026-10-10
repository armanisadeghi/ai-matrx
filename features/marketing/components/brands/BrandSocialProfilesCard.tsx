"use client";

/**
 * Brand Overview -> "Social profiles". ONE list: `social.brand_social_accounts` (the same rows
 * Socials -> Accounts renders), so the two screens can never disagree. Each row: avatar with its
 * platform mark, name + handle, owner chip for a person's account, tracked state, followers (+30d),
 * posts, last post, best multiple, and the actions (Track / Open, external link, edit, delete).
 * Track runs the Socials track flow (cost named first, live step line on the row).
 */

import Link from "next/link";
import { ExternalLink, Globe, Loader2, Pencil, Trash2, UserPlus } from "lucide-react";

import { Badge, Button } from "@ai-matrx/design-system/controls";
import { PropertyKindMark } from "@/features/marketing/components/shared/PropertyKindMark";
import { PersonOwnerChip } from "@/features/marketing/components/brands/PersonOwnerChip";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { useBrandSocialAccounts, useInvalidateSocial } from "@/features/marketing/social/hooks";
import { useRefusedRead } from "@/features/marketing/social/gated/RefusedReadOffer";
import { GUIDED_CAPTURE_PLATFORMS } from "@/features/marketing/social/gated/guidedJob";
import { brandAccountHref } from "@/features/marketing/social/property-account-href";
import { accountLabels, formatGrowth, lastPostLabel, showOwnerChip } from "@/features/marketing/social/mappers";
import { formatCompact, outlierBadgeModel } from "@/features/marketing/social/outlier";
import { profileAvatarDoor } from "@/features/marketing/social/server";
import type { AccountRow } from "@/features/marketing/social/types";
import { OutlierBadge } from "@/features/marketing/social/components/OutlierBadge";
import { PlatformMark, platformLabel } from "@/features/marketing/social/components/PlatformMark";
import { SocialImage } from "@/features/marketing/social/components/SocialImage";
import { trackableOwn, useTrackOwn } from "@/features/marketing/social/components/useTrackOwn";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { BrandProperty } from "@/features/marketing/types";

function joinTitle(label: string, cost: string | null): string {
  return cost ? `${label} · ${cost}` : label;
}

const ICON_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

export function BrandSocialProfilesCard({
  brandId,
  brandSeg,
  organizationId,
  properties,
  canEdit,
  copy,
  onAdd,
  onEdit,
  onDelete,
}: {
  brandId: string;
  brandSeg: string;
  organizationId: string;
  /** The brand's non-website properties: edit / delete act on these by id. */
  properties: readonly BrandProperty[];
  /** The viewer's editor-level access to the brand: write and tracking controls show only then. */
  canEdit: boolean;
  copy?: React.ComponentProps<typeof SectionCard>["copy"];
  onAdd: () => void;
  onEdit: (property: BrandProperty) => void;
  onDelete: (property: BrandProperty) => void;
}) {
  const accounts = useBrandSocialAccounts(brandId);
  const { busyRow, progress, trackOwn, trackAllOwn, costText } = useTrackOwn(organizationId, brandId);
  const rows = accounts.data ?? [];
  const untracked = rows.filter(trackableOwn);
  const byId = new Map(properties.map((p) => [p.id, p]));
  // Properties the social read does not carry (a business listing, "other"): listed, never tracked.
  const listed = new Set(rows.map((r) => r.propertyId).filter(Boolean));
  const extras = properties.filter((p) => !listed.has(p.id));

  return (
    <SectionCard
      title="Social profiles"
      copy={copy}
      className="lg:col-span-2"
      action={canEdit ? { label: "Add property", onClick: onAdd } : undefined}
      headerExtra={
        <>
          {canEdit && untracked.length > 1 ? (
            <Button
              variant="outline"
              icon={<UserPlus />}
              disabled={busyRow !== null}
              title={joinTitle("Track every profile not tracked yet", costText("track", untracked.length))}
              onClick={() => void trackAllOwn(untracked)}
            >
              {busyRow === "bulk" ? "Tracking…" : `Track all (${untracked.length})`}
            </Button>
          ) : null}
          <Button variant="quiet" asChild>
            <Link href={marketingRoutes.brandSocials(brandSeg)}>Open Socials</Link>
          </Button>
        </>
      }
    >
      {accounts.isLoading ? (
        <div className="divide-y divide-border" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-[52px] items-center gap-3 px-3">
              <span className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <span className="h-3 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : accounts.isError ? (
        <div className="flex items-center gap-3 p-4 text-xs text-muted-foreground">
          Couldn&apos;t load the social profiles.
          <Button variant="outline" onClick={() => void accounts.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 && extras.length === 0 ? (
        <p className="px-4 py-2.5 text-xs text-muted-foreground">No social profiles yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const property = row.propertyId ? byId.get(row.propertyId) : undefined;
            return (
              <SocialRow
                key={row.rowId}
                row={row}
                brandSeg={brandSeg}
                brandId={brandId}
                organizationId={organizationId}
                busy={busyRow === row.rowId}
                anyBusy={busyRow !== null}
                progress={busyRow === row.rowId ? progress : null}
                trackTitle={joinTitle("Track as Own", costText("track", 1))}
                onTrack={() => void trackOwn(row)}
                canEdit={canEdit}
                onEdit={canEdit && property ? () => onEdit(property) : undefined}
                onDelete={canEdit && property ? () => onDelete(property) : undefined}
              />
            );
          })}
          {extras.map((p) => (
            <ExtraRow
              key={p.id}
              property={p}
              onEdit={canEdit ? () => onEdit(p) : undefined}
              onDelete={canEdit ? () => onDelete(p) : undefined}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Stat({ label, children, className }: { label: string; children: React.ReactNode; className: string }) {
  return (
    <span className={`flex flex-col leading-tight ${className}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums text-foreground">{children}</span>
    </span>
  );
}

function SocialRow({
  row,
  brandSeg,
  brandId,
  organizationId,
  busy,
  anyBusy,
  progress,
  trackTitle,
  onTrack,
  canEdit,
  onEdit,
  onDelete,
}: {
  row: AccountRow;
  brandSeg: string;
  brandId: string;
  organizationId: string;
  busy: boolean;
  anyBusy: boolean;
  progress: string | null;
  trackTitle: string;
  onTrack: () => void;
  canEdit: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const brandKind = useMarketingBrand().kind;
  const tracked = Boolean(row.trackedAccountId);
  const handle = formatSocialHandle({ platform: row.platform, handle: row.handle, url: row.profileUrl });
  const href = brandAccountHref(brandSeg, row);
  const canTrack = trackableOwn(row);
  // Numbers read when the account was added still show: the same numbers Socials -> Accounts shows for this row.
  const hasReadings = row.followers !== null || row.postsTracked > 0;
  const best = {
    score: row.bestScore,
    baselineViews: null,
    percentile: null,
    baselineWindow: null,
    ageHours: null,
    accountPosts: row.postsTracked,
  };

  const invalidate = useInvalidateSocial();
  const { open: openCapture, node: captureNode } = useRefusedRead(organizationId, () => void invalidate());
  // Never read (no profile, or tracked with nothing in it): the person's own browser can still get it.
  const unreadable = GUIDED_CAPTURE_PLATFORMS.has(row.platform) && (!row.profileId || (tracked && row.postsTracked === 0));

  const labels = accountLabels(row.displayName, row.handle, row.platform);
  const name = (
    <span className="truncate text-sm font-medium text-foreground">{labels.primary}</span>
  );
  const avatarNode = (
    row.profileId && row.avatarHint ? (
        <span className="relative h-8 w-8 shrink-0">
          <span className="relative block h-8 w-8 overflow-hidden rounded-full bg-muted">
            <SocialImage
              door={row.avatarFileId ? profileAvatarDoor(row.profileId) : null}
              url={row.avatarHint}
              fallback={<PropertyKindMark kind={row.platform} size={32} />}
            />
          </span>
          <span className="absolute -bottom-1 -right-1">
            <PlatformMark platform={row.platform} size={16} />
          </span>
        </span>
      ) : (
        <PlatformMark platform={row.platform} size={32} />
      )
  );

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      {href ? (
        <Link href={href} aria-label={`Open ${labels.primary}`} className="shrink-0">
          {avatarNode}
        </Link>
      ) : (
        avatarNode
      )}

      <div className="flex min-w-[200px] flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          {href ? (
            <Link href={href} className="min-w-0 truncate hover:underline">
              {name}
            </Link>
          ) : (
            <span className="min-w-0 truncate">{name}</span>
          )}
          {showOwnerChip(row, brandKind) ? (
            <PersonOwnerChip propertyId={row.propertyId} ownerName={row.ownerName ?? null} organizationId={organizationId} brandId={brandId} />
          ) : null}
          {tracked ? (
            <span className="shrink-0"><Badge tone="success">Tracked</Badge></span>
          ) : !canEdit ? null : (
            <span className="shrink-0" title={hasReadings ? "Read once when the brand was set up. Track it to keep these numbers current." : undefined}>
              <Badge tone="warning">Not tracked</Badge>
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {progress ?? [platformLabel(row.platform), labels.secondary ? handle : null].filter(Boolean).join(" · ")}
        </span>
      </div>

      {tracked || hasReadings ? (
        <span className="flex shrink-0 items-start gap-4">
          <Stat label="Followers" className="w-[88px]">
            {formatCompact(row.followers)}
            {row.growth === null ? null : (
              <span className="ml-1.5 text-muted-foreground" title={row.growthNote}>
                {formatGrowth(row.growth)}
              </span>
            )}
          </Stat>
          <Stat label="Posts" className="w-[44px]">
            {row.postsTracked}
          </Stat>
          <Stat label="Last post" className="w-[64px]">
            {lastPostLabel(row.lastPostAt, row.postsTracked)}
          </Stat>
          <Stat label="Best 30d" className="w-[72px]">
            {row.bestScore === null ? (
              <span className="text-muted-foreground" title={outlierBadgeModel(best).tooltip}>
                —
              </span>
            ) : (
              <OutlierBadge input={best} />
            )}
          </Stat>
        </span>
      ) : null}

      <span className="ml-auto flex shrink-0 items-center gap-1">
        {tracked && href ? (
          <Button variant="outline" asChild>
            <Link href={href}>Open</Link>
          </Button>
        ) : !canEdit ? null : canTrack ? (
          <Button
            variant="outline"
            icon={busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
            disabled={anyBusy}
            title={trackTitle}
            onClick={onTrack}
          >
            {busy ? "Tracking…" : "Track"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground" title={row.trackable === false ? `${platformLabel(row.platform)} stays listed here with its link; it is not counted in Track all` : "Add the account handle to track it"}>
            {row.trackable === false ? `${platformLabel(row.platform)} tracking is coming` : "Needs a handle"}
          </span>
        )}
        {unreadable ? (
          <button
            type="button"
            title="Capture with my browser"
            aria-label={`Capture ${row.displayName} with my browser`}
            className={ICON_BUTTON}
            onClick={() =>
              openCapture({
                platform: row.platform,
                handleOrUrl: row.profileUrl || row.externalUrl || row.handle,
                ...(row.profileId ? { profileId: row.profileId } : {}),
                ...(row.trackedAccountId ? { trackedAccountId: row.trackedAccountId } : {}),
                ...(row.propertyId ? { propertyId: row.propertyId } : {}),
                brandId,
              })
            }
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {captureNode}
        {row.externalUrl ? (
          <a
            href={row.externalUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open on ${platformLabel(row.platform)}`}
            aria-label={`Open ${row.displayName} on ${platformLabel(row.platform)}`}
            className={ICON_BUTTON}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
        {onEdit ? (
          <button type="button" title="Edit property" aria-label="Edit property" onClick={onEdit} className={ICON_BUTTON}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            title="Delete property"
            aria-label="Delete property"
            onClick={onDelete}
            className={`${ICON_BUTTON} hover:!bg-destructive/10 hover:!text-destructive-ink`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>
    </li>
  );
}

function ExtraRow({
  property,
  onEdit,
  onDelete,
}: {
  property: BrandProperty;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const href = property.url || null;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <PropertyKindMark kind={property.kind} size={32} />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">
          {property.display_name || platformLabel(property.kind)}
        </span>
        <span className="truncate text-xs text-muted-foreground">Not a social profile</span>
      </div>
      <span className="flex shrink-0 items-center gap-1">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" title="Open link" aria-label="Open link" className={ICON_BUTTON}>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
        {onEdit ? (
          <button type="button" title="Edit property" aria-label="Edit property" onClick={onEdit} className={ICON_BUTTON}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            title="Delete property"
            aria-label="Delete property"
            onClick={onDelete}
            className={`${ICON_BUTTON} hover:!bg-destructive/10 hover:!text-destructive-ink`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>
    </li>
  );
}
