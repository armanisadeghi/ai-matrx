"use client";

/**
 * ContextItemPicker — the ONE reusable control for choosing a scope context item:
 * organization → scope type → context item. Loads its own data and does NOT assume the
 * user has an active scope/org set (an agent author may have none). Used by both the
 * variable-binding editor and the context-slot-binding editor so they never drift.
 */

import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export interface ContextItemSelection {
  orgId: string;
  scopeTypeId: string;
  contextItemId: string;
  itemKey: string;
}

interface ContextItemPickerProps {
  value: { orgId?: string; scopeTypeId?: string; contextItemId?: string };
  onChange: (sel: ContextItemSelection) => void;
  readonly?: boolean;
}

export function ContextItemPicker({
  value,
  onChange,
  readonly,
}: ContextItemPickerProps) {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);

  // Default the displayed org to the value, else the active org (never assumed/required).
  const orgId = value.orgId || activeOrgId || "";
  const scopeTypeId = value.scopeTypeId || "";

  const typesLoaded = useAppSelector((s) =>
    orgId ? selectScopeTypesLoadedForOrg(s, orgId) : false,
  );
  const scopeTypes = useAppSelector((s) =>
    orgId ? selectScopeTypesByOrg(s, orgId) : [],
  );
  const itemsLoaded = useAppSelector((s) =>
    scopeTypeId ? selectItemsLoadedForType(s, scopeTypeId) : false,
  );
  const items = useAppSelector((s) =>
    scopeTypeId ? selectItemsByType(s, scopeTypeId) : [],
  );

  useEffect(() => {
    if (orgId && !typesLoaded) dispatch(fetchScopeTypes(orgId));
  }, [orgId, typesLoaded, dispatch]);

  useEffect(() => {
    if (scopeTypeId && !itemsLoaded) dispatch(listScopeTypeItems(scopeTypeId));
  }, [scopeTypeId, itemsLoaded, dispatch]);

  const emit = (next: Partial<ContextItemSelection>) =>
    onChange({
      orgId: next.orgId ?? orgId,
      scopeTypeId: next.scopeTypeId ?? scopeTypeId,
      contextItemId: next.contextItemId ?? value.contextItemId ?? "",
      itemKey: next.itemKey ?? "",
    });

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Organization</Label>
        <Select
          value={orgId}
          onValueChange={(v) =>
            emit({ orgId: v, scopeTypeId: "", contextItemId: "", itemKey: "" })
          }
          disabled={readonly}
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
        <Select
          value={scopeTypeId}
          onValueChange={(v) =>
            emit({ scopeTypeId: v, contextItemId: "", itemKey: "" })
          }
          disabled={readonly || !orgId}
        >
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

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Context item</Label>
        <Select
          value={value.contextItemId || ""}
          onValueChange={(itemId) => {
            const item = items.find((i) => i.id === itemId);
            if (item) emit({ contextItemId: item.id, itemKey: item.key });
          }}
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
    </div>
  );
}
