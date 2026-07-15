"use client";

// features/admin/catalogs/components/CatalogEntryEditor.tsx
//
// Generic + kind-aware editor for one public.catalog_entries row.
// Typed columns (key, schema_version, min_app_version, sort_order, notes,
// artifact url/sha256/size, is_active) + the payload as a validated JSON
// editor checked against the per-kind Zod schema (schemas.ts). Save goes
// through a diff-vs-current ConfirmDialog into the ONE sanctioned write path
// — the admin_upsert_catalog_entry SECURITY DEFINER RPC (super-admin gated,
// optimistic concurrency via p_expected_updated_at → 40001, history
// snapshots). Delete goes through admin_delete_catalog_entry behind a
// destructive confirm showing the full entry JSON.
//
// Dual-gate activation: saving with is_active=true requires a valid payload,
// and the confirm dialog live-probes the artifact URL. The probe prefers the
// aidream resolver (POST /api/catalog-resolver/resolve — its "direct" branch
// HEAD-probes server-side, immune to browser CORS); when the resolver is not
// deployed it falls back to a browser HEAD with honest CORS labeling. An
// unreachable artifact warns loudly but can be overridden.

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  ShieldQuestion,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken } from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { createClient } from "@/utils/supabase/client";
import JsonFieldEditor from "@/features/ai-models/components/JsonFieldEditor";
import {
  isConflictError,
  rpcErrorMessage,
} from "@/features/admin/shared/admin-rpc-errors";
import { UrlProbeField, formatBytes } from "@/features/admin/shared/UrlProbeField";
import { probeArtifactUrl } from "@/features/admin/catalogs/resolver";
import type { ArtifactProbeResult } from "@/features/admin/catalogs/resolver";
import { CatalogHistoryPanel } from "@/features/admin/catalogs/components/CatalogHistoryPanel";
import {
  CATALOG_KEY_REGEX,
  CATALOG_KINDS,
  SEMVER_REGEX,
  SHA256_REGEX,
  entrySnapshotJson,
  kindDef,
  kindLabel,
  rowSnapshotJson,
  validatePayload,
} from "@/features/admin/catalogs/schemas";
import type {
  CatalogEntryHistoryRow,
  CatalogEntryRow,
  CatalogUpsertArgs,
  EntryPrefill,
} from "@/features/admin/catalogs/types";
import type { Json } from "@/types/database.types";

interface CatalogEntryEditorProps {
  app: string;
  /** null = creating a new entry. */
  row: CatalogEntryRow | null;
  /** "Add from link" hand-off — only honored when creating (row === null). */
  prefill?: EntryPrefill | null;
  /** Kind preselected from the kind table the admin navigated from. */
  initialKind?: string;
  onBack: () => void;
  /** Called with the row returned by the RPC after every successful write. */
  onSaved: (row: CatalogEntryRow) => void;
  onDeleted: () => void;
}

interface PendingSave {
  kind: string;
  key: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  artifactUrl: string | null;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
  minAppVersion: string | null;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
}

type ArtifactProbe =
  | { status: "idle" }
  | { status: "probing" }
  | ArtifactProbeResult;

function pendingSnapshotJson(app: string, pending: PendingSave): string {
  return entrySnapshotJson({
    app,
    kind: pending.kind,
    key: pending.key,
    schema_version: pending.schemaVersion,
    payload: pending.payload,
    artifact_url: pending.artifactUrl,
    artifact_sha256: pending.artifactSha256,
    artifact_size_bytes: pending.artifactSizeBytes,
    min_app_version: pending.minAppVersion,
    is_active: pending.isActive,
    sort_order: pending.sortOrder,
    notes: pending.notes,
  });
}

