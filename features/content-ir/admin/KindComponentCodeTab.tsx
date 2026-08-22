"use client";

/**
 * Code tab for /administration/utilities/kind-registry/[kind].
 *
 * Loads the selected kind_component row's real DB source, edits it through
 * the canonical Monaco front door, validates the same code the renderer will
 * compile, and saves with optimistic concurrency.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Code2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import {
  listKindComponentCode,
  saveKindComponentCode,
  type KindComponentCodeRecord,
} from "@/features/content-ir/studio/kind-component-code-service";
import { supabase } from "@/utils/supabase/client";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { isJsonObject } from "@/types/json";
import { toast } from "@/lib/toast";
import {
  fireInvalidation,
  INVALIDATION_KEYS,
} from "@/lib/invalidation/invalidation-registry";

interface KindComponentCodeTabProps {
  kindDefinitionId: string;
  kind: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: KindComponentCodeRecord[] };

function componentOptionLabel(row: KindComponentCodeRecord): string {
  return `${row.platform} · ${row.role} · ${row.componentKey} · ${row.source}`;
}

function isHtmlComponent(row: KindComponentCodeRecord): boolean {
  return isJsonObject(row.config) && row.config.flavor === "html";
}

function componentSourceText(row: KindComponentCodeRecord | undefined): string {
  return typeof row?.componentSource === "string" ? row.componentSource : "";
}

export default function KindComponentCodeTab({
  kindDefinitionId,
  kind,
}: KindComponentCodeTabProps) {
  const mode = useThemeMode();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void listKindComponentCode(supabase, kindDefinitionId)
      .then((rows) => {
        if (!alive) return;
        setLoadState({ status: "ready", rows });
        const firstEditable = rows.find(
          (row) => row.source === "db" && row.role === "output",
        );
        const first = firstEditable ?? rows[0];
        setSelectedId(first ? first.id : "");
        setDraft(componentSourceText(first));
      })
      .catch((error) => {
        if (!alive) return;
        const message =
          error instanceof Error
            ? error.message
            : "Component code could not be loaded.";
        setLoadState({ status: "error", message });
        toast.error("Component code could not be loaded", {
          description: message,
        });
      });
    return () => {
      alive = false;
    };
  }, [kindDefinitionId]);

  if (loadState.status === "loading") {
    return (
      <div
        className="mx-auto max-w-6xl space-y-3"
        aria-label="Loading component code editor"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[60dvh] min-h-80 w-full" />
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="mx-auto max-w-4xl rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {loadState.message}
      </div>
    );
  }

  const rows = loadState.rows;
  const selected = rows.find((row) => row.id === selectedId);
  if (!selected) {
    return (
      <div className="mx-auto max-w-4xl rounded-md border border-border bg-card p-5">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Code2 className="h-4 w-4" /> No component row
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          This Shape has no registered component source to edit yet.
        </p>
      </div>
    );
  }

  const selectedComponent: KindComponentCodeRecord = selected;
  const savedCode = componentSourceText(selectedComponent);
  const dirty = draft !== savedCode;
  const editable = selectedComponent.source === "db";

  function selectComponent(id: string) {
    const next = rows.find((row) => row.id === id);
    setSelectedId(id);
    setDraft(componentSourceText(next));
  }

  async function save(): Promise<void> {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    try {
      if (!isHtmlComponent(selectedComponent)) {
        if (!/\bdata\b/.test(draft)) {
          throw new Error(
            "Component code must read from `data`; the renderer passes the Shape value as props.data.",
          );
        }
        const [
          { compileSlotComponent },
          { getDefaultImportsForKindComponents },
        ] = await Promise.all([
          import("@/features/agent-apps/utils/compile-slot"),
          import("@/features/agent-apps/utils/allowed-imports"),
        ]);
        const declaredImports =
          isJsonObject(selectedComponent.config) &&
          Array.isArray(selectedComponent.config.allowed_imports) &&
          selectedComponent.config.allowed_imports.every(
            (value) => typeof value === "string",
          )
            ? selectedComponent.config.allowed_imports
            : getDefaultImportsForKindComponents();
        const compiled = compileSlotComponent({
          code: draft,
          allowedImports: declaredImports,
        });
        if (!compiled.Component || compiled.error) {
          throw new Error(
            `Component code does not compile: ${compiled.error ?? "no component was exported"}`,
          );
        }
      }

      const saved = await saveKindComponentCode(supabase, {
        component: selectedComponent,
        componentSource: draft,
      });
      setLoadState({
        status: "ready",
        rows: rows.map((row) => (row.id === saved.id ? saved : row)),
      });
      fireInvalidation(INVALIDATION_KEYS.kindComponents);
      toast.success(`${kind} component code saved`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The code could not be saved.";
      toast.error("Component code was not saved", { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[32rem] max-w-6xl flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
        <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          Component
          <select
            value={selectedComponent.id}
            onChange={(event) => selectComponent(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-3 text-base text-foreground sm:text-sm"
          >
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {componentOptionLabel(row)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            v{selectedComponent.version} · {selectedComponent.semver}
            {dirty ? " · Unsaved" : ""}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={!editable || !dirty || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving" : "Save code"}
          </Button>
        </div>
      </div>

      {editable ? (
        <div className="h-[calc(100dvh-13rem)] min-h-[28rem] min-w-0">
          <SmallCodeEditor
            key={selectedComponent.id}
            language={
              isHtmlComponent(selectedComponent) ? "html" : "typescript"
            }
            fileExtension={
              isHtmlComponent(selectedComponent) ? ".html" : ".tsx"
            }
            path={`kind-component://${selectedComponent.id}${isHtmlComponent(selectedComponent) ? ".html" : ".tsx"}`}
            initialCode={draft}
            onChange={(value) =>
              setDraft(typeof value === "string" ? value : "")
            }
            mode={mode}
            height="100%"
            defaultWordWrap="on"
            showResetButton={false}
          />
        </div>
      ) : (
        <div className="flex min-h-80 items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-foreground">Bundled component</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              This row points to component code compiled into the frontend
              repository, so it has no database source body to edit here.
              DB-authored component rows are fully editable in this tab.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
