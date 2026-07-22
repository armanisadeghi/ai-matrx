"use client";

/**
 * Owner-only authoring controls embedded on `/shapes/[kind]`: definition
 * details plus full canonical-example management. The server decides whether
 * this component is rendered; every write independently rechecks ownership
 * and is still enforced by canonical RLS.
 */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Check,
  CircleAlert,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProInput } from "@/components/official/ProInput";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { KindExampleListItem } from "@/features/content-ir/admin/kind-detail-types";
import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import { validateStructuralLeg } from "@/features/content-ir/registry/kind-dual-gate";
import { KIND_LOADING_COMPONENTS } from "@/features/content-ir/react/loading/kind-loading-registry";
import type { ExamplesState } from "@/features/content-ir/studio/kind-examples";
import ShapeActivationControl from "@/features/content-ir/studio/components/ShapeActivationControl";
import {
  createOwnedShapeExample,
  makeOwnedShapeExampleCanonical,
  softDeleteOwnedShapeExample,
  updateOwnedShapeExample,
  updateOwnedShapeProfile,
  type ShapeVisibility,
} from "@/features/content-ir/studio/shape-authoring-service";

// CodeMirror is heavy and only belongs in the bundle after an owner chooses
// an example to add/edit. The canonical JsonInspector owns JSON parsing/lint.
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

const SHAPE_VISIBILITIES: ReadonlyArray<{
  value: ShapeVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "personal",
    label: "Personal",
    description: "Only you and explicitly granted people.",
  },
  {
    value: "internal",
    label: "Organization",
    description:
      "Available to people who have access through your organization.",
  },
  {
    value: "public",
    label: "Public",
    description: "Visible in the shared Shapes library.",
  },
];

interface ShapeOwnerEditorProps {
  kind: string;
  kindDefinitionId: string;
  label: string;
  visibility: string;
  titleKey: string | null;
  loadingComponent: string | null;
  emittedJsonSchema: Json | null;
  /** The live dual-gate verdict — drives the activation control's state. */
  isActive: boolean;
  examples: ExamplesState;
  onExamplesChanged: () => void;
}

