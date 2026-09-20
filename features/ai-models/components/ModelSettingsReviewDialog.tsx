"use client";

/**
 * ModelSettingsReviewDialog — review settings before replacing a model.
 *
 * NOTHING NEW IS DESIGNED HERE. The settings body is `RunConfigOverrides`
 * (`structured`), the same Redux-backed panel the agent builder, shortcut
 * editor, and binding screens mount. Rows come from the replacement model's
 * full registry record; defaults and availability are the model's own.
 *
 * A failed replace is a banner above the actions — title, plain sentence,
 * wrapping detail — never a truncated footer string and never a cell dump.
 */

import { useEffect, useRef } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  initInstanceOverrides,
  removeInstanceOverrides,
  updateBaseSettings,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  selectInstanceOverrideState,
  selectSettingsOverridesForApi,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { ReplaceFailureBanner } from "@/components/official/error-detail/ReplaceFailureBanner";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

const INSTANCE_KEY = "model-replace-review";

const REPLACE_WORDS = {
  heading: "Replacement settings",
  scopeNote:
    "Untouched rows keep the replacement model's defaults. Only values you change are written onto the agents.",
  noModelNote: "No replacement model selected.",
  baselineSourceLabel: "Replacement model",
  baselineDefaultLabel: "Model default",
  modelEmptyChoiceLabel: "Use the selected replacement",
} as const;

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
  /** The structured picker changed the replacement model. */
  onReplacementModelChange?: (modelId: string) => void;
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
  onChange,
  onReplacementModelChange,
  onApply,
  onCancel,
  applying = false,
  error = null,
}: ModelSettingsReviewDialogProps) {
  const dispatch = useAppDispatch();
  const lastEmitted = useRef<string>("");
  const ready = useAppSelector(
    (state) => selectInstanceOverrideState(INSTANCE_KEY)(state) != null,
  );
  const wireOverrides = useAppSelector((state) =>
    selectSettingsOverridesForApi(INSTANCE_KEY)(state),
  );

  useEffect(() => {
    if (!open) return;
    dispatch(
      initInstanceOverrides({
        conversationId: INSTANCE_KEY,
        baseSettings: { model: replacementModelId },
      }),
    );
    return () => {
      dispatch(removeInstanceOverrides(INSTANCE_KEY));
      lastEmitted.current = "";
    };
  }, [dispatch, open]);

  useEffect(() => {
    if (!open || !replacementModelId) return;
    dispatch(
      updateBaseSettings({
        conversationId: INSTANCE_KEY,
        baseSettings: { model: replacementModelId },
      }),
    );
  }, [dispatch, open, replacementModelId]);

  useEffect(() => {
    if (!open) return;
    const record = (wireOverrides ?? {}) as Record<string, unknown>;
    const picked =
      typeof record.model === "string" ? record.model : undefined;
    const settings: Record<string, unknown> = { ...record };
    delete settings.model;
    const serialized = JSON.stringify(settings);
    if (serialized !== lastEmitted.current) {
      lastEmitted.current = serialized;
      onChange(settings as LLMParams);
    }
    if (picked && picked !== replacementModelId) {
      onReplacementModelChange?.(picked);
    }
  }, [open, onChange, onReplacementModelChange, replacementModelId, wireOverrides]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="flex max-h-[90dvh] w-[min(56rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-2 px-5 pt-5 pb-3 text-left">
          <DialogTitle className="text-base leading-snug">
            Review replacement settings
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <p>
                Replacing <strong className="text-foreground">{fromLabel}</strong>{" "}
                with <strong className="text-foreground">{toLabel}</strong>.
              </p>
              <p>
                These are {toLabel}&apos;s real settings. Change only what you
                want written onto the agents — everything else keeps the new
                model&apos;s defaults.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {open && ready ? (
            <RunConfigOverrides
              conversationId={INSTANCE_KEY}
              structured
              disabled={applying}
              words={REPLACE_WORDS}
              overrideSource="This replacement"
            />
          ) : null}
        </div>

        {error ? <ReplaceFailureBanner error={error} /> : null}

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-5 py-3 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onCancel}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={onApply}
            disabled={applying}
          >
            {applying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRightLeft className="h-3.5 w-3.5" />
            )}
            Apply Replacement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
