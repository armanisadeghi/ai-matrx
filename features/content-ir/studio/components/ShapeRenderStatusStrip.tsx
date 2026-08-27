"use client";

/**
 * First-screen render status — sits directly under the Preview header on
 * `/shapes/[kind]`, visible to EVERY viewer (owner or not). It answers, in
 * plain words, WHAT renders this shape right now, WHY, and — when something
 * is wrong — WHAT'S WRONG, with one-click owner fixes inline.
 *
 * Built after the 2026-08-26 incident: an owner mid customer-call opened this
 * page and got no answer at all — the render truth was buried behind an admin
 * tab that called a live component "hardcoded into the frontend" and a manual
 * `metadata.data_only` flag that hid the build-component action for a shape
 * that WAS rendering. That manual flag was eradicated 2026-08-27 (Arman's
 * ruling) — `dataOnly` is now purely family-derived, with no clear-the-flag
 * action because there is no longer a flag to clear. See
 * features/content-ir/studio/shape-render-status.ts for the pure derivation
 * this strip is a thin view over.
 */

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  BrainCircuit,
  CircleAlert,
  Code2,
  LayoutTemplate,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { supabase } from "@/utils/supabase/client";
import {
  componentRegistry,
  resolveComponent,
  subscribeKindComponents,
} from "@/features/content-ir/registry/component-registry";
import { GENERIC_STRUCTURED_COMPONENT_KEY } from "@/features/content-ir/registry/schema-source-kind-components";
import {
  listShapeComponentCandidates,
  setDefaultShapeComponent,
  type ShapeComponentCandidate,
} from "@/features/content-ir/studio/shape-authoring-service";
import {
  deriveShapeRenderStatus,
  type ShapeRenderStatus,
} from "@/features/content-ir/studio/shape-render-status";
import { SHAPES_SURFACE_NAME, SHAPE_COMPONENT_ROLE } from "@/features/content-ir/studio/constants";
import { composeKindAgentIntent } from "@/features/content-ir/studio/kind-agent-intents";
import { useKindAgentLaunch } from "@/features/content-ir/studio/useKindAgentLaunch";
import type { Json } from "@/types/database.types";

interface ShapeRenderStatusStripProps {
  kind: string;
  kindDefinitionId: string;
  label: string;
  kindIsActive: boolean;
  dataOnly: boolean;
  isOwnedByViewer: boolean;
  emittedJsonSchema: Json | null;
}

const SOURCE_ICON: Record<ShapeRenderStatus["source"], typeof BadgeCheck> = {
  custom: Code2,
  builtin: LayoutTemplate,
  generic: CircleAlert,
};

