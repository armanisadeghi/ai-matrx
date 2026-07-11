"use client";

/**
 * ScopeBatchImportBody
 *
 * Shortcut for batch-creating agent Variables and Context Slots from a scope
 * type's context items — org → scope type → per-item opt-in checkboxes, with
 * an "add all" per column. Every created Variable/Context Slot is bound to its
 * source item via the same shapes `AgentContextSlotsManager` and
 * `ContextItemBindingEditor` already produce for a single manual bind
 * (see `features/agents/utils/context-item-slot-mapping.ts`), so a batch-created
 * entry is indistinguishable from one bound by hand.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  selectAgentContextSlots,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentContextSlots,
  setAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/slice";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import {
  buildContextSlotFromItem,
  buildVariableFromItem,
  suggestKeyFromContextItem,
  uniquifyKey,
} from "@/features/agents/utils/context-item-slot-mapping";

interface ScopeBatchImportBodyProps {
  agentId: string;
  /** Called after a successful batch add — the caller typically closes the window. */
  onDone?: () => void;
}

interface RowSelection {
  variable: boolean;
  contextSlot: boolean;
  /** Only meaningful while `contextSlot` is checked — defaults false, same as a manually-added slot. */
  mutable: boolean;
}

const EMPTY_SELECTION: RowSelection = {
  variable: false,
  contextSlot: false,
  mutable: false,
};

