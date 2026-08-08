"use client";

/**
 * AssetImageEditorDialog — the Media workspace's image-editing suite for a
 * brand asset that has a `file_id`. Mounts the canonical Image Studio Edit
 * shell (`EditModeShell`, Filerobot + the AI ops toolbar: adjust, auto color,
 * sharpen, denoise, Remove BG, Inpaint-with-mask, upscale) in derivative-only
 * mode (`preserveSource`) — the asset's original file is never mutated; every
 * save and every AI op produces a NEW `files` row via the Python image-ops
 * backend or the universal file handler.
 *
 * On top of the editor sits a "Fit to standards" strip: one-click renders of
 * the site's media-standards slots (`web.site.settings.media_standards`) via
 * the generic `POST /images/edit` `resize` op (`fit: "cover"`, the slot's
 * format). Every produced file is saved back as a new `web.brand_asset` row
 * so results land in the brand library beside the source.
 *
 * Reuse map (nothing forked): EditModeShell (canonical editor) ·
 * `applyEdit` (typed Python image-ops client) · `useCreateBrandAsset`
 * (brand-cockpit CRUD + query invalidation).
 */

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Loader2, Ruler } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { applyEdit } from "@/features/image-studio/api/python";
import type { EditOutput } from "@/features/image-studio/api/python";
import type { SaveResult } from "@/features/image-studio/modes/shared/types";
import { useCreateBrandAsset } from "@/features/marketing/data/hooks";
import type {
  MediaStandardSlot,
  SiteMediaStandards,
} from "@/features/marketing/data/media-library";
import type { BrandAsset, BrandAssetKind } from "@/features/marketing/types";

const EditModeShell = dynamic(
  () =>
    import("@/features/image-studio/modes/edit/EditModeShell").then(
      (mod) => mod.EditModeShell,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full flex-col gap-2 p-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="min-h-0 flex-1 w-full" />
      </div>
    ),
  },
);

const LIBRARY_FOLDER = "Images/Brand Library";

/** Kinds that stay meaningful on an edited derivative; everything else
 * (video, color, font, document) falls back to plain "image". */
const IMAGE_KINDS: ReadonlySet<string> = new Set([
  "logo",
  "logo_dark",
  "favicon",
  "wordmark",
  "hero_image",
  "og_image",
  "twitter_image",
  "image",
]);

function derivativeKind(asset: BrandAsset): BrandAssetKind {
  return (IMAGE_KINDS.has(asset.kind) ? asset.kind : "image") as BrandAssetKind;
}

/** Map a slot's free-form format string onto the image-ops output union. */
function slotOutputFormat(
  format: string | null,
): NonNullable<EditOutput["format"]> {
  const normalized = (format ?? "").trim().toLowerCase();
  if (normalized === "jpg" || normalized === "jpeg") return "jpeg";
  if (normalized === "png") return "png";
  if (normalized === "avif") return "avif";
  return "webp";
}

