"use client";

/**
 * ModelSettingsReviewDialog — callback-driven settings review for model
 * replacement flows (DeprecatedModelsAudit / ModelUsageAudit).
 *
 * Replaces the prompts-era `ModelSettingsDialog` (deleted 2026-06-28, D25)
 * without forking any settings UI: rows come from the settings catalogue
 * chokepoint (`buildSettingsRows`) driven by the REPLACEMENT model's declared
 * controls, and every control renders through the shared
 * `SettingControlInput` primitive — the same stack the agent builder and
 * `RunConfigOverrides` use.
 *
 * Genuine-delta semantics: `value` holds ONLY the keys the user adjusted away
 * from the replacement model's declared defaults. Setting a row back to its
 * default removes the key, so `replaceModelReferences` receives real
 * overrides, never defaults-as-settings.
 */

import { useEffect } from "react";
import { ArrowRightLeft, Loader2, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllModels,
  selectModelFullyLoaded,
  fetchModelById,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { useModelControls } from "@/features/agents/hooks/useModelControls";
import { buildSettingsRows } from "@/lib/redux/slices/agent-settings/settings-catalogue";
import type { ControlDefinition } from "@/lib/redux/slices/agent-settings/types";
import { SettingControlInput } from "@/features/agents/components/settings-management/controls/SettingControlInput";
import type { LLMParams } from "@/features/agents/types/agent-api-types";
import { cn } from "@/lib/utils";

const deepEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export interface ModelSettingsReviewDialogProps {
  open: boolean;
  /** The REPLACEMENT model whose declared controls drive the rows. */
  replacementModelId: string;
  /** Display name of the model being replaced. */
  fromLabel: string;
  /** Display name of the replacement model. */
  toLabel: string;
  /** Adjusted settings (deltas from the replacement model's defaults). */
  value: LLMParams;
  onChange: (next: LLMParams) => void;
  /** Apply the replacement with the current `value`. */
  onApply: () => void;
  onCancel: () => void;
  applying?: boolean;
  error?: string | null;
}

export function ModelSettingsReviewDialog({
  open,
  replacementModelId,
  fromLabel,
  toLabel,
  value,
  onChange,
  onApply,
  onCancel,
  applying = false,
  error = null,
}: ModelSettingsReviewDialogProps) {
  const dispatch = useAppDispatch();
  const models = useAppSelector(selectAllModels);

  // Ensure the replacement model's FULL record (with controls) is loaded.
  // fetchModelById is cached — a no-op when the record is already full.
  const isFull = useAppSelector((s) =>
    selectModelFullyLoaded(s, replacementModelId),
  );
  const registryLoading = useAppSelector((s) => s.modelRegistry.isLoading);
  useEffect(() => {
    if (open && replacementModelId && !isFull && !registryLoading) {
      dispatch(fetchModelById(replacementModelId));
    }
  }, [dispatch, open, replacementModelId, isFull, registryLoading]);

  // useModelControls is a pure parser despite the name — safe in render.
  const { normalizedControls } = useModelControls(models, replacementModelId);
  // MATRX-EXCEPTION: buildSettingsRows validates each field at read time; see lookupControl.
  const controlsMap = normalizedControls as unknown as Record<
    string,
    ControlDefinition
  > | null;

  // Settings-catalogue keys are dynamic; LLMParams has fixed named fields and
  // no index signature — the loose map view is the documented contract for
  // catalogue consumers (same pattern as RunConfigOverrides).
  // MATRX-EXCEPTION: settings-catalogue keys are dynamic; LLMParams has no index signature.
  const adjusted = value as Record<string, unknown>;

  const groups = buildSettingsRows(controlsMap, adjusted).filter(
    (g) => g.rows.length > 0,
  );
  const adjustedCount = Object.keys(adjusted).length;
  const rowsLoading = groups.length === 0 && !!replacementModelId && !isFull;

  const handleRowChange = (
    key: string,
    control: ControlDefinition | null,
    next: unknown,
  ) => {
    const draft: Record<string, unknown> = { ...adjusted };
    // Returning to the model's declared default removes the delta — the
    // replacement then simply runs on the new model's defaults.
    if (deepEqual(next, control?.default)) delete draft[key];
    else draft[key] = next;
    // MATRX-EXCEPTION: settings-catalogue keys are dynamic; LLMParams has no index signature.
    onChange(draft as LLMParams);
  };

  const handleRowReset = (key: string) => {
    const draft: Record<string, unknown> = { ...adjusted };
    delete draft[key];
    // MATRX-EXCEPTION: settings-catalogue keys are dynamic; LLMParams has no index signature.
    onChange(draft as LLMParams);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg p-0 gap-0 flex flex-col max-h-[85dvh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm">Review Settings</DialogTitle>
          <DialogDescription className="text-xs">
            <strong>{fromLabel}</strong> → <strong>{toLabel}</strong>. Adjust
            the replacement model&apos;s settings before applying; untouched
            rows keep the model&apos;s defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2.5 border-t border-border">
          {rowsLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading model settings…
            </div>
          ) : groups.length === 0 ? (
            <p className="py-6 text-xs text-muted-foreground">
              {replacementModelId
                ? "This model doesn't declare adjustable settings — the replacement will update model references only."
                : "No replacement model selected."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-2">
                {group.label && (
                  <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {group.label}
                  </p>
                )}
                {group.rows.map((row) => {
                  if (!row.control) return null;
                  const isAdjusted = row.key in adjusted;
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        "flex items-center gap-2 rounded-sm",
                        isAdjusted &&
                          "-mx-1 border-l-2 border-primary/60 bg-primary/5 px-1",
                      )}
                    >
                      <Label
                        className={cn(
                          "w-32 shrink-0 text-[11px]",
                          isAdjusted
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                        title={row.key}
                      >
                        {row.label}
                      </Label>
                      <div className="min-w-0 flex-1">
                        <SettingControlInput
                          settingKey={row.key}
                          control={row.control}
                          value={
                            isAdjusted ? adjusted[row.key] : row.control.default
                          }
                          onChange={(v) =>
                            handleRowChange(row.key, row.control, v)
                          }
                          disabled={applying}
                          id={`model-replace-${row.key}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRowReset(row.key)}
                        title="Reset to model default"
                        className={cn(
                          "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
                          isAdjusted
                            ? "opacity-100"
                            : "pointer-events-none opacity-0",
                        )}
                        aria-hidden={!isAdjusted}
                        tabIndex={isAdjusted ? 0 : -1}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <DialogFooter className="px-4 py-3 border-t border-border shrink-0 sm:justify-between sm:items-center gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {adjustedCount > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {adjustedCount} adjusted
              </Badge>
            )}
            {error && (
              <span className="text-destructive text-xs truncate">{error}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onCancel}
              disabled={applying}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onApply}
              disabled={applying}
            >
              {applying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-3 w-3" />
              )}
              Apply Replacement
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
