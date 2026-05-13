"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getDriftReport,
  listSurfaceValues,
  remediateBrokenMapping,
} from "@/features/tool-registry/surfaces/services/surfaces.service";
import type {
  SurfaceDriftReport,
  SurfaceValue,
  SurfaceValueDrift,
  BrokenMapping,
} from "@/features/tool-registry/surfaces/types";

interface Props {
  onClose: () => void;
  onSyncClick: () => void;
}

export function ManifestDriftDialog({ onClose, onSyncClick }: Props) {
  const [report, setReport] = useState<SurfaceDriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getDriftReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load drift report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const totalIssues = report
    ? report.manifestsMissingInDb.length +
      report.dbValuesNotInManifest.length +
      report.diffs.length +
      report.brokenAgentMappings.length +
      report.brokenToolMappings.length
    : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Surface manifest drift report
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {loading && (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Computing drift…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {!loading && report && totalIssues === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <p className="text-sm font-medium">Everything is in sync</p>
              <p className="text-xs text-muted-foreground">
                No drift detected between code manifests and the database.
              </p>
            </div>
          )}

          {!loading && report && totalIssues > 0 && (
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 pr-2">
                <Section
                  title="Manifest values missing from DB"
                  count={report.manifestsMissingInDb.length}
                  tone="amber"
                  description="Declared in code but not yet upserted. Sync to apply."
                >
                  {report.manifestsMissingInDb.map((d) => (
                    <DriftRow
                      key={`m-${d.surfaceName}-${d.valueName}`}
                      drift={d}
                    />
                  ))}
                </Section>

                <Section
                  title="DB values without a code manifest"
                  count={report.dbValuesNotInManifest.length}
                  tone="rose"
                  description="Stale rows. Sync with “Delete stale rows” to clean up."
                >
                  {report.dbValuesNotInManifest.map((d) => (
                    <DriftRow
                      key={`d-${d.surfaceName}-${d.valueName}`}
                      drift={d}
                    />
                  ))}
                </Section>

                <Section
                  title="Field-level diffs"
                  count={report.diffs.length}
                  tone="orange"
                  description="Same name on both sides but fields differ. Sync to make DB match code."
                >
                  {report.diffs.map((d) => (
                    <DriftRow
                      key={`diff-${d.surfaceName}-${d.valueName}`}
                      drift={d}
                      showDiff
                    />
                  ))}
                </Section>

                <Section
                  title="Broken agent mappings"
                  count={report.brokenAgentMappings.length}
                  tone="rose"
                  description="Agent bindings reference SurfaceValues that no longer exist. Remap to a valid value, remove, or keep & notify."
                >
                  {report.brokenAgentMappings.map((b) => (
                    <BrokenRow
                      key={`ag-${b.bindingId}-${b.mappingKey}`}
                      broken={b}
                      onResolved={() => void load()}
                    />
                  ))}
                </Section>

                <Section
                  title="Broken tool mappings"
                  count={report.brokenToolMappings.length}
                  tone="rose"
                  description="Tool bindings reference SurfaceValues that no longer exist. Remap, remove, or notify."
                >
                  {report.brokenToolMappings.map((b) => (
                    <BrokenRow
                      key={`tl-${b.bindingId}-${b.mappingKey}`}
                      broken={b}
                      onResolved={() => void load()}
                    />
                  ))}
                </Section>
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {totalIssues > 0 && (
              <span>
                {totalIssues} issue{totalIssues === 1 ? "" : "s"} found
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="h-7 gap-1.5 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={onSyncClick}
              disabled={!report || totalIssues === 0}
            >
              Sync manifests
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  count,
  tone,
  description,
  children,
}: {
  title: string;
  count: number;
  tone: "amber" | "rose" | "orange";
  description: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
      : tone === "rose"
        ? "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
        : "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        <Badge variant="outline" className={`text-[10px] ${toneClass}`}>
          {count}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
      <div className="rounded-md border border-border divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function DriftRow({
  drift,
  showDiff = false,
}: {
  drift: SurfaceValueDrift;
  showDiff?: boolean;
}) {
  return (
    <div className="px-2 py-1.5 text-[11px] space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-foreground">{drift.surfaceName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono">{drift.valueName}</span>
      </div>
      {showDiff && drift.diff && (
        <div className="text-[10px] text-muted-foreground space-y-0.5 mt-0.5">
          {Object.entries(drift.diff).map(([field, vals]) => (
            <div key={field} className="flex gap-2">
              <span className="font-mono">{field}:</span>
              <span>
                code=
                <code className="font-mono">
                  {JSON.stringify(vals.manifest)}
                </code>{" "}
                db=<code className="font-mono">{JSON.stringify(vals.db)}</code>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrokenRow({
  broken,
  onResolved,
}: {
  broken: BrokenMapping;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showRemap, setShowRemap] = useState(false);
  const [availableValues, setAvailableValues] = useState<SurfaceValue[] | null>(
    null,
  );
  const [remapTarget, setRemapTarget] = useState<string>("");

  const openRemap = async () => {
    setShowRemap(true);
    if (!availableValues) {
      try {
        const vals = await listSurfaceValues(broken.surfaceName);
        setAvailableValues(vals);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to load surface values",
        );
        setAvailableValues([]);
      }
    }
  };

  const applyAction = async (
    remediation:
      | { action: "remap_to"; target: string }
      | { action: "remove" }
      | { action: "notify_only" },
  ) => {
    setBusy(true);
    try {
      await remediateBrokenMapping({
        bindingKind: broken.bindingKind,
        bindingId: broken.bindingId,
        mappingKey: broken.mappingKey,
        remediation,
      });
      const labels = {
        remap_to: "Mapping remapped",
        remove: "Mapping removed",
        notify_only: "Audit recorded — no changes applied",
      } as const;
      toast.success(labels[remediation.action]);
      onResolved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-2 py-1.5 text-[11px] space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">
          {broken.bindingKind}
        </Badge>
        <span className="font-mono text-foreground">{broken.surfaceName}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-mono">{broken.mappingKey}</span>
        <span className="text-muted-foreground">references</span>
        <code className="font-mono text-destructive">{broken.badTarget}</code>
      </div>
      <div className="text-[10px] text-muted-foreground font-mono">
        binding id: {broken.bindingId}
      </div>

      {showRemap ? (
        <div className="flex items-center gap-1.5 pt-1">
          <Select
            value={remapTarget}
            onValueChange={setRemapTarget}
            disabled={busy || availableValues === null}
          >
            <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0">
              <SelectValue placeholder="Pick a replacement…" />
            </SelectTrigger>
            <SelectContent>
              {availableValues === null && (
                <SelectItem value="__loading__" disabled>
                  Loading…
                </SelectItem>
              )}
              {availableValues?.length === 0 && (
                <SelectItem value="__empty__" disabled>
                  Surface has no declared values
                </SelectItem>
              )}
              {availableValues?.map((sv) => (
                <SelectItem key={sv.name} value={sv.name}>
                  <span className="font-mono">{sv.name}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {sv.valueType}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() =>
              void applyAction({ action: "remap_to", target: remapTarget })
            }
            disabled={busy || !remapTarget}
            className="h-7 text-[11px]"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Apply remap"
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowRemap(false);
              setRemapTarget("");
            }}
            disabled={busy}
            className="h-7 text-[11px]"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openRemap()}
            disabled={busy}
            className="h-6 text-[11px] gap-1"
          >
            <CheckCircle2 className="h-3 w-3" />
            Remap to…
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void applyAction({ action: "remove" })}
            disabled={busy}
            className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void applyAction({ action: "notify_only" })}
            disabled={busy}
            className="h-6 text-[11px] gap-1"
          >
            <Bell className="h-3 w-3" />
            Keep &amp; notify
          </Button>
        </div>
      )}
    </div>
  );
}
