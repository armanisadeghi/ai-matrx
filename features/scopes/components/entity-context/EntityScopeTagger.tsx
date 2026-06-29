// features/scopes/components/entity-context/EntityScopeTagger.tsx
//
// Surface B — M2M scope tagging. The opposite-half of Surface A. THE ONLY
// way for non-Surface-A components to attach scopes to an entity. NEVER
// writes appContextSlice — that invariant is the load-bearing rule of the
// scope system (see features/scopes/FEATURE.md §"Global vs Local context").
//
// Two operating modes (discriminated by props):
//
// 1. **Uncontrolled** — caller passes `entityType` + `entityId`. The
//    component fetches the entity's current scope assignments via
//    `useEntityScopes`, renders the picker, and persists changes through
//    `setEntityScopes`. The component owns the full read/write cycle.
//
// 2. **Controlled** — caller passes `value` + `onChange`. No assignments
//    are persisted; the caller wires the result to their own slice (used
//    by `TaskScopeFilter`, which writes to `taskUiSlice` rather than
//    `ctx_scope_assignments`).

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Filter as FilterIcon,
  X,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  makeSelectScopeTypesForOrg,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import type {
  EntityType,
  ScopeTypeNode,
} from "@/features/scopes/types";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/cn";
import {
  getEntry,
  moduleKey,
} from "@/features/organizations/resource-catalogue";
import { getOrgModuleSetting } from "@/features/organizations/orgModuleSettings";

type CommonProps = {
  className?: string;
  /** Display variant. `sidebar` = collapsible sections; `compact` = flat chip row;
   * `dropdown` = one single-select dropdown per scope type (best for forms / when a
   * type has many scopes — pick at most one per type). */
  variant?: "sidebar" | "compact" | "dropdown";
  /** Optional org override — defaults to the active org. Useful for cross-org views. */
  organizationId?: string | null;
  /** Limit visible scope types (by scope_type_id). Empty/undefined = all. */
  scopeTypeAllowlist?: string[];
  /** Show "Clear" / "Match all" / header. Default true. */
  showHeader?: boolean;
  /** Header label override. */
  title?: string;
  /** Multi-select per scope type (filter mode). Default false (one per type). */
  allowMultiPerType?: boolean;
};

type UncontrolledProps = CommonProps & {
  /** Entity being tagged. */
  entityType: EntityType;
  entityId: string;
  /** Optional callback invoked after a successful save. */
  onAfterSave?: (scopeIds: string[]) => void;
  value?: never;
  onChange?: never;
};

type ControlledProps = CommonProps & {
  /** Selected scope IDs. */
  value: string[];
  /** Receives the full next array. */
  onChange: (next: string[]) => void;
  entityType?: never;
  entityId?: never;
  onAfterSave?: never;
};

export type EntityScopeTaggerProps = UncontrolledProps | ControlledProps;