export default function ShapeRenderStatusStrip({
  kind,
  kindDefinitionId,
  label,
  kindIsActive,
  dataOnly,
  isOwnedByViewer,
  emittedJsonSchema,
}: ShapeRenderStatusStripProps) {
  const { launch: launchArtisan, launching: artisanLaunching } =
    useKindAgentLaunch(SHAPES_SURFACE_NAME, SHAPE_COMPONENT_ROLE);

  const [componentsWarm, setComponentsWarm] = useState(false);
  const [candidates, setCandidates] = useState<ShapeComponentCandidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  // Only meaningful for a bundled resolution — the dangling-key check is
  // lazy-loaded so this always-rendered strip never pulls the render tree
  // (block-dispatch.tsx) into its own chunk.
  const [dispatchResolves, setDispatchResolves] = useState<boolean | null>(null);
  const [dispatchComponentKey, setDispatchComponentKey] = useState<string | null>(
    null,
  );
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void componentRegistry
      .ensureWarm()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setComponentsWarm(true);
      });
    return subscribeKindComponents(() => setComponentsWarm((v) => v));
  }, []);

  const refreshCandidates = useCallback(() => {
    let cancelled = false;
    void listShapeComponentCandidates(supabase, kindDefinitionId)
      .then((rows) => {
        if (!cancelled) {
          setCandidates(rows);
          setCandidatesError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setCandidatesError(message);
        captureError({
          source: "content-ir",
          message: `Failed to list component candidates for "${kind}": ${message}`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, kindDefinitionId]);

  useEffect(() => refreshCandidates(), [refreshCandidates]);

  const resolution = componentsWarm ? resolveComponent(kind, "web", "output") : null;

  useEffect(() => {
    if (!resolution || resolution.source !== "bundled") return;
    if (resolution.componentKey === GENERIC_STRUCTURED_COMPONENT_KEY) return;
    let cancelled = false;
    // Lazy — never a top-level import. block-dispatch.tsx pulls the whole
    // lazy React component tree behind it.
    void import(
      "@/components/mardown-display/chat-markdown/block-registry/block-dispatch"
    )
      .then(({ resolveBlockDispatch }) => {
        if (!cancelled) {
          setDispatchComponentKey(resolution.componentKey);
          setDispatchResolves(resolveBlockDispatch(resolution.componentKey) !== null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDispatchComponentKey(resolution.componentKey);
          setDispatchResolves(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resolution?.componentKey, resolution?.source]);

  if (!componentsWarm) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking what renders this shape…
      </div>
    );
  }

  const status = deriveShapeRenderStatus({
    kindIsActive,
    dataOnly,
    resolution: resolution
      ? {
          componentKey: resolution.componentKey,
          source: resolution.source,
          isActive: resolution.isActive,
          isDefault:
            candidates?.find((c) => c.componentKey === resolution.componentKey)
              ?.isDefault ?? undefined,
        }
      : null,
    candidateCount: candidates?.length ?? 0,
    dispatchResolves:
      resolution?.componentKey === dispatchComponentKey ? dispatchResolves : null,
  });

  const Icon = SOURCE_ICON[status.source];
  const hasProblems = status.problems.length > 0;

  async function switchDefault(candidateId: string): Promise<void> {
    setSwitchingId(candidateId);
    try {
      const rows = await setDefaultShapeComponent(supabase, kindDefinitionId, candidateId, "owner");
      setCandidates(rows);
      toast.success("Default component updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Failed to switch the default component", { description: message });
      captureError({
        source: "content-ir",
        message: `Failed to switch default component for "${kind}": ${message}`,
      });
    } finally {
      setSwitchingId(null);
    }
  }

  // Every row is listed, including the generic fallback — switching TO
  // generic is a legitimate choice (e.g. temporarily disabling a broken
  // custom component), so it must not be hidden from the switcher either.
  const switchableCandidates = candidates ?? [];

  return (
    <div
      className={`mb-4 rounded-lg border px-3 py-2.5 ${
        hasProblems
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            hasProblems ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            This shape renders through: {status.sourceLabel}
            {status.componentKey ? (
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {status.componentKey}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Why: {status.why}.
          </p>
          {hasProblems && (
            <ul className="mt-1.5 space-y-1">
              {status.problems.map((problem) => (
                <li
                  key={problem}
                  className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200"
                >
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{problem}</span>
                </li>
              ))}
            </ul>
          )}
          {candidatesError && (
            <p className="mt-1.5 text-xs text-destructive">{candidatesError}</p>
          )}
        </div>

        {isOwnedByViewer && (
          <div className="flex flex-wrap items-center gap-1.5">
            {status.source !== "custom" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={artisanLaunching}
                onClick={() =>
                  void launchArtisan(
                    composeKindAgentIntent({
                      kind,
                      label,
                      part: "component",
                      emittedJsonSchema,
                    }),
                  )
                }
              >
                {artisanLaunching ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BrainCircuit className="mr-1.5 h-3.5 w-3.5" />
                )}
                Build a component with an agent
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Component switching — visible to every viewer read-only; owners get the control. */}
      {switchableCandidates.length > 1 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Components registered for this shape
          </p>
          <ul className="mt-1 space-y-1">
            {switchableCandidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {c.componentKey}
                </span>
                <span className="text-muted-foreground">
                  {c.componentKey === GENERIC_STRUCTURED_COMPONENT_KEY
                    ? "generic viewer"
                    : c.source === "db"
                      ? "custom"
                      : "built-in"}
                  {!c.isActive ? " · off" : ""}
                </span>
                {c.isDefault ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    default
                  </span>
                ) : isOwnedByViewer && c.componentKey !== GENERIC_STRUCTURED_COMPONENT_KEY ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={switchingId === c.id}
                    onClick={() => void switchDefault(c.id)}
                  >
                    {switchingId === c.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    Make default
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
