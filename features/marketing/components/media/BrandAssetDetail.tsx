"use client";

/**
 * BrandAssetDetail — THE full record view of one `web.brand_asset`.
 *
 * Why it exists (D150 P0): the Videos view runs a PAID agent that writes an
 * SEO title, a description, a keyword set, a schema.org `VideoObject`, and a
 * generation timestamp onto `data.video_metadata` — and the UI exposed the
 * title and a four-pixel "meta" badge. The keywords, the description, the
 * schema.org block and every stamp on the row were bought, stored, and
 * invisible. This is where they live now.
 *
 * It is ONE component (a shape has exactly one renderer): the video pillar and
 * the brand library both open this, and any future asset surface should too.
 * Nothing here is video-specific except the schema.org label — every
 * `brand_asset` kind renders correctly.
 *
 * Doors (THE DOOR LAW): the brand, the stored file, the asset's source URL,
 * and — for a promoted crawl video — every canonical page it was observed on.
 */

import { useState } from "react";
import { Copy, ExternalLink, FileVideo, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { RecordStamps } from "@/components/official/record-stamps/RecordStamps";
import { useRecordActors } from "@/components/official/record-stamps/useRecordActors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import {
  CondensedFieldGrid,
  formatDate,
  JsonPreview,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { useBrand } from "@/features/marketing/data/hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { type BrandAsset } from "@/features/marketing/types";
import { readVideoMetadata } from "@/features/marketing/lib/video-metadata";
import type { Json } from "@/types/database.types";
import { toast } from "@/lib/toast";

export interface AssetPageRef {
  pageId: string;
  url: string;
  path: string | null;
}

export function BrandAssetDetail({
  asset,
  sitePath,
  /** Canonical pages this asset was crawled on, when the caller knows them. */
  pages,
  posterUrl,
  onEdit,
}: {
  asset: BrandAsset;
  sitePath?: string;
  pages?: readonly AssetPageRef[];
  posterUrl?: string | null;
  onEdit?: () => void;
}) {
  const metadata = readVideoMetadata(asset.data);
  const brand = useBrand(asset.brand_id);
  const resolveActor = useRecordActors(asset.organization_id, [
    asset.created_by,
    asset.updated_by,
    asset.confirmed_by,
  ]);
  const copy = webCopy({
    kind: "web-brand-asset",
    label: asset.title || `Brand ${asset.kind}`,
    description:
      "One brand library asset: the complete stored row including any agent-written metadata.",
    surface: `Brand asset detail — ${asset.kind}`,
    data: asset,
    lines: [
      ["Asset", asset.id],
      ["Kind", asset.kind],
      ["Title", asset.title],
      ["Notes", asset.notes],
      ["Source", asset.source],
      ["Source URL", asset.source_url],
      ["Stored file", asset.file_id],
      ["Primary", asset.is_primary ? "yes" : "no"],
      ["Sort order", asset.sort_order],
      ["AI title", metadata?.title],
      ["AI description", metadata?.description],
      ["AI keywords", metadata?.keywords.join(", ")],
      ["Metadata written", formatDate(metadata?.generatedAt ?? null)],
    ],
    attributes: {
      asset_id: asset.id,
      brand_id: asset.brand_id,
      kind: asset.kind,
    },
  });

  return (
    <div className="grid gap-3 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-muted/40">
          {asset.file_id ? (
            <InlineMediaRef
              ref={asset.file_id}
              as="video"
              size="fill"
              fit="contain"
              alt={asset.title ?? "Brand asset"}
              preload="metadata"
              controls
            />
          ) : posterUrl ? (
            // Third-party provider poster — documented <img> exception.
            <img
              src={posterUrl}
              alt={asset.title ?? "Asset poster"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <FileVideo className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="capitalize">
              {asset.kind}
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {asset.source}
            </Badge>
            {asset.is_primary ? <Badge variant="success">Primary</Badge> : null}
            {metadata ? <Badge variant="outline">AI metadata</Badge> : null}
            <span className="ml-auto flex items-center gap-1">
              <CopyButtons size="xs" {...copy} json={() => asset} />
              {onEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={onEdit}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              ) : null}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {asset.title || "Untitled asset"}
          </h3>
          {asset.notes ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {asset.notes}
            </p>
          ) : null}
          <CondensedFieldGrid
            fields={[
              {
                label: "Brand",
                value: (
                  <EntityRef
                    token="web_brand"
                    id={asset.brand_id}
                    // Resolved here, not at the call site: an EntityRef with
                    // no name falls back to a truncated uuid, which is the
                    // bare-id dead end this whole component exists to kill.
                    name={brand.data?.name ?? undefined}
                    wrap
                  />
                ),
              },
              {
                label: "Sort order",
                value: <span className="tabular-nums">{asset.sort_order}</span>,
              },
              {
                label: "Source URL",
                value: asset.source_url ? (
                  <a
                    href={asset.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 break-all text-primary hover:underline"
                  >
                    <span className="break-all">{asset.source_url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    No external URL (uploaded file)
                  </span>
                ),
                span: 2,
              },
              {
                label: "Stored file",
                value: asset.file_id ? (
                  <EntityRef
                    token="file"
                    id={asset.file_id}
                    name={asset.title ?? "Uploaded video"}
                    wrap
                  />
                ) : (
                  <span className="text-muted-foreground">
                    Not stored in our files
                  </span>
                ),
                span: 2,
              },
              {
                label: "Confirmed",
                value: asset.confirmed_at ? (
                  formatDate(asset.confirmed_at)
                ) : (
                  <span className="text-muted-foreground">Not confirmed</span>
                ),
              },
              {
                label: "Asset id",
                value: (
                  <span className="break-all font-mono text-[11px]">
                    {asset.id}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* THE PAID-FOR DATA. Every field the metadata agent wrote, in full. */}
      {metadata ? (
        <SectionCard
          title="AI-written video metadata"
          headerExtra={
            metadata.generatedAt ? (
              <span className="text-[10px] text-muted-foreground">
                written {formatDate(metadata.generatedAt)}
              </span>
            ) : null
          }
        >
          <div className="space-y-3 p-3">
            <Field label="Title" value={metadata.title} />
            <Field label="Description" value={metadata.description} multiline />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Keywords ({metadata.keywords.length})
              </p>
              {metadata.keywords.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {metadata.keywords.map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className="text-[10px] font-normal"
                    >
                      {keyword}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  The agent wrote no keywords.
                </p>
              )}
            </div>
            {metadata.schemaOrg ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    schema.org VideoObject
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[10px]"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          `<script type="application/ld+json">\n${JSON.stringify(metadata.schemaOrg, null, 2)}\n</script>`,
                        )
                        .then(() =>
                          toast.success("JSON-LD script tag copied"),
                        )
                        .catch(() =>
                          toast.error("Could not copy the JSON-LD"),
                        );
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    Copy as JSON-LD
                  </Button>
                </div>
                <div className="mt-1 overflow-hidden rounded-md border border-border">
                  <JsonPreview value={metadata.schemaOrg} />
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No AI metadata has been written for this asset yet.
        </p>
      )}

      {pages && pages.length > 0 ? (
        <SectionCard title={`Observed on ${pages.length} page${pages.length === 1 ? "" : "s"}`}>
          <ul className="divide-y divide-border">
            {pages.map((page) => (
              <li key={page.pageId} className="px-3 py-1.5">
                <EntityRef
                  token="web_page"
                  id={page.pageId}
                  name={page.path || page.url}
                  href={sitePath ? `${sitePath}/pages/${page.pageId}` : undefined}
                  wrap
                />
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Stored data">
        <JsonPreview value={asset.data} />
      </SectionCard>
      <SectionCard title="Record metadata">
        <JsonPreview value={asset.metadata} />
      </SectionCard>

      <RecordStamps
        organizationId={asset.organization_id}
        createdAt={asset.created_at}
        createdBy={asset.created_by}
        updatedAt={asset.updated_at}
        updatedBy={asset.updated_by}
        deletedAt={asset.deleted_at}
        version={asset.version}
        formatTimestamp={formatDate}
        resolveActor={resolveActor}
        className="rounded-md border border-border p-3"
      />
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          multiline
            ? "mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground"
            : "mt-0.5 text-xs text-foreground"
        }
      >
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

/** The dialog shell — the asset has no route of its own, so this is its door. */
export function BrandAssetDetailDialog({
  asset,
  open,
  onOpenChange,
  sitePath,
  pages,
  posterUrl,
  onEdit,
}: {
  asset: BrandAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sitePath?: string;
  pages?: readonly AssetPageRef[];
  posterUrl?: string | null;
  onEdit?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto p-0">
        {asset ? (
          <>
            <DialogHeader className="border-b border-border p-3">
              <DialogTitle className="text-sm">
                {asset.title || `Brand ${asset.kind}`}
              </DialogTitle>
              <DialogDescription className="text-xs">
                The complete stored record, including anything the metadata
                agent wrote.
              </DialogDescription>
            </DialogHeader>
            <BrandAssetDetail
              asset={asset}
              sitePath={sitePath}
              pages={pages}
              posterUrl={posterUrl}
              onEdit={onEdit}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Local state helper so a grid can open the detail for whichever tile is clicked. */
export function useBrandAssetDetail() {
  const [assetId, setAssetId] = useState<string | null>(null);
  return {
    openAssetId: assetId,
    open: (id: string) => setAssetId(id),
    close: () => setAssetId(null),
  };
}
