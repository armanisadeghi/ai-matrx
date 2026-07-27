"use client";

/**
 * /settings/sandbox-storage
 *
 * User-facing controls for per-user sandbox persistence (Phase 1+2+3 of the
 * persistence plan). Shows the size of the user's `/home/agent` volume on
 * each tier, how many sandboxes are currently mounting it, and a "Wipe
 * persistent storage" button that fans out to the orchestrator's
 * `DELETE /users/{user_id}/volume` endpoint.
 *
 * The orchestrator refuses to delete a volume that's still mounted by a
 * running sandbox. We surface that error (rather than fighting it) and
 * point the user at the active-sandbox list so they can stop it first.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Database,
  Loader2,
  RefreshCw,
  ShieldAlert,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatPersistenceSize,
  useUserPersistence,
} from "@/hooks/sandbox/use-user-persistence";
import type { SandboxTier, UserPersistenceInfo } from "@/types/sandbox";

const TIER_DESCRIPTIONS: Record<SandboxTier, string> = {
  ec2: "Backed by S3 — your home directory is restored on every new EC2 sandbox you create.",
  hosted:
    "Per-user Docker volume mounted at /home/agent — survives container destroy, follows you across hosted-tier sandboxes.",
};

const TIER_LABELS: Record<SandboxTier, string> = {
  ec2: "EC2 (S3-backed)",
  hosted: "Hosted (volume)",
};

export default function SandboxStoragePage() {
  const persistence = useUserPersistence();
  const [pendingDelete, setPendingDelete] = useState<
    SandboxTier | "all" | null
  >(null);
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

  const hasAnyData =
    tierEntries.some((t) => (t.current_size_bytes ?? 0) > 0) ||
    (persistence.info?.total_size_bytes ?? 0) > 0;

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await persistence.deleteVolume(
      pendingDelete === "all" ? undefined : pendingDelete,
    );
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error ?? "Delete failed");
      return;
    }
    setPendingDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
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
          One or more tiers didn&apos;t respond — totals shown below may be
          incomplete.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4" />
            Total across all tiers
          </CardTitle>
          <CardDescription>
            {persistence.loading
              ? "Loading…"
              : `${formatPersistenceSize(persistence.info?.total_size_bytes ?? 0)} stored across ${tierEntries.length} tier${tierEntries.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
      </Card>

      {persistence.loading && tierEntries.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
            Querying orchestrators…
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
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {TIER_LABELS[tier.tier]}
                      {(tier.in_use || (tier.sandbox_count ?? 0) > 0) && (
                        <Badge variant="secondary">
                          {tier.sandbox_count ?? 1} active sandbox
                          {(tier.sandbox_count ?? 1) === 1 ? "" : "es"}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {TIER_DESCRIPTIONS[tier.tier]}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(tier.tier)}
                    disabled={(tier.current_size_bytes ?? 0) === 0}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Wipe
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Size</dt>
                    <dd className="font-medium">
                      {formatPersistenceSize(tier.current_size_bytes)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Active sandboxes
                    </dt>
                    <dd className="font-medium">{tier.sandbox_count ?? 0}</dd>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasAnyData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              Wipe everything
            </CardTitle>
            <CardDescription>
              Deletes the persistent volume on every tier. Anything not pushed
              to git is gone for good. Active sandboxes must be stopped first —
              the orchestrator will refuse otherwise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setPendingDelete("all")}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete all persistent storage
            </Button>
          </CardContent>
        </Card>
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
              {pendingDelete === "all"
                ? "Delete all persistent storage?"
                : pendingDelete
                  ? `Delete ${TIER_LABELS[pendingDelete]} storage?`
                  : "Delete persistent storage?"}
            </DialogTitle>
            <DialogDescription>
              This permanently deletes everything in your{" "}
              <code className="font-mono">/home/agent</code> volume on the
              selected tier. Anything you didn&apos;t push to a git remote is
              gone for good. The orchestrator will refuse if a sandbox is still
              mounted — stop it from{" "}
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
