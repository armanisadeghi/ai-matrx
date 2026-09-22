"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  Loader2,
  Plus,
  Eye,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import type { ResourceType } from "@/utils/permissions/types";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  shareUrlForLink,
  type ShareLink,
} from "@/utils/permissions/shareLinks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useShare } from "@/features/sharing/hooks/useShare";
import {
  createSafeShareMessage,
  describeShareLinkAccess,
  describeShareLinkExpiry,
  evaluateShareLinkHandoff,
  shareLinkUnavailableReason,
} from "@/features/sharing/hooks/shareText";

interface ShareLinkPanelProps {
  resourceType: ResourceType;
  resourceId: string;
  isOwner: boolean;
  /** Whether this resource type offers no-login links (admin policy). Hidden when false. */
  enabled?: boolean;
}

function linkListErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "We couldn't load this item's share links.";
}

/**
 * "Anyone with the link" — mint / copy / revoke no-login share links.
 *
 * A share link is an opaque token that lets anyone view the resource with ZERO
 * sign-in (resolved by the anon `resolve_share_token` RPC). This is the canonical
 * link-carries-everything path — distinct from `visibility='public'` (which
 * needs a public render route). Owner-only.
 */
export function ShareLinkPanel({
  resourceType,
  resourceId,
  isOwner,
  enabled = true,
}: ShareLinkPanelProps) {
  const { toast } = useToast();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedResourceKey, setLoadedResourceKey] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ShareLink | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareLink | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const { share, copy: copyMessage, fallbackDialog } = useShare();
  const resourceKey = `${resourceType}\u0000${resourceId}`;

  const fetchLinks = useCallback(
    () => listShareLinks(resourceType, resourceId),
    [resourceType, resourceId],
  );

  const refresh = useCallback(async (): Promise<ShareLink[] | null> => {
    setLoading(true);
    setShareError(null);
    try {
      const freshLinks = await fetchLinks();
      setLinks(freshLinks);
      setLoadedResourceKey(resourceKey);
      return freshLinks;
    } catch (error) {
      if (loadedResourceKey !== resourceKey) setLinks([]);
      setLoadedResourceKey(resourceKey);
      setShareError(linkListErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchLinks, loadedResourceKey, resourceKey]);

  useEffect(() => {
    if (!isOwner) return;
    let current = true;
    void fetchLinks()
      .then((freshLinks) => {
        if (current) {
          setLinks(freshLinks);
          setLoadedResourceKey(resourceKey);
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setLinks([]);
          setLoadedResourceKey(resourceKey);
          setShareError(linkListErrorMessage(error));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isOwner, fetchLinks, resourceKey]);

  const activeLinks = links.filter((l) => l.isActive);
  const isLoading = loading || loadedResourceKey !== resourceKey;

  const copyLink = useCallback(
    async (sourceLink: ShareLink, alreadyRefreshed?: ShareLink[]) => {
      const refreshedLinks = alreadyRefreshed ?? (await refresh());
      if (!refreshedLinks) {
        toast({
          title: "Couldn't check this link",
          description:
            "The link list couldn't be refreshed. Try again before copying.",
          variant: "destructive",
        });
        return;
      }
      const currentLink = refreshedLinks.find(
        (link) => link.id === sourceLink.id,
      );
      if (!currentLink) {
        toast({
          title: "This link is no longer available",
          description: "Refresh the list and choose an active share link.",
          variant: "destructive",
        });
        return;
      }
      const unavailableReason = shareLinkUnavailableReason(currentLink);
      if (unavailableReason) {
        toast({
          title: "This link can't be copied",
          description: unavailableReason,
          variant: "destructive",
        });
        return;
      }
      const outcome = await copyMessage(shareUrlForLink(currentLink), {
        title: "Copy link",
        description:
          "Copy this link and send it to the person you want to share with.",
      });
      if (outcome === "copied") {
        setCopiedId(currentLink.id);
        setTimeout(() => setCopiedId(null), 2000);
        toast({
          title: "Link copied",
          description: "Anyone with it can view — no sign-in needed.",
        });
      }
    },
    [copyMessage, refresh, toast],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const result = await createShareLink({ resourceType, resourceId });
    setCreating(false);
    if (result.success && result.url) {
      const freshLinks = await refresh();
      const createdLink =
        result.token && freshLinks
          ? freshLinks.find((link) => link.token === result.token)
          : undefined;
      if (!createdLink || !freshLinks) {
        toast({
          title: "Link created but not copied",
          description:
            "The current link state couldn't be confirmed. Refresh the list before sharing it.",
          variant: "destructive",
        });
        return;
      }
      await copyLink(createdLink, freshLinks);
    } else {
      toast({
        title: "Couldn't create link",
        description: result.error ?? "Please try again",
        variant: "destructive",
      });
    }
  }, [resourceType, resourceId, refresh, copyLink, toast]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    const result = await revokeShareLink(revokeTarget.id);
    setRevokeTarget(null);
    if (result.success) {
      await refresh();
      toast({
        title: "Link turned off",
        description: "It can no longer be opened.",
      });
    } else {
      toast({
        title: "Couldn't revoke",
        description: result.error,
        variant: "destructive",
      });
    }
  }, [revokeTarget, refresh, toast]);

  const prepareTextShare = useCallback(
    async (linkId: string) => {
      setRefreshing(true);
      const freshLinks = await refresh();
      setRefreshing(false);
      if (!freshLinks) {
        toast({
          title: "Couldn't check this link",
          description:
            "The link list couldn't be refreshed. Try again before sharing.",
          variant: "destructive",
        });
        return;
      }

      const freshLink = freshLinks.find((link) => link.id === linkId);
      if (!freshLink) {
        toast({
          title: "This link is no longer available",
          description: "Refresh the list and choose an active share link.",
          variant: "destructive",
        });
        return;
      }

      const unavailableReason = shareLinkUnavailableReason(freshLink);
      if (unavailableReason) {
        toast({
          title: "This link can't be shared",
          description: unavailableReason,
          variant: "destructive",
        });
        return;
      }

      setShareTarget(freshLink);
    },
    [refresh, toast],
  );

  const closeShareReview = useCallback(() => {
    if (!handoffBusy) setShareTarget(null);
  }, [handoffBusy]);

  const handleNativeHandoff = useCallback(async () => {
    if (!shareTarget) return;
    setHandoffBusy(true);
    try {
      const freshLinks = await refresh();
      if (!freshLinks) {
        toast({
          title: "Couldn't check this link",
          description:
            "The link list couldn't be refreshed. Try again before sharing.",
          variant: "destructive",
        });
        return;
      }
      const currentLink = freshLinks.find((link) => link.id === shareTarget.id);
      if (!currentLink) {
        setShareTarget(null);
        toast({
          title: "This link is no longer available",
          description:
            "It may have been turned off. Choose an active link to continue.",
          variant: "destructive",
        });
        return;
      }
      const handoffReview = evaluateShareLinkHandoff(shareTarget, currentLink);
      if (handoffReview.status === "unavailable") {
        setShareTarget(null);
        toast({
          title: "This link can't be shared",
          description: handoffReview.reason,
          variant: "destructive",
        });
        return;
      }
      if (handoffReview.status === "changed") {
        setShareTarget(currentLink);
        toast({
          title: "Link access changed",
          description:
            "Review the updated access, expiry, and view count before sharing.",
          variant: "destructive",
        });
        return;
      }

      const message = createSafeShareMessage(shareUrlForLink(currentLink));
      const outcome = await share({
        title: "AI Matrx share",
        text: message,
        url: null,
        copyText: message,
        fallbackTitle: "Copy message",
        fallbackDescription:
          "Copy the reviewed message below and paste it into your messaging app.",
      });
      if (outcome === "cancelled") return;

      setShareTarget(null);
      if (outcome === "shared") {
        toast({
          title: "Share options opened",
          description:
            "AI Matrx didn't send the message. Complete it in your share app.",
        });
      } else if (outcome === "copied") {
        toast({
          title: "Message copied",
          description: "Paste it into a message. AI Matrx didn't send it.",
        });
      }
    } finally {
      setHandoffBusy(false);
    }
  }, [shareTarget, refresh, share, toast]);

  const handleCopyReviewedMessage = useCallback(async () => {
    if (!shareTarget) return;
    setHandoffBusy(true);
    try {
      const freshLinks = await refresh();
      if (!freshLinks) {
        toast({
          title: "Couldn't check this link",
          description:
            "The link list couldn't be refreshed. Try again before copying.",
          variant: "destructive",
        });
        return;
      }
      const currentLink = freshLinks.find((link) => link.id === shareTarget.id);
      if (!currentLink) {
        setShareTarget(null);
        toast({
          title: "This link is no longer available",
          description:
            "It may have been turned off. Choose an active link to continue.",
          variant: "destructive",
        });
        return;
      }
      const handoffReview = evaluateShareLinkHandoff(shareTarget, currentLink);
      if (handoffReview.status === "unavailable") {
        setShareTarget(null);
        toast({
          title: "This link can't be shared",
          description: handoffReview.reason,
          variant: "destructive",
        });
        return;
      }
      if (handoffReview.status === "changed") {
        setShareTarget(currentLink);
        toast({
          title: "Link access changed",
          description:
            "Review the updated access, expiry, and view count before copying.",
          variant: "destructive",
        });
        return;
      }
      const message = createSafeShareMessage(shareUrlForLink(currentLink));
      const outcome = await copyMessage(message, {
        title: "Copy message",
        description:
          "Copy the reviewed message below and paste it into your messaging app.",
      });
      setShareTarget(null);
      if (outcome === "copied") {
        toast({
          title: "Message copied",
          description: "Paste it into a message. AI Matrx didn't send it.",
        });
      }
    } finally {
      setHandoffBusy(false);
    }
  }, [shareTarget, refresh, copyMessage, toast]);

  // Non-owners have no link controls at all (the owner is the only grantor).
  if (!isOwner) return null;

  // NEVER vanish silently. When the type has no no-login link lane, the owner
  // must be told — otherwise the Public tab reads as "anyone with the link"
  // while offering no link anywhere on screen (the defect this replaced).
  if (!enabled) {
    return (
      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg border">
        <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium">
            No-login links aren&rsquo;t on for this item type
          </h3>
          <p className="text-xs text-muted-foreground">
            Share it with specific people or an organization instead — they open
            it signed in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Anyone with the link</h3>
            <p className="text-xs text-muted-foreground">
              Create a link that opens with no sign-in required
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={creating}
          className="flex-shrink-0"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span className="ml-1 hidden sm:inline">Create link</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
          Loading links…
        </div>
      ) : activeLinks.length === 0 && !shareError ? (
        <p className="text-xs text-muted-foreground py-1">
          No share links yet. Create one to share this with anyone.
        </p>
      ) : (
        <div className="space-y-1.5">
          {activeLinks.map((link) => {
            const unavailableReason = shareLinkUnavailableReason(link);
            return (
              <div
                key={link.id}
                className="flex items-center gap-1.5 rounded-md border bg-background p-1.5"
              >
                <Input
                  readOnly
                  value={shareUrlForLink(link)}
                  className="h-8 min-w-0 flex-1 text-xs font-mono"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <span
                  className="flex items-center gap-1 text-[10px] text-muted-foreground px-1"
                  title={`${link.useCount} view${link.useCount === 1 ? "" : "s"}`}
                >
                  <Eye className="w-3 h-3" />
                  {link.useCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 flex-shrink-0 sm:h-8 sm:w-8"
                  onClick={() => copyLink(link)}
                  disabled={!!unavailableReason}
                  title={unavailableReason ?? "Copy link"}
                  aria-label="Copy share link"
                >
                  {copiedId === link.id ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 flex-shrink-0 sm:h-8 sm:w-8"
                  onClick={() => prepareTextShare(link.id)}
                  disabled={!!unavailableReason || refreshing}
                  title={unavailableReason ?? "Review before sharing by text"}
                  aria-label="Share by text"
                >
                  {refreshing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MessageSquareText className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 flex-shrink-0 text-destructive sm:h-8 sm:w-8"
                  onClick={() => setRevokeTarget(link)}
                  title="Turn off link"
                  aria-label="Turn off share link"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {shareError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 text-xs text-destructive"
        >
          <span>{shareError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => refresh()}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      ) : null}

      {refreshing && !loading ? (
        <span className="sr-only" role="status">
          Checking current link access
        </span>
      ) : null}

      <ConfirmDialog
        open={shareTarget !== null}
        onOpenChange={(open) => !open && closeShareReview()}
        title="Review message before sharing"
        description="Anyone with this link can open it without signing in. AI Matrx will prepare the message; it won't send it."
        content={
          shareTarget ? (
            <div className="space-y-3 text-sm">
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Access</dt>
                  <dd className="text-right">
                    {describeShareLinkAccess(shareTarget.permissionLevel)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Expiry</dt>
                  <dd className="text-right">
                    {describeShareLinkExpiry(shareTarget.expiresAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Views</dt>
                  <dd className="text-right">
                    {shareTarget.maxUses === null
                      ? `${shareTarget.useCount} used · no limit`
                      : `${shareTarget.useCount} of ${shareTarget.maxUses} used`}
                  </dd>
                </div>
              </dl>
              <div className="space-y-1">
                <p className="text-xs font-medium">Message preview</p>
                <p className="rounded-md border bg-muted/30 p-3 break-words">
                  {createSafeShareMessage(shareUrlForLink(shareTarget))}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full sm:min-h-0"
                disabled={handoffBusy}
                onClick={handleCopyReviewedMessage}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy message
              </Button>
              <p className="text-xs text-muted-foreground">
                You can turn this link off from the share panel at any time.
              </p>
            </div>
          ) : null
        }
        confirmLabel={
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function"
            ? "Open share options"
            : "Copy message"
        }
        cancelLabel="Not now"
        contentClassName="w-[calc(100%-2rem)] sm:!max-w-[34rem]"
        busy={handoffBusy}
        onConfirm={handleNativeHandoff}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Turn off this link?"
        description="Anyone currently using it will lose access. This can't be undone."
        confirmLabel="Turn off link"
        variant="destructive"
        onConfirm={handleRevoke}
      />
      {fallbackDialog}
    </div>
  );
}
