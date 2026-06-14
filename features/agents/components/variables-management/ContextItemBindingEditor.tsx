"use client";

import React, { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  fetchScopeTypes,
  selectAllScopeTypes,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import type { ContextItemBinding } from "@/features/agents/types/agent-definition.types";

interface ContextItemBindingEditorProps {
  binding: ContextItemBinding | undefined;
  onChange: (binding: ContextItemBinding | undefined) => void;
  readonly?: boolean;
}

const ON_MISSING_OPTIONS: { value: NonNullable<ContextItemBinding["onMissing"]>; label: string; hint: string }[] = [
  { value: "empty", label: "Empty", hint: "Fill with an empty value" },
  { value: "skip", label: "Skip", hint: "Leave the variable's default / caller value" },
  { value: "error", label: "Error", hint: "Refuse to run if no scope supplies it" },
];

/**
 * Bind a variable to a scope CONTEXT ITEM. The author picks a scope type and one of its
 * context items; at run time the active scope of that type supplies the value and the
 * variable inherits the item's input component. Resolution is server-authoritative
 * (`resolve_scope_bindings`); binding is by stable id, never by name coincidence.
 */
export function ContextItemBindingEditor({
  binding,
  onChange,
  readonly,
}: ContextItemBindingEditorProps) {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectActiveOrganizationId);
  const scopeTypes = useAppSelector(selectAllScopeTypes);
  const typesLoaded = useAppSelector((s) =>
    orgId ? selectScopeTypesLoadedForOrg(s, orgId) : false,
  );
  const bound = !!binding?.itemKey;
  const scopeTypeId = binding?.scopeTypeId ?? "";
  const items = useAppSelector((s) =>
    scopeTypeId ? selectItemsByType(s, scopeTypeId) : [],
  );
  const itemsLoaded = useAppSelector((s) =>
    scopeTypeId ? selectItemsLoadedForType(s, scopeTypeId) : false,
  );

  useEffect(() => {
    if (orgId && !typesLoaded) dispatch(fetchScopeTypes(orgId));
  }, [orgId, typesLoaded, dispatch]);

  useEffect(() => {
    if (scopeTypeId && !itemsLoaded) dispatch(listScopeTypeItems(scopeTypeId));
  }, [scopeTypeId, itemsLoaded, dispatch]);

  const toggleBound = (on: boolean) => {
    if (!on) {
      onChange(undefined);
      return;
    }
    // Default to the first scope type so the item picker can populate.
    const first = scopeTypes[0];
    onChange({
      contextItemId: "",
      scopeTypeId: first?.id ?? "",
      itemKey: "",
      onMissing: "empty",
    });
  };

  const handleScopeType = (typeId: string) => {
    onChange({ contextItemId: "", scopeTypeId: typeId, itemKey: "", onMissing: binding?.onMissing ?? "empty" });
  };

  const handleItem = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    onChange({
      contextItemId: item.id,
      scopeTypeId: scopeTypeId,
      itemKey: item.key,
      onMissing: binding?.onMissing ?? "empty",
    });
  };

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium cursor-pointer">
            Bind to a context item
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-fills from the active scope and inherits the item&rsquo;s input. Hidden
            from the user when a value is available.
          </p>
        </div>
        <Switch checked={bound} onCheckedChange={toggleBound} disabled={readonly} />
      </div>

      {bound && (
        <div className="space-y-2 pt-1.5 border-t border-border">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Scope type</Label>
            <Select value={scopeTypeId} onValueChange={handleScopeType} disabled={readonly}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a scope type…" />
              </SelectTrigger>
              <SelectContent>
                {scopeTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label_singular}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Context item</Label>
            <Select
              value={binding?.contextItemId || ""}
              onValueChange={handleItem}
              disabled={readonly || !scopeTypeId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !scopeTypeId
                      ? "Pick a scope type first"
                      : items.length === 0
                        ? itemsLoaded
                          ? "No items on this scope type"
                          : "Loading…"
                        : "Choose a context item…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    <span>{i.display_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground font-mono">
                      {i.key}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">When no scope provides it</Label>
            <Select
              value={binding?.onMissing ?? "empty"}
              onValueChange={(v) =>
                onChange({ ...binding!, onMissing: v as ContextItemBinding["onMissing"] })
              }
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ON_MISSING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span>{o.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                      — {o.hint}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
