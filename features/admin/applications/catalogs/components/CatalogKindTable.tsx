"use client";

// features/admin/applications/catalogs/components/CatalogKindTable.tsx
//
// Entries for one (app, kind): key, name from payload, artifact size,
// min_app_version, is_active toggle (confirm + live artifact probe via
// probeArtifactUrl: aidream resolver first, browser HEAD fallback — the
// dual-gate moment), inline-editable sort_order, provenance. All writes
// go through admin_upsert_catalog_entry with p_expected_updated_at; a 40001
// conflict toasts and refreshes.

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Link2,
  Loader2,
  Plus,
  ShieldQuestion,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  CellEditsMap,
  MatrxColumnDef,
} from "@/components/official/matrx-data-table/types";
import { APPLICATIONS_ADMIN_LOCATION } from "@/features/admin/applications/constants";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken } from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import {
  isConflictError,
  rpcErrorMessage,
} from "@/features/admin/shared/admin-rpc-errors";
import { useAdminEmails } from "@/features/admin/shared/useAdminEmails";
import { formatBytes } from "@/features/admin/shared/UrlProbeField";
import { probeArtifactUrl } from "@/features/admin/applications/catalogs/resolver";
import type { ArtifactProbeResult } from "@/features/admin/applications/catalogs/resolver";
import { upsertArgsFromRow, upsertCatalogEntry } from "@/features/admin/applications/catalogs/rpc";
import {
  kindDef,
  kindLabel,
  payloadDisplayName,
  validatePayload,
} from "@/features/admin/applications/catalogs/schemas";
import type { CatalogEntryRow } from "@/features/admin/applications/catalogs/types";

interface CatalogKindTableProps {
  app: string;
  kind: string;
  entries: CatalogEntryRow[];
  onBack: () => void;
  onOpenEntry: (row: CatalogEntryRow) => void;
  onNewEntry: () => void;
  onAddFromLink: () => void;
  /** Refetch after any table-level write (toggle, sort) or conflict. */
  onChanged: () => void;
}

interface PendingToggle {
  row: CatalogEntryRow;
  next: boolean;
}

type ActivationProbe =
  | { status: "none" }
  | { status: "probing" }
  | ArtifactProbeResult;

