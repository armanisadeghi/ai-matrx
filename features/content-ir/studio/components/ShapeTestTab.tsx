"use client";

/**
 * Test tab — the magic moment: fill the canonical `KindInputForm` and watch
 * YOUR component render the instance live through the REAL production route
 * (`KindInstanceRender` → SafeBlockRenderer → applyIrKindRoute; db-sourced
 * kind_component renderers resolve automatically).
 *
 * HEAVY (KindInputForm pulls ajv + the production input stack) — the route
 * loads this whole tab via `next/dynamic({ ssr: false })`.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Copy,
  Eye,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { Json } from "@/types/database.types";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import { KIND_CREATOR_SLOT_KEY } from "@/features/content-ir/studio/constants";
import { composeKindSampleFillIntent } from "@/features/content-ir/studio/kind-agent-intents";
import KindInputForm from "@/features/content-ir/input/KindInputForm";
import KindInstanceRender, {
  isRecordValue,
} from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  isValidatorDrift,
  saveKindInstance,
} from "@/features/content-ir/studio/instance-service";
import { shapeInstancesHref } from "@/features/content-ir/studio/constants";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";

interface ShapeTestTabProps {
  kind: string;
  label: string;
  /** `content_ir.kind_definition.id` — the Save target. */
  kindDefinitionId: string;
  /** The kind's CURRENT `version` — pinned onto saved instances. */
  kindVersion: number;
  /** `metadata.title_key` — the per-kind instance-title override (or null). */
  titleKey: string | null;
  /** The kind's emitted JSON Schema — inlined into the AI fill brief. */
  emittedJsonSchema?: Json | null;
}

/** Generous ceiling — a large Shape's sample is a real drafting task. */
const AI_FILL_TIMEOUT_MS = 180_000;

/**
 * Narrow whatever the agent emitted to a form seed: a bare object of THIS
 * Shape's fields. `__kind` is the carried discriminator, never a form field —
 * it is dropped rather than fed to the input resolver as an unknown property.
 */
