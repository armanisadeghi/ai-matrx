"use client";

import React, { useState } from "react";
import {
  isPubliclyVisible,
  visibilityLabelShort,
} from "@/lib/visibility/labels";
import {
  Archive,
  Ban,
  CheckCircle,
  Clock,
  Loader2,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AgentAppAdminView } from "@/lib/services/agent-apps-admin-service";

export type AgentAppAdminActionPatch = {
  is_featured?: boolean;
  is_verified?: boolean;
  visibility?: string;
  status?: "draft" | "published" | "archived" | "suspended";
  rate_limit_per_ip?: number;
  rate_limit_window_hours?: number;
  rate_limit_authenticated?: number;
};

interface AgentAppAdminActionsProps {
  app: AgentAppAdminView;
  onUpdate: (patch: AgentAppAdminActionPatch) => Promise<void>;
  onDelete?: () => Promise<void>;
  variant?: "inline" | "stacked";
  showRateLimits?: boolean;
}

export function AgentAppAdminActions({
  app,
  onUpdate,
  onDelete,
  variant = "inline",
  showRateLimits = false,
}: AgentAppAdminActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [rlEditing, setRlEditing] = useState(false);
  const [rlIp, setRlIp] = useState(app.rate_limit_per_ip ?? 20);
  const [rlWindow, setRlWindow] = useState(app.rate_limit_window_hours ?? 24);
  const [rlAuth, setRlAuth] = useState(app.rate_limit_authenticated ?? 100);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const handleToggleFeatured = () =>
    withBusy("featured", () => onUpdate({ is_featured: !app.is_featured }));

  const handleToggleVerified = () =>
    withBusy("verified", () => onUpdate({ is_verified: !app.is_verified }));

  const handleTogglePublic = () =>
    withBusy("public", () =>
      onUpdate({
        visibility: isPubliclyVisible(app.visibility) ? "internal" : "public",
      }),
    );

  const handleChangeStatus = (
    newStatus: "draft" | "published" | "archived" | "suspended",
  ) => withBusy(`status:${newStatus}`, () => onUpdate({ status: newStatus }));

  const handleSaveRateLimits = () =>
    withBusy("rate-limits", async () => {
      await onUpdate({
        rate_limit_per_ip: Number(rlIp) || 0,
        rate_limit_window_hours: Number(rlWindow) || 0,
        rate_limit_authenticated: Number(rlAuth) || 0,
      });
      setRlEditing(false);
    });

  const handleDelete = async () => {
    if (!onDelete) return;
    setBusy("delete");
    try {
      await onDelete();
      setConfirmDelete(false);
    } finally {
      setBusy(null);
    }
  };

  const handleSuspend = async () => {
    setConfirmSuspend(false);
    await handleChangeStatus("suspended");
  };

  const containerCls =
    variant === "stacked"
      ? "flex flex-col gap-2"
      : "flex flex-wrap items-center gap-2";

  return (
    <div className={containerCls}>
      <Button
        variant={app.is_featured ? "default" : "outline"}
        size="sm"
        onClick={handleToggleFeatured}
        disabled={busy !== null}
      >
        {busy === "featured" ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <Star
            className={`w-3.5 h-3.5 mr-1 ${
              app.is_featured ? "fill-current" : ""
            }`}
          />
        )}
        {app.is_featured ? "Featured" : "Feature"}
      </Button>

      <Button
        variant={app.is_verified ? "default" : "outline"}
        size="sm"
        onClick={handleToggleVerified}
        disabled={busy !== null}
      >
        {busy === "verified" ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
        )}
        {app.is_verified ? "Verified" : "Verify"}
      </Button>

      <Button
        variant={isPubliclyVisible(app.visibility) ? "default" : "outline"}
        size="sm"
        onClick={handleTogglePublic}
        disabled={busy !== null}
      >
        {busy === "public" ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : isPubliclyVisible(app.visibility) ? (
          <CheckCircle className="w-3.5 h-3.5 mr-1" />
        ) : (
          <Ban className="w-3.5 h-3.5 mr-1" />
        )}
        {visibilityLabelShort(app.visibility)}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy !== null}>
            <StatusIcon status={app.status} className="w-3.5 h-3.5 mr-1" />
            {app.status}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            checked={app.status === "draft"}
            onCheckedChange={() => handleChangeStatus("draft")}
          >
            Draft
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={app.status === "published"}
            onCheckedChange={() => handleChangeStatus("published")}
          >
            Published
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={app.status === "archived"}
            onCheckedChange={() => handleChangeStatus("archived")}
          >
            Archived
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={app.status === "suspended"}
            onCheckedChange={() => setConfirmSuspend(true)}
          >
            Suspended
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showRateLimits && (
        <div className="w-full mt-2 border border-border rounded-md p-3 bg-card space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              Rate Limit Overrides
            </Label>
            {!rlEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRlEditing(true)}
                className="h-6 text-xs"
              >
                Edit
              </Button>
            )}
          </div>
          {rlEditing ? (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="rl-ip" className="text-[11px]">
                  Per IP
                </Label>
                <Input
                  id="rl-ip"
                  type="number"
                  min={0}
                  value={rlIp}
                  onChange={(e) => setRlIp(Number(e.target.value))}
                  className="h-8 text-[16px]"
                />
              </div>
              <div>
                <Label htmlFor="rl-window" className="text-[11px]">
                  Window (hrs)
                </Label>
                <Input
                  id="rl-window"
                  type="number"
                  min={0}
                  value={rlWindow}
                  onChange={(e) => setRlWindow(Number(e.target.value))}
                  className="h-8 text-[16px]"
                />
              </div>
              <div>
                <Label htmlFor="rl-auth" className="text-[11px]">
                  Per User
                </Label>
                <Input
                  id="rl-auth"
                  type="number"
                  min={0}
                  value={rlAuth}
                  onChange={(e) => setRlAuth(Number(e.target.value))}
                  className="h-8 text-[16px]"
                />
              </div>
              <div className="col-span-3 flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRlEditing(false);
                    setRlIp(app.rate_limit_per_ip ?? 20);
                    setRlWindow(app.rate_limit_window_hours ?? 24);
                    setRlAuth(app.rate_limit_authenticated ?? 100);
                  }}
                  disabled={busy === "rate-limits"}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveRateLimits}
                  disabled={busy === "rate-limits"}
                >
                  {busy === "rate-limits" ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save overrides"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">IP: {app.rate_limit_per_ip ?? "-"}</Badge>
              <Badge variant="outline">
                Window: {app.rate_limit_window_hours ?? "-"}h
              </Badge>
              <Badge variant="outline">
                User: {app.rate_limit_authenticated ?? "-"}
              </Badge>
            </div>
          )}
        </div>
      )}

      {onDelete && (
        <>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={busy !== null}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Delete
          </Button>

          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete agent app?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes &quot;{app.name}&quot; and every
                  associated execution and error record. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy === "delete"}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={busy === "delete"}
                >
                  {busy === "delete" ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <AlertDialog open={confirmSuspend} onOpenChange={setConfirmSuspend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend agent app?</AlertDialogTitle>
            <AlertDialogDescription>
              Suspending takes &quot;{app.name}&quot; offline. Public users will
              see the app as unavailable. You can restore the app later by
              changing its status back to published.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusIcon({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  switch (status) {
    case "published":
      return <CheckCircle className={className} />;
    case "archived":
      return <Archive className={className} />;
    case "suspended":
      return <Ban className={className} />;
    default:
      return <Clock className={className} />;
  }
}