export function AssetImageEditorDialog({
  asset,
  onOpenChange,
  brandId,
  organizationId,
  standards,
}: {
  /** Must carry a `file_id` — the tile hides the entry point otherwise. */
  asset: BrandAsset | null;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  organizationId: string;
  standards: SiteMediaStandards;
}) {
  const createAsset = useCreateBrandAsset();
  const [renderingSlotId, setRenderingSlotId] = useState<string | null>(null);
  const [renderedSlotIds, setRenderedSlotIds] = useState<Set<string>>(
    () => new Set(),
  );

  const fileId = asset?.file_id ?? null;
  const baseTitle = asset?.title || "Asset";

  const renderableSlots = useMemo(
    () =>
      standards.slots.filter(
        (slot) => slot.width !== null && slot.height !== null,
      ),
    [standards.slots],
  );

  const saveDerivative = useCallback(
    async (input: {
      fileId: string;
      title: string;
      notes: string;
    }): Promise<void> => {
      if (!asset) return;
      await createAsset.mutateAsync({
        organizationId,
        brandId,
        kind: derivativeKind(asset),
        sourceUrl: null,
        fileId: input.fileId,
        title: input.title,
        notes: input.notes,
        isPrimary: false,
        source: "manual",
      });
    },
    [asset, brandId, createAsset, organizationId],
  );

  const renderSlot = useCallback(
    async (slot: MediaStandardSlot) => {
      if (!fileId || !asset || !slot.width || !slot.height) return;
      setRenderingSlotId(slot.id);
      try {
        const result = await applyEdit({
          source_id: fileId,
          op: "resize",
          params: { width: slot.width, height: slot.height, fit: "cover" },
          output: {
            format: slotOutputFormat(slot.format),
            visibility: "public",
            folder: LIBRARY_FOLDER,
          },
        });
        if (!result.file_id) {
          throw new Error("The resize returned no file id.");
        }
        await saveDerivative({
          fileId: result.file_id,
          title: `${baseTitle} — ${slot.name}`,
          notes: `Rendered to the "${slot.name}" media standard (${slot.width}×${slot.height}) from library asset ${asset.id}.`,
        });
        setRenderedSlotIds((prev) => new Set(prev).add(slot.id));
        toast.success(`"${slot.name}" saved to the brand library`, {
          description: `${slot.width}×${slot.height} ${slotOutputFormat(slot.format)}`,
        });
      } catch (error) {
        toast.error(`Could not render "${slot.name}"`, {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setRenderingSlotId(null);
      }
    },
    [asset, baseTitle, fileId, saveDerivative],
  );

  const handleEditorSave = useCallback(
    (result: SaveResult) => {
      if (!asset) return;
      if (result.fileId === asset.file_id) {
        // preserveSource makes this unreachable, but guard anyway: a save
        // that landed on the source file needs no new library row.
        toast.success("Image saved.");
        return;
      }
      void (async () => {
        try {
          await saveDerivative({
            fileId: result.fileId,
            title: result.filename.replace(/\.[a-z0-9]+$/i, ""),
            notes: `Edited from library asset ${asset.id} in the media workspace image editor.`,
          });
          toast.success("Edited image saved to the brand library", {
            description: result.filename,
          });
        } catch (error) {
          toast.error(
            "The image was saved to your files, but the library row failed",
            {
              description:
                error instanceof Error ? error.message : undefined,
            },
          );
        }
      })();
    },
    [asset, saveDerivative],
  );

  const source = useMemo(
    () =>
      fileId ? ({ kind: "cloudFileId", cloudFileId: fileId } as const) : null,
    [fileId],
  );

  return (
    <Dialog open={Boolean(asset && fileId)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94dvh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1400px]">
        <DialogHeader className="shrink-0 space-y-0.5 border-b border-border px-3 py-2">
          <DialogTitle className="text-sm">
            Edit image — {baseTitle}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Every save creates a new brand-library asset. The original is
            never modified.
          </DialogDescription>
        </DialogHeader>

        {renderableSlots.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-1">
            <span className="mr-1 flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              <Ruler className="h-3 w-3" />
              Fit to standards
            </span>
            {renderableSlots.map((slot) => {
              const rendering = renderingSlotId === slot.id;
              const done = renderedSlotIds.has(slot.id);
              return (
                <Tooltip key={slot.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-xs text-foreground/80 hover:text-foreground"
                      disabled={renderingSlotId !== null}
                      onClick={() => void renderSlot(slot)}
                    >
                      {rendering ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : done ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : null}
                      {slot.name}
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {slot.width}×{slot.height}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Render a {slot.width}×{slot.height}{" "}
                    {slotOutputFormat(slot.format)} (cover crop) and save it
                    to the brand library
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {source ? (
            <EditModeShell
              source={source}
              defaultFolder={LIBRARY_FOLDER}
              presentation="modal"
              preserveSource
              onSave={handleEditorSave}
              onCancel={() => onOpenChange(false)}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
