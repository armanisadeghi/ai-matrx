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

import { useEffect, useMemo, useState } from "react";
import { Link2, ChevronDown, Save } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setScopeSelections } from "@/lib/redux/slices/appContextSlice";
import {
  selectActiveOrganizationId,
  selectActiveScopeSelections,
} from "@/features/scopes/redux/selectors/active-context";
import {
  fetchScopes,
  selectScopesByType,
  selectScopesLoadedForType,
} from "@/features/agent-context/redux/scope/scopesSlice";
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

  // "Select {ScopeType}" prompts: distinct bound scope types the user HAS but hasn't
  // selected. If the user doesn't have the type (e.g. a public-agent user), no prompt —
  // the variable is just a normal input. Prompting only those who can act on it.
  const promptTypes = useMemo(() => {
    const seen = new Map<string, { scopeTypeId: string; label: string }>();
    for (const i of infos) {
      if (
        i.scopeTypeAccessible &&
        !i.scopeActive &&
        !i.resolved &&
        i.scopeTypeId &&
        !seen.has(i.scopeTypeId)
      ) {
        seen.set(i.scopeTypeId, {
          scopeTypeId: i.scopeTypeId,
          label: i.scopeTypeLabel,
        });
      }
    }
    return [...seen.values()];
  }, [infos]);

  if (resolved.length === 0 && promptTypes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
      {promptTypes.map((p) => (
        <BoundScopePrompt
          key={p.scopeTypeId}
          scopeTypeId={p.scopeTypeId}
          label={p.label}
        />
      ))}
      {resolved.map((info) => (
        <BoundChip key={info.name} conversationId={conversationId} info={info} />
      ))}
    </div>
  );
}

/**
 * "Select {ScopeType}" — shown above the variables when an agent uses items from a scope
 * type the user HAS but hasn't picked a scope of. Choosing one sets it active, which
 * resolves every binding of that type (the values then appear as pills / pre-fills).
 */
function BoundScopePrompt({
  scopeTypeId,
  label,
}: {
  scopeTypeId: string;
  label: string;
}) {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectActiveOrganizationId);
  const selections = useAppSelector(selectActiveScopeSelections);
  const scopes = useAppSelector((s) => selectScopesByType(s, scopeTypeId));
  const loaded = useAppSelector((s) =>
    orgId ? selectScopesLoadedForType(s, orgId, scopeTypeId) : false,
  );

  useEffect(() => {
    if (orgId && !loaded) {
      dispatch(fetchScopes({ org_id: orgId, type_id: scopeTypeId }));
    }
  }, [orgId, loaded, scopeTypeId, dispatch]);

  return (
    <Select
      value=""
      onValueChange={(scopeId) =>
        dispatch(setScopeSelections({ ...selections, [scopeTypeId]: scopeId }))
      }
    >
      <SelectTrigger className="h-auto w-auto gap-1.5 rounded-full border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary hover:bg-primary/15">
        <SelectValue placeholder={`Select ${label}`} />
      </SelectTrigger>
      <SelectContent>
        {scopes.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No {label} yet
          </div>
        ) : (
          scopes.map((sc) => (
            <SelectItem key={sc.id} value={sc.id}>
              {sc.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
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
