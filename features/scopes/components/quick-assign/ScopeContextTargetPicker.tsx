"use client";

/**
 * ScopeContextTargetPicker — the ONE cascading control for choosing WHERE a
 * blob of free text should be written as a context item's value:
 * organization -> scope type -> scope (a specific instance, e.g. "Doe, John
 * v. CSV Pharmacy") -> context item.
 *
 * This is one level deeper than `features/scope-system/components/
 * ContextItemPicker.tsx`, which stops at the item *definition* (org -> scope
 * type -> item) for binding agent variables. Writing an actual cell value
 * needs the specific scope instance too, so this picker adds that missing
 * level rather than duplicating the org/type/item cascade.
 *
 * Only items whose `value_type` is text-shaped (string/object/array/document)
 * are selectable — "append to the bottom" / "overwrite" has no sensible
 * meaning for a reference, boolean, number, or date cell. Those items still
 * render (so the user isn't confused about where they went) but disabled.
 */

import { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  selectOrganizationsList,
  makeSelectScopeTypesForOrg,
  makeSelectScopesForType,
} from "@/features/scopes/redux/selectors/tree";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
  type ContextItem,
  type ContextValueType,
} from "@/features/scope-system/redux/contextItemsSlice";

/** Append/overwrite only makes sense for a cell that IS text. */
const TEXT_COMPATIBLE_VALUE_TYPES: ReadonlySet<ContextValueType> = new Set([
  "string",
  "object",
  "array",
  "document",
]);

export function isTextCompatibleContextItem(item: ContextItem): boolean {
  return TEXT_COMPATIBLE_VALUE_TYPES.has(item.value_type);
}

export interface ScopeContextTarget {
  orgId: string;
  scopeTypeId: string;
  scopeId: string;
  contextItemId: string;
  /** The full picked item — present only when `contextItemId` changed in this emit. */
  item?: ContextItem;
}

interface ScopeContextTargetPickerProps {
  value: Partial<ScopeContextTarget>;
  onChange: (next: ScopeContextTarget) => void;
  disabled?: boolean;
}

export function ScopeContextTargetPicker({
  value,
  onChange,
  disabled,
}: ScopeContextTargetPickerProps) {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);

  const orgId = value.orgId || activeOrgId || "";
  const scopeTypeId = value.scopeTypeId || "";
  const scopeId = value.scopeId || "";

  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);

  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypes = useAppSelector((s) =>
    selectScopeTypesForOrg(s, orgId || null),
  );

  const selectScopesForType = useMemo(() => makeSelectScopesForType(), []);
  const scopes = useAppSelector((s) =>
    selectScopesForType(s, scopeTypeId || null),
  );

  const itemsLoaded = useAppSelector((s) =>
    scopeTypeId ? selectItemsLoadedForType(s, scopeTypeId) : false,
  );
  const items = useAppSelector((s) =>
    scopeTypeId ? selectItemsByType(s, scopeTypeId) : [],
  );

  useEffect(() => {
    if (scopeTypeId && !itemsLoaded) dispatch(listScopeTypeItems(scopeTypeId));
  }, [scopeTypeId, itemsLoaded, dispatch]);

  const emit = (next: Partial<ScopeContextTarget>) =>
    onChange({
      orgId: next.orgId ?? orgId,
      scopeTypeId: next.scopeTypeId ?? scopeTypeId,
      scopeId: next.scopeId ?? scopeId,
      contextItemId: next.contextItemId ?? value.contextItemId ?? "",
      item: next.item,
    });

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Organization</Label>
        <Select
          value={orgId}
          onValueChange={(v) =>
            emit({ orgId: v, scopeTypeId: "", scopeId: "", contextItemId: "" })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-xs">
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
        <Label className="text-xs">Scope type</Label>
        <Select
          value={scopeTypeId}
          onValueChange={(v) =>
            emit({ scopeTypeId: v, scopeId: "", contextItemId: "" })
          }
          disabled={disabled || !orgId}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={
                !orgId ? "Pick an organization first" : "Choose a type…"
              }
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
        <Label className="text-xs">
          {scopeTypes.find((t) => t.id === scopeTypeId)?.label_singular ??
            "Scope"}
        </Label>
        <Select
          value={scopeId}
          onValueChange={(v) => emit({ scopeId: v, contextItemId: "" })}
          disabled={disabled || !scopeTypeId}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={
                !scopeTypeId
                  ? "Pick a scope type first"
                  : scopes.length === 0
                    ? "No scopes of this type"
                    : "Choose a scope…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {scopes.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Context item</Label>
        <Select
          value={value.contextItemId || ""}
          onValueChange={(itemId) => {
            const item = items.find((i) => i.id === itemId);
            if (item) emit({ contextItemId: item.id, item });
          }}
          disabled={disabled || !scopeId}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={
                !scopeId
                  ? "Pick a scope first"
                  : items.length === 0
                    ? itemsLoaded
                      ? "No items on this scope type"
                      : "Loading…"
                    : "Choose a context item…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => {
              const compatible = isTextCompatibleContextItem(i);
              return (
                <SelectItem key={i.id} value={i.id} disabled={!compatible}>
                  <span>{i.display_name}</span>
                  {!compatible && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      ({i.value_type} — text only, for now)
                    </span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default ScopeContextTargetPicker;