export function CatalogEntryEditor({
  app,
  row,
  prefill,
  initialKind,
  onBack,
  onSaved,
  onDeleted,
}: CatalogEntryEditorProps) {
  const { toast } = useToast();
  const accessToken = useAppSelector(selectAccessToken);
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const isNew = row === null;
  const seed = isNew ? (prefill ?? null) : null;

  const [kind, setKind] = useState(
    row?.kind ?? seed?.kind ?? initialKind ?? CATALOG_KINDS[0].slug,
  );
  const [entryKey, setEntryKey] = useState(row?.key ?? seed?.key ?? "");
  const [schemaVersion, setSchemaVersion] = useState(
    String(row?.schema_version ?? 1),
  );
  const [minAppVersion, setMinAppVersion] = useState(
    row?.min_app_version ?? "",
  );
  const [sortOrder, setSortOrder] = useState(String(row?.sort_order ?? 0));
  const [notes, setNotes] = useState(row?.notes ?? seed?.notes ?? "");
  const [artifactUrl, setArtifactUrl] = useState(
    row?.artifact_url ?? seed?.artifact_url ?? "",
  );
  const [artifactSha256, setArtifactSha256] = useState(
    row?.artifact_sha256 ?? seed?.artifact_sha256 ?? "",
  );
  const [artifactSizeBytes, setArtifactSizeBytes] = useState(
    row?.artifact_size_bytes !== null && row?.artifact_size_bytes !== undefined
      ? String(row.artifact_size_bytes)
      : seed?.artifact_size_bytes !== null &&
          seed?.artifact_size_bytes !== undefined
        ? String(seed.artifact_size_bytes)
        : "",
  );
  const [isActive, setIsActive] = useState(row?.is_active ?? false);
  const [payload, setPayload] = useState<Record<string, unknown>>(() => {
    if (row && typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload)) {
      return row.payload as Record<string, unknown>;
    }
    return seed?.payload ?? {};
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  // Keyed by target URL — a result only counts for the URL it probed, so no
  // synchronous reset is needed when the confirm target changes.
  const [probeDone, setProbeDone] = useState<{
    url: string;
    result: ArtifactProbe;
  } | null>(null);

  const activeKindDef = kindDef(kind);
  const payloadValidation = validatePayload(kind, payload);

  // Dual-gate probe: while the save confirm is open for an ACTIVE entry with
  // an artifact URL, probe it and surface the outcome inside the dialog.
  // Prefers the aidream resolver (server-side HEAD, no browser CORS limits);
  // resolver 404 / unreachable falls back to the browser HEAD probe with its
  // honest CORS labeling.
  const probeTargetUrl =
    pendingSave && pendingSave.isActive && pendingSave.artifactUrl
      ? pendingSave.artifactUrl
      : null;
  useEffect(() => {
    if (!probeTargetUrl) return;
    let cancelled = false;
    const controller = new AbortController();
    void probeArtifactUrl({
      baseUrl: baseUrl ?? null,
      accessToken: accessToken ?? null,
      url: probeTargetUrl,
      signal: controller.signal,
    }).then((result) => {
      if (cancelled) return;
      setProbeDone({ url: probeTargetUrl, result });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [probeTargetUrl, baseUrl, accessToken]);

  const artifactProbe: ArtifactProbe = !probeTargetUrl
    ? { status: "idle" }
    : probeDone && probeDone.url === probeTargetUrl
      ? probeDone.result
      : { status: "probing" };

  const validate = (): PendingSave | null => {
    const errors: Record<string, string> = {};

    const key = entryKey.trim();
    if (!CATALOG_KEY_REGEX.test(key)) {
      errors.key =
        "Key must start alphanumeric and use only letters, digits, . _ : @ / space or - (max 200 chars)";
    }

    const parsedSchemaVersion = Number(schemaVersion.trim());
    if (
      !Number.isInteger(parsedSchemaVersion) ||
      parsedSchemaVersion < 1 ||
      schemaVersion.trim().length === 0
    ) {
      errors.schema_version = "Schema version must be a positive integer";
    }

    const min = minAppVersion.trim();
    if (min.length > 0 && !SEMVER_REGEX.test(min)) {
      errors.min_app_version =
        "Must be plain semver: major.minor.patch (e.g. 0.4.0) — or empty for no gate";
    }

    const parsedSortOrder = Number(sortOrder.trim());
    if (!Number.isInteger(parsedSortOrder) || sortOrder.trim().length === 0) {
      errors.sort_order = "Sort order must be an integer";
    }

    const url = artifactUrl.trim();
    if (url.length > 0 && !/^https:\/\//.test(url)) {
      errors.artifact_url = "Artifact URL must be https://";
    }

    const sha = artifactSha256.trim().toLowerCase();
    if (sha.length > 0 && !SHA256_REGEX.test(sha)) {
      errors.artifact_sha256 = "Must be 64 lowercase hex chars (SHA-256)";
    }

    let parsedSize: number | null = null;
    const sizeRaw = artifactSizeBytes.trim();
    if (sizeRaw.length > 0) {
      parsedSize = Number(sizeRaw);
      if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
        errors.artifact_size_bytes = "Must be a positive integer (bytes)";
        parsedSize = null;
      }
    }

    // Dual gate, part 1: an ACTIVE entry must have a payload that validates
    // against its kind schema. Inactive entries may be saved as drafts with
    // warnings.
    if (isActive && payloadValidation.status === "invalid") {
      errors.payload = `Cannot activate with an invalid ${kindLabel(kind)} payload: ${payloadValidation.issues.join("; ")}`;
    }
    if (isActive && activeKindDef?.hasArtifact && url.length === 0) {
      errors.artifact_url = `Active ${kindLabel(kind)} entries must point at an artifact URL`;
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: "Validation failed",
        description: "Fix the highlighted fields before saving.",
        variant: "destructive",
      });
      return null;
    }
    return {
      kind,
      key,
      schemaVersion: parsedSchemaVersion,
      payload,
      artifactUrl: url.length > 0 ? url : null,
      artifactSha256: sha.length > 0 ? sha : null,
      artifactSizeBytes: parsedSize,
      minAppVersion: min.length > 0 ? min : null,
      isActive,
      sortOrder: parsedSortOrder,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    };
  };

  /** Conflict recovery: pull the fresh row and hand it to the parent — the
   *  admin's draft edits stay intact so they can re-review and save again. */
  const reloadAfterConflict = async (kindValue: string, keyValue: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("catalog_entries")
      .select("*")
      .eq("app", app)
      .eq("kind", kindValue)
      .eq("key", keyValue)
      .maybeSingle();
    if (error || !data) {
      toast({
        title: "Reload failed",
        description:
          error?.message ?? `Entry ${app}/${kindValue}/${keyValue} not found`,
        variant: "destructive",
      });
      return;
    }
    onSaved(data);
  };

  const syncFormToRow = (data: CatalogEntryRow) => {
    setKind(data.kind);
    setEntryKey(data.key);
    setSchemaVersion(String(data.schema_version));
    setMinAppVersion(data.min_app_version ?? "");
    setSortOrder(String(data.sort_order));
    setNotes(data.notes ?? "");
    setArtifactUrl(data.artifact_url ?? "");
    setArtifactSha256(data.artifact_sha256 ?? "");
    setArtifactSizeBytes(
      data.artifact_size_bytes !== null ? String(data.artifact_size_bytes) : "",
    );
    setIsActive(data.is_active);
    if (
      typeof data.payload === "object" &&
      data.payload !== null &&
      !Array.isArray(data.payload)
    ) {
      setPayload(data.payload as Record<string, unknown>);
    }
    setFieldErrors({});
  };

  const runUpsert = async (args: CatalogUpsertArgs) => {
    const supabase = createClient();
    return supabase.rpc("admin_upsert_catalog_entry", args);
  };

  const commitSave = async (pending: PendingSave) => {
    setSaving(true);
    const { data, error } = await runUpsert({
      p_app: app,
      p_kind: pending.kind,
      p_key: pending.key,
      p_schema_version: pending.schemaVersion,
      p_payload: pending.payload as Json,
      ...(pending.artifactUrl !== null
        ? { p_artifact_url: pending.artifactUrl }
        : {}),
      ...(pending.artifactSha256 !== null
        ? { p_artifact_sha256: pending.artifactSha256 }
        : {}),
      ...(pending.artifactSizeBytes !== null
        ? { p_artifact_size_bytes: pending.artifactSizeBytes }
        : {}),
      ...(pending.minAppVersion !== null
        ? { p_min_app_version: pending.minAppVersion }
        : {}),
      p_is_active: pending.isActive,
      p_sort_order: pending.sortOrder,
      ...(pending.notes !== null ? { p_notes: pending.notes } : {}),
      // Optimistic concurrency: existing rows must not clobber a save that
      // landed after this form was loaded. New entries have no baseline.
      ...(row ? { p_expected_updated_at: row.updated_at } : {}),
    });
    setSaving(false);

    if (error) {
      if (isConflictError(error)) {
        setPendingSave(null);
        toast({
          title: "Save conflict",
          description:
            "Someone else changed this entry since you loaded it — reloading the latest version. Your edits are kept; review and save again.",
          variant: "destructive",
        });
        await reloadAfterConflict(pending.kind, pending.key);
        return;
      }
      toast({
        title: "Save failed",
        description: rpcErrorMessage(error),
        variant: "destructive",
      });
      return;
    }
    if (!data) {
      toast({
        title: "Save failed",
        description: "admin_upsert_catalog_entry returned no row",
        variant: "destructive",
      });
      return;
    }

    setPendingSave(null);
    setHistoryRefreshKey((k) => k + 1);
    toast({
      title: "Entry saved",
      description: `${app}/${pending.kind}/${pending.key} updated — clients pick it up on their next catalog refresh.`,
    });
    syncFormToRow(data);
    onSaved(data);
  };

  /** Returns true on success — never throws (a rejected promise here would
   *  escape the history panel's try/finally as an unhandled rejection). */
  const restoreSnapshot = async (
    entry: CatalogEntryHistoryRow,
  ): Promise<boolean> => {
    setSaving(true);
    const { data, error } = await runUpsert({
      p_app: entry.app,
      p_kind: entry.kind,
      p_key: entry.key,
      p_schema_version: entry.schema_version,
      p_payload: entry.payload,
      ...(entry.artifact_url !== null
        ? { p_artifact_url: entry.artifact_url }
        : {}),
      ...(entry.artifact_sha256 !== null
        ? { p_artifact_sha256: entry.artifact_sha256 }
        : {}),
      ...(entry.artifact_size_bytes !== null
        ? { p_artifact_size_bytes: entry.artifact_size_bytes }
        : {}),
      ...(entry.min_app_version !== null
        ? { p_min_app_version: entry.min_app_version }
        : {}),
      p_is_active: entry.is_active,
      p_sort_order: entry.sort_order,
      ...(entry.notes !== null ? { p_notes: entry.notes } : {}),
      ...(row ? { p_expected_updated_at: row.updated_at } : {}),
    });
    setSaving(false);

    if (error) {
      if (isConflictError(error)) {
        toast({
          title: "Restore conflict",
          description:
            "Someone else changed this entry since you loaded it — reloading the latest version. Review the diff and restore again if still wanted.",
          variant: "destructive",
        });
        await reloadAfterConflict(entry.kind, entry.key);
        return false;
      }
      toast({
        title: "Restore failed",
        description: rpcErrorMessage(error),
        variant: "destructive",
      });
      return false;
    }
    if (!data) {
      toast({
        title: "Restore failed",
        description: "admin_upsert_catalog_entry returned no row",
        variant: "destructive",
      });
      return false;
    }

    setHistoryRefreshKey((k) => k + 1);
    toast({
      title: "Version restored",
      description: `${entry.app}/${entry.kind}/${entry.key} reverted to the ${format(
        new Date(entry.changed_at),
        "yyyy-MM-dd HH:mm",
      )} snapshot.`,
    });
    syncFormToRow(data);
    onSaved(data);
    return true;
  };

  const commitDelete = async () => {
    if (!row) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_delete_catalog_entry", {
      p_app: row.app,
      p_kind: row.kind,
      p_key: row.key,
    });
    setDeleting(false);
    if (error) {
      toast({
        title: "Delete failed",
        description: rpcErrorMessage(error),
        variant: "destructive",
      });
      return;
    }
    setDeleteOpen(false);
    toast({
      title: "Entry deleted",
      description: `${row.app}/${row.kind}/${row.key} removed — the final state is snapshotted to history.`,
    });
    onDeleted();
  };

  const currentJson = row
    ? rowSnapshotJson(row)
    : entrySnapshotJson({
        app,
        kind,
        key: "",
        schema_version: 0,
        payload: {},
        artifact_url: null,
        artifact_sha256: null,
        artifact_size_bytes: null,
        min_app_version: null,
        is_active: false,
        sort_order: 0,
        notes: null,
      });

  const editorBody = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="catalog-kind">Kind</Label>
          {isNew ? (
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="catalog-kind" className="font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATALOG_KINDS.map((k) => (
                  <SelectItem key={k.slug} value={k.slug}>
                    {k.label}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({k.slug})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="catalog-kind"
              value={kind}
              disabled
              className="font-mono text-sm"
            />
          )}
          {activeKindDef ? (
            <p className="text-xs text-muted-foreground">
              {activeKindDef.description}
            </p>
          ) : (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Unknown kind — no
              client-side payload validation available.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="catalog-key">Key</Label>
          <Input
            id="catalog-key"
            value={entryKey}
            onChange={(e) => setEntryKey(e.target.value)}
            disabled={!isNew}
            placeholder="org/model-name"
            className={cn(
              "font-mono text-sm",
              fieldErrors.key && "border-destructive",
            )}
            spellCheck={false}
            autoComplete="off"
          />
          {fieldErrors.key ? (
            <p className="text-xs text-destructive">{fieldErrors.key}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="catalog-schema-version">Schema version</Label>
          <Input
            id="catalog-schema-version"
            value={schemaVersion}
            onChange={(e) => setSchemaVersion(e.target.value)}
            inputMode="numeric"
            className={cn(
              "font-mono text-sm",
              fieldErrors.schema_version && "border-destructive",
            )}
            autoComplete="off"
          />
          {fieldErrors.schema_version ? (
            <p className="text-xs text-destructive">
              {fieldErrors.schema_version}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="catalog-min-version">Min app version</Label>
          <Input
            id="catalog-min-version"
            value={minAppVersion}
            onChange={(e) => setMinAppVersion(e.target.value)}
            placeholder="none (all versions)"
            className={cn(
              "font-mono text-sm",
              fieldErrors.min_app_version && "border-destructive",
            )}
            spellCheck={false}
            autoComplete="off"
          />
          {fieldErrors.min_app_version ? (
            <p className="text-xs text-destructive">
              {fieldErrors.min_app_version}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Entries above the installed binary&apos;s version are hidden from
              that client.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="catalog-sort-order">Sort order</Label>
          <Input
            id="catalog-sort-order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            inputMode="numeric"
            className={cn(
              "font-mono text-sm",
              fieldErrors.sort_order && "border-destructive",
            )}
            autoComplete="off"
          />
          {fieldErrors.sort_order ? (
            <p className="text-xs text-destructive">{fieldErrors.sort_order}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="catalog-is-active">Active</Label>
          <div className="flex h-9 items-center gap-2">
            <Switch
              id="catalog-is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <span className="text-xs text-muted-foreground">
              {isActive
                ? "Visible to every client in the field"
                : "Draft — hidden from clients"}
            </span>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Artifact</h3>
        <UrlProbeField
          id="catalog-artifact-url"
          label="Artifact URL"
          mode="head"
          value={artifactUrl}
          onChange={setArtifactUrl}
          error={fieldErrors.artifact_url}
          placeholder="https://huggingface.co/…/resolve/main/…"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="catalog-artifact-sha">SHA-256</Label>
            <Input
              id="catalog-artifact-sha"
              value={artifactSha256}
              onChange={(e) => setArtifactSha256(e.target.value)}
              placeholder="64 hex chars — pin whenever the source provides one"
              className={cn(
                "font-mono text-sm",
                fieldErrors.artifact_sha256 && "border-destructive",
              )}
              spellCheck={false}
              autoComplete="off"
            />
            {fieldErrors.artifact_sha256 ? (
              <p className="text-xs text-destructive">
                {fieldErrors.artifact_sha256}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="catalog-artifact-size">Size (bytes)</Label>
            <Input
              id="catalog-artifact-size"
              value={artifactSizeBytes}
              onChange={(e) => setArtifactSizeBytes(e.target.value)}
              inputMode="numeric"
              placeholder="optional"
              className={cn(
                "font-mono text-sm",
                fieldErrors.artifact_size_bytes && "border-destructive",
              )}
              autoComplete="off"
            />
            {fieldErrors.artifact_size_bytes ? (
              <p className="text-xs text-destructive">
                {fieldErrors.artifact_size_bytes}
              </p>
            ) : artifactSizeBytes.trim().length > 0 &&
              Number.isInteger(Number(artifactSizeBytes.trim())) ? (
              <p className="text-xs text-muted-foreground">
                {formatBytes(Number(artifactSizeBytes.trim()))}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Payload</h3>
          {payloadValidation.status === "valid" ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Valid {kindLabel(kind)}{" "}
              payload
            </span>
          ) : null}
          {payloadValidation.status === "unknown_kind" ? (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <ShieldQuestion className="h-3.5 w-3.5" /> Unknown kind — not
              validated client-side
            </span>
          ) : null}
        </div>
        {payloadValidation.status === "invalid" ? (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              isActive
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
          >
            <p className="mb-1 flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {isActive
                ? "Payload fails the kind schema — activation is blocked until fixed."
                : "Payload fails the kind schema — saving as an inactive draft is allowed."}
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              {payloadValidation.issues.map((issue) => (
                <li key={issue} className="font-mono">
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {fieldErrors.payload ? (
          <p className="text-xs text-destructive">{fieldErrors.payload}</p>
        ) : null}
        <JsonFieldEditor
          title={`Payload (${kind})`}
          description="Validated against the kind schema — unknown keys round-trip unchanged"
          data={payload}
          defaultExpanded
          onSave={async (data) => {
            const next: Record<string, unknown> = Object.fromEntries(
              Object.entries(data),
            );
            setPayload(next);
          }}
        />
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="catalog-notes">Notes</Label>
        <Textarea
          id="catalog-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Operator notes — license caveats, why this entry exists, rollout state…"
          rows={3}
          className="text-sm"
        />
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
          <h2 className="truncate font-mono text-base font-semibold">
            {isNew ? `New ${kindLabel(kind)} entry` : `${row.kind}/${row.key}`}
          </h2>
          {row ? (
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title={format(new Date(row.updated_at), "yyyy-MM-dd HH:mm:ss")}
            >
              updated{" "}
              {formatDistanceToNow(new Date(row.updated_at), {
                addSuffix: true,
              })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {row ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || deleting}
              onClick={() => setDeleteOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={saving || deleting}
            onClick={() => {
              const pending = validate();
              if (pending) setPendingSave(pending);
            }}
          >
            <Save className="mr-1.5 h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      {isNew ? (
        editorBody
      ) : (
        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="editor" className="pt-3">
            {editorBody}
          </TabsContent>
          <TabsContent value="history" className="pt-3">
            {row ? (
              <CatalogHistoryPanel
                app={row.app}
                kind={row.kind}
                entryKey={row.key}
                currentRow={row}
                onRestore={restoreSnapshot}
                refreshKey={historyRefreshKey}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      )}

      <ConfirmDialog
        open={pendingSave !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingSave(null);
        }}
        title={
          isNew
            ? `Create ${app}/${kind}/${entryKey.trim()}?`
            : `Update ${app}/${kind}/${entryKey}?`
        }
        description="Active entries steer what every installed client downloads and executes — review the diff before committing."
        contentClassName="sm:max-w-4xl"
        content={
          pendingSave ? (
            <div className="space-y-2">
              {pendingSave.isActive && pendingSave.artifactUrl ? (
                <div className="rounded-md border border-border px-3 py-2 text-xs">
                  {artifactProbe.status === "probing" ? (
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Probing
                      artifact URL…
                    </p>
                  ) : null}
                  {artifactProbe.status === "ok" ? (
                    <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Artifact
                      reachable — {artifactProbe.detail}
                    </p>
                  ) : null}
                  {artifactProbe.status === "fail" ? (
                    <p className="flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> ARTIFACT
                      UNREACHABLE — {artifactProbe.detail}. Activating anyway
                      ships a broken download to every client. Override only if
                      you know the URL works outside the browser.
                    </p>
                  ) : null}
                  {artifactProbe.status === "cors" ? (
                    <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <ShieldQuestion className="h-3.5 w-3.5" /> Artifact probe
                      blocked by CORS — could not verify from the browser.
                      Verify reachability another way before relying on it.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
                <DiffViewer
                  original={currentJson}
                  modified={pendingSnapshotJson(app, pendingSave)}
                  engine="light"
                  language="json"
                  view="split"
                  originalLabel="Current"
                  modifiedLabel="New"
                />
              </div>
            </div>
          ) : null
        }
        confirmLabel={isNew ? "Create" : "Save"}
        busy={saving}
        onConfirm={async () => {
          if (pendingSave) await commitSave(pendingSave);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false);
        }}
        title={row ? `Delete ${row.app}/${row.kind}/${row.key}?` : "Delete entry?"}
        description="The entry disappears from every client on its next catalog refresh. Its final state is snapshotted to history, but there is no undo button — restoring means re-creating it."
        contentClassName="sm:max-w-3xl"
        content={
          row ? (
            <pre className="max-h-[45vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
              {rowSnapshotJson(row)}
            </pre>
          ) : null
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={commitDelete}
      />
    </div>
  );
}
