"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { syncManifests } from "@/features/surfaces/services/surfaces.service";

type SyncResult = Awaited<ReturnType<typeof syncManifests>>;

interface Props {
  onClose: () => void;
  onSynced: () => void;
}

export function ManifestSyncDialog({ onClose, onSynced }: Props) {
  const [deleteStale, setDeleteStale] = useState(true);
  const [createMissingSurfaces, setCreateMissingSurfaces] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await syncManifests({ deleteStale, createMissingSurfaces });
      setResult(res);
      const changeCount =
        res.upserted.length +
        res.deleted.length +
        res.roleUpserted.length +
        res.roleDeleted.length;
      if (changeCount === 0) {
        toast.success("Already in sync — no changes applied.");
      } else {
        toast.success(
          `Sync applied: ${res.upserted.length + res.roleUpserted.length} upserted, ${res.deleted.length + res.roleDeleted.length} deleted`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sync manifests to database</DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">
              Applies the code-side{" "}
              <code className="font-mono">SurfaceManifest</code> declarations to
              the <code className="font-mono">ui_surface_value</code> and{" "}
              <code className="font-mono">ui_surface_agent_role</code> tables.
              Rows are upserted to match code exactly; nothing else changes.
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={deleteStale}
                onCheckedChange={(v) => setDeleteStale(v === true)}
                disabled={busy}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">Delete stale rows</div>
                <p className="text-[11px] text-muted-foreground">
                  Remove DB <code className="font-mono">ui_surface_value</code>{" "}
                  and <code className="font-mono">ui_surface_agent_role</code>{" "}
                  rows no longer declared in any registered manifest. Deleting
                  a role also sweeps its{" "}
                  <code className="font-mono">ui_surface_agent_pref</code> rows
                  (FK cascade); the count is reported below.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={createMissingSurfaces}
                onCheckedChange={(v) => setCreateMissingSurfaces(v === true)}
                disabled={busy}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">Create missing surfaces</div>
                <p className="text-[11px] text-muted-foreground">
                  If a manifest references a{" "}
                  <code className="font-mono">surface_name</code> that
                  doesn&apos;t exist in{" "}
                  <code className="font-mono">ui_surface</code>, create it
                  (client must already exist).
                </p>
              </div>
            </label>
          </div>
        )}

        {result && (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">Sync complete</span>
            </div>
            <div className="rounded-md border border-border p-2 grid grid-cols-2 gap-1 text-[11px]">
              <span className="text-muted-foreground">Values upserted:</span>
              <span className="tabular-nums font-mono">
                {result.upserted.length}
              </span>
              <span className="text-muted-foreground">Values deleted:</span>
              <span className="tabular-nums font-mono">
                {result.deleted.length}
              </span>
              <span className="text-muted-foreground">Roles upserted:</span>
              <span className="tabular-nums font-mono">
                {result.roleUpserted.length}
              </span>
              <span className="text-muted-foreground">Roles deleted:</span>
              <span className="tabular-nums font-mono">
                {result.roleDeleted.length}
              </span>
              <span className="text-muted-foreground">
                Agent prefs swept:
              </span>
              <span className="tabular-nums font-mono">
                {result.sweptPrefCount}
              </span>
              <span className="text-muted-foreground">Surfaces skipped:</span>
              <span className="tabular-nums font-mono">
                {result.skippedMissingSurface.length}
              </span>
              <span className="text-muted-foreground">Remaining drift:</span>
              <span className="tabular-nums font-mono">
                {result.driftAfter.manifestsMissingInDb.length +
                  result.driftAfter.dbValuesNotInManifest.length +
                  result.driftAfter.diffs.length +
                  result.driftAfter.roleManifestsMissingInDb.length +
                  result.driftAfter.dbRolesNotInManifest.length +
                  result.driftAfter.roleDiffs.length +
                  result.driftAfter.unknownNamespaces.length +
                  result.driftAfter.brokenAgentMappings.length}
              </span>
            </div>
            {result.skippedMissingSurface.length > 0 && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-2 text-[11px]">
                <div className="flex items-center gap-1 mb-1 font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Skipped surfaces (not in{" "}
                  <code className="font-mono">ui_surface</code>)
                </div>
                <div className="flex flex-wrap gap-1">
                  {result.skippedMissingSurface.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Enable &ldquo;Create missing surfaces&rdquo; or create them
                  manually.
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void run()} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Apply sync"
                )}
              </Button>
            </>
          ) : (
            <Button onClick={onSynced}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
