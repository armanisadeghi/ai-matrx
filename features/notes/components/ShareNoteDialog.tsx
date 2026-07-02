// features/notes/components/ShareNoteDialog.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Copy,
  Check,
  Globe,
  Lock,
  UserPlus,
  Building2,
  Loader2,
} from "lucide-react";
import {
  shareWithUser,
  shareWithOrg,
  makePublic,
  makePrivate,
  getResourceVisibility,
  listPermissions,
  revokeUserAccess,
} from "@/utils/permissions/service";
import type {
  PermissionLevel,
  PermissionWithDetails,
} from "@/utils/permissions/types";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";

interface ShareNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  noteLabel: string;
}

export function ShareNoteDialog({
  open,
  onOpenChange,
  noteId,
  noteLabel,
}: ShareNoteDialogProps) {
  const orgId = useAppSelector(selectOrganizationId);
  const orgName = useAppSelector(selectOrganizationName);

  const [isPublic, setIsPublic] = useState(false);
  const [email, setEmail] = useState("");
  const [permLevel, setPermLevel] = useState<PermissionLevel>("viewer");
  const [grants, setGrants] = useState<PermissionWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Load current visibility + permissions when dialog opens
  useEffect(() => {
    if (!open) return;
    setMessage("");
    getResourceVisibility("note", noteId).then((v) => setIsPublic(v.isPublic));
    listPermissions("note", noteId).then((perms) => setGrants(perms));
  }, [open, noteId]);

  const handleTogglePublic = useCallback(async () => {
    setLoading(true);
    if (isPublic) {
      const result = await makePrivate("note", noteId);
      if (result.success) setIsPublic(false);
      setMessage(result.success ? "Made private" : result.error || "Failed");
    } else {
      const result = await makePublic({
        resourceType: "note",
        resourceId: noteId,
      });
      if (result.success) setIsPublic(true);
      setMessage(result.success ? "Made public" : result.error || "Failed");
    }
    setLoading(false);
  }, [isPublic, noteId]);

  const handleShareWithOrg = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const result = await shareWithOrg({
      resourceType: "note",
      resourceId: noteId,
      organizationId: orgId,
      permissionLevel: "viewer",
    });
    setMessage(
      result.success
        ? `Shared with ${orgName || "organization"}`
        : result.error || "Failed",
    );
    setGrants(await listPermissions("note", noteId));
    setLoading(false);
  }, [noteId, orgId, orgName]);

  const handleShareWithUser = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    // The permissions RPC expects a user ID, not email.
    // For now, show a message that user ID is needed.
    // In production, this would resolve email -> user ID via a lookup.
    setMessage("Enter a user ID to share. Email lookup coming soon.");
    setLoading(false);
  }, [email]);

  const handleRevoke = useCallback(
    async (userId: string) => {
      setLoading(true);
      await revokeUserAccess("note", noteId, userId);
      setGrants(await listPermissions("note", noteId));
      setMessage("Access revoked");
      setLoading(false);
    },
    [noteId],
  );

  const handleCopyLink = useCallback(async () => {
    const link = `${window.location.origin}/notes/share/${noteId}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [noteId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{noteLabel}&rdquo;</DialogTitle>
          <DialogDescription>
            Control who can access this note.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Public toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              {isPublic ? (
                <Globe className="h-4 w-4 text-green-500" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {isPublic ? "Public" : "Private"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isPublic
                    ? "Anyone with the link can view"
                    : "Only you and people you share with"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTogglePublic}
              disabled={loading}
            >
              {isPublic ? "Make Private" : "Make Public"}
            </Button>
          </div>

          {/* Share with organization */}
          {orgId && (
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={handleShareWithOrg}
              disabled={loading}
            >
              <Building2 className="h-4 w-4" />
              Share with {orgName || "organization"}
            </Button>
          )}

          {/* Share link */}
          <div className="grid gap-2">
            <Label>Share Link</Label>
            <div className="flex gap-2">
              <Input
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/notes/share/${noteId}`}
                readOnly
                className="flex-1 text-xs"
              />
              <Button variant="outline" size="icon" onClick={handleCopyLink}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Current grants */}
          {grants.length > 0 && (
            <div className="grid gap-2">
              <Label>People with access</Label>
              <div className="space-y-1">
                {grants.map((g) => {
                  const grantedToUserId = g.grantedToUserId;
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between p-2 rounded border border-border/50 text-xs"
                    >
                      <span className="truncate">
                        {grantedToUserId
                          ? `User: ${grantedToUserId.slice(0, 8)}...`
                          : `Org: ${g.grantedToOrganizationId?.slice(0, 8)}...`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {g.permissionLevel}
                        </span>
                        {grantedToUserId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-destructive"
                            onClick={() => handleRevoke(grantedToUserId)}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status message */}
          {message && (
            <p className="text-xs text-muted-foreground">{message}</p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
