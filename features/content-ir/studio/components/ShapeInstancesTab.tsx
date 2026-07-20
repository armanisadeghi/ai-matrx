"use client";

/**
 * Instances tab — /shapes/[kind]/instances: the user's saved
 * `content_ir.kind_instance` rows for ONE kind (created_by = me, live rows,
 * newest first), each opening through the REAL render engine
 * (`KindInstanceRender`) with Edit (prefilled `KindInputForm`), soft Delete
 * (`ConfirmDialog`), and — for instances pinned behind the kind's current
 * version — the honest Repin affordance (validates at CURRENT schema first,
 * refuses loudly otherwise; P-1 parity via `repinKindInstance`).
 *
 * "View as table" (the ratified Convert Pattern, read-only/export v1): FLAT
 * kinds project their instances into a NEW dataset snapshot via
 * `createDatasetFromTable` — click-to-convert, no sync, no substrate.
 *
 * HEAVY (KindInputForm pulls ajv + the production input stack) — the route
 * loads this tab via `next/dynamic({ ssr: false })` (ShapeInstancesTabLoader).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpCircle,
  CircleAlert,
  FlaskConical,
  Loader2,
  Pencil,
  RefreshCw,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import KindInputForm from "@/features/content-ir/input/KindInputForm";
import KindInstanceRender, {
  isRecordValue,
} from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  instanceDataAsRecord,
  isValidatorDrift,
  listMyKindInstances,
  repinKindInstance,
  softDeleteKindInstance,
  updateKindInstance,
  type KindInstanceListEntry,
} from "@/features/content-ir/studio/instance-service";
import { shapeTestHref } from "@/features/content-ir/studio/constants";
import { getKindInputContractBySlug } from "@/features/content-ir/registry/schema-source-kind-tables";
import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";

interface ShapeInstancesTabProps {
  kind: string;
  label: string;
  kindDefinitionId: string;
  /** Page-load snapshot of the kind's version — pinned-chip display only.
   * Repin re-reads the LIVE version + schema inside `repinKindInstance`. */
  currentVersion: number;
  /** `metadata.title_key` — the per-kind instance-title override (or null). */
  titleKey: string | null;
}

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: KindInstanceListEntry[] };

/** Field types a flat table projection can hold (arrays join, scalars pass). */
const FLAT_FIELD_TYPES = new Set([
  "string",
  "enum",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "boolean[]",
]);

function flatFieldKeys(schema: KindSchema | null): string[] | null {
  if (!schema) return null;
  const keys = Object.keys(schema.fields);
  if (keys.length === 0) return null;
  for (const key of keys) {
    if (!FLAT_FIELD_TYPES.has(schema.fields[key].type)) return null;
  }
  return keys;
}