interface ExampleDraft {
  id: string | null;
  label: string;
  description: string;
  data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Top-level data keys available for the saved-instance title override. */
export function titleKeyOptionsFromJsonSchema(schema: Json | null): string[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  return Object.keys(schema.properties).filter((key) => key !== KIND_KEY);
}

function exampleDraft(row?: KindExampleListItem): ExampleDraft {
  return {
    id: row?.id ?? null,
    label: row?.label ?? "",
    description: row?.description ?? "",
    data: row?.data ?? {},
  };
}

export default function ShapeOwnerEditor({
  kind,
  kindDefinitionId,
  label: initialLabel,
  visibility: initialVisibility,
  titleKey: initialTitleKey,
  loadingComponent: initialLoadingComponent,
  emittedJsonSchema,
  isActive,
  examples,
  onExamplesChanged,
}: ShapeOwnerEditorProps) {
  const router = useRouter();
  const [label, setLabel] = useState(initialLabel);
  const [visibility, setVisibility] = useState<ShapeVisibility>(
    SHAPE_VISIBILITIES.some((option) => option.value === initialVisibility)
      ? (initialVisibility as ShapeVisibility)
      : "personal",
  );
  const [titleKey, setTitleKey] = useState(initialTitleKey ?? "");
  const [loadingComponent, setLoadingComponent] = useState(
    initialLoadingComponent ?? "",
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExampleDraft | null>(null);
  const [exampleSaving, setExampleSaving] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [pendingExampleId, setPendingExampleId] = useState<string | null>(null);

  const titleKeyOptions = titleKeyOptionsFromJsonSchema(emittedJsonSchema);
  const loadingOptions = Object.keys(KIND_LOADING_COMPONENTS).sort();

  async function saveProfile(): Promise<void> {
    setProfileSaving(true);
    setProfileError(null);
    try {
      const result = await updateOwnedShapeProfile(supabase, {
        definitionId: kindDefinitionId,
        label,
        visibility,
        titleKey: titleKey || null,
        loadingComponent: loadingComponent || null,
      });
      toast.success("Shape details saved", {
        description: `Now v${result.version}; ${result.repinnedExampleCount} example${result.repinnedExampleCount === 1 ? "" : "s"} re-pinned and validated.`,
      });
      onExamplesChanged();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProfileError(message);
      toast.error("Failed to save Shape details", { description: message });
    } finally {
      setProfileSaving(false);
    }
  }

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
        ? await updateOwnedShapeExample(supabase, {
            definitionId: kindDefinitionId,
            exampleId: draft.id,
            data: draft.data,
            label: draft.label,
            description: draft.description,
          })
        : await createOwnedShapeExample(supabase, {
            definitionId: kindDefinitionId,
            data: draft.data,
            label: draft.label,
            description: draft.description,
          });
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
      await makeOwnedShapeExampleCanonical(supabase, kindDefinitionId, row.id);
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
      await softDeleteOwnedShapeExample(supabase, kindDefinitionId, row.id);
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
    <section
      id="shape-editor"
      className="mx-auto mb-5 max-w-4xl scroll-mt-[calc(var(--shell-header-h)+0.75rem)] rounded-lg border border-primary/25 bg-card shadow-sm"
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Settings2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Edit your Shape
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You own <span className="font-mono">{kind}</span>. Manage its
            details and sample data here; platform Shapes remain read-only.
          </p>
        </div>
      </div>

      {/* Activation sits ABOVE the tabs: it is the one control whose state the
          owner must see without hunting, and its blockers point at the very
          assets the tabs below manage. */}
      <div className="px-4 pt-4">
        <ShapeActivationControl
          kind={kind}
          kindDefinitionId={kindDefinitionId}
          isActive={isActive}
          onActivationChanged={() => router.refresh()}
        />
      </div>

      <Tabs defaultValue="examples" className="p-4">
        <TabsList>
          <TabsTrigger value="examples">Sample data</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="examples" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">Examples</h3>
              <p className="text-xs text-muted-foreground">
                The canonical example is the default preview and validation
                fixture.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setDraft(exampleDraft())}
            >
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
          {examples.status === "ready" &&
            examples.rows.length === 0 &&
            !draft && (
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
                <div
                  key={row.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
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
                  <Label htmlFor="shape-example-label">Label</Label>
                  <ProInput
                    id="shape-example-label"
                    value={draft.label}
                    enableVoice={false}
                    showCopyButton={false}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, label: event.target.value }
                          : current,
                      )
                    }
                    placeholder="Canonical example"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shape-example-description">Description</Label>
                  <Textarea
                    id="shape-example-description"
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
                      setDraft((current) =>
                        current ? { ...current, data } : current,
                      )
                    }
                    className="h-full min-h-0 rounded-none"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  JSON syntax is linted inline. The production Shape validator
                  runs before save.
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
        </TabsContent>

        <TabsContent value="details" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="shape-label">Display name</Label>
              <ProInput
                id="shape-label"
                value={label}
                enableVoice={false}
                showCopyButton={false}
                onChange={(event) => setLabel(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                The technical slug <span className="font-mono">{kind}</span>{" "}
                stays stable.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shape-visibility">Visibility</Label>
              <select
                id="shape-visibility"
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as ShapeVisibility)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {SHAPE_VISIBILITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {
                  SHAPE_VISIBILITIES.find(
                    (option) => option.value === visibility,
                  )?.description
                }
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shape-title-key">Instance title field</Label>
              <select
                id="shape-title-key"
                value={titleKey}
                onChange={(event) => setTitleKey(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Automatic</option>
                {titleKeyOptions.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Used to name saved instances when the user does not provide a
                title.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shape-loading-component">Streaming loader</Label>
              <select
                id="shape-loading-component"
                value={loadingComponent}
                onChange={(event) => setLoadingComponent(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Generic</option>
                {loadingOptions
                  .filter((slug) => slug !== "generic")
                  .map((slug) => (
                    <option key={slug} value={slug}>
                      {slug}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Skeleton shown while this Shape streams or its component loads.
              </p>
            </div>
          </div>
          {profileError && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {profileError}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={profileSaving}
              onClick={() => void saveProfile()}
            >
              {profileSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save details
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
