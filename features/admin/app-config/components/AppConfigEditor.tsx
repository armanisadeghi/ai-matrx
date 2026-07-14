"use client";

// features/admin/app-config/components/AppConfigEditor.tsx
//
// Per-app editor for public.app_config. Typed fields for the AppConfigV1
// keys (URLs + flags + notice), a raw-JSON section for forward-compat keys
// (unknown keys round-trip unchanged), Zod validation before save, and a
// diff-vs-current ConfirmDialog in front of the ONE sanctioned write path:
// the admin_update_app_config SECURITY DEFINER RPC (super-admin gated,
// snapshots to app_config_history).

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import JsonFieldEditor from "@/features/ai-models/components/JsonFieldEditor";
import { AppConfigHistoryPanel } from "@/features/admin/app-config/components/AppConfigHistoryPanel";
import { FlagsEditor } from "@/features/admin/app-config/components/FlagsEditor";
import { NoticeEditor } from "@/features/admin/app-config/components/NoticeEditor";
import { UrlProbeField } from "@/features/admin/app-config/components/UrlProbeField";
import {
  APP_SLUG_REGEX,
  SEMVER_REGEX,
  URL_KEYS,
  URL_KEY_LABELS,
  appConfigV1Schema,
  configSnapshotJson,
  configToDraft,
  draftToConfig,
  zodIssuesToFieldErrors,
  type ConfigDraft,
} from "@/features/admin/app-config/schema";
import type {
  AppConfigHistoryRow,
  AppConfigRow,
} from "@/features/admin/app-config/types";

interface AppConfigEditorProps {
  /** null = creating a new app row. */
  row: AppConfigRow | null;
  onBack: () => void;
  /** Called with the row returned by the RPC after every successful write. */
  onSaved: (row: AppConfigRow) => void;
}

interface PendingSave {
  app: string;
  schemaVersion: number;
  minVersion: string;
  config: Record<string, unknown>;
}

function rpcErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501") {
    return "Super Admin required — your account cannot modify app config.";
  }
  return error.message;
}

/** ERRCODE 40001 ("Conflict: …") raised by admin_update_app_config when the
 *  row changed since it was loaded (optimistic-concurrency check). */
function isConflictError(error: { code?: string; message: string }): boolean {
  return error.code === "40001" || error.message.startsWith("Conflict:");
}