/** Dataset columns are string-typed — every cell is stringified (scalars too). */
function cellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusDotClass(status: string): string {
  if (status === "passed") return "bg-emerald-500";
  if (status === "pending") return "bg-amber-500";
  return "bg-red-500";
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ShapeInstancesTab({
  kind,
  label,
  kindDefinitionId,
  currentVersion,
  titleKey,
}: ShapeInstancesTabProps) {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("i");

  const [list, setList] = useState<ListState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repinning, setRepinning] = useState(false);
  const [verdictWarning, setVerdictWarning] = useState<string | null>(null);
  const [flatKeys, setFlatKeys] = useState<string[] | null>(null);
  const [converting, setConverting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const entries = await listMyKindInstances(kindDefinitionId);
      setList({ status: "ready", entries });
      return entries;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setList({ status: "error", message });
      return null;
    }
  }, [kindDefinitionId]);

  useEffect(() => {
    void (async () => {
      const entries = await reload();
      // Deep link (?i=<id>) — the sharing permalink resolver lands here.
      if (entries && requestedId && entries.some((e) => e.id === requestedId)) {
        setSelectedId(requestedId);
      }
    })();
    // requestedId is read once on mount by design (a later URL change should
    // not yank the user's selection).
  }, [reload]);

  // Flat-kind detection for the Convert Pattern bridge (read-only export v1).
  useEffect(() => {
    let cancelled = false;
    void getKindInputContractBySlug(kind)
      .then((contract) => {
        if (!cancelled) setFlatKeys(flatFieldKeys(contract?.schema ?? null));
      })
      .catch(() => {
        // Non-fatal: the bridge button simply stays hidden.
        if (!cancelled) setFlatKeys(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const entries = list.status === "ready" ? list.entries : [];
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const selectedData = selected ? instanceDataAsRecord(selected.data) : null;
  const selectedStale = selected !== null && selected.kindVersion < currentVersion;

  function select(id: string): void {
    setSelectedId(id);
    setEditing(false);
    setVerdictWarning(null);
  }

  async function handleEditSubmit(value: unknown): Promise<void> {
    if (!selected || !isRecordValue(value)) return;
    try {
      const result = await updateKindInstance({ id: selected.id, value, titleKey });
      await reload();
      setEditing(false);
      if (isValidatorDrift(result)) {
        if (result.kindVersion < currentVersion) {
          // Honest posture (P-1 parity): the trigger judged against the
          // PINNED older schema; the fix is repin, not silence.
          setVerdictWarning(
            `The DB verdict for this instance is "${result.validationStatus}" (computed against pinned kind_version ${result.kindVersion}, current is ${currentVersion}). Use Repin to move it onto the current schema.`,
          );
        } else {
          // Pinned to current AND client-side ajv passed → validator drift.
          const message = `Instance ${result.id} of kind "${kind}" was updated but the DB validation trigger marked it "${result.validationStatus}" while the client-side ajv check passed. This is a validator-drift defect — report it.`;
          captureError({ source: "content-ir", message });
          setVerdictWarning(message);
        }
        toast.error("Saved, but validation did not pass", {
          description: `DB verdict: ${result.validationStatus}`,
        });
        return;
      }
      setVerdictWarning(null);
      toast.success(
        result.title ? `Saved "${result.title}"` : "Instance saved",
        { description: "Validation passed." },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Failed to save changes", { description: message });
    }
  }

  async function handleRepin(): Promise<void> {
    if (!selected || !selectedData) return;
    setRepinning(true);
    try {
      const result = await repinKindInstance({
        id: selected.id,
        data: selectedData,
        kindDefinitionId,
      });
      await reload();
      setVerdictWarning(null);
      toast.success(`Repinned to v${result.kindVersion}`, {
        description: `DB verdict: ${result.validationStatus}.`,
      });
      if (isValidatorDrift(result)) {
        const message = `Repin of instance ${result.id} ("${kind}") passed the client-side ajv check but the DB trigger marked it "${result.validationStatus}". Validator-drift defect — report it.`;
        captureError({ source: "content-ir", message });
        setVerdictWarning(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVerdictWarning(message);
      toast.error("Repin refused", { description: message });
    } finally {
      setRepinning(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await softDeleteKindInstance(pendingDeleteId);
      if (selectedId === pendingDeleteId) {
        setSelectedId(null);
        setEditing(false);
      }
      setPendingDeleteId(null);
      await reload();
      toast.success("Instance deleted");
    } catch (error) {
      toast.error("Failed to delete", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleViewAsTable(): Promise<void> {
    if (!flatKeys || entries.length === 0) return;
    setConverting(true);
    try {
      const { createDatasetFromTable } =
        await import("@/features/data-tables/create-dataset-from-table");
      const rows = entries
        .map((entry) => instanceDataAsRecord(entry.data))
        .filter((data): data is Record<string, unknown> => data !== null)
        .map((data) => {
          const row: Record<string, unknown> = {};
          for (const key of flatKeys) row[key] = cellValue(data[key]);
          return row;
        });
      const result = await createDatasetFromTable({
        name: `${label} instances`,
        description: `Snapshot of your "${kind}" instances (${new Date().toLocaleDateString()}). One-time export — edits here do not sync back.`,
        headers: flatKeys,
        rows,
      });
      if (!result.success || !result.tableId) {
        throw new Error(result.error ?? "Failed to create the dataset");
      }
      const tableId = result.tableId;
      toast.success(`Dataset created (${result.inserted} rows)`, {
        description: "One-time snapshot — it does not sync back to instances.",
        action: {
          label: "Open",
          onClick: () =>
            window.open(`/data/${tableId}`, "_blank", "noopener,noreferrer"),
        },
      });
    } catch (error) {
      toast.error("Failed to create the dataset", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConverting(false);
    }
  }

  if (list.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading your instances</span>
      </div>
    );
  }

  if (list.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {list.message}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          You have no saved {label} instances yet.
        </p>
        <Link
          href={shapeTestHref(kind)}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Fill one in on the Test tab and hit Save
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      {/* Instance list */}
      <section className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            My instances
          </span>
          <span className="text-xs text-muted-foreground">
            {entries.length}
          </span>
          <button
            type="button"
            onClick={() => void reload()}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {flatKeys && (
            <button
              type="button"
              onClick={() => void handleViewAsTable()}
              disabled={converting}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              title="Create a one-time dataset snapshot of these instances"
            >
              {converting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Table2 className="h-3.5 w-3.5" />
              )}
              View as table
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {entries.map((entry) => {
            const stale = entry.kindVersion < currentVersion;
            const active = entry.id === selectedId;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => select(entry.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "border-primary/50 bg-accent"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(entry.validationStatus)}`}
                    title={`Validation: ${entry.validationStatus}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {entry.title ?? `Untitled (${entry.id.slice(0, 8)})`}
                  </span>
                  {stale && (
                    <span
                      className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200"
                      title={`Pinned to v${entry.kindVersion}; the kind is at v${currentVersion}`}
                    >
                      v{entry.kindVersion}
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatUpdated(entry.updatedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Detail */}
      <section className="min-w-0">
        {selected === null ? (
          <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Pick an instance — it renders here through your shape&apos;s real
              component.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {selected.title ?? `Untitled (${selected.id.slice(0, 8)})`}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${statusDotClass(selected.validationStatus)}`}
                title={`Validation: ${selected.validationStatus}`}
              />
              <span className="text-[11px] text-muted-foreground">
                v{selected.kindVersion}
                {selectedStale ? ` of ${currentVersion}` : ""}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {selectedStale && (
                  <button
                    type="button"
                    onClick={() => void handleRepin()}
                    disabled={repinning}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-200"
                    title={`Revalidate against v${currentVersion} and repin (refused if the data does not validate)`}
                  >
                    {repinning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                    )}
                    Repin to v{currentVersion}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditing((e) => !e);
                    setVerdictWarning(null);
                  }}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  {editing ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5" />
                  )}
                  {editing ? "Cancel" : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(selected.id)}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-red-500/30 px-2 text-xs text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>

            {verdictWarning && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {verdictWarning}
              </div>
            )}

            {editing && selectedData !== null ? (
              <div className="rounded-md border border-border bg-card p-3">
                <KindInputForm
                  kind={kind}
                  initialValue={selectedData}
                  submitLabel="Save changes"
                  onSubmit={handleEditSubmit}
                  onCancel={() => setEditing(false)}
                />
              </div>
            ) : selectedData !== null ? (
              <KindInstanceRender kind={kind} value={selectedData} />
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This instance&apos;s stored data is not a JSON object — it
                cannot be rendered or edited here.
              </div>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete this instance?"
        description="Soft delete — the row is tombstoned and recoverable by an admin, but it disappears from your list."
        variant="destructive"
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
