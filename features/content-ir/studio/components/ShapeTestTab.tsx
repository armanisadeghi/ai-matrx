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

import { useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Copy, Eye, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import KindInputForm from "@/features/content-ir/input/KindInputForm";
import KindInstanceRender, {
  isRecordValue,
} from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  isValidatorDrift,
  saveKindInstance,
} from "@/features/content-ir/studio/instance-service";
import { shapeInstancesHref } from "@/features/content-ir/studio/constants";

interface ShapeTestTabProps {
  kind: string;
  label: string;
  /** `content_ir.kind_definition.id` — the Save target. */
  kindDefinitionId: string;
  /** The kind's CURRENT `version` — pinned onto saved instances. */
  kindVersion: number;
  /** `metadata.title_key` — the per-kind instance-title override (or null). */
  titleKey: string | null;
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; instanceId: string; pinnedVersion: number; versionBumped: boolean }
  | { status: "drift"; message: string }
  | { status: "error"; message: string };

export default function ShapeTestTab({
  kind,
  label,
  kindDefinitionId,
  kindVersion,
  titleKey,
}: ShapeTestTabProps) {
  const [instance, setInstance] = useState<unknown>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* The form */}
      <section className="rounded-md border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Fill in your {label}
          </span>
        </div>
        <KindInputForm
          kind={kind}
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
            <KindInstanceRender key={renderKey} kind={kind} value={instance} />
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
  );
}
