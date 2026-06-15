"use client";

/**
 * BoundVariableChips
 *
 * Renders ONLY the agent variables that are bound to a scope context item AND actually
 * resolved to a value from the active scope — as informative pills. You can ignore a pill
 * (the value is auto-filled server-side), click it to override for this run, and optionally
 * write the value back to the scope.
 *
 * Bound variables that did NOT resolve (no context, or no value yet) are NOT shown here —
 * they fall through to the normal input list with their inherited component, with zero
 * requirement. Mounting this component also drives the runtime hook that loads the scope
 * data + inherited components, so every layout renders it (even when it shows nothing).
 */

import { useState } from "react";
import { Link2, ChevronDown, Save } from "lucide-react";
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
  // Always runs the hook (loads catalog + inherited components + prefills scope values),
  // even when nothing renders.
  const infos = useBoundVariableScope(conversationId);
  const resolved = infos.filter((i) => !!i.resolved);
  if (resolved.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
      {resolved.map((info) => (
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 max-w-[260px] rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-muted",
          )}
          title={`${formatText(info.name)} — auto-filled from ${info.scopeTypeLabel}. Click to override.`}
        >
          <Link2 className="h-3 w-3 shrink-0 opacity-70" />
          <span className="font-medium shrink-0">{formatText(info.name)}</span>
          <span className="text-muted-foreground truncate">
            {displayValue || "—"}
          </span>
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
              Auto-filled from{" "}
              <span className="font-medium text-foreground">
                {info.scopeTypeLabel}
              </span>
              . Editing overrides it for this run.
            </span>
          </div>

          <VariableInputComponent
            value={effectiveValue}
            onChange={handleChange}
            variableName={info.name}
            customComponent={info.customComponent}
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
