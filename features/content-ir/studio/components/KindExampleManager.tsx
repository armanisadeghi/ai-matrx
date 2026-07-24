"use client";

/**
 * KindExampleManager — the shared multi-example authoring engine: list a kind's
 * `content_ir.kind_example` rows and add / edit / promote-canonical / delete
 * them. Extracted from ShapeOwnerEditor so the user-facing /shapes owner editor
 * and the admin kind-registry page consume ONE engine (SHAPE_SYSTEM: never a
 * second sample store or authoring fork).
 *
 * `authMode` is the only behavioral difference: "owner" writes prove
 * `created_by = you`; "admin" relies on RLS editor access so a super-admin can
 * manage a platform kind's examples. Every write still runs the structural gate
 * before save and trusts the DB trigger's `validation_status` verdict after.
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  CircleAlert,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProInput } from "@/components/official/ProInput";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { KindExampleListItem } from "@/features/content-ir/admin/kind-detail-types";
import { validateStructuralLeg } from "@/features/content-ir/registry/kind-dual-gate";
import type { ExamplesState } from "@/features/content-ir/studio/kind-examples";
import {
  createOwnedShapeExample,
  makeOwnedShapeExampleCanonical,
  softDeleteOwnedShapeExample,
  updateOwnedShapeExample,
  type ShapeAuthMode,
} from "@/features/content-ir/studio/shape-authoring-service";

// CodeMirror is heavy and only belongs in the bundle after someone opens the
// editor. The canonical JsonInspector owns JSON parsing/lint.
const JsonInspector = dynamic(
  () =>
    import("@/components/official-candidate/json-inspector/JsonInspector").then(
      (module) => ({ default: module.JsonInspector }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading JSON editor
      </div>
    ),
  },
);

interface ExampleDraft {
  id: string | null;
  label: string;
  description: string;
  data: unknown;
}

function exampleDraft(row?: KindExampleListItem): ExampleDraft {
  return {
    id: row?.id ?? null,
    label: row?.label ?? "",
    description: row?.description ?? "",
    data: row?.data ?? {},
  };
}

interface KindExampleManagerProps {
  kindDefinitionId: string;
  emittedJsonSchema: Json | null;
  examples: ExamplesState;
  onExamplesChanged: () => void;
  authMode: ShapeAuthMode;
}

export default function KindExampleManager({
  kindDefinitionId,
  emittedJsonSchema,
  examples,
  onExamplesChanged,
  authMode,
}: KindExampleManagerProps) {
  const [draft, setDraft] = useState<ExampleDraft | null>(null);
  const [exampleSaving, setExampleSaving] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [pendingExampleId, setPendingExampleId] = useState<string | null>(null);

  async function saveExample(): Promise<void> {
    if (!draft) return;
    const validation = validateStructuralLeg(draft.data, emittedJsonSchema);
    if (!validation.ok) {
      setExampleError(
        `This sample does not match the Shape schema: ${validation.detail ?? "validation failed"}`,
      );
      return;
    }

    setExampleSaving(true);
    setExampleError(null);
    try {
      const result = draft.id
        ? await updateOwnedShapeExample(
            supabase,
            {
              definitionId: kindDefinitionId,
              exampleId: draft.id,
              data: draft.data,
              label: draft.label,
              description: draft.description,
            },
            authMode,
          )
        : await createOwnedShapeExample(
            supabase,
            {
              definitionId: kindDefinitionId,
              data: draft.data,
              label: draft.label,
              description: draft.description,
            },
            authMode,
          );
      if (result.validationStatus !== "passed") {
        const message = `Example ${result.id} passed client validation but the database trigger returned "${result.validationStatus}". This is validator drift.`;
        captureError({ source: "content-ir", message });
        throw new Error(message);
      }
      toast.success(draft.id ? "Example updated" : "Example created");
      setDraft(null);
      onExamplesChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExampleError(message);
      toast.error("Failed to save the example", { description: message });
    } finally {
      setExampleSaving(false);
    }
  }

  async function makeCanonical(row: KindExampleListItem): Promise<void> {
    setPendingExampleId(row.id);
    try {
      await makeOwnedShapeExampleCanonical(
        supabase,
        kindDefinitionId,
        row.id,
        authMode,
      );
      toast.success(`“${row.label ?? "Untitled example"}” is now canonical`);
      onExamplesChanged();
    } catch (error) {
      toast.error("Failed to change the canonical example", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingExampleId(null);
    }
  }

  async function deleteExample(row: KindExampleListItem): Promise<void> {
    const accepted = await confirm({
      title: "Delete this example?",
      description:
        "The example will be soft-deleted. Saved Shape instances are not affected.",
      confirmLabel: "Delete example",
      variant: "destructive",
    });
    if (!accepted) return;
    setPendingExampleId(row.id);
    try {
      await softDeleteOwnedShapeExample(
        supabase,
        kindDefinitionId,
        row.id,
        authMode,
      );
      toast.success("Example deleted");
      if (draft?.id === row.id) setDraft(null);
      onExamplesChanged();
    } catch (error) {
      toast.error("Failed to delete the example", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingExampleId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Examples</h3>
          <p className="text-xs text-muted-foreground">
            The canonical example is the default preview and validation fixture.
            Add as many alternates as you like.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setDraft(exampleDraft())}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add example
        </Button>
      </div>

      {examples.status === "loading" && (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading examples
        </div>
      )}
      {examples.status === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {examples.message}
        </div>
      )}
      {examples.status === "ready" && examples.rows.length === 0 && !draft && (
        <button
          type="button"
          onClick={() => setDraft(exampleDraft())}
          className="w-full rounded-md border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          No examples yet — add the first canonical sample.
        </button>
      )}
      {examples.status === "ready" && examples.rows.length > 0 && (
        <div className="divide-y divide-border rounded-md border border-border">
          {examples.rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">
                    {row.label ?? "Untitled example"}
                  </span>
                  {row.isCanonical && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      <Crown className="h-3 w-3" /> canonical
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    v{row.kindVersion} · {row.validationStatus}
                  </span>
                </div>
                {row.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.description}
                  </p>
                )}
              </div>
              {!row.isCanonical && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pendingExampleId === row.id}
                  onClick={() => void makeCanonical(row)}
                >
                  <Crown className="mr-1.5 h-3.5 w-3.5" /> Make canonical
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Edit ${row.label ?? "example"}`}
                onClick={() => {
                  setExampleError(null);
                  setDraft(exampleDraft(row));
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!row.isCanonical && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${row.label ?? "example"}`}
                  disabled={pendingExampleId === row.id}
                  onClick={() => void deleteExample(row)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="space-y-3 rounded-md border border-primary/25 bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {draft.id ? "Edit example" : "New example"}
            </h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kind-example-label">Label</Label>
              <ProInput
                id="kind-example-label"
                value={draft.label}
                enableVoice={false}
                showCopyButton={false}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, label: event.target.value } : current,
                  )
                }
                placeholder="Canonical example"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kind-example-description">Description</Label>
              <Textarea
                id="kind-example-description"
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current,
                  )
                }
                rows={2}
                placeholder="What this sample demonstrates"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Sample JSON</Label>
            <div className="h-96 min-h-72 overflow-hidden rounded-md border border-border">
              <JsonInspector
                data={draft.data}
                editOnly
                onUpdate={(data) =>
                  setDraft((current) => (current ? { ...current, data } : current))
                }
                className="h-full min-h-0 rounded-none"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              JSON syntax is linted inline. The production Shape validator runs
              before save.
            </p>
          </div>
          {exampleError && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {exampleError}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={exampleSaving}
              onClick={() => void saveExample()}
            >
              {exampleSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save example
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
