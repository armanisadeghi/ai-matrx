/**
 * features/files/blocks/BlockSharePopover.tsx
 *
 * THE share surface for unified media blocks (image + video) — the wave-2
 * M-SHARE host hookup. The share BODY is `@ai-matrx/media/share`'s
 * `MediaSharePopover` (ONE share mechanism, package-owned per ruling C19);
 * this file keeps only what is genuinely app-shaped:
 *
 *   - the mobile Drawer / desktop Popover positioning split (the body is
 *     positioned by its opener — host content by design);
 *   - `manageLinks` → the iam `ShareLinkDialog` (app content per C8),
 *     owned HERE so it survives the popover/drawer closing;
 *   - `AccessSummary` → the canonical `AccessSummaryPanel`;
 *   - `notify` → the ONE toast entry point.
 *
 * The public-link path (permanent CDN URL for public files, else
 * reuse-or-mint a no-expiry read-only share link) rides the ONE
 * `MediaClient.shareableUrl` door — see `media-client/client.ts`.
 *
 * Replaces the deleted `image/ImageSharePopover.tsx` and
 * `video/VideoSharePopover.tsx` twins.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import type { MediaActionContext, MediaRefLike } from "@ai-matrx/media";
import { useMediaResolution } from "@ai-matrx/media/core";
import {
  MediaSharePopover,
  type MediaShareAccessSummaryProps,
  type MediaShareNotifier,
} from "@ai-matrx/media/share";
import type { EntityTypeToken } from "@ai-matrx/associations";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { AccessSummaryPanel } from "@/features/sharing/components/AccessSummaryPanel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { MediaSourceBlock } from "./useBlockMediaSource";

/** Toast adapter for the package share body (failures also render inline). */
export const mediaShareNotifier: MediaShareNotifier = {
  success: (message, opts) => {
    toast.success(message, opts?.description ? { description: opts.description } : undefined);
  },
  error: (message, opts) => {
    toast.error(message, opts?.description ? { description: opts.description } : undefined);
  },
};

/** The "Who can see this" slot — the canonical iam reachability panel. */
export function MediaShareAccessSummary({
  entityType,
  entityId,
}: MediaShareAccessSummaryProps) {
  return (
    <AccessSummaryPanel
      entityType={entityType as EntityTypeToken}
      entityId={entityId}
      className="px-3 pb-1"
    />
  );
}

/** Build the package `MediaActionContext` for a unified media block. */
export function useBlockShareContext(
  block: MediaSourceBlock,
  currentSrc: string | null,
): MediaActionContext {
  const ref = useMemo<MediaRefLike>(() => {
    if (block.origin === "matrx") {
      return { file_id: block.fileId, mime_type: block.mimeType ?? undefined };
    }
    // External: the block URL, falling back to the currently-rendered src
    // (mirrors the deleted popovers' `externalUrl || currentSrc`).
    return {
      url: block.externalUrl || currentSrc || "",
      mime_type: block.mimeType ?? undefined,
    };
  }, [block, currentSrc]);
  const { resolution } = useMediaResolution(ref);
  return useMemo(
    () => ({
      ref,
      resolution,
      fileName: block.fileName ?? undefined,
    }),
    [ref, resolution, block.fileName],
  );
}

export interface BlockShareBodyProps {
  block: MediaSourceBlock;
  currentSrc: string | null;
  /** Opens the caller-owned ShareLinkDialog (matrx blocks only). */
  onManageLinks: () => void;
  onClose: () => void;
  className?: string;
}

/**
 * The bare share body for surfaces that already own a container (the image
 * options Drawer) — the package popover with the standard host bindings and
 * its own panel chrome stripped.
 */
export function BlockShareBody({
  block,
  currentSrc,
  onManageLinks,
  onClose,
  className,
}: BlockShareBodyProps) {
  const context = useBlockShareContext(block, currentSrc);
  return (
    <MediaSharePopover
      context={context}
      onClose={onClose}
      manageLinks={block.origin === "matrx" ? onManageLinks : undefined}
      AccessSummary={MediaShareAccessSummary}
      notify={mediaShareNotifier}
      entityToken="file"
      className={cn("w-full rounded-none border-0 shadow-none", className)}
    />
  );
}

export interface BlockSharePopoverProps {
  block: MediaSourceBlock;
  /** Currently-resolved src — external fallback only; never copied if signed. */
  currentSrc: string | null;
  /** Render-prop for the trigger element. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Cross-platform share entry point. Wraps `children` in a Popover trigger on
 * desktop and a Drawer on mobile; the body is the package share popover in
 * both cases, so behavior is identical.
 */
export function BlockSharePopover({
  block,
  currentSrc,
  children,
  className,
}: BlockSharePopoverProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const context = useBlockShareContext(block, currentSrc);

  const close = useCallback(() => setOpen(false), []);
  const manageLinks = useCallback(() => {
    setAdvancedOpen(true);
    setOpen(false);
  }, []);

  const shareOptions = {
    manageLinks: block.origin === "matrx" ? manageLinks : undefined,
    AccessSummary: MediaShareAccessSummary,
    notify: mediaShareNotifier,
    entityToken: "file",
  } as const;

  return (
    <>
      {isMobile ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn("inline-flex", className)}
          >
            {children}
          </button>
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerContent>
              <DrawerHeader className="sr-only">
                <DrawerTitle>
                  Share {block.kind === "video" ? "video" : "image"}
                </DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-6">
                <MediaSharePopover
                  context={context}
                  onClose={close}
                  {...shareOptions}
                  className="w-full rounded-none border-0 shadow-none"
                />
              </div>
            </DrawerContent>
          </Drawer>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span className={cn("inline-flex", className)}>{children}</span>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 border-0 bg-transparent p-0 shadow-none"
            align="end"
            sideOffset={6}
          >
            <MediaSharePopover
              context={context}
              onClose={close}
              {...shareOptions}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Advanced: the iam share-link manager (app content per C8). Sibling
          of the popover/drawer so it survives their closing. Only matrx
          files have a cld_files row to attach share links to. */}
      {block.origin === "matrx" ? (
        <ShareLinkDialog
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          resourceId={block.fileId}
          resourceType="file"
        />
      ) : null}
    </>
  );
}
