/**
 * VersionHistoryViewer — read-only audit log for a single dataset row.
 *
 * Renders the append-only history written to `udt_dataset_row_versions` by
 * the P1 row-version trigger. Self-contained: drop it into a sheet, dialog,
 * inline panel, or debug surface and pass a rowId.
 *
 * - Newest-first. Loads up to `limit` (default 50) entries.
 * - Each entry shows: change kind badge, timestamp, actor, and a diff against
 *   the prior version (insert = all new keys, update = only changed keys,
 *   delete = all keys with deleted marker).
 * - `changed_by = null` renders as "System" (service_role / cron / admin tool
 *   writes — see FEATURE.md). Do NOT fall back to the row owner.
 */
"use client";

import {
  AlertCircle,
  History,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useRowVersions } from "../hooks/useRowVersions";
import type { RowVersion } from "../types";

type Props = {
  rowId: string | null | undefined;
  /** Max versions to load. Defaults to 50. */
  limit?: number;
  /** Optional className for the outer container. */
  className?: string;
};

export function VersionHistoryViewer({ rowId, limit, className }: Props) {
  const { versions, loading, error } = useRowVersions(rowId, { limit });

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

  if (loading) {
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

  return (
    <div className={containerClass(className)}>
      {versions.map((v) => (
        <VersionCard key={v.id} version={v} />
      ))}
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

function VersionCard({ version }: { version: RowVersion }) {
  const { change_kind, changed_at, changed_by, data, prior_data } = version;
  const diff = computeDiff(prior_data, data, change_kind);

  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChangeKindBadge kind={change_kind} />
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(changed_at)}
          </span>
        </div>
        <ActorChip userId={changed_by} />
      </div>

      {diff.length > 0 && (
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {diff.map((entry) => (
            <li key={entry.key} className="flex flex-wrap items-baseline gap-2">
              <span className="text-muted-foreground">{entry.key}:</span>
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
            </li>
          ))}
        </ul>
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
