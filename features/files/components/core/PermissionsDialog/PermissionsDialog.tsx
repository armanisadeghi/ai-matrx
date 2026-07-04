/**
 * features/files/components/core/PermissionsDialog/PermissionsDialog.tsx
 *
 * Manage explicit permissions on a file or folder. Lists current grantees
 * with their levels, allows adding a new grantee, and revoking existing ones.
 *
 * Desktop-only. Mobile surfaces wrap `PermissionsDialogBody` in a Drawer.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, Trash2, UserPlus } from "lucide-react";
import { extractErrorMessage } from "@/utils/errors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectPermissionsForResource } from "@/features/files/redux/selectors";
import {
  grantPermission,
  loadPermissions,
  revokePermission,
} from "@/features/files/redux/thunks";
import { formatAbsoluteDate } from "@/features/files/utils/format";
import type {
  GranteeType,
  PermissionLevel,
  ResourceType,
} from "@/features/files/types";

export interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  resourceType: ResourceType;
}

export function PermissionsDialog({
  open,
  onOpenChange,
  resourceId,
  resourceType,
}: PermissionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Permissions</DialogTitle>
          <DialogDescription>
            Who has access to this {resourceType}.
          </DialogDescription>
        </DialogHeader>
        <PermissionsDialogBody
          resourceId={resourceId}
          resourceType={resourceType}
        />
        <DialogFooter>
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
// Body
// ---------------------------------------------------------------------------

interface PermissionsDialogBodyProps {
  resourceId: string;
  resourceType: ResourceType;
}

export function PermissionsDialogBody({
  resourceId,
  resourceType,
}: PermissionsDialogBodyProps) {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((s) =>
    selectPermissionsForResource(s, resourceId),
  );

  const [granteeId, setGranteeId] = useState("");
  const [granteeType, setGranteeType] = useState<GranteeType>("user");
  const [level, setLevel] = useState<PermissionLevel>("read");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(loadPermissions({ resourceId }));
  }, [dispatch, resourceId]);

  const handleGrant = useCallback(async () => {
    if (!granteeId.trim()) {
      setError("Enter a user or group id.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await dispatch(
        grantPermission({
          resourceId,
          resourceType,
          granteeId: granteeId.trim(),
          granteeType,
          level,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      ).unwrap();
      setGranteeId("");
      setExpiresAt("");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    dispatch,
    resourceId,
    resourceType,
    granteeId,
    granteeType,
    level,
    expiresAt,
  ]);

  const handleRevoke = useCallback(
    async (grantee: string, type: GranteeType) => {
      await dispatch(
        revokePermission({
          resourceId,
          resourceType,
          granteeId: grantee,
          granteeType: type,
        }),
      ).unwrap();
    },
    [dispatch, resourceId, resourceType],
  );

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Add */}
      <div className="rounded-md border p-3 space-y-3 bg-muted/20">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserPlus className="h-4 w-4" />
          Add people or groups
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-muted-foreground">User or group id</span>
            <input
              type="text"
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              placeholder="uuid…"
              className="rounded-md border bg-background px-2 py-1 text-sm"
              style={{ fontSize: "16px" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Type</span>
            <select
              value={granteeType}
              onChange={(e) => setGranteeType(e.target.value as GranteeType)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value="user">User</option>
              <option value="group">Group</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Level</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as PermissionLevel)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-muted-foreground">Expires (optional)</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </label>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <button
          type="button"
          onClick={handleGrant}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Grant access
        </button>
      </div>

      {/* List */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current access
        </h3>
        {!permissions?.length ? (
          <p className="text-sm text-muted-foreground py-2">
            Only the owner has explicit access.
          </p>
        ) : (
          <ul className="space-y-2">
            {permissions.map((perm) => {
              const isPublic = perm.granteeType === "public";
              return (
                <li
                  key={perm.id}
                  className="flex items-center gap-2 rounded-md border p-2"
                >
                  <div className="flex-1 min-w-0">
                    {isPublic ? (
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        Anyone with access
                      </div>
                    ) : (
                      <div className="text-xs font-mono truncate">
                        {perm.granteeId}
                      </div>
                    )}
                    <div className="mt-0.5 text-[10px] text-muted-foreground space-x-2">
                      <span className="uppercase">
                        {isPublic ? "public" : perm.granteeType}
                      </span>
                      <span>· {perm.permissionLevel}</span>
                      {perm.expiresAt ? (
                        <span>
                          · Expires {formatAbsoluteDate(perm.expiresAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {isPublic ? (
                    // Public access is toggled on the resource's visibility
                    // (Share dialog), not revoked by grantee id here. Surface
                    // it read-only rather than offering a broken revoke.
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      Toggle in Share
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void handleRevoke(perm.granteeId, perm.granteeType)
                      }
                      aria-label="Revoke"
                      className="flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
