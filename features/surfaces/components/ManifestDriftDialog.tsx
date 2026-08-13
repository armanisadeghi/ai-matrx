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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  getDriftReport,
  listSurfaceValues,
  remediateBrokenMapping,
} from "@/features/surfaces/services/surfaces.service";
import { countDriftIssues } from "@/features/surfaces/utils/drift-report-count";
import type {
  SurfaceDriftReport,
  SurfaceValue,
  BrokenMapping,
  UnknownNamespace,
} from "@/features/surfaces/types";

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

  // EVERY category the report computes must be counted here — see
  // `countDriftIssues` for why this is one shared, exhaustive-by-construction
  // helper rather than a hand-maintained sum that goes stale each time the
  // report grows a category.
  const totalIssues = countDriftIssues(report);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Surface manifest drift report
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
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
            <div className="space-y-3">
              <Section
                title="Manifest values missing from DB"
                count={report.manifestsMissingInDb.length}
                tone="amber"
                description="Declared in code but not yet upserted. Sync to apply."
              >
                {report.manifestsMissingInDb.map((d) => (
                  <DriftRow
                    key={`m-${d.surfaceName}-${d.valueName}`}
                    surfaceName={d.surfaceName}
                    name={d.valueName}
                  />
                ))}
              </Section>

              <Section
                title="DB values without a code manifest"
                count={report.dbValuesNotInManifest.length}
                tone="rose"
                description='Stale rows. Sync with "Delete stale rows" to clean up.'
              >
                {report.dbValuesNotInManifest.map((d) => (
                  <DriftRow
                    key={`d-${d.surfaceName}-${d.valueName}`}
                    surfaceName={d.surfaceName}
                    name={d.valueName}
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
                    surfaceName={d.surfaceName}
                    name={d.valueName}
                    diff={d.diff}
                    showDiff
                  />
                ))}
              </Section>

              <Section
                title="Manifest roles missing from DB"
                count={report.roleManifestsMissingInDb.length}
                tone="amber"
                description="Agent roles declared in code but not yet upserted. Sync to apply."
              >
                {report.roleManifestsMissingInDb.map((d) => (
                  <DriftRow
                    key={`rm-${d.surfaceName}-${d.roleName}`}
                    surfaceName={d.surfaceName}
                    name={d.roleName}
                  />
                ))}
              </Section>

              <Section
                title="DB roles without a code manifest"
                count={report.dbRolesNotInManifest.length}
                tone="rose"
                description='Stale agent roles. Sync with "Delete stale rows" to clean up — user/org agent prefs for these roles are swept too.'
              >
                {report.dbRolesNotInManifest.map((d) => (
                  <DriftRow
                    key={`rd-${d.surfaceName}-${d.roleName}`}
                    surfaceName={d.surfaceName}
                    name={d.roleName}
                  />
                ))}
              </Section>

              <Section
                title="Role field-level diffs"
                count={report.roleDiffs.length}
                tone="orange"
                description="Same role on both sides but fields differ. Sync to make DB match code."
              >
                {report.roleDiffs.map((d) => (
                  <DriftRow
                    key={`rdiff-${d.surfaceName}-${d.roleName}`}
                    surfaceName={d.surfaceName}
                    name={d.roleName}
                    diff={d.diff}
                    showDiff
                  />
                ))}
              </Section>

              <Section
                title="Manifest write targets missing from DB"
                count={report.writeTargetManifestsMissingInDb.length}
                tone="amber"
                description="Write targets declared in code but not yet upserted to ui_surface_write_target. Server-side agents can't see them until they land. Sync to apply."
              >
                {report.writeTargetManifestsMissingInDb.map((d) => (
                  <DriftRow
                    key={`wtm-${d.surfaceName}-${d.targetName}`}
                    surfaceName={d.surfaceName}
                    name={d.targetName}
                  />
                ))}
              </Section>

              <Section
                title="DB write targets without a code manifest"
                count={report.dbWriteTargetsNotInManifest.length}
                tone="rose"
                description='Stale write-target rows — a removed target, or a sync from a branch whose manifest never merged. READ THIS LIST BEFORE ACTING: "Delete stale rows" is a GLOBAL sweep and will delete rows belonging to work that is still in flight.'
              >
                {report.dbWriteTargetsNotInManifest.map((d) => (
                  <DriftRow
                    key={`wtd-${d.surfaceName}-${d.targetName}`}
                    surfaceName={d.surfaceName}
                    name={d.targetName}
                  />
                ))}
              </Section>

              <Section
                title="Write target field-level diffs"
                count={report.writeTargetDiffs.length}
                tone="orange"
                description="Same target on both sides but fields differ — including apply_policy, the field that decides whether an agent may write without a human. Sync to make DB match code."
              >
                {report.writeTargetDiffs.map((d) => (
                  <DriftRow
                    key={`wtdiff-${d.surfaceName}-${d.targetName}`}
                    surfaceName={d.surfaceName}
                    name={d.targetName}
                    diff={d.diff}
                    showDiff
                  />
                ))}
              </Section>

              <Section
                title="Manifest client tools missing from DB"
                count={report.clientToolManifestsMissingInDb.length}
                tone="amber"
                description="Client tools declared in code but not present in ui_surface_client_tool."
              >
                {report.clientToolManifestsMissingInDb.map((d) => (
                  <DriftRow
                    key={`ctm-${d.surfaceName}-${d.toolName}`}
                    surfaceName={d.surfaceName}
                    name={d.toolName}
                  />
                ))}
              </Section>

              <Section
                title="DB client tools without a code manifest"
                count={report.dbClientToolsNotInManifest.length}
                tone="rose"
                description="Stale client-tool rows — a removed tool, or a sync from a branch whose manifest never merged. Same warning as write targets: read the list before any global sweep."
              >
                {report.dbClientToolsNotInManifest.map((d) => (
                  <DriftRow
                    key={`ctd-${d.surfaceName}-${d.toolName}`}
                    surfaceName={d.surfaceName}
                    name={d.toolName}
                  />
                ))}
              </Section>

              <Section
                title="Client tool field-level diffs"
                count={report.clientToolDiffs.length}
                tone="orange"
                description="Same tool on both sides but fields differ. input_schema is compared as canonical JSON, so jsonb key order is never the cause."
              >
                {report.clientToolDiffs.map((d) => (
                  <DriftRow
                    key={`ctdiff-${d.surfaceName}-${d.toolName}`}
                    surfaceName={d.surfaceName}
                    name={d.toolName}
                    diff={d.diff}
                    showDiff
                  />
                ))}
              </Section>

              <Section
                title="Unknown config namespaces"
                count={report.unknownNamespaces.length}
                tone="rose"
                description="Referenced in a manifest or ui_surface_config but not registered. Register a handler in namespace-registry.ts."
              >
                {report.unknownNamespaces.map((ns) => (
                  <NamespaceRow
                    key={`ns-${ns.source}-${ns.surfaceName ?? ""}-${ns.namespace}`}
                    ns={ns}
                  />
                ))}
              </Section>

              <Section
                title="URL pattern drift"
                count={report.urlPatternDrifts.length}
                tone="amber"
                description="ui_surface.url_pattern missing or differs from code defaults. Sync to apply."
              >
                {report.urlPatternDrifts.map((d) => (
                  <div
                    key={`url-${d.surfaceName}`}
                    className="px-2 py-1.5 text-[11px] space-y-0.5"
                  >
                    <div className="font-mono text-foreground">
                      {d.surfaceName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      code=<code className="font-mono">{d.manifest}</code>
                      {d.db ? (
                        <>
                          {" "}
                          db=<code className="font-mono">{d.db}</code>
                        </>
                      ) : (
                        " (empty in DB)"
                      )}
                    </div>
                  </div>
                ))}
              </Section>

              <Section
                title="Surface label drift"
                count={report.surfaceLabelDrifts.length}
                tone="amber"
                description="ui_surface.label missing or differs from the code manifest (THE NAMING LAW). Sync to apply."
              >
                {report.surfaceLabelDrifts.map((d) => (
                  <div
                    key={`label-${d.surfaceName}`}
                    className="px-2 py-1.5 text-[11px] space-y-0.5"
                  >
                    <div className="font-mono text-foreground">
                      {d.surfaceName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      code=<code className="font-mono">{d.manifest}</code>
                      {d.db ? (
                        <>
                          {" "}
                          db=<code className="font-mono">{d.db}</code>
                        </>
                      ) : (
                        " (empty in DB)"
                      )}
                    </div>
                  </div>
                ))}
              </Section>

              <Section
                title="Value group drift"
                count={report.valueGroupsDrifts.length}
                tone="amber"
                description="ui_surface.value_groups missing or differs from the code manifest. Compared on a normalized projection, so jsonb key order is never the cause. Sync to apply."
              >
                {report.valueGroupsDrifts.map((d) => (
                  <div
                    key={`groups-${d.surfaceName}`}
                    className="px-2 py-1.5 text-[11px] space-y-0.5"
                  >
                    <div className="font-mono text-foreground">
                      {d.surfaceName}
                    </div>
                    {/* State the verdict, not just "they differ": name the group
                        keys on each side so the operator knows what changed
                        without diffing two blobs by eye. */}
                    <div className="text-[10px] text-muted-foreground">
                      code=
                      <code className="font-mono">
                        {groupKeyList(d.manifest)}
                      </code>
                      {d.kind === "diff" ? (
                        <>
                          {" "}
                          db=
                          <code className="font-mono">
                            {groupKeyList(d.db)}
                          </code>
                        </>
                      ) : (
                        " (empty in DB)"
                      )}
                    </div>
                  </div>
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
            </div>
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

/**
 * Name the group KEYS rather than dumping the raw jsonb — a comparison states
 * what differs, not just that something does. Falls back to a count when a
 * group has no readable key so the row can never render an empty verdict.
 */
function groupKeyList(input: unknown): string {
  const groups = Array.isArray(input) ? input : [];
  if (groups.length === 0) return "(none)";
  const keys = groups.map((g, i) => {
    const rec = (g ?? {}) as Record<string, unknown>;
    const key = rec.key ?? rec.label;
    return typeof key === "string" && key.trim() ? key.trim() : `#${i + 1}`;
  });
  return keys.join(", ");
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
  surfaceName,
  name,
  diff,
  showDiff = false,
}: {
  surfaceName: string;
  name: string;
  diff?: Partial<Record<string, { manifest: unknown; db: unknown }>>;
  showDiff?: boolean;
}) {
  return (
    <div className="px-2 py-1.5 text-[11px] space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-foreground">{surfaceName}</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono">{name}</span>
      </div>
      {showDiff && diff && (
        <div className="text-[10px] text-muted-foreground space-y-0.5 mt-0.5">
          {Object.entries(diff).map(([field, vals]) => (
            <div key={field} className="flex gap-2">
              <span className="font-mono">{field}:</span>
              <span>
                code=
                <code className="font-mono">
                  {JSON.stringify(vals?.manifest)}
                </code>{" "}
                db=<code className="font-mono">{JSON.stringify(vals?.db)}</code>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NamespaceRow({ ns }: { ns: UnknownNamespace }) {
  return (
    <div className="px-2 py-1.5 text-[11px] flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="text-[10px]">
        {ns.source}
      </Badge>
      {ns.surfaceName && (
        <>
          <span className="font-mono text-foreground">{ns.surfaceName}</span>
          <span className="text-muted-foreground">·</span>
        </>
      )}
      <span className="font-mono">{ns.namespace}</span>
      <span className="text-muted-foreground">has no registered handler</span>
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