export function CatalogKindTable({
  app,
  kind,
  entries,
  onBack,
  onOpenEntry,
  onNewEntry,
  onAddFromLink,
  onChanged,
}: CatalogKindTableProps) {
  const { toast } = useToast();
  const accessToken = useAppSelector(selectAccessToken);
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const adminEmails = useAdminEmails();
  const def = kindDef(kind);

  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [toggling, setToggling] = useState(false);
  // Keyed by target URL — a result only counts for the URL it probed, so no
  // synchronous reset is needed when the dialog target changes.
  const [probeDone, setProbeDone] = useState<{
    url: string;
    result: ActivationProbe;
  } | null>(null);

  // Dual-gate probe: activating an entry with an artifact URL live-probes it
  // while the confirm dialog is open (resolver-first via probeArtifactUrl,
  // browser HEAD fallback). Warn loudly; allow override.
  const probeTarget =
    pendingToggle?.next && pendingToggle.row.artifact_url
      ? pendingToggle.row.artifact_url
      : null;
  useEffect(() => {
    if (!probeTarget) return;
    let cancelled = false;
    const controller = new AbortController();
    void probeArtifactUrl({
      baseUrl: baseUrl ?? null,
      accessToken: accessToken ?? null,
      url: probeTarget,
      signal: controller.signal,
    }).then((result) => {
      if (cancelled) return;
      setProbeDone({ url: probeTarget, result });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [probeTarget, baseUrl, accessToken]);

  const probe: ActivationProbe = !probeTarget
    ? { status: "none" }
    : probeDone && probeDone.url === probeTarget
      ? probeDone.result
      : { status: "probing" };

  const handleWriteError = async (error: {
    code?: string;
    message: string;
  }) => {
    if (isConflictError(error)) {
      toast({
        title: "Conflict",
        description:
          "This entry changed since the table was loaded — refreshing. Re-apply your change.",
        variant: "destructive",
      });
      onChanged();
      return;
    }
    toast({
      title: "Save failed",
      description: rpcErrorMessage(error),
      variant: "destructive",
    });
  };

  const commitToggle = async () => {
    if (!pendingToggle) return;
    // Dual gate, part 1: activation requires a schema-valid payload — same
    // rule the editor enforces. (The artifact probe is warn-with-override;
    // payload validity is not.)
    if (pendingToggle.next) {
      const check = validatePayload(
        pendingToggle.row.kind,
        pendingToggle.row.payload,
      );
      if (check.status === "invalid") {
        toast({
          title: "Activation blocked",
          description:
            "The payload fails its kind schema — open the entry and fix it before activating.",
          variant: "destructive",
        });
        return;
      }
    }
    setToggling(true);
    const { error } = await upsertCatalogEntry(
      upsertArgsFromRow(pendingToggle.row, { is_active: pendingToggle.next }),
    );
    setToggling(false);
    if (error) {
      setPendingToggle(null);
      await handleWriteError(error);
      return;
    }
    toast({
      title: pendingToggle.next ? "Entry activated" : "Entry deactivated",
      description: `${app}/${kind}/${pendingToggle.row.key} — clients pick it up on their next catalog refresh.`,
    });
    setPendingToggle(null);
    onChanged();
  };

  // Inline edits land in MatrxDataTable's draft; Save on the dirty pill commits
  // them here, one upsert per changed row (each carrying its own
  // p_expected_updated_at so a concurrent write still conflicts loudly).
  const saveEdits = useCallback(
    async (edits: CellEditsMap, editedRows: CatalogEntryRow[]) => {
      const failures: string[] = [];
      for (const row of editedRows) {
        const patch = edits[row.id];
        if (!patch) continue;
        const raw = patch.sort_order;
        const parsed = Number(raw);
        if (!Number.isInteger(parsed)) {
          failures.push(`${row.key}: sort order must be an integer`);
          continue;
        }
        if (parsed === row.sort_order) continue;
        const { error } = await upsertCatalogEntry(
          upsertArgsFromRow(row, { sort_order: parsed }),
        );
        if (error) {
          if (isConflictError(error)) {
            failures.push(`${row.key}: changed since load \u2014 re-apply`);
          } else {
            failures.push(`${row.key}: ${rpcErrorMessage(error)}`);
          }
        }
      }
      onChanged();
      if (failures.length > 0) {
        toast({
          title: "Some edits did not save",
          description: failures.join("; "),
          variant: "destructive",
        });
        throw new Error(failures.join("; "));
      }
    },
    [onChanged, toast],
  );

  const columns = useMemo((): MatrxColumnDef<CatalogEntryRow>[] => {
    return [
      {
        id: "key",
        accessorKey: "key",
        header: "Key",
        cell: (row) => (
          <code
            className="block max-w-64 truncate text-sm font-medium"
            title={row.key}
          >
            {row.key}
          </code>
        ),
        width: 260,
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => payloadDisplayName(row.payload) ?? "",
        cell: (row) => {
          const name = payloadDisplayName(row.payload);
          return name ? (
            <span className="block max-w-56 truncate" title={name}>
              {name}
            </span>
          ) : (
            <span className="text-muted-foreground">\u2014</span>
          );
        },
        width: 220,
      },
      {
        id: "artifact_size_bytes",
        accessorKey: "artifact_size_bytes",
        header: "Artifact size",
        align: "right",
        cell: (row) => (
          <span className="font-mono text-xs">
            {formatBytes(row.artifact_size_bytes)}
          </span>
        ),
        width: 120,
      },
      {
        id: "min_app_version",
        accessorKey: "min_app_version",
        header: "Min version",
        filter: "select",
        cell: (row) => (
          <span className="font-mono text-xs">
            {row.min_app_version ?? "\u2014"}
          </span>
        ),
        width: 110,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        filter: "boolean",
        align: "center",
        cell: (row) => (
          <Switch
            checked={row.is_active}
            onCheckedChange={(next) => setPendingToggle({ row, next })}
            aria-label={`Toggle ${row.key} active`}
          />
        ),
        width: 90,
      },
      {
        id: "sort_order",
        accessorKey: "sort_order",
        header: "Sort",
        editable: "number",
        align: "right",
        cell: (row) => (
          <span className="font-mono text-xs">{row.sort_order}</span>
        ),
        width: 90,
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: "Updated",
        cell: (row) => (
          <span
            className="whitespace-nowrap text-xs"
            title={format(new Date(row.updated_at), "yyyy-MM-dd HH:mm:ss")}
          >
            {formatDistanceToNow(new Date(row.updated_at), {
              addSuffix: true,
            })}
          </span>
        ),
        width: 140,
      },
      {
        id: "updated_by",
        header: "By",
        accessorFn: (row) =>
          row.updated_by ? (adminEmails[row.updated_by] ?? row.updated_by) : "",
        filter: "select",
        cell: (row) =>
          row.updated_by ? (
            <span
              className="text-xs text-muted-foreground"
              title={row.updated_by}
            >
              {adminEmails[row.updated_by] ?? row.updated_by.slice(0, 8)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">\u2014</span>
          ),
        width: 200,
      },
    ];
  }, [adminEmails]);

  const activationPayloadCheck = pendingToggle?.next
    ? validatePayload(pendingToggle.row.kind, pendingToggle.row.payload)
    : null;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All kinds
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {kindLabel(kind)}{" "}
              <code className="text-xs font-normal text-muted-foreground">
                {app}/{kind}
              </code>
            </h2>
            {def ? (
              <p className="truncate text-xs text-muted-foreground">
                {def.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={entries}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={50}
          emptyState={{
            title: `No ${kindLabel(kind)} entries yet`,
            description:
              "Use Add from link to resolve one from a URL, or New entry to author it by hand.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search key, name\u2026",
            actions: (
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" onClick={onAddFromLink}>
                  <Link2 className="mr-1.5 h-4 w-4" /> Add from link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onNewEntry}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> New entry
                </Button>
              </div>
            ),
          }}
          onRowOpen={(row) => onOpenEntry(row)}
          detail={{ enabled: false }}
          edit={{ enabled: true, onSave: saveEdits }}
          copy={{
            label: "Catalog entry",
            listLabel: `${kindLabel(kind)} entries (this view)`,
            location: `${APPLICATIONS_ADMIN_LOCATION}/catalogs`,
            rowKind: "catalog_entry",
            listKind: "catalog_entries",
            rowDescription: "One catalog entry shipped to installed clients.",
            listDescription: "Catalog entries currently visible.",
            humanRow: (row) =>
              [
                `${row.app}/${row.kind}/${row.key}`,
                `name=${payloadDisplayName(row.payload) ?? "?"}`,
                `active=${row.is_active} sort=${row.sort_order} min_app_version=${row.min_app_version ?? "none"}`,
                `artifact=${row.artifact_url ?? "none"}`,
              ].join("\n"),
            rowAttributes: (row) => ({
              id: row.id,
              key: row.key,
              kind: row.kind,
              is_active: row.is_active,
            }),
            listAttributes: (visible, all) => ({
              app,
              kind,
              visible: visible.length,
              total: all.length,
            }),
          }}
        />
      </div>

      <ConfirmDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => {
          if (!open && !toggling) setPendingToggle(null);
        }}
        title={
          pendingToggle
            ? pendingToggle.next
              ? `Activate ${pendingToggle.row.key}?`
              : `Deactivate ${pendingToggle.row.key}?`
            : ""
        }
        description={
          pendingToggle?.next
            ? "Activation ships this entry to every installed client on its next catalog refresh."
            : "Deactivation hides this entry from every client on its next catalog refresh."
        }
        content={
          pendingToggle?.next ? (
            <div className="space-y-2 text-xs">
              {activationPayloadCheck?.status === "invalid" ? (
                <p className="flex items-start gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 font-medium text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Payload fails the {kindLabel(pendingToggle.row.kind)} schema:{" "}
                  {activationPayloadCheck.issues.join("; ")} — open the entry
                  and fix it before activating.
                </p>
              ) : null}
              {pendingToggle.row.artifact_url ? (
                <div className="rounded-md border border-border px-3 py-2">
                  {probe.status === "probing" ? (
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Probing
                      artifact URL…
                    </p>
                  ) : null}
                  {probe.status === "ok" ? (
                    <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Artifact
                      reachable — {probe.detail}
                    </p>
                  ) : null}
                  {probe.status === "fail" ? (
                    <p className="flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> ARTIFACT
                      UNREACHABLE — {probe.detail}. Activating anyway ships a
                      broken download to every client. Override only if you
                      know the URL works outside the browser.
                    </p>
                  ) : null}
                  {probe.status === "cors" ? (
                    <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <ShieldQuestion className="h-3.5 w-3.5" /> Artifact probe
                      blocked by CORS — could not verify from the browser.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <Badge variant="outline" className="mr-1">
                    no artifact
                  </Badge>
                  This entry has no artifact URL — nothing to probe.
                </p>
              )}
            </div>
          ) : null
        }
        confirmLabel={pendingToggle?.next ? "Activate" : "Deactivate"}
        variant={pendingToggle?.next ? "default" : "destructive"}
        busy={toggling}
        onConfirm={commitToggle}
      />
    </div>
  );
}