export function ScopeBatchImportBody({ agentId, onDone }: ScopeBatchImportBodyProps) {
  const dispatch = useAppDispatch();

  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);
  const [orgIdChoice, setOrgIdChoice] = useState("");
  const orgId = orgIdChoice || activeOrgId || "";

  const [scopeTypeId, setScopeTypeId] = useState("");

  const typesLoaded = useAppSelector((s) =>
    orgId ? selectScopeTypesLoadedForOrg(s, orgId) : false,
  );
  const scopeTypes = useAppSelector((s) => (orgId ? selectScopeTypesByOrg(s, orgId) : []));
  const itemsLoaded = useAppSelector((s) =>
    scopeTypeId ? selectItemsLoadedForType(s, scopeTypeId) : false,
  );
  const items = useAppSelector((s) => (scopeTypeId ? selectItemsByType(s, scopeTypeId) : []));

  useEffect(() => {
    if (orgId && !typesLoaded) dispatch(fetchScopeTypes(orgId));
  }, [orgId, typesLoaded, dispatch]);

  useEffect(() => {
    if (scopeTypeId && !itemsLoaded) dispatch(listScopeTypeItems(scopeTypeId));
  }, [scopeTypeId, itemsLoaded, dispatch]);

  const rawVariables = useAppSelector((s) => selectAgentVariableDefinitions(s, agentId));
  const rawSlots = useAppSelector((s) => selectAgentContextSlots(s, agentId));
  const variables: VariableDefinition[] = useMemo(() => rawVariables ?? [], [rawVariables]);
  const slots: ContextSlot[] = useMemo(() => rawSlots ?? [], [rawSlots]);

  // Context items already bound (via a normal binding, or via a prior batch run) —
  // these render pre-checked + disabled so a re-run of the tool can never double-add.
  const boundVariableItemIds = useMemo(
    () => new Set(variables.map((v) => v.binding?.contextItemId).filter(Boolean) as string[]),
    [variables],
  );
  const boundSlotItemIds = useMemo(
    () =>
      new Set(
        slots
          .filter((s) => s.source?.kind === "ctx_item")
          .map((s) => s.source?.id)
          .filter(Boolean) as string[],
      ),
    [slots],
  );

  const [selection, setSelection] = useState<Record<string, RowSelection>>({});
  // A different scope type means a different item set — start the picks over.
  // Render-time reset (not an effect) per the React "adjusting state when a
  // prop changes" pattern — avoids the extra cascading-render commit.
  const [selectionScopeTypeId, setSelectionScopeTypeId] = useState(scopeTypeId);
  if (scopeTypeId !== selectionScopeTypeId) {
    setSelectionScopeTypeId(scopeTypeId);
    setSelection({});
  }

  const toggle = (itemId: string, column: "variable" | "contextSlot" | "mutable") => {
    setSelection((prev) => {
      const current = prev[itemId] ?? EMPTY_SELECTION;
      const next: RowSelection = { ...current, [column]: !current[column] };
      // Mutable only means something alongside a selected context slot — clearing
      // the slot checkbox clears the (now meaningless) mutable pick with it.
      if (column === "contextSlot" && !next.contextSlot) next.mutable = false;
      return { ...prev, [itemId]: next };
    });
  };

  const addAll = (column: "variable" | "contextSlot") => {
    setSelection((prev) => {
      const next = { ...prev };
      for (const item of items) {
        const alreadyBound =
          column === "variable"
            ? boundVariableItemIds.has(item.id)
            : boundSlotItemIds.has(item.id);
        if (alreadyBound) continue;
        next[item.id] = { ...(next[item.id] ?? EMPTY_SELECTION), [column]: true };
      }
      return next;
    });
  };

  const clearAll = (column: "variable" | "contextSlot") => {
    setSelection((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (!next[item.id]) continue;
        const patched: RowSelection = { ...next[item.id], [column]: false };
        if (column === "contextSlot") patched.mutable = false;
        next[item.id] = patched;
      }
      return next;
    });
  };

  const setAllMutable = (value: boolean) => {
    setSelection((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (!next[item.id]?.contextSlot || boundSlotItemIds.has(item.id)) continue;
        next[item.id] = { ...next[item.id], mutable: value };
      }
      return next;
    });
  };

  const selectedVariableCount = items.filter(
    (i) => selection[i.id]?.variable && !boundVariableItemIds.has(i.id),
  ).length;
  const selectedSlotCount = items.filter(
    (i) => selection[i.id]?.contextSlot && !boundSlotItemIds.has(i.id),
  ).length;
  // Every currently-selected (unbound) context slot is eligible for "mutable".
  const mutableEligibleCount = selectedSlotCount;
  const selectedMutableCount = items.filter(
    (i) =>
      selection[i.id]?.contextSlot &&
      selection[i.id]?.mutable &&
      !boundSlotItemIds.has(i.id),
  ).length;
  const canSubmit = selectedVariableCount + selectedSlotCount > 0;

  const handleSubmit = () => {
    const existingVarNames = new Set(variables.map((v) => v.name));
    const existingSlotKeys = new Set(slots.map((s) => s.key));

    const newVariables: VariableDefinition[] = [];
    const newSlots: ContextSlot[] = [];

    for (const item of items) {
      const row = selection[item.id];
      if (row?.variable && !boundVariableItemIds.has(item.id)) {
        const name = uniquifyKey(suggestKeyFromContextItem(item), existingVarNames);
        existingVarNames.add(name);
        newVariables.push(buildVariableFromItem(item, { name }));
      }
      if (row?.contextSlot && !boundSlotItemIds.has(item.id)) {
        const key = uniquifyKey(suggestKeyFromContextItem(item), existingSlotKeys);
        existingSlotKeys.add(key);
        newSlots.push(buildContextSlotFromItem(item, { key, mutable: row.mutable }));
      }
    }

    if (newVariables.length === 0 && newSlots.length === 0) return;

    if (newVariables.length > 0) {
      dispatch(
        setAgentVariableDefinitions({
          id: agentId,
          variableDefinitions: [...variables, ...newVariables],
        }),
      );
    }
    if (newSlots.length > 0) {
      dispatch(
        setAgentContextSlots({
          id: agentId,
          contextSlots: [...slots, ...newSlots],
        }),
      );
    }

    const parts = [
      newVariables.length > 0
        ? `${newVariables.length} variable${newVariables.length === 1 ? "" : "s"}`
        : null,
      newSlots.length > 0
        ? `${newSlots.length} context slot${newSlots.length === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);
    toast.success(`Added ${parts.join(" and ")}.`);

    setSelection({});
    onDone?.();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid grid-cols-2 gap-3 p-4 pb-3 shrink-0 border-b border-border">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Organization</Label>
          <Select
            value={orgId}
            onValueChange={(v) => {
              setOrgIdChoice(v);
              setScopeTypeId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose an organization…" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                  {o.is_personal ? " (personal)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Scope type</Label>
          <Select value={scopeTypeId} onValueChange={setScopeTypeId} disabled={!orgId}>
            <SelectTrigger>
              <SelectValue
                placeholder={!orgId ? "Pick an organization first" : "Choose a scope type…"}
              />
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
      </div>

      {!scopeTypeId ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground text-center">
          Pick an organization and scope type to see its context items.
        </div>
      ) : !itemsLoaded ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Loading context items…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground text-center">
          This scope type has no context items yet.
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Context item</TableHead>
                <TableHead className="w-[140px]">
                  <div className="flex items-center justify-between gap-2">
                    <span>Variable</span>
                    <ColumnAllToggle
                      total={items.length}
                      selectedCount={selectedVariableCount}
                      boundCount={boundVariableItemIds.size}
                      onAddAll={() => addAll("variable")}
                      onClearAll={() => clearAll("variable")}
                    />
                  </div>
                </TableHead>
                <TableHead className="w-[140px]">
                  <div className="flex items-center justify-between gap-2">
                    <span>Context slot</span>
                    <ColumnAllToggle
                      total={items.length}
                      selectedCount={selectedSlotCount}
                      boundCount={boundSlotItemIds.size}
                      onAddAll={() => addAll("contextSlot")}
                      onClearAll={() => clearAll("contextSlot")}
                    />
                  </div>
                </TableHead>
                <TableHead className="w-[110px]">
                  <div className="flex items-center justify-between gap-2">
                    <span title="Allow the model to rewrite this slot via ctx_patch. Defaults off, same as adding a slot by hand.">
                      Mutable
                    </span>
                    {mutableEligibleCount > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setAllMutable(selectedMutableCount !== mutableEligibleCount)
                        }
                      >
                        {selectedMutableCount === mutableEligibleCount ? "Clear" : "Add all"}
                      </Button>
                    )}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const row = selection[item.id] ?? EMPTY_SELECTION;
                const variableBound = boundVariableItemIds.has(item.id);
                const slotBound = boundSlotItemIds.has(item.id);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {item.display_name}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          {item.key}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RowCheckbox
                        checked={variableBound || row.variable}
                        disabled={variableBound}
                        badge={variableBound ? "Added" : undefined}
                        onCheckedChange={() => toggle(item.id, "variable")}
                      />
                    </TableCell>
                    <TableCell>
                      <RowCheckbox
                        checked={slotBound || row.contextSlot}
                        disabled={slotBound}
                        badge={slotBound ? "Added" : undefined}
                        onCheckedChange={() => toggle(item.id, "contextSlot")}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.mutable}
                        disabled={slotBound || !row.contextSlot}
                        onCheckedChange={() => toggle(item.id, "mutable")}
                        title={
                          !row.contextSlot
                            ? "Select Context slot first"
                            : "Allow the model to rewrite this slot via ctx_patch"
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      <div className="flex items-center justify-between gap-3 p-3 border-t border-border shrink-0 bg-background/95">
        <p className="text-xs text-muted-foreground">
          {canSubmit
            ? `${selectedVariableCount} variable${selectedVariableCount === 1 ? "" : "s"}, ${selectedSlotCount} context slot${selectedSlotCount === 1 ? "" : "s"}${
                selectedMutableCount > 0 ? ` (${selectedMutableCount} mutable)` : ""
              } selected`
            : "Select at least one item to add."}
        </p>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          Add selected
        </Button>
      </div>
    </div>
  );
}

function ColumnAllToggle({
  total,
  selectedCount,
  boundCount,
  onAddAll,
  onClearAll,
}: {
  total: number;
  selectedCount: number;
  boundCount: number;
  onAddAll: () => void;
  onClearAll: () => void;
}) {
  const allAddable = total - boundCount;
  if (allAddable <= 0) return null;
  const allSelected = selectedCount === allAddable;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
      onClick={allSelected ? onClearAll : onAddAll}
    >
      {allSelected ? "Clear" : "Add all"}
    </Button>
  );
}

function RowCheckbox({
  checked,
  disabled,
  badge,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  badge?: string;
  onCheckedChange: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      {badge && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
          {badge}
        </Badge>
      )}
    </div>
  );
}
