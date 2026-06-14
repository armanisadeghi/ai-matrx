"use client";

/**
 * BoundVariableChips
 *
 * Renders agent variables BOUND to a scope context item as informative pills (instead of
 * a normal input). A resolved pill shows what the active scope supplies and is auto-filled
 * server-side — you can ignore it, or click to override for this run and optionally write
 * the value back to the scope. A pill whose scope type has no active scope lights up red:
 * the agent is built for a single-scope job, so it asks you to pick one.
 */

import { useState } from "react";
import { Link2, AlertTriangle, ChevronDown, Save } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  useBoundVariableScope,
  type BoundVarInfo,
} from "@/features/agents/hooks/useBoundVariableScope";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { VariableInputComponent } from "./input-components/VariableInputComponent";
import { variableValueToDisplay } from "@/features/agents/utils/variable-utils";
import { setScopeContextValue } from "@/features/scope-system/redux/scopeValuesSlice";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { buildScopeValuePayload } from "@/features/scope-system/utils/scopeValuePayload";
import { formatText } from "@/utils/text/text-case-converter";
import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";

interface BoundVariableChipsProps {
  conversationId: string;
}

export function BoundVariableChips({ conversationId }: BoundVariableChipsProps) {
  const infos = useBoundVariableScope(conversationId);
  if (infos.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
      {infos.map((info) => (
        <BoundChip key={info.name} conversationId={conversationId} info={info} />
      ))}
    </div>
  );
}

function BoundChip({
  conversationId,
  info,
}: {
  conversationId: string;
  info: BoundVarInfo;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const userValues = useAppSelector(selectUserVariableValues(conversationId));

  const userValue = userValues[info.name];
  const hasUserOverride = info.name in userValues;
  const effectiveValue = hasUserOverride
    ? userValue
    : (info.resolved?.value ?? "");
  const displayValue = variableValueToDisplay(effectiveValue);

  // Write-back target: the scope that supplied the value, else the active scope of the type.
  const writeScopeId = info.sourceScopeId ?? info.activeScopeIdOfType;
  const canWriteBack =
    !!writeScopeId && !!info.binding.contextItemId && hasUserOverride;

  const handleChange = (v: unknown) => {
    dispatch(setUserVariableValue({ conversationId, name: info.name, value: v }));
  };

  const handleWriteBack = async () => {
    if (!writeScopeId || !info.binding.contextItemId || saving) return;
    const ok = await confirm({
      title: `Save to ${info.scopeTypeLabel}?`,
      description: `Update “${formatText(info.name)}” on the active ${info.scopeTypeLabel} so every agent using it picks up this value. Decline to use it for this run only.`,
      confirmLabel: `Save to ${info.scopeTypeLabel}`,
      cancelLabel: "Just this run",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await dispatch(
        setScopeContextValue({
          scope_id: writeScopeId,
          context_item_id: info.binding.contextItemId,
          ...buildScopeValuePayload(
            effectiveValue,
            (info.valueType ?? "string") as ContextValueType,
          ),
          change_summary: "Set from an agent run",
        }),
      ).unwrap();
      dispatch(ensureContextValues(writeScopeId, { refresh: true }));
      toast.success(`Saved to ${info.scopeTypeLabel}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save to scope");
    } finally {
      setSaving(false);
    }
  };

  // Visual state: red when the binding's scope type isn't active (pick one);
  // linked/subtle when resolved; neutral when the scope is active but the item is empty.
  const tone = info.missing
    ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300"
    : info.resolved || hasUserOverride
      ? "border-border bg-muted/60 text-foreground"
      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  const summary = info.missing
    ? `select a ${info.scopeTypeLabel}`
    : displayValue ||
      (info.scopeActive ? `not set in ${info.scopeTypeLabel}` : "—");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 max-w-[260px] rounded-full border px-2 py-0.5 text-xs transition-colors hover:brightness-110",
            tone,
          )}
          title={`${formatText(info.name)} — bound to ${info.scopeTypeLabel} context`}
        >
          {info.missing ? (
            <AlertTriangle className="h-3 w-3 shrink-0" />
          ) : (
            <Link2 className="h-3 w-3 shrink-0 opacity-70" />
          )}
          <span className="font-medium shrink-0">{formatText(info.name)}</span>
          <span className="text-muted-foreground truncate">{summary}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3 rounded-2xl"
        align="start"
        side="top"
        sideOffset={6}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            <span>
              Bound to <span className="font-medium text-foreground">{info.scopeTypeLabel}</span>
              {info.resolved ? " · auto-filled from the active scope" : ""}
            </span>
          </div>

          {info.missing && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300 inline-flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                No {info.scopeTypeLabel} is active. This agent is built for one — pick a{" "}
                {info.scopeTypeLabel}, or enter a value just for this run.
              </span>
            </div>
          )}

          <VariableInputComponent
            value={effectiveValue}
            onChange={handleChange}
            variableName={info.name}
            customComponent={info.customComponent}
            helpText={
              info.resolved
                ? "Editing overrides the scope value for this run."
                : undefined
            }
            hideLabel
            compact
          />

          {canWriteBack && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleWriteBack}
              disabled={saving}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : `Save to ${info.scopeTypeLabel}`}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
