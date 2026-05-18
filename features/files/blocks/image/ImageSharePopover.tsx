/**
 * features/files/blocks/image/ImageSharePopover.tsx
 *
 * The canonical Share surface for images across the app — chat
 * messages, peek toasts, image grids, lightbox actions, etc.
 *
 * Three quick options up front (each does the obvious thing without
 * lying about it):
 *
 *   • Copy public link    — Truly permanent. Either the file's CDN URL
 *                           (when visibility="public") or a freshly
 *                           created no-expiry share-link `/share/{token}`.
 *                           Will still work in a week, a month, a year.
 *   • Copy temporary link — The current 1-hour signed URL with an
 *                           explicit "expires soon" label. Honest.
 *   • Manage all links →  — Opens the full {@link ShareLinkDialog}
 *                           for per-link permission/expiry/max-uses
 *                           control + revocation.
 *
 * External (non-matrx) images get a simplified surface — only the
 * external URL, since there's nothing to share-link.
 *
 * Mobile = Drawer, desktop = Popover. Both render the same
 * `<ShareQuickActionsBody />` so behavior is identical.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Globe, Link2, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { createShareLink, loadShareLinks } from "@/features/files/redux/thunks";
import { selectActiveShareLinksForResource } from "@/features/files/redux/selectors";
import { pythonShareUrl } from "@/features/files/handler/utils/python-base";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import type { UnifiedImageBlock } from "./types";

export interface ImageSharePopoverProps {
  block: UnifiedImageBlock;
  /** Currently-resolved src — used for the temporary-link option. */
  currentSrc: string | null;
  /** Render-prop for the trigger element. Receives the open state for styling. */
  children: React.ReactNode;
  /** Optional className passed through to the trigger wrapper. */
  className?: string;
}

/**
 * Cross-platform share entry point. Wraps `children` in a Popover trigger
 * on desktop and a long-press Drawer on mobile. The popover body itself
 * is the same component in both cases.
 */
export function ImageSharePopover({
  block,
  currentSrc,
  children,
  className,
}: ImageSharePopoverProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  const body = (
    <ShareQuickActionsBody
      block={block}
      currentSrc={currentSrc}
      onAdvanced={() => {
        setAdvancedOpen(true);
        close();
      }}
      onActionComplete={close}
    />
  );

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
              <DrawerHeader className="pb-2">
                <DrawerTitle className="text-sm">Share image</DrawerTitle>
                <DrawerDescription className="text-xs">
                  Pick how you want to share. The public link will never expire
                  — paste it anywhere and it keeps working.
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6">{body}</div>
            </DrawerContent>
          </Drawer>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span className={cn("inline-flex", className)}>{children}</span>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end" sideOffset={6}>
            <div className="border-b px-3 py-2">
              <div className="text-xs font-semibold">Share image</div>
              <div className="text-[11px] text-muted-foreground">
                Public link never expires · temporary expires in ~1 hour
              </div>
            </div>
            <div className="p-2">{body}</div>
          </PopoverContent>
        </Popover>
      )}

      {/* Advanced: full share-link dialog. Only available for matrx-owned
          files — external blocks don't have a cld_files row to attach
          share links to. */}
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

// ───────────────────────────────────────────────────────────────────────────────
// Body — quick actions + advanced link. Same for desktop/mobile.
// ───────────────────────────────────────────────────────────────────────────────

interface ShareQuickActionsBodyProps {
  block: UnifiedImageBlock;
  currentSrc: string | null;
  onAdvanced: () => void;
  onActionComplete: () => void;
}

