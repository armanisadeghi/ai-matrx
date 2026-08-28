"use client";

/**
 * ContextItemPicker — the ONE reusable control for choosing a context item to
 * bind an agent variable or context policy to. Loads its own data and does NOT
 * assume the user has an active scope/org set (an agent author may have none).
 * Used by the variable-binding editor, the context-policy-binding editor, and
 * the batch binder, so they never drift.
 *
 * TWO SOURCES, because Context has two BINDABLE sources of supply:
 *
 *  - **System** — platform truths that resolve for every user with no scope
 *    selection (ambient date/time/user, curated globals, industry datasets).
 *    Flat list; no org, no scope type. Binding carries `scope_type_id: null`.
 *  - **Scope** — what the org is working on: organization → scope type → item.
 *
 * (The third source, Surface, is not bindable here — a surface supplies its
 * values per request, so an agent consumes them through a Context Policy key,
 * not through an item binding.)
 *
 * Both kinds resolve identically at run time: `resolve_full_context` emits both
 * into `cell_values` keyed by `context_item_id`, and a binding always stores
 * that id — which is why System items need no new binding machinery.
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
  listSystemContextItems,
  selectItemsByType,
  selectItemsLoadedForType,
  SYSTEM_ITEMS_KEY,
  type ContextItem,
} from "@/features/scope-system/redux/contextItemsSlice";

export type ContextItemSource = "system" | "scope";

export interface ContextItemSelection {
  source: ContextItemSource;
  /** Empty for System items. */
  orgId: string;
  /** Empty for System items — a System item has no scope type. */
  scopeTypeId: string;
  contextItemId: string;
  itemKey: string;
  /** The full picked item — present only when `contextItemId` changed in this emit. */
  item?: ContextItem;
}

interface ContextItemPickerProps {
  value: {
    source?: ContextItemSource;
    orgId?: string;
    scopeTypeId?: string;
    contextItemId?: string;
  };
  onChange: (sel: ContextItemSelection) => void;
  readonly?: boolean;
}

const CLASS_LABEL: Record<string, string> = {
  ambient: "Ambient",
  curated: "Curated",
  dataset: "Dataset",
};

export function ContextItemPicker({
  value,
  onChange,
  readonly,
}: ContextItemPickerProps) {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);

  // A stored binding with a scope type is a Scope binding; otherwise System is
  // the default offer (it always has something to pick, for every user).
  const source: ContextItemSource =
    value.source ?? (value.scopeTypeId ? "scope" : "system");
  const isSystem = source === "system";

  // Default the displayed org to the value, else the active org (never assumed/required).
  const orgId = value.orgId || activeOrgId || "";
  const scopeTypeId = value.scopeTypeId || "";
  // System items are cached under a sentinel so the same selectors serve both.
  const itemsKey = isSystem ? SYSTEM_ITEMS_KEY : scopeTypeId;

  const typesLoaded = useAppSelector((s) =>
    orgId ? selectScopeTypesLoadedForOrg(s, orgId) : false,
  );
  const scopeTypes = useAppSelector((s) =>
    orgId ? selectScopeTypesByOrg(s, orgId) : [],
  );
  const itemsLoaded = useAppSelector((s) =>
    itemsKey ? selectItemsLoadedForType(s, itemsKey) : false,
  );
  const items = useAppSelector((s) =>
    itemsKey ? selectItemsByType(s, itemsKey) : [],
  );

  useEffect(() => {
    if (!isSystem && orgId && !typesLoaded) dispatch(fetchScopeTypes(orgId));
  }, [isSystem, orgId, typesLoaded, dispatch]);

  useEffect(() => {
    if (isSystem) {
      if (!itemsLoaded) dispatch(listSystemContextItems());
    } else if (scopeTypeId && !itemsLoaded) {
      dispatch(listScopeTypeItems(scopeTypeId));
    }
  }, [isSystem, scopeTypeId, itemsLoaded, dispatch]);

  const emit = (next: Partial<ContextItemSelection>) => {
    const nextSource = next.source ?? source;
    const systemNext = nextSource === "system";
    onChange({
      source: nextSource,
      orgId: systemNext ? "" : (next.orgId ?? orgId),
      scopeTypeId: systemNext ? "" : (next.scopeTypeId ?? scopeTypeId),
      contextItemId: next.contextItemId ?? value.contextItemId ?? "",
      itemKey: next.itemKey ?? "",
      item: next.item,
    });
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Source</Label>
        <Select
          value={source}
          onValueChange={(v) =>
            emit({
              source: v as ContextItemSource,
              scopeTypeId: "",
              contextItemId: "",
              itemKey: "",
            })
          }
          disabled={readonly}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">
              <span>System</span>
              <span className="ml-2 text-xs text-muted-foreground">
                platform truths — every user, no scope needed
              </span>
            </SelectItem>
            <SelectItem value="scope">
              <span>Scope</span>
              <span className="ml-2 text-xs text-muted-foreground">
                what this organization is working on
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isSystem && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Organization
            </Label>
            <Select
              value={orgId}
              onValueChange={(v) =>
                emit({
                  orgId: v,
                  scopeTypeId: "",
                  contextItemId: "",
                  itemKey: "",
                })
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
                  placeholder={
                    !orgId ? "Pick an organization first" : "Choose a scope type…"
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
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {isSystem ? "System context item" : "Context item"}
        </Label>
        <Select
          value={value.contextItemId || ""}
          onValueChange={(itemId) => {
            const item = items.find((i) => i.id === itemId);
            if (item)
              emit({ contextItemId: item.id, itemKey: item.key, item });
          }}
          disabled={readonly || (!isSystem && !scopeTypeId)}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !isSystem && !scopeTypeId
                  ? "Pick a scope type first"
                  : items.length === 0
                    ? itemsLoaded
                      ? isSystem
                        ? "No system context items"
                        : "No items on this scope type"
                      : "Loading…"
                    : "Choose a context item…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                <span>{i.display_name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {i.key}
                </span>
                {i.system_item_class && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {CLASS_LABEL[i.system_item_class] ?? i.system_item_class}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSystem && (
          <p className="text-[11px] text-muted-foreground">
            Resolves for every user with no scope selection. Ambient items are
            recomputed on every request.
          </p>
        )}
      </div>
    </div>
  );
}
