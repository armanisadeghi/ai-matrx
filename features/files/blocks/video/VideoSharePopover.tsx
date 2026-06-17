/**
 * features/files/blocks/video/VideoSharePopover.tsx
 *
 * The Share surface for videos in `UnifiedVideoBlockRenderer`. It is the
 * video twin of `image/ImageSharePopover.tsx` and — critically — uses the
 * SAME share-link path: the `createShareLink` / `loadShareLinks` thunks,
 * the `selectActiveShareLinksForResource` selector, the `ShareLinkDialog`,
 * and `pythonShareUrl`. There is no second share mechanism; only this thin
 * presentation wrapper differs (a `<video>` has no "copy image" notion).
 *
 *   • Copy public link    — Permanent. CDN URL (visibility="public") or a
 *                           freshly created no-expiry `/share/{token}`.
 *   • Copy temporary link — The current signed URL, labelled "expires soon".
 *   • Manage all links →  — The full ShareLinkDialog (matrx files only).
 *
 * External videos get a simplified surface (just the external URL).
 * Mobile = Drawer, desktop = Popover — same body in both.
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
import type { VideoBlock } from "../types";

export interface VideoSharePopoverProps {
  block: VideoBlock;
  /** Currently-resolved src — used for the temporary-link option. */
  currentSrc: string | null;
  children: React.ReactNode;
  className?: string;
}

export function VideoSharePopover({
  block,
  currentSrc,
  children,
  className,
}: VideoSharePopoverProps) {
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
                <DrawerTitle className="text-sm">Share video</DrawerTitle>
                <DrawerDescription className="text-xs">
                  Pick how you want to share. The public link will never expire.
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
              <div className="text-xs font-semibold">Share video</div>
              <div className="text-[11px] text-muted-foreground">
                Public link never expires · temporary expires in ~1 hour
              </div>
            </div>
            <div className="p-2">{body}</div>
          </PopoverContent>
        </Popover>
      )}

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

interface ShareQuickActionsBodyProps {
  block: VideoBlock;
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
  if (block.origin === "external") {
    return (
      <ExternalQuickActions
        block={block}
        currentSrc={currentSrc}
        onActionComplete={onActionComplete}
      />
    );
  }
  return (
    <MatrxQuickActions
      block={block}
      currentSrc={currentSrc}
      onAdvanced={onAdvanced}
      onActionComplete={onActionComplete}
    />
  );
}

function ExternalQuickActions({
  block,
  currentSrc,
  onActionComplete,
}: {
  block: Extract<VideoBlock, { origin: "external" }>;
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
        This video is hosted externally — we can&apos;t create a permanent Matrx
        share link for it.
      </p>
    </div>
  );
}

function MatrxQuickActions({
  block,
  currentSrc,
  onAdvanced,
  onActionComplete,
}: {
  block: Extract<VideoBlock, { origin: "matrx" }>;
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

  useEffect(() => {
    void dispatch(loadShareLinks({ resourceId: block.fileId }));
  }, [dispatch, block.fileId]);

  const existingPublicLink = useMemo(() => {
    return (
      links.find(
        (l) => l.permissionLevel === "read" && !l.expiresAt && !l.maxUses,
      ) ?? null
    );
  }, [links]);

  const handleCopyPublic = useCallback(async () => {
    if (publicBusy) return;
    setPublicBusy(true);
    try {
      if (block.visibility === "public" && block.cdnUrl) {
        await navigator.clipboard.writeText(block.cdnUrl);
        toast.success("Public link copied", {
          description: "This is the file's permanent public URL.",
        });
        setCopiedKey("public");
        onActionComplete();
        return;
      }

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

  const tempAvailable = Boolean(block.signedUrl || currentSrc);

  const publicLabel = useMemo(() => {
    if (block.visibility === "public" && block.cdnUrl) return "Copy public link";
    if (existingPublicLink) return "Copy public link";
    return "Create + copy public link";
  }, [block.visibility, block.cdnUrl, existingPublicLink]);

  const publicSublabel = useMemo(() => {
    if (block.visibility === "public" && block.cdnUrl) {
      return "Permanent CDN URL · anyone with the link";
    }
    if (existingPublicLink) return "Reuses your existing no-expiry link";
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