function ShareQuickActionsBody({
  block,
  currentSrc,
  onAdvanced,
  onActionComplete,
}: ShareQuickActionsBodyProps) {
  // ── External: no share-link surface; just the URL we have. ───────────
  if (block.origin === "external") {
    return (
      <ExternalQuickActions
        block={block}
        currentSrc={currentSrc}
        onActionComplete={onActionComplete}
      />
    );
  }

  // ── Matrx: full quick-action surface. ──────────────────────────────────
  return (
    <MatrxQuickActions
      block={block}
      currentSrc={currentSrc}
      onAdvanced={onAdvanced}
      onActionComplete={onActionComplete}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// External — limited surface, no share links possible.
// ───────────────────────────────────────────────────────────────────────────────

function ExternalQuickActions({
  block,
  currentSrc,
  onActionComplete,
}: {
  block: Extract<UnifiedImageBlock, { origin: "external" }>;
  currentSrc: string | null;
  onActionComplete: () => void;
}) {
  const externalUrl = block.externalUrl || currentSrc || "";
  const handleCopy = useCallback(async () => {
    if (!externalUrl) {
      toast.error("No link to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(externalUrl);
      toast.success("Link copied");
      onActionComplete();
    } catch {
      toast.error("Could not copy link");
    }
  }, [externalUrl, onActionComplete]);

  return (
    <div className="flex flex-col gap-1">
      <QuickActionRow
        icon={<Link2 className="h-4 w-4" />}
        label="Copy external link"
        sublabel={externalUrl || "No URL available"}
        onClick={handleCopy}
        disabled={!externalUrl}
      />
      <p className="px-3 pt-2 text-[11px] text-muted-foreground">
        This image is hosted externally — we can&apos;t create a permanent Matrx
        share link for it.
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Matrx — full surface with public/temporary/advanced.
// ───────────────────────────────────────────────────────────────────────────────

function MatrxQuickActions({
  block,
  currentSrc,
  onAdvanced,
  onActionComplete,
}: {
  block: Extract<UnifiedImageBlock, { origin: "matrx" }>;
  currentSrc: string | null;
  onAdvanced: () => void;
  onActionComplete: () => void;
}) {
  const dispatch = useAppDispatch();
  const links = useAppSelector((s) =>
    selectActiveShareLinksForResource(s, block.fileId),
  );

  const [publicBusy, setPublicBusy] = useState(false);
  const [tempBusy, setTempBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load share links once on mount so we can detect when a no-expiry
  // public link already exists (avoids creating duplicates on each open).
  useEffect(() => {
    void dispatch(loadShareLinks({ resourceId: block.fileId }));
  }, [dispatch, block.fileId]);

  // An "existing public link" is read-only, no expiry, no usage cap.
  // If one exists we reuse it instead of minting a duplicate.
  const existingPublicLink = useMemo(() => {
    return (
      links.find(
        (l) => l.permissionLevel === "read" && !l.expiresAt && !l.maxUses,
      ) ?? null
    );
  }, [links]);

  /**
   * Resolve the truly permanent URL. Two paths:
   *   1. File is already `visibility="public"` AND has a permanent CDN URL
   *      — that URL is itself public and never expires.
   *   2. Otherwise — create (or reuse) a no-expiry read-only share link
   *      and use its Python `/share/{token}` URL.
   */
  const handleCopyPublic = useCallback(async () => {
    if (publicBusy) return;
    setPublicBusy(true);
    try {
      // Path 1 — already a public file with a real CDN URL.
      if (block.visibility === "public" && block.cdnUrl) {
        await navigator.clipboard.writeText(block.cdnUrl);
        toast.success("Public link copied", {
          description: "This is the file's permanent public URL.",
        });
        setCopiedKey("public");
        onActionComplete();
        return;
      }

      // Path 2 — reuse an existing no-expiry link, or mint one.
      let token = existingPublicLink?.shareToken;
      if (!token) {
        const link = await dispatch(
          createShareLink({
            resourceId: block.fileId,
            resourceType: "file",
            permissionLevel: "read",
          }),
        ).unwrap();
        token = link.shareToken;
      }
      const publicUrl = pythonShareUrl(token);
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public link copied", {
        description: "This link will never expire.",
      });
      setCopiedKey("public");
      onActionComplete();
    } catch (err) {
      toast.error("Could not create public link", {
        description: extractErrorMessage(err),
      });
    } finally {
      setPublicBusy(false);
    }
  }, [
    publicBusy,
    block.visibility,
    block.cdnUrl,
    block.fileId,
    existingPublicLink,
    dispatch,
    onActionComplete,
  ]);

  /**
   * The current signed URL — short-lived, exactly what `<img>` is using.
   * Useful for quick paste-into-chat or grabbing the raw S3 bytes.
   */
  const handleCopyTemporary = useCallback(async () => {
    if (tempBusy) return;
    const tempUrl = block.signedUrl ?? currentSrc;
    if (!tempUrl) {
      toast.error("No temporary link available");
      return;
    }
    setTempBusy(true);
    try {
      await navigator.clipboard.writeText(tempUrl);
      toast.success("Temporary link copied", {
        description: "Expires in about an hour.",
      });
      setCopiedKey("temp");
      onActionComplete();
    } catch {
      toast.error("Could not copy link");
    } finally {
      setTempBusy(false);
    }
  }, [tempBusy, block.signedUrl, currentSrc, onActionComplete]);

  // We can always create a public link for a matrx file, so the action
  // is never disabled on that grounds — `publicBusy` is the only gate.
  const tempAvailable = Boolean(block.signedUrl || currentSrc);

  const publicLabel = useMemo(() => {
    if (block.visibility === "public" && block.cdnUrl) {
      return "Copy public link";
    }
    if (existingPublicLink) return "Copy public link";
    return "Create + copy public link";
  }, [block.visibility, block.cdnUrl, existingPublicLink]);

  const publicSublabel = useMemo(() => {
    if (block.visibility === "public" && block.cdnUrl) {
      return "Permanent CDN URL · anyone with the link";
    }
    if (existingPublicLink) {
      return "Reuses your existing no-expiry link";
    }
    return "Creates a no-expiry read-only link";
  }, [block.visibility, block.cdnUrl, existingPublicLink]);

  return (
    <div className="flex flex-col gap-1">
      <QuickActionRow
        icon={<Globe className="h-4 w-4 text-emerald-500" />}
        label={publicLabel}
        sublabel={publicSublabel}
        onClick={handleCopyPublic}
        busy={publicBusy}
        copied={copiedKey === "public"}
      />
      <QuickActionRow
        icon={<Clock className="h-4 w-4 text-amber-500" />}
        label="Copy temporary link"
        sublabel="Short-lived · expires in ~1 hour"
        onClick={handleCopyTemporary}
        busy={tempBusy}
        disabled={!tempAvailable}
        copied={copiedKey === "temp"}
      />
      <div className="my-1 h-px bg-border" />
      <QuickActionRow
        icon={<Settings2 className="h-4 w-4 text-muted-foreground" />}
        label="Manage all links"
        sublabel="Custom expiry · permissions · revoke"
        onClick={onAdvanced}
        muted
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// QuickActionRow — one tappable, two-line action button.
// ───────────────────────────────────────────────────────────────────────────────

interface QuickActionRowProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  copied?: boolean;
  muted?: boolean;
}

function QuickActionRow({
  icon,
  label,
  sublabel,
  onClick,
  busy,
  disabled,
  copied,
  muted,
}: QuickActionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        (busy || disabled) && "opacity-50 cursor-not-allowed",
        muted && "text-muted-foreground",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium leading-tight">{label}</span>
        {sublabel ? (
          <span className="text-[11px] text-muted-foreground truncate">
            {sublabel}
          </span>
        ) : null}
      </span>
      {copied ? <Check className="h-4 w-4 shrink-0 text-emerald-500" /> : null}
    </button>
  );
}
