"use client";

/**
 * /settings/sandbox-storage
 *
 * User-facing controls for per-user sandbox persistence (Phase 1+2+3 of the
 * persistence plan). Shows the known size and sandbox counts for each tier.
 * Only the hosted per-user Docker volume has a supported user-level wipe.
 *
 * The orchestrator refuses to delete a volume while any sandbox remains
 * attached. We surface that refusal rather than inferring attachment state
 * from the active-sandbox count.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Database,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@ai-matrx/kit/format";
import { useUserPersistence } from "@/hooks/sandbox/use-user-persistence";
import type { SandboxTier, UserPersistenceInfo } from "@/types/sandbox";

const TIER_DESCRIPTIONS: Record<SandboxTier, string> = {
  ec2: "Each EC2 sandbox keeps its own retained home directory. Manage that sandbox individually.",
  hosted:
    "Per-user Docker volume mounted at /home/agent — survives container destroy, follows you across hosted-tier sandboxes.",
};

const TIER_LABELS: Record<SandboxTier, string> = {
  ec2: "EC2 (retained homes)",
  hosted: "Hosted (volume)",
};

export default function SandboxStoragePage() {
  const persistence = useUserPersistence();
  const [pendingDelete, setPendingDelete] = useState<"hosted" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const tierEntries = useMemo<UserPersistenceInfo[]>(() => {
    const seen = new Set<string>();
    const entries = persistence.info?.tiers ?? [];
    return entries.filter((e) => {
      if (seen.has(e.tier)) return false;
      seen.add(e.tier);
      return true;
    });
  }, [persistence.info]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await persistence.deleteVolume(pendingDelete);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error ?? "Delete failed");
      return;
    }
    setPendingDelete(null);
  };

  return (
    <div className="@container/sandbox-storage space-y-4">
      <div className="flex flex-col items-start gap-3 @[32rem]/sandbox-storage:flex-row @[32rem]/sandbox-storage:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Sandbox Storage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Persistent per-user storage for your Matrx sandboxes. Anything you
            save under <code className="font-mono">/home/agent</code> is
            preserved here and re-mounted on every new sandbox you create on the
            same tier.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-w-max shrink-0"
          onClick={() => void persistence.refresh()}
          disabled={persistence.loading}
        >
          {persistence.loading ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {persistence.error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Couldn&apos;t load every tier</div>
            <div className="text-xs mt-0.5 opacity-80">{persistence.error}</div>
          </div>
        </div>
      )}

      {persistence.info?.partial && !persistence.error && (
        <div className="text-xs text-muted-foreground">
          Storage totals are incomplete because one or more tiers are
          unavailable or have not reported a byte count.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4" />
            Total across all tiers
          </CardTitle>
          <CardDescription>
            {persistence.loading ? (
              <SuspenseLoader
                centered={false}
                size="xs"
                message="Loading sandbox storage totals…"
              />
            ) : persistence.info?.partial ? (
              "Storage total unavailable until every tier reports a byte count."
            ) : (
              `${formatFileSize(persistence.info?.total_size_bytes ?? 0)} stored across ${tierEntries.length} tier${tierEntries.length === 1 ? "" : "s"}.`
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {persistence.loading && tierEntries.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            <SuspenseLoader
              centered={false}
              message="Checking sandbox storage across available services…"
            />
          </CardContent>
        </Card>
      ) : tierEntries.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No persistent volumes found yet. Create a sandbox under{" "}
            <Link href="/sandbox" className="underline">
              /sandbox
            </Link>{" "}
            and your home directory will start being preserved automatically.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tierEntries.map((tier) => (
            <Card key={tier.tier}>
              <CardHeader>
                <div className="flex flex-col items-start gap-3 @[32rem]/sandbox-storage:flex-row @[32rem]/sandbox-storage:justify-between">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {TIER_LABELS[tier.tier]}
                      {(tier.active_sandbox_count ?? 0) > 0 && (
                        <Badge variant="secondary">
                          {tier.active_sandbox_count} active sandbox
                          {tier.active_sandbox_count === 1 ? "" : "es"}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {TIER_DESCRIPTIONS[tier.tier]}
                    </CardDescription>
                  </div>
                  {tier.tier === "hosted" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-w-max shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete("hosted")}
                      disabled={
                        tier.status !== "available" || !tier.volume_name
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Wipe hosted volume
                    </Button>
                  ) : (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="min-w-max shrink-0"
                    >
                      <Link href="/sandbox">Manage sandboxes</Link>
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Size</dt>
                    <dd className="font-medium">
                      {typeof tier.current_size_bytes === "number"
                        ? formatFileSize(tier.current_size_bytes)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Active sandboxes
                    </dt>
                    <dd className="font-medium">
                      {tier.active_sandbox_count ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Total sandboxes
                    </dt>
                    <dd className="font-medium">{tier.sandbox_count ?? "—"}</dd>
                  </div>
                  {tier.volume_name && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        Volume name
                      </dt>
                      <dd className="font-mono text-xs truncate">
                        {tier.volume_name}
                      </dd>
                    </div>
                  )}
                  {tier.s3_prefix && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        S3 prefix
                      </dt>
                      <dd className="font-mono text-xs truncate">
                        {tier.s3_prefix}
                      </dd>
                    </div>
                  )}
                  {tier.last_synced_at && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        Last sync
                      </dt>
                      <dd className="text-xs">
                        {new Date(tier.last_synced_at).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
                {tier.status !== "available" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {tier.error ?? "This storage tier could not be read."}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingDelete
                ? `Delete ${TIER_LABELS[pendingDelete]} storage?`
                : "Delete persistent storage?"}
            </DialogTitle>
            <DialogDescription>
              This permanently deletes everything in your{" "}
              <code className="font-mono">/home/agent</code> volume on the
              hosted volume. Anything you didn&apos;t push to a git remote is
              gone for good. The orchestrator will refuse while any sandbox is
              still attached to this volume; remove those sandboxes from{" "}
              <Link href="/sandbox" className="underline">
                /sandbox
              </Link>{" "}
              first.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
