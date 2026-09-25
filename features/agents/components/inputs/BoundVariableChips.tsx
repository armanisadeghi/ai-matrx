"use client";

/**
 * BoundVariableChips
 *
 * Renders ONLY the agent variables that are bound to a scope context item AND actually
 * resolved to a value from the active scope — as informative pills. You can ignore a pill
 * (the value is auto-filled server-side), click it to override for this run, and optionally
 * write the value back to the scope.
 *
 * Variables bound to the author's CUSTOM DATA are always shown here, locked
 * (`DataBoundVariableChips`) — the server fills them and nothing overrides them.
 *
 * Bound variables that did NOT resolve (no context, or no value yet) are NOT shown here —
 * they fall through to the normal input list with their inherited component, with zero
 * requirement. Mounting this component also drives the runtime hook that loads the scope
 * data + inherited components, so every layout renders it (even when it shows nothing).
 */

import { useEffect, useMemo, useState } from "react";
import { Link2, ChevronDown, Save, X, RotateCcw } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
// Surface A: the "Select {ScopeType}" prompt sets the globally-active scope so a
// globally-triggered agent run resolves its bound variables (the server fills them
// authoritatively from request.scope_ids). Explicit active-context selection.
// eslint-disable-next-line no-restricted-syntax -- Surface A: agent-run active-scope selection
import {
  addActiveScope,
  removeActiveScope,
} from "@/lib/redux/slices/appContextSlice";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  useBoundVariableScope,
  type BoundVarInfo,
} from "@/features/agents/hooks/useBoundVariableScope";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { isCustomDataBinding } from "@/features/agents/utils/variable-binding";
import { DataBoundVariableChips } from "./DataBoundVariableChips";
import {
  clearUserVariableValue,
  setUserVariableValue,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import { variableValueToDisplay } from "@/features/agents/utils/variable-utils";
import { setScopeContextValue } from "@/features/scopes/redux/scopeContextView";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { buildScopeValuePayload } from "@/features/scopes/utils/scopeValuePayload";
import { formatText } from "@ai-matrx/kit/text-case";
import type { ContextValueType } from "@/features/scopes/redux/contextItemCatalog";
import {
  selectScopeById,
  selectScopesByType,
  selectScopesLoadedForType,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";

interface BoundVariableChipsProps {
  conversationId: string;
}

export function BoundVariableChips({
  conversationId,
}: BoundVariableChipsProps) {
  // Always runs the hook (loads catalog + inherited components + prefills scope values),
  // even when nothing renders.
  const infos = useBoundVariableScope(conversationId);
  const resolved = infos.filter((i) => !!i.resolved);
  // Variables bound to the author's custom data are server-filled and LOCKED —
  // shown here as read-only chips, never as inputs.
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const hasDataBound = definitions.some((d) => isCustomDataBinding(d.binding));

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

  if (
    resolved.length === 0 &&
    promptTypes.length === 0 &&
    !hasDataBound
  ) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
      <DataBoundVariableChips conversationId={conversationId} />
      {promptTypes.map((p) => (
        <BoundScopePrompt
          key={p.scopeTypeId}
          scopeTypeId={p.scopeTypeId}
          label={p.label}
        />
      ))}
      {resolved.map((info) => (
        <BoundChip
          key={info.name}
          conversationId={conversationId}
          info={info}
        />
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
  const scopes = useAppSelector((s) => selectScopesByType(s, scopeTypeId));
  const loaded = useAppSelector((s) =>
    orgId ? selectScopesLoadedForType(s, orgId, scopeTypeId) : false,
  );

  useEffect(() => {
    if (orgId && !loaded) {
      dispatch(ensureScopeTree());
    }
  }, [orgId, loaded, scopeTypeId, dispatch]);

  return (
    <Select
      value=""
      onValueChange={(scopeId) =>
        // Additive — active context is multi-scope; keyed by scope id.
        dispatch(addActiveScope(scopeId))
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

  // The scope whose selection put this chip here — removing it from the active context
  // is the exact inverse of the "Select {ScopeType}" prompt, and returns every variable
  // it filled to an ordinary input.
  const activeScopeId = info.sourceScopeId ?? info.activeScopeIdOfType;
  const activeScopeName = useAppSelector((s) =>
    activeScopeId ? selectScopeById(s, activeScopeId)?.name : undefined,
  );
  const scopeLabel = activeScopeName ?? info.scopeTypeLabel;

  const handleRemoveScope = () => {
    if (!activeScopeId) return;
    setOpen(false);
    dispatch(clearUserVariableValue({ conversationId, name: info.name }));
    dispatch(removeActiveScope(activeScopeId));
  };

  const handleRevert = () => {
    dispatch(clearUserVariableValue({ conversationId, name: info.name }));
  };

  const handleChange = (v: unknown) => {
    dispatch(
      setUserVariableValue({ conversationId, name: info.name, value: v }),
    );
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
      toast.error(
        err instanceof Error ? err.message : "Failed to save to scope",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="inline-flex max-w-[280px] items-center rounded-full border border-border bg-muted/60 text-xs text-foreground">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 rounded-l-full py-0.5 pl-2 pr-1 transition-colors hover:bg-muted",
              !activeScopeId && "rounded-r-full pr-2",
            )}
            title={`${formatText(info.name)} — auto-filled from ${scopeLabel}. Click to override.`}
          >
            <Link2 className="h-3 w-3 shrink-0 opacity-70" />
            <span className="font-medium shrink-0">
              {formatText(info.name)}
            </span>
            <span className="text-muted-foreground truncate">
              {displayValue || "—"}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        {activeScopeId && (
          <button
            type="button"
            onClick={handleRemoveScope}
            className="inline-flex h-full shrink-0 items-center rounded-r-full py-0.5 pl-1 pr-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Stop using ${scopeLabel}`}
            title={`Stop using ${scopeLabel} — ${formatText(info.name)} goes back to a normal input`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
      <PopoverContent
        sizing="content"
        className="p-3 rounded-2xl"
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

          <ContextValueInput
            valueType={(info.valueType ?? "string") as ContextValueType}
            customComponent={info.customComponent}
            value={effectiveValue}
            onChange={handleChange}
            referenceConfig={info.referenceConfig}
            scopeId={writeScopeId ?? undefined}
            displayName={info.name}
            minHeight={56}
            maxHeight={300}
          />

          {hasUserOverride && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={handleRevert}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Revert to the {scopeLabel} value
            </Button>
          )}

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

          {activeScopeId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleRemoveScope}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Stop using {scopeLabel}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
