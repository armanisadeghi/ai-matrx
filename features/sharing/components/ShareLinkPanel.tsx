"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Check, Trash2, Loader2, Plus, Eye } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import type { ResourceType } from "@/utils/permissions/types";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  shareLinkUrl,
  type ShareLink,
} from "@/utils/permissions/shareLinks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ShareLinkPanelProps {
  resourceType: ResourceType;
  resourceId: string;
  isOwner: boolean;
  /** Whether this resource type offers no-login links (admin policy). Hidden when false. */
  enabled?: boolean;
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
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ShareLink | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLinks(await listShareLinks(resourceType, resourceId));
    setLoading(false);
  }, [resourceType, resourceId]);

  useEffect(() => {
    if (isOwner) refresh();
    else setLoading(false);
  }, [isOwner, refresh]);

  const activeLinks = links.filter((l) => l.isActive);

  const copy = useCallback(
    async (token: string, id: string) => {
      try {
        await navigator.clipboard.writeText(shareLinkUrl(token));
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
        toast({
          title: "Link copied",
          description: "Anyone with it can view — no sign-in needed.",
        });
      } catch {
        toast({ title: "Couldn't copy", variant: "destructive" });
      }
    },
    [toast],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const result = await createShareLink({ resourceType, resourceId });
    setCreating(false);
    if (result.success && result.token) {
      await refresh();
      await copy(result.token, "new");
    } else {
      toast({
        title: "Couldn't create link",
        description: result.error ?? "Please try again",
        variant: "destructive",
      });
    }
  }, [resourceType, resourceId, refresh, copy, toast]);

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

  if (!isOwner || !enabled) return null;

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

      {loading ? (
        <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
          Loading links…
        </div>
      ) : activeLinks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No share links yet. Create one to share this with anyone.
        </p>
      ) : (
        <div className="space-y-1.5">
          {activeLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-1.5 rounded-md border bg-background p-1.5"
            >
              <Input
                readOnly
                value={shareLinkUrl(link.token)}
                className="h-8 flex-1 text-xs font-mono"
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
                className="h-8 w-8 flex-shrink-0"
                onClick={() => copy(link.token, link.id)}
                title="Copy link"
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
                className="h-8 w-8 flex-shrink-0 text-destructive"
                onClick={() => setRevokeTarget(link)}
                title="Turn off link"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Turn off this link?"
        description="Anyone currently using it will lose access. This can't be undone."
        confirmLabel="Turn off link"
        variant="destructive"
        onConfirm={handleRevoke}
      />
    </div>
  );
}
