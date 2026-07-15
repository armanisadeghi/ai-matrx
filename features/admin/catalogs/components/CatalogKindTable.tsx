"use client";

// features/admin/catalogs/components/CatalogKindTable.tsx
//
// Entries for one (app, kind): key, name from payload, artifact size,
// min_app_version, is_active toggle (confirm + live artifact probe via
// probeArtifactUrl: aidream resolver first, browser HEAD fallback — the
// dual-gate moment), inline-editable sort_order, provenance. All writes
// go through admin_upsert_catalog_entry with p_expected_updated_at; a 40001
// conflict toasts and refreshes.

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken } from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import {
  isConflictError,
  rpcErrorMessage,
} from "@/features/admin/shared/admin-rpc-errors";
import { useAdminEmails } from "@/features/admin/shared/useAdminEmails";
import { formatBytes } from "@/features/admin/shared/UrlProbeField";
import { probeArtifactUrl } from "@/features/admin/catalogs/resolver";
import type { ArtifactProbeResult } from "@/features/admin/catalogs/resolver";
import { upsertArgsFromRow, upsertCatalogEntry } from "@/features/admin/catalogs/rpc";
import {
  kindDef,
  kindLabel,
  payloadDisplayName,
  validatePayload,
} from "@/features/admin/catalogs/schemas";
import type { CatalogEntryRow } from "@/features/admin/catalogs/types";

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
  const [sortDrafts, setSortDrafts] = useState<Record<string, string>>({});
  const [savingSortId, setSavingSortId] = useState<string | null>(null);

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

  const commitSortOrder = async (row: CatalogEntryRow, raw: string) => {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (trimmed.length === 0 || !Number.isInteger(parsed)) {
      toast({
        title: "Invalid sort order",
        description: "Sort order must be an integer.",
        variant: "destructive",
      });
      setSortDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
      return;
    }
    if (parsed === row.sort_order) {
      setSortDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
      return;
    }
    setSavingSortId(row.id);
    const { error } = await upsertCatalogEntry(
      upsertArgsFromRow(row, { sort_order: parsed }),
    );
    setSavingSortId(null);
    setSortDrafts((d) => {
      const next = { ...d };
      delete next[row.id];
      return next;
    });
    if (error) {
      await handleWriteError(error);
      return;
    }
    onChanged();
  };

  const activationPayloadCheck = pendingToggle?.next
    ? validatePayload(pendingToggle.row.kind, pendingToggle.row.payload)
    : null;

  return (
    <div className="space-y-4">
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
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={onAddFromLink}>
            <Link2 className="mr-1.5 h-4 w-4" /> Add from link
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onNewEntry}>
            <Plus className="mr-1.5 h-4 w-4" /> New entry
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Artifact size</th>
              <th className="px-3 py-2 font-medium">Min version</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium">Sort</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No {kindLabel(kind)} entries yet — use Add from link or New
                  entry.
                </td>
              </tr>
            ) : (
              entries.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/50"
                  onClick={() => onOpenEntry(row)}
                >
                  <td className="max-w-64 px-3 py-2">
                    <code className="block truncate font-medium" title={row.key}>
                      {row.key}
                    </code>
                  </td>
                  <td className="max-w-56 px-3 py-2">
                    <span className="block truncate">
                      {payloadDisplayName(row.payload) ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {formatBytes(row.artifact_size_bytes)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.min_app_version ?? "—"}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={row.is_active}
                      onCheckedChange={(next) =>
                        setPendingToggle({ row, next })
                      }
                      aria-label={`Toggle ${row.key} active`}
                    />
                  </td>
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <Input
                        value={sortDrafts[row.id] ?? String(row.sort_order)}
                        onChange={(e) =>
                          setSortDrafts((d) => ({
                            ...d,
                            [row.id]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          if (row.id in sortDrafts) {
                            void commitSortOrder(row, e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        inputMode="numeric"
                        className="h-7 w-16 px-2 font-mono text-xs"
                        disabled={savingSortId === row.id}
                        aria-label={`Sort order for ${row.key}`}
                      />
                      {savingSortId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      title={format(
                        new Date(row.updated_at),
                        "yyyy-MM-dd HH:mm:ss",
                      )}
                    >
                      {formatDistanceToNow(new Date(row.updated_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.updated_by ? (
                      adminEmails[row.updated_by] ? (
                        <span
                          className="text-xs text-muted-foreground"
                          title={row.updated_by}
                        >
                          {adminEmails[row.updated_by]}
                        </span>
                      ) : (
                        <code
                          className="text-xs text-muted-foreground"
                          title={row.updated_by}
                        >
                          {row.updated_by.slice(0, 8)}
                        </code>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
