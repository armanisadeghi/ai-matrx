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
 *
 * NEVER A GATE. "Suggested swaps" lists values on the agents being replaced
 * that the new model may not take ("if an agent has X, change it to Y"). They
 * are unticked offers: Apply always runs, with or without them. An admin
 * replacing a model is never stopped by validation — see
 * common-docs/policies/validation-offers-never-blocks.md.
 */

import { useEffect, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { selectAllModels } from "@/features/ai-models/redux/modelRegistrySlice";
import type { SettingSwap } from "@/features/ai-models/server/replace-model-references";
import { suggestSettingSwaps } from "./suggestSettingSwaps";

function formatSwapValue(value: unknown): string {
  if (value === undefined) return "remove the setting";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

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
  /**
   * Settings of every row that will be replaced — the source of the optional
   * swap suggestions. Omit it and no suggestions are shown.
   */
  sourceSettings?: Array<Record<string, unknown> | null | undefined>;
  /** Apply the replacement with the current `value` plus the ticked swaps. */
  onApply: (swaps: SettingSwap[]) => void;
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
  sourceSettings,
  onApply,
  onCancel,
  applying = false,
  error = null,
}: ModelSettingsReviewDialogProps) {
  const dispatch = useAppDispatch();
  const models = useAppSelector(selectAllModels);
  const suggestions =
    sourceSettings && replacementModelId
      ? suggestSettingSwaps(sourceSettings, replacementModelId, models)
      : [];
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const tickedSwaps: SettingSwap[] = suggestions
    .filter((s) => ticked[s.id])
    .map(({ key, from, to }) => ({ key, from, to }));
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

          {suggestions.length > 0 ? (
            <section className="border-t border-border px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">
                  Suggested swaps
                </h3>
                <span className="text-xs text-muted-foreground">
                  Optional — unticked lines are left as they are
                </span>
              </div>
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-3 py-2">
                    <Checkbox
                      id={`swap-${s.id}`}
                      className="mt-0.5"
                      checked={!!ticked[s.id]}
                      disabled={applying}
                      onCheckedChange={(next) =>
                        setTicked((prev) => ({ ...prev, [s.id]: next === true }))
                      }
                    />
                    <label
                      htmlFor={`swap-${s.id}`}
                      className="min-w-0 flex-1 cursor-pointer text-sm leading-snug"
                    >
                      <span className="text-foreground">
                        If an agent has <code className="text-xs">{s.key}</code>{" "}
                        = <strong>{formatSwapValue(s.from)}</strong>,{" "}
                        {s.to === undefined ? (
                          <strong>remove the setting</strong>
                        ) : (
                          <>
                            change it to <strong>{formatSwapValue(s.to)}</strong>
                          </>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {s.count} agent{s.count === 1 ? "" : "s"} · {s.reason}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
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
            onClick={() => onApply(tickedSwaps)}
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