export function EntityScopeTagger(props: EntityScopeTaggerProps) {
  const {
    className,
    variant = "sidebar",
    organizationId: orgIdProp,
    scopeTypeAllowlist,
    showHeader = true,
    title = "Scopes",
    allowMultiPerType = false,
  } = props;

  useScopeTree(); // ensures the tree slice is populated (no-op if already)
  const treeStatus = useAppSelector(selectTreeStatus);
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgId = orgIdProp ?? activeOrgId;

  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypesAll = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));

  const scopeTypes = useMemo(() => {
    if (!scopeTypeAllowlist || scopeTypeAllowlist.length === 0) {
      return scopeTypesAll;
    }
    const allow = new Set(scopeTypeAllowlist);
    return scopeTypesAll.filter((t) => allow.has(t.id));
  }, [scopeTypesAll, scopeTypeAllowlist]);

  // ─── Backing store (uncontrolled = useEntityScopes; controlled = props) ─
  const isControlled = "value" in props && props.value !== undefined;

  const uncontrolledHook = useEntityScopes({
    entityType: (props as UncontrolledProps).entityType ?? "note",
    entityId: isControlled ? null : (props as UncontrolledProps).entityId,
    organizationId: orgId,
    autoFetch: !isControlled,
  });

  // Optimistic overlay: while a write is in flight the UI reflects the user's
  // latest intent immediately (`optimistic`), not the persisted Redux value —
  // otherwise the control snaps back to its old value for the entire RPC
  // round-trip and looks like nothing saved. `null` = trust Redux.
  const [optimistic, setOptimistic] = useState<string[] | null>(null);

  const selected = isControlled
    ? props.value!
    : (optimistic ?? uncontrolledHook.scopeIds);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // ─── Per-org is_scopeable gate ─────────────────────────────────────────
  // When an org admin turns OFF "Scopeable" for this kind (org_module_settings),
  // block tagging it. Only applies to the uncontrolled (write) mode — controlled
  // mode is a filter, never a write. Defaults to allowed (no settings row, or a
  // kind not in the catalogue, e.g. agent_surface_binding).
  const uncontrolledEntityType = isControlled
    ? null
    : ((props as UncontrolledProps).entityType ?? null);
  // Derived default (allowed) + async-fetched per-(org, kind) results keyed
  // so the effect only ever calls setState from the subscription callback —
  // never synchronously (react-hooks/set-state-in-effect).
  const gateKey =
    !isControlled &&
    orgId &&
    uncontrolledEntityType &&
    getEntry(uncontrolledEntityType)
      ? `${orgId}:${uncontrolledEntityType}`
      : null;
  const [scopeableByKey, setScopeableByKey] = useState<Record<string, boolean>>(
    {},
  );
  useEffect(() => {
    if (!gateKey || !orgId || !uncontrolledEntityType) return undefined;
    const entry = getEntry(uncontrolledEntityType);
    if (!entry) return undefined;
    let cancelled = false;
    (async () => {
      const setting = await getOrgModuleSetting(orgId, moduleKey(entry));
      if (!cancelled) {
        setScopeableByKey((prev) => ({
          ...prev,
          [gateKey]: setting.isScopeable,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gateKey, orgId, uncontrolledEntityType]);
  const scopeableAllowed = gateKey ? (scopeableByKey[gateKey] ?? true) : true;

  // ─── Toggle handler with the cardinality rule ──────────────────────────
  // The write is an atomic replace of the FULL selection, so two concurrent
  // writes computed from stale baselines would clobber each other. The old
  // fix DROPPED every click made while a write was in flight — which silently
  // lost the user's later selections (the #1 "it doesn't save" complaint when
  // tagging several types in quick succession). Instead we now SERIALIZE
  // writes and coalesce the latest intent: clicks while saving are queued
  // (never dropped), and each write persists the most recent full selection,
  // so there is no stale-baseline clobber. The UI updates optimistically.
  const writingRef = useRef(false);
  const queuedRef = useRef<string[] | null>(null);

  const runWrite = async (initial: string[]) => {
    const uProps = props as UncontrolledProps;
    writingRef.current = true;
    let next = initial;
    for (;;) {
      const res = await uncontrolledHook.setScopes(next);
      if (!res.ok) {
        // Drop the queue and revert to persisted truth — loudly.
        queuedRef.current = null;
        writingRef.current = false;
        setOptimistic(null);
        toast.error(res.error || "Could not update scopes");
        return;
      }
      if (uProps.onAfterSave) uProps.onAfterSave(next);
      if (queuedRef.current !== null) {
        next = queuedRef.current;
        queuedRef.current = null;
        continue; // a newer selection arrived mid-write — persist it too
      }
      break;
    }
    writingRef.current = false;
    setOptimistic(null); // Redux cache is now authoritative and matches
  };

  const applyNext = (next: string[]) => {
    if (isControlled) {
      (props as ControlledProps).onChange(next);
      return;
    }
    if (!scopeableAllowed) return; // gated off for this kind in this org
    setOptimistic(next); // reflect the user's choice immediately
    if (writingRef.current) {
      queuedRef.current = next; // coalesce — never drop the latest intent
      return;
    }
    void runWrite(next);
  };

  const handleToggle = (scopeId: string, scopeTypeId: string) => {
    const isSelected = selectedSet.has(scopeId);
    if (isSelected) {
      applyNext(selected.filter((sid) => sid !== scopeId));
      return;
    }
    if (allowMultiPerType) {
      applyNext([...selected, scopeId]);
      return;
    }
    const typeIds = new Set(
      scopeTypesAll
        .find((t) => t.id === scopeTypeId)
        ?.scopes.map((s) => s.id) ?? [],
    );
    applyNext([...selected.filter((sid) => !typeIds.has(sid)), scopeId]);
  };

  // Single-select per type (dropdown variant): replace whatever scope of this
  // type is selected with the chosen one ("none" clears the type).
  const setTypeScope = (scopeTypeId: string, scopeId: string) => {
    const typeIds = new Set(
      scopeTypesAll
        .find((t) => t.id === scopeTypeId)
        ?.scopes.map((s) => s.id) ?? [],
    );
    const withoutType = selected.filter((sid) => !typeIds.has(sid));
    applyNext(scopeId === "none" ? withoutType : [...withoutType, scopeId]);
  };

  const handleClearAll = () => applyNext([]);

  // ─── Collapsible sections (sidebar variant) ────────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapsed = (typeId: string) =>
    setCollapsed((prev) => ({ ...prev, [typeId]: !prev[typeId] }));

  if (!orgId) {
    return (
      <div className={cn("text-xs text-muted-foreground px-3 py-2", className)}>
        Select an organization to tag scopes.
      </div>
    );
  }

  if (treeStatus === "loading" && scopeTypes.length === 0) {
    return (
      <div className={cn("space-y-1 px-3 py-2", className)}>
        {[1, 2].map((i) => (
          <div key={i} className="h-4 w-24 rounded bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (scopeTypes.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground px-3 py-2", className)}>
        No scopes defined for this organization.
      </div>
    );
  }

  if (!isControlled && !scopeableAllowed) {
    const label =
      (uncontrolledEntityType &&
        getEntry(uncontrolledEntityType)?.labelPlural) ??
      "items of this kind";
    return (
      <div className={cn("text-xs text-muted-foreground px-3 py-2", className)}>
        Scope tagging is turned off for {label.toLowerCase()} in this
        organization.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showHeader && (
        <div className="flex items-center justify-between px-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <FilterIcon size={12} />
            <span>{title}</span>
          </h2>
          {selected.length > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleClearAll}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {variant === "dropdown" ? (
        <div className="space-y-3 px-3">
          {scopeTypes.map((type) => {
            const current = type.scopes.find((s) => selectedSet.has(s.id));
            return (
              <div key={type.id} className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <DynamicIcon
                    name={type.icon}
                    color={type.color}
                    className="h-3.5 w-3.5"
                  />
                  {type.label_singular}
                </Label>
                <Select
                  value={current?.id ?? "none"}
                  onValueChange={(v) => setTypeScope(type.id, v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={`Select ${type.label_singular.toLowerCase()}…`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {type.scopes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      ) : variant === "compact" ? (
        <div className="flex flex-wrap gap-1 px-3">
          {scopeTypes.flatMap((type) =>
            type.scopes.map((scope) => (
              <ScopeChip
                key={scope.id}
                type={type}
                scope={scope}
                isSelected={selectedSet.has(scope.id)}
                onClick={() => handleToggle(scope.id, type.id)}
              />
            )),
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {scopeTypes.map((type) => {
            const isCollapsed = collapsed[type.id] ?? false;
            const selectedCount = type.scopes.reduce(
              (n, s) => (selectedSet.has(s.id) ? n + 1 : n),
              0,
            );
            return (
              <div key={type.id}>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(type.id)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent rounded-md"
                >
                  <span className="flex items-center gap-1.5">
                    {isCollapsed ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    <DynamicIcon
                      name={type.icon}
                      color={type.color}
                      className="h-3.5 w-3.5"
                    />
                    <span>{type.label_plural}</span>
                  </span>
                  {selectedCount > 0 && (
                    <Badge
                      variant="outline"
                      className="h-4 text-[10px] px-1.5"
                      style={{ borderColor: type.color, color: type.color }}
                    >
                      {selectedCount}
                    </Badge>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="pl-6 pr-3 flex flex-wrap gap-1 py-1">
                    {type.scopes.length === 0 && (
                      <span className="text-[11px] text-muted-foreground py-0.5">
                        No scopes
                      </span>
                    )}
                    {type.scopes.map((scope) => (
                      <ScopeChip
                        key={scope.id}
                        type={type}
                        scope={scope}
                        isSelected={selectedSet.has(scope.id)}
                        onClick={() => handleToggle(scope.id, type.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScopeChip({
  type,
  scope,
  isSelected,
  onClick,
}: {
  type: ScopeTypeNode;
  scope: ScopeTypeNode["scopes"][number];
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <Badge
      variant={isSelected ? "default" : "outline"}
      className={cn(
        "cursor-pointer text-[11px] px-1.5 py-0.5",
        !isSelected && "hover:bg-accent",
      )}
      style={
        isSelected
          ? { backgroundColor: type.color, borderColor: type.color }
          : { color: type.color, borderColor: type.color }
      }
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        <span>{scope.name}</span>
        {isSelected && <X className="h-2.5 w-2.5" />}
      </span>
    </Badge>
  );
}

export default EntityScopeTagger;
