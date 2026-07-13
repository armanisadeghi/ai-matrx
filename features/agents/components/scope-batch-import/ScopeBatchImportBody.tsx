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
import { AgentEditAccessToggle } from "@/features/agents/components/context-slots-management/AgentEditAccessControl";
import {
  applyAgentEditAccess,
  decodeAgentEditAccess,
  type AgentEditAccess,
} from "@/features/agents/utils/agent-edit-access";

interface ScopeBatchImportBodyProps {
  agentId: string;
  /** Called after a successful batch add — the caller typically closes the window. */
  onDone?: () => void;
}

interface RowSelection {
  variable: boolean;
  contextSlot: boolean;
}

const EMPTY_SELECTION: RowSelection = {
  variable: false,
  contextSlot: false,
};

/**
 * Scope-bound slots have no writeback handler on the server (aidream registers
 * `note` / `studio_document` / `working_document` / `canvas_item` — never
 * `ctx_item`), so an agent-editable scope slot is conversation-only: the agent
 * can rewrite it while it works, and the edit is dropped at the end of the turn.
 */
const AGENT_EDITABLE_SAVE_MODE = "never" as const;

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
  // Context item → the index of the slot already bound to it. Those rows stay
  // checked + disabled in the "Context slot" column (a re-run can never
  // double-add) but their agent access REMAINS EDITABLE here — that's the whole
  // point of reopening the tool, and disabling it was the bug this replaced.
  const boundSlotIndexByItemId = useMemo(() => {
    const map = new Map<string, number>();
    slots.forEach((slot, index) => {
      const id = slot.source?.kind === "ctx_item" ? slot.source.id : undefined;
      if (id && !map.has(id)) map.set(id, index);
    });
    return map;
  }, [slots]);

  const [selection, setSelection] = useState<Record<string, RowSelection>>({});
  // Access picks live apart from the add/skip picks: a row can be already-added
  // (no selection) and still have its access changed.
  const [accessEdits, setAccessEdits] = useState<Record<string, AgentEditAccess>>({});
  // A different scope type means a different item set — start the picks over.
  // Render-time reset (not an effect) per the React "adjusting state when a
  // prop changes" pattern — avoids the extra cascading-render commit.
  const [selectionScopeTypeId, setSelectionScopeTypeId] = useState(scopeTypeId);
  if (scopeTypeId !== selectionScopeTypeId) {
    setSelectionScopeTypeId(scopeTypeId);
    setSelection({});
    setAccessEdits({});
  }

  /** The access a row shows: the user's pick, else the stored slot's, else read-only. */
  const accessForItem = (itemId: string): AgentEditAccess => {
    const edited = accessEdits[itemId];
    if (edited) return edited;
    const boundIndex = boundSlotIndexByItemId.get(itemId);
    if (boundIndex === undefined) return "read_only";
    return decodeAgentEditAccess(slots[boundIndex]).access;
  };

  /** A row can set access once it HAS a slot — either already added, or being added now. */
  const rowHasSlot = (itemId: string): boolean =>
    boundSlotIndexByItemId.has(itemId) || Boolean(selection[itemId]?.contextSlot);

  const toggle = (itemId: string, column: "variable" | "contextSlot") => {
    setSelection((prev) => {
      const current = prev[itemId] ?? EMPTY_SELECTION;
      return { ...prev, [itemId]: { ...current, [column]: !current[column] } };
    });
    // Deselecting a not-yet-added slot drops the (now meaningless) access pick.
    if (column === "contextSlot" && !boundSlotIndexByItemId.has(itemId)) {
      setAccessEdits((prev) => {
        if (selection[itemId]?.contextSlot !== true) return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  const addAll = (column: "variable" | "contextSlot") => {
    setSelection((prev) => {
      const next = { ...prev };
      for (const item of items) {
        const alreadyBound =
          column === "variable"
            ? boundVariableItemIds.has(item.id)
            : boundSlotIndexByItemId.has(item.id);
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
        next[item.id] = { ...next[item.id], [column]: false };
      }
      return next;
    });
    if (column === "contextSlot") {
      setAccessEdits((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (!boundSlotIndexByItemId.has(item.id)) delete next[item.id];
        }
        return next;
      });
    }
  };

  const setAccess = (itemId: string, access: AgentEditAccess) =>
    setAccessEdits((prev) => ({ ...prev, [itemId]: access }));

  const setAllAccess = (access: AgentEditAccess) =>
    setAccessEdits((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (rowHasSlot(item.id)) next[item.id] = access;
      }
      return next;
    });

  const selectedVariableCount = items.filter(
    (i) => selection[i.id]?.variable && !boundVariableItemIds.has(i.id),
  ).length;
  const selectedSlotCount = items.filter(
    (i) => selection[i.id]?.contextSlot && !boundSlotIndexByItemId.has(i.id),
  ).length;

  // Every row that has (or is getting) a slot can set access.
  const accessEligibleItems = items.filter((i) => rowHasSlot(i.id));
  const editableCount = accessEligibleItems.filter(
    (i) => accessForItem(i.id) === "editable",
  ).length;

  // Already-added slots whose access the user changed — these get PATCHED in place.
  const updatedSlots = items.filter((i) => {
    const boundIndex = boundSlotIndexByItemId.get(i.id);
    if (boundIndex === undefined) return false;
    const stored = decodeAgentEditAccess(slots[boundIndex]).access;
    return accessEdits[i.id] !== undefined && accessEdits[i.id] !== stored;
  });

  const canSubmit =
    selectedVariableCount + selectedSlotCount + updatedSlots.length > 0;

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
      if (row?.contextSlot && !boundSlotIndexByItemId.has(item.id)) {
        const key = uniquifyKey(suggestKeyFromContextItem(item), existingSlotKeys);
        existingSlotKeys.add(key);
        newSlots.push(
          buildContextSlotFromItem(item, {
            key,
            access: accessForItem(item.id),
            saveMode: AGENT_EDITABLE_SAVE_MODE,
          }),
        );
      }
    }

    // Patch access on slots that already exist, then append the new ones.
    const patchedSlots = slots.map((slot, index) => {
      const item = updatedSlots.find(
        (i) => boundSlotIndexByItemId.get(i.id) === index,
      );
      if (!item) return slot;
      return applyAgentEditAccess(slot, {
        access: accessForItem(item.id),
        saveMode: AGENT_EDITABLE_SAVE_MODE,
      });
    });

    if (newVariables.length === 0 && newSlots.length === 0 && updatedSlots.length === 0)
      return;

    if (newVariables.length > 0) {
      dispatch(
        setAgentVariableDefinitions({
          id: agentId,
          variableDefinitions: [...variables, ...newVariables],
        }),
      );
    }
    if (newSlots.length > 0 || updatedSlots.length > 0) {
      dispatch(
        setAgentContextSlots({
          id: agentId,
          contextSlots: [...patchedSlots, ...newSlots],
        }),
      );
    }

    const parts = [
      newVariables.length > 0
        ? `Added ${newVariables.length} variable${newVariables.length === 1 ? "" : "s"}`
        : null,
      newSlots.length > 0
        ? `${newVariables.length > 0 ? "" : "Added "}${newSlots.length} context slot${newSlots.length === 1 ? "" : "s"}`
        : null,
      updatedSlots.length > 0
        ? `updated agent access on ${updatedSlots.length} slot${updatedSlots.length === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);
    toast.success(`${parts.join(", ")}.`);

    setSelection({});
    setAccessEdits({});
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
                      boundCount={boundSlotIndexByItemId.size}
                      onAddAll={() => addAll("contextSlot")}
                      onClearAll={() => clearAll("contextSlot")}
                    />
                  </div>
                </TableHead>
                <TableHead className="w-[190px]">
                  <div className="flex items-center justify-between gap-2">
                    <span title="Whether the agent may change this value while it works, or only read it.">
                      Agent access
                    </span>
                    {accessEligibleItems.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setAllAccess(
                            editableCount === accessEligibleItems.length
                              ? "read_only"
                              : "editable",
                          )
                        }
                      >
                        {editableCount === accessEligibleItems.length
                          ? "All read-only"
                          : "All can edit"}
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
                const slotBound = boundSlotIndexByItemId.has(item.id);
                const hasSlot = rowHasSlot(item.id);
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
                      <AgentEditAccessToggle
                        value={accessForItem(item.id)}
                        onChange={(access) => setAccess(item.id, access)}
                        disabled={!hasSlot}
                        disabledReason="Add this as a context slot first, then choose whether the agent can edit it."
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
            ? [
                `${selectedVariableCount} variable${selectedVariableCount === 1 ? "" : "s"}`,
                `${selectedSlotCount} context slot${selectedSlotCount === 1 ? "" : "s"} to add`,
                updatedSlots.length > 0
                  ? `${updatedSlots.length} existing slot${updatedSlots.length === 1 ? "" : "s"} to update`
                  : null,
                editableCount > 0 ? `${editableCount} agent-editable` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Select at least one item to add, or change a slot's agent access."}
        </p>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {selectedVariableCount + selectedSlotCount === 0 && updatedSlots.length > 0
            ? "Save changes"
            : "Add selected"}
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
