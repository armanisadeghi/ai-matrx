"use client";

/**
 * Owner-only authoring controls embedded on `/shapes/[kind]`: definition
 * details plus full multi-example management (the shared KindExampleManager).
 * The server decides whether this component is rendered; every write
 * independently rechecks ownership and is still enforced by canonical RLS.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, CircleAlert, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProInput } from "@/components/official/ProInput";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import { KIND_LOADING_COMPONENTS } from "@/features/content-ir/react/loading/kind-loading-registry";
import type { ExamplesState } from "@/features/content-ir/studio/kind-examples";
import ShapeActivationControl from "@/features/content-ir/studio/components/ShapeActivationControl";
import type { ShapeActivationVerdict } from "@/features/content-ir/studio/shape-authoring-service";
import KindExampleManager from "@/features/content-ir/studio/components/KindExampleManager";
import KindContentBlockGenerator from "@/features/content-ir/studio/components/KindContentBlockGenerator";
import { ownerUpsertKindContentBlock } from "@/features/content-ir/studio/kind-content-block-service";
import {
  updateOwnedShapeProfile,
  type ShapeVisibility,
} from "@/features/content-ir/studio/shape-authoring-service";

const SHAPE_VISIBILITIES: ReadonlyArray<{
  value: ShapeVisibility;
  label: string;
  description: string;
}> = [
  // No "Personal" option — a personal kind is editable only by the one account
  // that created it (org admins and super admins resolve to viewer), which
  // strands the shape the moment its author is unavailable. The DB CHECK
  // `kind_definition_no_personal_visibility` rejects the value outright.
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
  /** Forwarded from the activation control so the Shape Studio surface
   *  emitter can publish the live dual-gate verdict without a second RPC. */
  onActivationVerdict?: (verdict: ShapeActivationVerdict | null) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Top-level data keys available for the saved-instance title override. */
export function titleKeyOptionsFromJsonSchema(schema: Json | null): string[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  return Object.keys(schema.properties).filter((key) => key !== KIND_KEY);
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
  onActivationVerdict,
}: ShapeOwnerEditorProps) {
  const router = useRouter();
  const [label, setLabel] = useState(initialLabel);
  const [visibility, setVisibility] = useState<ShapeVisibility>(
    SHAPE_VISIBILITIES.some((option) => option.value === initialVisibility)
      ? (initialVisibility as ShapeVisibility)
      : "internal",
  );
  const [titleKey, setTitleKey] = useState(initialTitleKey ?? "");
  const [loadingComponent, setLoadingComponent] = useState(
    initialLoadingComponent ?? "",
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const titleKeyOptions = titleKeyOptionsFromJsonSchema(emittedJsonSchema);
  const loadingOptions = Object.keys(KIND_LOADING_COMPONENTS).sort();

  // Sample the content-block generator teaches from — canonical first.
  const canonicalExampleData = useMemo(() => {
    if (examples.status !== "ready" || examples.rows.length === 0) return undefined;
    const canonical = examples.rows.find((row) => row.isCanonical);
    return (canonical ?? examples.rows[0]).data;
  }, [examples]);

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
          onVerdict={onActivationVerdict}
        />
      </div>

      <Tabs defaultValue="examples" className="p-4">
        <TabsList>
          <TabsTrigger value="examples">Sample data</TabsTrigger>
          <TabsTrigger value="teaching">Teaching block</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="examples" className="mt-4">
          <KindExampleManager
            kindDefinitionId={kindDefinitionId}
            emittedJsonSchema={emittedJsonSchema}
            examples={examples}
            onExamplesChanged={onExamplesChanged}
            authMode="owner"
          />
        </TabsContent>

        <TabsContent value="teaching" className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Generate a teaching block that shows your agents exactly how to emit
            this Shape. Stored with your shortcuts and updatable any time.
          </p>
          <KindContentBlockGenerator
            kind={kind}
            label={label}
            emittedJsonSchema={emittedJsonSchema}
            canonicalExample={canonicalExampleData}
            store={ownerUpsertKindContentBlock}
          />
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
