"use client";

/**
 * Activation control — the browser's surface for `is_active`, the dual-gate
 * verdict that decides whether a Shape is LIVE.
 *
 * Why this exists: until it shipped, NOTHING in the platform could write
 * `is_active`. The agent toolset hardcoded false, the studio had no write, and
 * the admin console declares read-only as an invariant. Activation was a human
 * hand-writing a migration per kind, so six agent-authored kinds sat dark with
 * a validated example AND a working component — both legs satisfied, no way to
 * record it.
 *
 * What activation buys the owner (stated plainly in the UI, because it is not
 * obvious): an inactive kind still RENDERS — it falls back to the generic JSON
 * viewer — but it cannot be bound to an agent's structured output, because
 * `isKindBindable` gates the agent picker on `is_active`. "Activate" means
 * "trusted enough to render as itself, and bindable."
 *
 * The gate is never re-implemented here. Both calls go to
 * `content_ir.evaluate_kind_activation` / `set_kind_activation`, the same
 * functions the `kind_activate` agent tool uses, so the browser and the agent
 * can never disagree about what activatable means.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Loader2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import {
  evaluateShapeActivation,
  setShapeActivation,
  type ShapeActivationVerdict,
} from "@/features/content-ir/studio/shape-authoring-service";

interface ShapeActivationControlProps {
  kind: string;
  kindDefinitionId: string;
  isActive: boolean;
  /** Re-fetch the definition after a successful flip. */
  onActivationChanged: () => void;
  /**
   * Publish the freshly-evaluated dual-gate verdict upward. This control is
   * the ONLY place the verdict is fetched, so the `matrx-user/shapes` surface
   * emitter on the Preview route reads it from here rather than issuing a
   * duplicate RPC. Optional — the control works without it.
   */
  onVerdict?: (verdict: ShapeActivationVerdict | null) => void;
}

export default function ShapeActivationControl({
  kind,
  kindDefinitionId,
  isActive,
  onActivationChanged,
  onVerdict,
}: ShapeActivationControlProps) {
  const [verdict, setVerdict] = useState<ShapeActivationVerdict | null>(null);
  const [loadingVerdict, setLoadingVerdict] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref-held so a caller passing an inline callback cannot re-trigger the
  // verdict fetch on every render.
  const onVerdictRef = useRef(onVerdict);
  useEffect(() => {
    onVerdictRef.current = onVerdict;
  });

  const refreshVerdict = useCallback(async () => {
    setLoadingVerdict(true);
    try {
      const next = await evaluateShapeActivation(supabase, kindDefinitionId);
      setVerdict(next);
      onVerdictRef.current?.(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      onVerdictRef.current?.(null);
      captureError({
        source: "content-ir",
        message: `Shape activation verdict failed for "${kind}": ${message}`,
      });
    } finally {
      setLoadingVerdict(false);
    }
  }, [kind, kindDefinitionId]);

  useEffect(() => {
    void refreshVerdict();
  }, [refreshVerdict]);

  async function flip(next: boolean): Promise<void> {
    if (!next) {
      const ok = await confirm({
        title: `Deactivate "${kind}"?`,
        description:
          "It will stop rendering through its component and fall back to the generic JSON viewer, and agents can no longer be bound to emit it. Existing saved instances are untouched.",
        confirmLabel: "Deactivate",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await setShapeActivation(supabase, kindDefinitionId, next);
      toast.success(
        next
          ? `"${kind}" is live — it renders as itself and can be bound to an agent.`
          : `"${kind}" deactivated.`,
      );
      await refreshVerdict();
      onActivationChanged();
    } catch (err) {
      // The RPC raises with the gate's own blockers; show them verbatim so the
      // owner knows which asset to go create.
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      captureError({
        source: "content-ir",
        message: `Shape activation flip failed for "${kind}": ${message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  const blockers = verdict?.reasons ?? [];
  const canActivate = verdict?.wouldActivate ?? false;

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isActive ? (
            <Power className="h-4 w-4 text-primary" />
          ) : (
            <PowerOff className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {isActive ? "Live" : "Not live"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isActive
                ? "Renders through its component and can be bound to an agent's output."
                : "Renders through the generic JSON viewer and cannot be bound to an agent."}
            </p>
          </div>
        </div>

        {isActive ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void flip(false)}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Deactivate
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void flip(true)}
            disabled={busy || loadingVerdict || !canActivate}
            title={
              canActivate
                ? undefined
                : "The dual gate is not satisfied yet — see the blockers below."
            }
          >
            {busy || loadingVerdict ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Activate
          </Button>
        )}
      </div>

      {/* Blockers: the gate's own reasons, naming the missing asset. */}
      {!isActive && !loadingVerdict && blockers.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {blockers.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {verdict && !verdict.renderLegApplicable ? (
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          Data-only contract kind — the render leg is not applicable, so no
          component is required.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 flex items-start gap-1.5 border-t border-border pt-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </section>
  );
}
