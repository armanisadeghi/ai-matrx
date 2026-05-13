/**
 * features/files/components/core/ShareLinkDialog/ShareLinkDialog.tsx
 *
 * Manage share links for a file or folder. List active links, create new
 * ones (with expiry + max uses + permission level), copy URL to clipboard,
 * and deactivate.
 *
 * Desktop-only — mobile surfaces must wrap the same body in a Drawer
 * instead. The inner content is rendered by ShareLinkDialogBody which is
 * surface-agnostic.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link, Loader2, Trash2 } from "lucide-react";
import { extractErrorMessage } from "@/utils/errors";
import { pythonShareUrl } from "@/features/files/handler/utils/python-base";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveShareLinksForResource } from "@/features/files/redux/selectors";
import {
  createShareLink,
  deactivateShareLink,
  loadShareLinks,
} from "@/features/files/redux/thunks";
import { formatAbsoluteDate } from "@/features/files/utils/format";
import type { ResourceType } from "@/features/files/types";

export interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  resourceType: ResourceType;
  /** Base URL for building the copyable URL. Defaults to window.location.origin. */
  appOrigin?: string;
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  resourceId,
  resourceType,
  appOrigin,
}: ShareLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Anyone with the link will be able to {resourceType === "folder" ? "view the folder" : "access this file"}.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ShareLinkDialogBody
            resourceId={resourceId}
            resourceType={resourceType}
            appOrigin={appOrigin}
          />
        </div>
        <DialogFooter className="border-t px-6 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Body — pure content, no Dialog chrome. Reused by DrawerShell on mobile.
// ---------------------------------------------------------------------------

interface ShareLinkDialogBodyProps {
  resourceId: string;
  resourceType: ResourceType;
  appOrigin?: string;
}

export function ShareLinkDialogBody({
  resourceId,
  resourceType,
  appOrigin,
}: ShareLinkDialogBodyProps) {
  const dispatch = useAppDispatch();
  const links = useAppSelector((s) =>
    selectActiveShareLinksForResource(s, resourceId),
  );
  const [creating, setCreating] = useState(false);
  const [permissionLevel, setPermissionLevel] = useState<"read" | "write">(
    "read",
  );
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [maxUses, setMaxUses] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  // Two flavors of "copied" state — one per URL kind, keyed by token so a
  // user copying the page URL doesn't tick the file URL's checkmark too.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(loadShareLinks({ resourceId }));
  }, [dispatch, resourceId]);

  const buildPageUrl = useCallback(
    (token: string) => {
      const base =
        appOrigin ??
        (typeof window !== "undefined" ? window.location.origin : "");
      return `${base}/share/${token}`;
    },
    [appOrigin],
  );

  /**
   * Direct-file URL — points at Python's public `/share/{token}` resolver.
   * The browser → Python → S3 chain has no Next.js hop; embeddable into
   * `<img src>`, `<video>`, raw downloads, Notion, Slack, etc.
   */
  const buildFileUrl = useCallback(
    (token: string) => `${pythonShareUrl(token)}`,
    [],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      await dispatch(
        createShareLink({
          resourceId,
          resourceType,
          permissionLevel,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          maxUses: maxUses ? Number(maxUses) : undefined,
        }),
      ).unwrap();
      setExpiresAt("");
      setMaxUses("");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [dispatch, resourceId, resourceType, permissionLevel, expiresAt, maxUses]);

  const handleCopy = useCallback(
    async (key: string, url: string) => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          setCopiedKey(key);
          setTimeout(
            () => setCopiedKey((k) => (k === key ? null : k)),
            1500,
          );
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const handleDeactivate = useCallback(
    async (token: string) => {
      await dispatch(deactivateShareLink({ shareToken: token })).unwrap();
    },
    [dispatch],
  );

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Create new link form */}
      <div className="rounded-md border p-3 space-y-3 bg-muted/20">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link className="h-4 w-4" />
          Create new link
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Permission</span>
            <select
              value={permissionLevel}
              onChange={(e) =>
                setPermissionLevel(e.target.value as "read" | "write")
              }
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value="read">Read only</option>
              <option value="write">Read + write</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              Expires (optional)
            </span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-muted-foreground">
              Max uses (optional)
            </span>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
              style={{ fontSize: "16px" }}
            />
          </label>
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link className="h-4 w-4" />
          )}
          Create link
        </button>
      </div>

      {/* Existing links */}
      <div className="min-w-0">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Active links
        </h3>
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No active links yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {links.map((link) => {
              const pageUrl = buildPageUrl(link.shareToken);
              const fileUrl = buildFileUrl(link.shareToken);
              const fileKey = `file:${link.shareToken}`;
              const pageKey = `page:${link.shareToken}`;
              return (
                <li
                  key={link.id}
                  className="flex flex-col gap-2 rounded-md border p-3 min-w-0"
                >
                  {/* Header row — meta + delete. */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium uppercase text-foreground/80">
                        {link.permissionLevel}
                      </span>
                      {link.expiresAt ? (
                        <span>
                          · Expires {formatAbsoluteDate(link.expiresAt)}
                        </span>
                      ) : (
                        <span>· No expiry</span>
                      )}
                      {link.maxUses ? (
                        <span>
                          · {link.useCount}/{link.maxUses} uses
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeactivate(link.shareToken)}
                      aria-label="Deactivate link"
                      title="Revoke link"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Direct file URL — embeds + hot-links. Promoted as the
                      primary action because most callers want the bytes,
                      not the metadata page. */}
                  <UrlRow
                    label="Direct file URL"
                    sublabel="Opens / embeds the file directly"
                    url={fileUrl}
                    isCopied={copiedKey === fileKey}
                    onCopy={() => void handleCopy(fileKey, fileUrl)}
                    primary
                  />
                  {/* Page URL — pretty landing page with metadata + download. */}
                  <UrlRow
                    label="Share page"
                    sublabel="Metadata + download button"
                    url={pageUrl}
                    isCopied={copiedKey === pageKey}
                    onCopy={() => void handleCopy(pageKey, pageUrl)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UrlRow — one labelled URL with copy + open-in-new-tab buttons. Built so
// long URLs always truncate inside the dialog instead of overflowing.
// ---------------------------------------------------------------------------

interface UrlRowProps {
  label: string;
  sublabel: string;
  url: string;
  isCopied: boolean;
  onCopy: () => void;
  primary?: boolean;
}

function UrlRow({
  label,
  sublabel,
  url,
  isCopied,
  onCopy,
  primary,
}: UrlRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 min-w-0",
        primary && "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className={cn("font-medium", primary && "text-primary")}>
            {label}
          </span>
          <span>· {sublabel}</span>
        </div>
        {/* `truncate` + `min-w-0` on the parent flex item is what keeps
            this from overflowing the dialog when the URL is long. */}
        <div
          className="truncate text-xs font-mono text-foreground/90"
          title={url}
        >
          {url}
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open in new tab"
        title="Open in new tab"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy"
        title="Copy"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-accent",
          isCopied && "text-emerald-500",
        )}
      >
        {isCopied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
