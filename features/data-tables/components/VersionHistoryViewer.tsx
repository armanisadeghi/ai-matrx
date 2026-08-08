/**
 * VersionHistoryViewer — audit log for a single dataset row, with restore.
 *
 * Renders the append-only history written to `udt_dataset_row_versions` by
 * the P1 row-version trigger. Self-contained: drop it into a sheet, dialog,
 * inline panel, or debug surface and pass a rowId.
 *
 * Read-only by default (backwards compatible). Pass `tableId` +
 * `editable` to unlock write actions, all of which go through the typed
 * service layer (`upsertRow` / `upsertCell`) so they are themselves
 * versioned, validated, and permission-gated:
 *   - Restore a version — rewrites the whole row to that snapshot.
 *   - Restore a deleted row — re-inserts the last data as a new row.
 *   - Revert one field — per-diff-line undo back to the prior value.
 *
 * - Newest-first, "Load more" pagination past the first `limit` (default 50).
 * - Each entry shows: change kind badge, relative timestamp (absolute on
 *   hover), actor, and a diff against the prior version.
 * - `changed_by = null` renders as "System" (service_role / cron / admin tool
 *   writes — see FEATURE.md). Do NOT fall back to the row owner.
 */
"use client";

import { useState } from "react";

import {
  AlertCircle,
  ArchiveRestore,
  Copy,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";

import { upsertCell, upsertRow } from "../service";
import { isServiceFailure } from "../types";
import { useRowVersions } from "../hooks/useRowVersions";
import type { RowVersion } from "../types";

type Props = {
  rowId: string | null | undefined;
  /** Initial page size. Defaults to 50; "Load more" extends past it. */
  limit?: number;
  /** Optional className for the outer container. */
  className?: string;
  /** Dataset id — required for any write action (restore / revert). */
  tableId?: string;
  /** Gate for write actions. Off (or missing tableId) = read-only viewer. */
  editable?: boolean;
  /** field_name → display_name, so diffs read like the grid headers. */
  fieldLabels?: Record<string, string>;
  /** Fires after any successful restore/revert so the owner can refetch. */
  onRowChanged?: () => void;
};

const PAGE_SIZE_STEP = 50;

export function VersionHistoryViewer({
  rowId,
  limit,
  className,
  tableId,
  editable,
  fieldLabels,
  onRowChanged,
}: Props) {
  const initialLimit = limit ?? PAGE_SIZE_STEP;
  const [effectiveLimit, setEffectiveLimit] = useState(initialLimit);
  const { versions, loading, error, refresh } = useRowVersions(rowId, {
    limit: effectiveLimit,
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canWrite = Boolean(editable && tableId);
  // If the newest entry is a delete, the live row is gone: field-level
  // reverts and in-place restores are impossible — only re-insert works.
  const rowDeleted = versions[0]?.change_kind === "delete";

  const label = (fieldName: string) => fieldLabels?.[fieldName] ?? fieldName;

  const runWrite = async (key: string, work: () => Promise<void>) => {
    if (busyKey) return;
    setBusyKey(key);
    try {
      await work();
      refresh();
      onRowChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const restoreVersion = async (version: RowVersion) => {
    if (!tableId || !rowId) return;
    const snapshot = snapshotOf(version);
    if (!snapshot) {
      toast.error("This version has no data snapshot to restore.");
      return;
    }
    if (rowDeleted) {
      const ok = await confirm({
        title: "Restore deleted row",
        description:
          "The row was deleted, so this snapshot will be re-inserted as a new row (with a fresh history).",
        confirmLabel: "Restore row",
      });
      if (!ok) return;
      await runWrite(`restore-${version.id}`, async () => {
        const result = await upsertRow({ tableId, data: snapshot });
        if (isServiceFailure(result)) throw new Error(result.error);
        toast.success("Row restored as a new row.");
      });
      return;
    }
    const ok = await confirm({
      title: "Restore this version",
      description: `The row will be rewritten to exactly this snapshot from ${formatAbsoluteDate(version.changed_at)}. The change is itself recorded in history, so you can always come back.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;
    await runWrite(`restore-${version.id}`, async () => {
      const result = await upsertRow({ tableId, rowId, data: snapshot });
      if (isServiceFailure(result)) throw new Error(result.error);
      toast.success("Version restored.");
    });
  };

  const revertField = async (
    version: RowVersion,
    fieldName: string,
    prev: unknown,
  ) => {
    if (!tableId || !rowId) return;
    await runWrite(`revert-${version.id}-${fieldName}`, async () => {
      const result = await upsertCell({
        tableId,
        rowId,
        fieldName,
        value: prev ?? null,
      });
      if (isServiceFailure(result)) throw new Error(result.error);
      toast.success(
        `"${label(fieldName)}" reverted. This is recorded in history too.`,
      );
    });
  };

  const copySnapshot = async (version: RowVersion) => {
    const snapshot = snapshotOf(version);
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(snapshot ?? version, null, 2),
      );
      toast.success("Snapshot copied as JSON.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  if (!rowId) {
    return (
      <EmptyState
        icon={<History className="size-4" />}
        title="No row selected"
        description="Select a row to view its history."
        className={className}
      />
    );
  }

  if (loading && versions.length === 0) {
    return (
      <div className={containerClass(className)}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle className="size-4 text-destructive" />}
        title="Could not load history"
        description={error}
        className={className}
      />
    );
  }

  if (versions.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-4" />}
        title="No history yet"
        description="Edits to this row will appear here."
        className={className}
      />
    );
  }

  const maybeMore = versions.length >= effectiveLimit;

  return (
    <div className={containerClass(className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {versions.length}
          {maybeMore ? "+" : ""} version{versions.length === 1 ? "" : "s"}
          {rowDeleted ? " · row deleted" : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={refresh}
          title="Refresh history"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {versions.map((v, i) => (
        <VersionCard
          key={v.id}
          version={v}
          isCurrent={i === 0}
          canWrite={canWrite}
          rowDeleted={rowDeleted}
          busyKey={busyKey}
          label={label}
          onRestore={() => restoreVersion(v)}
          onRevertField={(fieldName, prev) => revertField(v, fieldName, prev)}
          onCopy={() => copySnapshot(v)}
        />
      ))}

      {maybeMore && (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setEffectiveLimit((l) => l + PAGE_SIZE_STEP)}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            "Load more"
          )}
        </Button>
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function containerClass(extra?: string) {
  return `flex flex-col gap-2 ${extra ?? ""}`.trim();
}

function EmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-md bg-muted p-6 text-center ${className ?? ""}`.trim()}
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

/** The row content this version left behind: `data` normally, `prior_data`
 *  for a delete (its `data` is what got removed — the useful snapshot is
 *  what the row held just before). */
function snapshotOf(version: RowVersion): Record<string, unknown> | null {
  const raw =
    version.change_kind === "delete" ? version.prior_data : version.data;
  return isPlainObject(raw) ? raw : null;
}

function VersionCard({
  version,
  isCurrent,
  canWrite,
  rowDeleted,
  busyKey,
  label,
  onRestore,
  onRevertField,
  onCopy,
}: {
  version: RowVersion;
  isCurrent: boolean;
  canWrite: boolean;
  rowDeleted: boolean;
  busyKey: string | null;
  label: (fieldName: string) => string;
  onRestore: () => void;
  onRevertField: (fieldName: string, prev: unknown) => void;
  onCopy: () => void;
}) {
  const { change_kind, changed_at, changed_by, data, prior_data } = version;
  const diff = computeDiff(prior_data, data, change_kind);
  const restoreBusy = busyKey === `restore-${version.id}`;
  // Restoring the current (non-delete) version is a no-op — hide it there.
  // On a deleted row every card is restorable (re-insert).
  const showRestore = canWrite && (rowDeleted || !isCurrent);
  const canRevertFields = canWrite && !rowDeleted;

  return (
    <div className="group rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ChangeKindBadge kind={change_kind} />
          {isCurrent && !rowDeleted && (
            <Badge variant="outline" className="text-[10px]">
              Current
            </Badge>
          )}
          <span
            className="truncate text-xs text-muted-foreground"
            title={formatAbsoluteDate(changed_at, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}
          >
            {formatRelativeTime(changed_at)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ActorChip userId={changed_by} />
          <Button
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onCopy}
            title="Copy this snapshot as JSON"
          >
            <Copy className="size-3" />
          </Button>
        </div>
      </div>

      {diff.length > 0 && (
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {diff.map((entry) => (
            <li key={entry.key} className="flex flex-wrap items-baseline gap-2">
              <span className="text-muted-foreground">{label(entry.key)}:</span>
              {entry.kind === "insert" && (
                <span className="text-foreground">{formatValue(entry.next)}</span>
              )}
              {entry.kind === "delete" && (
                <span className="text-muted-foreground line-through">
                  {formatValue(entry.prev)}
                </span>
              )}
              {entry.kind === "change" && (
                <>
                  <span className="text-muted-foreground line-through">
                    {formatValue(entry.prev)}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-foreground">{formatValue(entry.next)}</span>
                </>
              )}
              {canRevertFields &&
                (entry.kind === "change" || entry.kind === "delete") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 opacity-0 transition-opacity group-hover:opacity-100"
                    disabled={busyKey !== null}
                    onClick={() => onRevertField(entry.key, entry.prev)}
                    title={`Set "${label(entry.key)}" back to ${formatValue(entry.prev)}`}
                  >
                    {busyKey === `revert-${version.id}-${entry.key}` ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Undo2 className="size-3" />
                    )}
                  </Button>
                )}
            </li>
          ))}
        </ul>
      )}

      {showRestore && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={busyKey !== null}
            onClick={onRestore}
          >
            {restoreBusy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ArchiveRestore className="size-3" />
            )}
            {rowDeleted ? "Restore row" : "Restore this version"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChangeKindBadge({ kind }: { kind: RowVersion["change_kind"] }) {
  if (kind === "insert") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Plus className="size-3" /> Created
      </Badge>
    );
  }
  if (kind === "update") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Pencil className="size-3" /> Updated
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <Trash2 className="size-3" /> Deleted
    </Badge>
  );
}

function ActorChip({ userId }: { userId: string | null }) {
  // changed_by is NULL for system writes — render that honestly rather than
  // falsely attributing to the row owner.
  if (userId === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <User className="size-3" /> System
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground"
      title={userId}
    >
      <User className="size-3" /> {userId.slice(0, 8)}
    </span>
  );
}

// ─── Diff helpers (no comments inside — names self-document) ─────────────────

type DiffEntry =
  | { kind: "insert"; key: string; next: unknown }
  | { kind: "delete"; key: string; prev: unknown }
  | { kind: "change"; key: string; prev: unknown; next: unknown };

function computeDiff(
  prior: unknown,
  next: unknown,
  kind: RowVersion["change_kind"],
): DiffEntry[] {
  const priorObj = isPlainObject(prior) ? prior : {};
  const nextObj = isPlainObject(next) ? next : {};
  const keys = new Set([...Object.keys(priorObj), ...Object.keys(nextObj)]);
  const out: DiffEntry[] = [];

  for (const key of keys) {
    const inPrior = key in priorObj;
    const inNext = key in nextObj;
    const pv = priorObj[key];
    const nv = nextObj[key];

    if (kind === "insert" && inNext) {
      out.push({ kind: "insert", key, next: nv });
    } else if (kind === "delete" && inPrior) {
      out.push({ kind: "delete", key, prev: pv });
    } else if (!inPrior && inNext) {
      out.push({ kind: "insert", key, next: nv });
    } else if (inPrior && !inNext) {
      out.push({ kind: "delete", key, prev: pv });
    } else if (!shallowEqual(pv, nv)) {
      out.push({ kind: "change", key, prev: pv, next: nv });
    }
  }
  return out;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