function coerceSeedValue(value: unknown): Record<string, unknown> {
  if (!isRecordValue(value))
    throw new Error(
      "The agent returned something other than a JSON object of this Shape's fields.",
    );
  const { [KIND_KEY]: _discriminator, ...fields } = value;
  if (Object.keys(fields).length === 0)
    throw new Error("The agent returned an empty object.");
  return fields;
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | {
      status: "saved";
      instanceId: string;
      pinnedVersion: number;
      versionBumped: boolean;
    }
  | { status: "drift"; message: string }
  | { status: "error"; message: string };

export default function ShapeTestTab({
  kind,
  label,
  kindDefinitionId,
  kindVersion,
  titleKey,
  emittedJsonSchema,
}: ShapeTestTabProps) {
  const [instance, setInstance] = useState<unknown>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  // Agent-staged seed for the input form. `KindInputForm.initialValue` is read
  // ONCE per form load (documented: not a controlled value), so a seed must
  // arrive with a new `key` to remount the form — hence the counter.
  const [formSeed, setFormSeed] = useState<Record<string, unknown> | null>(null);
  const [formSeedKey, setFormSeedKey] = useState(0);
  // Live-by-default (no spinner while AI works): the fill run keeps its
  // instance alive so `<LiveRunDisplay>` renders the model's own tokens
  // through the canonical pipeline while it drafts.
  const aiFill = useLiveAgentRun();

  // THE ONE seeding path — the surface write target (`test_draft_instance`)
  // and the "Fill with AI" button stage the form identically. Neither sets the
  // rendered instance: the user presses Render (the real ajv gate) and Save
  // exactly as if they had typed every field themselves.
  function seedForm(value: Record<string, unknown>): void {
    setFormSeed(value);
    setFormSeedKey((k) => k + 1);
    // The staged payload is not the rendered one until the user presses
    // Render, so clear any stale render/save state rather than implying the
    // preview below reflects what just landed in the form.
    setInstance(null);
    setSaveState({ status: "idle" });
  }

  async function fillWithAi(): Promise<void> {
    try {
      const seed = await aiFill.run<Record<string, unknown>>({
        slotKey: KIND_CREATOR_SLOT_KEY,
        surfaceKey: `shapes-test-fill:${kind}`,
        sourceFeature: "ai-results",
        surfaceName: "matrx-user/shapes",
        userInput: composeKindSampleFillIntent({
          kind,
          label,
          emittedJsonSchema,
        }),
        autoClearConversation: true,
        timeoutMs: AI_FILL_TIMEOUT_MS,
        failureMessages: {
          streamError: "The agent failed before drafting a sample.",
          noJson: "The agent finished without producing a JSON object.",
          timeout: "Timed out waiting for the agent to draft a sample.",
        },
        coerce: coerceSeedValue,
      });
      seedForm(seed);
      toast.success(`Draft ${label} staged in the form`, {
        description: "Review it, then press Render.",
      });
    } catch (error) {
      // `useLiveAgentRun` surfaces the message; the display keeps the partial
      // stream on screen so the user can see how far the agent got.
      toast.error("The AI could not draft a sample", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function saveInstance(): Promise<void> {
    if (!isRecordValue(instance)) {
      toast.error("Only object instances can be saved.");
      return;
    }
    setSaveState({ status: "saving" });
    try {
      const result = await saveKindInstance({
        kindDefinitionId,
        kindVersion,
        value: instance,
        organizationId,
        titleKey,
      });
      if (isValidatorDrift(result)) {
        // The DB trigger is the truth. Client-side ajv said valid, the
        // trigger said otherwise — validator drift is a platform DEFECT:
        // scream to the error store AND show the user.
        const message = `Instance ${result.id} of kind "${kind}" was written but the DB validation trigger marked it "${result.validationStatus}" while the client-side ajv check passed. This is a validator-drift defect — report it.`;
        captureError({ source: "content-ir", message });
        setSaveState({ status: "drift", message });
        return;
      }
      setSaveState({
        status: "saved",
        instanceId: result.id,
        pinnedVersion: result.kindVersion,
        versionBumped: result.versionBumped,
      });
      toast.success(
        result.title ? `Saved "${result.title}"` : "Instance saved",
        {
          description: `${label} v${result.kindVersion} — validation passed.`,
          action: {
            label: "View in Instances",
            onClick: () => {
              window.location.href = `${shapeInstancesHref(kind)}?i=${result.id}`;
            },
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveState({ status: "error", message });
      toast.error("Failed to save the instance", { description: message });
    }
  }

  async function copyInstance(): Promise<void> {
    if (instance === null) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(instance, null, 2));
      toast.success(`Copied ${kind} instance`);
    } catch (error) {
      toast.error(
        `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Surface scope (matrx-user/shapes) — the Test tab nests DEEPER than the
  // route-level ShapeSurfaceRuntime, so it wins while mounted and carries the
  // kind identity forward alongside the live draft. Built at TRIGGER time.
  const getSurfaceScope = useCallback(
    () =>
      createShapesScope({
        studio_tab: "test",
        kind_slug: kind,
        kind_label: label,
        kind_definition_id: kindDefinitionId,
        kind_version: kindVersion,
        kind_title_key: titleKey ?? undefined,
        test_draft_instance: isRecordValue(instance) ? instance : undefined,
        test_save_state: saveState as unknown as Record<string, unknown>,
      }),
    [kind, label, kindDefinitionId, kindVersion, titleKey, instance, saveState],
  );

  // Write half of the shapes surface, Test-tab leg (manifest `writeTargets`).
  // The agent SEEDS the canonical input form — it does not set the rendered
  // instance directly. That is deliberate: `KindInputForm.onSubmit` is the one
  // thing that guarantees a structurally valid instance (it runs the real
  // activation-gate ajv leg), so writing `instance` behind the form's back
  // would hand Save a payload nothing validated. The agent fills the form; the
  // user presses Render, which validates exactly as their own typing would.
  // Throws on a bad shape — the seam converts that to an error envelope.
  const getSurfaceWriteHandlers = () => ({
    test_draft_instance: (value: unknown) => {
      if (!isRecordValue(value))
        throw new Error(
          "test_draft_instance expects a JSON object of this shape's fields (no __kind key, no array or scalar root).",
        );
      if (Object.keys(value).length === 0)
        throw new Error("test_draft_instance expects at least one field.");
      seedForm(value);
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/shapes"
      getScope={getSurfaceScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* The form */}
        <section className="rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Fill in your {label}
            </span>
          </div>
          <KindInputForm
            key={formSeedKey}
            kind={kind}
            initialValue={formSeed ?? undefined}
            submitLabel="Render"
            onSubmit={(value) => {
              setInstance(value);
              setRenderKey((k) => k + 1);
              setSaveState({ status: "idle" });
            }}
          />
        </section>

        {/* The live render */}
        <section className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Live render
            </span>
            {instance !== null && (
              <>
                <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Check className="h-3 w-3" />
                  valid instance
                </span>
                <button
                  type="button"
                  onClick={() => void copyInstance()}
                  className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON
                </button>
                {saveState.status === "saved" ? (
                  <Link
                    href={`${shapeInstancesHref(kind)}?i=${saveState.instanceId}`}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <Check className="h-3.5 w-3.5" />
                    View in Instances
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void saveInstance()}
                    disabled={saveState.status === "saving"}
                    className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saveState.status === "saving" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </button>
                )}
              </>
            )}
          </div>
          {saveState.status === "saved" && saveState.versionBumped && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This shape was updated to v{saveState.pinnedVersion} since you
                opened this page — the instance was saved against v
                {saveState.pinnedVersion}.
              </span>
            </div>
          )}
          {(saveState.status === "drift" || saveState.status === "error") && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {saveState.status === "drift" && (
                  <strong className="font-semibold">Validator drift: </strong>
                )}
                {saveState.message}
              </span>
            </div>
          )}
          {instance === null ? (
            <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Submit the form — your shape renders here, exactly as it will in
                chat and everywhere else.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <KindInstanceRender
                key={renderKey}
                kind={kind}
                value={instance}
              />
              <details className="rounded-md border border-border bg-card">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Instance JSON
                </summary>
                <pre className="max-h-[24rem] overflow-auto border-t border-border p-3 font-mono text-[11px] text-foreground">
                  {JSON.stringify(instance, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>
      </div>
    </SurfaceRuntimeProvider>
  );
}
