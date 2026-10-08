"use client";

import React, { useState } from "react";
import { publishedToWebLabel } from "@/lib/row-access";
import {
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
import { Input } from "@ai-matrx/design-system/controls";
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
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  appletAdminKpis,
  appletRateLimitAgentPayload,
  appletRateLimitHuman,
  type AppletFieldDraft,
  type AppletRateLimitFormView,
} from "@/features/applets/format";
import type { AppletAdminView } from "@/lib/services/applets-admin-service";

export type AppletAdminActionPatch = {
  is_featured?: boolean;
  is_verified?: boolean;
  published_to_web?: boolean;
  status?: "draft" | "published" | "suspended";
  rate_limit_per_ip?: number;
  rate_limit_window_hours?: number;
  rate_limit_authenticated?: number;
};

interface AppletAdminActionsProps {
  app: AppletAdminView;
  onUpdate: (patch: AppletAdminActionPatch) => Promise<void>;
  onDelete?: () => Promise<void>;
  variant?: "inline" | "stacked";
  showRateLimits?: boolean;
}

export function AppletAdminActions({
  app,
  onUpdate,
  onDelete,
  variant = "inline",
  showRateLimits = false,
}: AppletAdminActionsProps) {
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
        published_to_web: !app.published_to_web,
      }),
    );

  const handleChangeStatus = (
    newStatus: "draft" | "published" | "suspended",
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

  // Live rate-limit state. While the editor is open these three inputs are a
  // draft layer over the saved row — copying `app.rate_limit_*` then would
  // hand the agent numbers the user has already typed over. Note the editor
  // pre-fills defaults (20/24/100) when the row stores null, so an untouched
  // open editor genuinely does carry pending changes; the diff says so.
  const buildRateLimitView = (): AppletRateLimitFormView => {
    const drafts: AppletFieldDraft[] = [
      {
        field: "rate_limit_per_ip",
        label: "Per IP",
        live: String(rlIp),
        saved: String(app.rate_limit_per_ip ?? ""),
      },
      {
        field: "rate_limit_window_hours",
        label: "Window (hrs)",
        live: String(rlWindow),
        saved: String(app.rate_limit_window_hours ?? ""),
      },
      {
        field: "rate_limit_authenticated",
        label: "Per User",
        live: String(rlAuth),
        saved: String(app.rate_limit_authenticated ?? ""),
      },
    ];
    return {
      app,
      editing: rlEditing,
      // Closed editor: the badges show the SAVED values, so report those.
      drafts: rlEditing
        ? drafts
        : drafts.map((draft) => ({ ...draft, live: draft.saved })),
      kpis: appletAdminKpis(app),
    };
  };

  const containerCls =
    variant === "stacked"
      ? "flex flex-col gap-2"
      : "flex flex-wrap items-center gap-2";

  return (
    <div className={containerCls}>
      <Button
        icon={busy === "featured" ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Star
            className={`w-3.5 h-3.5 mr-1 ${
              app.is_featured ? "fill-current" : ""
            }`}
          />
        )}
        variant={app.is_featured ? "primary" : "outline"}
        onClick={handleToggleFeatured}
        disabled={busy !== null}
      >
        {app.is_featured ? "Featured" : "Feature"}
      </Button>

      <Button
        icon={busy === "verified" ? (
          <Loader2 className="animate-spin" />
        ) : (
          <ShieldCheck />
        )}
        variant={app.is_verified ? "primary" : "outline"}
        onClick={handleToggleVerified}
        disabled={busy !== null}
      >
        {app.is_verified ? "Verified" : "Verify"}
      </Button>

      <Button
        icon={busy === "public" ? (
          <Loader2 className="animate-spin" />
        ) : app.published_to_web ? (
          <CheckCircle />
        ) : (
          <Ban />
        )}
        variant={app.published_to_web ? "primary" : "outline"}
        onClick={handleTogglePublic}
        disabled={busy !== null}
      >
        {publishedToWebLabel(app.published_to_web)}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button icon={<StatusIcon status={app.status} />} variant="outline" disabled={busy !== null}>
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
            <div className="flex items-center gap-1">
              <CopyButtons
                size="xs"
                label={`${app.name} rate limits`}
                human={() => appletRateLimitHuman(buildRateLimitView())}
                agent={() =>
                  appletRateLimitAgentPayload(buildRateLimitView())
                }
              />
              {!rlEditing && (
                <Button
                  variant="quiet"
                  onClick={() => setRlEditing(true)}
                >
                  Edit
                </Button>
              )}
            </div>
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
                />
              </div>
              <div className="col-span-3 flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="quiet"
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
                  variant="primary"
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
            icon={<Trash2 />}
            variant="danger"
            onClick={() => setConfirmDelete(true)}
            disabled={busy !== null}
          >
            Move to Trash
          </Button>

          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move Applet to Trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  &quot;{app.name}&quot; stops being available to run. Its
                  execution and error records are kept, and you can restore it
                  from Trash at any time.
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
                  {busy === "delete" ? "Moving..." : "Move to Trash"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <AlertDialog open={confirmSuspend} onOpenChange={setConfirmSuspend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend Applet?</AlertDialogTitle>
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
    case "suspended":
      return <Ban className={className} />;
    default:
      return <Clock className={className} />;
  }
}