export function AppConfigEditor({ row, onBack, onSaved }: AppConfigEditorProps) {
  const { toast } = useToast();
  const isNew = row === null;

  const [appSlug, setAppSlug] = useState(row?.app ?? "");
  const [schemaVersion, setSchemaVersion] = useState(
    String(row?.schema_version ?? 1),
  );
  const [minVersion, setMinVersion] = useState(
    row?.min_supported_app_version ?? "",
  );
  const [draft, setDraft] = useState<ConfigDraft>(() =>
    configToDraft(row?.config ?? {}),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const validate = (): PendingSave | null => {
    const errors: Record<string, string> = {};

    const app = appSlug.trim();
    if (!APP_SLUG_REGEX.test(app)) {
      errors.app =
        "App slug must be lowercase kebab-case, 2-63 chars, starting with a letter or digit";
    }

    const parsedSchemaVersion = Number(schemaVersion.trim());
    if (
      !Number.isInteger(parsedSchemaVersion) ||
      parsedSchemaVersion < 1 ||
      schemaVersion.trim().length === 0
    ) {
      errors.schema_version = "Schema version must be a positive integer";
    }

    const min = minVersion.trim();
    if (!SEMVER_REGEX.test(min)) {
      errors.min_supported_app_version =
        "Must be plain semver: major.minor.patch (e.g. 0.4.0)";
    }

    const config = draftToConfig(draft);
    // Validate only the EDITABLE draft: preserved malformed flag values pass
    // through verbatim on save, and no component renders a `flags.<key>`
    // error, so letting them fail Zod here would soft-brick Save with
    // "fix the highlighted fields" and nothing highlighted.
    // Payloads for schema versions other than v1 are not validated
    // client-side (an inline warning says so) — v1 is the only contract
    // this editor knows.
    if (parsedSchemaVersion === 1) {
      const validatableConfig = draftToConfig({ ...draft, malformedFlags: {} });
      const parsed = appConfigV1Schema.safeParse(validatableConfig);
      if (!parsed.success) {
        Object.assign(errors, zodIssuesToFieldErrors(parsed.error));
      }
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
      app,
      schemaVersion: parsedSchemaVersion,
      minVersion: min,
      config,
    };
  };

  /** Conflict recovery: pull the fresh row and push it through the same
   *  post-save refetch path (onSaved → parent refetch) — the admin's draft
   *  edits stay intact so they can re-review the diff and save again. */
  const reloadAfterConflict = async (app: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("*")
      .eq("app", app)
      .maybeSingle();
    if (error || !data) {
      toast({
        title: "Reload failed",
        description: error?.message ?? `Row for "${app}" not found`,
        variant: "destructive",
      });
      return;
    }
    onSaved(data);
  };

  const commitSave = async (pending: PendingSave) => {
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_update_app_config", {
      p_app: pending.app,
      p_schema_version: pending.schemaVersion,
      p_min_supported_app_version: pending.minVersion,
      p_config: pending.config,
      // Optimistic concurrency: existing rows must not clobber a save that
      // landed after this form was loaded. New apps have no baseline.
      ...(row ? { p_expected_updated_at: row.updated_at } : {}),
    });
    setSaving(false);

    if (error) {
      if (isConflictError(error)) {
        setPendingSave(null);
        toast({
          title: "Save conflict",
          description:
            "Someone else changed this row since you loaded it — reloading the latest version. Your edits are kept; review and save again.",
          variant: "destructive",
        });
        await reloadAfterConflict(pending.app);
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
        description: "admin_update_app_config returned no row",
        variant: "destructive",
      });
      return;
    }

    setPendingSave(null);
    setHistoryRefreshKey((k) => k + 1);
    toast({
      title: "Config saved",
      description: `"${pending.app}" updated — clients pick it up on their next refresh.`,
    });
    // Re-sync the form to what actually landed.
    setAppSlug(data.app);
    setSchemaVersion(String(data.schema_version));
    setMinVersion(data.min_supported_app_version);
    setDraft(configToDraft(data.config));
    setFieldErrors({});
    onSaved(data);
  };

  /** Returns true on success — never throws (a rejected promise here would
   *  escape the history panel's try/finally as an unhandled rejection). */
  const restoreSnapshot = async (entry: AppConfigHistoryRow): Promise<boolean> => {
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_update_app_config", {
      p_app: entry.app,
      p_schema_version: entry.schema_version,
      p_min_supported_app_version: entry.min_supported_app_version,
      p_config: entry.config,
      ...(row ? { p_expected_updated_at: row.updated_at } : {}),
    });
    setSaving(false);

    if (error) {
      if (isConflictError(error)) {
        toast({
          title: "Restore conflict",
          description:
            "Someone else changed this row since you loaded it — reloading the latest version. Review the diff and restore again if still wanted.",
          variant: "destructive",
        });
        await reloadAfterConflict(entry.app);
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
        description: "admin_update_app_config returned no row",
        variant: "destructive",
      });
      return false;
    }

    setHistoryRefreshKey((k) => k + 1);
    toast({
      title: "Version restored",
      description: `"${entry.app}" reverted to the ${format(
        new Date(entry.changed_at),
        "yyyy-MM-dd HH:mm",
      )} snapshot.`,
    });
    setSchemaVersion(String(data.schema_version));
    setMinVersion(data.min_supported_app_version);
    setDraft(configToDraft(data.config));
    setFieldErrors({});
    onSaved(data);
    return true;
  };

  const schemaVersionValue = Number(schemaVersion.trim());
  const showSchemaVersionWarning =
    schemaVersion.trim().length > 0 &&
    Number.isInteger(schemaVersionValue) &&
    schemaVersionValue !== 1;

  const currentJson = row
    ? configSnapshotJson(row)
    : configSnapshotJson({
        schema_version: 0,
        min_supported_app_version: "",
        config: {},
      });

  const editorBody = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="app-config-slug">App</Label>
          <Input
            id="app-config-slug"
            value={appSlug}
            onChange={(e) => setAppSlug(e.target.value)}
            disabled={!isNew}
            placeholder="matrx-local"
            className={cn(
              "font-mono text-sm",
              fieldErrors.app && "border-destructive",
            )}
            spellCheck={false}
            autoComplete="off"
          />
          {fieldErrors.app ? (
            <p className="text-xs text-destructive">{fieldErrors.app}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-config-schema-version">Schema version</Label>
          <Input
            id="app-config-schema-version"
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
          {showSchemaVersionWarning ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This editor validates against payload schema v1 — payloads for
              other schema versions are not validated client-side.
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app-config-min-version">
            Min supported app version
          </Label>
          <Input
            id="app-config-min-version"
            value={minVersion}
            onChange={(e) => setMinVersion(e.target.value)}
            placeholder="0.1.0"
            className={cn(
              "font-mono text-sm",
              fieldErrors.min_supported_app_version && "border-destructive",
            )}
            spellCheck={false}
            autoComplete="off"
          />
          {fieldErrors.min_supported_app_version ? (
            <p className="text-xs text-destructive">
              {fieldErrors.min_supported_app_version}
            </p>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Server URLs</h3>
        {URL_KEYS.map((key) => (
          <UrlProbeField
            key={key}
            id={`app-config-${key}`}
            label={URL_KEY_LABELS[key]}
            value={draft.urls[key]}
            onChange={(value) =>
              setDraft((d) => ({ ...d, urls: { ...d.urls, [key]: value } }))
            }
            error={fieldErrors[key]}
          />
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Flags</h3>
        <FlagsEditor
          flags={draft.flags}
          malformedFlags={draft.malformedFlags}
          onChange={(flags) => setDraft((d) => ({ ...d, flags }))}
          onRemoveMalformed={(key) =>
            setDraft((d) => {
              const malformedFlags = { ...d.malformedFlags };
              delete malformedFlags[key];
              return { ...d, malformedFlags };
            })
          }
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Notice</h3>
        <NoticeEditor
          notice={draft.notice}
          onChange={(notice) => setDraft((d) => ({ ...d, notice }))}
          errors={fieldErrors}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Forward-compat keys</h3>
        <JsonFieldEditor
          title="Unknown / additional config keys"
          description="Keys outside schema v1 — preserved verbatim on save"
          data={draft.extras}
          defaultExpanded={Object.keys(draft.extras).length > 0}
          onSave={async (data) => {
            const extras: Record<string, unknown> = Object.fromEntries(
              Object.entries(data),
            );
            setDraft((d) => ({ ...d, extras }));
          }}
        />
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All apps
          </Button>
          <h2 className="font-mono text-base font-semibold">
            {isNew ? "New app config" : appSlug}
          </h2>
          {row ? (
            <span
              className="text-xs text-muted-foreground"
              title={format(new Date(row.updated_at), "yyyy-MM-dd HH:mm:ss")}
            >
              updated{" "}
              {formatDistanceToNow(new Date(row.updated_at), {
                addSuffix: true,
              })}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => {
            const pending = validate();
            if (pending) setPendingSave(pending);
          }}
        >
          <Save className="mr-1.5 h-4 w-4" /> Save
        </Button>
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
              <AppConfigHistoryPanel
                app={row.app}
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
        title={isNew ? `Create config for "${appSlug.trim()}"?` : `Update "${appSlug}"?`}
        description="This row changes every installed client in the field — each one picks up the new values on its next config refresh, with no app update. Review the diff before committing."
        contentClassName="sm:max-w-4xl"
        content={
          pendingSave ? (
            <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
              <DiffViewer
                original={currentJson}
                modified={configSnapshotJson({
                  schema_version: pendingSave.schemaVersion,
                  min_supported_app_version: pendingSave.minVersion,
                  config: pendingSave.config,
                })}
                engine="light"
                language="json"
                view="split"
                originalLabel="Current"
                modifiedLabel="New"
              />
            </div>
          ) : null
        }
        confirmLabel={isNew ? "Create" : "Save"}
        busy={saving}
        onConfirm={async () => {
          if (pendingSave) await commitSave(pendingSave);
        }}
      />
    </div>
  );
}
